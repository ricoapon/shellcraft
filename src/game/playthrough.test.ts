import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions, createInstance } from '../content/missions';
import { solver, solverLibrary } from '../../tests/fixtures/solvers';
it('plays every level with a player-owned reusable solver and verifies two stars', async () => {
  const game = new GameEngine();
  game.world.home.filesystem.writeFile('/home/test-solver.sc', solver);
  game.campaign.start('files-1', 1);
  game.campaign.submit(createInstance('files-1', 1).answer);
  for (const level of missions) {
    const reply = await game.execute('mission start ' + level.id);
    expect(reply.clearScreen).toBe(true);
    const verification = await game.execute('mission submit --script /home/test-solver.sc');
    expect(verification.output.join('\n'), level.id).toContain('5/5 fresh cases passed');
    expect(game.campaign.progress.stars[level.id]).toBe(2);
  }
  expect(game.campaign.progress.completed).toHaveLength(10);
}, 30000);

it('can complete the existing campaign in one uninterrupted program without adding an end-level unlock', async () => {
  const game = new GameEngine();
  game.world.home.filesystem.writeFile('/home/library.sc', solverLibrary);
  game.world.home.filesystem.writeFile(
    '/home/campaign.sc',
    'use /home/library.sc\nlet levels = (mission list)\nfor level in $levels { mission start $level.id; solve; mission leave }\necho "campaign-program-finished"',
  );
  const result = await game.execute('run /home/campaign.sc');
  expect(result.output.join()).toContain('campaign-program-finished');
  expect(game.campaign.progress.completed).toHaveLength(missions.length);
  expect(game.world.host.id).toBe('home');
});
