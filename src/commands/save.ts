import { stringArguments, type Command } from './command';
import { nothing } from '../runtime/types';
export const save: Command = {
  name: 'save',
  usage: 'save <export|import>',
  description: 'Import or export a save.',
  signatures: ['export', 'import'].map((prefix) => ({
    prefix: [prefix],
    parameters: [],
    result: nothing,
    terminalOnly: true,
  })),
  execute(args) {
    const [action] = stringArguments(args);
    if (action !== 'export' && action !== 'import') throw new Error('Usage: save <export|import>');
    return { action };
  },
};
