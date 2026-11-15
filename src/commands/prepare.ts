import { requireArguments, type Command } from './command';

export const prepare: Command = {
  name: 'prepare',
  usage: 'prepare <host> r2',
  description: 'Prepare a release.',
  details: 'Stage a coordinated release.',
  unlocked: (system) => ['coordination'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 2, prepare.usage!);
    return [system.mission.action({ type: 'prepare', host: args[0], release: args[1] })];
  },
};
