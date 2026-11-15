import { requireArguments, type Command } from './command';

export const reach: Command = {
  name: 'reach',
  usage: 'reach <from> <to>',
  description: 'Check host reachability.',
  details: 'Check current network reachability without mutating it.',
  execute(args, system) {
    requireArguments(args, 2, reach.usage!);
    return [String(system.network.reachable(args[0], args[1]))];
  },
};
