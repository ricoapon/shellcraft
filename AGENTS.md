# Command design

- Give each game concept one singular command, with subcommands for its actions.
  For example: `mission list`, `mission start <id>`, `mission hint`,
  `upgrade list`, and `upgrade buy <id>`.
- Do not split a concept across singular/plural commands or separate action
  commands such as `missions`, `upgrades`, or `unlock`. Do not retain aliases
  for these unless the user explicitly requests them.
- Keep command parsing and help consistent. Validate subcommands and their
  arguments, and show the concept's usage when input is invalid.
- Update built-in help, onboarding, guides, examples, and tests together when
  changing a command. Preserve player-owned files and historical transcripts.
- Established shell commands such as `ls`, `cd`, `cat`, `ssh`, and `exit` keep
  their familiar names; this convention concerns related game concept actions.

## Command implementation

- Use the Command pattern consistently. Implement commands under `src/commands/`,
  generally one per file; related filesystem commands may share a file.
- Commands own their name, usage, short description, optional detailed help and
  examples, unlock predicate, and `execute(args, system)` implementation.
- `CommandSystem` is the boundary to backend operations. Commands must not import
  `GameEngine`, manipulate its state, or dispatch to another command by name as a
  substitute for calling an API. Keep backend validation in backend methods.
- Use `CommandSystem` directly. Avoid generic context types when all commands use
  this one interface.
- Register commands in the shared registry. Do not add a command switch or a
  separate help metadata table to the engine or content directory.
- Keep `description` brief for the overview. Put flags, caveats, shortcuts, and
  examples in `details`, `usage`, and `example`, shown by `help <command>`.
- `help` lists only currently unlocked commands and ends with a hint explaining
  `help <command>`. Detailed help also hides locked commands. Use the command's
  unlock predicate for both help visibility and execution availability.
- Keep the command set small. Do not add convenience wrappers for existing
  operations: home files use `exit` and `ls`, and worker recovery uses page reload.
  Keep playback controls under `simulation`, rather than separate command names.
