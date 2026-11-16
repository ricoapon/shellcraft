import { describe, expect, it } from 'vitest';
import { LanguageSession } from './interpreter';
import { parse, isIncomplete } from './syntax';
import { bool, generic, list, nothing, number, string, validateValue } from './types';
import type { LanguageHost, Value } from './types';
import { matchText } from './regex';
function fixture() {
  const output: Value[] = [],
    calls: Value[][] = [],
    files: Record<string, string> = {};
  const host: LanguageHost = {
    commands: () => [
      { name: 'echo', signatures: [{ parameters: [generic], result: nothing }] },
      {
        name: 'contains',
        signatures: [
          { parameters: [string, string], result: bool },
          { parameters: [list(generic), generic], result: bool },
        ],
      },
      { name: 'read', signatures: [{ parameters: [string], result: string }] },
      { name: 'count', signatures: [{ parameters: [list(generic)], result: number }] },
    ],
    invoke: async (name, args) => {
      calls.push(args);
      if (name === 'echo') output.push(args[0]);
      if (name === 'read') return 'text';
      if (name === 'count') return (args[0] as Value[]).length;
      if (name === 'contains') return (args[0] as string).includes(args[1] as string);
    },
    read: (path) => {
      if (!Object.hasOwn(files, path)) throw new Error('Missing source.');
      return files[path];
    },
    display: (value) => output.push(value),
  };
  return { session: new LanguageSession(host), output, calls, files };
}
describe('shared Shellcraft language', () => {
  it('uses typed results for nested calls and displays only uncaptured values', async () => {
    const f = fixture();
    await f.session.execute('let value = (read "/file"); contains $value "ex"; echo $value');
    expect(f.output).toEqual([true, 'text']);
    expect(f.calls).toEqual([['/file'], ['text', 'ex'], ['text']]);
  });
  it('checks the complete submission before side effects', async () => {
    const f = fixture();
    await expect(f.session.execute('echo "before"; let x: number = "wrong"')).rejects.toThrow(
      /Expected number/,
    );
    expect(f.output).toEqual([]);
    await expect(f.session.execute('contains [1, 2] "x"')).rejects.toThrow(/Expected number/);
  });
  it('supports mutation, loops, branches, short circuit, and structural values', async () => {
    const f = fixture();
    await f.session.execute(
      'mut total = 0; for n in [1, 2, 3] { if $n == 2 { continue }; $total = $total + $n }; while $total < 6 { $total = $total + 1 }; echo $total; echo (false and (read "missing") == "x"); echo ({a: [1]} == {a: [1]})',
    );
    expect(f.output).toEqual([6, false, true]);
    await expect(f.session.execute('let immutable = 1; $immutable = 2')).rejects.toThrow(
      /immutable/,
    );
    await expect(f.session.execute('break')).rejects.toThrow(/requires a loop/);
  });
  it('supports typed recursion and forward definitions without closures', async () => {
    const f = fixture();
    await f.session.execute(
      'echo (factorial 5); def factorial [n: number] -> number { if $n == 0 { return 1 }; return ($n * (factorial ($n - 1))) }',
    );
    expect(f.output).toEqual([120]);
    await expect(
      f.session.execute('def wrong [] -> number { if true { return 1 } }'),
    ).rejects.toThrow(/every path/);
    await expect(
      f.session.execute('let x = 1; def closure [] -> number { return $x }'),
    ).rejects.toThrow(/Unknown variable/);
  });
  it('retains interactive bindings, permits replacement, and isolates script scopes', async () => {
    const f = fixture();
    await f.session.execute('let x = 1');
    await f.session.execute('let x = "new"');
    await f.session.execute('echo $x');
    expect(f.output).toEqual(['new']);
    await expect(
      new LanguageSession(f.session.host).execute('echo $x', { mode: 'script' }),
    ).rejects.toThrow(/Unknown variable/);
    await f.session.execute('if true { let temporary = 1 }');
    await expect(f.session.execute('echo $temporary')).rejects.toThrow(/Unknown variable/);
  });
  it('loads checked libraries once, resolves aliases, and rejects cycles/escape paths', async () => {
    const f = fixture();
    f.files['/home/lib.sc'] =
      'type Pair = {name: string}; def make [] -> Pair { return {name: "ok"} }';
    await f.session.execute('use "/home/lib.sc"; use "/home/lib.sc"; let p = (make); echo $p.name');
    expect(f.output).toEqual(['ok']);
    f.files['/home/cycle.sc'] = 'use "./cycle.sc"';
    await expect(f.session.execute('use "/home/cycle.sc"')).rejects.toThrow(/Circular import/);
    await expect(f.session.execute('use "/elsewhere.sc"')).rejects.toThrow(/under \/home/);
  });
  it('has bounded execution and can recover from errors', async () => {
    const f = fixture();
    await expect(f.session.execute('while true {}', { steps: 20 })).rejects.toThrow(
      /Execution limit/,
    );
    await expect(f.session.execute('echo (1 / 0)')).rejects.toThrow(/zero/);
    await expect(f.session.execute('echo [1][2]')).rejects.toThrow(/out of range/);
    await f.session.execute('echo "recovered"');
    expect(f.output).toEqual(['recovered']);
  });
  it('reports source positions and rejects JavaScript/unsupported operators', () => {
    expect(() => parse('export function main() {}', '/home/old.js')).toThrow(/\/home\/old.js:1:/);
    expect(() => parse('echo hello | echo')).toThrow();
    expect(isIncomplete('for file in [] {')).toBe(true);
    expect(isIncomplete('cat "unclosed')).toBe(true);
    expect(isIncomplete('echo "done"')).toBe(false);
  });
  it('keeps record keys safe and validates JSON structurally', async () => {
    const f = fixture();
    await f.session.execute(
      'let object = {__proto__: "safe", constructor: "data"}; echo $object.__proto__',
    );
    expect(f.output).toEqual(['safe']);
    expect(
      validateValue(JSON.parse('{"__proto__":"safe"}'), {
        kind: 'record',
        fields: { ['__proto__']: string },
      }),
    ).toHaveProperty('__proto__', 'safe');
  });
});
describe('bounded regular expressions', () => {
  it('matches greedy repetition, alternatives, classes, anchors, and empty matches', () => {
    expect(matchText('[0-9]+', 'r42 b17')).toEqual(['42', '17']);
    expect(matchText('^(ab|cd){1,2}$', 'abcd')).toEqual(['abcd']);
    expect(matchText('a*', 'bb')).toEqual(['', '', '']);
    expect(matchText('[^=]+', 'x=y')).toEqual(['x', 'y']);
    expect(matchText('\\d+', '42')).toEqual(['42']);
  });
  it('rejects unsupported syntax and bounds pathological searches', () => {
    expect(() => matchText('(?=a)', 'a')).toThrow();
    expect(matchText('a+?', 'aaa')).toEqual(['a', 'a', 'a']);
    expect(matchText('(a|aa)+b', 'a'.repeat(4000))).toEqual([]);
    expect(() => matchText('a'.repeat(257), 'a')).toThrow(/256/);
  });
});
