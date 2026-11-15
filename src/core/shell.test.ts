import { describe, expect, it } from 'vitest';
import { echo } from '../commands/echo';
import { clear } from '../commands/clear';
import { parseCommand } from './parse';
import { Shell, MAX_ENTRIES } from './shell';
import type { ShellState } from './shell';
import { GameEngine } from '../game/engine';

describe('command grammar', () => {
  it('handles whitespace, quoted arguments, empty arguments, and escapes', async () => {
    expect(parseCommand(` echo "hello world" '' one\\ two 'literal\\path' `)).toEqual([
      'echo',
      'hello world',
      '',
      'one two',
      'literal\\path',
    ]);
    expect(parseCommand('echo pre"middle"post')).toEqual(['echo', 'premiddlepost']);
  });

  it('rejects incomplete input rather than executing it', async () => {
    expect(() => parseCommand('echo "unfinished')).toThrow('Unclosed quote');
    expect(() => parseCommand('echo trailing\\')).toThrow('Incomplete escape');
  });
});

describe('shell', () => {
  const system = new GameEngine().system;
  const shell = new Shell([echo], system);

  it('executes a command without mutating the previous state', async () => {
    const before: ShellState = { entries: [] };
    const after = await shell.execute(before, 'echo "hello world"');
    expect(after.entries).toEqual([{ input: 'echo "hello world"', output: ['hello world'] }]);
    expect(before.entries).toEqual([]);
    expect(await shell.execute(before, '   ')).toBe(before);
  });

  it('keeps errors in the transcript and allows subsequent commands', async () => {
    let state = await shell.execute({ entries: [] }, 'missing');
    state = await shell.execute(state, 'echo "unfinished');
    state = await shell.execute(state, 'echo recovered');
    expect(state.entries.map((entry) => entry.output[0])).toEqual([
      'Unknown command: missing. Run help for available commands.',
      'Unclosed quote.',
      'recovered',
    ]);
  });

  it('contains command failures and rejects ambiguous registrations', async () => {
    const broken = {
      name: 'broken',
      execute: () => {
        throw new Error('Example failure');
      },
    };
    expect(
      (await new Shell([broken], system).execute({ entries: [] }, 'broken')).entries[0].output,
    ).toEqual(['Example failure']);
    expect(() => new Shell([echo, echo], system)).toThrow('Duplicate command');
  });

  it('distinguishes no output from an intentional blank line', async () => {
    const quiet = new Shell([{ name: 'quiet', execute: () => [] }, echo], system);
    expect((await quiet.execute({ entries: [] }, 'quiet')).entries[0].output).toEqual([]);
    expect((await quiet.execute({ entries: [] }, 'echo')).entries[0].output).toEqual(['']);
  });

  it('records the directory supplied before executing a command', async () => {
    expect((await shell.execute({ entries: [] }, 'echo hello', '/home/notes')).entries[0]).toEqual({
      input: 'echo hello',
      output: ['hello'],
      workingDirectory: '/home/notes',
    });
  });

  it('bounds retained history', async () => {
    let state: ShellState = { entries: [] };
    for (let index = 0; index <= MAX_ENTRIES; index++) {
      state = await shell.execute(state, `echo ${index}`);
    }
    expect(state.entries).toHaveLength(MAX_ENTRIES);
    expect(state.entries[0].input).toBe('echo 1');
  });

  it('clears the transcript and accepts subsequent commands', async () => {
    const shell = new Shell([echo, clear], system);
    const before = await shell.execute({ entries: [] }, 'echo before');
    const cleared = await shell.execute(before, 'clear');
    expect(cleared.entries).toEqual([]);
    expect(before.entries).toHaveLength(1);
    expect((await shell.execute(cleared, 'echo after')).entries).toEqual([
      { input: 'echo after', output: ['after'] },
    ]);
  });

  it('reports clear argument errors without clearing existing output', async () => {
    const shell = new Shell([echo, clear], system);
    const before = await shell.execute({ entries: [] }, 'echo before');
    const after = await shell.execute(before, 'clear extra');
    expect(after.entries).toHaveLength(2);
    expect(after.entries[1].output).toEqual(['Usage: clear']);
  });
});
