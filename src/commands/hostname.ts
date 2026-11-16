import type { Command } from './command';
import { string } from '../runtime/types';
export const hostname: Command = {
  name: 'hostname',
  usage: 'hostname',
  description: 'Show the current host ID.',
  signatures: [{ parameters: [], result: string }],
  execute: (_args, system) => ({ value: system.session.host() }),
};
