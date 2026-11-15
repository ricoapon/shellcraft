import { requireArguments, type Command } from './command';

export const trap: Command = {
  name: 'trap',
  usage: 'trap <host> <tick>',
  description: 'Arm a process trap.',
  details: 'Arm a future process interception.',
  unlocked: (system) => ['moving'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 2, trap.usage!);
    return [system.mission.action({ type: 'trap', host: args[0], tick: Number(args[1]) })];
  },
};
