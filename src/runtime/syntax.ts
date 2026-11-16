import { LanguageError } from './types';
import type { Location, Value } from './types';

export interface Token {
  text: string;
  kind: 'word' | 'string' | 'number' | 'symbol' | 'end';
  at: Location;
}
export type TypeNode = {
  name: string;
  element?: TypeNode;
  fields?: Record<string, TypeNode>;
  at: Location;
};
export type Expr = { at: Location } & (
  | { kind: 'literal'; value: Value }
  | { kind: 'variable'; name: string }
  | { kind: 'list'; items: Expr[] }
  | { kind: 'record'; fields: Record<string, Expr> }
  | { kind: 'field'; value: Expr; field: string }
  | { kind: 'index'; value: Expr; index: Expr }
  | { kind: 'unary'; operator: string; value: Expr }
  | { kind: 'binary'; operator: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[]; typeArgument?: TypeNode }
);
export type Statement = { at: Location } & (
  | { kind: 'binding'; name: string; mutable: boolean; annotation?: TypeNode; value: Expr }
  | { kind: 'assign'; name: string; value: Expr }
  | { kind: 'expression'; value: Expr }
  | { kind: 'if'; condition: Expr; yes: Statement[]; no: Statement[] }
  | { kind: 'for'; name: string; value: Expr; body: Statement[] }
  | { kind: 'while'; condition: Expr; body: Statement[] }
  | { kind: 'return'; value?: Expr }
  | { kind: 'break' | 'continue' }
  | {
      kind: 'def';
      name: string;
      parameters: { name: string; type: TypeNode }[];
      result: TypeNode;
      body: Statement[];
    }
  | { kind: 'type'; name: string; value: TypeNode }
  | { kind: 'use'; path: string }
);
const symbols = new Set('(){}[],:;$=<>!+*%|'.split(''));
export function tokenize(source: string, filename = '<terminal>'): Token[] {
  const tokens: Token[] = [];
  const grouping: string[] = [];
  let offset = 0,
    line = 1,
    column = 1;
  const at = (): Location => ({ source: filename, offset, line, column });
  const step = () => {
    const c = source[offset++];
    if (c === '\n') {
      line++;
      column = 1;
    } else column++;
    return c;
  };
  const push = (text: string, kind: Token['kind'], location: Location) => {
    tokens.push({ text, kind, at: location });
    if (kind === 'symbol' && ['(', '[', '{'].includes(text)) grouping.push(text);
    if (kind === 'symbol' && [')', ']', '}'].includes(text)) grouping.pop();
  };
  while (offset < source.length) {
    const c = source[offset],
      location = at();
    if (c === '\n' || c === ';') {
      step();
      if (c === ';' || !['(', '['].includes(grouping.at(-1) ?? '')) push(';', 'symbol', location);
      continue;
    }
    if (/\s/.test(c)) {
      step();
      continue;
    }
    if (c === '#') {
      while (offset < source.length && source[offset] !== '\n') step();
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = step();
      let text = '';
      while (offset < source.length && source[offset] !== quote) {
        if (source[offset] === '\n' || source[offset] === '\r')
          throw new LanguageError(location, 'Newline in string.');
        if (source[offset] === '\\' && quote === '"') {
          step();
          const escaped = step();
          const escapes: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            '"': '"',
            '\\': '\\',
          };
          if (!Object.hasOwn(escapes, escaped))
            throw new LanguageError(location, 'Invalid string escape.', offset >= source.length);
          text += escapes[escaped];
        } else text += step();
      }
      if (offset >= source.length) throw new LanguageError(location, 'Unclosed quote.', true);
      step();
      push(text, 'string', location);
      continue;
    }
    const pair = source.slice(offset, offset + 2);
    if (['==', '!=', '<=', '>=', '->'].includes(pair)) {
      step();
      step();
      push(pair, 'symbol', location);
      continue;
    }
    // Slash and hyphen belong to bare paths/names except when written as separate operators.
    if (symbols.has(c)) {
      push(step(), 'symbol', location);
      continue;
    }
    if (c === '.' && [']', ')'].includes(source[offset - 1])) {
      push(step(), 'symbol', location);
      continue;
    }
    let word = '';
    while (
      offset < source.length &&
      !/\s/.test(source[offset]) &&
      !symbols.has(source[offset]) &&
      !['#', '"', "'"].includes(source[offset])
    )
      word += step();
    if (!word) throw new LanguageError(location, `Unexpected character: ${c}`);
    push(word, /^-?(?:\d+(?:\.\d+)?)(?:[eE][+-]?\d+)?$/.test(word) ? 'number' : 'word', location);
  }
  push('', 'end', at());
  return tokens;
}
const reserved = new Set([
  'let',
  'mut',
  'type',
  'def',
  'use',
  'if',
  'else',
  'for',
  'in',
  'while',
  'break',
  'continue',
  'return',
  'true',
  'false',
  'and',
  'or',
  'not',
]);
export class Parser {
  private index = 0;
  private depth = 0;
  readonly tokens: Token[];
  constructor(source: string, filename?: string) {
    this.tokens = tokenize(source, filename);
  }
  private get token() {
    return this.tokens[this.index];
  }
  private is(text: string) {
    return this.token.text === text;
  }
  private take() {
    return this.tokens[this.index++];
  }
  private expect(text: string) {
    if (!this.is(text))
      this.fail(`Expected '${text}', got '${this.token.text || 'end of input'}'.`);
    return this.take();
  }
  private fail(message: string): never {
    throw new LanguageError(this.token.at, message, this.token.kind === 'end');
  }
  private separators() {
    while (this.is(';')) this.take();
  }
  private identifier(command = false) {
    const token = this.take();
    if (
      token.kind !== 'word' ||
      !(command ? /^[A-Za-z_][\w-]*$/ : /^[A-Za-z_]\w*$/).test(token.text) ||
      reserved.has(token.text)
    )
      throw new LanguageError(token.at, 'Expected a non-keyword name.');
    return token.text;
  }
  parse(): Statement[] {
    const result = this.statements(false);
    if (this.token.kind !== 'end') this.fail('Unexpected token.');
    return result;
  }
  private statements(block: boolean): Statement[] {
    if (++this.depth > 100) this.fail('Source nesting limit exceeded.');
    const result: Statement[] = [];
    this.separators();
    while (this.token.kind !== 'end' && !(block && this.is('}'))) {
      result.push(this.statement());
      if (!this.is(';') && (this.token as Token).kind !== 'end' && !(block && this.is('}')))
        this.fail("Expected newline or ';'.");
      this.separators();
    }
    this.depth--;
    return result;
  }
  private block() {
    this.expect('{');
    const body = this.statements(true);
    this.expect('}');
    return body;
  }
  private statement(): Statement {
    const at = this.token.at;
    if (this.is('let') || this.is('mut')) {
      const mutable = this.take().text === 'mut',
        name = this.identifier();
      const annotation = this.is(':') ? (this.take(), this.type()) : undefined;
      this.expect('=');
      return { kind: 'binding', at, mutable, name, annotation, value: this.expression() };
    }
    if (this.is('type')) {
      this.take();
      const name = this.identifier();
      this.expect('=');
      return { kind: 'type', at, name, value: this.type() };
    }
    if (this.is('use')) {
      this.take();
      const path = this.take();
      if (!['word', 'string'].includes(path.kind)) this.fail('Expected a literal import path.');
      return { kind: 'use', at, path: path.text };
    }
    if (this.is('def')) {
      this.take();
      const name = this.identifier(true);
      this.expect('[');
      this.separators();
      const parameters: { name: string; type: TypeNode }[] = [];
      while (!this.is(']')) {
        const name = this.identifier();
        this.expect(':');
        parameters.push({ name, type: this.type() });
        this.separators();
        if (!this.is(',')) break;
        this.take();
        this.separators();
      }
      this.expect(']');
      this.expect('->');
      const result = this.type();
      const body = this.block();
      return { kind: 'def', at, name, parameters, result, body };
    }
    if (this.is('if')) {
      this.take();
      const condition = this.expression(),
        yes = this.block();
      // A newline before else belongs to this conditional, only when else follows.
      const saved = this.index;
      this.separators();
      let no: Statement[] = [];
      if (this.is('else')) {
        this.take();
        no = this.is('if') ? [this.statement()] : this.block();
      } else this.index = saved;
      return { kind: 'if', at, condition, yes, no };
    }
    if (this.is('for')) {
      this.take();
      const name = this.identifier();
      this.expect('in');
      const value = this.expression();
      return { kind: 'for', at, name, value, body: this.block() };
    }
    if (this.is('while')) {
      this.take();
      const condition = this.expression();
      return { kind: 'while', at, condition, body: this.block() };
    }
    if (this.is('return')) {
      this.take();
      return { kind: 'return', at, value: this.endExpression() ? undefined : this.expression() };
    }
    if (this.is('break') || this.is('continue'))
      return { kind: this.take().text as 'break' | 'continue', at };
    if (this.is('$') && this.tokens[this.index + 2]?.text === '=') {
      this.take();
      const name = this.identifier();
      this.expect('=');
      return { kind: 'assign', at, name, value: this.expression() };
    }
    return { kind: 'expression', at, value: this.expression() };
  }
  type(): TypeNode {
    const at = this.token.at;
    if (this.is('{')) {
      this.take();
      this.separators();
      const fields: Record<string, TypeNode> = Object.create(null);
      while (!this.is('}')) {
        const name = this.identifier();
        if (Object.hasOwn(fields, name)) this.fail('Duplicate field.');
        this.expect(':');
        fields[name] = this.type();
        this.separators();
        if (!this.is(',')) break;
        this.take();
        this.separators();
      }
      this.expect('}');
      return { name: 'record', fields, at };
    }
    const name = this.take().text;
    if (name === 'list') {
      this.expect('<');
      const element = this.type();
      this.expect('>');
      return { name, element, at };
    }
    return { name, at };
  }
  private endExpression() {
    return this.token.kind === 'end' || [';', ')', ']', '}', ','].includes(this.token.text);
  }
  private expression(minimum = 0): Expr {
    if (++this.depth > 100) this.fail('Expression nesting limit exceeded.');
    let left = this.atom();
    const precedence: Record<string, number> = {
      or: 1,
      and: 2,
      '==': 3,
      '!=': 3,
      '<': 4,
      '<=': 4,
      '>': 4,
      '>=': 4,
      '+': 5,
      '-': 5,
      '*': 6,
      '/': 6,
      '%': 6,
    };
    while (!this.endExpression() && (precedence[this.token.text] ?? 0) > minimum) {
      const operator = this.take().text;
      if (
        ['==', '!=', '<', '<=', '>', '>='].includes(operator) &&
        left.kind === 'binary' &&
        ['==', '!=', '<', '<=', '>', '>='].includes(left.operator)
      )
        this.fail('Comparison operators cannot be chained.');
      left = {
        kind: 'binary',
        at: left.at,
        operator,
        left,
        right: this.expression(precedence[operator]),
      };
    }
    this.depth--;
    return left;
  }
  private atom(argument = false): Expr {
    const token = this.take(),
      at = token.at;
    let value: Expr;
    if (token.text === '$') {
      const part = this.take();
      const names = part.text.split('.');
      if (!/^[A-Za-z_]\w*$/.test(names[0]))
        throw new LanguageError(part.at, 'Expected variable name.');
      value = { kind: 'variable', at, name: names[0] };
      for (const field of names.slice(1)) {
        if (!/^[A-Za-z_]\w*$/.test(field)) this.fail('Invalid field name.');
        value = { kind: 'field', at, value, field };
      }
    } else if (token.text === '(') {
      this.separators();
      value = this.expression();
      this.separators();
      this.expect(')');
    } else if (token.text === '[') {
      const items: Expr[] = [];
      this.separators();
      while (!this.is(']')) {
        items.push(this.expression());
        this.separators();
        if (!this.is(',')) break;
        this.take();
        this.separators();
      }
      this.expect(']');
      value = { kind: 'list', at, items };
    } else if (token.text === '{') {
      const fields: Record<string, Expr> = Object.create(null);
      this.separators();
      while (!this.is('}')) {
        const name = this.identifier();
        if (Object.hasOwn(fields, name)) this.fail('Duplicate field.');
        this.expect(':');
        fields[name] = this.expression();
        this.separators();
        if (!this.is(',')) break;
        this.take();
        this.separators();
      }
      this.expect('}');
      value = { kind: 'record', at, fields };
    } else if (token.kind === 'number') {
      const n = Number(token.text);
      if (!Number.isFinite(n)) throw new LanguageError(at, 'Number must be finite.');
      value = { kind: 'literal', at, value: n };
    } else if (token.kind === 'string') value = { kind: 'literal', at, value: token.text };
    else if (token.text === 'true' || token.text === 'false')
      value = { kind: 'literal', at, value: token.text === 'true' };
    else if (token.text === 'not' || token.text === '-')
      value = { kind: 'unary', at, operator: token.text, value: this.expression(6) };
    else if (token.kind === 'word' && argument) value = { kind: 'literal', at, value: token.text };
    else if (
      token.kind === 'word' &&
      /^[A-Za-z_][\w-]*$/.test(token.text) &&
      !reserved.has(token.text)
    ) {
      const name = token.text;
      const typeArgument =
        this.is('<') && this.token.at.offset === at.offset + name.length
          ? (this.take(), this.type())
          : undefined;
      if (typeArgument) this.expect('>');
      const args: Expr[] = [];
      while (
        !this.endExpression() &&
        this.token.text !== 'else' &&
        (!this.is('{') || this.tokens[this.index + 2]?.text === ':')
      )
        args.push(this.atom(true));
      value = { kind: 'call', at, name, args, typeArgument };
    } else
      throw new LanguageError(
        at,
        `Expected expression, got '${token.text || 'end of input'}'.`,
        token.kind === 'end',
      );
    while (this.is('[') || this.is('.')) {
      if (this.is('[')) {
        this.take();
        const index = this.expression();
        this.expect(']');
        value = { kind: 'index', at, value, index };
      } else {
        this.take();
        const field = this.identifier();
        value = { kind: 'field', at, value, field };
      }
    }
    return value;
  }
}
export function parse(source: string, filename?: string) {
  return new Parser(source, filename).parse();
}
export function isIncomplete(source: string): boolean {
  try {
    parse(source);
    return false;
  } catch (error) {
    return error instanceof LanguageError && error.incomplete;
  }
}
