export type MissionKind = 'files' | 'network';
export interface MissionHost {
  id: string;
  links: string[];
  files: Record<string, string>;
}
export interface MissionDefinition {
  id: string;
  title: string;
  kind: MissionKind;
  entry: string;
  briefing: string;
  hints: readonly string[];
  prerequisite?: string;
}
export interface MissionInstance {
  hosts: MissionHost[];
  answer: string;
}
export const missions: readonly MissionDefinition[] = [
  {
    id: 'files-1',
    title: 'The first note',
    kind: 'files',
    entry: 'archive',
    briefing:
      'Find the password in /notes/access.txt. Read it with cat, then use mission submit <password>.',
    hints: [
      'The briefing names the file. cat reads a file without changing it.',
      'Submit the value after password=, not the whole line.',
    ],
  },
  {
    id: 'files-2',
    title: 'A few more files',
    kind: 'files',
    entry: 'archive',
    prerequisite: 'files-1',
    briefing:
      'Find the PASSWORD marker among the files in /notes. Your first search can be manual or scripted. Scripting is now available: guide scripts explains the small building blocks.',
    hints: [
      'Use ls /notes to see the files, then read them.',
      'A script can loop over ctx.fs.list("/notes") and read each entry.path.',
      'Search each file for PASSWORD= and submit its value.',
    ],
  },
  {
    id: 'files-3',
    title: 'Below the surface',
    kind: 'files',
    entry: 'archive',
    prerequisite: 'files-2',
    briefing:
      'Find PASSWORD somewhere below /archive. Directories can contain other directories. Extend your existing search rather than starting over.',
    hints: [
      'ls accepts a directory path. Inspect entry.type in a script.',
      'For a directory, repeat the same search inside it; for a file, read its contents.',
      'A recursive function or a list of directories still to visit can both work.',
    ],
  },
  {
    id: 'files-4',
    title: 'The right match',
    kind: 'files',
    entry: 'archive',
    prerequisite: 'files-3',
    briefing:
      'Several files contain PASSWORD. Only the record with active=true is valid. Keep your traversal and improve how it selects a match.',
    hints: [
      'Read the complete matching record, not just the password line.',
      'The active flag and password belong to the same file.',
    ],
  },
  {
    id: 'files-5',
    title: 'Follow the reference',
    kind: 'files',
    entry: 'archive',
    prerequisite: 'files-4',
    briefing:
      '/deploy/current.json identifies the active release. Find that release under /credentials and submit its password. Other releases are decoys.',
    hints: [
      'Start by reading current.json.',
      'JSON.parse(ctx.fs.read(path)) converts JSON text into fields you can inspect.',
      'Match the release ID before choosing a password.',
    ],
  },
  {
    id: 'files-6',
    title: 'A tool worth keeping',
    kind: 'files',
    entry: 'archive',
    prerequisite: 'files-5',
    briefing:
      'Find the active PASSWORD record in a larger nested archive. The rules are familiar; reuse your search and filtering. The optional automation star checks fresh layouts too.',
    hints: [
      'Your files-4 approach should still apply.',
      'Do not assume a particular filename or directory depth.',
    ],
  },
  {
    id: 'network-1',
    title: 'The next machine',
    kind: 'network',
    entry: 'gateway',
    prerequisite: 'files-2',
    briefing:
      'The password is on a neighboring machine, under /notes. Use neighbors to discover it and ssh <host> to connect. File-reading rules are unchanged.',
    hints: [
      'neighbors shows connections from the current machine.',
      'Follow the connection, list /notes, and read the password record.',
    ],
  },
  {
    id: 'network-2',
    title: 'Choose a branch',
    kind: 'network',
    entry: 'gateway',
    prerequisite: 'network-1',
    briefing:
      'Several machines branch out from gateway. Find PASSWORD in their /notes directories. Reuse your file search; add exploration of neighboring hosts.',
    hints: [
      'Use exit to return to the previous machine. At the entry machine, use mission leave to go home.',
      'Scripts can call ctx.network.neighbors() and ctx.network.connect(id). A handle has its own fs and does not move the terminal.',
    ],
  },
  {
    id: 'network-3',
    title: 'Around in circles',
    kind: 'network',
    entry: 'gateway',
    prerequisite: 'network-2',
    briefing:
      'The network contains cycles. Find the active PASSWORD record while avoiding endless revisits. Your file search should remain useful.',
    hints: [
      'Keep a record of machines already visited.',
      'Mark a host visited before exploring its neighbors.',
      'A Set of host IDs works well for detecting revisits.',
    ],
  },
  {
    id: 'network-4',
    title: 'Distributed evidence',
    kind: 'network',
    entry: 'gateway',
    prerequisite: 'network-3',
    briefing:
      'The gateway has /deploy/current.json. Find the matching release credential elsewhere in the cyclic network. Combine your reference lookup, file search, and network traversal.',
    hints: [
      'Determine the current release before selecting a credential.',
      'Collect matching release records across discovered hosts.',
      'Use the release field to reject old credentials.',
    ],
  },
];

/** Seeded variations change evidence and layout while keeping each level's published rules. */
export function createInstance(id: string, seed: number): MissionInstance {
  const definition = missions.find((m) => m.id === id);
  if (!definition) throw new Error('Unknown level: ' + id);
  let state = seed >>> 0;
  const random = (count: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % count;
  };
  const answer = `key-${random(0xffffff).toString(16)}-${random(0xffffff).toString(16)}`;
  const files: Record<string, string> = {};
  const host = (id: string, files: Record<string, string>, links: string[] = []): MissionHost => ({
    id,
    files,
    links,
  });
  const active = `active=true\nPASSWORD=${answer}\n`;
  if (id === 'files-1') files['/notes/access.txt'] = `password=${answer}\n`;
  if (id === 'files-2') {
    const target = random(5);
    for (let i = 0; i < 5; i++)
      files[`/notes/note-${i}.txt`] =
        i === target ? `PASSWORD=${answer}\n` : 'Operations note: no credential stored here.\n';
  }
  if (['files-3', 'files-4', 'files-6'].includes(id)) {
    const count = id === 'files-6' ? 32 : 8;
    const target = random(count);
    for (let i = 0; i < count; i++) {
      const depth = 1 + random(id === 'files-6' ? 4 : 2);
      const directory = Array.from({ length: depth }, () => `section-${random(7)}`).join('/');
      files[`/archive/${directory}/record-${i}.txt`] =
        i === target
          ? active
          : id === 'files-3'
            ? 'Archive note.\n'
            : `active=false\nPASSWORD=retired-${i}\n`;
    }
  }
  if (id === 'files-5') {
    const release = `r${random(5)}`;
    files['/deploy/current.json'] = JSON.stringify({ release });
    for (let i = 0; i < 5; i++)
      files[`/credentials/release-${i}.json`] = JSON.stringify({
        release: `r${i}`,
        password: `r${i}` === release ? answer : `retired-${i}`,
      });
  }
  if (definition.kind === 'files') return { hosts: [host('archive', files)], answer };
  const count = id === 'network-1' ? 2 : id === 'network-2' ? 4 + random(3) : 5 + random(4);
  const ids = ['gateway', ...Array.from({ length: count - 1 }, (_, i) => `node-${i + 1}`)];
  const target = 1 + random(count - 1);
  const release = `r${random(500)}`;
  const hosts = ids.map((name) => host(name, {}));
  for (let i = 1; i < count; i++) {
    const parent = id === 'network-2' ? (i <= 2 ? 0 : random(i)) : i - 1;
    if (!hosts[parent].links.includes(ids[i])) hosts[parent].links.push(ids[i]);
    hosts[i].links.push(ids[parent]);
    hosts[i].files['/notes/record.txt'] =
      i === target && id !== 'network-4' ? active : 'No active password in this note.\n';
    if (id === 'network-4')
      hosts[i].files['/credentials/release.json'] = JSON.stringify({
        release: i === target ? release : `retired-${i}`,
        password: i === target ? answer : `old-${i}`,
      });
  }
  if (['network-3', 'network-4'].includes(id)) {
    hosts[count - 1].links.push('gateway');
    hosts[0].links.push(ids[count - 1]);
  }
  hosts[0].files['/notes/welcome.txt'] = 'Explore connected hosts. Home is outside this level.\n';
  if (id === 'network-4') hosts[0].files['/deploy/current.json'] = JSON.stringify({ release });
  return { hosts, answer };
}
