import type { Command } from '../command';
import { list, string } from '../../runtime/types';
export const split: Command = {
  name: 'split',
  usage: 'split <separator> <text>',
  description: 'Split text into strings.',
  signatures: [{ parameters: [string, string], result: list(string) }],
  execute: ([separator, text]) => {
    if (separator === '') throw new Error('Separator must not be empty.');
    return { value: (text as string).split(separator as string) };
  },
};
