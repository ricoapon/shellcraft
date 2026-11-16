import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import Dexie from 'dexie';
import { GameEngine } from './engine';
import { CampaignStorage, validateGameSave } from './save';
it('roundtrips files, active navigation, stars and editor drafts without transcript data', async () => {
  const game = new GameEngine();
  game.campaign.progress.completed = ['files-1', 'files-2'];
  game.campaign.progress.stars = { 'files-1': 1, 'files-2': 2 };
  await game.execute('mission start network-1');
  await game.execute('neighbors');
  await game.execute('ssh node-1');
  await game.execute('cd /notes');
  await game.execute('edit /home/new.js');
  game.settings.editor!.draft = 'not saved';
  await game.execute('echo must-not-persist');
  const snapshot = validateGameSave(game.snapshot());
  expect(JSON.stringify(snapshot)).not.toContain('must-not-persist');
  const restored = new GameEngine(snapshot);
  expect(restored.world.host.id).toBe('node-1');
  expect(restored.world.session.workingDirectory).toBe('/notes');
  expect(restored.settings.editor?.draft).toBe('not saved');
  expect(restored.settings.editor?.saved).toBeUndefined();
});
it('migrates old player files and discards retired systems and transcripts', () => {
  const game = new GameEngine();
  game.world.home.filesystem.writeFile('/home/my-notes.txt', 'keep this');
  const legacy = {
    world: {
      hosts: [
        { id: 'home', filesystem: game.world.home.filesystem.snapshot(), neighbors: ['old-host'] },
      ],
      connections: [{ host: 'home', directory: '/home' }],
    },
    progress: {
      completed: ['thermal'],
      unlocked: ['controllers'],
      tokens: 4,
      playerData: { notes: 'mine' },
    },
    settings: { vim: true, panels: [{}], controllers: [{}] },
    shell: { entries: [{ input: 'old-private-history', output: ['old-output'] }] },
  };
  const migrated = validateGameSave(legacy);
  expect(migrated.progress.completed).toEqual([]);
  expect(migrated.progress.playerData).toEqual({ notes: 'mine' });
  expect(new GameEngine(migrated).world.home.filesystem.readFile('/home/my-notes.txt')).toBe(
    'keep this',
  );
  expect(JSON.stringify(migrated)).not.toContain('old-private-history');
  expect(migrated.settings).not.toHaveProperty('controllers');
});
it('rejects damaged navigation and scores without mutating an active game', () => {
  const game = new GameEngine();
  game.campaign.start('files-1', 1);
  const before = game.snapshot();
  const invalid = structuredClone(before);
  invalid.world.connections[0].host = 'home';
  expect(() => validateGameSave(invalid)).toThrow();
  const score = structuredClone(before);
  score.progress.stars['files-1'] = 7;
  expect(() => validateGameSave(score)).toThrow();
  expect(game.snapshot()).toEqual(before);
});
it('replaces legacy persisted history with a v4 record containing only durable state', async () => {
  const name = 'shellcraft-save-redesign-test';
  const db = new Dexie(name);
  db.version(1).stores({ saves: 'id' });
  try {
    await db.table('saves').put({
      id: 'workstation',
      version: 2,
      state: {
        session: { filesystem: new GameEngine().world.home.filesystem.snapshot() },
        shell: { entries: [{ input: 'secret-history', output: [] }] },
      },
    });
    const storage = new CampaignStorage(name);
    const migrated = (await storage.load())!;
    await storage.save(migrated);
    const record = await db.table('saves').get('workstation');
    expect(record.version).toBe(4);
    expect(record.state).not.toHaveProperty('shell');
    expect(JSON.stringify(record)).not.toContain('secret-history');
  } finally {
    db.close();
    await Dexie.delete(name);
  }
});
