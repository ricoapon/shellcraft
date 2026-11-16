import type { Command } from '../command';
import { list, string } from '../../runtime/types';
export const join: Command = {
  name: 'join',
  usage: 'join <separator> <strings>',
  description: 'Join strings.',
  signatures: [{ parameters: [string, list(string)], result: string }],
  execute: ([separator, values]) => ({ value: (values as string[]).join(separator as string) }),
};
