import { expect, it } from 'vitest';
import { CommandRegistry } from './registry';
import { GameEngine } from '../game/engine';
import type { Command } from './command';

it('checks live availability without running a locked command', () => {
  let unlocked = false;
  let calls = 0;
  const system = { ...new GameEngine().system, capabilities: { has: () => unlocked } };
  const registry = new CommandRegistry(
    [
      {
        name: 'example',
        unlocked: (context) => context.capabilities.has('scripting'),
        execute(args) {
          calls++;
          return [...args];
        },
      },
    ],
    system,
  );
  expect(registry.has('example')).toBe(true);
  expect(registry.available()).toEqual([]);
  expect(() => registry.execute('example', ['value'])).toThrow('Command locked');
  expect(calls).toBe(0);
  unlocked = true;
  expect(registry.available().map((command) => command.name)).toEqual(['example']);
  expect(registry.execute('example', ['value'])).toEqual(['value']);
  expect(calls).toBe(1);
});

it('supports asynchronous commands and rejects duplicate or unknown names', async () => {
  const system = new GameEngine().system;
  const command: Command = {
    name: 'async',
    async execute(args, context) {
      return [context.session.host(), ...args];
    },
  };
  const registry = new CommandRegistry([command], system);
  expect(await registry.execute('async', ['argument'])).toEqual(['home', 'argument']);
  expect(() => registry.execute('missing', [])).toThrow('Unknown command: missing');
  expect(() => new CommandRegistry([command, command], system)).toThrow('Duplicate command');
});

it('registers and unloads player commands without changing reserved built-in names', () => {
  const registry = new CommandRegistry(
    [{ name: 'built-in', execute: () => [] }],
    new GameEngine().system,
  );
  registry.register({ name: 'player', execute: () => ['ok'] });
  expect(registry.execute('player', [])).toEqual(['ok']);
  expect(() => structuredClone(registry.available())).not.toThrow();
  expect(() => registry.register({ name: 'built-in', execute: () => [] })).toThrow(
    'Duplicate command',
  );
  expect(() => registry.unregister('built-in')).toThrow('Cannot remove');
  registry.unregister('player');
  expect(registry.has('player')).toBe(false);
  expect(registry.isBuiltin('built-in')).toBe(true);
});
