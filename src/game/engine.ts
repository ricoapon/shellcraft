import { parseCommand } from '../core/parse';
import { resolvePath } from '../core/path';
import { builtinCommands } from '../commands';
import { CommandRegistry } from '../commands/registry';
import type { CommandSystem } from '../commands/system';
import type { ShellState } from '../core/shell';
import { SessionFileSystem } from '../core/session-filesystem';
import { World } from './world';
import type { WorldSnapshot } from './world';
import { Campaign, freshProgress } from './campaign';
import type { Progress } from './campaign';
import { missions } from '../content/missions';
import { installHomeFiles } from '../content/home';
import { welcomeMessage } from '../content/player-support';
import { PlayerModule } from '../runtime/player-runtime';
export interface WorkstationSettings {
  vim: boolean;
  editor?: { path: string; draft: string; saved?: string; line?: number };
  examplesInstalled?: boolean;
}
/** Terminal output and readline history deliberately have no place in a save. */
export interface EngineSnapshot {
  world: WorldSnapshot;
  progress: Progress;
  settings: WorkstationSettings;
}
export interface EngineReply {
  output: readonly string[];
  clearScreen?: true;
  host: string;
  directory: string;
  action?: 'export' | 'import';
}
export interface EngineView {
  host: string;
  directory: string;
  mission?: { id: string; title: string; status: string };
  settings: WorkstationSettings;
}
export class GameEngine {
  readonly world: World;
  readonly campaign: Campaign;
  readonly settings: WorkstationSettings;
  readonly system: CommandSystem;
  private readonly commands: CommandRegistry;
  shell: ShellState = { entries: [] };
  private output: string[] = [];
  private readCount = 0;
  constructor(snapshot?: EngineSnapshot) {
    this.world = new World(undefined, snapshot?.world);
    this.campaign = new Campaign(this.world, snapshot?.progress ?? freshProgress());
    this.settings = snapshot?.settings ?? { vim: false };
    if (!this.settings.examplesInstalled) {
      installHomeFiles(this.world.home.filesystem);
      this.settings.examplesInstalled = true;
    }
    if (this.settings.editor) {
      const file = this.settings.editor;
      const saved = this.world.home.filesystem.snapshot().find((entry) => entry.path === file.path);
      file.saved = saved?.type === 'file' ? saved.content : undefined;
    }
    this.system = this.createCommandSystem();
    this.commands = new CommandRegistry(builtinCommands, this.system);
  }
  async initialize() {
    this.banner();
  }
  banner() {
    this.shell = {
      entries: [
        {
          input: '[welcome]',
          host: this.world.host.id,
          workingDirectory: this.world.session.workingDirectory,
          output: this.campaign.definition ? this.campaign.banner() : welcomeMessage(),
        },
      ],
    };
  }
  private print(value: unknown) {
    const line = typeof value === 'string' ? value : JSON.stringify(value);
    if (this.output.length >= 500 || this.output.join('').length + line.length > 80000)
      throw new Error('Output limit reached. Print a summary.');
    this.output.push(line);
  }
  async execute(input: string): Promise<EngineReply> {
    this.output = [];
    let clearScreen: true | undefined, action: EngineReply['action'];
    const host = this.world.host.id,
      directory = this.world.session.workingDirectory;
    if (!input.trim()) return { output: [], host, directory };
    try {
      if (input.length > 4000)
        throw new Error('Command is too long (maximum 4000 characters). Put programs in a script.');
      const [name, ...args] = parseCommand(input);
      const result = await this.commands.execute(name, args);
      if ('clearScreen' in result && result.clearScreen) clearScreen = true;
      if ('action' in result) action = result.action;
      const lines = Array.isArray(result)
        ? result
        : 'output' in result
          ? (result.output ?? [])
          : [];
      for (const line of lines) this.print(line);
    } catch (error) {
      this.output.push(error instanceof Error ? error.message : String(error));
    }
    const entry = {
      input: input.slice(0, 4000),
      output: this.output.length ? [this.output.join('\n')] : [],
      host,
      workingDirectory: directory,
    };
    this.shell = {
      entries: clearScreen
        ? this.output.length
          ? [
              {
                ...entry,
                input: '[level]',
                host: this.world.host.id,
                workingDirectory: this.world.session.workingDirectory,
              },
            ]
          : []
        : [...this.shell.entries, entry].slice(-200),
    };
    return {
      output: this.output,
      clearScreen,
      host: this.world.host.id,
      directory: this.world.session.workingDirectory,
      action,
    };
  }
  private createCommandSystem(): CommandSystem {
    return {
      capabilities: { has: (id) => this.campaign.capabilities().includes(id) },
      commands: { list: () => this.commands.available() },
      filesystem: new SessionFileSystem(
        () => this.world.session,
        (path) => this.campaign.assertWritable(path),
      ),
      session: {
        host: () => this.world.host.id,
        connect: (id) => {
          this.campaign.requireHost(id);
          this.world.connect(id);
        },
        exit: () => this.world.exit(),
      },
      network: { neighbors: (id) => this.campaign.neighbors(id) },
      mission: {
        current: () => {
          const m = this.campaign.definition;
          return m
            ? {
                id: m.id,
                title: m.title,
                kind: m.kind,
                briefing: m.briefing,
                status: this.campaign.active.status,
              }
            : undefined;
        },
        list: (group) =>
          missions
            .filter((m) => !group || m.kind === group)
            .map((m) => ({
              id: m.id,
              title: m.title,
              group: m.kind,
              stars: this.campaign.progress.stars[m.id] ?? 0,
              available: this.campaign.available(m.id),
              prerequisite: m.prerequisite,
            })),
        start: (id) => this.campaign.start(id),
        reset: () => this.campaign.start(this.campaign.active.id),
        leave: () => this.campaign.leave(),
        briefing: () => (this.campaign.definition ? this.campaign.banner() : welcomeMessage()),
        hint: () => this.campaign.hint(),
        status: () => ({
          level: this.campaign.progress.active,
          stars: this.campaign.progress.stars,
          capabilities: this.campaign.capabilities(),
        }),
        submit: (answer) => this.campaign.submit(answer),
        verify: (path, seed) => this.verify(path, seed),
      },
      editor: { open: (path, vim) => this.openEditor(path, undefined, vim) },
      scripts: { run: (path, args) => this.run(path, [...args]) },
    };
  }
  private homePath(path: string) {
    const absolute = resolvePath(path, '/home');
    if (!absolute.startsWith('/home/')) throw new Error('Your code workspace uses /home paths.');
    return absolute;
  }
  openEditor(path: string, line?: number, vim = false) {
    const absolute = this.homePath(path),
      fs = this.world.home.filesystem;
    if (this.settings.editor && this.settings.editor.path !== absolute)
      throw new Error('Close the current editor first.');
    if (this.settings.editor) {
      this.settings.editor.line = line;
      this.settings.vim = vim;
      return;
    }
    const parent = absolute.slice(0, absolute.lastIndexOf('/'));
    const exists = fs.list(parent).some((f) => f.path === absolute);
    const saved = exists ? fs.readFile(absolute) : undefined;
    this.settings.editor = {
      path: absolute,
      draft:
        saved ??
        'export function main(ctx, args) {\n  // Read the evidence and submit your result here.\n}\n',
      saved,
      line,
    };
    this.settings.vim = vim;
  }
  saveEditor(text: string) {
    const file = this.settings.editor;
    if (!file) throw new Error('No editor file is open.');
    if (text.length > 250000) throw new Error('File exceeds 250 KB.');
    this.world.home.filesystem.writeFile(file.path, text);
    file.draft = text;
    file.saved = text;
  }
  async closeEditor(action: 'save' | 'discard' | 'run' = 'discard', text?: string) {
    const file = this.settings.editor;
    if (!file) throw new Error('No editor file is open.');
    if (!['save', 'discard', 'run'].includes(action)) throw new Error('Unknown editor action.');
    if (action !== 'discard') this.saveEditor(text ?? file.draft);
    this.settings.editor = undefined;
    if (action === 'run') await this.execute('run ' + JSON.stringify(file.path));
  }
  async run(path: string, args: string[] = []) {
    this.campaign.requireCapability('scripting');
    path = this.homePath(path);
    this.readCount = 0;
    const module = await PlayerModule.create(
      path,
      (file) => this.world.home.filesystem.readFile(this.homePath(file)),
      (name, values) => this.api(name, values),
    );
    try {
      module.invoke('main', args);
    } finally {
      module.dispose();
    }
    this.print(`Script finished: ${this.readCount} files read.`);
  }
  private api(name: string, args: unknown[]): unknown {
    const text = (index: number, fallback = '') =>
      args[index] == null ? fallback : String(args[index]);
    if (name === 'print') {
      this.print(args[0]);
      return;
    }
    if (name === 'session.info')
      return { host: this.world.host.id, workingDirectory: this.world.session.workingDirectory };
    if (name === 'session.connect') {
      this.campaign.requireHost(text(0));
      this.world.connect(text(0));
      return;
    }
    if (name === 'session.exit') {
      this.world.exit();
      return;
    }
    if (name === 'network.neighbors') {
      this.campaign.requireCapability('network');
      return this.campaign.neighbors(args[0] == null ? undefined : text(0));
    }
    if (name === 'network.connect') {
      this.campaign.requireCapability('network');
      this.campaign.requireHost(text(0));
      return text(0);
    }
    if (name.startsWith('fs.')) {
      const explicit = args[0] != null,
        id = explicit ? text(0) : this.world.host.id;
      if (explicit) this.campaign.requireHost(id);
      const fs = explicit ? this.world.requireHost(id).filesystem : this.world.session.filesystem;
      const cwd = explicit ? '/' : this.world.session.workingDirectory;
      const path = text(1, '.');
      if (name === 'fs.list') return fs.list(path, cwd);
      if (name === 'fs.stat') return fs.stat(path, cwd);
      if (name === 'fs.read') {
        const content = fs.readFile(path, cwd);
        this.readCount++;
        return content;
      }
      throw new Error(
        'Script filesystem access is read-only. Store your own data with ctx.storage.',
      );
    }
    if (name === 'storage.get')
      return Object.hasOwn(this.campaign.progress.playerData, text(0))
        ? this.campaign.progress.playerData[text(0)]
        : undefined;
    if (name === 'storage.set') {
      const replacement = { ...this.campaign.progress.playerData, [text(0)]: args[1] };
      if (JSON.stringify(replacement).length > 250000)
        throw new Error('Player storage limit reached (250 KB).');
      Object.defineProperty(this.campaign.progress.playerData, text(0), {
        value: structuredClone(args[1]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      return;
    }
    if (name === 'storage.delete') {
      delete this.campaign.progress.playerData[text(0)];
      return;
    }
    if (name === 'mission.briefing') return this.campaign.definition?.briefing;
    if (name === 'mission.status')
      return {
        id: this.campaign.progress.active?.id,
        status: this.campaign.progress.active?.status,
      };
    if (name === 'mission.submit') {
      for (const line of this.campaign.submit(text(0))) this.print(line);
      return this.campaign.active.status === 'complete';
    }
    if (name === 'capabilities') return this.campaign.capabilities();
    throw new Error('Unknown game API: ' + name);
  }
  /** A verification run owns separate evidence, storage and interpreters; exploration is untouched. */
  async verify(path: string, practiceSeed?: number): Promise<readonly string[]> {
    this.campaign.requireCapability('scripting');
    const id = this.campaign.active.id;
    path = this.homePath(path);
    const source = this.world.home.filesystem.snapshot();
    const seeds =
      practiceSeed === undefined
        ? Array.from({ length: 5 }, () => crypto.getRandomValues(new Uint32Array(1))[0])
        : [practiceSeed];
    for (let i = 0; i < seeds.length; i++) {
      const trial = new GameEngine({
        world: { home: source, hosts: [], connections: [] },
        progress: { ...freshProgress(), completed: [...this.campaign.progress.completed] },
        settings: { vim: false, examplesInstalled: true },
      });
      try {
        trial.campaign.start(id, seeds[i]);
        await trial.run(path);
        if (trial.campaign.active.status !== 'complete')
          throw new Error('The program finished without submitting the correct password.');
      } catch (error) {
        return [
          `${i}/${seeds.length} cases passed. ${error instanceof Error ? error.message : String(error)}`,
          `Replay this practice case: mission submit --script ${JSON.stringify(path)} ${seeds[i]}`,
          'Practice cases award no stars. Fix your program and submit without a seed for verification. Your explored instance is unchanged.',
        ];
      } finally {
        trial.dispose();
      }
    }
    return practiceSeed === undefined
      ? [`${seeds.length}/${seeds.length} fresh cases passed.`, ...this.campaign.award(id, 2)]
      : [
          'Practice case passed. Submit without a seed to verify fresh instances and earn the automation star.',
        ];
  }
  view(): EngineView {
    return structuredClone({
      host: this.world.host.id,
      directory: this.world.session.workingDirectory,
      mission: this.campaign.definition
        ? {
            id: this.campaign.definition.id,
            title: this.campaign.definition.title,
            status: this.campaign.active.status,
          }
        : undefined,
      settings: this.settings,
    });
  }
  snapshot(): EngineSnapshot {
    return structuredClone({
      world: this.world.snapshot(),
      progress: this.campaign.progress,
      settings: this.settings,
    });
  }
  dispose() {}
}
