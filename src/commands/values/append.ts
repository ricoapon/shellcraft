import type { Command } from '../command';
import { generic, list } from '../../runtime/types';
import type { Value } from '../../runtime/types';
export const append: Command = {
  name: 'append',
  usage: 'append <list> <value>',
  description: 'Return an extended list.',
  signatures: [{ parameters: [list(generic), generic], result: list(generic) }],
  execute: ([values, value]) => {
    if ((values as Value[]).length >= 10_000) throw new Error('List size limit exceeded.');
    return { value: [...(values as Value[]), value] };
  },
};
