import type { Command } from '../command';
import { generic, string, validateValue } from '../../runtime/types';
export const fromJson: Command = {
  name: 'from-json',
  usage: 'from-json<Type> <text>',
  description: 'Parse typed JSON.',
  signatures: [{ parameters: [string], result: generic, typeParameter: true }],
  execute: ([text], _system, type) => ({ value: validateValue(JSON.parse(text as string), type!) }),
};
