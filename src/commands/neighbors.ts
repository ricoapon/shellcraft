import { stringArguments, type Command } from './command';
import { list, string } from '../runtime/types';
export const neighbors: Command = {
  name: 'neighbors',
  usage: 'neighbors [host]',
  description: 'Discover connected hosts.',
  signatures: [{ parameters: [string], minimum: 0, result: list(string) }],
  unlocked: (system) => system.mission.current()?.kind === 'network',
  execute: (args, system) => ({
    value: [...system.network.neighbors(stringArguments(args)[0])].sort(),
  }),
};
