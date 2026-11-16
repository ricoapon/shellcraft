import 'fake-indexeddb/auto';
import { afterAll, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import type { GameRequest, GameResponse, RequestType } from './protocol';
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
