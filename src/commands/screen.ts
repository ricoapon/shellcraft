import { type Command } from './command';

export const screen: Command = {
  name: 'screen',
  usage:
    'screen add <path> [id] | close <id> | list | layout <split|tabs> | focus <id> | refresh <ms>',
  description: 'Manage custom screens.',
  details: 'Add a player-defined screen or manage saved panels.',
  example: 'screen add /home/screens/network.js',
  unlocked: (system) => system.capabilities.has('screens'),
  async execute(args, system) {
    const [action, value] = args;
    if (action === 'list' && args.length === 1)
      return system.screens.list().map((panel) => panel.id + ': ' + panel.path);
    if (action === 'close' && args.length === 2) {
      system.screens.close(value);
      return [];
    }
    if (action === 'layout' && args.length === 2 && (value === 'tabs' || value === 'split')) {
      system.screens.layout(value);
      return [];
    }
    if (action === 'focus' && args.length === 2) {
      system.screens.focus(value);
      return [];
    }
    if (action === 'refresh' && args.length === 2) {
      system.screens.refresh(Number(value));
      return [`Screens refresh every ${value} ms during playback, and after game operations.`];
    }
    if (action === 'add' && args.length >= 2 && args.length <= 3) {
      const id = await system.screens.add(value, args[2]);
      return ['Screen ' + id + ' added.'];
    }
    throw new Error('Usage: ' + screen.usage);
  },
};
