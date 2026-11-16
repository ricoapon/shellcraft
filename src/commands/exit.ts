import { textSignature, type Command } from './command';
export const exit: Command = {
  name: 'exit',
  usage: 'exit',
  description: 'Return to the previous host.',
  details: 'At the level entry, use mission leave.',
  signatures: [textSignature()],
  execute(_args, system) {
    system.session.exit();
    return {};
  },
};
