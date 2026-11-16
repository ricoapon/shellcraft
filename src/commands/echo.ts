import type { Command } from './command';
import { generic, nothing } from '../runtime/types';
export const echo: Command = {
  name: 'echo',
  usage: 'echo <value>',
  description: 'Display a value.',
  signatures: [{ parameters: [generic], result: nothing }],
  execute(args, system) {
    system.display(args[0]);
    return {};
  },
};
