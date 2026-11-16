import { createToken, Lexer, EmbeddedActionsParser, EOF, tokenMatcher } from 'chevrotain';
import type { IToken } from 'chevrotain';
import { LanguageError } from './types';
import type { Location } from './types';
import type { Expr, Statement, TypeNode } from './ast';

const Word = createToken({ name: 'Word', pattern: Lexer.NA });
const Bare = createToken({
  name: 'Bare',
  pattern: /[^\s(){}\[\],:;$=<>!+*%|"'#]+/,
  categories: Word,
});
const keyword = (name: string, image: string) =>
  createToken({ name, pattern: new RegExp(image), longer_alt: Bare, categories: Word });
const Let = keyword('Let', 'let'),
  Mut = keyword('Mut', 'mut'),
  Def = keyword('Def', 'def'),
  TypeKeyword = keyword('TypeKeyword', 'type'),
  Use = keyword('Use', 'use');
const If = keyword('If', 'if'),
  Else = keyword('Else', 'else'),
  For = keyword('For', 'for'),
  In = keyword('In', 'in'),
  While = keyword('While', 'while');
const Return = keyword('Return', 'return'),
  Break = keyword('Break', 'break'),
  Continue = keyword('Continue', 'continue');
const True = keyword('True', 'true'),
  False = keyword('False', 'false'),
  And = keyword('And', 'and'),
  Or = keyword('Or', 'or'),
  Not = keyword('Not', 'not');
const symbol = (name: string, pattern: RegExp) => createToken({ name, pattern });
const White = createToken({ name: 'White', pattern: /[^\S\r\n]+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: 'Comment', pattern: /#[^\r\n]*/, group: 'comments' });
const Newline = symbol('Newline', /\r?\n/),
  Semicolon = symbol('Semicolon', /;/);
const Text = symbol('Text', /"(?:\\[^\r\n]|[^"\\\r\n])*"/);
const Unclosed = symbol('Unclosed', /"(?:\\[^\r\n]|[^"\\\r\n])*/);
const SingleQuoted = symbol('SingleQuoted', /'[^'\r\n]*'?/);
const Numeric = createToken({
  name: 'Numeric',
  pattern: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/,
  longer_alt: Bare,
});
const Variable = symbol('Variable', /\$[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/);
const Field = createToken({
  name: 'Field',
  pattern: /\.[A-Za-z_]\w*/,
  longer_alt: Bare,
  categories: Word,
});
const Arrow = symbol('Arrow', /->/),
  Equal = symbol('Equal', /==/),
  NotEqual = symbol('NotEqual', /!=/),
  LessEqual = symbol('LessEqual', /<=/),
  GreaterEqual = symbol('GreaterEqual', />=/);
const LParen = symbol('LParen', /\(/),
  RParen = symbol('RParen', /\)/),
  LSquare = symbol('LSquare', /\[/),
  RSquare = symbol('RSquare', /\]/),
  LBrace = symbol('LBrace', /\{/),
  RBrace = symbol('RBrace', /\}/);
const Comma = symbol('Comma', /,/),
  Colon = symbol('Colon', /:/),
  Assign = symbol('Assign', /=/),
  Less = symbol('Less', /</),
  Greater = symbol('Greater', />/);
const Plus = symbol('Plus', /\+/),
  Times = symbol('Times', /\*/),
  Modulo = symbol('Modulo', /%/);
const Minus = createToken({ name: 'Minus', pattern: /-/, longer_alt: Bare, categories: Word });
const Divide = createToken({ name: 'Divide', pattern: /\//, longer_alt: Bare, categories: Word });
const Name = createToken({
  name: 'Name',
  pattern: /[A-Za-z_]\w*(?:-[\w]+)*/,
  longer_alt: Bare,
  categories: Word,
});
const vocabulary = [
  White,
  Comment,
  Newline,
  Semicolon,
  SingleQuoted,
  Text,
  Unclosed,
  Numeric,
  Variable,
  Field,
  Arrow,
  Equal,
  NotEqual,
  LessEqual,
  GreaterEqual,
  LParen,
  RParen,
  LSquare,
  RSquare,
  LBrace,
  RBrace,
  Comma,
  Colon,
  Assign,
  Less,
  Greater,
  Plus,
  Times,
  Modulo,
  Minus,
  Divide,
  Let,
  Mut,
  Def,
  TypeKeyword,
  Use,
  If,
  Else,
  For,
  In,
  While,
  Return,
  Break,
  Continue,
  True,
  False,
  And,
  Or,
  Not,
  Name,
  Bare,
  Word,
];
const lexer = new Lexer(vocabulary, { ensureOptimizations: false });
const reserved = new Set([
  'let',
  'mut',
  'def',
  'type',
  'use',
  'if',
  'else',
  'for',
  'in',
  'while',
  'return',
  'break',
  'continue',
  'true',
  'false',
  'and',
  'or',
  'not',
]);
const loc = (t: IToken, source: string): Location => ({
  source,
  offset: t.startOffset,
  line: t.startLine ?? 1,
  column: t.startColumn ?? 1,
});
function stringValue(t: IToken): string {
  if (/\\(?![nrt"\\])/.test(t.image)) throw new Error('Invalid string escape.');
  return JSON.parse(t.image);
}
export class ShellcraftParser extends EmbeddedActionsParser {
  filename = '<terminal>';
  constructor() {
    super(vocabulary, { recoveryEnabled: false, maxLookahead: 2 });
    this.performSelfAnalysis();
  }
  private at() {
    return loc(this.LA(1), this.filename);
  }
  private recordAhead() {
    return tokenMatcher(this.LA(1), LBrace) && tokenMatcher(this.LA(3), Colon);
  }
  private argumentAhead() {
    const t = this.LA(1);
    if (tokenMatcher(t, LBrace)) return this.recordAhead();
    return (
      [Text, Numeric, Variable, LParen, LSquare, True, False, Word].some((type) =>
        tokenMatcher(t, type),
      ) && ![Else, And, Or, Not].some((type) => tokenMatcher(t, type))
    );
  }
  private adjacent() {
    return this.LA(1).startOffset === (this.LA(0).endOffset ?? -2) + 1;
  }
  separators = this.RULE('separators', () => {
    this.MANY(() =>
      this.OR([{ ALT: () => this.CONSUME(Newline) }, { ALT: () => this.CONSUME(Semicolon) }]),
    );
  });
  program = this.RULE('program', () => {
    const body: Statement[] = [];
    this.SUBRULE(this.separators);
    this.MANY(() => {
      const s = this.SUBRULE(this.statement);
      this.ACTION(() => body.push(s));
      this.OR([
        {
          ALT: () => {
            this.AT_LEAST_ONE(() =>
              this.OR2([
                { ALT: () => this.CONSUME(Newline) },
                { ALT: () => this.CONSUME(Semicolon) },
              ]),
            );
          },
        },
        { GATE: () => tokenMatcher(this.LA(1), EOF), ALT: () => {} },
      ]);
    });
    this.CONSUME(EOF);
    return body;
  });
  block = this.RULE('block', () => {
    this.CONSUME(LBrace);
    this.SUBRULE(this.separators);
    const body: Statement[] = [];
    this.MANY(() => {
      const s = this.SUBRULE(this.statement);
      this.ACTION(() => body.push(s));
      this.OR([
        {
          ALT: () => {
            this.AT_LEAST_ONE(() =>
              this.OR2([
                { ALT: () => this.CONSUME(Newline) },
                { ALT: () => this.CONSUME(Semicolon) },
              ]),
            );
          },
        },
        { GATE: () => tokenMatcher(this.LA(1), RBrace), ALT: () => {} },
      ]);
    });
    this.CONSUME(RBrace);
    return body;
  });
  identifier = this.RULE('identifier', () => {
    const t = this.CONSUME(Word);
    return this.ACTION(() => {
      if (!/^[A-Za-z_]\w*$/.test(t.image) || reserved.has(t.image))
        throw new LanguageError(loc(t, this.filename), 'Expected a non-keyword name.');
      return t.image;
    });
  });
  fieldName = this.RULE('fieldName', () => {
    const t = this.CONSUME(Word);
    return this.ACTION(() => {
      if (!/^[A-Za-z_]\w*$/.test(t.image))
        throw new LanguageError(loc(t, this.filename), 'Expected a field name.');
      return t.image;
    });
  });
  type = this.RULE('type', (): TypeNode => {
    const at = this.ACTION(() => this.at());
    let result: TypeNode;
    this.OR([
      {
        ALT: () => {
          this.CONSUME(LBrace);
          this.SUBRULE(this.separators);
          const fields: Record<string, TypeNode> = Object.create(null);
          this.OPTION(() => {
            const name = this.SUBRULE(this.fieldName);
            this.CONSUME(Colon);
            const type = this.SUBRULE(this.type);
            this.ACTION(() => {
              fields[name] = type;
            });
            this.SUBRULE2(this.separators);
            this.MANY(() => {
              this.CONSUME(Comma);
              this.SUBRULE3(this.separators);
              this.OPTION2(() => {
                const key = this.SUBRULE2(this.fieldName);
                this.CONSUME2(Colon);
                const value = this.SUBRULE2(this.type);
                this.ACTION(() => {
                  if (Object.hasOwn(fields, key)) throw new LanguageError(at, 'Duplicate field.');
                  fields[key] = value;
                });
                this.SUBRULE4(this.separators);
              });
            });
          });
          this.CONSUME(RBrace);
          result = { name: 'record', fields, at };
        },
      },
      {
        ALT: () => {
          const name = this.CONSUME(Word);
          let element: TypeNode | undefined;
          this.OPTION3({
            GATE: () => name.image === 'list',
            DEF: () => {
              this.CONSUME(Less);
              element = this.SUBRULE3(this.type);
              this.CONSUME(Greater);
            },
          });
          result = this.ACTION(() => ({ name: name.image, element, at }));
        },
      },
    ]);
    return result!;
  });
  statement = this.RULE('statement', (): Statement => {
    const at = this.ACTION(() => this.at());
    let result: Statement;
    this.OR([
      {
        ALT: () => {
          const token = this.OR2([
            { ALT: () => this.CONSUME(Let) },
            { ALT: () => this.CONSUME(Mut) },
          ]);
          const name = this.SUBRULE(this.identifier);
          let annotation: TypeNode | undefined;
          this.OPTION(() => {
            this.CONSUME(Colon);
            annotation = this.SUBRULE(this.type);
          });
          this.CONSUME(Assign);
          const value = this.SUBRULE(this.expression);
          result = this.ACTION(() => ({
            kind: 'binding',
            at,
            name,
            mutable: token.image === 'mut',
            annotation,
            value,
          }));
        },
      },
      {
        ALT: () => {
          this.CONSUME(TypeKeyword);
          const name = this.SUBRULE2(this.identifier);
          this.CONSUME2(Assign);
          const value = this.SUBRULE2(this.type);
          result = { kind: 'type', at, name, value };
        },
      },
      {
        ALT: () => {
          this.CONSUME(Use);
          const t = this.OR3([
            { ALT: () => this.CONSUME(Text) },
            { ALT: () => this.CONSUME(Word) },
          ]);
          result = this.ACTION(() => ({
            kind: 'use',
            at,
            path: tokenMatcher(t, Text) ? stringValue(t) : t.image,
          }));
        },
      },
      {
        ALT: () => {
          this.CONSUME(Def);
          const t = this.CONSUME(Name);
          this.CONSUME(LSquare);
          const parameters: { name: string; type: TypeNode }[] = [];
          this.OPTION2(() => {
            const name = this.SUBRULE3(this.identifier);
            this.CONSUME2(Colon);
            const type = this.SUBRULE3(this.type);
            this.ACTION(() => parameters.push({ name, type }));
            this.MANY(() => {
              this.CONSUME(Comma);
              this.OPTION3(() => {
                const name = this.SUBRULE4(this.identifier);
                this.CONSUME3(Colon);
                const type = this.SUBRULE4(this.type);
                this.ACTION(() => parameters.push({ name, type }));
              });
            });
          });
          this.CONSUME(RSquare);
          this.CONSUME(Arrow);
          const returns = this.SUBRULE5(this.type);
          const body = this.SUBRULE(this.block);
          result = this.ACTION(() => ({
            kind: 'def',
            at,
            name: t.image,
            parameters,
            result: returns,
            body,
          }));
        },
      },
      {
        ALT: () => {
          this.CONSUME(If);
          const condition = this.SUBRULE2(this.expression);
          const yes = this.SUBRULE2(this.block);
          let no: Statement[] = [];
          this.OPTION4({
            GATE: () => {
              let i = 1;
              while (tokenMatcher(this.LA(i), Newline) || tokenMatcher(this.LA(i), Semicolon)) i++;
              return tokenMatcher(this.LA(i), Else);
            },
            DEF: () => {
              this.SUBRULE(this.separators);
              this.CONSUME(Else);
              no = this.OR4([
                {
                  GATE: () => tokenMatcher(this.LA(1), If),
                  ALT: () => [this.SUBRULE(this.statement)],
                },
                { ALT: () => this.SUBRULE3(this.block) },
              ]);
            },
          });
          result = { kind: 'if', at, condition, yes, no };
        },
      },
      {
        ALT: () => {
          this.CONSUME(For);
          const name = this.SUBRULE5(this.identifier);
          this.CONSUME(In);
          const value = this.SUBRULE3(this.expression);
          const body = this.SUBRULE4(this.block);
          result = { kind: 'for', at, name, value, body };
        },
      },
      {
        ALT: () => {
          this.CONSUME(While);
          const condition = this.SUBRULE4(this.expression);
          const body = this.SUBRULE5(this.block);
          result = { kind: 'while', at, condition, body };
        },
      },
      {
        ALT: () => {
          this.CONSUME(Return);
          let value: Expr | undefined;
          this.OPTION5(() => {
            value = this.SUBRULE5(this.expression);
          });
          result = { kind: 'return', at, value };
        },
      },
      {
        ALT: () => {
          this.CONSUME(Break);
          result = { kind: 'break', at };
        },
      },
      {
        ALT: () => {
          this.CONSUME(Continue);
          result = { kind: 'continue', at };
        },
      },
      {
        GATE: () => tokenMatcher(this.LA(1), Variable) && tokenMatcher(this.LA(2), Assign),
        ALT: () => {
          const t = this.CONSUME(Variable);
          this.CONSUME3(Assign);
          const value = this.SUBRULE6(this.expression);
          result = this.ACTION(() => {
            if (t.image.includes('.')) throw new LanguageError(at, 'Fields are immutable.');
            return { kind: 'assign', at, name: t.image.slice(1), value };
          });
        },
      },
      {
        ALT: () => {
          const value = this.SUBRULE7(this.expression);
          result = { kind: 'expression', at, value };
        },
      },
    ]);
    return result!;
  });
  expression = this.RULE('expression', (): Expr => this.SUBRULE(this.disjunction));
  disjunction = this.RULE('disjunction', (): Expr => {
    let left = this.SUBRULE(this.conjunction);
    this.MANY(() => {
      const op = this.CONSUME(Or);
      const right = this.SUBRULE2(this.conjunction);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  conjunction = this.RULE('conjunction', (): Expr => {
    let left = this.SUBRULE(this.equality);
    this.MANY(() => {
      const op = this.CONSUME(And);
      const right = this.SUBRULE2(this.equality);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  equality = this.RULE('equality', (): Expr => {
    let left = this.SUBRULE(this.order);
    this.OPTION(() => {
      const op = this.OR([
        { ALT: () => this.CONSUME(Equal) },
        { ALT: () => this.CONSUME(NotEqual) },
      ]);
      const right = this.SUBRULE2(this.order);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  order = this.RULE('order', (): Expr => {
    let left = this.SUBRULE(this.add);
    this.OPTION(() => {
      const op = this.OR([
        { ALT: () => this.CONSUME(LessEqual) },
        { ALT: () => this.CONSUME(GreaterEqual) },
        { ALT: () => this.CONSUME(Less) },
        { ALT: () => this.CONSUME(Greater) },
      ]);
      const right = this.SUBRULE2(this.add);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  add = this.RULE('add', (): Expr => {
    let left = this.SUBRULE(this.multiply);
    this.MANY(() => {
      const op = this.OR([{ ALT: () => this.CONSUME(Plus) }, { ALT: () => this.CONSUME(Minus) }]);
      const right = this.SUBRULE2(this.multiply);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  multiply = this.RULE('multiply', (): Expr => {
    let left = this.SUBRULE(this.unary);
    this.MANY(() => {
      const op = this.OR([
        { ALT: () => this.CONSUME(Times) },
        { ALT: () => this.CONSUME(Divide) },
        { ALT: () => this.CONSUME(Modulo) },
      ]);
      const right = this.SUBRULE2(this.unary);
      left = this.ACTION(() => ({ kind: 'binary', at: left.at, operator: op.image, left, right }));
    });
    return left;
  });
  unary = this.RULE('unary', (): Expr =>
    this.OR([
      {
        ALT: () => {
          const op = this.OR2([
            { ALT: () => this.CONSUME(Not) },
            { ALT: () => this.CONSUME(Minus) },
          ]);
          const value = this.SUBRULE(this.unary);
          return this.ACTION(() => ({
            kind: 'unary' as const,
            at: loc(op, this.filename),
            operator: op.image,
            value,
          }));
        },
      },
      { ALT: () => this.SUBRULE(this.primary) },
    ]),
  );
  primary = this.RULE('primary', (): Expr => {
    let value = this.OR([
      { GATE: () => tokenMatcher(this.LA(1), Name), ALT: () => this.SUBRULE(this.call) },
      { ALT: () => this.SUBRULE(this.atom) },
    ]);
    this.MANY({
      GATE: () => this.adjacent(),
      DEF: () =>
        this.OR2([
          {
            ALT: () => {
              this.CONSUME(LSquare);
              const index = this.SUBRULE(this.expression);
              this.CONSUME(RSquare);
              value = this.ACTION(() => ({ kind: 'index', at: value.at, value, index }));
            },
          },
          {
            ALT: () => {
              const f = this.CONSUME(Field);
              value = this.ACTION(() => ({
                kind: 'field',
                at: value.at,
                value,
                field: f.image.slice(1),
              }));
            },
          },
        ]),
    });
    return value;
  });
  atom = this.RULE('atom', (): Expr => {
    const at = this.ACTION(() => this.at());
    return this.OR([
      {
        ALT: () => {
          const token = this.CONSUME(Text);
          return this.ACTION(() => ({ kind: 'literal' as const, at, value: stringValue(token) }));
        },
      },
      {
        ALT: () => {
          const token = this.CONSUME(Numeric);
          return this.ACTION(() => {
            const value = Number(token.image);
            if (!Number.isFinite(value)) throw new LanguageError(at, 'Number must be finite.');
            return { kind: 'literal' as const, at, value };
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME(True);
          return { kind: 'literal' as const, at, value: true };
        },
      },
      {
        ALT: () => {
          this.CONSUME(False);
          return { kind: 'literal' as const, at, value: false };
        },
      },
      {
        ALT: () => {
          const token = this.CONSUME(Variable);
          return this.ACTION(() => {
            const [name, ...fields] = token.image.slice(1).split('.');
            let value: Expr = { kind: 'variable', at, name };
            for (const field of fields) value = { kind: 'field', at, value, field };
            return value;
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME(LParen);
          const value = this.SUBRULE(this.expression);
          this.CONSUME(RParen);
          return value;
        },
      },
      {
        ALT: () => {
          this.CONSUME(LSquare);
          const items: Expr[] = [];
          this.OPTION(() => {
            const item = this.SUBRULE2(this.expression);
            this.ACTION(() => items.push(item));
            this.MANY(() => {
              this.CONSUME(Comma);
              this.OPTION2(() => {
                const item = this.SUBRULE3(this.expression);
                this.ACTION(() => items.push(item));
              });
            });
          });
          this.CONSUME(RSquare);
          return { kind: 'list' as const, at, items };
        },
      },
      {
        ALT: () => {
          this.CONSUME(LBrace);
          this.SUBRULE(this.separators);
          const fields: Record<string, Expr> = Object.create(null);
          this.OPTION3(() => {
            const name = this.SUBRULE(this.fieldName);
            this.CONSUME(Colon);
            const expr = this.SUBRULE4(this.expression);
            this.ACTION(() => {
              fields[name] = expr;
            });
            this.SUBRULE2(this.separators);
            this.MANY2(() => {
              this.CONSUME2(Comma);
              this.SUBRULE3(this.separators);
              this.OPTION4(() => {
                const name = this.SUBRULE2(this.fieldName);
                this.CONSUME2(Colon);
                const expr = this.SUBRULE5(this.expression);
                this.ACTION(() => {
                  if (Object.hasOwn(fields, name)) throw new LanguageError(at, 'Duplicate field.');
                  fields[name] = expr;
                });
                this.SUBRULE4(this.separators);
              });
            });
          });
          this.CONSUME(RBrace);
          return { kind: 'record' as const, at, fields };
        },
      },
    ]);
  });
  argument = this.RULE('argument', (): Expr => {
    let value = this.OR([
      {
        GATE: () =>
          [Text, Numeric, Variable, LParen, LSquare, LBrace, True, False].some((type) =>
            tokenMatcher(this.LA(1), type),
          ),
        ALT: () => this.SUBRULE(this.atom),
      },
      {
        ALT: () => {
          const token = this.CONSUME(Word);
          return this.ACTION(() => ({
            kind: 'word' as const,
            at: loc(token, this.filename),
            value: token.image,
          }));
        },
      },
    ]);
    this.MANY({
      GATE: () => this.adjacent(),
      DEF: () =>
        this.OR2([
          {
            ALT: () => {
              this.CONSUME(LSquare);
              const index = this.SUBRULE(this.expression);
              this.CONSUME(RSquare);
              value = this.ACTION(() => ({ kind: 'index', at: value.at, value, index }));
            },
          },
          {
            ALT: () => {
              const field = this.CONSUME(Field);
              value = this.ACTION(() => ({
                kind: 'field',
                at: value.at,
                value,
                field: field.image.slice(1),
              }));
            },
          },
        ]),
    });
    return value;
  });
  call = this.RULE('call', (): Expr => {
    const name = this.CONSUME(Name);
    let typeArgument: TypeNode | undefined;
    this.OPTION({
      GATE: () => tokenMatcher(this.LA(1), Less) && this.adjacent(),
      DEF: () => {
        this.CONSUME(Less);
        typeArgument = this.SUBRULE(this.type);
        this.CONSUME(Greater);
      },
    });
    const args: Expr[] = [];
    this.MANY({
      GATE: () => this.argumentAhead(),
      DEF: () => {
        const value = this.SUBRULE(this.argument);
        this.ACTION(() => args.push(value));
      },
    });
    return this.ACTION(() => ({
      kind: 'call',
      at: loc(name, this.filename),
      name: name.image,
      args,
      typeArgument,
    }));
  });
}
const parser = new ShellcraftParser();
function lex(source: string, filename: string) {
  if (source.length > 250_000)
    throw new LanguageError(
      { source: filename, line: 1, column: 1, offset: 0 },
      'Source exceeds 250 KB.',
    );
  const result = lexer.tokenize(source);
  const singleQuoted = result.tokens.find((token) => tokenMatcher(token, SingleQuoted));
  if (singleQuoted)
    throw new LanguageError(
      loc(singleQuoted, filename),
      'Single-quoted strings are not supported. Use double quotes.',
    );
  const unclosed = result.tokens.find((t) => tokenMatcher(t, Unclosed));
  if (unclosed) throw new LanguageError(loc(unclosed, filename), 'Unclosed quote.', true);
  if (result.errors.length) {
    const e = result.errors[0];
    throw new LanguageError(
      { source: filename, line: e.line ?? 1, column: e.column ?? 1, offset: e.offset },
      e.message,
    );
  }
  const stack: string[] = [];
  let maximum = 0;
  // Newlines in parentheses/lists are whitespace, except inside nested statement blocks.
  const tokens = result.tokens.filter((t) => {
    const keep = !tokenMatcher(t, Newline) || !['(', '['].includes(stack.at(-1) ?? '');
    if (['(', '[', '{'].includes(t.image)) {
      stack.push(t.image);
      maximum = Math.max(maximum, stack.length);
    }
    if ([')', ']', '}'].includes(t.image)) stack.pop();
    return keep;
  });
  if (maximum > 80)
    throw new LanguageError(loc(tokens[0], filename), 'Source nesting limit exceeded.');
  return tokens;
}
export function parse(source: string, filename = '<terminal>'): Statement[] {
  const tokens = lex(source, filename);
  parser.filename = filename;
  parser.input = tokens;
  let result: Statement[];
  try {
    result = parser.program();
  } catch (error) {
    if (error instanceof LanguageError) throw error;
    throw new LanguageError(
      { source: filename, line: 1, column: 1, offset: 0 },
      error instanceof Error ? error.message : String(error),
    );
  }
  if (parser.errors.length) {
    const error = parser.errors[0],
      end = tokenMatcher(error.token, EOF);
    const last = tokens.at(-1);
    throw new LanguageError(
      end
        ? {
            source: filename,
            line: last?.endLine ?? 1,
            column: (last?.endColumn ?? 0) + 1,
            offset: source.length,
          }
        : loc(error.token, filename),
      end && last && tokenMatcher(last, Times)
        ? "Expected an expression after '*'. Wildcard expansion is not supported."
        : error.message,
      end,
    );
  }
  return result;
}
export function isIncomplete(source: string): boolean {
  try {
    parse(source);
    return false;
  } catch (error) {
    if (!(error instanceof LanguageError) || !error.incomplete) return false;
    // Readline continues by inserting a newline. Only wait if that newline
    // keeps the source incomplete, rather than making it invalid (cat *, let x =).
    try {
      parse(source + '\n');
      return false;
    } catch (continued) {
      return continued instanceof LanguageError && continued.incomplete;
    }
  }
}
export function lexicalTokens(source: string) {
  return lexer.tokenize(source);
}
