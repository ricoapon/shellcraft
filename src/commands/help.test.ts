import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
it('lists brief command descriptions and ends with the detailed-help hint', async () => {
  const g = new GameEngine();
  const text = (await g.execute('help')).output.join('\n');
  expect(text).toContain('contains');
  expect(text).toContain('Run help <command>');
  expect(text).not.toContain('ssh â€”');
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
  expect((await g.execute('help extra argument')).output.join()).toContain('usage');
});
