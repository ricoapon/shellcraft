import 'fake-indexeddb/auto';
import { afterAll, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import type { GameRequest, GameResponse, RequestType } from './protocol';
import { GameEngine } from './engine';
import { missions } from '../content/missions';

const responses: GameResponse[] = [];
const worker = {
  onmessage: undefined as undefined | ((event: { data: GameRequest }) => void),
  postMessage: (response: GameResponse) => responses.push(response),
};
vi.stubGlobal('self', worker);
let intervalCallback: (() => void) | undefined;
const interval = vi.spyOn(globalThis, 'setInterval').mockImplementation((callback) => {
  intervalCallback = callback as () => void;
  return 0 as unknown as ReturnType<typeof setInterval>;
});
let nextId = 0;

afterAll(async () => {
  interval.mockRestore();
  vi.unstubAllGlobals();
  await Dexie.delete('shellcraft');
});

async function request(type: RequestType, payload?: unknown) {
  const id = ++nextId;
  worker.onmessage!({ data: { id, type, payload } });
  await vi.waitFor(() => expect(responses.some((response) => response.id === id)).toBe(true));
  return responses.find((response) => response.id === id)!;
}

it('handles the public worker protocol for play, editing, scripting, export, and recovery', async () => {
  await import('./worker');
  const boot = await request('init');
  expect(boot.ok).toBe(true);
  expect(boot.entries?.flatMap((entry) => entry.output).join('\n')).toContain(
    'Welcome to Shellcraft.',
  );
  expect(boot.entries?.flatMap((entry) => entry.output).join('\n')).toContain('guide start');
  await request('command', 'mission start deployment');
  await request('command', 'ssh deploy');
  const answer = await request('command', 'cat /notes/access.txt');
  expect(answer.reply?.output.join('')).toContain('copper-lantern');
  await request('command', 'mission submit copper-lantern');
  await request('command', 'upgrade buy scripting');
  const opened = await request('openEditor', { path: '/home/scripts/worker-test.js' });
  expect(opened.view?.settings.editor?.path).toBe('/home/scripts/worker-test.js');
  await request('saveEditor', 'export function main(ctx){ctx.print("worker-script-ok");}');
  expect((await request('command', 'run /home/scripts/worker-test.js')).reply?.output).toContain(
    'worker-script-ok',
  );
  await request('closeEditor');
  const backup = (await request('export')).save!;
  expect(backup.progress.completed).toEqual(['deployment']);
  expect((await request('import', { bad: true })).ok).toBe(false);
  expect((await request('command', 'pwd')).ok).toBe(true);
  expect((await request('import', backup)).ok).toBe(true);
  await request('command', 'clear');
  expect((await request('export')).save?.shell.entries).toEqual([]);
  expect((await request('init')).entries).toEqual([]);
}, 15000);

it('refreshes screens between slow simulation ticks without advancing time', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 10).map((mission) => mission.id);
    game.campaign.progress.unlocked = ['scripting', 'screens'];
    await game.execute('mission start thermal');
    game.world.home.filesystem.writeFile(
      '/home/screens/refresh.js',
      'let renders=0; export function render(view){return view.text({text:String(++renders)});}',
    );
    await game.execute('screen add /home/screens/refresh.js');
    await game.execute('screen refresh 100');
    const imported = await request('import', game.snapshot());
    expect(imported.ok).toBe(true);
    const clock = vi.spyOn(performance, 'now');
    const baseline = performance.now();
    try {
      clock.mockReturnValue(baseline);
      intervalCallback!(); // Paused playback resets the scheduling anchors.
      const resumed = await request('command', 'simulation resume');
      const rendered = Number(resumed.view!.panels[0].view!.text);
      const previousCount = responses.length;
      clock.mockReturnValue(baseline + 150);
      intervalCallback!();
      await vi.waitFor(() => expect(responses.length).toBeGreaterThan(previousCount));
      const update = responses[responses.length - 1];
      expect(update.view?.mission?.tick).toBe(0);
      expect(Number(update.view!.panels[0].view!.text)).toBeGreaterThan(rendered);
      await request('command', 'simulation pause');
    } finally {
      clock.mockRestore();
    }
  } finally {
    game.dispose();
  }
}, 15000);

it('delivers playback outcomes without resetting terminal input and saves the notice', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 11).map((mission) => mission.id);
    await game.execute('mission start moving');
    await game.execute('trap ring-3 3');
    await request('import', game.snapshot());
    const clock = vi.spyOn(performance, 'now');
    const baseline = performance.now();
    try {
      clock.mockReturnValue(baseline);
      intervalCallback!();
      await request('command', 'simulation resume');
      for (let tick = 1; tick <= 3; tick++) {
        const count = responses.length;
        clock.mockReturnValue(baseline + tick * 1100);
        intervalCallback!();
        await vi.waitFor(() => expect(responses.length).toBeGreaterThan(count));
      }
      const outcome = responses.at(-1)!;
      expect(outcome.notice?.join('\n')).toContain('MISSION COMPLETE');
      expect(outcome.notice?.join('\n')).toContain('mission start coordination');
      expect(outcome.entries).toBeUndefined();
      expect((await request('export')).save?.shell.entries.at(-1)?.input).toBe('[simulation]');
    } finally {
      clock.mockRestore();
    }
  } finally {
    game.dispose();
  }
}, 15000);

it('returns the terminal transcript after discard or save-and-run without implicitly saving drafts', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting'];
    await request('import', game.snapshot());
    await request('command', 'edit /home/worker-exit.js');
    await request('editorDraft', 'do not save this');
    const discarded = await request('closeEditor', { action: 'discard' });
    expect(discarded.view?.settings.editor).toBeUndefined();
    expect(discarded.entries).toBeDefined();
    const saved = (await request('export')).save!;
    expect(
      saved.world.hosts
        .find((host) => host.id === 'home')!
        .filesystem.some((file) => file.path === '/home/worker-exit.js'),
    ).toBe(false);
    await request('command', 'edit /home/worker-exit.js');
    const ran = await request('closeEditor', {
      action: 'run',
      text: 'export function main(ctx){ctx.print("exit-run-ok");}',
    });
    expect(ran.view?.settings.editor).toBeUndefined();
    expect(ran.entries?.at(-1)?.output).toEqual(['exit-run-ok']);
    expect((await request('init')).view?.settings.editor).toBeUndefined();
  } finally {
    game.dispose();
  }
}, 15000);
