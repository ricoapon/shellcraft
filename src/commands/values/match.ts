import type { Command } from '../command';
import { list, string } from '../../runtime/types';
import { matchText } from '../../runtime/regex';
export const match: Command = {
  name: 'match',
  usage: 'match <pattern> <text>',
  description: 'Find regex matches.',
  details:
    'Uses RE2JS with RE2 syntax: https://github.com/google/re2/wiki/Syntax . Returns full matches; no lookaround or backreferences.',
  signatures: [{ parameters: [string, string], result: list(string) }],
  execute: ([pattern, text]) => ({ value: matchText(pattern as string, text as string) }),
};
