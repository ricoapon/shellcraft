import type { Command } from '../command';
import { list, number, string } from '../../runtime/types';
import { matchText } from '../../runtime/regex';
export const match: Command = {
  name: 'match',
  usage: 'match <pattern> <text> [group]',
  description: 'Find regex matches.',
  details:
    'Uses RE2JS with RE2 syntax: https://github.com/google/re2/wiki/Syntax . Returns a list in match order. Omit group or use 0 for full matches; 1, 2, etc. select capture groups. No matches returns []; an unmatched optional group returns an empty string. Group must be an existing non-negative integer. No lookaround or backreferences.',
  example: 'match "release=(r[0-9]+)" "release=r42" 1',
  signatures: [{ parameters: [string, string, number], minimum: 2, result: list(string) }],
  execute: ([pattern, text, group]) => ({
    value: matchText(pattern as string, text as string, group as number | undefined),
  }),
};
