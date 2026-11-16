import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions, createInstance } from '../content/missions';
import { solver } from '../../tests/fixtures/solvers';
it('plays every level with a player-owned reusable solver and verifies two stars', async () => {
  const game = new GameEngine();
  game.world.home.filesystem.writeFile('/home/test-solver.js', solver);
  game.campaign.start('files-1', 1);
  game.campaign.submit(createInstance('files-1', 1).answer);
  for (const level of missions) {
    const reply = await game.execute('mission start ' + level.id);
    expect(reply.clearScreen).toBe(true);
    const verification = await game.execute('mission submit --script /home/test-solver.js');
    expect(verification.output.join('\n'), level.id).toContain('5/5 fresh cases passed');
    expect(game.campaign.progress.stars[level.id]).toBe(2);
  }
  expect(game.campaign.progress.completed).toHaveLength(10);
}, 30000);
