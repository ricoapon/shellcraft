import { guide } from './guide';
import { save } from './save';
import { ssh } from './ssh';
import { exit } from './exit';
import { neighbors } from './neighbors';
import { inspect } from './inspect';
import { edit } from './edit';
import { vim } from './vim';
import { run } from './run';
import { startup } from './startup';
import { screen } from './screen';
import { controller } from './controller';
import { simulation } from './simulation';
import { link } from './link';
import { reach } from './reach';
import { service } from './service';
import { transfer } from './transfer';
import { trap } from './trap';
import { prepare } from './prepare';
import { queue } from './queue';
import { mission } from './mission';
import { upgrade } from './upgrade';
import { echo } from './echo';
import { clear } from './clear';
import { help } from './help';
import { filesystemCommands } from './filesystem';
import type { Command } from './command';

export const builtinCommands: readonly Command[] = [
  guide,
  save,
  ssh,
  exit,
  neighbors,
  inspect,
  edit,
  vim,
  run,
  startup,
  screen,
  controller,
  simulation,
  link,
  reach,
  service,
  transfer,
  trap,
  prepare,
  queue,
  mission,
  upgrade,
  echo,
  clear,
  help,
  ...filesystemCommands,
];
