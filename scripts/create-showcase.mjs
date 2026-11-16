import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
let game;
try {
  const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { createInstance } = await server.ssrLoadModule('/src/content/missions.ts');
  const { validateGameSave } = await server.ssrLoadModule('/src/game/save.ts');
  game = new GameEngine();
  for (const id of ['files-1', 'files-2']) {
    game.campaign.start(id, 42);
    game.campaign.submit(createInstance(id, 42).answer);
  }
  game.campaign.start('network-1', 42);
  await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../examples/showcase-save.json', import.meta.url),
    JSON.stringify(
      { format: 'shellcraft', version: 4, state: validateGameSave(game.snapshot()) },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Created examples/showcase-save.json: network branch available, with your own code left to write.',
  );
} finally {
  game?.dispose();
  await server.close();
}
