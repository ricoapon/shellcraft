import { Shell } from '../core/shell';
import { languageTools } from '../runtime/tools';
import { resolvePath } from '../core/path';
import { builtinCommands } from '../commands';
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
  private readonly terminal: Shell;
  shell: ShellState = { entries: [] };
  private output: string[] = [];
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
    this.terminal = new Shell(builtinCommands, this.system, (path) =>
      this.world.home.filesystem.readFile(this.homePath(path)),
    );
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
      const result = await this.terminal.submit(input);
      clearScreen = result.clearScreen;
      action = result.action;
      for (const line of result.output ?? []) this.print(line);
    } catch (error) {
      this.output.push(error instanceof Error ? error.message : String(error));
    }
    const entry = {
      input: input.slice(0, 250000),
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
      commands: { list: () => this.terminal.available() },
      display: (value) => this.print(value),
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
    await this.terminal.run(this.homePath(path), args);
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
  languageTools(source: string, path: string, offset: number, terminal: boolean) {
    return languageTools(source, path, offset, terminal, {
      host: this.terminal.language.host,
      declarations: this.terminal.language.declarations,
      analyze: (source, path, terminal) =>
        this.terminal.language.analyze(source, path, terminal ? 'terminal' : 'script'),
      commands: this.terminal.available(),
      hosts:
        this.campaign.progress.active?.discovered.filter((id) =>
          this.world.host.neighbors.has(id),
        ) ?? [],
      paths: (prefix, workspace) => {
        try {
          const slash = prefix.lastIndexOf('/'),
            parent = slash < 0 ? '.' : prefix.slice(0, slash + 1) || '/';
          const fs = workspace ? this.world.home.filesystem : this.world.session.filesystem,
            cwd = workspace ? '/home' : this.world.session.workingDirectory;
          return fs
            .list(parent, cwd)
            .map(
              (entry) =>
                (slash < 0 ? '' : prefix.slice(0, slash + 1)) +
                entry.name +
                (entry.type === 'directory' ? '/' : ''),
            );
        } catch {
          return [];
        }
      },
    });
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
