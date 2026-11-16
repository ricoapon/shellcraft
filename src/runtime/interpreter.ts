import { resolvePath } from '../core/path';
import { Checker, emptySymbols } from './checker';
import type { CheckedProgram, Definition, Symbols } from './checker';
import { parse } from './syntax';
import type { Expr, Statement } from './syntax';
import { equal, LanguageError } from './types';
import type { LanguageHost, Location, Value } from './types';

interface Cell {
  value: Value;
  mutable: boolean;
}
class Scope {
  readonly values = new Map<string, Cell>();
  constructor(readonly parent?: Scope) {}
  get(name: string): Cell {
    const cell = this.values.get(name) ?? this.parent?.get(name);
    if (!cell) throw new Error('Unknown variable: $' + name);
    return cell;
  }
}
class Flow {
  constructor(
    readonly kind: 'return' | 'break' | 'continue',
    readonly value?: Value,
  ) {}
}
export interface ExecutionOptions {
  source?: string;
  mode?: 'terminal' | 'script';
  args?: string[];
  steps?: number;
  milliseconds?: number;
}
/** Interpreter state belongs to an execution, not to any mission or connection. */
export class LanguageSession {
  private symbols = emptySymbols();
  private globals = new Scope();
  private steps = 0;
  private deadline = 0;
  private depth = 0;
  private bytes = 0;
  private allocations = 0;
  private checked!: CheckedProgram;
  constructor(readonly host: LanguageHost) {}
  get declarations(): Symbols {
    return this.symbols;
  }
  private load(
    source: string,
    path: string,
    seen = new Set<string>(),
    active = new Set<string>(),
  ): Statement[] {
    if (source.length > 250_000) throw new Error('Source exceeds 250 KB.');
    this.bytes += source.length;
    if (this.bytes > 1_000_000 || active.size >= 50)
      throw new Error('Import size/depth limit exceeded.');
    const body = parse(source, path),
      result: Statement[] = [];
    for (const s of body) {
      if (s.kind !== 'use') {
        result.push(s);
        continue;
      }
      const target = resolvePath(
        s.path,
        path.startsWith('/') ? path.slice(0, path.lastIndexOf('/')) : '/home',
      );
      if (!target.startsWith('/home/'))
        throw new LanguageError(s.at, 'Imports must stay under /home.');
      if (active.has(target) || target === path)
        throw new LanguageError(s.at, 'Circular import: ' + target);
      if (seen.has(target)) continue;
      active.add(target);
      let contents: Statement[];
      try {
        contents = this.load(this.host.read(target), target, seen, active);
      } catch (error) {
        if (error instanceof LanguageError) throw error;
        throw new LanguageError(s.at, String(error));
      }
      if (contents.some((s) => s.kind !== 'def' && s.kind !== 'type'))
        throw new LanguageError(s.at, 'Libraries may contain only functions, types, and imports.');
      result.push(...contents);
      active.delete(target);
      seen.add(target);
    }
    return result;
  }
  analyze(
    source: string,
    path = '<terminal>',
    mode: 'terminal' | 'script' = 'terminal',
  ): CheckedProgram {
    this.bytes = 0;
    return new Checker(
      this.host.commands(),
      mode,
      mode === 'terminal' ? this.symbols : undefined,
    ).check(this.load(source, path));
  }
  async execute(source: string, options: ExecutionOptions = {}): Promise<void> {
    const mode = options.mode ?? 'terminal';
    this.checked = this.analyze(source, options.source, mode);
    if (mode === 'script') this.globals = new Scope();
    this.symbols = this.checked.symbols;
    if (mode === 'script')
      this.globals.values.set('args', { value: options.args ?? [], mutable: false });
    this.steps = options.steps ?? 100_000;
    this.deadline = performance.now() + (options.milliseconds ?? 2000);
    this.depth = 0;
    this.allocations = 0;
    try {
      await this.block(this.checked.statements, this.globals);
    } catch (error) {
      if (error instanceof Flow && error.kind === 'return') return;
      throw error;
    } finally {
      // A runtime failure may skip declarations. Never retain phantom bindings.
      for (const name of this.symbols.bindings.keys())
        if (!this.globals.values.has(name)) this.symbols.bindings.delete(name);
    }
  }
  private tick(at: Location) {
    if (--this.steps < 0 || performance.now() > this.deadline)
      throw new LanguageError(at, 'Execution limit exceeded.');
  }
  private bounded(value: Value, at: Location): Value {
    if (
      (typeof value === 'string' && value.length > 250_000) ||
      (Array.isArray(value) && value.length > 10_000)
    )
      throw new LanguageError(at, 'Value size limit exceeded.');
    const size = (v: Value, depth = 0): number => {
      if (depth > 100) throw new LanguageError(at, 'Value nesting limit exceeded.');
      this.tick(at);
      const bytes =
        typeof v === 'string'
          ? v.length * 2
          : typeof v === 'object'
            ? Object.values(v).reduce<number>((sum, x) => sum + size(x, depth + 1), 16)
            : 8;
      if (bytes > 8_000_000) throw new LanguageError(at, 'Value memory limit exceeded.');
      return bytes;
    };
    this.allocations += size(value);
    if (this.allocations > 32_000_000)
      throw new LanguageError(at, 'Execution allocation limit exceeded.');
    return value;
  }
  private async block(body: Statement[], scope: Scope): Promise<void> {
    for (const s of body) {
      this.tick(s.at);
      try {
        switch (s.kind) {
          case 'binding':
            scope.values.set(s.name, {
              value: (await this.value(s.value, scope))!,
              mutable: s.mutable,
            });
            break;
          case 'assign':
            scope.get(s.name).value = (await this.value(s.value, scope))!;
            break;
          case 'expression': {
            const value = await this.value(s.value, scope);
            if (value !== undefined) this.host.display(value);
            break;
          }
          case 'if':
            await this.block(
              (await this.value(s.condition, scope)) ? s.yes : s.no,
              new Scope(scope),
            );
            break;
          case 'for': {
            const values = (await this.value(s.value, scope)) as Value[];
            for (const value of values) {
              this.tick(s.at);
              const local = new Scope(scope);
              local.values.set(s.name, { value, mutable: false });
              try {
                await this.block(s.body, local);
              } catch (error) {
                if (!(error instanceof Flow) || error.kind === 'return') throw error;
                if (error.kind === 'break') break;
              }
            }
            break;
          }
          case 'while':
            while (await this.value(s.condition, scope)) {
              this.tick(s.at);
              try {
                await this.block(s.body, new Scope(scope));
              } catch (error) {
                if (!(error instanceof Flow) || error.kind === 'return') throw error;
                if (error.kind === 'break') break;
              }
            }
            break;
          case 'return':
            throw new Flow('return', s.value ? await this.value(s.value, scope) : undefined);
          case 'break':
          case 'continue':
            throw new Flow(s.kind);
        }
      } catch (error) {
        if (error instanceof Flow || error instanceof LanguageError) throw error;
        throw new LanguageError(s.at, error instanceof Error ? error.message : String(error));
      }
    }
  }
  private async call(fn: Definition, args: Value[], at: Location): Promise<Value | undefined> {
    if (++this.depth > 100) throw new LanguageError(at, 'Function call depth limit exceeded.');
    const local = new Scope();
    fn.parameters.forEach((p, i) => local.values.set(p.name, { value: args[i], mutable: false }));
    try {
      await this.block(fn.body, local);
    } catch (error) {
      if (error instanceof Flow && error.kind === 'return') return error.value;
      if (error instanceof LanguageError)
        throw new LanguageError(
          error.location,
          error.message.slice(error.message.indexOf(': ') + 2) +
            `\n  at ${fn.name} (${at.source}:${at.line}:${at.column})`,
        );
      throw error;
    } finally {
      this.depth--;
    }
  }
  private async value(e: Expr, scope: Scope): Promise<Value | undefined> {
    this.tick(e.at);
    try {
      switch (e.kind) {
        case 'literal':
          return e.value;
        case 'variable':
          return scope.get(e.name).value;
        case 'list': {
          const result: Value[] = [];
          for (const item of e.items) result.push((await this.value(item, scope))!);
          return this.bounded(result, e.at);
        }
        case 'record': {
          const result: Record<string, Value> = Object.create(null);
          for (const [k, v] of Object.entries(e.fields)) result[k] = (await this.value(v, scope))!;
          return this.bounded(result, e.at);
        }
        case 'field':
          return ((await this.value(e.value, scope)) as Record<string, Value>)[e.field];
        case 'index': {
          const values = (await this.value(e.value, scope)) as Value[],
            index = (await this.value(e.index, scope)) as number;
          if (!Number.isInteger(index) || index < 0 || index >= values.length)
            throw new Error('List index out of range.');
          return values[index];
        }
        case 'unary': {
          const v = (await this.value(e.value, scope))!;
          return e.operator === 'not' ? !v : -(v as number);
        }
        case 'binary': {
          const a = (await this.value(e.left, scope))!;
          if (e.operator === 'and' && a === false) return false;
          if (e.operator === 'or' && a === true) return true;
          const b = (await this.value(e.right, scope))!;
          if (e.operator === '==') return equal(a, b);
          if (e.operator === '!=') return !equal(a, b);
          if (e.operator === 'and' || e.operator === 'or') return b;
          // Types are checked before evaluation; comparisons share one static operand type.
          const x = a as number,
            y = b as number;
          if (e.operator === '<') return x < y;
          if (e.operator === '<=') return x <= y;
          if (e.operator === '>') return x > y;
          if (e.operator === '>=') return x >= y;
          if (e.operator === '+' && typeof a === 'string') return this.bounded(a + b, e.at);
          if ((e.operator === '/' || e.operator === '%') && y === 0)
            throw new Error('Division by zero.');
          const n =
            e.operator === '+'
              ? x + y
              : e.operator === '-'
                ? x - y
                : e.operator === '*'
                  ? x * y
                  : e.operator === '/'
                    ? x / y
                    : x % y;
          if (!Number.isFinite(n)) throw new Error('Arithmetic result must be finite.');
          return n;
        }
        case 'call': {
          const args: Value[] = [];
          for (const argument of e.args) args.push((await this.value(argument, scope))!);
          const fn = this.symbols.functions.get(e.name);
          const result = fn
            ? await this.call(fn, args, e.at)
            : await this.host.invoke(e.name, args, this.checked.typeArguments.get(e));
          return result === undefined ? undefined : this.bounded(result, e.at);
        }
      }
    } catch (error) {
      if (error instanceof LanguageError || error instanceof Flow) throw error;
      throw new LanguageError(e.at, error instanceof Error ? error.message : String(error));
    }
  }
}
