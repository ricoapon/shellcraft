export type Value = string | number | boolean | Value[] | { [key: string]: Value };
export type Type =
  | { kind: 'string' | 'number' | 'bool' | 'void' | 'empty' }
  | { kind: 'list'; element: Type }
  | { kind: 'record'; fields: Record<string, Type> }
  | { kind: 'variable'; name: string };
export const string: Type = { kind: 'string' };
export const number: Type = { kind: 'number' };
export const bool: Type = { kind: 'bool' };
export const nothing: Type = { kind: 'void' };
export const list = (element: Type): Type => ({ kind: 'list', element });
export const record = (fields: Record<string, Type>): Type => ({ kind: 'record', fields });
export const generic: Type = { kind: 'variable', name: 'T' };
export const fileType = record({ name: string, path: string, type: string });

export function typeName(type: Type): string {
  if (type.kind === 'list') return `list<${typeName(type.element)}>`;
  if (type.kind === 'record')
    return `{${Object.entries(type.fields)
      .map(([k, t]) => `${k}: ${typeName(t)}`)
      .join(', ')}}`;
  if (type.kind === 'variable') return type.name;
  return type.kind;
}
export function compatible(actual: Type, expected: Type): boolean {
  if (actual.kind === 'empty') return expected.kind !== 'void';
  if (actual.kind !== expected.kind) return false;
  if (actual.kind === 'list' && expected.kind === 'list')
    return compatible(actual.element, expected.element);
  if (actual.kind === 'record' && expected.kind === 'record')
    return Object.entries(expected.fields).every(
      ([k, t]) => Object.hasOwn(actual.fields, k) && compatible(actual.fields[k], t),
    );
  return true;
}
export function equal(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  }
  return false;
}
export function validateValue(value: unknown, type: Type): Value {
  if (type.kind === 'list' && Array.isArray(value))
    return value.map((v) => validateValue(v, type.element));
  if (
    type.kind === 'record' &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const out: Record<string, Value> = Object.create(null);
    for (const [key, field] of Object.entries(type.fields)) {
      if (!Object.hasOwn(value, key)) throw new Error(`Missing field: ${key}`);
      out[key] = validateValue((value as Record<string, unknown>)[key], field);
    }
    return out;
  }
  if (
    (type.kind === 'string' && typeof value === 'string') ||
    (type.kind === 'bool' && typeof value === 'boolean') ||
    (type.kind === 'number' && typeof value === 'number' && Number.isFinite(value))
  )
    return value as Value;
  throw new Error(`Expected ${typeName(type)} in JSON input.`);
}

export type CompletionTarget =
  | {
      kind: 'path';
      scope: 'host' | 'workspace' | 'module';
      entries?: 'file' | 'directory';
      extension?: string;
    }
  | { kind: 'host' | 'mission' | 'command' }
  | { kind: 'choices'; values: readonly string[] };
export interface Signature {
  completion?: readonly (CompletionTarget | undefined)[];
  parameters: Type[];
  result: Type;
  minimum?: number;
  rest?: Type;
  /** Literal subcommand words, before the typed parameters. */
  prefix?: string[];
  terminalOnly?: boolean;
  typeParameter?: boolean;
}
export interface NativeCommand {
  readonly name: string;
  signatures: readonly Signature[];
}
export interface LanguageHost {
  commands(): readonly NativeCommand[];
  invoke(name: string, args: Value[], typeArgument?: Type): Promise<Value | undefined>;
  read(path: string): string;
  display(value: Value): void;
}
export interface Location {
  source: string;
  line: number;
  column: number;
  offset: number;
}
export class LanguageError extends Error {
  constructor(
    readonly location: Location,
    message: string,
    readonly incomplete = false,
  ) {
    super(`${location.source}:${location.line}:${location.column}: ${message}`);
    this.name = 'LanguageError';
  }
}
