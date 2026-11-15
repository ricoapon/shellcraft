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
  hosts: HostSnapshot[];
  connections: { host: string; directory: string }[];
}

export interface Host {
  id: string;
  filesystem: VirtualFileSystem;
  neighbors: Set<string>;
  writable: string[];
}

/** Simulated connections never touch the OS or a real network. */
export class World {
  readonly hosts = new Map<string, Host>();
  private connections: { host: string; session: Session }[] = [];

  constructor(home = Session.createHome(), snapshot?: WorldSnapshot) {
    if (snapshot) {
      for (const host of snapshot.hosts) this.addHost(host);
      if (!this.hosts.has('home') || !snapshot.connections.length)
        throw new Error('Invalid world save.');
      this.connections = snapshot.connections.map((entry) => ({
        host: this.requireHost(entry.host).id,
        session: new Session(this.requireHost(entry.host).filesystem, entry.directory),
      }));
      if (this.connections[0].host !== 'home')
        throw new Error('Connection stack must start at home.');
    } else {
      this.addHost({ id: 'home', filesystem: home.filesystem.snapshot(), neighbors: [] });
      this.connections = [
        { host: 'home', session: new Session(this.home.filesystem, home.workingDirectory) },
      ];
    }
  }

  get home(): Host {
    return this.requireHost('home');
  }
  get host(): Host {
    return this.requireHost(this.connections[this.connections.length - 1].host);
  }
  get session(): Session {
    return this.connections[this.connections.length - 1].session;
  }

  requireHost(id: string): Host {
    const host = this.hosts.get(id);
    if (!host) throw new Error(`Unknown host: ${id}`);
    return host;
  }

  addHost(snapshot: HostSnapshot): void {
    if (!/^[a-zA-Z0-9_.-]+$/.test(snapshot.id) || this.hosts.has(snapshot.id)) {
      throw new Error(`Invalid or duplicate host: ${snapshot.id}`);
    }
    this.hosts.set(snapshot.id, {
      id: snapshot.id,
      filesystem: new VirtualFileSystem(snapshot.filesystem),
      neighbors: new Set(snapshot.neighbors),
      writable: snapshot.writable ?? [],
    });
  }

  connect(id: string): void {
    if (this.connections.length >= 100)
      throw new Error(
        'Connection stack limit reached. Use exit to return to an earlier connection.',
      );
    const host = this.requireHost(id);
    if (id !== 'home' && !this.host.neighbors.has(id))
      throw new Error(`Host is not reachable from ${this.host.id}: ${id}`);
    this.connections.push({
      host: id,
      session: new Session(host.filesystem, id === 'home' ? '/home' : '/'),
    });
  }

  exit(): void {
    if (this.connections.length > 1) this.connections.pop();
  }

  returnHome(): void {
    this.connections = this.connections.slice(0, 1);
  }

  clearRemoteHosts(): void {
    this.returnHome();
    for (const id of this.hosts.keys()) if (id !== 'home') this.hosts.delete(id);
    this.home.neighbors.clear();
  }

  canReach(id: string): boolean {
    const pending = [this.host.id];
    const seen = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === id) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of this.requireHost(current).neighbors)
        if (this.hosts.has(next)) pending.push(next);
    }
    return id === 'home';
  }

  snapshot(): WorldSnapshot {
    return {
      hosts: [...this.hosts.values()].map((host) => ({
        id: host.id,
        filesystem: host.filesystem.snapshot(),
        neighbors: [...host.neighbors],
        writable: [...host.writable],
      })),
      connections: this.connections.map((entry) => ({
        host: entry.host,
        directory: entry.session.workingDirectory,
      })),
    };
  }
}
