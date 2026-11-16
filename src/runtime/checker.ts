import {
  LanguageError,
  bool,
  compatible,
  fileType,
  list,
  nothing,
  number,
  record,
  string,
  typeName,
} from './types';
import type { LanguageHost, NativeCommand, Signature, Type } from './types';
import type { Expr, Statement, TypeNode } from './syntax';
export type Definition = Extract<Statement, { kind: 'def' }>;
export interface Binding {
  type: Type;
  mutable: boolean;
}
export interface Symbols {
  bindings: Map<string, Binding>;
  functions: Map<string, Definition>;
  aliases: Map<string, Type>;
}
export const emptySymbols = (): Symbols => ({
  bindings: new Map(),
  functions: new Map(),
  aliases: new Map([['File', fileType]]),
});
export interface CheckedProgram {
  statements: Statement[];
  symbols: Symbols;
  types: Map<Expr, Type>;
  typeArguments: Map<Expr, Type>;
}
export class Checker {
  private symbols: Symbols;
  private types = new Map<Expr, Type>();
  private typeArguments = new Map<Expr, Type>();
  private signatures = new Map<string, Signature>();
  private natives: Map<string, NativeCommand>;
  constructor(
    commands: ReturnType<LanguageHost['commands']>,
    private mode: 'terminal' | 'script',
    previous = emptySymbols(),
  ) {
    this.symbols = {
      bindings: new Map(previous.bindings),
      functions: new Map(previous.functions),
      aliases: new Map(previous.aliases),
    };
    this.natives = new Map(commands.map((c) => [c.name, c]));
  }
  check(statements: Statement[]): CheckedProgram {
    const aliases = new Map<string, Extract<Statement, { kind: 'type' }>>();
    const names = new Set<string>();
    for (const s of statements) {
      if (s.kind === 'type') {
        if (names.has('type:' + s.name) || s.name === 'File')
          this.error(s, 'Duplicate type: ' + s.name);
        names.add('type:' + s.name);
        aliases.set(s.name, s);
      }
      if (s.kind === 'def') {
        if (names.has('def:' + s.name) || this.natives.has(s.name))
          this.error(s, 'Duplicate command: ' + s.name);
        names.add('def:' + s.name);
        this.symbols.functions.set(s.name, s);
      }
    }
    const resolving = new Set<string>();
    const resolveAlias = (name: string): Type | undefined => {
      const s = aliases.get(name);
      if (!s) return this.symbols.aliases.get(name);
      if (resolving.has(name)) this.error(s, 'Circular type alias: ' + name);
      resolving.add(name);
      const t = this.resolve(s.value, resolveAlias);
      resolving.delete(name);
      aliases.delete(name);
      this.symbols.aliases.set(name, t);
      return t;
    };
    for (const name of [...aliases.keys()]) resolveAlias(name);
    for (const [name, fn] of this.symbols.functions) {
      const parameters = fn.parameters.map((p) => this.resolve(p.type));
      if (parameters.some((t) => this.hasVoid(t)))
        this.error(fn, 'Parameters cannot have void type.');
      this.signatures.set(name, { parameters, result: this.resolve(fn.result) });
    }
    for (const [name, fn] of this.symbols.functions) {
      const scope = new Map<string, Binding>();
      fn.parameters.forEach((p, i) => {
        if (scope.has(p.name)) this.error(fn, 'Duplicate parameter: ' + p.name);
        scope.set(p.name, { type: this.signatures.get(name)!.parameters[i], mutable: false });
      });
      const result = this.signatures.get(name)!.result;
      if (this.hasVoid(result) && result.kind !== 'void')
        this.error(fn, 'Nested void type is not allowed.');
      const returns = this.block(fn.body, scope, result, 0, false);
      if (result.kind !== 'void' && !returns)
        this.error(fn, 'Function must return ' + typeName(result) + ' on every path.');
    }
    const scope = new Map(this.symbols.bindings);
    if (this.mode === 'script') scope.set('args', { type: list(string), mutable: false });
    this.block(statements, scope, undefined, 0, true);
    this.symbols.bindings = scope;
    return {
      statements,
      symbols: this.symbols,
      types: this.types,
      typeArguments: this.typeArguments,
    };
  }
  resolve(
    node: TypeNode,
    lookup = (name: string): Type | undefined => this.symbols.aliases.get(name),
  ): Type {
    if (node.name === 'list' && node.element) {
      const element = this.resolve(node.element, lookup);
      if (this.hasVoid(element)) this.error(node, 'A list cannot contain void.');
      return list(element);
    }
    if (node.fields) {
      const fields: Record<string, Type> = Object.create(null);
      for (const [k, n] of Object.entries(node.fields)) {
        fields[k] = this.resolve(n, lookup);
        if (this.hasVoid(fields[k])) this.error(n, 'A field cannot contain void.');
      }
      return record(fields);
    }
    const primitives: Record<string, Type> = { string, number, bool, void: nothing };
    const t = Object.hasOwn(primitives, node.name) ? primitives[node.name] : lookup(node.name);
    if (!t) this.error(node, 'Unknown type: ' + node.name);
    return t;
  }
  private hasVoid(t: Type): boolean {
    return (
      t.kind === 'void' ||
      (t.kind === 'list' && this.hasVoid(t.element)) ||
      (t.kind === 'record' && Object.values(t.fields).some((t) => this.hasVoid(t)))
    );
  }
  private error(node: { at: Expr['at'] }, message: string): never {
    throw new LanguageError(node.at, message);
  }
  private require(actual: Type, expected: Type, node: { at: Expr['at'] }) {
    if (!compatible(actual, expected))
      this.error(node, `Expected ${typeName(expected)}, got ${typeName(actual)}.`);
  }
  private block(
    body: Statement[],
    scope: Map<string, Binding>,
    result: Type | undefined,
    loops: number,
    top: boolean,
  ): boolean {
    let returns = false;
    const declared = new Set<string>();
    for (const s of body) {
      if (s.kind === 'binding') {
        if (declared.has(s.name) || (scope.has(s.name) && !(top && this.mode === 'terminal')))
          this.error(s, 'Duplicate or shadowed binding: ' + s.name);
        const expected = s.annotation ? this.resolve(s.annotation) : undefined;
        const t = this.expression(s.value, scope, expected);
        if (expected) this.require(t, expected, s);
        const assigned = expected ?? t;
        if (this.hasVoid(assigned)) this.error(s, 'Cannot store void.');
        if (this.hasEmpty(assigned))
          this.error(s, 'Empty list requires an element type annotation.');
        scope.set(s.name, { type: assigned, mutable: s.mutable });
        declared.add(s.name);
      } else if (s.kind === 'assign') {
        const binding = scope.get(s.name);
        if (!binding) this.error(s, 'Unknown variable: $' + s.name);
        if (!binding.mutable) this.error(s, 'Cannot assign immutable variable: $' + s.name);
        this.require(this.expression(s.value, scope, binding.type), binding.type, s);
      } else if (s.kind === 'expression') this.expression(s.value, scope);
      else if (s.kind === 'if') {
        this.require(this.expression(s.condition, scope), bool, s.condition);
        const yes = this.block(s.yes, new Map(scope), result, loops, false),
          no = this.block(s.no, new Map(scope), result, loops, false);
        returns ||= yes && no;
      } else if (s.kind === 'for') {
        const t = this.expression(s.value, scope);
        if (t.kind !== 'list' || this.hasEmpty(t)) this.error(s, 'for requires a typed list.');
        if (scope.has(s.name)) this.error(s, 'Shadowed binding: ' + s.name);
        const local = new Map(scope);
        local.set(s.name, { type: t.element, mutable: false });
        this.block(s.body, local, result, loops + 1, false);
      } else if (s.kind === 'while') {
        this.require(this.expression(s.condition, scope), bool, s.condition);
        this.block(s.body, new Map(scope), result, loops + 1, false);
      } else if (s.kind === 'break' || s.kind === 'continue') {
        if (!loops) this.error(s, s.kind + ' requires a loop.');
      } else if (s.kind === 'return') {
        if (!result && s.value) this.error(s, 'A script can only use bare return.');
        const actual = s.value ? this.expression(s.value, scope, result) : nothing;
        this.require(actual, result ?? nothing, s);
        returns = true;
      } else if (!top) this.error(s, 'Declarations and imports must be top-level.');
    }
    return returns;
  }
  private hasEmpty(t: Type): boolean {
    return (
      t.kind === 'empty' ||
      (t.kind === 'list' && this.hasEmpty(t.element)) ||
      (t.kind === 'record' && Object.values(t.fields).some((t) => this.hasEmpty(t)))
    );
  }
  private expression(e: Expr, scope: Map<string, Binding>, expected?: Type): Type {
    let t: Type;
    switch (e.kind) {
      case 'literal':
        t = typeof e.value === 'string' ? string : typeof e.value === 'number' ? number : bool;
        break;
      case 'variable': {
        const b = scope.get(e.name);
        if (!b) this.error(e, 'Unknown variable: $' + e.name);
        t = b.type;
        break;
      }
      case 'list': {
        let element = expected?.kind === 'list' ? expected.element : undefined;
        for (const item of e.items) {
          const found = this.expression(item, scope, element);
          if (element) this.require(found, element, item);
          else element = found;
        }
        t = list(element ?? { kind: 'empty' });
        break;
      }
      case 'record': {
        const fields: Record<string, Type> = Object.create(null);
        for (const [name, value] of Object.entries(e.fields)) {
          fields[name] = this.expression(
            value,
            scope,
            expected?.kind === 'record' ? expected.fields[name] : undefined,
          );
          if (this.hasVoid(fields[name])) this.error(value, 'Cannot store void in a record.');
        }
        t = record(fields);
        break;
      }
      case 'field': {
        const object = this.expression(e.value, scope);
        if (object.kind !== 'record' || !Object.hasOwn(object.fields, e.field))
          this.error(e, 'Unknown record field: ' + e.field);
        t = object.fields[e.field];
        break;
      }
      case 'index': {
        const object = this.expression(e.value, scope);
        if (object.kind !== 'list') this.error(e, 'Indexing requires a list.');
        this.require(this.expression(e.index, scope), number, e.index);
        t = object.element;
        break;
      }
      case 'unary':
        this.require(this.expression(e.value, scope), e.operator === 'not' ? bool : number, e);
        t = e.operator === 'not' ? bool : number;
        break;
      case 'binary': {
        const a = this.expression(e.left, scope),
          b = this.expression(e.right, scope, a);
        this.require(b, a, e.right);
        if (['and', 'or'].includes(e.operator)) {
          this.require(a, bool, e);
          t = bool;
        } else if (['==', '!='].includes(e.operator)) {
          if (this.hasVoid(a)) this.error(e, 'Cannot compare void.');
          t = bool;
        } else if (['<', '<=', '>', '>='].includes(e.operator)) {
          if (!['string', 'number'].includes(a.kind))
            this.error(e, 'Ordering requires strings or numbers.');
          t = bool;
        } else {
          if (a.kind !== 'number' && !(a.kind === 'string' && e.operator === '+'))
            this.error(e, 'Arithmetic requires numbers; + also joins strings.');
          t = a;
        }
        break;
      }
      case 'call':
        t = this.call(e, scope);
        break;
    }
    this.types.set(e, t);
    return t;
  }
  private call(e: Extract<Expr, { kind: 'call' }>, scope: Map<string, Binding>): Type {
    const signatures =
      this.natives.get(e.name)?.signatures ??
      (this.signatures.has(e.name) ? [this.signatures.get(e.name)!] : undefined);
    if (!signatures)
      this.error(e, 'Unknown command: ' + e.name + '. Run help for available commands.');
    const explicit = e.typeArgument ? this.resolve(e.typeArgument) : undefined;
    if (explicit && this.hasVoid(explicit)) this.error(e, 'A type argument cannot contain void.');
    const failures: string[] = [];
    const specificity = Math.max(
      0,
      ...signatures
        .filter((s) =>
          (s.prefix ?? []).every(
            (word, i) =>
              e.args[i]?.kind === 'literal' &&
              (e.args[i] as Extract<Expr, { kind: 'literal' }>).value === word,
          ),
        )
        .map((s) => s.prefix?.length ?? 0),
    );
    for (const signature of [...signatures].sort(
      (a, b) => (b.prefix?.length ?? 0) - (a.prefix?.length ?? 0),
    )) {
      const prefix = signature.prefix ?? [];
      if (prefix.length !== specificity) continue;
      if (
        !prefix.every(
          (word, i) =>
            e.args[i]?.kind === 'literal' &&
            (e.args[i] as Extract<Expr, { kind: 'literal' }>).value === word,
        )
      )
        continue;
      const args = e.args.slice(prefix.length);
      if (
        args.length < (signature.minimum ?? signature.parameters.length) ||
        (!signature.rest && args.length > signature.parameters.length)
      )
        continue;
      if (!!signature.typeParameter !== !!explicit) {
        failures.push(
          signature.typeParameter
            ? 'Explicit type argument required.'
            : 'Type arguments are unsupported.',
        );
        continue;
      }
      if (signature.terminalOnly && this.mode === 'script') {
        failures.push('Command is interactive-only: ' + e.name);
        continue;
      }
      let genericType = explicit;
      const substitute = (t: Type): Type =>
        t.kind === 'variable'
          ? (genericType ?? { kind: 'empty' })
          : t.kind === 'list'
            ? list(substitute(t.element))
            : t;
      try {
        for (let i = 0; i < args.length; i++) {
          const parameter = signature.parameters[i] ?? signature.rest!;
          const contextual = substitute(parameter);
          const found = this.expression(
            args[i],
            scope,
            this.hasEmpty(contextual) ? undefined : contextual,
          );
          if (parameter.kind === 'variable' && !genericType && !this.hasEmpty(found))
            genericType = found;
          if (
            parameter.kind === 'list' &&
            parameter.element.kind === 'variable' &&
            found.kind === 'list' &&
            !genericType &&
            !this.hasEmpty(found.element)
          )
            genericType = found.element;
          const required = substitute(parameter);
          if (!this.hasEmpty(found) || !this.hasEmpty(required))
            this.require(found, required, args[i]);
          if (this.hasVoid(found)) this.error(args[i], 'Cannot pass void as an argument.');
        }
        for (let i = 0; i < args.length; i++) {
          const required = substitute(signature.parameters[i] ?? signature.rest!);
          if (!this.hasEmpty(required))
            this.require(this.expression(args[i], scope, required), required, args[i]);
        }
        const returned = substitute(signature.result);
        if (this.hasEmpty(returned)) this.error(e, 'Cannot infer result element type.');
        if (explicit) this.typeArguments.set(e, explicit);
        return returned;
      } catch (error) {
        if (!(error instanceof LanguageError)) throw error;
        failures.push(error.message);
      }
    }
    this.error(
      e,
      [
        failures.at(-1) ?? `Invalid arguments for ${e.name}.`,
        ...(this.natives.get(e.name)?.help ?? []),
      ].join('\n'),
    );
  }
}
