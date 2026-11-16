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
