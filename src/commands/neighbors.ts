import { requireArguments, type Command } from './command';

export const neighbors: Command = {
  name: 'neighbors',
  usage: 'neighbors [host]',
  description: 'Discover neighboring hosts.',
  details: 'Discover adjacent host IDs.',
  execute(args, system) {
    requireArguments(args, 0, neighbors.usage!, 1);
    return system.network.neighbors(args[0]);
  },
};
