import { requireArguments, type Command } from './command';
export const ssh: Command = {
  name: 'ssh',
  usage: 'ssh <host>',
  description: 'Connect to a neighboring host.',
  details:
    'Move within the current level network. Home is outside it; use mission leave to return to your workspace.',
  unlocked: (system) => system.mission.current()?.kind === 'network',
  execute(args, system) {
    requireArguments(args, 1, ssh.usage!);
    system.session.connect(args[0]);
    return ['Connected to ' + system.session.host() + '.'];
  },
};
