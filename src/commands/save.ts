import { commandHelp, stringArguments, type Command } from './command';
import { list, nothing, string } from '../runtime/types';
export const save: Command = {
  name: 'save',
  usage: 'save [export|import|reset]',
  description: 'Manage your save.',
  details:
    'Without arguments, show this help. Export a backup, import a save, or reset to a fresh workstation. Reset asks for confirmation and permanently removes workspace files, progress, stars, and drafts. Export a backup first.',
  example: 'save export',
  signatures: [
    { parameters: [], result: list(string), terminalOnly: true },
    ...['export', 'import', 'reset'].map((prefix) => ({
      prefix: [prefix],
      parameters: [],
      result: nothing,
      terminalOnly: true,
    })),
  ],
  execute(args) {
    const [action] = stringArguments(args);
    if (!action) return { value: commandHelp(save) };
    if ((action !== 'export' && action !== 'import' && action !== 'reset') || args.length !== 1)
      throw new Error(commandHelp(save).join('\n'));
    return { action };
  },
};
