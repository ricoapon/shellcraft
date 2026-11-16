import { CommandRegistry } from '../commands/registry';
import type { Command, CommandInfo, CommandResult } from '../commands/command';
import type { CommandSystem } from '../commands/system';
import { LanguageSession } from '../runtime/interpreter';
import { formatValue } from '../runtime/format';
import type { TypeNode } from '../runtime/ast';
import type { Value } from '../runtime/types';
export interface TranscriptEntry {
  readonly host?: string;
  readonly input: string;
  readonly output: readonly string[];
  readonly workingDirectory?: string;
}
export interface ShellState {
  readonly entries: readonly TranscriptEntry[];
}
export const MAX_ENTRIES = 200,
  MAX_INPUT_LENGTH = 250_000,
  MAX_OUTPUT_LENGTH = 80_000;
function typeLabel(t: TypeNode): string {
  return t.element
    ? 'list<' + typeLabel(t.element) + '>'
    : t.fields
      ? '{' +
        Object.entries(t.fields)
          .map(([k, v]) => k + ': ' + typeLabel(v))
          .join(', ') +
        '}'
      : t.name;
}
/** A REPL and script runner over one language, registry, host interface, and renderer. */
export class Shell {
  readonly language: LanguageSession;
  private readonly registry: CommandRegistry;
  private lines: string[] = [];
  private length = 0;
  private effects: CommandResult = {};
  constructor(
    commands: readonly Command[],
    system: CommandSystem,
    read: (path: string) => string = () => {
      throw new Error('Source loading is unavailable.');
    },
  ) {
    this.registry = new CommandRegistry(commands, {
      ...system,
      display: (value) => this.display(value),
      commands: { list: () => this.available() },
    });
    const host = {
      commands: () => this.registry.definitions(),
      read,
      display: (value: Value) => this.display(value),
      invoke: async (name: string, args: Value[], type?: import('../runtime/types').Type) => {
        const result = await this.registry.execute(name, args, type);
        if (result.clearScreen) this.effects.clearScreen = true;
        if (result.action) this.effects.action = result.action;
        for (const line of result.output ?? []) this.print(line);
        return result.value;
      },
    };
    this.language = new LanguageSession(host);
  }
  available(): readonly CommandInfo[] {
    return [
      ...this.registry.available(),
      ...[...this.language.declarations.functions.values()].map((fn) => ({
        name: fn.name,
        description: 'Player-defined command.',
        usage:
          fn.name +
          ' [' +
          fn.parameters.map((p) => p.name + ': ' + typeLabel(p.type)).join(', ') +
          '] -> ' +
          typeLabel(fn.result),
      })),
    ];
  }
  private print(text: string) {
    if (this.lines.length >= 500 || this.length + text.length > MAX_OUTPUT_LENGTH)
      throw new Error('Output limit reached. Print a summary.');
    this.lines.push(text);
    this.length += text.length;
  }
  private display(value: Value) {
    this.print(formatValue(value));
  }
  async submit(input: string): Promise<CommandResult> {
    this.lines = [];
    this.length = 0;
    this.effects = {};
    try {
      if (input.length > MAX_INPUT_LENGTH) throw new Error('Input exceeds 250 KB.');
      await this.language.execute(input);
    } catch (error) {
      this.effects.error = error instanceof Error ? error.message : String(error);
      this.lines.push(this.effects.error);
    }
    return { ...this.effects, output: this.lines };
  }
  async run(path: string, args: string[] = []): Promise<void> {
    if (!path.endsWith('.sc'))
      throw new Error(
        'Run a .sc Shellcraft source file. Existing JavaScript files are preserved but cannot execute.',
      );
    const child = new LanguageSession(this.language.host);
    await child.execute(this.language.host.read(path), { source: path, mode: 'script', args });
  }
  async execute(state: ShellState, input: string, workingDirectory?: string): Promise<ShellState> {
    if (!input.trim()) return state;
    const result = await this.submit(input);
    return {
      entries: result.clearScreen
        ? []
        : [
            ...state.entries,
            {
              input,
              output: result.output?.length ? [result.output.join('\n')] : [],
              ...(workingDirectory === undefined ? {} : { workingDirectory }),
            },
          ].slice(-MAX_ENTRIES),
    };
  }
}
