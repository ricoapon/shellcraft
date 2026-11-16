import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { validateGameSave } from './save';
import { solver } from '../../tests/fixtures/solvers';
import { createInstance } from '../content/missions';
it('preserves files but persists no terminal text or command history', async () => {
  const game = new GameEngine();
  await game.execute('write /home/note.txt persisted');
  await game.execute('echo private-command-text');
  const snapshot = game.snapshot();
  expect(JSON.stringify(snapshot)).not.toContain('private-command-text');
  expect(snapshot).not.toHaveProperty('shell');
  const restored = new GameEngine(validateGameSave(snapshot));
  await restored.initialize();
  expect(restored.world.home.filesystem.readFile('/home/note.txt')).toBe('persisted');
  expect(JSON.stringify(restored.shell)).not.toContain('private-command-text');
});
it('treats editing as a traveling code notebook and keeps level evidence read-only', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1'];
  game.campaign.progress.stars = { 'files-1': 1 };
  await game.execute('mission start files-2');
  await game.execute('edit /home/tool.js');
  await game.closeEditor('save', 'export function main(ctx){ctx.print(ctx.session.host);}');
  expect((await game.execute('run /home/tool.js')).output.join()).toContain('archive');
  expect((await game.execute('write /notes/new.txt forbidden')).output.join()).toContain(
    'read-only',
  );
  expect((await game.execute('rm /notes/note-0.txt')).output.join()).toContain('read-only');
  expect((await game.execute('ssh home')).output.join()).toContain('locked or unavailable');
});
it('installs a blank starter rather than complete solution scripts', () => {
  const files = new GameEngine().world.home.filesystem
    .snapshot()
    .filter((f) => f.type === 'file')
    .map((f) => f.path);
  expect(files).toContain('/home/solve.js');
  expect(files).not.toContain('/home/scripts/search.js');
  expect(files).not.toContain('/home/scripts/crawl.js');
});
it('rejects a hardcoded answer on fresh cases and leaves exploration untouched', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1'];
  game.campaign.progress.stars = { 'files-1': 1 };
  await game.execute('mission start files-2');
  const explored = game.campaign.active;
  const answer = createInstance(explored.id, explored.seed).answer;
  game.world.home.filesystem.writeFile(
    '/home/hardcoded.js',
    `export function main(ctx){ctx.mission.submit(${JSON.stringify(answer)});}`,
  );
  const before = structuredClone(game.world.snapshot());
  expect((await game.verify('/home/hardcoded.js')).join()).toContain('Replay this practice case');
  expect(game.world.snapshot()).toEqual(before);
  expect(game.campaign.progress.stars['files-2']).toBeUndefined();
});
it('isolates verification storage and runtime state, while allowing library imports', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1'];
  game.campaign.progress.stars = { 'files-1': 1 };
  game.campaign.start('files-2', 19);
  game.campaign.progress.playerData = { answer: 'cached' };
  game.world.home.filesystem.writeFile('/home/lib.js', solver);
  game.world.home.filesystem.writeFile(
    '/home/test.js',
    'import {main as solve} from "./lib.js"; let called=false; export function main(ctx){if(called || ctx.storage.get("answer"))throw new Error("leaked state"); called=true; ctx.storage.set("answer","trial"); solve(ctx); }',
  );
  const before = structuredClone(game.world.snapshot());
  expect((await game.verify('/home/test.js')).join()).toContain('5/5 fresh cases passed');
  expect(game.campaign.progress.stars['files-2']).toBe(2);
  expect(game.campaign.progress.playerData).toEqual({ answer: 'cached' });
  expect(game.world.snapshot()).toEqual(before);
});
it('practice verification never awards stars', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1'];
  game.campaign.progress.stars = { 'files-1': 1 };
  game.campaign.start('files-2', 4);
  game.world.home.filesystem.writeFile('/home/test.js', solver);
  expect((await game.verify('/home/test.js', 12)).join()).toContain('Practice case passed');
  expect(game.campaign.progress.stars['files-2']).toBeUndefined();
});
it('allows automation immediately without requiring a manual completion first', async () => {
  const game = new GameEngine();
  game.campaign.start('files-1', 1);
  game.world.home.filesystem.writeFile('/home/test.js', solver);
  expect((await game.verify('/home/test.js')).join()).toContain('5/5 fresh cases passed');
  expect(game.campaign.progress.stars['files-1']).toBe(2);
});
it('keeps home outside script filesystem and network handles inside a level', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1', 'files-2'];
  game.campaign.progress.stars = { 'files-1': 1, 'files-2': 1 };
  game.world.home.filesystem.writeFile('/home/secret.txt', 'workspace-only-content');
  game.world.home.filesystem.writeFile(
    '/home/check.js',
    `export function main(ctx){
    ctx.print(typeof ctx.home);
    try { ctx.network.connect('home'); } catch(error) { ctx.print(error.message); }
    try { ctx.fs.read('/home/secret.txt'); } catch(error) { ctx.print(error.message); }
  }`,
  );
  game.campaign.start('network-1', 1);
  const output = (await game.execute('run /home/check.js')).output.join('\n');
  expect(output).toContain('undefined');
  expect(output).toContain('Home is outside');
  expect(output).toContain('Path not found');
  expect(output).not.toContain('workspace-only-content');
});
