import { requireArguments, type Command } from './command';
export const run: Command = {
  name: 'run',
  usage: 'run <workspace-path> [args...]',
  description: 'Run your saved JavaScript.',
  details:
    'Run a module from your personal /home code workspace. Export main(ctx,args). ctx.fs reads the current host. Imports resolve only within /home. Scripting is available from the start.',
  example: 'run /home/solve.js',
  unlocked: (system) => system.capabilities.has('scripting'),
  execute(args, system) {
    requireArguments(args, 1, run.usage!, 100);
    return system.scripts.run(args[0], args.slice(1)).then(() => []);
  },
};
