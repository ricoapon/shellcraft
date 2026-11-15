import type { Command } from './command';
import { capabilityHelp } from '../content/player-support';

export const upgrade: Command = {
  name: 'upgrade',
  description: 'Browse and buy upgrades.',
  details:
    'List token costs, ownership, and prerequisites, or buy a permanent capability. Defaults to list. Buying an owned upgrade does not charge tokens again.',
  usage: 'upgrade list | buy <capability>',
  example: 'upgrade buy scripting',
  execute(args, system) {
    if (!args.length || (args[0] === 'list' && args.length === 1))
      return [
        system.upgrades.tokens() + ' tokens available.',
        ...system.upgrades
          .list()
          .map(
            (item) =>
              `${item.owned ? '✓' : item.available ? '→' : '·'} ${item.id.padEnd(12)} ${item.cost} tokens · after mission ${item.after} · ${item.description}`,
          ),
        '✓ owned; → ready to buy; · prerequisites or tokens needed. Buy with upgrade buy <capability>.',
      ];
    if (args[0] === 'buy' && args.length === 2) {
      const owned = system.capabilities.has(args[1]);
      const result = system.upgrades.buy(args[1]);
      return [
        result,
        ...(!owned && capabilityHelp[args[1]]
          ? [capabilityHelp[args[1]], 'Run help to see newly available commands.']
          : []),
      ];
    }
    throw new Error('Usage: ' + upgrade.usage);
  },
};
