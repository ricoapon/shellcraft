import { parseCommand } from './parse';
import { CommandRegistry } from '../commands/registry';
import type { Command } from '../commands/command';
import type { CommandSystem } from '../commands/system';

export interface TranscriptEntry {
  readonly host?: string;
  readonly input: string;
  readonly output: readonly string[];
  readonly workingDirectory?: string;
}

export interface ShellState {
  readonly entries: readonly TranscriptEntry[];
}

// Bound both in-memory history and the size of local saves.
export const MAX_ENTRIES = 200;
export const MAX_INPUT_LENGTH = 4_000;
export const MAX_OUTPUT_LENGTH = 20_000;

/** Shell execution has no dependencies on React, the browser, or persistence. */
export class Shell {
  private readonly commands: CommandRegistry;

  constructor(commands: readonly Command[], system: CommandSystem) {
    this.commands = new CommandRegistry(commands, system);
  }

  async execute(state: ShellState, input: string, workingDirectory?: string): Promise<ShellState> {
    if (!input.trim()) return state;
    input = input.slice(0, MAX_INPUT_LENGTH);
    let output: readonly string[];
    try {
      const [name, ...args] = parseCommand(input);
      const result = await this.commands.execute(name, args);
      if ('clearScreen' in result && result.clearScreen) return { entries: [] };
      output = Array.isArray(result) ? result : 'output' in result ? (result.output ?? []) : [];
    } catch (error) {
      output = [error instanceof Error ? error.message : 'Command failed.'];
    }

    return {
      entries: [
        ...state.entries,
        {
          input,
          output: output.length ? [output.join('\n').slice(0, MAX_OUTPUT_LENGTH)] : [],
          ...(workingDirectory === undefined ? {} : { workingDirectory }),
        },
      ].slice(-MAX_ENTRIES),
    };
  }
}
