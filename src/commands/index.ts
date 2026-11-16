import { guide } from './guide';
import { save } from './save';
import { ssh } from './ssh';
import { exit } from './exit';
import { neighbors } from './neighbors';
import { edit } from './edit';
import { vim } from './vim';
import { run } from './run';
import { mission } from './mission';
import { echo } from './echo';
import { clear } from './clear';
import { help } from './help';
import { filesystemCommands } from './filesystem';
import type { Command } from './command';
import { valueCommands } from './values';
import { hostname } from './hostname';
export const builtinCommands: readonly Command[] = [
  guide,
  save,
  ssh,
  exit,
  neighbors,
  edit,
  vim,
  run,
  mission,
  echo,
  clear,
  help,
  ...filesystemCommands,
  hostname,
  ...valueCommands,
];
