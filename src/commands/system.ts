import type { FileEntry } from '../core/filesystem';
import type { Action, Observation } from '../game/campaign';
import type { CommandInfo } from './command';
import type { MissionKind } from '../content/missions';

export interface CurrentMission {
  readonly id: string;
  readonly title: string;
  readonly entry: string;
  readonly kind: MissionKind;
  readonly briefing: string;
  readonly hint: string;
  readonly status: 'active' | 'complete' | 'failed';
  readonly requiresAnswer: boolean;
}

export interface FileSystemApi {
  directory(): string;
  cd(path: string): void;
  list(path?: string): readonly FileEntry[];
  stat(path: string): FileEntry;
  read(path: string): string;
  write(path: string, text: string): void;
  mkdir(path: string): void;
  remove(path: string): void;
}

export interface ModuleInfo {
  readonly id: string;
  readonly path: string;
}
export interface ControllerInfo extends ModuleInfo {
  readonly enabled: boolean;
  readonly error?: string;
}

/** Backend operations available to commands. No engine, world, or mutable state is exposed. */
export interface CommandSystem {
  capabilities: { has(id: string): boolean };
  commands: { list(): readonly CommandInfo[] };
  filesystem: FileSystemApi;
  session: { host(): string; connect(host: string): void; exit(): void };
  network: {
    neighbors(host?: string): readonly string[];
    inspect(host?: string): Observation;
    reachable(from: string, to: string): boolean;
  };
  mission: {
    current(): CurrentMission | undefined;
    list(): readonly {
      id: string;
      title: string;
      reward: number;
      completed: boolean;
      available: boolean;
    }[];
    start(id: string): string;
    reset(): string;
    status(): unknown;
    action(action: Action): string;
    submit(answer: string): string;
  };
  upgrades: {
    tokens(): number;
    list(): readonly {
      id: string;
      cost: number;
      after: number;
      description: string;
      owned: boolean;
      available: boolean;
    }[];
    buy(id: string): string;
  };
  editor: { open(path: string, vim: boolean): void };
  scripts: { run(path: string, args: readonly string[]): Promise<void> };
  startup: { load(path: string): Promise<string>; reload(): Promise<string>; disable(): void };
  screens: {
    list(): readonly ModuleInfo[];
    add(path: string, id?: string): Promise<string>;
    close(id: string): void;
    layout(layout: 'split' | 'tabs'): void;
    focus(id: string): void;
    refresh(milliseconds: number): void;
  };
  controllers: {
    list(): readonly ControllerInfo[];
    add(path: string, id?: string): Promise<string>;
    enable(id: string, enabled: boolean): void;
    remove(id: string): void;
  };
  simulation: {
    state(): { tick: number; paused: boolean; speed: number };
    pause(): void;
    resume(): void;
    step(count: number): readonly string[];
    speed(value: number): void;
  };
}
