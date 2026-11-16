import { VirtualFileSystem } from '../core/filesystem';
import { missions, createInstance } from '../content/missions';
import { World } from './world';
export interface MissionState {
  id: string;
  seed: number;
  status: 'active' | 'complete';
  hintsUsed: number;
  discovered: string[];
}
export interface Progress {
  completed: string[];
  stars: Record<string, number>;
  playerData: Record<string, unknown>;
  active?: MissionState;
}
export function freshProgress(): Progress {
  return { completed: [], stars: {}, playerData: {} };
}
export class Campaign {
  constructor(
    readonly world: World,
    readonly progress: Progress = freshProgress(),
  ) {}
  get definition() {
    return missions.find((m) => m.id === this.progress.active?.id);
  }
  get active(): MissionState {
    if (!this.progress.active) throw new Error('No active level. Use mission list.');
    return this.progress.active;
  }
  available(id: string) {
    const level = missions.find((m) => m.id === id);
    return !!level && (!level.prerequisite || this.progress.completed.includes(level.prerequisite));
  }
  capabilities(): string[] {
    return [
      'files',
      'scripting',
      ...(this.progress.completed.includes('files-2') ? ['network'] : []),
    ];
  }
  requireCapability(id: string) {
    if (!this.capabilities().includes(id))
      throw new Error('Networking opens after files-2. Use mission list.');
  }
  start(id: string, seed = crypto.getRandomValues(new Uint32Array(1))[0]): string[] {
    const level = missions.find((m) => m.id === id);
    if (!level) throw new Error('Unknown level: ' + id + '. Use mission list.');
    if (!this.available(id))
      throw new Error(
        'Complete ' + level.prerequisite + ' first. Other available levels are listed by mission.',
      );
    const instance = createInstance(id, seed);
    this.world.clearRemoteHosts();
    for (const host of instance.hosts) {
      const filesystem = new VirtualFileSystem();
      for (const [path, text] of Object.entries(host.files)) {
        let parent = '';
        for (const part of path.split('/').slice(1, -1)) {
          parent += '/' + part;
          try {
            filesystem.stat(parent);
          } catch {
            filesystem.mkdir(parent);
          }
        }
        filesystem.writeFile(path, text);
      }
      this.world.addHost({ id: host.id, filesystem: filesystem.snapshot(), neighbors: host.links });
    }
    this.progress.active = { id, seed, status: 'active', hintsUsed: 0, discovered: [level.entry] };
    this.world.enter(level.entry);
    return this.banner();
  }
  banner(): string[] {
    const level = this.definition!;
    return [
      `${level.id} — ${level.title}`,
      level.briefing,
      'You are connected to ' +
        this.world.host.id +
        '. Your scripts travel with you; edit and run use your personal /home code workspace.',
      'Submit the password with mission submit <value>. For an optional automation star: mission submit --script /home/solve.sc.',
      'Need a nudge? mission hint gives staged clues. mission leave returns to your workspace.',
    ];
  }
  leave() {
    this.world.clearRemoteHosts();
    this.progress.active = undefined;
    return [
      'Back in your workspace. Your files and stars are kept.',
      'Use mission to choose a level. Starting a level creates a fresh instance.',
    ];
  }
  hint(): string {
    const hints = this.definition?.hints;
    if (!hints) return 'Choose a level with mission start <id>.';
    const index = Math.min(this.active.hintsUsed++, hints.length - 1);
    return `Hint ${index + 1}/${hints.length}: ${hints[index]}`;
  }
  neighbors(id = this.world.host.id): string[] {
    this.requireHost(id);
    const neighbors = [...this.world.requireHost(id).neighbors];
    for (const host of neighbors)
      if (!this.active.discovered.includes(host)) this.active.discovered.push(host);
    return neighbors;
  }
  requireHost(id: string) {
    if (
      id === 'home' ||
      !this.progress.active ||
      !this.active.discovered.includes(id) ||
      !this.world.canReach(id)
    )
      throw new Error(
        'Host unavailable: ' + id + '. Discover it with neighbors. Home is outside the level.',
      );
  }
  assertWritable(_path: string) {
    if (this.world.host.id !== 'home')
      throw new Error(
        'Level evidence is read-only. Use edit /home/solve.sc for your personal tools.',
      );
  }
  submit(answer: string): string[] {
    if (answer.trim() !== createInstance(this.active.id, this.active.seed).answer)
      return ['That password does not match. Check the evidence or use mission hint.'];
    return this.award(this.active.id, 1);
  }
  award(id: string, stars: number): string[] {
    const previous = this.progress.stars[id] ?? 0;
    this.progress.stars[id] = Math.max(previous, stars);
    if (!this.progress.completed.includes(id)) this.progress.completed.push(id);
    if (this.progress.active?.id === id) this.active.status = 'complete';
    return [
      `LEVEL COMPLETE — ${id} ${'★'.repeat(this.progress.stars[id])}${'☆'.repeat(2 - this.progress.stars[id])}`,
      previous >= stars
        ? 'Your previous best is kept.'
        : stars === 2
          ? 'Your program solved all verification cases without intervention.'
          : 'Solved. You can return later for the automation star.',
      ...(id === 'files-1' && previous === 0
        ? [
            'Try building your own search for files-2. edit /home/solve.sc and guide scripts help you get started.',
          ]
        : []),
      ...(id === 'files-2' && previous === 0
        ? ['Networking unlocked. Continue with files-3 or try mission start network-1.']
        : []),
      ...(['files', 'network'] as const).flatMap((group) => {
        const next = missions.find(
          (level) =>
            level.kind === group &&
            this.available(level.id) &&
            !this.progress.completed.includes(level.id),
        );
        return next ? [`Next in ${group}: mission start ${next.id} — ${next.title}.`] : [];
      }),
      ...(this.progress.completed.length === missions.length
        ? [
            'Both branches complete. Revisit any level for an optional automation star or improve your tools.',
          ]
        : []),
      'Use mission to choose what to tackle next, or mission leave to return home.',
    ];
  }
}
