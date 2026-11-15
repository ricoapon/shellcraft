import { expect, it } from 'vitest';
import { echo } from './echo';
import { help } from './help';
import { CommandRegistry } from './registry';
import type { Command } from './command';
import type { CommandSystem } from './system';
import { parseCommand } from '../core/parse';
import { GameEngine } from '../game/engine';

function setup(extra: Command[] = [], unlocked = () => true) {
  const system: CommandSystem = {
    ...new GameEngine().system,
    commands: { list: () => registry.available() },
    capabilities: { has: unlocked },
  };
  const registry = new CommandRegistry([echo, help, ...extra], system);
  return async (input: string) => {
    const [name, ...args] = parseCommand(input);
    try {
      return await registry.execute(name, args);
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  };
}

it('lists short descriptions in order and explains how to request detailed help', async () => {
  const run = setup([{ name: 'zeta', execute: () => [] }]);
  expect(await run('help')).toEqual([
    'echo — Print text.',
    'help — List available commands.',
    'zeta',
    'Run help <command> for more information.',
  ]);
});

it('shows usage, description, details, and examples only in command-specific help', async () => {
  const run = setup([
    {
      name: 'sample',
      description: 'A short summary.',
      details: 'Detailed instructions.',
      usage: 'sample <value>',
      example: 'sample hello',
      execute: () => [],
    },
  ]);
  expect(await run('help sample')).toEqual([
    'Usage: sample <value>',
    'A short summary.',
    'Detailed instructions.',
    'Example: sample hello',
  ]);
  expect(((await run('help')) as string[]).join('\n')).not.toContain('Detailed instructions.');
  expect(await run('help echo')).toEqual(['Usage: echo [text...]', 'Print text.']);
});

it('hides locked commands in both overview and detailed help, then reveals them on unlock', async () => {
  let unlocked = false;
  const run = setup(
    [
      {
        name: 'secret',
        unlocked: (system) => system.capabilities.has('scripting'),
        execute: () => [],
      },
    ],
    () => unlocked,
  );
  expect(((await run('help')) as string[]).join('\n')).not.toContain('secret');
  expect(await run('help secret')).toEqual(['Unknown command: secret']);
  unlocked = true;
  expect(await run('help secret')).toEqual(['Usage: secret']);
});

it('reports unknown commands and invalid help syntax without executing anything', async () => {
  let executed = false;
  const run = setup([
    {
      name: 'bare',
      execute: () => {
        executed = true;
        return [];
      },
    },
  ]);
  expect(await run('help bare')).toEqual(['Usage: bare']);
  expect(executed).toBe(false);
  expect(await run('help missing')).toEqual(['Unknown command: missing']);
  expect(await run('help echo extra')).toEqual(['Usage: help [command]']);
});
