import { expect, it } from 'vitest';
import { GameEngine } from './engine';
it('gives staged hints without taking away a future automation star', async () => {
  const game = new GameEngine();
  await game.execute('mission start files-1');
  expect((await game.execute('mission hint')).output.join()).toContain('Hint 1/2');
  expect((await game.execute('mission hint')).output.join()).toContain('Hint 2/2');
  expect((await game.execute('mission hint')).output.join()).toContain('Hint 2/2');
  expect(game.campaign.progress.stars).toEqual({});
});
it('offers guide topics and detailed command help without supplying a solver', async () => {
  const game = new GameEngine();
  expect((await game.execute('guide scripts')).output.join()).toContain('small examples');
  expect((await game.execute('help mission')).output.join()).toContain('fresh cases');
  expect((await game.execute('guide recovery')).output.join()).toContain('never saved');
});
