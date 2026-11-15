import { requireArguments, type Command } from './command';

export const save: Command = {
  name: 'save',
  usage: 'save <export|import>',
  description: 'Import or export a save.',
  details: 'Export a local backup or select an exported save to restore.',
  execute(args) {
    requireArguments(args, 1, save.usage!);
    if (args[0] !== 'export' && args[0] !== 'import') throw new Error('Usage: ' + save.usage);
    return { action: args[0] };
  },
};
