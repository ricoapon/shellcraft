import { requireArguments, type Command } from './command';

export const help: Command = {
  name: 'help',
  description: 'List available commands.',
  details:
    'Use help <command> for usage, details, and examples. Only unlocked commands are listed.',
  usage: 'help [command]',
  execute(args, system) {
    requireArguments(args, 0, help.usage!, 1);
    const commands = system.commands.list();
    if (args[0]) {
      const command = commands.find((command) => command.name === args[0]);
      if (!command) throw new Error('Unknown command: ' + args[0]);
      return [
        'Usage: ' + (command.usage ?? command.name),
        ...(command.description ? [command.description] : []),
        ...(command.details ? [command.details] : []),
        ...(command.example ? ['Example: ' + command.example] : []),
      ];
    }
    return [
      ...[...commands]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((command) =>
          command.description ? command.name + ' — ' + command.description : command.name,
        ),
      'Run help <command> for more information.',
    ];
  },
};
