import { expect, it } from 'vitest';
import { GameEngine } from './engine';
it('keeps script variables and functions alive across mission transitions', async () => {
  const g = new GameEngine();
  g.world.home.filesystem.writeFile(
    '/home/campaign.sc',
    '\ndef solve-first [] -> void {\n mission start files-1\n let value = (split "=" (trim (cat /notes/access.txt)))\n mission submit $value[1]\n mission leave\n}\nlet marker = "still running"\nsolve-first\nmission start files-2\necho $marker\nhostname\n',
  );
  const result = await g.execute('run /home/campaign.sc');
  expect(result.output.join()).not.toMatch(/Expected|Unknown|limit|error/i);
  expect(result.output.join()).toContain('still running');
  expect(g.campaign.progress.completed).toContain('files-1');
  expect(g.campaign.active.id).toBe('files-2');
  expect(g.world.host.id).toBe('archive');
});
it('runs pasted blocks and files with the same data and display semantics', async () => {
  const a = new GameEngine(),
    b = new GameEngine(),
    program = 'let files = (ls /home); echo (count $files); contains "hello" "ell"';
  a.world.home.filesystem.writeFile('/home/program.sc', program);
  b.world.home.filesystem.writeFile('/home/program.sc', program);
  expect((await a.execute(program)).output).toEqual(
    (await b.execute('run /home/program.sc')).output,
  );
  expect((await b.execute('echo $files')).output.join()).toContain('Unknown variable');
});
it('preserves navigation after ordinary script completion and runtime failures', async () => {
  const g = new GameEngine();
  g.world.home.filesystem.writeFile('/home/move.sc', 'cd /; echo (1 / 0)');
  expect((await g.execute('run /home/move.sc')).output.join()).toContain('zero');
  expect(g.world.session.workingDirectory).toBe('/');
});
it('does not let scripts invoke UI or recursive verification operations', async () => {
  const g = new GameEngine();
  g.world.home.filesystem.writeFile(
    '/home/bad.sc',
    'write /home/side-effect "nope"; edit /home/source.sc',
  );
  const result = await g.execute('run /home/bad.sc');
  expect(result.output.join()).toContain('interactive-only');
  expect(() => g.world.home.filesystem.readFile('/home/side-effect')).toThrow();
});
it('exposes regex and string commands directly with static overload checking', async () => {
  const g = new GameEngine();
  expect((await g.execute('match "[0-9]+" "r42 b17"')).output).toEqual(['42\n17']);
  expect((await g.execute('contains [1, 2] 2')).output).toEqual(['true']);
  expect((await g.execute('contains [1, 2] "2"')).output.join()).toContain('Expected number');
  expect((await g.execute('slice 1 2 "a😀b"')).output).toEqual(['😀']);
  expect((await g.execute('count "a😀b"')).output).toEqual(['3']);
});
it('requires double-quoted text and rejects missing variable sigils before any effects', async () => {
  const g = new GameEngine();
  await g.execute('let content = "active=true\\nPASSWORD=secret"');
  for (const source of ['contains content PASSWORD', 'contains $content PASSWORD', 'echo hello']) {
    const result = await g.execute('write /home/no-effect "x"; ' + source);
    expect(result.error).toContain('Unquoted string');
    expect(() => g.world.home.filesystem.readFile('/home/no-effect')).toThrow();
  }
  expect((await g.execute('contains $content "PASSWORD"')).output).toEqual(['true']);
  expect((await g.execute("echo 'text'")).error).toContain('Use double quotes');
  expect((await g.execute('echo "it\'s fine"')).output).toEqual(["it's fine"]);
  expect((await g.execute('echo "say \\\"hello\\\""')).output).toEqual(['say "hello"']);
  g.world.home.filesystem.writeFile('/home/bad-quotes.sc', 'echo unquoted');
  expect((await g.execute('run /home/bad-quotes.sc')).error).toContain('Unquoted string');
});
it('keeps declared shell path and identifier shorthand in the terminal and scripts', async () => {
  const g = new GameEngine();
  expect((await g.execute('cat /home/README.md')).error).toBeUndefined();
  expect((await g.execute('help cat')).error).toBeUndefined();
  expect((await g.execute('guide scripts')).error).toBeUndefined();
  expect((await g.execute('mission start files-1')).error).toBeUndefined();
  expect((await g.execute('cat /notes/access.txt')).error).toBeUndefined();
  g.world.home.filesystem.writeFile(
    '/home/read.sc',
    'echo (contains (cat /notes/access.txt) "password=")',
  );
  expect((await g.execute('run /home/read.sc')).output).toEqual(['true']);
});
