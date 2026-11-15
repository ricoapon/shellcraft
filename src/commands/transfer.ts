import { requireArguments, type Command } from './command';

export const transfer: Command = {
  name: 'transfer',
  usage: 'transfer <from> <to> <amount>',
  description: 'Transfer processing work.',
  details: 'Transfer workload over a bandwidth-limited simulated link.',
  unlocked: (system) => ['thermal'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 3, transfer.usage!);
    return [
      system.mission.action({
        type: 'transfer',
        from: args[0],
        to: args[1],
        amount: Number(args[2]),
      }),
    ];
  },
};
