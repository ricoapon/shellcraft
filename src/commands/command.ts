import type { CommandSystem } from './system';
import type { NativeCommand, Type, Value } from '../runtime/types';
import { nothing, string } from '../runtime/types';
export interface CommandResult {
  value?: Value;
  output?: readonly string[];
  clearScreen?: true;
  action?: 'export' | 'import';
}
export interface CommandInfo {
  readonly name: string;
  readonly description?: string;
  readonly details?: string;
  readonly usage?: string;
  readonly example?: string;
}
export interface Command extends CommandInfo, NativeCommand {
  unlocked?(system: CommandSystem): boolean;
  execute(
    args: readonly Value[],
    system: CommandSystem,
    typeArgument?: Type,
  ): CommandResult | Promise<CommandResult>;
}
export const textSignature = (minimum = 0, maximum = minimum, terminalOnly = false) => ({
  parameters: Array.from({ length: maximum }, () => string),
  minimum,
  result: nothing,
  terminalOnly,
});
export function stringArguments(args: readonly Value[]): string[] {
  if (args.some((v) => typeof v !== 'string')) throw new Error('Expected string arguments.');
  return args as string[];
}
export function requireArguments(
  args: readonly unknown[],
  minimum: number,
  usage: string,
  maximum = minimum,
): void {
  if (args.length < minimum || args.length > maximum) throw new Error('Usage: ' + usage);
}
