import { expect, it } from 'vitest';
import { PlayerModule } from './player-runtime';

it('imports virtual modules and returns structured game API data', async () => {
  const files: Record<string, string> = {
    '/home/main.js':
      'import {double} from "./lib.js"; export function main(ctx,args){ctx.print(double(ctx.fs.list("/").length),args[0]);}',
    '/home/lib.js': 'export const double = n => n*2;',
  };
  const output: unknown[] = [];
  const module = await PlayerModule.create(
    '/home/main.js',
    (path) => files[path],
    (name, args) => {
      if (name === 'fs.list') return [{ name: 'one' }, { name: 'two' }];
      if (name === 'print') output.push(args[0]);
    },
  );
  try {
    module.invoke('main', ['ok']);
    expect(output).toEqual(['4 ok']);
  } finally {
    module.dispose();
  }
});

it('interrupts infinite loops and does not expose browser or Node globals', async () => {
  const module = await PlayerModule.create(
    '/test.js',
    () => 'export function main(){ while(true){} }',
    () => null,
  );
  try {
    expect(module.evaluate('[typeof fetch,typeof window,typeof process]')).toEqual([
      'undefined',
      'undefined',
      'undefined',
    ]);
    expect(() => module.invoke('main')).toThrow(/interrupted/);
    expect(module.evaluate('1+1')).toBe(2);
  } finally {
    module.dispose();
  }
});
