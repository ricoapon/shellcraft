import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('drives the real shared language without a browser and reports errors structurally', () => {
  const requests = [
    { command: 'let marker = "persistent"; echo $marker' },
    {
      script:
        'mission start files-1\nlet parts = (split "=" (trim (cat /notes/access.txt)))\nmission submit $parts[1]\nmission leave\necho "script-finished"',
    },
    { inspect: true },
    { command: 'let wrong: number = "text"' },
    { command: 'echo $marker' },
    { analyze: { source: 'let value: number = "wrong"', offset: 26 } },
    { command: 'ls /home' },
  ];
  const run = spawnSync(process.execPath, ['scripts/test-game.mjs', '--jsonl'], {
    cwd: process.cwd(),
    input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n',
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(run.stderr).toBe('');
  expect(run.status).toBe(1);
  const replies = run.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(replies).toHaveLength(requests.length);
  expect(replies[0].output).toEqual(['persistent']);
  expect(replies[1].ok).toBe(true);
  expect(replies[1].output).toContain('script-finished');
  expect(replies[2].view.host).toBe('home');
  expect(replies[3].ok).toBe(false);
  expect(replies[3].error).toContain('Expected number');
  expect(replies[4].output).toEqual(['persistent']);
  expect(replies[5].language.diagnostics).toHaveLength(1);
  expect(replies[6].values[0]).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'solve.sc', type: 'file' })]),
  );
}, 30000);

it('persists only explicit test saves between independent driver invocations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shellcraft-driver-')),
    state = join(directory, 'state.json');
  try {
    const first = spawnSync(
      process.execPath,
      [
        'scripts/test-game.mjs',
        '--json',
        '--state',
        state,
        '-c',
        'write /home/persisted "saved"; let ephemeral = 1',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 },
    );
    expect(first.status, first.stderr).toBe(0);
    const second = spawnSync(
      process.execPath,
      [
        'scripts/test-game.mjs',
        '--json',
        '--state',
        state,
        '-c',
        'cat /home/persisted',
        '-c',
        'echo $ephemeral',
      ],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 },
    );
    const replies = second.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(replies[0].output).toEqual(['saved']);
    expect(replies[1].error).toContain('Unknown variable');
    expect(readFileSync(state, 'utf8')).not.toContain('ephemeral');
  } finally {
    if (existsSync(state)) unlinkSync(state);
    rmdirSync(directory);
  }
}, 30000);
