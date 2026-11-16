import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
it('lists brief command descriptions and ends with the detailed-help hint', async () => {
  const g = new GameEngine();
  const text = (await g.execute('help')).output.join('\n');
  expect(text).toContain('contains');
  expect(text).toContain('Run help <command>');
  expect(text).not.toContain('ssh \u2014');
});
it('shows details and examples only in detailed help', async () => {
  const g = new GameEngine();
  const text = (await g.execute('help edit')).output.join();
  expect(text).toContain('Usage: edit');
  expect(text).toContain('Ctrl+S');
  expect(text).toContain('/home/solve.sc');
});
it('hides unavailable commands in overview and detailed help', async () => {
  const g = new GameEngine();
  expect((await g.execute('help ssh')).output.join()).toContain('Unknown command');
  g.campaign.progress.completed = ['files-1', 'files-2'];
  await g.execute('mission start network-1');
  expect((await g.execute('help ssh')).output.join()).toContain('Usage: ssh');
});
it('includes player functions and validates help syntax', async () => {
  const g = new GameEngine();
  await g.execute('def greet [name: string] -> string { return ("hello " + $name) }');
  expect((await g.execute('help greet')).output.join()).toContain('name: string');
  expect((await g.execute('help extra "argument"')).output.join()).toContain('Usage: help');
});
it('shows the full command help automatically for invalid arguments without applying effects', async () => {
  const g = new GameEngine();
  for (const source of [
    'cat',
    'cat /home/README.md "extra"',
    'mission start',
    'mission "unknown"',
    'contains 1 "x"',
  ]) {
    const name = source.split(' ')[0];
    const expected = (await g.execute('help ' + name)).output.join('\n');
    const reply = await g.execute(source);
    expect(reply.error).toBeDefined();
    expect(reply.output.join('\n')).toContain(expected);
  }
  const invalid = await g.execute('write /home/should-not-exist "x"; cat');
  expect(invalid.error).toBeDefined();
  expect(() => g.world.home.filesystem.readFile('/home/should-not-exist')).toThrow();
  expect((await g.execute('ssh')).output.join('\n')).not.toContain('Usage: ssh');
});
it('shows help for bare save and requests reset only for the valid terminal command', async () => {
  const g = new GameEngine();
  expect((await g.execute('save')).output).toEqual((await g.execute('help save')).output);
  const before = g.snapshot();
  expect((await g.execute('save reset')).action).toBe('reset');
  expect(g.snapshot()).toEqual(before);
  expect((await g.execute('save reset "extra"')).action).toBeUndefined();
  expect((await g.execute('save "typo"')).error).toContain('Usage: save');
  g.world.home.filesystem.writeFile('/home/reset-test.sc', 'save reset');
  expect((await g.execute('run /home/reset-test.sc')).error).toContain('interactive-only');
  expect(
    g.languageTools('save r', '<terminal>', 6, true).completions.map((c) => c.label),
  ).toContain('reset');
});
