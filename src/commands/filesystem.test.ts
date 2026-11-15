import { expect, it } from 'vitest';
import { VirtualFileSystem } from '../core/filesystem';
import { Session } from '../core/session';
import { Shell } from '../core/shell';
import type { ShellState } from '../core/shell';
import { filesystemCommands } from './filesystem';
import { SessionFileSystem } from '../core/session-filesystem';
import { GameEngine } from '../game/engine';

function setup() {
  const filesystem = new VirtualFileSystem();
  const session = new Session(filesystem);
  const shell = new Shell(filesystemCommands, {
    ...new GameEngine().system,
    filesystem: new SessionFileSystem(() => session),
  });
  let state: ShellState = { entries: [] };
  return {
    filesystem,
    session,
    async run(input: string) {
      state = await shell.execute(state, input);
      return state.entries[state.entries.length - 1].output;
    },
  };
}

it('creates, navigates, lists, reads, and overwrites files through the shell', async () => {
  const { run } = setup();
  expect(await run('pwd')).toEqual(['/']);
  await run('mkdir home');
  await run('cd home');
  expect(await run('pwd')).toEqual(['/home']);
  await run('mkdir "my notes"');
  await run('write "my notes/today.txt" "hello world"');
  expect(await run('ls')).toEqual(['my notes']);
  expect(await run('ls "my notes"')).toEqual(['today.txt']);
  expect(await run('cat "my notes/today.txt"')).toEqual(['hello world']);
  await run('write "my notes/today.txt" ""');
  expect(await run('cat /home/my\\ notes/today.txt')).toEqual(['']);
  await run('cd ./my\\ notes/..');
  expect(await run('pwd')).toEqual(['/home']);
  await run('cd ../../..');
  expect(await run('pwd')).toEqual(['/']);
});

it('keeps the working directory and files intact after command errors', async () => {
  const { run } = setup();
  await run('mkdir /home');
  await run('cd /home');
  await run('write notes.txt "keep me"');
  expect(await run('cd notes.txt')).toEqual(['Not a directory: /home/notes.txt']);
  expect(await run('cd /missing')).toEqual(['Path not found: /missing']);
  expect(await run('pwd')).toEqual(['/home']);
  expect(await run('write /home "bad"')).toEqual(['Is a directory: /home']);
  expect(await run('mkdir notes.txt')).toEqual(['Path already exists: /home/notes.txt']);
  expect(await run('cat missing')).toEqual(['Path not found: /home/missing']);
  expect(await run('cat notes.txt')).toEqual(['keep me']);
});

it.each([
  ['pwd extra', 'pwd'],
  ['cd', 'cd <path>'],
  ['cat', 'cat <path>'],
  ['mkdir', 'mkdir <path>'],
  ['write file', 'write <path> "text"'],
  ['write file unquoted text', 'write <path> "text"'],
])('reports usage for %j without making changes', async (input, usage) => {
  const { run, filesystem, session } = setup();
  expect(await run(input)).toEqual([`Usage: ${usage}`]);
  expect(filesystem.list('/')).toEqual([]);
  expect(session.workingDirectory).toBe('/');
});

it('keeps silent commands silent, including listing an empty directory', async () => {
  const { run } = setup();
  expect(await run('mkdir empty')).toEqual([]);
  expect(await run('cd empty')).toEqual([]);
  expect(await run('ls')).toEqual([]);
  expect(await run('write file "text"')).toEqual([]);
});

it('distinguishes ls options from operands and supports -- for dash-prefixed names', async () => {
  const { run } = setup();
  await run('write -l "literal filename"');
  expect(await run('ls -l')).toEqual(['ls: unsupported option: -l']);
  expect(await run('ls / -l')).toEqual(['ls: unsupported option: -l']);
  expect(await run('ls --long')).toEqual(['ls: unsupported option: --long']);
  expect(await run('ls -- -l')).toEqual(['-l']);
});

it('lists explicit files, hides dotfiles by default, and handles multiple operands', async () => {
  const { run } = setup();
  await run('write .hidden "hidden"');
  await run('write visible "visible"');
  await run('mkdir folder');
  await run('write folder/nested "nested"');
  expect(await run('ls')).toEqual(['folder\nvisible']);
  expect(await run('ls .hidden')).toEqual(['.hidden']);
  expect(await run('ls missing visible folder')).toEqual([
    'ls: Path not found: /missing\nvisible\nfolder:\nnested',
  ]);
});

it('lets sessions share files while keeping their working directories independent', async () => {
  const { run, filesystem } = setup();
  const other = new Session(filesystem);
  await run('mkdir /home');
  await run('cd /home');
  await run('write notes.txt "shared"');
  expect(other.workingDirectory).toBe('/');
  expect(other.filesystem.readFile('/home/notes.txt')).toBe('shared');
});

it('removes relative and quoted files, handles multiple operands, and preserves directories', async () => {
  const { run, filesystem } = setup();
  await run('mkdir notes');
  await run('cd notes');
  await run('write "my file.txt" "temporary"');
  await run('write -draft "temporary"');
  expect(await run('rm "my file.txt"')).toEqual([]);
  expect(() => filesystem.readFile('/notes/my file.txt')).toThrow('Path not found');
  expect(await run('rm -draft')).toEqual(['rm: unsupported option: -draft']);
  expect(await run('rm -- -draft')).toEqual([]);
  await run('write keep "temporary"');
  expect(await run('rm missing keep')).toEqual(['rm: Path not found: /notes/missing']);
  expect(await run('ls')).toEqual([]);
  expect(await run('rm /notes')).toEqual(['rm: Is a directory: /notes']);
  expect(await run('rm')).toEqual(['Usage: rm <path...>']);
});
