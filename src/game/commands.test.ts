import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { createInstance } from '../content/missions';
it('clears output on successful entry, reset and leave, but not on invalid transitions', async () => {
  const game = new GameEngine();
  await game.initialize();
  await game.execute('echo "old-output"');
  expect((await game.execute('mission start network-4')).clearScreen).toBeUndefined();
  const start = await game.execute('mission start files-1');
  expect(start.clearScreen).toBe(true);
  expect(start.host).toBe('archive');
  expect(JSON.stringify(game.shell)).not.toContain('old-output');
  expect(start.output.join()).toContain('personal /home');
  await game.execute('echo "discard-me"');
  expect((await game.execute('mission reset')).clearScreen).toBe(true);
  expect(JSON.stringify(game.shell)).not.toContain('discard-me');
  expect((await game.execute('mission leave')).clearScreen).toBe(true);
  expect(game.world.host.id).toBe('home');
});
it('keeps the command set focused and hides tools until relevant', async () => {
  const game = new GameEngine();
  const initial = (await game.execute('help')).output.join('\n');
  expect(initial).toContain('run —');
  expect(initial).not.toContain('ssh —');
  for (const retired of [
    'simulation',
    'screen',
    'controller',
    'upgrade',
    'startup',
    'transfer',
    'trap',
    'service',
  ])
    expect((await game.execute(retired)).output.join()).toContain('Unknown command');
  game.campaign.start('files-1', 8);
  await game.execute('mission submit ' + createInstance('files-1', 8).answer);
  expect((await game.execute('help run')).output.join()).toContain('fresh variable scope');
});
it.each([
  'mission list nonsense',
  'mission start',
  'mission hint "extra"',
  'mission submit --script',
  'mission submit --script /home/solve.sc "NaN"',
  'mission submit --script /home/solve.sc -1',
  'mission leave "extra"',
])('rejects invalid command syntax: %s', async (command) => {
  const game = new GameEngine();
  expect((await game.execute(command)).output.join()).toMatch(
    /Usage:|usage|Seed must|Expected number/,
  );
});
