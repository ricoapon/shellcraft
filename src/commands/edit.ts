import { requireArguments, type Command } from './command';

export const edit: Command = {
  name: 'edit',
  usage: 'edit <home-path>',
  description: 'Edit a home file.',
  details:
    'Open a home file in the text editor. Ctrl+S saves/exits; Ctrl+Q discards/exits; Ctrl+Enter saves/exits/runs.',
  example: 'edit /home/scripts/search.js',
  execute(args, system) {
    requireArguments(args, 1, edit.usage!);
    system.editor.open(args[0], false);
    return [];
  },
};
