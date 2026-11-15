import { requireArguments, type Command } from './command';

export const link: Command = {
  name: 'link',
  usage: 'link <from> <to> <on|off>',
  description: 'Enable or disable a link.',
  details: 'Change an allowed mission link.',
  unlocked: (system) => ['traffic', 'isolation'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    requireArguments(args, 3, link.usage!);
    if (!['on', 'off'].includes(args[2])) throw new Error('Use on or off.');
    return [
      system.mission.action({
        type: 'link',
        from: args[0],
        to: args[1],
        enabled: args[2] === 'on',
      }),
    ];
  },
};
