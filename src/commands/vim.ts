import { stringArguments, textSignature, type Command } from './command';
export const vim: Command = {
  name: 'vim',
  usage: 'vim <workspace-path>',
  description: 'Edit a file with Vim bindings.',
  details: ':w saves, :q quits, :q! discards, :wq/:x saves/quits, :run saves/quits/runs.',
  signatures: [
    { ...textSignature(1, 1, true), completion: [{ kind: 'path', scope: 'workspace' }] },
  ],
  execute(args, system) {
    system.editor.open(stringArguments(args)[0], true);
    return {};
  },
};
