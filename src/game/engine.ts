import { parseCommand } from '../core/parse';
import { resolvePath } from '../core/path';
import { builtinCommands } from '../commands';
import { CommandRegistry } from '../commands/registry';
import type { CommandInfo, CommandResult } from '../commands/command';
import type { CommandSystem } from '../commands/system';
import { SessionFileSystem } from '../core/session-filesystem';
import type { ShellState, TranscriptEntry } from '../core/shell';
import { World } from './world';
import type { WorldSnapshot } from './world';
import { Campaign, freshProgress } from './campaign';
import type { Action, Progress } from './campaign';
import { missions, upgrades } from '../content/missions';
import { installHomeFiles } from '../content/home';
import { nextSteps } from '../content/player-support';
import { PlayerModule } from '../runtime/player-runtime';
import type { Registrations, ViewNode } from '../runtime/player-runtime';

export interface PanelConfig {
  id: string;
  path: string;
  name?: string;
  title?: string;
}
export interface ControllerConfig {
  id: string;
  path: string;
  name?: string;
  enabled: boolean;
  error?: string;
}
export interface WorkstationSettings {
  startup?: string;
  panels: PanelConfig[];
  controllers: ControllerConfig[];
  layout: 'split' | 'tabs';
  activePanel?: string;
  editor?: { path: string; draft: string; saved?: string; line?: number };
  vim: boolean;
  screenRefreshMs?: number;
  examplesInstalled?: boolean;
  supportVersion?: number;
}
export interface EngineSnapshot {
  world: WorldSnapshot;
  progress: Progress;
  shell: ShellState;
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
  tokens: number;
  unlocked: string[];
  completed: string[];
  mission?: {
    id: string;
    title: string;
    briefing: string;
    hint: string;
    tick: number;
    paused: boolean;
    speed: number;
    status: string;
    results: string[];
    completedWork: number;
  };
  settings: WorkstationSettings;
  panels: { id: string; path: string; title: string; view?: ViewNode; error?: string }[];
  observations: ReturnType<Campaign['observations']>;
  homeFiles: { path: string }[];
  customCommands: readonly CommandInfo[];
  lastError?: { message: string; path?: string; line?: number };
}

export class GameEngine {
  private readonly commands: CommandRegistry;
  readonly system: CommandSystem;
  readonly world: World;
  readonly campaign: Campaign;
  readonly settings: WorkstationSettings;
  shell: ShellState;
  private readonly modules = new Map<string, PlayerModule>();
  private readonly customCommandSources = new Map<string, string>();
  private output: string[] = [];
  private readOnly = false;
  private controlling = false;
  private clearRequested = false;
  private requestedAction?: EngineReply['action'];
  private lastError?: EngineView['lastError'];

  constructor(snapshot?: EngineSnapshot) {
    this.world = new World(undefined, snapshot?.world);
    this.campaign = new Campaign(this.world, snapshot?.progress ?? freshProgress());
    this.shell = snapshot?.shell ?? { entries: [] };
    this.settings = snapshot?.settings ?? {
      panels: [],
      controllers: [],
      layout: 'split',
      vim: false,
    };
    this.settings.screenRefreshMs ??= 1000;
    if (!this.settings.examplesInstalled) {
      installHomeFiles(this.world.home.filesystem);
      this.settings.examplesInstalled = true;
    }
    if (this.settings.editor) {
      const file = this.settings.editor;
      const entry = this.world.home.filesystem.snapshot().find((entry) => entry.path === file.path);
      file.saved = entry?.type === 'file' ? entry.content : undefined;
    }
    this.system = this.createCommandSystem();
    this.commands = new CommandRegistry(builtinCommands, this.system);
  }

  async initialize(): Promise<void> {
    const output: string[] = [];
    if (this.settings.startup && this.campaign.progress.unlocked.includes('commands')) {
      try {
        await this.load(this.settings.startup, 'setup');
      } catch (error) {
        output.push(`Startup failed: ${this.error(error)}`);
      }
    }
    for (const path of new Set([
      ...this.settings.panels.map((p) => p.path),
      ...this.settings.controllers.map((c) => c.path),
    ])) {
      if (this.modules.has(path)) continue;
      try {
        await this.load(path);
      } catch (error) {
        output.push(`Module unavailable: ${this.error(error)}`);
      }
    }
    if (output.length) this.append('[startup]', output);
  }

  private error(error: unknown): string {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 8000);
    const match =
      message.match(/(\/home\/[^\n]*?\.(?:m?js)):(\d+)/) ??
      message.match(/(\/home\/[^\n]*?\.(?:m?js))/);
    this.lastError = { message, path: match?.[1], line: match?.[2] ? Number(match[2]) : 1 };
    return message;
  }

  private print(value: unknown): void {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (this.output.join('').length + text.length > 80_000 || this.output.length >= 500)
      throw new Error('Output limit reached. Print a summary rather than every record.');
    this.output.push(text);
  }

  private append(
    input: string,
    output: readonly string[],
    host = this.world.host.id,
    directory = this.world.session.workingDirectory,
  ): void {
    const entry: TranscriptEntry & { host: string } = {
      input,
      output: output.length ? [output.join('\n').slice(0, 80_000)] : [],
      workingDirectory: directory,
      host,
    };
    this.shell = { entries: [...this.shell.entries, entry].slice(-200) };
  }

  async execute(input: string): Promise<EngineReply> {
    this.output = [];
    this.clearRequested = false;
    this.requestedAction = undefined;
    this.lastError = undefined;
    const host = this.world.host.id;
    const directory = this.world.session.workingDirectory;
    const completed = this.campaign.progress.completed.length;
    if (!input.trim()) return { output: [], host, directory };
    try {
      if (input.length > 4000)
        throw new Error(
          'Command is too long (maximum 4000 characters). Put longer programs in a script.',
        );
      const [name, ...args] = parseCommand(input);
      const result = await this.commands.execute(name, args);
      this.consumeCommandResult(result);
      if (this.campaign.progress.completed.length > completed) {
        const progress = this.campaign.progress;
        if (!this.output.some((line) => line.includes('MISSION COMPLETE')))
          this.print(
            `MISSION COMPLETE — ${this.campaign.definition!.title}\n+${this.campaign.definition!.reward} tokens (${progress.tokens} available). Your tools are retained.`,
          );
        for (const line of nextSteps(progress.completed, progress.unlocked, progress.tokens))
          this.print(line);
      }
    } catch (error) {
      this.output.push(this.error(error));
    }
    if (this.clearRequested) this.shell = { entries: [] };
    else this.append(input.slice(0, 4000), this.output, host, directory);
    return {
      output: this.output,
      ...(this.clearRequested ? { clearScreen: true as const } : {}),
      host: this.world.host.id,
      directory: this.world.session.workingDirectory,
      action: this.requestedAction,
    };
  }

  private consumeCommandResult(result: CommandResult): void {
    if ('clearScreen' in result && result.clearScreen) this.clearRequested = true;
    if ('action' in result) this.requestedAction = result.action;
    const lines = Array.isArray(result) ? result : 'output' in result ? (result.output ?? []) : [];
    for (const line of lines) this.print(line);
  }

  private createCommandSystem(): CommandSystem {
    return {
      capabilities: { has: (id) => this.campaign.progress.unlocked.includes(id) },
      commands: {
        list: () => this.commands.available(),
      },
      filesystem: new SessionFileSystem(
        () => this.world.session,
        (path) => this.campaign.assertWritable(path),
      ),
      session: {
        host: () => this.world.host.id,
        connect: (host) => {
          this.world.connect(host);
          this.campaign.inspect();
        },
        exit: () => this.world.exit(),
      },
      network: {
        neighbors: (host) => this.neighbors(host),
        inspect: (host) => this.campaign.inspect(host),
        reachable: (from, to) => this.campaign.reachable(from, to),
      },
      mission: {
        current: () => {
          const definition = this.campaign.definition;
          const active = this.campaign.progress.active;
          if (!definition || !active) return undefined;
          return {
            id: definition.id,
            title: definition.title,
            entry: definition.entry,
            kind: definition.kind,
            briefing: definition.briefing,
            hint: definition.hint,
            status: active.status,
            requiresAnswer: !!definition.answer,
          };
        },
        list: () =>
          missions.map((mission, index) => ({
            id: mission.id,
            title: mission.title,
            reward: mission.reward,
            completed: this.campaign.progress.completed.includes(mission.id),
            available:
              index === 0 || this.campaign.progress.completed.includes(missions[index - 1].id),
          })),
        start: (id) => this.campaign.start(id),
        reset: () => this.campaign.start(this.campaign.active.id),
        status: () =>
          structuredClone({
            host: this.world.host.id,
            directory: this.world.session.workingDirectory,
            tokens: this.campaign.progress.tokens,
            unlocked: this.campaign.progress.unlocked,
            mission: this.campaign.definition?.title,
            tick: this.campaign.progress.active?.tick,
            status: this.campaign.progress.active?.status,
            nodes: this.campaign.progress.active?.nodes,
            jobs: this.campaign.progress.active?.jobs,
            transfers: this.campaign.progress.active?.transfers,
          }),
        action: (action) => this.campaign.action(action),
        submit: (answer) => this.campaign.submit(answer),
      },
      upgrades: {
        tokens: () => this.campaign.progress.tokens,
        list: () =>
          upgrades.map((upgrade) => ({
            ...upgrade,
            owned: this.campaign.progress.unlocked.includes(upgrade.id),
            available:
              !this.campaign.progress.unlocked.includes(upgrade.id) &&
              this.campaign.progress.completed.length >= upgrade.after &&
              this.campaign.progress.tokens >= upgrade.cost,
          })),
        buy: (id) => this.campaign.unlock(id),
      },
      editor: { open: (path, vim) => this.openEditor(path, undefined, vim) },
      scripts: {
        run: async (path, args) => {
          this.campaign.requireCapability('scripting');
          await this.run(path, [...args]);
        },
      },
      startup: {
        load: (path) => this.loadStartup(path),
        reload: () => this.reloadStartup(),
        disable: () => this.disableStartup(),
      },
      screens: {
        list: () => this.settings.panels.map((panel) => ({ id: panel.id, path: panel.path })),
        add: (path, id) => this.addScreen(path, id),
        close: (id) => {
          this.campaign.requireCapability('screens');
          this.settings.panels = this.settings.panels.filter((panel) => panel.id !== id);
        },
        layout: (layout) => {
          this.campaign.requireCapability('screens');
          this.settings.layout = layout;
        },
        focus: (id) => {
          this.campaign.requireCapability('screens');
          if (!this.settings.panels.some((panel) => panel.id === id))
            throw new Error('Unknown screen.');
          this.settings.activePanel = id;
        },
        refresh: (milliseconds) => {
          this.campaign.requireCapability('screens');
          if (!Number.isInteger(milliseconds) || milliseconds < 100 || milliseconds > 60_000)
            throw new Error('Screen refresh interval must be 100 to 60000 milliseconds.');
          this.settings.screenRefreshMs = milliseconds;
        },
      },
      controllers: {
        list: () =>
          this.settings.controllers.map(({ id, path, enabled, error }) => ({
            id,
            path,
            enabled,
            error,
          })),
        add: (path, id) => this.addController(path, id),
        enable: (id, enabled) => {
          this.campaign.requireCapability('controllers');
          const controller = this.requireController(id);
          controller.enabled = enabled;
          controller.error = undefined;
        },
        remove: (id) => {
          this.campaign.requireCapability('controllers');
          this.requireController(id);
          this.settings.controllers = this.settings.controllers.filter(
            (controller) => controller.id !== id,
          );
        },
      },
      simulation: {
        state: () => ({
          tick: this.campaign.active.tick,
          paused: this.campaign.active.paused,
          speed: this.campaign.active.speed,
        }),
        pause: () => {
          this.campaign.active.paused = true;
        },
        resume: () => this.resumeSimulation(),
        step: (count) => this.step(count),
        speed: (value) => {
          if (![0.5, 1, 2, 4].includes(value)) throw new Error('Choose speed 0.5, 1, 2, or 4.');
          this.campaign.active.speed = value;
        },
      },
    };
  }

  private resumeSimulation(): void {
    if (!['thermal', 'moving', 'coordination'].includes(this.campaign.definition?.kind ?? ''))
      throw new Error('This mission has no running simulation.');
    if (this.campaign.active.status !== 'active')
      throw new Error('Reset or start a mission to resume.');
    if (this.settings.editor) throw new Error('Close the editor before resuming.');
    this.campaign.active.paused = false;
  }

  private neighbors(id = this.world.host.id): string[] {
    const observation = this.campaign.inspect(id);
    for (const neighbor of observation.connections) {
      if (!this.campaign.progress.observations[neighbor])
        this.campaign.progress.observations[neighbor] = {
          id: neighbor,
          name: neighbor,
          connections: [],
          observedAt: Date.now(),
          tick: observation.tick,
          temperature: 0,
          load: 0,
          capacity: 0,
          cooling: 0,
          online: true,
          service: 'unknown',
        };
    }
    return observation.connections;
  }

  private homePath(path: string): string {
    const absolute = resolvePath(path, '/home');
    if (!absolute.startsWith('/home/'))
      throw new Error('Player modules and editor files must live under /home/.');
    return absolute;
  }

  openEditor(path: string, line?: number, vim = false): void {
    const absolute = this.homePath(path);
    if (this.settings.editor) {
      if (this.settings.editor.path !== absolute)
        throw new Error('Close the current editor before opening another file.');
      this.settings.editor.line = line;
      this.settings.vim = vim;
      return;
    }
    const filesystem = this.world.home.filesystem;
    const parent = absolute.slice(0, absolute.lastIndexOf('/'));
    const exists = filesystem.list(parent).some((entry) => entry.path === absolute);
    const draft = exists
      ? filesystem.readFile(absolute)
      : 'export function main(ctx, args) {\n  ctx.print("Hello from your workstation");\n}\n';
    if (this.campaign.progress.active) this.campaign.active.paused = true;
    this.settings.vim = vim;
    this.settings.editor = { path: absolute, draft, saved: exists ? draft : undefined, line };
  }

  async closeEditor(action: 'save' | 'discard' | 'run', text?: string): Promise<void> {
    const file = this.settings.editor;
    if (!file) throw new Error('No editor file is open.');
    if (!['save', 'discard', 'run'].includes(action)) throw new Error('Unknown editor action.');
    if (action !== 'discard') this.saveEditor(text ?? file.draft);
    this.settings.editor = undefined;
    if (action === 'run') await this.execute(`run ${JSON.stringify(file.path)}`);
  }

  saveEditor(text: string): void {
    if (!this.settings.editor) throw new Error('No editor file is open.');
    if (text.length > 250_000) throw new Error('File exceeds the editor limit of 250 KB.');
    this.world.home.filesystem.writeFile(this.settings.editor.path, text);
    this.settings.editor.draft = text;
    this.settings.editor.saved = text;
  }

  private async load(
    path: string,
    entry?: 'main' | 'setup',
    args: string[] = [],
  ): Promise<PlayerModule> {
    path = this.homePath(path);
    const module = await PlayerModule.create(
      path,
      (file) => this.world.home.filesystem.readFile(file),
      (name, values) => this.api(name, values),
    );
    try {
      if (entry) module.invoke(entry, args);
      const registrations = module.registrations();
      this.validateRegistrations(registrations, path);
      this.settings.panels = this.settings.panels.filter(
        (panel) =>
          panel.path !== path ||
          !panel.name ||
          registrations.screens.some((item) => item.name === panel.name),
      );
      this.settings.controllers = this.settings.controllers.filter(
        (controller) =>
          controller.path !== path ||
          !controller.name ||
          registrations.controllers.some((item) => item.name === controller.name),
      );
      this.unload(path);
      this.modules.set(path, module);
      for (const command of registrations.commands) {
        this.customCommandSources.set(command.name, path);
        this.commands.register({
          ...command,
          unlocked: (system) => system.capabilities.has('commands'),
          execute: (args) => {
            module.command(command.name, [...args]);
            return [];
          },
        });
      }
      for (const screen of registrations.screens) {
        if (!this.settings.panels.some((p) => p.id === screen.name))
          this.settings.panels.push({
            id: screen.name,
            path,
            name: screen.name,
            title: screen.title,
          });
      }
      for (const controller of registrations.controllers) {
        if (!this.settings.controllers.some((c) => c.id === controller.name))
          this.settings.controllers.push({
            id: controller.name,
            path,
            name: controller.name,
            enabled: true,
          });
      }
      return module;
    } catch (error) {
      module.dispose();
      throw error;
    }
  }

  private validateRegistrations(registrations: Registrations, path: string): void {
    for (const command of registrations.commands) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(command.name) ||
        this.commands.isBuiltin(command.name)
      )
        throw new Error(`Reserved or invalid command name: ${command.name}`);
      if (
        this.customCommandSources.has(command.name) &&
        this.customCommandSources.get(command.name) !== path
      )
        throw new Error(`Command already registered by another module: ${command.name}`);
      if (
        (command.description !== undefined && typeof command.description !== 'string') ||
        (command.usage !== undefined && typeof command.usage !== 'string') ||
        (command.details !== undefined && typeof command.details !== 'string') ||
        (command.example !== undefined && typeof command.example !== 'string')
      )
        throw new Error('Command help metadata must be text.');
    }
    for (const item of [...registrations.screens, ...registrations.controllers]) {
      if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(item.name))
        throw new Error(`Invalid registration name: ${item.name}`);
      if ('title' in item && item.title !== undefined && typeof item.title !== 'string')
        throw new Error('Screen titles must be text.');
    }
    if (
      registrations.commands.length > 50 ||
      registrations.screens.length > 12 ||
      registrations.controllers.length > 12
    )
      throw new Error('Too many module registrations.');
    if (
      [...this.customCommandSources.values()].filter((source) => source !== path).length +
        registrations.commands.length >
        50 ||
      this.settings.panels.filter((panel) => panel.path !== path || !panel.name).length +
        registrations.screens.length >
        12 ||
      this.settings.controllers.filter((controller) => controller.path !== path || !controller.name)
        .length +
        registrations.controllers.length >
        12
    )
      throw new Error(
        'Workstation registration limit reached. Remove unused commands, screens, or controllers.',
      );
  }

  private unload(path: string): void {
    this.modules.get(path)?.dispose();
    this.modules.delete(path);
    for (const [name, source] of this.customCommandSources)
      if (source === path) {
        this.customCommandSources.delete(name);
        this.commands.unregister(name);
      }
  }

  private async run(path: string, args: string[]): Promise<void> {
    const module = await this.load(path, 'main', args);
    const registrations = module.registrations();
    const retained =
      this.settings.startup === module.path ||
      this.settings.panels.some((panel) => panel.path === module.path) ||
      this.settings.controllers.some((controller) => controller.path === module.path) ||
      registrations.commands.length +
        registrations.screens.length +
        registrations.controllers.length >
        0;
    if (!retained) this.unload(module.path);
  }

  private async loadStartup(path: string): Promise<string> {
    this.campaign.requireCapability('commands');
    path = this.homePath(path);
    await this.load(path, 'setup');
    if (this.settings.startup && this.settings.startup !== path) this.unload(this.settings.startup);
    this.settings.startup = path;
    return path;
  }

  private async reloadStartup(): Promise<string> {
    this.campaign.requireCapability('commands');
    const path = this.settings.startup;
    if (!path) throw new Error('Choose a startup module first: startup /home/startup.js');
    return this.loadStartup(path);
  }

  private disableStartup(): void {
    this.campaign.requireCapability('commands');
    if (this.settings.startup) this.unload(this.settings.startup);
    this.settings.startup = undefined;
  }

  private async addScreen(source: string, requestedId?: string): Promise<string> {
    this.campaign.requireCapability('screens');
    if (this.settings.panels.length >= 12) throw new Error('Close a panel first (maximum 12).');
    const path = this.homePath(source);
    const module = await this.load(path);
    if (!module.hasExport('render'))
      throw new Error(path + ' must export render(view, observations).');
    const id = requestedId ?? path.split('/').pop()!.replace(/\.js$/, '');
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id))
      throw new Error(
        'Use a screen ID containing letters, numbers, dots, underscores, or hyphens.',
      );
    this.settings.panels = this.settings.panels.filter((panel) => panel.id !== id);
    this.settings.panels.push({ id, path });
    this.settings.activePanel = id;
    return id;
  }

  private async addController(source: string, requestedId?: string): Promise<string> {
    this.campaign.requireCapability('controllers');
    if (this.settings.controllers.length >= 12)
      throw new Error('Remove a controller first (maximum 12).');
    const path = this.homePath(source);
    const module = await this.load(path);
    if (!module.hasExport('control')) throw new Error(path + ' must export control(state).');
    const id = requestedId ?? path.split('/').pop()!.replace(/\.js$/, '');
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(id))
      throw new Error(
        'Use a controller ID containing letters, numbers, dots, underscores, or hyphens.',
      );
    this.settings.controllers = this.settings.controllers.filter(
      (controller) => controller.id !== id,
    );
    this.settings.controllers.push({ id, path, enabled: true });
    return id;
  }

  private requireController(id: string): ControllerConfig {
    const controller = this.settings.controllers.find((controller) => controller.id === id);
    if (!controller) throw new Error('Unknown controller.');
    return controller;
  }

  step(count: number): string[] {
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new Error('Step count must be an integer from 1 to 100.');
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      if (this.campaign.active.status !== 'active') break;
      result.push(
        ...this.campaign.step((snapshot) =>
          this.settings.controllers
            .filter((c) => c.enabled)
            .map((controller) => {
              try {
                const module = this.modules.get(controller.path);
                if (!module) throw new Error('Reload the controller module.');
                this.controlling = true;
                const actions = module.control(controller.name, structuredClone(snapshot));
                if (!Array.isArray(actions) || actions.length > 100)
                  throw new Error('A controller must return an array of at most 100 actions.');
                return actions as Action[];
              } catch (error) {
                controller.error = this.error(error);
                controller.enabled = false;
                result.push(`Controller ${controller.id} disabled: ${controller.error}`);
                return [];
              } finally {
                this.controlling = false;
              }
            }),
        ),
      );
    }
    return [
      ...result.slice(-100),
      `Tick ${this.campaign.active.tick} · ${this.campaign.active.status}`,
    ];
  }

  advancePlayback(): readonly string[] {
    const before = this.campaign.active.status;
    const results = this.step(1);
    const messages = results.filter(
      (line) => line.startsWith('Controller ') && line.includes(' disabled:'),
    );
    if (this.campaign.active.status !== before) {
      messages.push(
        ...results.filter(
          (line) => line.startsWith('MISSION ') || line.startsWith('Objective complete.'),
        ),
      );
      if (this.campaign.active.status === 'complete') {
        const progress = this.campaign.progress;
        messages.push(...nextSteps(progress.completed, progress.unlocked, progress.tokens));
      } else if (this.campaign.active.status === 'failed') {
        messages.push(
          'Use mission hint to review your approach, then mission reset to retry. Your home tools are kept.',
        );
      }
    }
    if (messages.some((line) => line.startsWith('Controller ')))
      messages.push(
        'Use controller list to inspect the error. Fix the source, then controller add <path> to reload it.',
      );
    if (messages.length) this.append('[simulation]', messages);
    return messages;
  }

  private api(name: string, args: unknown[]): unknown {
    const text = (index: number, fallback = '') =>
      args[index] === null || args[index] === undefined ? fallback : String(args[index]);
    const mutating = ![
      'fs.list',
      'fs.read',
      'fs.stat',
      'session.info',
      'storage.get',
      'observations',
      'mission.briefing',
      'mission.actions',
      'mission.status',
      'simulation.state',
      'capabilities',
      'capability',
    ].includes(name);
    if (this.readOnly && mutating)
      throw new Error(
        'Screen render functions are read-only. Use a button/selection handler for actions.',
      );
    if (this.controlling && mutating && !['storage.set', 'storage.delete'].includes(name))
      throw new Error('Controllers return actions instead of changing the world directly.');
    if (name === 'capability') {
      this.campaign.requireCapability(text(0));
      return true;
    }
    if (name === 'capabilities') return this.campaign.progress.unlocked;
    if (name === 'print') {
      this.print(args[0]);
      return;
    }
    if (name.startsWith('fs.')) {
      this.campaign.requireCapability('scripting');
      const id = text(0, this.world.host.id);
      if (id !== this.world.host.id && id !== 'home') this.campaign.requireCapability('network');
      if (!this.world.canReach(id)) throw new Error(`Host unreachable: ${id}`);
      const fs = this.world.requireHost(id).filesystem;
      const explicit = args[0] !== null && args[0] !== undefined;
      const cwd = explicit ? (id === 'home' ? '/home' : '/') : this.world.session.workingDirectory;
      const path = text(1, '.');
      if (name === 'fs.list') return fs.list(path, cwd);
      if (name === 'fs.read') return fs.readFile(path, cwd);
      if (name === 'fs.stat') return fs.stat(path, cwd);
      this.campaign.assertWritable(path, id, cwd);
      if (name === 'fs.write') {
        const content = text(2);
        if (content.length > 250_000) throw new Error('File limit: 250 KB.');
        fs.writeFile(path, content, cwd);
        return;
      }
      if (name === 'fs.mkdir') {
        fs.mkdir(path, cwd);
        return;
      }
    }
    if (name === 'session.info')
      return { host: this.world.host.id, workingDirectory: this.world.session.workingDirectory };
    if (name === 'session.connect') {
      if (text(0) !== 'home') this.campaign.requireCapability('network');
      this.world.connect(text(0));
      this.campaign.inspect();
      return;
    }
    if (name === 'session.exit') {
      this.world.exit();
      return;
    }
    if (name === 'network.neighbors') {
      this.campaign.requireCapability('network');
      return this.neighbors(text(0, this.world.host.id));
    }
    if (name === 'network.connect') {
      this.campaign.requireCapability('network');
      const id = text(0);
      if (!this.campaign.progress.observations[id])
        throw new Error('Discover that host with neighbors first.');
      if (!this.world.canReach(id)) throw new Error('Host unreachable.');
      this.world.requireHost(id);
      return id;
    }
    if (name === 'inspect') return this.campaign.inspect(text(0, this.world.host.id));
    if (name === 'storage.get') return this.campaign.progress.playerData[text(0)];
    if (name === 'storage.set') {
      if (['__proto__', 'constructor', 'prototype'].includes(text(0)))
        throw new Error('Reserved storage key.');
      if (JSON.stringify(args[1]).length > 200_000) throw new Error('Storage value limit: 200 KB.');
      const data = { ...this.campaign.progress.playerData, [text(0)]: args[1] };
      if (JSON.stringify(data).length > 2_000_000)
        throw new Error('Player storage limit: 2 MB. Delete unused keys before saving more.');
      this.campaign.progress.playerData[text(0)] = args[1];
      return;
    }
    if (name === 'storage.delete') {
      delete this.campaign.progress.playerData[text(0)];
      return;
    }
    if (name === 'observations') return this.campaign.observations();
    if (name === 'mission.briefing') return this.campaign.definition?.briefing;
    if (name === 'mission.actions') {
      const kind = this.campaign.definition?.kind;
      return kind === 'thermal'
        ? ['transfer']
        : kind === 'traffic' || kind === 'isolation'
          ? ['link']
          : kind === 'service'
            ? ['restart']
            : kind === 'moving'
              ? ['trap']
              : kind === 'coordination'
                ? ['prepare', 'queue', 'commit']
                : ['submit'];
    }
    if (name === 'mission.status') return this.campaign.progress.active?.status;
    if (name === 'mission.action') return this.campaign.action(args[0] as Action);
    if (name === 'mission.submit') return this.campaign.submit(text(0));
    if (name === 'simulation.state') return this.system.simulation.state();
    if (name === 'simulation.pause') {
      this.system.simulation.pause();
      return;
    }
    if (name === 'simulation.resume') {
      this.resumeSimulation();
      return;
    }
    if (name === 'simulation.step') return this.system.simulation.step(Number(args[0] ?? 1));
    if (name === 'commands.invoke') {
      const command = text(0);
      if (['ssh', 'neighbors'].includes(command)) this.campaign.requireCapability('network');
      if (this.customCommandSources.has(command))
        throw new Error('Import shared functions instead of invoking another player command.');
      if (['run', 'startup', 'screen', 'controller', 'save'].includes(command))
        throw new Error(
          'Use this command from the interactive terminal. Import shared functions for reusable player code.',
        );
      const result = this.commands.execute(
        command,
        Array.isArray(args[1]) ? args[1].map(String) : [],
      );
      if (result instanceof Promise)
        throw new Error('Asynchronous commands must run in the terminal.');
      this.consumeCommandResult(result);
      return result;
    }
    throw new Error(`Unknown game API: ${name}`);
  }

  interact(panelId: string, handler: string, value: unknown): void {
    const panel = this.settings.panels.find((p) => p.id === panelId);
    if (!panel) throw new Error('Screen not found.');
    this.output = [];
    this.clearRequested = false;
    this.modules.get(panel.path)!.interact(handler, value);
    if (this.clearRequested) this.shell = { entries: [] };
    if (this.output.length) this.append(`[screen ${panelId}]`, this.output);
  }

  view(): EngineView {
    const panels = this.settings.panels.map((panel) => {
      try {
        this.readOnly = true;
        const module = this.modules.get(panel.path);
        if (!module)
          throw new Error('Module could not be loaded. Edit its source and add this screen again.');
        const view = module.render(panel.name, this.campaign.observations(), panel.id);
        if (!view || typeof view !== 'object')
          throw new Error('render must return a declarative view.');
        if (JSON.stringify(view).length > 300_000)
          throw new Error('Screen output is too large. Aggregate data before rendering.');
        return { ...panel, title: panel.title ?? panel.id, view };
      } catch (error) {
        return { ...panel, title: panel.title ?? panel.id, error: this.error(error) };
      } finally {
        this.readOnly = false;
      }
    });
    const active = this.campaign.progress.active;
    return structuredClone({
      host: this.world.host.id,
      directory: this.world.session.workingDirectory,
      tokens: this.campaign.progress.tokens,
      unlocked: this.campaign.progress.unlocked,
      completed: this.campaign.progress.completed,
      mission: active
        ? {
            id: active.id,
            title: this.campaign.definition!.title,
            briefing: this.campaign.definition!.briefing,
            hint: this.campaign.definition!.hint,
            tick: active.tick,
            paused: active.paused,
            speed: active.speed,
            status: active.status,
            results: active.results,
            completedWork: active.completedWork,
          }
        : undefined,
      settings: this.settings,
      panels,
      observations: this.campaign.observations(),
      homeFiles: this.world.home.filesystem
        .snapshot()
        .filter((entry) => entry.type === 'file')
        .map((entry) => ({ path: entry.path })),
      customCommands: this.commands
        .available()
        .filter((command) => this.customCommandSources.has(command.name)),
      lastError: this.lastError,
    });
  }

  snapshot(): EngineSnapshot {
    return structuredClone({
      world: this.world.snapshot(),
      progress: this.campaign.progress,
      shell: this.shell,
      settings: this.settings,
    });
  }

  dispose(): void {
    for (const module of this.modules.values()) module.dispose();
    this.modules.clear();
  }
}
