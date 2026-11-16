import 'fake-indexeddb/auto';
import { afterAll, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import type { GameRequest, GameResponse, RequestType } from './protocol';
import { CampaignStorage } from './save';
const responses: GameResponse[] = [];
const worker = {
  onmessage: undefined as undefined | ((event: { data: GameRequest }) => void),
  postMessage: (response: GameResponse) => responses.push(response),
};
vi.stubGlobal('self', worker);
let id = 0;
async function request(type: RequestType, payload?: unknown) {
  const next = ++id;
  worker.onmessage!({ data: { id: next, type, payload } });
  await vi.waitFor(() => expect(responses.some((r) => r.id === next)).toBe(true));
  return responses.find((r) => r.id === next)!;
}
afterAll(async () => {
  vi.unstubAllGlobals();
  await Dexie.delete('shellcraft');
});
it('starts a fresh terminal on transitions and reload, persisting only durable state', async () => {
  await import('./worker');
  const boot = await request('init');
  expect(boot.entries?.[0].output.join()).toContain('Welcome to Shellcraft');
  await request('command', 'echo temporary-history');
  const started = await request('command', 'mission start files-1');
  expect(started.reply?.clearScreen).toBe(true);
  expect(started.entries?.length).toBe(1);
  expect(started.view?.host).toBe('archive');
  await request('command', 'echo another-private-command');
  const exported = await request('export');
  expect(exported.save).not.toHaveProperty('shell');
  expect(JSON.stringify(exported.save)).not.toContain('another-private-command');
  const reload = await request('init');
  expect(reload.entries?.length).toBe(1);
  expect(reload.entries?.[0].output.join()).toContain('The first note');
  expect(JSON.stringify(reload.entries)).not.toContain('another-private-command');
  const left = await request('command', 'mission leave');
  expect(left.reply?.clearScreen).toBe(true);
  expect(left.view?.mission).toBeUndefined();
  expect((await request('import', { bad: true })).ok).toBe(false);
  expect((await request('command', 'pwd')).ok).toBe(true);
}, 15000);
it('resets durable and live state together, preserving the old game if persistence fails', async () => {
  await import('./worker');
  await request('init');
  await request('command', 'write /home/personal.txt "my file"');
  await request('command', 'mission start files-1');
  const note = await request('command', 'cat /notes/access.txt');
  const password = String(note.reply?.values?.[0]).trim().split('=')[1];
  await request('command', 'mission submit ' + JSON.stringify(password));
  await request('command', 'edit /home/draft.sc');
  await request('editorDraft', 'echo unsaved');
  const before = (await request('export')).save!;
  expect(before.progress.stars['files-1']).toBe(1);
  const action = await request('command', 'save reset');
  expect(action.reply?.action).toBe('reset');
  expect((await request('export')).save).toEqual(before);
  const failure = vi
    .spyOn(CampaignStorage.prototype, 'save')
    .mockRejectedValueOnce(new Error('disk full'));
  try {
    expect((await request('reset')).error).toContain('existing game is preserved');
    expect((await request('export')).save).toEqual(before);
  } finally {
    failure.mockRestore();
  }
  const reset = await request('reset');
  expect(reset.ok).toBe(true);
  expect(reset.view?.host).toBe('home');
  expect(reset.view?.mission).toBeUndefined();
  expect(reset.view?.settings.editor).toBeUndefined();
  expect(reset.entries?.[0].output.join()).toContain('Welcome to Shellcraft');
  const fresh = (await request('export')).save!;
  expect(fresh.progress.completed).toEqual([]);
  expect(fresh.progress.stars).toEqual({});
  expect(JSON.stringify(fresh)).not.toContain('my file');
  expect(fresh.world.home.some((entry) => entry.path === '/home/README.md')).toBe(true);
  await request('init');
  expect((await request('export')).save).toEqual(fresh);
}, 15000);
