import { stringArguments, type Command } from './command';
import { list, string } from '../runtime/types';
export const help: Command = {
  name: 'help',
  description: 'List available commands.',
  usage: 'help [command]',
  details: 'Only available commands appear. Detailed help shows usage, details, and examples.',
  signatures: [
    { completion: [{ kind: 'command' }], parameters: [string], minimum: 0, result: list(string) },
  ],
  execute(args, system) {
    const [name] = stringArguments(args),
      commands = system.commands.list();
    if (name) {
      const command = commands.find((c) => c.name === name);
      if (!command) throw new Error('Unknown command: ' + name);
      return {
        value: [
          'Usage: ' + (command.usage ?? command.name),
          ...(command.description ? [command.description] : []),
          ...(command.details ? [command.details] : []),
          ...(command.example ? ['Example: ' + command.example] : []),
        ],
      };
    }
    return {
      value: [
        ...[...commands]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (c.description ? c.name + ' — ' + c.description : c.name)),
        'Run help <command> for more information.',
      ],
    };
  },
};
