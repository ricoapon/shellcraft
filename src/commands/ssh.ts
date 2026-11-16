import { stringArguments, textSignature, type Command } from './command';
export const ssh: Command = {
  name: 'ssh',
  usage: 'ssh <host>',
  description: 'Connect to a neighboring host.',
  details: 'Home is outside the network; use mission leave to return to your workspace.',
  signatures: [{ ...textSignature(1), completion: [{ kind: 'host' }] }],
  unlocked: (system) => system.mission.current()?.kind === 'network',
  execute(args, system) {
    system.session.connect(stringArguments(args)[0]);
    return {};
  },
};
