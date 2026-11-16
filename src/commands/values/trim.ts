import type { Command } from '../command';
import { string } from '../../runtime/types';
export const trim: Command = {
  name: 'trim',
  usage: 'trim <text>',
  description: 'Remove surrounding whitespace.',
  signatures: [{ parameters: [string], result: string }],
  execute: ([text]) => ({ value: (text as string).trim() }),
};
