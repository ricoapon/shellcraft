import { VirtualFileSystem } from '../core/filesystem';
import type { FileSystemSnapshot } from '../core/filesystem';
import { Session } from '../core/session';
export interface HostSnapshot {
  id: string;
  filesystem: FileSystemSnapshot;
  neighbors: string[];
  writable?: string[];
}
export interface WorldSnapshot {
  home: FileSystemSnapshot;
  hosts: HostSnapshot[];
  connections: { host: string; directory: string }[];
}
export interface Host {
  id: string;
  filesystem: VirtualFileSystem;
  neighbors: Set<string>;
}
/** Home is a separate code workspace, never a vertex in a level network. */
export class World {
  readonly hosts = new Map<string, Host>();
  readonly home: Host;
  private homeSession: Session;
  private connections: { host: string; session: Session }[] = [];
  constructor(home = Session.createHome(), snapshot?: WorldSnapshot) {
    this.home = {
      id: 'home',
      filesystem: new VirtualFileSystem(snapshot?.home ?? home.filesystem.snapshot()),
      neighbors: new Set(),
    };
    this.homeSession = new Session(this.home.filesystem, '/home');
    if (snapshot) {
      for (const host of snapshot.hosts) this.addHost(host);
      for (const connection of snapshot.connections)
        this.connections.push({
          host: connection.host,
          session: new Session(this.requireHost(connection.host).filesystem, connection.directory),
        });
    }
  }
  get host(): Host {
    return this.connections.length
      ? this.requireHost(this.connections[this.connections.length - 1].host)
      : this.home;
  }
  get session(): Session {
    return this.connections.at(-1)?.session ?? this.homeSession;
  }
  requireHost(id: string): Host {
    const host = this.hosts.get(id);
    if (!host)
      throw new Error(
        'Unknown level host: ' + id + '. Home is outside the level; use mission leave.',
      );
    return host;
  }
  addHost(snapshot: HostSnapshot) {
    if (
      snapshot.id === 'home' ||
      typeof snapshot.id !== 'string' ||
      !/^[a-zA-Z0-9_.-]{1,80}$/.test(snapshot.id) ||
      this.hosts.has(snapshot.id) ||
      !Array.isArray(snapshot.neighbors) ||
      snapshot.neighbors.some(
        (id) => typeof id !== 'string' || id === 'home' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(id),
      )
    )
      throw new Error('Invalid host or level connection: ' + snapshot.id);
    this.hosts.set(snapshot.id, {
      id: snapshot.id,
      filesystem: new VirtualFileSystem(snapshot.filesystem),
      neighbors: new Set(snapshot.neighbors),
    });
  }
  enter(id: string) {
    this.connections = [{ host: id, session: new Session(this.requireHost(id).filesystem) }];
  }
  connect(id: string) {
    if (this.connections.length >= 100) throw new Error('Connection limit reached. Use exit.');
    if (!this.host.neighbors.has(id))
      throw new Error('Host is not adjacent: ' + id + '. Use neighbors to discover connections.');
    this.connections.push({ host: id, session: new Session(this.requireHost(id).filesystem) });
  }
  exit() {
    if (this.connections.length <= 1)
      throw new Error('At the level entry. Use mission leave to return to your workspace.');
    this.connections.pop();
  }
  returnHome() {
    this.connections = [];
  }
  clearRemoteHosts() {
    this.returnHome();
    this.hosts.clear();
  }
  canReach(id: string): boolean {
    if (id === 'home') return this.host.id === 'home';
    const pending = [this.host.id],
      seen = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === id) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of this.hosts.get(current)?.neighbors ?? []) pending.push(next);
    }
    return false;
  }
  snapshot(): WorldSnapshot {
    return {
      home: this.home.filesystem.snapshot(),
      hosts: [...this.hosts.values()].map((h) => ({
        id: h.id,
        filesystem: h.filesystem.snapshot(),
        neighbors: [...h.neighbors],
      })),
      connections: this.connections.map((c) => ({
        host: c.host,
        directory: c.session.workingDirectory,
      })),
    };
  }
}
