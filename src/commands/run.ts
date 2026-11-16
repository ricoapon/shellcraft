import { stringArguments, type Command } from './command';
import { nothing, string } from '../runtime/types';
export const run: Command = {
  name: 'run',
  usage: 'run <workspace-path> [args...]',
  description: 'Run a Shellcraft script.',
  details:
    'Executes .sc source in a fresh variable scope. Commands and navigation behave exactly as in the shell.',
  example: 'run /home/solve.sc',
  signatures: [
    {
      completion: [{ kind: 'path', scope: 'workspace', extension: '.sc' }],
      parameters: [string],
      rest: string,
      result: nothing,
      terminalOnly: true,
    },
  ],
  execute: async (args, system) => {
    const [path, ...values] = stringArguments(args);
    await system.scripts.run(path, values);
    return {};
  },
};
