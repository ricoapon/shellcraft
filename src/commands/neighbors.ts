import { requireArguments, type Command } from './command';
export const neighbors: Command = {
  name: 'neighbors',
  usage: 'neighbors [host]',
  description: 'Discover connected hosts.',
  unlocked: (system) => system.mission.current()?.kind === 'network',
  execute(args, system) {
    requireArguments(args, 0, neighbors.usage!, 1);
    return system.network.neighbors(args[0]);
  },
};
