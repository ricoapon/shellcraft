export type MissionKind =
  | 'search'
  | 'traffic'
  | 'isolation'
  | 'service'
  | 'records'
  | 'thermal'
  | 'moving'
  | 'coordination';
export interface MissionHost {
  id: string;
  links: string[];
  files: Record<string, string>;
  writable?: string[];
}
export interface MissionDefinition {
  id: string;
  title: string;
  kind: MissionKind;
  briefing: string;
  hint: string;
  reward: number;
  entry: string;
  hosts: MissionHost[];
  answer?: string;
  requiredCapability?: string;
  thermal?: {
    workload: number;
    deadline: number;
    events?: {
      tick: number;
      type: 'arrival' | 'cooling';
      host: string;
      amount?: number;
      priority?: number;
      deadline?: number;
      cooling?: number;
    }[];
  };
}

function archive(count: number, directory = '/archive'): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${directory}/record-${String(index + 1).padStart(3, '0')}.txt`,
      `ARCHIVE ${index + 1}\nState: archived\nOwner: operations\nChecksum: ${(index * 7919 + 17).toString(16)}\n`,
    ]),
  );
}
const host = (
  id: string,
  files: Record<string, string>,
  links: string[] = [],
  writable?: string[],
): MissionHost => ({ id, files, links, writable });

export const missions: readonly MissionDefinition[] = [
  {
    id: 'deployment',
    title: '01 · Deployment note',
    kind: 'search',
    reward: 3,
    entry: 'deploy',
    briefing:
      'The deployment team left fifteen notes. Find the password belonging to the active deployment. Connect with ssh deploy, use ls /notes to list files and cat <path> to read one, then mission submit <password> to submit the value you found. Earn tokens to unlock JavaScript scripting.',
    hint: 'Read /notes/INDEX.txt. Only one deployment is active; its note identifies the password file.',
    answer: 'copper-lantern',
    hosts: [
      host('deploy', {
        ...archive(12, '/notes'),
        '/notes/INDEX.txt':
          'Active deployment: aurora-7\nRead /notes/deployment.txt. Old records are not active.\n',
        '/notes/deployment.txt':
          'deployment=aurora-7\nstatus=ACTIVE\npassword_file=/notes/access.txt\n',
        '/notes/access.txt': 'deployment=aurora-7\npassword=copper-lantern\n',
      }),
    ],
  },
  {
    id: 'archive',
    title: '02 · Search the archive',
    kind: 'search',
    reward: 3,
    entry: 'vault',
    briefing:
      'A much larger archive contains one RECOVERY_KEY marker. Search /archive and submit its value with mission submit. Buy scripting using upgrade buy scripting; edit /home/scripts/search.js to build a reusable search tool.',
    hint: 'run /home/scripts/search.js RECOVERY_KEY /archive. The supplied script is editable; inspect its implementation.',
    answer: 'glass-orbit',
    hosts: [
      host('vault', {
        ...archive(70),
        '/archive/record-047.txt': 'State: verified\nRECOVERY_KEY=glass-orbit\n',
      }),
    ],
  },
  {
    id: 'nested',
    title: '03 · Nested archive',
    kind: 'search',
    reward: 3,
    entry: 'branches',
    briefing:
      'The archive is spread over directories. Several records match RECOVERY_KEY; only a record with active=true contains the key. Extend your search with recursion and line numbers. Custom commands can be unlocked now: upgrade buy commands. guide commands explains how to reuse your tools.',
    hint: 'The library /home/lib/search.js already demonstrates recursive traversal. Inspect all matches, not just the first one.',
    answer: 'winter-signal',
    hosts: [
      host('branches', {
        ...archive(20, '/archive/old'),
        ...archive(20, '/archive/2026/november'),
        '/archive/old/key.txt': 'active=false\nRECOVERY_KEY=old-signal\n',
        '/archive/2026/november/active/key.txt': 'active=true\nRECOVERY_KEY=winter-signal\n',
      }),
    ],
  },
  {
    id: 'credentials',
    title: '04 · Active credentials',
    kind: 'search',
    reward: 4,
    entry: 'registry',
    briefing:
      'Backups and current records conflict. Determine the active release and submit its credential. Read timestamps and revocation records, not just matching strings.',
    hint: 'The active release is in /deploy/current.json. Its credential must not appear in revoked.json.',
    answer: 'river-amber',
    hosts: [
      host('registry', {
        '/deploy/current.json': JSON.stringify(
          { release: 'r19', updated: '2026-11-14T09:00:00Z' },
          null,
          2,
        ),
        '/credentials/revoked.json': JSON.stringify(['old-r18', 'leaked-r19']),
        '/credentials/r18.json': JSON.stringify({
          release: 'r18',
          credential: 'old-r18',
          issued: '2026-11-12T08:00:00Z',
        }),
        '/credentials/r19-backup.json': JSON.stringify({
          release: 'r19',
          credential: 'leaked-r19',
          issued: '2026-11-13T08:00:00Z',
        }),
        '/credentials/r19-active.json': JSON.stringify({
          release: 'r19',
          credential: 'river-amber',
          issued: '2026-11-14T08:30:00Z',
        }),
        ...archive(12, '/backups'),
      }),
    ],
  },
  {
    id: 'connected',
    title: '05 · Connected machines',
    kind: 'search',
    reward: 5,
    entry: 'gateway',
    briefing:
      'A key is on one of three connected machines. Use neighbors to discover links, ssh to move between hosts, and exit to return. Submit the NETWORK_KEY. This reward funds scripted network handles.',
    hint: 'gateway → relay → store. Run neighbors on each machine. Your home scripts remain available on every host.',
    answer: 'harbor-light',
    hosts: [
      host(
        'gateway',
        { '/welcome.txt': 'The key is not here. Explore the network using neighbors.' },
        ['relay'],
      ),
      host('relay', archive(10), ['gateway', 'store']),
      host('store', { ...archive(15), '/archive/key.txt': 'NETWORK_KEY=harbor-light' }, ['relay']),
    ],
  },
  {
    id: 'discovery',
    title: '06 · Network discovery',
    kind: 'search',
    reward: 6,
    entry: 'mesh-0',
    briefing:
      'Map a cyclic network and locate TARGET_KEY. Use upgrade buy network for explicit scripted host handles, use a visited set, and keep your collected observations. See guide api and /home/scripts/crawl.js. This reward can unlock custom screens.',
    hint: 'run /home/scripts/crawl.js TARGET_KEY. Study ctx.network.connect(host) and handle.fs; scripted connections do not move your terminal.',
    answer: 'violet-compass',
    hosts: Array.from({ length: 8 }, (_, index) =>
      host(
        `mesh-${index}`,
        {
          ...archive(8),
          ...(index === 6 ? { '/archive/target.txt': 'TARGET_KEY=violet-compass' } : {}),
        },
        [
          ...new Set([
            `mesh-${(index + 1) % 8}`,
            `mesh-${(index + 7) % 8}`,
            `mesh-${(index + 3) % 8}`,
          ]),
        ],
      ),
    ),
  },
  {
    id: 'traffic',
    title: '07 · Traffic collector',
    kind: 'traffic',
    reward: 5,
    entry: 'router',
    briefing:
      'One machine collects internal traffic and forwards it to an external sink. Inspect connections, identify the collector, and disable only its external link. Keep application traffic online. Use inspect, link, and custom screens.',
    hint: 'inspect collector reveals an outbound collector → outside flow. link collector outside off stops it without breaking router → app.',
    hosts: [
      host(
        'router',
        { '/brief.txt': 'Keep the application reachable. External exfiltration must stop.' },
        ['app', 'sensor', 'collector'],
      ),
      host('app', { '/service.txt': 'application production' }, ['router', 'collector']),
      host('sensor', {}, ['router', 'collector']),
      host('collector', {}, ['router', 'app', 'sensor', 'outside']),
      host('outside', {}, ['collector']),
    ],
  },
  {
    id: 'isolation',
    title: '08 · Network isolation',
    kind: 'isolation',
    reward: 5,
    entry: 'core',
    briefing:
      'Quarantine hostile red-1 and red-2 with at most two disconnected links. Friendly core and clinic must stay connected. Inspect the graph, apply link <from> <to> off, and use reach <from> <to> to check current connectivity. You can restore a link with link <from> <to> on.',
    hint: 'Both hostile machines sit behind bridge. Cut core ↔ bridge and clinic ↔ bridge. Do not cut core ↔ clinic.',
    hosts: [
      host('core', {}, ['clinic', 'bridge']),
      host('clinic', {}, ['core', 'bridge']),
      host('bridge', {}, ['core', 'clinic', 'red-1', 'red-2']),
      host('red-1', {}, ['bridge', 'red-2']),
      host('red-2', {}, ['bridge', 'red-1']),
    ],
  },
  {
    id: 'repair',
    title: '09 · Service repair',
    kind: 'service',
    reward: 6,
    entry: 'frontend',
    briefing:
      'Restore the web service by following its dependencies. Inspect services and logs, fix the database configuration, then restart services in dependency order. Remote writes are allowed only under /etc/app. On the database host, read the configuration with cat and replace its complete contents with write (see help write). edit always opens home files. guide stuck explains quoted JSON writes.',
    hint: 'db /etc/app/database.json needs {"port":5432,"enabled":true}. Then service db restart, service api restart, service frontend restart.',
    hosts: [
      host('frontend', { '/logs/service.log': 'web unhealthy: upstream api is unavailable' }, [
        'api',
      ]),
      host(
        'api',
        { '/logs/service.log': 'api unhealthy: database refused connection on port 5432' },
        ['frontend', 'db'],
      ),
      host(
        'db',
        {
          '/etc/app/database.json': '{"port":5433,"enabled":true}',
          '/logs/service.log': 'database misconfigured: expected port 5432',
        },
        ['api'],
        ['/etc/app'],
      ),
    ],
  },
  {
    id: 'records',
    title: '10 · Conflicting records',
    kind: 'records',
    reward: 5,
    entry: 'dispatch',
    briefing:
      'Find the final valid destination for shipment A17. Merge correction records across machines, normalize timezone offsets, and exclude revoked events. Submit the destination. A timeline screen can help.',
    hint: 'Normalize timestamps with Date.parse. The 12:10+02:00 correction is later than 09:45Z. The later-looking record with revoked=true is invalid.',
    answer: 'north-harbor',
    hosts: [
      host(
        'dispatch',
        {
          '/shipments/base.json': JSON.stringify({
            shipment: 'A17',
            destination: 'east-yard',
            time: '2026-11-14T09:00:00Z',
          }),
        },
        ['customs'],
      ),
      host(
        'customs',
        {
          '/shipments/correction.json': JSON.stringify({
            shipment: 'A17',
            destination: 'west-dock',
            time: '2026-11-14T09:45:00Z',
          }),
        },
        ['dispatch', 'warehouse'],
      ),
      host(
        'warehouse',
        {
          '/shipments/final.json': JSON.stringify({
            shipment: 'A17',
            destination: 'north-harbor',
            time: '2026-11-14T12:10:00+02:00',
          }),
          '/shipments/revoked.json': JSON.stringify({
            shipment: 'A17',
            destination: 'south-airfield',
            time: '2026-11-14T11:30:00Z',
            revoked: true,
          }),
        },
        ['customs'],
      ),
    ],
  },
  {
    id: 'thermal',
    title: '11 · Thermal balancing',
    kind: 'thermal',
    reward: 8,
    entry: 'compute-a',
    briefing:
      'Finish 96 units of work by tick 45 without a thermal shutdown. All work starts on compute-a. Use transfer <from> <to> <amount>, watch heat and bandwidth, and use simulation step. Try an automation controller after unlocking controllers.',
    hint: 'While paused, transfer compute-a compute-b 28 and transfer compute-a compute-c 28. Transfers take ticks; keep all three machines productive. Then simulation step 35. Reset the mission if a deadline is missed.',
    hosts: [
      host('compute-a', {}, ['compute-b', 'compute-c']),
      host('compute-b', {}, ['compute-a', 'compute-c']),
      host('compute-c', {}, ['compute-a', 'compute-b']),
    ],
  },
  {
    id: 'moving',
    title: '12 · Moving process',
    kind: 'moving',
    reward: 6,
    entry: 'ring-0',
    briefing:
      'A process moves one node clockwise per tick around a five-node ring. Sightings are partial. Set trap <host> <tick> to intercept it at a future tick, then use simulation step to advance time. Read /logs/sightings.log for the initial evidence. Sightings and predictions can be visualized.',
    hint: 'At tick 0 the process is on ring-0. At tick n it is on ring-(n % 5). Try trap ring-3 3, then simulation step 3.',
    hosts: Array.from({ length: 5 }, (_, i) =>
      host(
        `ring-${i}`,
        {
          '/logs/sightings.log':
            i === 0
              ? 'tick=0 process=specter host=ring-0\nRule: clockwise, one hop per tick.'
              : 'No current sighting.',
        },
        [`ring-${(i + 1) % 5}`, `ring-${(i + 4) % 5}`],
      ),
    ),
  },
  {
    id: 'coordination',
    title: '13 · Coordinated update',
    kind: 'coordination',
    reward: 10,
    entry: 'database',
    briefing:
      'Prepare release r2 on database, api-node, and web-node. Commit all three in the same simulation tick, ordered database → api-node → web-node. Use prepare and queue; queue all three before using simulation step, because queued actions apply on the next tick. A controller can return the same ordered action list.',
    hint: 'prepare database r2; prepare api-node r2; prepare web-node r2 (separate commands). Then queue database, queue api-node, queue web-node, and simulation step.',
    hosts: [
      host('database', {}, ['api-node']),
      host('api-node', {}, ['database', 'web-node']),
      host('web-node', {}, ['api-node']),
    ],
  },
  {
    id: 'surge',
    title: '14 · Priority surge',
    kind: 'thermal',
    reward: 6,
    entry: 'compute-a',
    briefing:
      'A bonus scheduling challenge: 72 routine work units are followed by 48 urgent units at tick 6. Urgent work must finish by tick 32; all 120 units must finish by tick 45. Processing selects higher-priority jobs first. Watch jobs and in-flight transfers in the observation snapshot and adapt your controller.',
    hint: 'Use the balance controller and inspect incoming jobs in mission status or a custom table. The urgent arrival occurs before the tick-6 controller snapshot. Keep all three machines productive.',
    thermal: {
      workload: 72,
      deadline: 45,
      events: [
        { tick: 6, type: 'arrival', host: 'compute-a', amount: 48, priority: 3, deadline: 32 },
      ],
    },
    hosts: [
      host('compute-a', {}, ['compute-b', 'compute-c']),
      host('compute-b', {}, ['compute-a', 'compute-c']),
      host('compute-c', {}, ['compute-a', 'compute-b']),
    ],
  },
  {
    id: 'cooling',
    title: '15 · Cooling failure',
    kind: 'thermal',
    reward: 6,
    entry: 'compute-a',
    briefing:
      'Another 16 work units arrive at tick 6, and compute-b loses most cooling at tick 8. Complete 112 units by tick 45 without a shutdown. Extend your scheduler using temperature, cooling, priorities, and the action-result history.',
    hint: 'The balance controller is a starting point. Observe cooling and transfer queues, then avoid sending work to a hot node. Your tools and history persist if you reset this challenge.',
    thermal: {
      workload: 96,
      deadline: 45,
      events: [
        { tick: 6, type: 'arrival', host: 'compute-c', amount: 16, priority: 2, deadline: 40 },
        { tick: 8, type: 'cooling', host: 'compute-b', cooling: 0.4 },
      ],
    },
    hosts: [
      host('compute-a', {}, ['compute-b', 'compute-c']),
      host('compute-b', {}, ['compute-a', 'compute-c']),
      host('compute-c', {}, ['compute-a', 'compute-b']),
    ],
  },
];

export const upgrades = [
  {
    id: 'scripting',
    name: 'JavaScript modules',
    cost: 2,
    after: 1,
    description: 'Run scripts, import home modules, and use structured filesystem APIs.',
  },
  {
    id: 'commands',
    name: 'Custom commands',
    cost: 2,
    after: 2,
    description: 'Load a startup module and register reusable terminal commands.',
  },
  {
    id: 'network',
    name: 'Scripted network handles',
    cost: 4,
    after: 5,
    description: 'Connect to discovered hosts from scripts without moving your terminal.',
  },
  {
    id: 'screens',
    name: 'Custom screens',
    cost: 4,
    after: 6,
    description: 'Render tables, charts, Mermaid diagrams, and interactive graphs.',
  },
  {
    id: 'telemetry',
    name: 'Telemetry history',
    cost: 3,
    after: 7,
    description: 'Retain per-tick measurements for live screens and diagnostics.',
  },
  {
    id: 'controllers',
    name: 'Automation controllers',
    cost: 5,
    after: 9,
    description: 'Run bounded decision functions on each simulation tick.',
  },
] as const;
