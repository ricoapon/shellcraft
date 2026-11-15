import { expect, it } from 'vitest';
import { parseOptions } from './options';

it('separates options and operands without interpreting command-specific flags', () => {
  expect(parseOptions(['folder', '-la', '--long', '-'])).toEqual({
    options: ['-la', '--long'],
    operands: ['folder', '-'],
  });
});

it('stops recognizing options after --', () => {
  expect(parseOptions(['--', '-l', '--'])).toEqual({ options: [], operands: ['-l', '--'] });
});
