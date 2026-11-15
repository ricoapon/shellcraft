import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { IndexedDbStorage } from './storage';
import { Session } from '../core/session';

function emptyState() {
  return { shell: { entries: [] }, session: Session.createHome().snapshot() };
}

it.each([undefined, '/home/sandbox'])(
  'restores a save with directory %j through a new storage instance',
  async (workingDirectory) => {
    const name = `shellcraft-test-${crypto.randomUUID()}`;
    try {
      const storage = new IndexedDbStorage(name);
      expect(await storage.load()).toBeUndefined();
      const state = {
        ...emptyState(),
        shell: {
          entries: [
            {
              input: 'echo saved',
              output: ['saved'],
              ...(workingDirectory === undefined ? {} : { workingDirectory }),
            },
          ],
        },
      };
      await Promise.all([storage.save(emptyState()), storage.save(state)]);
      expect(await new IndexedDbStorage(name).load()).toEqual(state);
    } finally {
      // Dexie closes existing connections on a database version change/deletion.
      await Dexie.delete(name);
    }
  },
);

it('allows another save after an uncloneable snapshot', async () => {
  const name = `shellcraft-test-${crypto.randomUUID()}`;
  try {
    const storage = new IndexedDbStorage(name);
    // Functions cannot be included in a saved snapshot.
    const uncloneable = { ...emptyState(), invalid: () => undefined };
    await expect(storage.save(uncloneable)).rejects.toThrow();
    await storage.save(emptyState());
    expect(await storage.load()).toEqual(emptyState());
  } finally {
    await Dexie.delete(name);
  }
});

it('restores directories, file changes, empty files, and the current directory', async () => {
  const name = `shellcraft-test-${crypto.randomUUID()}`;
  try {
    const session = Session.createHome();
    session.filesystem.mkdir('/home/notes');
    session.filesystem.writeFile('/home/notes/empty.txt', '');
    session.filesystem.writeFile('/home/readme.txt', 'changed content');
    session.changeDirectory('/home/notes');
    const shell = { entries: [{ input: 'mkdir notes', output: [] }] };
    await new IndexedDbStorage(name).save({ shell, session: session.snapshot() });
    const saved = await new IndexedDbStorage(name).load();
    expect(saved?.shell).toEqual(shell);
    const restored = Session.fromSnapshot(saved?.session);
    expect(restored.workingDirectory).toBe('/home/notes');
    expect(restored.filesystem.readFile('empty.txt', restored.workingDirectory)).toBe('');
    expect(restored.filesystem.readFile('/home/readme.txt')).toBe('changed content');
  } finally {
    await Dexie.delete(name);
  }
});

it('upgrades an old transcript-only save without executing its commands', async () => {
  const name = `shellcraft-test-${crypto.randomUUID()}`;
  const database = new Dexie(name);
  database.version(1).stores({ saves: 'id' });
  try {
    const shell = { entries: [{ input: 'mkdir should-not-exist', output: [] }] };
    await database.table('saves').put({ id: 'workstation', version: 1, state: shell });
    const storage = new IndexedDbStorage(name);
    const saved = await storage.load();
    expect(saved?.shell).toEqual(shell);
    const session = Session.fromSnapshot(saved?.session);
    expect(session.workingDirectory).toBe('/home');
    expect(() => session.filesystem.stat('/home/should-not-exist')).toThrow('Path not found');
    await storage.save(saved!);
    expect((await database.table('saves').get('workstation')).version).toBe(2);
  } finally {
    database.close();
    await Dexie.delete(name);
  }
});

it.each([
  { filesystem: [{ path: '/', type: 'directory' }], workingDirectory: '/missing' },
  { filesystem: [{ path: '/home/file', type: 'file', content: 'orphan' }], workingDirectory: '/' },
])('rejects damaged session data without replacing the save', async (session) => {
  const name = `shellcraft-test-${crypto.randomUUID()}`;
  const database = new Dexie(name);
  database.version(1).stores({ saves: 'id' });
  try {
    const record = { id: 'workstation', version: 2, state: { shell: { entries: [] }, session } };
    await database.table('saves').put(record);
    await expect(new IndexedDbStorage(name).load()).rejects.toThrow();
    expect(await database.table('saves').get('workstation')).toEqual(record);
  } finally {
    database.close();
    await Dexie.delete(name);
  }
});

it.each([
  { version: 2, state: { entries: [] } },
  { version: 1, state: { entries: [{ input: 123, output: [] }] } },
  { version: 1, state: { entries: [{ input: 'pwd', output: ['/'], workingDirectory: 123 }] } },
])('rejects an unsupported or malformed save', async (record) => {
  const name = `shellcraft-test-${crypto.randomUUID()}`;
  const database = new Dexie(name);
  database.version(1).stores({ saves: 'id' });
  try {
    await database.table('saves').put({ id: 'workstation', ...record });
    await expect(new IndexedDbStorage(name).load()).rejects.toThrow('Unsupported or damaged save');
    expect(await database.table('saves').get('workstation')).toEqual({
      id: 'workstation',
      ...record,
    });
  } finally {
    database.close();
    await Dexie.delete(name);
  }
});
