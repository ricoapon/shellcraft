import { describe, expect, it } from 'vitest';
import { Shell, MAX_ENTRIES } from './shell';
import type { ShellState } from './shell';
import { GameEngine } from '../game/engine';
import { builtinCommands } from '../commands';
import { nothing } from '../runtime/types';
describe('shared shell', () => {
  const make = () => new Shell(builtinCommands, new GameEngine().system);
  it('keeps prior transcript immutable and captures structured results', async () => {
    const shell = make(),
      before: ShellState = { entries: [] };
    const after = await shell.execute(before, 'let files = (ls /home); echo (count $files)');
    expect(before.entries).toEqual([]);
    expect(after.entries[0].output.join()).toMatch(/\d/);
    expect(await shell.execute(before, ' ')).toBe(before);
  });
  it('reports located errors and recovers on the next submission', async () => {
    const shell = make();
    expect((await shell.submit('unknown')).output?.join()).toContain('Unknown command');
    expect((await shell.submit('echo "unfinished')).output?.join()).toContain('Unclosed quote');
    expect((await shell.submit('echo recovered')).output).toEqual(['recovered']);
  });
  it('typechecks complete submissions before changing the filesystem', async () => {
    const shell = make();
    const r = await shell.submit('write /home/nope test; let x: number = "bad"');
    expect(r.output?.join()).toContain('Expected number');
    expect((await shell.submit('cat /home/nope')).output?.join()).toContain('Path not found');
  });
  it('supports persistent declarations, blocks, and replacement', async () => {
    const shell = make();
    await shell.submit('let x = 1');
    await shell.submit('let x = "new"');
    expect((await shell.submit('echo $x')).output).toEqual(['new']);
    await shell.submit('if true { let local = 2 }');
    expect((await shell.submit('echo $local')).output?.join()).toContain('Unknown variable');
  });
  it('contains command failures and rejects duplicate registrations', async () => {
    const command = {
      name: 'broken',
      signatures: [{ parameters: [], result: nothing }],
      execute: () => {
        throw new Error('Example failure');
      },
    };
    expect(
      (await new Shell([command], new GameEngine().system).submit('broken')).output?.join(),
    ).toContain('Example failure');
    expect(() => new Shell([command, command], new GameEngine().system)).toThrow(
      'Duplicate command',
    );
  });
  it('distinguishes void, empty strings, and empty lists', async () => {
    const shell = make();
    expect((await shell.submit('echo ""')).output).toEqual(['']);
    expect((await shell.submit('let empty: list<string> = []; echo $empty')).output).toEqual([
      '[]',
    ]);
    expect((await shell.submit('let x = 1')).output).toEqual([]);
  });
  it('bounds ephemeral history and clears it', async () => {
    const shell = make();
    let state: ShellState = { entries: [] };
    for (let i = 0; i <= MAX_ENTRIES; i++) state = await shell.execute(state, 'echo ' + i);
    expect(state.entries).toHaveLength(MAX_ENTRIES);
    expect((await shell.execute(state, 'clear')).entries).toEqual([]);
  });
});
