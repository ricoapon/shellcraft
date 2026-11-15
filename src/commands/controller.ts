import { type Command } from './command';

export const controller: Command = {
  name: 'controller',
  usage: 'controller add <path> [id] | on <id> | off <id> | remove <id> | list',
  description: 'Manage automation controllers.',
  details: 'Manage short per-tick controllers in saved execution order.',
  unlocked: (system) => system.capabilities.has('controllers'),
  async execute(args, system) {
    const [action, value] = args;
    if (action === 'list' && args.length === 1)
      return system.controllers
        .list()
        .map((item) => `${item.id}: ${item.enabled ? 'on' : 'off'} ${item.error ?? ''}`);
    if (['on', 'off', 'remove'].includes(action) && args.length === 2) {
      if (action === 'remove') system.controllers.remove(value);
      else system.controllers.enable(value, action === 'on');
      return [];
    }
    if (action === 'add' && args.length >= 2 && args.length <= 3) {
      const id = await system.controllers.add(value, args[2]);
      return [
        'Controller ' +
          id +
          ' enabled. Use simulation pause, simulation resume, and simulation step to inspect its decisions.',
      ];
    }
    throw new Error('Usage: ' + controller.usage);
  },
};
