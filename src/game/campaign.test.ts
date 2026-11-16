import { expect, it } from 'vitest';
import { Campaign } from './campaign';
import { World } from './world';
import { createInstance, missions } from '../content/missions';
it('opens a second branch without requiring mastery or the whole first branch', () => {
  const game = new Campaign(new World());
  expect(game.available('network-1')).toBe(false);
  for (const id of ['files-1', 'files-2']) {
    game.start(id, 42);
    game.submit(createInstance(id, 42).answer);
  }
  expect(game.available('files-3')).toBe(true);
  expect(game.available('network-1')).toBe(true);
  expect(game.progress.stars).toEqual({ 'files-1': 1, 'files-2': 1 });
  expect(game.available('files-6')).toBe(false);
});
it('keeps stars monotonic and hints free, and never exposes home as a level vertex', () => {
  const campaign = new Campaign(new World());
  campaign.start('files-1', 1);
  expect(campaign.world.host.id).toBe('archive');
  expect(campaign.world.hosts.has('home')).toBe(false);
  expect(campaign.world.canReach('home')).toBe(false);
  expect(campaign.hint()).not.toEqual(campaign.hint());
  expect(campaign.submit('wrong').join()).toContain('does not match');
  campaign.submit(createInstance('files-1', 1).answer);
  campaign.award('files-1', 2);
  campaign.start('files-1', 2);
  campaign.submit(createInstance('files-1', 2).answer);
  expect(campaign.progress.stars['files-1']).toBe(2);
  campaign.leave();
  expect(campaign.world.hosts.size).toBe(0);
  expect(campaign.world.host.id).toBe('home');
});
it('generates repeatable variations within every level, with changing passwords', () => {
  for (const level of missions) {
    expect(createInstance(level.id, 1)).toEqual(createInstance(level.id, 1));
    expect(createInstance(level.id, 1).answer).not.toBe(createInstance(level.id, 2).answer);
  }
});
