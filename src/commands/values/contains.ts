import type { Command } from '../command';
import { bool, equal, generic, list, string } from '../../runtime/types';
import type { Value } from '../../runtime/types';
export const contains: Command = {
  name: 'contains',
  usage: 'contains <text|list> <part|element>',
  description: 'Test substring or list membership.',
  details: 'Use $name for variables and double quotes for text. Bare words are not text values.',
  example: 'contains $content "PASSWORD"',
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
};
