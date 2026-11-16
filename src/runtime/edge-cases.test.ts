import { expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
it('retains a replaced binding type when replacement fails at runtime', async () => {
  const g = new GameEngine();
  await g.execute('let value = 1');
  const bad = await g.execute(
    'def fail [] -> string { echo (1 / 0); return "bad" }; let value = (fail)',
  );
  expect(bad.output.join()).toContain('zero');
  expect((await g.execute('echo ($value + 1)')).output).toEqual(['2']);
});
it('infers generic list types from subsequent arguments', async () => {
  const g = new GameEngine();
  expect((await g.execute('contains [] "x"')).output).toEqual(['false']);
  expect((await g.execute('let values = (append [] "x"); echo $values')).output).toEqual(['x']);
});
it('allows keyword field names and orders strings by Unicode code points', async () => {
  const g = new GameEngine();
  expect(
    (
      await g.execute(
        'type Item = {type: string}; let value: Item = {type: "file"}; echo $value.type',
      )
    ).output,
  ).toEqual(['file']);
  expect((await g.execute('echo ("😀" > "")')).output).toEqual(['true']);
});
it('rejects incomplete reserved subcommands before execution', async () => {
  const g = new GameEngine();
  const result = await g.execute('write /home/no-effect test; mission submit --script');
  expect(result.output.join()).toContain('Usage: mission');
  expect(() => g.world.home.filesystem.readFile('/home/no-effect')).toThrow();
});
