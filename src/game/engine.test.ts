import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { validateGameSave } from './save';
import { solver, solverLibrary } from '../../tests/fixtures/solvers';
import { createInstance } from '../content/missions';
it('preserves files but saves no shell output, history, or interpreter bindings', async () => {
  const g = new GameEngine();
  await g.execute('write /home/note.txt "persisted"');
  await g.execute('let secret = "private-command-text"; echo $secret');
  const saved = g.snapshot();
  expect(JSON.stringify(saved)).not.toContain('private-command-text');
  expect(saved).not.toHaveProperty('shell');
  const restored = new GameEngine(validateGameSave(saved));
  await restored.initialize();
  expect(restored.world.home.filesystem.readFile('/home/note.txt')).toBe('persisted');
  expect((await restored.execute('echo $secret')).output.join()).toContain('Unknown variable');
});
it('uses a traveling notebook while level evidence stays read-only', async () => {
  const g = new GameEngine();
  g.campaign.progress.completed = ['files-1'];
  await g.execute('mission start files-2');
  await g.execute('edit /home/tool.sc');
  await g.closeEditor('save', 'hostname');
  expect((await g.execute('run /home/tool.sc')).output).toEqual(['archive']);
  expect((await g.execute('write /notes/new.txt "forbidden"')).output.join()).toContain(
    'read-only',
  );
});
it('installs only skeletons and small examples while preserving old player files', () => {
  const g = new GameEngine();
  expect(g.world.home.filesystem.readFile('/home/solve.sc')).not.toContain('def scan');
  g.world.home.filesystem.writeFile('/home/old.js', 'player source');
  const restored = new GameEngine(validateGameSave(g.snapshot()));
  expect(restored.world.home.filesystem.readFile('/home/old.js')).toBe('player source');
});
it('rejects hardcoded answers on fresh cases without changing exploration', async () => {
  const g = new GameEngine();
  g.campaign.progress.completed = ['files-1'];
  g.campaign.start('files-2', 19);
  const answer = createInstance('files-2', 19).answer;
  g.world.home.filesystem.writeFile(
    '/home/hardcoded.sc',
    'mission submit ' + JSON.stringify(answer),
  );
  const before = g.snapshot();
  expect((await g.verify('/home/hardcoded.sc')).join()).toContain('Replay this practice case');
  expect(g.snapshot()).toEqual(before);
});
it('isolates verification environments and allows library imports', async () => {
  const g = new GameEngine();
  g.campaign.progress.completed = ['files-1'];
  g.campaign.start('files-2', 19);
  g.campaign.progress.playerData = { answer: 'cached' };
  await g.execute('let cached = "shell"');
  g.world.home.filesystem.writeFile('/home/lib.sc', solverLibrary);
  g.world.home.filesystem.writeFile('/home/test.sc', 'use ./lib.sc\nsolve');
  const before = g.world.snapshot();
  expect((await g.verify('/home/test.sc')).join()).toContain('5/5 fresh cases passed');
  expect(g.campaign.progress.stars['files-2']).toBe(2);
  expect(g.campaign.progress.playerData).toEqual({ answer: 'cached' });
  expect(g.world.snapshot()).toEqual(before);
});
it('practice verification awards no stars and automation works without manual completion', async () => {
  const g = new GameEngine();
  g.campaign.start('files-1', 1);
  g.world.home.filesystem.writeFile('/home/test.sc', solver);
  expect((await g.verify('/home/test.sc', 12)).join()).toContain('Practice case passed');
  expect(g.campaign.progress.stars['files-1']).toBeUndefined();
  expect((await g.verify('/home/test.sc')).join()).toContain('5/5 fresh cases passed');
  expect(g.campaign.progress.stars['files-1']).toBe(2);
});
it('keeps home outside level file and network access', async () => {
  const g = new GameEngine();
  g.campaign.progress.completed = ['files-1', 'files-2'];
  g.campaign.start('network-1', 1);
  expect((await g.execute('ssh home')).output.join()).toContain('Home is outside');
  expect((await g.execute('cat /home/README.md')).output.join()).toContain('Path not found');
});
it('prevents per-mission verification from switching to an easier mission', async () => {
  const g = new GameEngine();
  g.campaign.progress.completed = ['files-1'];
  g.campaign.start('files-2', 1);
  g.world.home.filesystem.writeFile('/home/escape.sc', 'mission start files-1\n' + solver);
  expect((await g.verify('/home/escape.sc')).join()).toContain('verification mission');
  expect(g.campaign.progress.stars['files-2']).toBeUndefined();
});
