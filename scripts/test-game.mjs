import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** Browser-free driver for the real game. No browser storage is opened. */
export async function createTestSession(snapshot) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  try {
    const { GameEngine } = await server.ssrLoadModule('/src/game/engine.ts');
    const { validateGameSave } = await server.ssrLoadModule('/src/game/save.ts');
    let game = new GameEngine(snapshot === undefined ? undefined : validateGameSave(snapshot));
    return {
      async request(input) {
        try {
          if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Request must be a JSON object.');
          if (input.reset === true) {
            game.dispose();
            game = new GameEngine();
            return { ok: true, view: game.view() };
          }
          if (input.snapshot === true) return { ok: true, snapshot: game.snapshot() };
          if (input.inspect === true) return { ok: true, view: game.view() };
          if (input.analyze) {
            const {
              source,
              offset = String(input.analyze.source ?? '').length,
              path = '/home/test.sc',
              terminal = false,
            } = input.analyze;
            if (typeof source !== 'string') throw new Error('analyze.source must be a string.');
            return { ok: true, language: game.languageTools(source, path, offset, terminal) };
          }
          let source = input.command,
            cleanup;
          if (input.script !== undefined) {
            if (
              typeof input.script !== 'string' ||
              !Array.isArray(input.args ?? []) ||
              (input.args ?? []).some((arg) => typeof arg !== 'string')
            )
              throw new Error('script must be source text and args must be strings.');
            const path = '/home/.test-harness.sc',
              fs = game.world.home.filesystem;
            let saved;
            try {
              saved = fs.readFile(path);
            } catch {
              /* Temporary file is normally absent. */
            }
            fs.writeFile(path, input.script);
            cleanup = () => {
              if (saved === undefined) fs.removeFile(path);
              else fs.writeFile(path, saved);
            };
            source =
              'run ' +
              JSON.stringify(path) +
              (input.args ?? []).map((arg) => ' ' + JSON.stringify(arg)).join('');
          }
          if (typeof source !== 'string')
            throw new Error('Provide command, script, analyze, inspect, snapshot, or reset.');
          try {
            const reply = await game.execute(source);
            return { ok: !reply.error, ...reply, view: game.view() };
          } finally {
            cleanup?.();
          }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      snapshot: () => game.snapshot(),
      async close() {
        game.dispose();
        await server.close();
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

const usage = `Shellcraft test driver
  npm --silent run game -- --json -c 'mission start files-1' -c 'ls /notes'
  npm --silent run game -- --script ./program.sc
  npm --silent run game -- --jsonl
Options:
  -c, --command SOURCE  Execute source; repeat for one persistent session.
  --script FILE         Run local .sc source with a fresh script scope.
  --json                Print one JSON response per operation.
  --jsonl               Read JSON requests, one per stdin line.
  --state FILE          Explicit test save; load if present and save afterward.
  --help                Show this help.
Requests: {"command":"..."}, {"script":"...","args":[]},
          {"inspect":true}, {"snapshot":true}, {"reset":true},
          {"analyze":{"source":"...","offset":0,"path":"/home/test.sc"}}
No browser or browser saves are used. Session state is in memory unless --state is supplied.
`;
async function main(args) {
  const requests = [];
  let json = false,
    jsonl = false,
    stateFile;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      console.log(usage);
      return;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--jsonl') {
      json = true;
      jsonl = true;
      continue;
    }
    if (['--command', '-c', '--script', '--state'].includes(arg)) {
      const value = args[++i];
      if (value === undefined) throw new Error('Missing value for ' + arg);
      if (arg === '--state') stateFile = resolve(value);
      else if (arg === '--script')
        requests.push({ script: await readFile(resolve(value), 'utf8') });
      else requests.push({ command: value });
      continue;
    }
    throw new Error('Unknown option: ' + arg);
  }
  if (!requests.length && !jsonl) {
    console.log(usage);
    return;
  }
  let snapshot;
  if (stateFile) {
    try {
      const saved = JSON.parse(await readFile(stateFile, 'utf8'));
      snapshot = saved.state ?? saved;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const session = await createTestSession(snapshot);
  const execute = async (request) => {
    const reply = await session.request(request);
    if (json) console.log(JSON.stringify(reply));
    else {
      for (const line of reply.output ?? []) console.log(line);
      if (reply.error && !reply.output?.includes(reply.error)) console.error(reply.error);
    }
    if (!reply.ok) process.exitCode = 1;
    if (stateFile)
      await writeFile(
        stateFile,
        JSON.stringify({ format: 'shellcraft', version: 4, state: session.snapshot() }, null, 2) +
          '\n',
      );
  };
  try {
    for (const request of requests) await execute(request);
    if (jsonl) {
      const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          await execute(JSON.parse(line));
        } catch (error) {
          console.log(JSON.stringify({ ok: false, error: error.message }));
          process.exitCode = 1;
        }
      }
    }
  } finally {
    await session.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
