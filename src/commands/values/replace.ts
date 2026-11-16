import type { Command } from '../command';
import { string } from '../../runtime/types';
export const replace: Command = {
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
};
