import { requireArguments, type Command } from './command';

export const run: Command = {
  name: 'run',
  usage: 'run <home-path> [args...]',
  description: 'Run a saved script.',
  details:
    'Run a JavaScript module from /home, even while connected remotely. Export main(ctx,args); arguments after the path are forwarded as strings. Imports resolve within /home. Requires the scripting upgrade.',
  example: 'run /home/scripts/search.js KEY /archive',
  unlocked: (system) => system.capabilities.has('scripting'),
  execute(args, system) {
    requireArguments(args, 1, run.usage!, 100);
    return system.scripts.run(args[0], args.slice(1)).then(() => []);
  },
};
