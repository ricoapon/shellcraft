import Dexie from 'dexie';
import { GameEngine } from './engine';
import type { EngineSnapshot, WorkstationSettings } from './engine';
import { World } from './world';
import type { WorldSnapshot } from './world';
import { VirtualFileSystem } from '../core/filesystem';
import { freshProgress } from './campaign';
import type { Progress } from './campaign';
import { missions } from '../content/missions';
import { resolvePath } from '../core/path';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => {
  throw new Error('Unsupported or damaged Shellcraft save. The existing save is preserved.');
};
const codePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith('/home/') &&
  value.length < 4000 &&
  resolvePath(value) === value;
function settings(value: unknown): WorkstationSettings {
  if (!record(value) || typeof value.vim !== 'boolean') return invalid();
  const result: WorkstationSettings = {
    vim: value.vim,
    examplesInstalled: value.examplesInstalled === true,
    languageInstalled: value.languageInstalled === true,
  };
  if (value.editor !== undefined) {
    const file = value.editor;
    if (
      !record(file) ||
      !codePath(file.path) ||
      typeof file.draft !== 'string' ||
      file.draft.length > 250000 ||
      (file.line !== undefined && (!Number.isInteger(file.line) || Number(file.line) < 1))
    )
      return invalid();
    result.editor = { path: file.path, draft: file.draft, line: file.line as number | undefined };
  }
  return result;
}
/** Whitelist save data: transcripts and obsolete systems are never copied into v4. */
export function validateGameSave(value: unknown): EngineSnapshot {
  if (
    !record(value) ||
    JSON.stringify(value).length > 20000000 ||
    !record(value.world) ||
    !record(value.progress)
  )
    return invalid();
  const incoming = value.world;
  if (incoming.home === undefined && Array.isArray(incoming.hosts)) {
    const home = incoming.hosts.find((host: unknown) => record(host) && host.id === 'home');
    if (!record(home)) return invalid();
    const world = new World();
    const files = new VirtualFileSystem(home.filesystem).snapshot();
    const migrated = settings(value.settings);
    migrated.examplesInstalled = false;
    if (
      record(value.progress.playerData) &&
      JSON.stringify(value.progress.playerData).length > 250000
    )
      return invalid();
    const game = new GameEngine({
      world: { ...world.snapshot(), home: files },
      progress: {
        ...freshProgress(),
        playerData: record(value.progress.playerData)
          ? structuredClone(value.progress.playerData)
          : {},
      },
      settings: migrated,
    });
    return game.snapshot();
  }
  if (
    !Array.isArray(incoming.home) ||
    !Array.isArray(incoming.hosts) ||
    !Array.isArray(incoming.connections) ||
    incoming.hosts.length > 100 ||
    incoming.connections.length > 100
  )
    return invalid();
  const p = value.progress;
  if (
    !Array.isArray(p.completed) ||
    !record(p.stars) ||
    !record(p.playerData) ||
    JSON.stringify(p.playerData).length > 250000
  )
    return invalid();
  const known = (id: unknown): id is string =>
    typeof id === 'string' && missions.some((m) => m.id === id);
  if (
    new Set(p.completed).size !== p.completed.length ||
    !p.completed.every(known) ||
    Object.entries(p.stars).some(
      ([id, stars]) => !known(id) || ![1, 2].includes(Number(stars)) || typeof stars !== 'number',
    ) ||
    p.completed.some((id) => !Object.hasOwn(p.stars as object, id)) ||
    Object.keys(p.stars).some((id) => !p.completed || !(p.completed as string[]).includes(id))
  )
    return invalid();
  const progress: Progress = {
    completed: [...p.completed] as string[],
    stars: { ...p.stars } as Record<string, number>,
    playerData: structuredClone(p.playerData),
  };
  const world = new World(undefined, incoming as unknown as WorldSnapshot);
  for (const host of world.hosts.values())
    for (const neighbor of host.neighbors) if (!world.hosts.has(neighbor)) return invalid();
  if (p.active !== undefined) {
    const active = p.active;
    if (
      !record(active) ||
      !known(active.id) ||
      !Number.isInteger(active.seed) ||
      Number(active.seed) < 0 ||
      Number(active.seed) > 0xffffffff ||
      !['active', 'complete'].includes(String(active.status)) ||
      !Number.isInteger(active.hintsUsed) ||
      Number(active.hintsUsed) < 0 ||
      !Array.isArray(active.discovered) ||
      !active.discovered.every((id) => typeof id === 'string' && world.hosts.has(id))
    )
      return invalid();
    const definition = missions.find((m) => m.id === active.id)!;
    if (
      incoming.connections.length === 0 ||
      !record(incoming.connections[0]) ||
      incoming.connections[0].host !== definition.entry ||
      !active.discovered.includes(definition.entry)
    )
      return invalid();
    if (active.status === 'complete' && !progress.completed.includes(active.id)) return invalid();
    if (
      incoming.connections.some(
        (connection) =>
          !record(connection) || !(active.discovered as unknown[]).includes(connection.host),
      )
    )
      return invalid();
    for (let i = 1; i < incoming.connections.length; i++) {
      const previous = incoming.connections[i - 1] as { host: string },
        current = incoming.connections[i] as { host: string };
      if (!world.requireHost(previous.host).neighbors.has(current.host)) return invalid();
    }
    progress.active = {
      id: active.id,
      seed: Number(active.seed),
      status: active.status as 'active' | 'complete',
      hintsUsed: Number(active.hintsUsed),
      discovered: [...new Set(active.discovered)] as string[],
    };
  } else if (incoming.hosts.length || incoming.connections.length) return invalid();
  const config = settings(value.settings);
  if (config.editor) {
    const file = config.editor;
    world.home.filesystem.list(file.path.slice(0, file.path.lastIndexOf('/')));
    const entry = world.home.filesystem.snapshot().find((f) => f.path === file.path);
    if (entry?.type === 'directory') return invalid();
    file.saved = entry?.type === 'file' ? entry.content : undefined;
  }
  return { world: world.snapshot(), progress, settings: config };
}
export class CampaignStorage {
  private readonly database: Dexie;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(name = 'shellcraft') {
    this.database = new Dexie(name);
    this.database.version(1).stores({ saves: 'id' });
  }
  async load(): Promise<EngineSnapshot | undefined> {
    const saved = await this.database.table('saves').get('workstation');
    if (!saved) return;
    if (saved.version === 3 || saved.version === 4) return validateGameSave(saved.state);
    if (saved.version === 1 || saved.version === 2) {
      const game = new GameEngine();
      const snapshot = game.snapshot();
      if (saved.version === 2)
        snapshot.world.home = new VirtualFileSystem(saved.state?.session?.filesystem).snapshot();
      snapshot.settings.examplesInstalled = false;
      return new GameEngine(snapshot).snapshot();
    }
    return invalid();
  }
  async save(value: EngineSnapshot) {
    const snapshot = validateGameSave(value);
    this.pending = this.pending
      .catch(() => undefined)
      .then(() =>
        this.database.table('saves').put({ id: 'workstation', version: 4, state: snapshot }),
      );
    await this.pending;
  }
}
