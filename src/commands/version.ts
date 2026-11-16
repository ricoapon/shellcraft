import type { Command } from './command';
import { string } from '../runtime/types';
import { buildVersion } from '../version';

export const version: Command = {
  name: 'version',
  usage: 'version',
  description: 'Show the loaded game build.',
  details:
    'Published versions identify the workflow run, attempt, and commit. Local builds show development. This identifies the code loaded in this tab, independently of your save.',
  signatures: [{ parameters: [], result: string }],
  execute: () => ({ value: buildVersion }),
};
