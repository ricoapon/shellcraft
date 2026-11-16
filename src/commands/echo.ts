import type { Command } from './command';
import { generic } from '../runtime/types';
export const echo: Command = {
  name: 'echo',
  usage: 'echo <value>',
  description: 'Display a value.',
  details:
    'Print the value and return it unchanged. Printing also happens when the result is assigned or passed to another command.',
  autoDisplay: false,
  signatures: [{ parameters: [generic], result: generic }],
  execute(args, system) {
    system.display(args[0]);
    return { value: args[0] };
  },
};
