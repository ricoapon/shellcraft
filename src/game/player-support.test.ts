import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions } from '../content/missions';

it('guides the first reward, purchase, and next mission with detailed help available', async () => {
  const game = new GameEngine();
  try {
    await game.execute('mission start deployment');
    const completed = (await game.execute('mission submit copper-lantern')).output.join('\n');
    expect(completed.match(/MISSION COMPLETE/g)).toHaveLength(1);
    expect(completed).toContain('upgrade buy scripting');
    expect(completed).toContain('mission start archive');
    expect((await game.execute('upgrade buy scripting')).output.join('\n')).toContain('help run');
    expect((await game.execute('guide start')).output).toEqual(
      (await game.execute('guide 1')).output,
    );
    expect((await game.execute('guide stuck')).output.join('\n')).toContain('mission hint');
  } finally {
    game.dispose();
  }
});

it('announces an action objective completion and explains that no answer is required', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 6).map((m) => m.id);
    expect((await game.execute('mission start traffic')).output.join('\n')).toContain(
      'no answer submission',
    );
    const completed = (await game.execute('link collector outside off')).output.join('\n');
    expect(completed).toContain('MISSION COMPLETE');
    expect(completed).toContain('mission start isolation');
  } finally {
    game.dispose();
  }
});

it('records a playback completion once, including the next assignment, without tick spam', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 11).map((m) => m.id);
    await game.execute('mission start moving');
    await game.execute('trap ring-3 3');
    const entries = game.shell.entries.length;
    expect(game.advancePlayback()).toEqual([]);
    expect(game.advancePlayback()).toEqual([]);
    expect(game.shell.entries).toHaveLength(entries);
    const outcome = game.advancePlayback().join('\n');
    expect(outcome).toContain('MISSION COMPLETE');
    expect(outcome).toContain('mission start coordination');
    expect(game.shell.entries.at(-1)?.input).toBe('[simulation]');
    expect(game.advancePlayback()).toEqual([]);
    expect(game.shell.entries).toHaveLength(entries + 1);
  } finally {
    game.dispose();
  }
});

it('explains recovery from a live mission failure without deleting home files', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 11).map((m) => m.id);
    await game.execute('mission start moving');
    game.step(24);
    const outcome = game.advancePlayback().join('\n');
    expect(outcome).toContain('MISSION FAILED');
    expect(outcome).toContain('mission hint');
    expect(outcome).toContain('mission reset');
    expect(game.world.home.filesystem.readFile('/home/scripts/search.js')).toContain('searchFiles');
  } finally {
    game.dispose();
  }
});

it('reports a disabled controller during playback with a concrete recovery action', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 10).map((m) => m.id);
    game.campaign.progress.unlocked = ['scripting', 'controllers'];
    await game.execute('mission start thermal');
    game.world.home.filesystem.writeFile(
      '/home/controllers/broken.js',
      'export function control(){ throw new Error("bad decision"); }',
    );
    await game.execute('controller add /home/controllers/broken.js');
    const notice = game.advancePlayback().join('\n');
    expect(notice).toContain('Controller broken disabled:');
    expect(notice).toContain('controller add <path>');
    expect(game.advancePlayback().join('\n')).not.toContain('Controller broken disabled:');
  } finally {
    game.dispose();
  }
});
