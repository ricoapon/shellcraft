import { requireArguments, type Command } from './command';

export const exit: Command = {
  name: 'exit',
  usage: 'exit',
  description: 'Return to the previous host.',
  details: 'Return to the previous connection and its directory.',
  execute(args, system) {
    requireArguments(args, 0, exit.usage!);
    system.session.exit();
    return ['Connected to ' + system.session.host() + '.'];
  },
};
