import { textSignature, type Command } from './command';
export const clear: Command = {
  name: 'clear',
  usage: 'clear',
  description: 'Clear the terminal.',
  signatures: [textSignature(0, 0, true)],
  execute: () => ({ clearScreen: true }),
};
