import { requireArguments, type Command } from './command';

export const queue: Command = {
  name: 'queue',
  usage: 'queue <host>',
  description: 'Queue a release commit.',
  details: 'Queue a release commit for the next simulation tick.',
  unlocked: (system) => ['coordination'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 1, queue.usage!);
    return [system.mission.action({ type: 'queue', host: args[0] })];
  },
};
