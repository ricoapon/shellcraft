import { expect, it } from 'vitest';
import { Campaign } from './campaign';
import { World } from './world';
import { missions } from '../content/missions';

function ready(id: string) {
  const campaign = new Campaign(new World());
  campaign.progress.completed = missions
    .slice(
      0,
      missions.findIndex((m) => m.id === id),
    )
    .map((m) => m.id);
  campaign.start(id);
  return campaign;
}

it('gates missions and upgrades and awards rewards once', () => {
  const game = new Campaign(new World());
  expect(() => game.start('archive')).toThrow('preceding');
  game.start('deployment');
  expect(game.submit('wrong')).toContain('does not match');
  game.submit('copper-lantern');
  expect(game.progress.tokens).toBe(3);
  game.start('deployment');
  game.submit('copper-lantern');
  expect(game.progress.tokens).toBe(3);
  game.unlock('scripting');
  expect(game.progress.tokens).toBe(1);
  expect(() => game.unlock('network')).toThrow('Complete');
});

it('solves visual investigation objectives from resulting world state', () => {
  const traffic = ready('traffic');
  traffic.action({ type: 'link', from: 'collector', to: 'outside', enabled: false });
  expect(traffic.active.status).toBe('complete');
  const isolation = ready('isolation');
  isolation.action({ type: 'link', from: 'core', to: 'bridge', enabled: false });
  isolation.action({ type: 'link', from: 'clinic', to: 'bridge', enabled: false });
  expect(isolation.active.status).toBe('complete');
  const repair = ready('repair');
  expect(() => repair.action({ type: 'restart', host: 'frontend' })).toThrow('Dependency');
  repair.world
    .requireHost('db')
    .filesystem.writeFile('/etc/app/database.json', '{"port":5432,"enabled":true}');
  for (const host of ['db', 'api', 'frontend']) repair.action({ type: 'restart', host });
  expect(repair.active.status).toBe('complete');
});

it('reproduces thermal transfers, deadlines, and deterministic stepping', () => {
  const game = ready('thermal');
  game.action({ type: 'transfer', from: 'compute-a', to: 'compute-b', amount: 28 });
  game.action({ type: 'transfer', from: 'compute-a', to: 'compute-c', amount: 28 });
  for (let i = 0; i < 35; i++) game.step();
  expect(game.active.status).toBe('complete');
  expect(game.active.completedWork).toBeCloseTo(96);
});

it('captures moving processes and commits coordinated actions in one ordered tick', () => {
  const moving = ready('moving');
  moving.action({ type: 'trap', host: 'ring-3', tick: 3 });
  moving.step();
  moving.step();
  moving.step();
  expect(moving.active.status).toBe('complete');
  const update = ready('coordination');
  for (const host of ['database', 'api-node', 'web-node']) {
    update.action({ type: 'prepare', host, release: 'r2' });
    update.active.queued.push({ type: 'commit', host });
  }
  update.step();
  expect(update.active.status).toBe('complete');
});

it('gives controllers identical detached snapshots and applies actions in order', () => {
  const game = ready('thermal');
  game.step((snapshot) => {
    expect(snapshot.tick).toBe(1);
    snapshot.nodes[0].load = 0;
    return [
      [{ type: 'transfer', from: 'compute-a', to: 'compute-b', amount: 80 }],
      [{ type: 'transfer', from: 'compute-a', to: 'compute-c', amount: 80 }],
    ];
  });
  expect(game.active.results[1]).toContain('FAILED');
  expect(game.active.transfers).toHaveLength(1);
});

it('shares bandwidth between transfers over the same link', () => {
  const game = ready('thermal');
  game.action({ type: 'transfer', from: 'compute-a', to: 'compute-b', amount: 16 });
  game.action({ type: 'transfer', from: 'compute-a', to: 'compute-b', amount: 16 });
  game.step();
  expect(game.active.transfers.map((transfer) => transfer.remaining)).toEqual([8, 16]);
});

it('keeps commits tick-bound and archives observations independently of mission resets', () => {
  const game = ready('coordination');
  game.action({ type: 'prepare', host: 'database', release: 'r2' });
  expect(() => game.action({ type: 'commit', host: 'database' })).toThrow('simulation tick');
  game.start('coordination');
  expect(game.progress.archivedObservations?.['coordination@0'].database.id).toBe('database');
});

it('applies scheduled arrivals before controllers and processes urgent jobs first', () => {
  const game = ready('surge');
  for (let tick = 0; tick < 6; tick++)
    game.step((snapshot) => {
      if (snapshot.tick === 6) {
        expect(snapshot.jobs.find((job) => job.id === 'arrival-6')?.priority).toBe(3);
        expect(snapshot.nodes[0].load).toBe(110);
      }
      return [];
    });
  expect(game.active.jobs.find((job) => job.id === 'routine')?.remaining).toBe(62);
  expect(game.active.jobs.find((job) => job.id === 'arrival-6')?.remaining).toBe(46);
});

it('applies cooling failures and enforces individual job deadlines', () => {
  const game = ready('cooling');
  for (let tick = 0; tick < 8; tick++) game.step();
  expect(game.active.nodes.find((node) => node.id === 'compute-b')?.cooling).toBe(0.4);
  const expired = ready('thermal');
  expired.active.jobs[0].deadline = 1;
  expired.step();
  expect(expired.active.status).toBe('failed');
});
