import { expect, it } from 'vitest';
import { CommandRegistry } from './registry';
import { GameEngine } from '../game/engine';
import { nothing, string } from '../runtime/types';
it('checks live availability and preserves structured results', async () => {
  let unlocked = false,
    calls = 0;
  const command = {
    name: 'example',
    signatures: [{ parameters: [string], result: string }],
    unlocked: () => unlocked,
    execute(args: readonly import('../runtime/types').Value[]) {
      calls++;
      return { value: args[0] };
    },
  };
  const registry = new CommandRegistry([command], new GameEngine().system);
  expect(registry.available()).toEqual([]);
  expect(() => registry.execute('example', ['value'])).toThrow('locked');
  expect(calls).toBe(0);
  unlocked = true;
  expect(registry.execute('example', ['value'])).toEqual({ value: 'value' });
  expect(calls).toBe(1);
});
it('supports async commands and rejects duplicate/unknown names', async () => {
  const command = {
    name: 'async',
    signatures: [{ parameters: [], result: nothing }],
    async execute() {
      return {};
    },
  };
  const registry = new CommandRegistry([command], new GameEngine().system);
  expect(await registry.execute('async', [])).toEqual({});
  expect(() => registry.execute('missing', [])).toThrow('Unknown command');
  expect(() => new CommandRegistry([command, command], new GameEngine().system)).toThrow(
    'Duplicate command',
  );
  expect(() => structuredClone(registry.available())).not.toThrow();
});
