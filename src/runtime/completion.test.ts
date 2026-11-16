import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { completionEdit } from './completion';
function fixture() {
  const game = new GameEngine(),
    fs = game.world.home.filesystem;
  fs.mkdir('/home/my notes');
  fs.mkdir('/home/library');
  fs.writeFile('/home/my notes/a file.txt', 'a');
  fs.writeFile('/home/my notes/a"quote.txt', 'q');
  fs.writeFile('/home/library/helper.sc', '# module');
  fs.writeFile('/home/library/data.json', '{}');
  fs.writeFile('/home/source.sc', '# source');
  return game;
}
const query = (game: GameEngine, source: string, cursor = source.length, path = '<terminal>') =>
  game.languageTools(source, path, cursor, path === '<terminal>');
it('uses command argument metadata and filters directories and script files', () => {
  const g = fixture();
  expect(query(g, 'cd /home/').completions.map((c) => c.label)).toEqual([
    '/home/library/',
    '/home/my notes/',
  ]);
  const run = query(g, 'run /home/').completions.map((c) => c.label);
  expect(run).toContain('/home/source.sc');
  expect(run).toContain('/home/library/');
  expect(run).not.toContain('/home/README.md');
  expect(query(g, 'write /home/a ').completions).toEqual([]);
  expect(query(g, 'mission list n').completions.map((c) => c.label)).toEqual(['network']);
  expect(query(g, 'mission start files-').completions.map((c) => c.label)).toEqual(['files-1']);
  expect(query(g, 'mission submit --script /home/s').completions.map((c) => c.label)).toContain(
    '/home/source.sc',
  );
});
it('completes quoted paths and escapes filenames without replacing surrounding source', () => {
  const g = fixture(),
    source = 'echo (cat "/home/my notes/a f"); echo after',
    cursor = source.indexOf('a f') + 3;
  const info = query(g, source, cursor),
    item = info.completions.find((c) => c.label.endsWith('a file.txt'))!;
  expect(item).toBeDefined();
  expect(completionEdit(source, info, item).source).toBe(
    'echo (cat "/home/my notes/a file.txt"); echo after',
  );
  const open = query(g, 'cat "/home/my n');
  const directory = open.completions.find((c) => c.kind === 'directory')!;
  expect(directory.insertText).toBe('"/home/my notes/"');
  expect(directory.cursorOffset).toBe(directory.insertText.length - 1);
  const escaped = query(g, 'cat "/home/my notes/a');
  expect(escaped.completions.find((c) => c.label.endsWith('a"quote.txt'))?.insertText).toBe(
    '"/home/my notes/a\\"quote.txt"',
  );
});
it('completes relative, parent, dotfile, and module paths in the correct filesystem', async () => {
  const g = fixture();
  g.world.home.filesystem.writeFile('/home/.hidden', 'hidden');
  await g.execute('cd /home/my notes'); // Invalid unquoted input must not affect location.
  await g.execute('cd "/home/my notes"');
  expect(query(g, 'cat ./a').completions.map((c) => c.label)).toContain('./a file.txt');
  expect(query(g, 'cat ../.h').completions.map((c) => c.label)).toEqual(['../.hidden']);
  expect(
    query(g, 'use ./h', undefined, '/home/library/main.sc').completions.map((c) => c.label),
  ).toEqual(['./helper.sc']);
});
it('separates host evidence paths from workspace and library paths', async () => {
  const g = fixture();
  await g.execute('mission start files-1');
  expect(query(g, 'cat /').completions.map((c) => c.label)).toContain('/notes/');
  expect(query(g, 'cat /home/').completions).toEqual([]);
  expect(query(g, 'run /home/s').completions.map((c) => c.label)).toContain('/home/solve.sc');
  expect(query(g, 'echo (cat /no').completions.map((c) => c.label)).toEqual(['/notes/']);
  expect(query(g, 'use /home/l').completions.map((c) => c.label)).toContain('/home/library/');
});
it('replaces at the caret and preserves later arguments and statements', () => {
  const g = fixture(),
    source = 'cat /home/READ; echo keep',
    cursor = source.indexOf(';');
  const info = query(g, source, cursor),
    item = info.completions.find((c) => c.label.endsWith('README.md'))!;
  expect(completionEdit(source, info, item).source).toBe('cat /home/README.md; echo keep');
  expect(query(g, '# cat /home/').completions).toEqual([]);
  expect(query(g, 'echo "cat /home/"', 12).completions).toEqual([]);
});
it('does not discover hosts or mutate any game state during completion', async () => {
  const g = fixture();
  g.campaign.progress.completed = ['files-1', 'files-2'];
  await g.execute('mission start network-1');
  const before = g.snapshot();
  expect(query(g, 'ssh ').completions).toEqual([]);
  expect(g.snapshot()).toEqual(before);
  await g.execute('neighbors');
  expect(query(g, 'ssh ').completions.some((c) => c.detail === 'discovered host')).toBe(true);
});
it('completes a variable from its sigil and replaces the whole token at the caret', () => {
  const g = fixture(),
    source = 'let location = "/home"; echo $';
  const info = query(g, source);
  expect(info.completions.map((c) => c.label)).toEqual(['$location']);
  expect(completionEdit(source, info, info.completions[0]).source).toBe(source + 'location');
  const nested = 'let location = "/home"; echo (cat $); echo after',
    nestedInfo = query(g, nested, nested.indexOf('$') + 1);
  expect(completionEdit(nested, nestedInfo, nestedInfo.completions[0]).source).toBe(
    'let location = "/home"; echo (cat $location); echo after',
  );
  const middle = 'let location = "/home"; echo $locOld; echo after',
    cursor = middle.indexOf('Old');
  const replacement = query(g, middle, cursor);
  expect(completionEdit(middle, replacement, replacement.completions[0]).source).toBe(
    'let location = "/home"; echo $location; echo after',
  );
});
