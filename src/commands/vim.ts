import { requireArguments, type Command } from './command';

export const vim: Command = {
  name: 'vim',
  usage: 'vim <home-path>',
  description: 'Edit a home file in Vim mode.',
  details:
    'Open a home file with Vim bindings. :w saves, :q quits, :q! discards, :wq/:x saves/quits, :run saves/quits/runs.',
  execute(args, system) {
    requireArguments(args, 1, vim.usage!);
    system.editor.open(args[0], true);
    return [];
  },
};
