import { VirtualFileSystem } from './filesystem';
import type { FileSystemSnapshot } from './filesystem';
import { resolvePath } from './path';

export interface SessionSnapshot {
  readonly filesystem: FileSystemSnapshot;
  readonly workingDirectory: string;
}

/** A local session owns navigation state; the filesystem can be shared by sessions. */
export class Session {
  readonly filesystem: VirtualFileSystem;
  private directory = '/';

  constructor(filesystem: VirtualFileSystem, workingDirectory = '/') {
    this.filesystem = filesystem;
    this.changeDirectory(workingDirectory);
  }

  static createHome(): Session {
    const filesystem = new VirtualFileSystem();
    filesystem.mkdir('/home');
    filesystem.writeFile(
      '/home/readme.txt',
      'Welcome to your home computer.\nTry pwd, ls, cat, mkdir, cd, and write.',
    );
    return new Session(filesystem, '/home');
  }

  static fromSnapshot(value: unknown): Session {
    const snapshot = value as Partial<SessionSnapshot> | null;
    if (
      !snapshot ||
      typeof snapshot.workingDirectory !== 'string' ||
      !snapshot.workingDirectory.startsWith('/') ||
      snapshot.filesystem === undefined
    ) {
      throw new Error('Invalid session snapshot.');
    }
    return new Session(new VirtualFileSystem(snapshot.filesystem), snapshot.workingDirectory);
  }

  snapshot(): SessionSnapshot {
    return { filesystem: this.filesystem.snapshot(), workingDirectory: this.directory };
  }

  get workingDirectory(): string {
    return this.directory;
  }

  changeDirectory(path: string): void {
    const directory = resolvePath(path, this.directory);
    // Validate before changing state: a failed cd must leave the session where it was.
    this.filesystem.list(directory);
    this.directory = directory;
  }
}
