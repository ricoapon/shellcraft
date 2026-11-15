import Dexie from 'dexie';
import { IndexedDbStorage } from '../persistence/storage';
import { Session } from '../core/session';
import { GameEngine } from './engine';
import type { EngineSnapshot } from './engine';
import { World } from './world';
import { freshProgress } from './campaign';
import { resolvePath } from '../core/path';
import { missions, upgrades } from '../content/missions';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const path = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.includes('\0') &&
  value.length < 100_000;
const homePath = (value: unknown): value is string =>
  path(value) && value.startsWith('/home/') && resolvePath(value) === value;
const name = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value);

export function validateGameSave(value: unknown): EngineSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Not a Shellcraft save.');
  if (JSON.stringify(value).length > 20_000_000) throw new Error('Save exceeds 20 MB.');
  const state = structuredClone(value) as EngineSnapshot;
  if (
    !state.world ||
    !Array.isArray(state.world.hosts) ||
    !Array.isArray(state.world.connections) ||
    !state.progress ||
    !Number.isFinite(state.progress.tokens) ||
    state.progress.tokens < 0 ||
    !Array.isArray(state.progress.completed) ||
    !Array.isArray(state.progress.unlocked) ||
    !state.progress.observations ||
    !state.progress.playerData ||
    !state.shell ||
    !Array.isArray(state.shell.entries) ||
    state.shell.entries.length > 200 ||
    !state.settings ||
    !Array.isArray(state.settings.panels) ||
    !Array.isArray(state.settings.controllers) ||
    !['split', 'tabs'].includes(state.settings.layout) ||
    state.shell.entries.some(
      (entry) =>
        typeof entry.input !== 'string' ||
        !Array.isArray(entry.output) ||
        entry.output.some((line: unknown) => typeof line !== 'string'),
    )
  ) {
    throw new Error('Unsupported or damaged Shellcraft save.');
  }
  const invalid = () => {
    throw new Error('Unsupported or damaged Shellcraft save.');
  };
  if (
    state.world.hosts.length > 100 ||
    state.world.connections.length > 100 ||
    state.world.hosts.some(
      (host) =>
        !host ||
        !name(host.id) ||
        !Array.isArray(host.neighbors) ||
        host.neighbors.some((id: unknown) => !name(id)) ||
        !Array.isArray(host.filesystem) ||
        host.filesystem.length > 10_000 ||
        (host.writable !== undefined &&
          (!Array.isArray(host.writable) ||
            host.writable.some((prefix: unknown) => !path(prefix)))),
    ) ||
    state.world.connections.some(
      (connection) => !connection || !name(connection.host) || !path(connection.directory),
    )
  )
    invalid();
  const hostIds = new Set(state.world.hosts.map((host) => host.id));
  if (state.world.hosts.some((host) => host.neighbors.some((id) => !hostIds.has(id)))) invalid();
  if (
    new Set(state.progress.completed).size !== state.progress.completed.length ||
    state.progress.completed.some((id) => !missions.some((mission) => mission.id === id)) ||
    state.progress.unlocked.some((id) => !upgrades.some((upgrade) => upgrade.id === id)) ||
    !record(state.progress.observations) ||
    !record(state.progress.playerData)
  )
    invalid();
  for (const observation of Object.values(state.progress.observations)) {
    if (
      !record(observation) ||
      !name(observation.id) ||
      !Array.isArray(observation.connections) ||
      observation.connections.some((id: unknown) => !name(id))
    )
      invalid();
  }
  if (
    state.settings.panels.length > 12 ||
    state.settings.controllers.length > 12 ||
    typeof state.settings.vim !== 'boolean' ||
    (state.settings.supportVersion !== undefined &&
      (!Number.isInteger(state.settings.supportVersion) || state.settings.supportVersion < 1)) ||
    (state.settings.examplesInstalled !== undefined &&
      typeof state.settings.examplesInstalled !== 'boolean') ||
    (state.settings.screenRefreshMs !== undefined &&
      (!Number.isInteger(state.settings.screenRefreshMs) ||
        state.settings.screenRefreshMs < 100 ||
        state.settings.screenRefreshMs > 60_000)) ||
    (state.settings.startup !== undefined && !homePath(state.settings.startup)) ||
    state.settings.panels.some(
      (panel) =>
        !panel ||
        !name(panel.id) ||
        !homePath(panel.path) ||
        (panel.name !== undefined && !name(panel.name)) ||
        (panel.title !== undefined && typeof panel.title !== 'string'),
    ) ||
    state.settings.controllers.some(
      (controller) =>
        !controller ||
        !name(controller.id) ||
        !homePath(controller.path) ||
        typeof controller.enabled !== 'boolean' ||
        (controller.name !== undefined && !name(controller.name)),
    ) ||
    (state.settings.activePanel !== undefined && !name(state.settings.activePanel))
  )
    invalid();
  if (
    state.settings.editor &&
    (!homePath(state.settings.editor.path) ||
      typeof state.settings.editor.draft !== 'string' ||
      state.settings.editor.draft.length > 250_000 ||
      (state.settings.editor.saved !== undefined &&
        (typeof state.settings.editor.saved !== 'string' ||
          state.settings.editor.saved.length > 250_000)))
  )
    invalid();
  if (
    state.shell.entries.some(
      (entry) =>
        !entry ||
        entry.input.length > 4000 ||
        entry.output.length > 1 ||
        entry.output.some((line: string) => line.length > 80_000) ||
        (entry.workingDirectory !== undefined && !path(entry.workingDirectory)) ||
        (entry.host !== undefined && !name(entry.host)),
    )
  )
    invalid();
  if (state.progress.active) {
    const active = state.progress.active;
    const definition = missions.find((mission) => mission.id === active.id);
    if (
      !Array.isArray(active.nodes) ||
      !Array.isArray(active.history) ||
      !Array.isArray(active.queued) ||
      !Array.isArray(active.transfers) ||
      !Number.isInteger(active.tick) ||
      active.tick < 0 ||
      !definition ||
      ![0.5, 1, 2, 4].includes(active.speed) ||
      !['active', 'complete', 'failed'].includes(active.status) ||
      !Array.isArray(active.results) ||
      active.results.some((result: unknown) => typeof result !== 'string') ||
      !Array.isArray(active.traps) ||
      !record(active.prepared) ||
      !record(active.committed) ||
      !Number.isFinite(active.completedWork) ||
      typeof active.captured !== 'boolean' ||
      active.nodes.some(
        (node) =>
          !node ||
          !definition.hosts.some((host) => host.id === node.id) ||
          ![node.temperature, node.load, node.capacity, node.cooling].every(Number.isFinite) ||
          typeof node.online !== 'boolean' ||
          typeof node.service !== 'string',
      ) ||
      definition.hosts.some((host) => !hostIds.has(host.id)) ||
      active.nodes.length !== definition.hosts.length ||
      active.queued.length > 100 ||
      active.history.length > 400 ||
      active.transfers.some(
        (transfer) =>
          !transfer ||
          !hostIds.has(transfer.from) ||
          !hostIds.has(transfer.to) ||
          !Number.isFinite(transfer.amount) ||
          !Number.isFinite(transfer.remaining),
      )
    )
      throw new Error('Damaged mission state.');
    const validJob = (job: unknown) =>
      record(job) &&
      typeof job.id === 'string' &&
      typeof job.host === 'string' &&
      hostIds.has(job.host) &&
      Number.isFinite(job.remaining) &&
      Number.isFinite(job.priority) &&
      Number.isFinite(job.deadline);
    if (
      (active.jobs !== undefined &&
        (!Array.isArray(active.jobs) ||
          active.jobs.length > 10000 ||
          !active.jobs.every(validJob))) ||
      (active.targetWork !== undefined && !Number.isFinite(active.targetWork)) ||
      (active.deadline !== undefined && !Number.isFinite(active.deadline)) ||
      active.transfers.some(
        (transfer) =>
          transfer.jobs !== undefined &&
          (!Array.isArray(transfer.jobs) || !transfer.jobs.every(validJob)),
      )
    )
      invalid();
    // Playback always resumes paused after a load; the player must explicitly resume.
    active.paused = true;
  }
  const game = new GameEngine(structuredClone(state));
  try {
    return game.snapshot();
  } finally {
    game.dispose();
  }
}

/** Campaign saves replace the old single-host payload without discarding existing player files. */
export class CampaignStorage {
  private readonly database: Dexie;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly name = 'shellcraft') {
    this.database = new Dexie(name);
    this.database.version(1).stores({ saves: 'id' });
  }
  async load(): Promise<EngineSnapshot | undefined> {
    const record = await this.database.table('saves').get('workstation');
    if (!record) return;
    if (record.version === 3) return validateGameSave(record.state);
    const legacy = await new IndexedDbStorage(this.name).load();
    if (!legacy) return;
    const game = new GameEngine({
      world: new World(Session.fromSnapshot(legacy.session)).snapshot(),
      progress: freshProgress(),
      shell: legacy.shell,
      settings: { panels: [], controllers: [], layout: 'split', vim: false },
    });
    try {
      return game.snapshot();
    } finally {
      game.dispose();
    }
  }
  async save(state: EngineSnapshot): Promise<void> {
    const snapshot = structuredClone(state);
    if (JSON.stringify(snapshot).length > 20_000_000) throw new Error('Save exceeds 20 MB.');
    this.pending = this.pending
      .catch(() => undefined)
      .then(() =>
        this.database.table('saves').put({ id: 'workstation', version: 3, state: snapshot }),
      );
    await this.pending;
  }
}
