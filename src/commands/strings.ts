import type { Command } from './command';
import { bool, equal, generic, list, number, string, validateValue } from '../runtime/types';
import type { Value } from '../runtime/types';
import { matchText } from '../runtime/regex';
export const stringCommands: readonly Command[] = [
  {
    name: 'contains',
    usage: 'contains <text|list> <part|element>',
    description: 'Test substring or list membership.',
    signatures: [
      { parameters: [string, string], result: bool },
      { parameters: [list(generic), generic], result: bool },
    ],
    execute: ([value, part]) => ({
      value:
        typeof value === 'string'
          ? value.includes(part as string)
          : (value as Value[]).some((v) => equal(v, part)),
    }),
  },
  {
    name: 'split',
    usage: 'split <separator> <text>',
    description: 'Split text into strings.',
    signatures: [{ parameters: [string, string], result: list(string) }],
    execute: ([separator, text]) => {
      if (separator === '') throw new Error('Separator must not be empty.');
      return { value: (text as string).split(separator as string) };
    },
  },
  {
    name: 'join',
    usage: 'join <separator> <strings>',
    description: 'Join strings.',
    signatures: [{ parameters: [string, list(string)], result: string }],
    execute: ([separator, values]) => ({ value: (values as string[]).join(separator as string) }),
  },
  {
    name: 'trim',
    usage: 'trim <text>',
    description: 'Remove surrounding whitespace.',
    signatures: [{ parameters: [string], result: string }],
    execute: ([text]) => ({ value: (text as string).trim() }),
  },
  {
    name: 'replace',
    usage: 'replace <old> <new> <text>',
    description: 'Replace literal occurrences.',
    signatures: [{ parameters: [string, string, string], result: string }],
    execute: ([old, replacement, text]) => {
      if (old === '') throw new Error('Search text must not be empty.');
      const source = text as string,
        needle = old as string,
        next = replacement as string;
      const count = source.split(needle).length - 1;
      if (source.length + count * (next.length - needle.length) > 250_000)
        throw new Error('Value size limit exceeded.');
      return { value: source.split(needle).join(next) };
    },
  },
  {
    name: 'slice',
    usage: 'slice <start> <end> <text>',
    description: 'Extract a substring.',
    details: 'Unicode code-point indices, start inclusive and end exclusive.',
    signatures: [{ parameters: [number, number, string], result: string }],
    execute: ([start, end, text]) => {
      const chars = Array.from(text as string);
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        (start as number) < 0 ||
        (end as number) < (start as number) ||
        (end as number) > chars.length
      )
        throw new Error('Substring bounds out of range.');
      return { value: chars.slice(start as number, end as number).join('') };
    },
  },
  {
    name: 'match',
    usage: 'match <pattern> <text>',
    description: 'Find regex matches.',
    details:
      'Uses RE2JS with RE2 syntax: https://github.com/google/re2/wiki/Syntax . Returns full matches; no lookaround or backreferences.',
    signatures: [{ parameters: [string, string], result: list(string) }],
    execute: ([pattern, text]) => ({ value: matchText(pattern as string, text as string) }),
  },
  {
    name: 'append',
    usage: 'append <list> <value>',
    description: 'Return an extended list.',
    signatures: [{ parameters: [list(generic), generic], result: list(generic) }],
    execute: ([values, value]) => {
      if ((values as Value[]).length >= 10_000) throw new Error('List size limit exceeded.');
      return { value: [...(values as Value[]), value] };
    },
  },
  {
    name: 'count',
    usage: 'count <text|list>',
    description: 'Count characters or elements.',
    signatures: [
      { parameters: [string], result: number },
      { parameters: [list(generic)], result: number },
    ],
    execute: ([value]) => ({
      value: typeof value === 'string' ? Array.from(value).length : (value as Value[]).length,
    }),
  },
  {
    name: 'from-json',
    usage: 'from-json<Type> <text>',
    description: 'Parse typed JSON.',
    signatures: [{ parameters: [string], result: generic, typeParameter: true }],
    execute: ([text], _system, type) => ({
      value: validateValue(JSON.parse(text as string), type!),
    }),
  },
];
