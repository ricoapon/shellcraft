import { expect, it } from 'vitest';
import { World } from './world';
import { Campaign } from './campaign';
it('separates workspace from level connections and restores level navigation', () => {
  const world = new World(),
    campaign = new Campaign(world);
  campaign.progress.completed = ['files-1', 'files-2'];
  campaign.start('network-1', 1);
  expect(world.host.id).toBe('gateway');
  world.connect('node-1');
  world.session.changeDirectory('/notes');
  const restored = new World(undefined, world.snapshot());
  expect(restored.host.id).toBe('node-1');
  expect(restored.session.workingDirectory).toBe('/notes');
  restored.exit();
  expect(restored.host.id).toBe('gateway');
  expect(() => restored.exit()).toThrow('mission leave');
  expect(() => restored.connect('home')).toThrow('not adjacent');
  expect(restored.snapshot().hosts.every((host) => !host.neighbors.includes('home'))).toBe(true);
});
