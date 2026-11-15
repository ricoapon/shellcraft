import type { Command } from './command';

export const clear: Command = {
  name: 'clear',
  description: 'Clear the screen and saved transcript.',
  usage: 'clear',
  execute(args) {
    if (args.length) throw new Error('Usage: clear');
    return { clearScreen: true };
  },
};
