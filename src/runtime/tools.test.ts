import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { isIncomplete } from './syntax';
it('provides inferred record fields while editing incomplete source', () => {
  const g = new GameEngine(),
    source = 'let files = (ls /home)\necho $files[0].';
  const info = g.languageTools(source, '/home/test.sc', source.length, false);
  expect(info.completions.map((c) => c.label)).toEqual(
    expect.arrayContaining(['name', 'path', 'type']),
  );
  expect(info.replaceFrom).toBe(source.length);
});
it('provides loop-variable fields without executing the loop', () => {
  const g = new GameEngine(),
    source = 'for file in (ls /home) {\n echo $file.';
  const before = g.snapshot();
  const info = g.languageTools(source, '/home/test.sc', source.length, false);
  expect(info.completions.map((c) => c.label)).toContain('path');
  expect(g.snapshot()).toEqual(before);
});
it('offers subcommands, paths, and only discovered neighboring hosts', async () => {
  const g = new GameEngine();
  expect(
    g.languageTools('mission sta', '<terminal>', 11, true).completions.map((c) => c.label),
  ).toContain('start');
  expect(
    g.languageTools('cat /home/', '<terminal>', 10, true).completions.map((c) => c.label),
  ).toContain('/home/README.md');
  g.campaign.progress.completed = ['files-1', 'files-2'];
  g.campaign.start('network-1', 1);
  const before = g.snapshot();
  expect(
    g.languageTools('ssh ', '<terminal>', 4, true).completions.map((c) => c.detail),
  ).not.toContain('discovered host');
  expect(g.snapshot()).toEqual(before);
  await g.execute('neighbors');
  expect(
    g
      .languageTools('ssh ', '<terminal>', 4, true)
      .completions.some((c) => c.detail === 'discovered host'),
  ).toBe(true);
});
it('reports static errors, signatures, definitions, and variable references', () => {
  const g = new GameEngine();
  expect(
    g.languageTools('let n: number = "x"', '/home/test.sc', 19, false).diagnostics[0].message,
  ).toContain('Expected number');
  const source = 'let text = "hello"\necho $text';
  const info = g.languageTools(source, '/home/test.sc', source.length, false);
  expect(info.hover).toBe('string');
  expect(info.references).toEqual([
    { offset: 4, length: 4 },
    { offset: source.indexOf('$text') + 1, length: 4 },
  ]);
  expect(info.signature).toContain('echo');
});
it('recognizes complete and incomplete multiline shell submissions', () => {
  expect(isIncomplete('for file in (ls /) {')).toBe(true);
  expect(isIncomplete('for file in (ls /) {\n echo $file.name\n}')).toBe(false);
  expect(isIncomplete('let values = [\n1,\n2\n]')).toBe(false);
  expect(isIncomplete('cat *')).toBe(false);
  expect(isIncomplete('let value =')).toBe(false);
  expect(isIncomplete('echo (2 *')).toBe(true);
  expect(isIncomplete('echo (2 *\n3)')).toBe(false);
  const g = new GameEngine();
  expect(g.languageTools('cat *', '<terminal>', 5, true).diagnostics[0].message).toContain(
    'Wildcard expansion is not supported',
  );
});
