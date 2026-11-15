import { requireArguments, type Command } from './command';

export const inspect: Command = {
  name: 'inspect',
  usage: 'inspect [host]',
  description: 'Inspect a host.',
  details: 'Collect structured information about a reachable host.',
  execute(args, system) {
    requireArguments(args, 0, inspect.usage!, 1);
    return [JSON.stringify(system.network.inspect(args[0]), null, 2)];
  },
};
