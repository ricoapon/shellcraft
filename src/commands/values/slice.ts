import type { Command } from '../command';
import { number, string } from '../../runtime/types';
export const slice: Command = {
  name: 'slice',
  usage: 'slice <start> <end> <text>',
  description: 'Extract a substring.',
  details: 'Unicode code-point indices, start inclusive and end exclusive.',
  signatures: [{ parameters: [number, number, string], result: string }],
  execute: ([start, end, text]) => {
    const chars = Array.from(text as string);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      (start as number) < 0 ||
      (end as number) < (start as number) ||
      (end as number) > chars.length
    )
      throw new Error('Substring bounds out of range.');
    return { value: chars.slice(start as number, end as number).join('') };
  },
};
