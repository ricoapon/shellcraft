import { expect, it } from 'vitest';
import { World } from './world';
import { VirtualFileSystem } from '../core/filesystem';

it('preserves per-connection directories and restores nested connections', () => {
  const world = new World();
  const remote = new VirtualFileSystem();
  remote.mkdir('/logs');
  world.addHost({ id: 'server', filesystem: remote.snapshot(), neighbors: [] });
  world.home.neighbors.add('server');
  world.connect('server');
  world.session.changeDirectory('/logs');
  world.connect('home');
  world.exit();
  expect(world.session.workingDirectory).toBe('/logs');
  const restored = new World(undefined, world.snapshot());
  expect(restored.host.id).toBe('server');
  expect(restored.session.workingDirectory).toBe('/logs');
  restored.exit();
  expect(restored.host.id).toBe('home');
});

it('rejects unreachable hosts and preserves home data when resetting a mission', () => {
  const world = new World();
  world.home.filesystem.writeFile('/home/tool.js', 'player code');
  world.addHost({ id: 'hidden', filesystem: new VirtualFileSystem().snapshot(), neighbors: [] });
  expect(() => world.connect('hidden')).toThrow('not reachable');
  world.clearRemoteHosts();
  expect(world.home.filesystem.readFile('/home/tool.js')).toBe('player code');
  expect(world.hosts.size).toBe(1);
});
