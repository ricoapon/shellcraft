import { requireArguments, type Command } from './command';

export const startup: Command = {
  name: 'startup',
  usage: 'startup <path> | reload | off',
  description: 'Manage your startup module.',
  details: 'Load/reload a module exporting setup(ctx), or disable startup registrations.',
  unlocked: (system) => system.capabilities.has('commands'),
  async execute(args, system) {
    requireArguments(args, 1, startup.usage!);
    if (args[0] === 'off') {
      system.startup.disable();
      return ['Startup disabled.'];
    }
    const path =
      args[0] === 'reload' ? await system.startup.reload() : await system.startup.load(args[0]);
    return ['Loaded startup module ' + path + '. Registrations will be restored on reload.'];
  },
};
