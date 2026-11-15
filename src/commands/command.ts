import type { CommandSystem } from './system';

export type CommandResult =
  | readonly string[]
  | {
      output?: readonly string[];
      clearScreen?: true;
      action?: 'export' | 'import';
    };

export interface CommandInfo {
  readonly name: string;
  readonly description?: string;
  readonly details?: string;
  readonly usage?: string;
  readonly example?: string;
}

/** A command translates terminal arguments into operations on a system API. */
export interface Command extends CommandInfo {
  unlocked?(system: CommandSystem): boolean;
  execute(args: readonly string[], system: CommandSystem): CommandResult | Promise<CommandResult>;
}

export function requireArguments(
  args: readonly string[],
  min: number,
  usage: string,
  max = min,
): void {
  if (args.length < min || args.length > max) throw new Error('Usage: ' + usage);
}
