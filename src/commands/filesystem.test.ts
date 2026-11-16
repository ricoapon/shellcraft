import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
it('creates, lists, reads, navigates, and removes files using structured commands', async () => {
  const g = new GameEngine();
  await g.execute(
    'mkdir /home/notes; write "/home/notes/my file" "hello"; write /home/notes/.hidden "yes"',
  );
  const text = (await g.execute('ls /home/notes')).output.join();
  expect(text).toContain('name');
  expect(text).toContain('/home/notes/my file');
  expect(text).toContain('.hidden');
  expect((await g.execute('let files = (ls /home/notes); count $files')).output).toEqual(['2']);
  await g.execute('cd /home/notes');
  expect((await g.execute('cat "my file"')).output).toEqual(['hello']);
  await g.execute('rm "my file"');
  expect((await g.execute('cat "my file"')).output.join()).toContain('Path not found');
  expect((await g.execute('rm /home/notes')).output.join()).toContain('directory');
});
it('rejects invalid arguments before effects and keeps navigation intact after errors', async () => {
  const g = new GameEngine();
  expect((await g.execute('cd /missing')).output.join()).toContain('Path not found');
  expect((await g.execute('pwd')).output).toEqual(['/home']);
  expect((await g.execute('write /home/a 1')).output.join()).toContain('Expected string');
  expect((await g.execute('cat')).output.join()).toContain('Usage: cat <path>');
  expect((await g.execute('ls /home "/"')).output.join()).toContain('Usage: ls');
});
it('uses explicit quoting for filenames with spaces and treats dash names literally', async () => {
  const g = new GameEngine();
  await g.execute('write -draft "content"');
  expect((await g.execute('cat -draft')).output).toEqual(['content']);
  await g.execute('rm -draft');
  expect((await g.execute('cat -draft')).output.join()).toContain('Path not found');
});
