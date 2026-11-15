import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
let game;
try {
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { missions, upgrades } = await server.ssrLoadModule('/src/content/missions.ts');
  const { validateGameSave } = await server.ssrLoadModule('/src/game/save.ts');
  game = new GameEngine();
  game.campaign.progress.completed = missions.slice(0, 10).map((mission) => mission.id);
  game.campaign.progress.unlocked = upgrades.map((upgrade) => upgrade.id);
  game.campaign.progress.tokens = 15;
  for (const command of [
    'mission start thermal',
    'ssh compute-a',
    'startup /home/startup.js',
    'screen add /home/screens/network.js',
    'screen add /home/screens/telemetry.js',
    'controller add /home/controllers/balance.js',
    'simulation step 3',
  ]) {
    await game.execute(command);
    if (game.view().lastError) throw new Error(game.view().lastError.message);
  }
  game.openEditor('/home/controllers/balance.js');
  game.settings.layout = 'tabs';
  game.settings.activePanel = 'telemetry';
  const directory = new URL('../examples/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('showcase-save.json', directory),
    JSON.stringify(
      {
        format: 'shellcraft',
        version: 3,
        state: validateGameSave(game.snapshot()),
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Created examples/showcase-save.json. Use save import in the terminal to open it.');
} finally {
  game?.dispose();
  await server.close();
}
