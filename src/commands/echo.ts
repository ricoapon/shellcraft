import type { Command } from './command';

/** A minimal example command using the same boundary as game commands. */
export const echo: Command = {
  name: 'echo',
  description: 'Print text.',
  usage: 'echo [text...]',
  execute: (args) => [args.join(' ')],
};
