import Dexie from 'dexie';
import { MAX_ENTRIES, MAX_INPUT_LENGTH, MAX_OUTPUT_LENGTH } from '../core/shell';
import type { ShellState, TranscriptEntry } from '../core/shell';
import { Session } from '../core/session';
import type { SessionSnapshot } from '../core/session';

export interface GameState {
  readonly shell: ShellState;
  readonly session: SessionSnapshot;
}

export interface GameStorage {
  load(): Promise<GameState | undefined>;
  save(state: GameState): Promise<void>;
}

function isEntry(value: unknown): value is TranscriptEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TranscriptEntry>;
  return (
    typeof entry.input === 'string' &&
    entry.input.length <= MAX_INPUT_LENGTH &&
    (entry.workingDirectory === undefined ||
      (typeof entry.workingDirectory === 'string' &&
        entry.workingDirectory.startsWith('/') &&
        entry.workingDirectory.length <= MAX_INPUT_LENGTH &&
        !entry.workingDirectory.includes('\0'))) &&
    Array.isArray(entry.output) &&
    entry.output.length <= 1 &&
    entry.output.every(
      (line: unknown) => typeof line === 'string' && line.length <= MAX_OUTPUT_LENGTH,
    )
  );
}

// Validate stored data at the boundary. Unsupported saves are preserved, not reset.
function decodeShell(value: unknown): ShellState {
  const shell = value as Partial<ShellState> | null;
  if (
    !Array.isArray(shell?.entries) ||
    shell.entries.length > MAX_ENTRIES ||
    !shell.entries.every(isEntry)
  ) {
    throw new Error('Unsupported or damaged save.');
  }
  return { entries: shell.entries };
}

function decodeSave(value: unknown): GameState {
  const record = value as { version?: unknown; state?: unknown } | null;
  // Version 1 contained only the transcript; preserve it and seed a home filesystem.
  if (record?.version === 1) {
    return { shell: decodeShell(record.state), session: Session.createHome().snapshot() };
  }
  const state = record?.state as Partial<GameState> | null;
  if (record?.version !== 2 || !state) throw new Error('Unsupported or damaged save.');
  const shell = decodeShell(state.shell);
  const session = Session.fromSnapshot(state.session);
  return { shell, session: session.snapshot() };
}

export class IndexedDbStorage implements GameStorage {
  private readonly database: Dexie;
  // Serialize writes so an older state can never finish after a newer one.
  private pending: Promise<unknown> = Promise.resolve();

  constructor(databaseName = 'shellcraft') {
    this.database = new Dexie(databaseName);
    this.database.version(1).stores({ saves: 'id' });
  }

  async load(): Promise<GameState | undefined> {
    const record: unknown = await this.database.table('saves').get('workstation');
    return record === undefined ? undefined : decodeSave(record);
  }

  async save(state: GameState): Promise<void> {
    // Capture now: queued writes must not observe later filesystem changes.
    const snapshot = structuredClone(state);
    // Report a failed write to its caller, but allow a later save to retry.
    this.pending = this.pending
      .catch(() => undefined)
      .then(() =>
        this.database.table('saves').put({ id: 'workstation', version: 2, state: snapshot }),
      );
    await this.pending;
  }
}
