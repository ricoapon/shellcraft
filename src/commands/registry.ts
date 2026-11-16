import type { Command, CommandInfo, CommandResult } from './command';
import type { CommandSystem } from './system';
import type { Type, Value } from '../runtime/types';

/** The same registry drives execution, help, and reserved command names. */
export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly builtins: ReadonlySet<string>;

  constructor(
    commands: readonly Command[],
    private readonly system: CommandSystem,
  ) {
    this.builtins = new Set(commands.map((command) => command.name));
    for (const command of commands) this.register(command);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  isBuiltin(name: string): boolean {
    return this.builtins.has(name);
  }

  register(command: Command): void {
    if (this.commands.has(command.name)) throw new Error('Duplicate command: ' + command.name);
    this.commands.set(command.name, command);
  }

  unregister(name: string): void {
    if (this.isBuiltin(name)) throw new Error('Cannot remove a built-in command: ' + name);
    this.commands.delete(name);
  }

  available(): readonly CommandInfo[] {
    return [...this.commands.values()]
      .filter((command) => command.unlocked?.(this.system) ?? true)
      .map(({ name, description, details, usage, example }) => ({
        name,
        description,
        details,
        usage,
        example,
      }));
  }

  definitions(): readonly Command[] {
    return [...this.commands.values()];
  }

  execute(
    name: string,
    args: readonly Value[],
    typeArgument?: Type,
  ): CommandResult | Promise<CommandResult> {
    const command = this.commands.get(name);
    if (!command)
      throw new Error('Unknown command: ' + name + '. Run help for available commands.');
    if (command.unlocked && !command.unlocked(this.system)) {
      throw new Error(
        'Command locked or unavailable in this level: ' + name + '. Check help and mission list.',
      );
    }
    return command.execute(args, this.system, typeArgument);
  }
}
