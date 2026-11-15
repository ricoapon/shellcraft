import { requireArguments, type Command } from './command';

export const ssh: Command = {
  name: 'ssh',
  usage: 'ssh <host>',
  description: 'Connect to a host.',
  details: 'Connect to a neighboring discovered host. Home is always reachable.',
  execute(args, system) {
    requireArguments(args, 1, ssh.usage!);
    system.session.connect(args[0]);
    return ['Connected to ' + system.session.host() + '.'];
  },
};
