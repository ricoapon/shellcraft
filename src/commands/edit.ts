import { stringArguments, textSignature, type Command } from './command';
export const edit: Command = {
  name: 'edit',
  usage: 'edit <workspace-path>',
  description: 'Edit a workspace file.',
  details: 'Ctrl+S saves/exits; Ctrl+Q discards/exits; Ctrl+Enter saves/exits/runs.',
  example: 'edit /home/solve.sc',
  signatures: [textSignature(1, 1, true)],
  execute(args, system) {
    system.editor.open(stringArguments(args)[0], false);
    return {};
  },
};
