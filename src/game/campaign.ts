import { VirtualFileSystem } from '../core/filesystem';
import { resolvePath } from '../core/path';
import { missions, upgrades } from '../content/missions';
import type { MissionDefinition } from '../content/missions';
import { World } from './world';

export interface Action {
  type: string;
  from?: string;
  to?: string;
  amount?: number;
  host?: string;
  tick?: number;
  release?: string;
  enabled?: boolean;
}
export interface NodeState {
  id: string;
  temperature: number;
  load: number;
  capacity: number;
  cooling: number;
  online: boolean;
  service: string;
}
export interface JobState {
  id: string;
  host: string;
  remaining: number;
  priority: number;
  deadline: number;
}
export interface Observation extends NodeState {
  name: string;
  connections: string[];
  observedAt: number;
  tick: number;
  stale?: boolean;
  traffic?: { to: string; volume: number; service: string }[];
}
export interface MissionState {
  id: string;
  tick: number;
  paused: boolean;
  speed: number;
  status: 'active' | 'complete' | 'failed';
  nodes: NodeState[];
  transfers: { from: string; to: string; amount: number; remaining: number; jobs?: JobState[] }[];
  jobs: JobState[];
  targetWork: number;
  deadline: number;
  queued: Action[];
  prepared: Record<string, string>;
  committed: Record<string, number>;
  traps: { host: string; tick: number }[];
  captured: boolean;
  completedWork: number;
  results: string[];
  history: { tick: number; nodes: NodeState[]; results: string[] }[];
}
export interface Progress {
  tokens: number;
  completed: string[];
  unlocked: string[];
  observations: Record<string, Observation>;
  archivedObservations?: Record<string, Record<string, Observation>>;
  playerData: Record<string, unknown>;
  active?: MissionState;
}

export const freshProgress = (): Progress => ({
  tokens: 0,
  completed: [],
  unlocked: [],
  observations: {},
  playerData: {},
});

export class Campaign {
  private applyingTick = false;
  constructor(
    readonly world: World,
    readonly progress: Progress = freshProgress(),
  ) {
    const active = progress.active;
    if (active) {
      if (!Array.isArray(active.jobs))
        for (const transfer of active.transfers)
          transfer.remaining = Math.min(transfer.amount, transfer.remaining * 8);
      active.jobs ??= active.nodes
        .filter((node) => node.load > 0)
        .map((node) => ({
          id: `legacy-${node.id}`,
          host: node.id,
          remaining: node.load,
          priority: 1,
          deadline: 45,
        }));
      active.targetWork ??= 96;
      active.deadline ??= 45;
    }
  }

  get definition(): MissionDefinition | undefined {
    return missions.find((mission) => mission.id === this.progress.active?.id);
  }
  get active(): MissionState {
    if (!this.progress.active) throw new Error('No active mission. Use mission start <id>.');
    return this.progress.active;
  }

  requireCapability(id: string): void {
    if (!this.progress.unlocked.includes(id))
      throw new Error(`Capability locked: ${id}. Check upgrade list and use upgrade buy ${id}.`);
  }

  unlock(id: string): string {
    const upgrade = upgrades.find((candidate) => candidate.id === id);
    if (!upgrade) throw new Error(`Unknown capability: ${id}`);
    if (this.progress.unlocked.includes(id)) return `${id} is already unlocked.`;
    if (this.progress.completed.length < upgrade.after)
      throw new Error(`Complete ${upgrade.after} missions before unlocking ${id}.`);
    if (this.progress.tokens < upgrade.cost)
      throw new Error(`Need ${upgrade.cost} tokens; you have ${this.progress.tokens}.`);
    this.progress.tokens -= upgrade.cost;
    this.progress.unlocked.push(id);
    return `Unlocked ${upgrade.name}. ${this.progress.tokens} tokens remain.`;
  }

  start(id: string): string {
    const index = missions.findIndex((mission) => mission.id === id);
    const mission = missions[index];
    if (!mission) throw new Error(`Unknown mission: ${id}`);
    if (index > 0 && !this.progress.completed.includes(missions[index - 1].id))
      throw new Error(
        'Complete the preceding missions first. Use mission to see your next available assignment.',
      );
    if (this.progress.active) {
      const archives = (this.progress.archivedObservations ??= {});
      archives[`${this.progress.active.id}@${this.progress.active.tick}`] = structuredClone(
        this.progress.observations,
      );
      for (const key of Object.keys(archives).slice(0, -20)) delete archives[key];
    }
    this.world.clearRemoteHosts();
    for (const fixture of mission.hosts) {
      const fs = new VirtualFileSystem();
      for (const [path, text] of Object.entries(fixture.files)) {
        const directories = path.split('/').slice(1, -1);
        let directory = '';
        for (const part of directories) {
          directory += `/${part}`;
          try {
            fs.stat(directory);
          } catch {
            fs.mkdir(directory);
          }
        }
        fs.writeFile(path, text);
      }
      this.world.addHost({
        id: fixture.id,
        filesystem: fs.snapshot(),
        neighbors: fixture.links,
        writable: fixture.writable,
      });
    }
    this.world.home.neighbors.add(mission.entry);
    const workload = mission.thermal?.workload ?? 96;
    const deadline = mission.thermal?.deadline ?? 45;
    this.progress.active = {
      id,
      tick: 0,
      paused: true,
      speed: 1,
      status: 'active',
      transfers: [],
      queued: [],
      prepared: {},
      committed: {},
      traps: [],
      captured: false,
      completedWork: 0,
      results: [],
      history: [],
      jobs:
        mission.kind === 'thermal'
          ? [{ id: 'routine', host: mission.entry, remaining: workload, priority: 1, deadline }]
          : [],
      targetWork:
        workload +
        (mission.thermal?.events ?? []).reduce(
          (sum, event) => sum + (event.type === 'arrival' ? (event.amount ?? 0) : 0),
          0,
        ),
      deadline,
      nodes: mission.hosts.map((host, i) => ({
        id: host.id,
        temperature: 24,
        load: mission.kind === 'thermal' && i === 0 ? workload : 0,
        capacity: [2, 1.8, 1.6][i % 3],
        cooling: [1.4, 1.8, 2][i % 3],
        online: true,
        service: mission.kind === 'service' ? 'down' : 'healthy',
      })),
    };
    this.progress.observations = {};
    this.inspect(mission.entry);
    if (['thermal', 'moving', 'coordination'].includes(mission.kind))
      for (const host of mission.hosts) this.inspect(host.id);
    return `${mission.title}\n${mission.briefing}\nEntry host: ${mission.entry}\nReward: ${mission.reward} tokens. Use ssh ${mission.entry}.`;
  }

  inspect(id = this.world.host.id): Observation {
    if (!this.world.canReach(id)) throw new Error(`Host unreachable: ${id}`);
    const host = this.world.requireHost(id);
    const node = this.progress.active?.nodes.find((candidate) => candidate.id === id) ?? {
      id,
      temperature: 24,
      load: 0,
      capacity: 0,
      cooling: 0,
      online: true,
      service: 'healthy',
    };
    const result: Observation = {
      ...node,
      name: id,
      connections: [...host.neighbors],
      observedAt: Date.now(),
      tick: this.progress.active?.tick ?? 0,
      traffic:
        this.definition?.kind === 'traffic'
          ? [...host.neighbors].map((to) => ({
              to,
              volume: id === 'collector' ? (to === 'outside' ? 900 : 300) : 50,
              service: to === 'outside' ? 'unknown-tunnel' : 'application',
            }))
          : undefined,
    };
    this.progress.observations[id] = result;
    return structuredClone(result);
  }

  observations() {
    return {
      nodes: Object.values(this.progress.observations).map((node) => ({
        ...node,
        stale: !this.world.canReach(node.id),
      })),
      archives: this.progress.archivedObservations ?? {},
      tick: this.progress.active?.tick ?? 0,
      history: this.progress.unlocked.includes('telemetry')
        ? (this.progress.active?.history ?? [])
        : [],
      results: this.progress.active?.results ?? [],
      mission: this.definition?.id,
      completedWork: this.progress.active?.completedWork ?? 0,
      jobs: this.progress.active?.jobs ?? [],
      transfers: this.progress.active?.transfers ?? [],
      queued: this.progress.active?.queued ?? [],
      prepared: this.progress.active?.prepared ?? {},
      committed: this.progress.active?.committed ?? {},
      traps: this.progress.active?.traps ?? [],
    };
  }

  assertWritable(
    path: string,
    hostId = this.world.host.id,
    directory = this.world.session.workingDirectory,
  ): void {
    const absolute = resolvePath(path, directory);
    const host = this.world.requireHost(hostId);
    if (
      hostId !== 'home' &&
      !host.writable.some((prefix) => absolute === prefix || absolute.startsWith(`${prefix}/`))
    ) {
      throw new Error(
        `Read-only mission file: ${hostId}:${absolute}. Save your tools under /home.`,
      );
    }
  }

  submit(answer: string): string {
    if (!this.definition?.answer)
      throw new Error(
        'This mission completes through actions, not an answer. Use mission briefing for the objective and mission status to inspect progress.',
      );
    if (this.active.status === 'failed')
      throw new Error('Mission failed. Reset it before submitting.');
    if (answer.trim().toLowerCase() !== this.definition.answer.toLowerCase())
      return 'That answer does not match the objective. Inspect more evidence; mission hint is available.';
    return this.complete();
  }

  private complete(): string {
    this.active.status = 'complete';
    this.active.paused = true;
    const definition = this.definition!;
    if (this.progress.completed.includes(definition.id))
      return 'Objective complete. This replay awards no additional tokens.';
    this.progress.completed.push(definition.id);
    this.progress.tokens += definition.reward;
    return `MISSION COMPLETE — ${definition.title}\n+${definition.reward} tokens (${this.progress.tokens} available). Your tools are retained. Check mission list and upgrade list.`;
  }

  reachable(from: string, to: string): boolean {
    const seen = new Set<string>();
    const pending = [from];
    while (pending.length) {
      const id = pending.pop()!;
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const neighbor of this.world.requireHost(id).neighbors) pending.push(neighbor);
    }
    return false;
  }

  action(action: Action): string {
    const mission = this.active;
    if (mission.status !== 'active')
      throw new Error('Reset or start a mission before changing it.');
    const kind = this.definition!.kind;
    if (action.type === 'link') {
      if (!['traffic', 'isolation'].includes(kind))
        throw new Error('Link controls are not available in this mission.');
      const from = this.world.requireHost(action.from ?? '');
      const to = this.world.requireHost(action.to ?? '');
      const original = this.definition!.hosts.find((h) => h.id === from.id)?.links.includes(to.id);
      if (!original) throw new Error('That link does not exist in the mission topology.');
      if (action.enabled) {
        from.neighbors.add(to.id);
        to.neighbors.add(from.id);
      } else {
        from.neighbors.delete(to.id);
        to.neighbors.delete(from.id);
      }
      for (const id of [from.id, to.id])
        if (this.progress.observations[id] && this.world.canReach(id)) this.inspect(id);
      this.evaluate();
      return `Link ${from.id} ↔ ${to.id} ${action.enabled ? 'enabled' : 'disabled'}.`;
    }
    if (action.type === 'restart') {
      if (kind !== 'service') throw new Error('No service repair controls here.');
      const node = mission.nodes.find((n) => n.id === action.host);
      if (!node) throw new Error('Unknown service host.');
      if (node.id === 'db') {
        const config = JSON.parse(
          this.world.requireHost('db').filesystem.readFile('/etc/app/database.json'),
        );
        if (config.port !== 5432 || config.enabled !== true)
          throw new Error(
            'Database configuration is invalid. Expected port 5432 and enabled=true.',
          );
      } else {
        const dependency = node.id === 'api' ? 'db' : 'api';
        if (mission.nodes.find((n) => n.id === dependency)?.service !== 'healthy')
          throw new Error(`Dependency ${dependency} is unhealthy.`);
      }
      node.service = 'healthy';
      this.inspect(node.id);
      this.evaluate();
      return `${node.id} service is healthy.`;
    }
    if (action.type === 'transfer') {
      if (kind !== 'thermal')
        throw new Error('Transfers are only available in the thermal mission.');
      const from = mission.nodes.find((n) => n.id === action.from);
      const to = mission.nodes.find((n) => n.id === action.to);
      const amount = action.amount ?? 0;
      if (
        !from ||
        !to ||
        from === to ||
        !from.online ||
        !to.online ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > from.load
      )
        throw new Error(
          'Invalid transfer: select different online hosts and an amount within available load.',
        );
      if (!this.world.requireHost(from.id).neighbors.has(to.id))
        throw new Error('Transfer requires a direct link.');
      let left = amount;
      const jobs: JobState[] = [];
      for (const job of mission.jobs
        .filter((job) => job.host === from.id)
        .sort((a, b) => b.priority - a.priority || a.deadline - b.deadline)) {
        const moved = Math.min(left, job.remaining);
        if (moved > 0)
          jobs.push({
            ...job,
            id: `${job.id}@${mission.tick}:${mission.transfers.length}`,
            host: to.id,
            remaining: moved,
          });
        job.remaining -= moved;
        left -= moved;
        if (left <= 0) break;
      }
      from.load -= amount;
      mission.transfers.push({ from: from.id, to: to.id, amount, remaining: amount, jobs });
      for (const id of [from.id, to.id])
        if (this.progress.observations[id] && this.world.canReach(id)) this.inspect(id);
      return `Transfer ${amount} units to ${to.id}; ${Math.ceil(amount / 8)} ticks in transit.`;
    }
    if (action.type === 'trap') {
      if (kind !== 'moving')
        throw new Error('Traps are only available in the moving-process mission.');
      if (
        !mission.nodes.some((n) => n.id === action.host) ||
        !Number.isInteger(action.tick) ||
        action.tick! <= mission.tick ||
        action.tick! > 25
      )
        throw new Error('Choose a valid host and a future tick up to 25.');
      mission.traps.push({ host: action.host!, tick: action.tick! });
      return `Trap armed on ${action.host} for tick ${action.tick}.`;
    }
    if (action.type === 'prepare') {
      if (
        kind !== 'coordination' ||
        !mission.nodes.some((n) => n.id === action.host) ||
        action.release !== 'r2'
      )
        throw new Error('Prepare a known host with release r2.');
      mission.prepared[action.host!] = action.release;
      return `${action.host} prepared for r2.`;
    }
    if (action.type === 'queue') {
      if (kind !== 'coordination' || !mission.nodes.some((node) => node.id === action.host))
        throw new Error('Queue a known coordinated-update host.');
      if (mission.queued.length >= 100) throw new Error('Action queue limit reached.');
      mission.queued.push({ type: 'commit', host: action.host });
      return `Queued ${action.host} for the next tick.`;
    }
    if (action.type === 'commit') {
      if (!this.applyingTick)
        throw new Error('Commit actions must execute on a simulation tick. Queue them first.');
      if (kind !== 'coordination' || mission.prepared[action.host!] !== 'r2')
        throw new Error(`${action.host} must be prepared for r2 first.`);
      const order = ['database', 'api-node', 'web-node'];
      const position = order.indexOf(action.host!);
      if (position < 0) throw new Error('Unknown host.');
      if (position > 0 && mission.committed[order[position - 1]] !== mission.tick)
        throw new Error('Dependency must commit in this same tick first.');
      mission.committed[action.host!] = mission.tick;
      return `${action.host} committed at tick ${mission.tick}.`;
    }
    throw new Error(`Unknown mission action: ${action.type}`);
  }

  step(
    controllers: (snapshot: ReturnType<Campaign['observations']>) => Action[][] = () => [],
  ): string[] {
    const mission = this.active;
    if (!['thermal', 'moving', 'coordination'].includes(this.definition!.kind))
      throw new Error('This is a static mission.');
    if (mission.status !== 'active') return [`Mission ${mission.status}. Reset to replay.`];
    mission.tick++;
    const externalResults: string[] = [];
    for (const event of this.definition!.thermal?.events ?? []) {
      if (event.tick !== mission.tick) continue;
      const node = mission.nodes.find((node) => node.id === event.host)!;
      if (event.type === 'arrival') {
        const amount = event.amount ?? 0;
        mission.jobs.push({
          id: `arrival-${mission.tick}`,
          host: node.id,
          remaining: amount,
          priority: event.priority ?? 1,
          deadline: event.deadline ?? mission.deadline,
        });
        node.load += amount;
        externalResults.push(
          `Incoming job: ${amount} units on ${node.id}, priority ${event.priority ?? 1}.`,
        );
      } else {
        node.cooling = event.cooling ?? node.cooling;
        externalResults.push(`Cooling changed on ${node.id}: ${node.cooling}.`);
      }
    }
    for (const id of Object.keys(this.progress.observations))
      if (this.world.canReach(id)) this.inspect(id);
    // Every controller sees the same detached pre-action snapshot.
    const snapshot = structuredClone(this.observations());
    snapshot.tick = mission.tick;
    const batches = controllers(snapshot);
    const actions = [...mission.queued.splice(0), ...batches.flat()];
    mission.results = externalResults;
    this.applyingTick = true;
    try {
      for (const action of actions) {
        try {
          mission.results.push(this.action(action));
        } catch (error) {
          mission.results.push(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      this.applyingTick = false;
    }
    if (this.definition!.kind === 'thermal') {
      const bandwidth = new Map<string, number>();
      for (const transfer of mission.transfers) {
        const link = [transfer.from, transfer.to].sort().join(':');
        const available = bandwidth.get(link) ?? 8;
        const moved = Math.min(available, transfer.remaining);
        transfer.remaining -= moved;
        bandwidth.set(link, available - moved);
        if (transfer.remaining <= 0) {
          mission.nodes.find((n) => n.id === transfer.to)!.load += transfer.amount;
          mission.jobs.push(
            ...(transfer.jobs ?? [
              {
                id: `legacy-transfer-${mission.tick}`,
                host: transfer.to,
                remaining: transfer.amount,
                priority: 1,
                deadline: mission.deadline,
              },
            ]),
          );
        }
      }
      mission.transfers = mission.transfers.filter((transfer) => transfer.remaining > 0);
      for (const node of mission.nodes) {
        if (!node.online) continue;
        let available = node.capacity * (node.temperature > 65 ? 0.45 : 1);
        let processed = 0;
        for (const job of mission.jobs
          .filter((job) => job.host === node.id && job.remaining > 0)
          .sort((a, b) => b.priority - a.priority || a.deadline - b.deadline)) {
          const amount = Math.min(job.remaining, available);
          job.remaining -= amount;
          available -= amount;
          processed += amount;
          if (available <= 0) break;
        }
        node.load = Math.max(0, node.load - processed);
        mission.completedWork += processed;
        node.temperature = Math.max(20, node.temperature + processed * 2.1 - node.cooling);
        if (node.temperature >= 95) node.online = false;
      }
      mission.jobs = mission.jobs.filter((job) => job.remaining > 0.00001);
    }
    if (this.definition!.kind === 'moving') {
      const current = `ring-${mission.tick % 5}`;
      if (mission.traps.some((trap) => trap.tick === mission.tick && trap.host === current))
        mission.captured = true;
      if (mission.tick % 2 === 0) {
        const filesystem = this.world.requireHost(current).filesystem;
        const previous = filesystem.readFile('/logs/sightings.log');
        filesystem.writeFile(
          '/logs/sightings.log',
          `${previous}\ntick=${mission.tick} process=specter host=${current}`,
        );
      }
    }
    for (const id of Object.keys(this.progress.observations))
      if (this.world.canReach(id)) this.inspect(id);
    if (this.progress.unlocked.includes('telemetry')) {
      mission.history.push({
        tick: mission.tick,
        nodes: structuredClone(mission.nodes),
        results: [...mission.results],
      });
      mission.history = mission.history.slice(-400);
    }
    const outcome = this.evaluate();
    return [...mission.results, ...(outcome ? [outcome] : [])];
  }

  evaluate(): string | undefined {
    const mission = this.active;
    if (mission.status !== 'active') return;
    const kind = this.definition!.kind;
    let success = false;
    if (kind === 'traffic')
      success =
        !this.world.requireHost('collector').neighbors.has('outside') &&
        this.reachable('router', 'app');
    if (kind === 'isolation') {
      const total = this.definition!.hosts.reduce((n, h) => n + h.links.length, 0);
      const current = this.definition!.hosts.reduce(
        (n, h) => n + this.world.requireHost(h.id).neighbors.size,
        0,
      );
      success =
        (total - current) / 2 <= 2 &&
        !this.reachable('core', 'red-1') &&
        !this.reachable('core', 'red-2') &&
        this.reachable('core', 'clinic');
    }
    if (kind === 'service') success = mission.nodes.every((n) => n.service === 'healthy');
    if (kind === 'thermal') {
      success =
        mission.completedWork >= mission.targetWork - 0.0001 &&
        mission.tick <= mission.deadline &&
        mission.nodes.every((n) => n.online);
      const expired = [
        ...mission.jobs,
        ...mission.transfers.flatMap((transfer) => transfer.jobs ?? []),
      ].some((job) => job.remaining > 0.00001 && mission.tick >= job.deadline);
      if (
        !success &&
        (mission.tick >= mission.deadline || mission.nodes.some((n) => !n.online) || expired)
      )
        mission.status = 'failed';
    }
    if (kind === 'moving') {
      success = mission.captured;
      if (!success && mission.tick >= 25) mission.status = 'failed';
    }
    if (kind === 'coordination') {
      const commits = ['database', 'api-node', 'web-node'].map((id) => mission.committed[id]);
      success = commits.every((tick) => tick !== undefined && tick === commits[0]);
      if (!success && mission.tick >= 20) mission.status = 'failed';
    }
    if (success) return this.complete();
    if (mission.status === 'failed') {
      mission.paused = true;
      return 'MISSION FAILED. Use mission reset to retry; your home tools are safe.';
    }
  }
}
