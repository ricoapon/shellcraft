import type { FileEntry } from '../core/filesystem';
import type { CommandInfo } from './command';
import type { MissionKind } from '../content/missions';
export interface CurrentMission {
  readonly id: string;
  readonly title: string;
  readonly kind: MissionKind;
  readonly briefing: string;
  readonly status: string;
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
export interface CommandSystem {
  display(value: import('../runtime/types').Value): void;
  capabilities: { has(id: string): boolean };
  commands: { list(): readonly CommandInfo[] };
  filesystem: FileSystemApi;
  session: { host(): string; connect(host: string): void; exit(): void };
  network: { neighbors(host?: string): readonly string[] };
  mission: {
    current(): CurrentMission | undefined;
    list(group?: string): readonly {
      id: string;
      title: string;
      group: string;
      stars: number;
      available: boolean;
      prerequisite?: string;
    }[];
    start(id: string): readonly string[];
    reset(): readonly string[];
    leave(): readonly string[];
    briefing(): readonly string[];
    hint(): string;
    status(): unknown;
    submit(answer: string): readonly string[];
    verify(path: string, seed?: number): Promise<readonly string[]>;
  };
  editor: { open(path: string, vim: boolean): void };
  scripts: { run(path: string, args: readonly string[]): Promise<void> };
}
