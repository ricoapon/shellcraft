import { resolvePath } from './path';

type FileNode = { type: 'directory' } | { type: 'file'; content: string };
export type FileSystemSnapshot = readonly (FileNode & { readonly path: string })[];

export interface FileEntry {
  readonly path: string;
  readonly name: string;
  readonly type: 'directory' | 'file';
}

const MAX_FILE_SIZE = 250_000;
const MAX_FILESYSTEM_SIZE = 5_000_000;
const MAX_NODES = 10_000;

/** One simulated computer's filesystem. Never reads or writes real files. */
export class VirtualFileSystem {
  private readonly nodes = new Map<string, FileNode>([['/', { type: 'directory' }]]);
  private textLength = 0;

  constructor(snapshot?: unknown) {
    if (snapshot === undefined) return;
    if (!Array.isArray(snapshot) || snapshot.length > MAX_NODES)
      throw new Error('Invalid filesystem snapshot.');
    this.nodes.clear();
    for (const entry of snapshot) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.path !== 'string' ||
        !entry.path.startsWith('/') ||
        resolvePath(entry.path) !== entry.path ||
        this.nodes.has(entry.path) ||
        (entry.type !== 'directory' && entry.type !== 'file') ||
        (entry.type === 'file' && typeof entry.content !== 'string')
      ) {
        throw new Error('Invalid filesystem snapshot.');
      }
      if (entry.type === 'file') {
        this.textLength += entry.content.length;
        if (entry.content.length > MAX_FILE_SIZE || this.textLength > MAX_FILESYSTEM_SIZE)
          throw new Error('Filesystem size limit exceeded.');
      }
      this.nodes.set(
        entry.path,
        entry.type === 'file' ? { type: 'file', content: entry.content } : { type: 'directory' },
      );
    }
    this.requireDirectory('/');
    for (const path of this.nodes.keys()) {
      if (path !== '/') this.requireParent(path);
    }
  }

  snapshot(): FileSystemSnapshot {
    return [...this.nodes.entries()].map(([path, node]) => ({ path, ...node }));
  }

  mkdir(path: string, workingDirectory = '/'): void {
    const absolute = resolvePath(path, workingDirectory);
    if (this.nodes.has(absolute)) throw new Error(`Path already exists: ${absolute}`);
    this.requireParent(absolute);
    if (this.nodes.size >= MAX_NODES) throw new Error('Filesystem entry limit reached (10000).');
    this.nodes.set(absolute, { type: 'directory' });
  }

  writeFile(path: string, content: string, workingDirectory = '/'): void {
    const absolute = resolvePath(path, workingDirectory);
    if (this.nodes.get(absolute)?.type === 'directory') {
      throw new Error(`Is a directory: ${absolute}`);
    }
    this.requireParent(absolute);
    const previous = this.nodes.get(absolute);
    const nextLength =
      this.textLength - (previous?.type === 'file' ? previous.content.length : 0) + content.length;
    if (content.length > MAX_FILE_SIZE || nextLength > MAX_FILESYSTEM_SIZE)
      throw new Error('Filesystem size limit: 250 KB per file and 5 MB per host.');
    if (!previous && this.nodes.size >= MAX_NODES)
      throw new Error('Filesystem entry limit reached (10000).');
    this.nodes.set(absolute, { type: 'file', content });
    this.textLength = nextLength;
  }

  readFile(path: string, workingDirectory = '/'): string {
    const absolute = resolvePath(path, workingDirectory);
    const node = this.getNode(absolute);
    if (node.type !== 'file') throw new Error(`Is a directory: ${absolute}`);
    return node.content;
  }

  removeFile(path: string, workingDirectory = '/'): void {
    const absolute = resolvePath(path, workingDirectory);
    const node = this.getNode(absolute);
    if (node.type !== 'file') throw new Error(`Is a directory: ${absolute}`);
    this.nodes.delete(absolute);
    this.textLength -= node.content.length;
  }

  stat(path: string, workingDirectory = '/'): FileEntry {
    const absolute = resolvePath(path, workingDirectory);
    return {
      path: absolute,
      name: absolute.slice(absolute.lastIndexOf('/') + 1) || '/',
      type: this.getNode(absolute).type,
    };
  }

  list(path = '.', workingDirectory = '/'): FileEntry[] {
    const absolute = resolvePath(path, workingDirectory);
    this.requireDirectory(absolute);
    const prefix = absolute === '/' ? '/' : `${absolute}/`;
    return [...this.nodes.keys()]
      .filter(
        (entry) =>
          entry !== absolute &&
          entry.startsWith(prefix) &&
          !entry.slice(prefix.length).includes('/'),
      )
      .sort()
      .map((entry) => ({
        path: entry,
        name: entry.slice(prefix.length),
        type: this.getNode(entry).type,
      }));
  }

  private getNode(path: string): FileNode {
    const node = this.nodes.get(path);
    if (!node) throw new Error(`Path not found: ${path}`);
    return node;
  }

  private requireDirectory(path: string): void {
    if (this.getNode(path).type !== 'directory') throw new Error(`Not a directory: ${path}`);
  }

  private requireParent(path: string): void {
    this.requireDirectory(path.slice(0, path.lastIndexOf('/')) || '/');
  }
}
