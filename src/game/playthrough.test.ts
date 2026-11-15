import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions, upgrades } from '../content/missions';
import { validateGameSave } from './save';

it('plays the complete campaign with earned tokens, saved tools, screens, and controllers', async () => {
  let game = new GameEngine();
  async function run(command: string) {
    const reply = await game.execute(command);
    expect(game.view().lastError, `${command}\n${reply.output.join('\n')}`).toBeUndefined();
    return reply.output.join('\n');
  }
  try {
    for (const mission of missions) {
      await run(`mission start ${mission.id}`);
      await run(`ssh ${mission.entry}`);
      if (mission.id === 'deployment') {
        expect(await run('cat /notes/access.txt')).toContain('copper-lantern');
      }
      if (mission.id === 'archive') {
        expect(await run('run /home/scripts/search.js RECOVERY_KEY /archive')).toContain(
          'glass-orbit',
        );
      }
      if (mission.id === 'nested') {
        await run('startup /home/startup.js');
        expect(await run('find-text RECOVERY_KEY /archive')).toContain('winter-signal');
      }
      if (mission.id === 'discovery') {
        expect(await run('run /home/scripts/crawl.js TARGET_KEY')).toContain('violet-compass');
      }
      if (mission.answer) await run(`mission submit ${mission.answer}`);
      if (mission.id === 'traffic') {
        await run('screen add /home/screens/network.js');
        await run('inspect collector');
        await run('link collector outside off');
      }
      if (mission.id === 'isolation') {
        await run('link core bridge off');
        await run('link clinic bridge off');
      }
      if (mission.id === 'repair') {
        await run('ssh api');
        await run('ssh db');
        await run('write /etc/app/database.json \'{"port":5432,"enabled":true}\'');
        await run('service db restart');
        await run('service api restart');
        await run('service frontend restart');
      }
      if (mission.kind === 'thermal') {
        await run('screen add /home/screens/telemetry.js');
        await run('controller add /home/controllers/balance.js');
        await run('simulation step 45');
        await run('controller off balance');
      }
      if (mission.id === 'moving') {
        await run('trap ring-3 3');
        await run('simulation step 3');
      }
      if (mission.id === 'coordination') {
        for (const host of ['database', 'api-node', 'web-node']) await run(`prepare ${host} r2`);
        await run('controller add /home/controllers/update.js');
        await run('simulation step');
      }
      expect(
        game.campaign.active.status,
        `${mission.id}: ${JSON.stringify(game.campaign.active.nodes)}`,
      ).toBe('complete');
      for (const upgrade of upgrades) {
        if (
          game.campaign.progress.completed.length >= upgrade.after &&
          !game.campaign.progress.unlocked.includes(upgrade.id)
        ) {
          await run(`upgrade buy ${upgrade.id}`);
        }
      }
      const snapshot = validateGameSave(game.snapshot());
      game.dispose();
      game = new GameEngine(snapshot);
      await game.initialize();
      expect(game.view().panels.every((panel) => !panel.error)).toBe(true);
    }
    expect(game.campaign.progress.completed).toEqual(missions.map((mission) => mission.id));
    expect(game.campaign.progress.unlocked).toHaveLength(upgrades.length);
    expect(game.campaign.progress.tokens).toBeGreaterThan(0);
  } finally {
    game.dispose();
  }
}, 20_000);
