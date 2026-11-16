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
  changing a command. Preserve player-owned files. Terminal history is ephemeral
  and must never be stored or restored from saves.
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
- Keep the command set small. Focus on files and networking; do not restore
  retired simulations, screens, controllers, or their capability shop.
- `exit` disconnects within a level. `mission leave` returns to the personal
  workspace. Home is not a vertex in any level network.
- Levels build on the same tools within a branch. One star means solved by any
  method; two means a script solves fresh cases without intervention. Automation
  stars and hints must never block ordinary progression.
- Install starter skeletons and small API examples, never full solution scripts.
  Complete solvers belong only in test fixtures.

## Shared language and testing

- Game commands and native value operations share the Command interface, typed signatures, help, and registry. Put pure value operations under src/commands/values, generally one named operation per file. Do not introduce another function dispatcher.
- Use Chevrotain for language syntax and RE2JS for player-provided regex patterns. Do not add a parallel shell parser or custom regex engine.
- Prefer the browser-free driver for language, command, mission, and save checks: npm --silent run game -- --json -c "mission start files-1" -c "ls /notes".
- Use --jsonl to keep a test session open. Requests support command, script, analyze, inspect, snapshot, and reset; responses include errors, rendered output, raw values, and the current view. See docs/testing.md.
- The driver uses isolated in-memory state. Only --state writes an explicit test save; never point it at player-owned data. Use a browser for keyboard, focus, completion interaction, and layout checks.
- Preserve the ability for one program to cross mission boundaries without losing execution state. Verification cases remain separate, constrained game environments.
