import { requireArguments, type Command } from './command';

export const service: Command = {
  name: 'service',
  usage: 'service <host> restart',
  description: 'Restart a service.',
  details: 'Restart a mission service after correcting its dependencies/configuration.',
  unlocked: (system) => ['service'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 2, service.usage!);
    if (args[1] !== 'restart') throw new Error('Usage: ' + service.usage);
    return [system.mission.action({ type: 'restart', host: args[0] })];
  },
};
