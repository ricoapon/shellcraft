import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import Dexie from 'dexie';
import { IndexedDbStorage } from '../persistence/storage';
import { Session } from '../core/session';
import { CampaignStorage, validateGameSave } from './save';
import { GameEngine } from './engine';

it('migrates player files and transcript from the reviewed single-host save', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  try {
    const session = Session.createHome();
    session.filesystem.writeFile('/home/my-tool.js', 'precious code');
    await new IndexedDbStorage(name).save({ shell: { entries: [] }, session: session.snapshot() });
    const snapshot = await new CampaignStorage(name).load();
    const game = new GameEngine(snapshot);
    expect(game.world.home.filesystem.readFile('/home/my-tool.js')).toBe('precious code');
    expect(game.world.home.filesystem.readFile('/home/scripts/search.js')).toContain('searchFiles');
    game.dispose();
  } finally {
    await Dexie.delete(name);
  }
});

it('rejects malformed imports without changing the existing game', async () => {
  const game = new GameEngine();
  try {
    await game.execute('mission start deployment');
    const valid = game.snapshot();
    const unknownMission = structuredClone(valid);
    unknownMission.progress.active!.id = 'missing-mission';
    expect(() => validateGameSave(unknownMission)).toThrow();
    const invalidPanel = structuredClone(valid);
    invalidPanel.settings.panels = [{ id: 'panel', path: '/outside-home.js' }];
    expect(() => validateGameSave(invalidPanel)).toThrow();
    const invalidNode = structuredClone(valid);
    invalidNode.progress.active!.nodes[0].load = Number.NaN;
    expect(() => validateGameSave(invalidNode)).toThrow();
    expect(game.campaign.active.id).toBe('deployment');
    expect(() => validateGameSave(valid)).not.toThrow();
  } finally {
    game.dispose();
  }
});

it('restores remote files, connection stacks, tokens, and paused simulation', async () => {
  const name = `campaign-save-${crypto.randomUUID()}`;
  const game = new GameEngine();
  try {
    await game.execute('mission start deployment');
    await game.execute('ssh deploy');
    await game.execute('cd /notes');
    await game.execute('mission submit copper-lantern');
    await new CampaignStorage(name).save(game.snapshot());
    const restored = new GameEngine(await new CampaignStorage(name).load());
    expect(restored.world.host.id).toBe('deploy');
    expect(restored.world.session.workingDirectory).toBe('/notes');
    expect(restored.campaign.progress.tokens).toBe(3);
    expect(restored.world.host.filesystem.readFile('/notes/access.txt')).toContain(
      'copper-lantern',
    );
    restored.dispose();
  } finally {
    game.dispose();
    await Dexie.delete(name);
  }
});
