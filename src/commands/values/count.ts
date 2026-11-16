import type { Command } from '../command';
import { generic, list, number, string } from '../../runtime/types';
import type { Value } from '../../runtime/types';
export const count: Command = {
  name: 'count',
  usage: 'count <text|list>',
  description: 'Count characters or elements.',
  signatures: [
    { parameters: [string], result: number },
    { parameters: [list(generic)], result: number },
  ],
  execute: ([value]) => ({
    value: typeof value === 'string' ? Array.from(value).length : (value as Value[]).length,
  }),
};
