# Shellcraft

A terminal programming puzzle game about investigating files and networks and
building your own reusable tools.

## Run

Use Node.js 24 LTS or newer.

```sh
npm ci
npm run dev
```

Begin with `mission start files-1`. `mission` lists available levels and stars;
`guide start` explains navigation. Six file levels develop search, traversal,
filtering, and references. After files-2, a four-level networking branch opens,
so you can continue files or explore another concept.

Each level can be solved manually, with scripts, or a combination:

- One star: solve the objective by any method.
- Two stars: `mission submit --script /home/solve.js` verifies your program on
  five fresh instances without intervention. Extra stars never gate progression.

Hints are staged and free. Complete solvers are not installed in your workspace.
Scripting is available immediately; the levels introduce its uses gradually.

## Workspace and levels

Starting a level clears the terminal, connects to its entry host, and changes the
window title and accent to purple. `mission leave` clears it again and returns to
the green personal workspace. `exit` moves back within a level's connections.
Home is outside level networks.

Your personal code notebook travels with you. `edit`, `vim`, `run`, and imports
always use `/home` source files. Terminal file commands and `ctx.fs` inspect the
current machine. Use `guide scripts`, `guide network`, or `guide automation` for
small examples and the verification rules.

The editor replaces the terminal. `edit` uses Ctrl+S to save/exit, Ctrl+Q to
discard/exit, and Ctrl+Enter to save/exit/run. `vim` uses :w, :q, :q!, :wq/:x and
custom :run. New files are drafts until explicitly saved.

## Persistence

IndexedDB saves files, stars, personal script data, the active level, and editor
drafts. Terminal output and command history are never persisted. Reload starts
with a fresh introduction to the current context. `save export` and `save import`
provide JSON backups (version 4). Version 3 saves retain player files and personal
data while replacing the retired campaign progression. Legacy starter files are
preserved; new workspaces receive a blank solve.js. Use one tab per origin.

## Structure

- `src/core/`: virtual filesystem, navigation, parser, and ephemeral shell.
- `src/commands/`: commands, registry, help metadata, and typed backend boundary.
- `src/content/`: level rules, seeded instances, guide, and starter skeleton.
- `src/game/`: progression, isolated verification, world, worker, and saves.
- `src/runtime/`: bounded QuickJS execution of player modules.
- `src/ui/`: xterm, Monaco, and optional Vim editing.
- `tests/fixtures/`: complete solvers used only by automated tests.
- `docs/`: implementation notes, playtest checklist, and original design archive.

Node.js runs development tools; there is no application server. All networks and
files are simulated. Player scripts have no browser, Node, real network, timers,
or npm access. See `guide api` for execution limits.

## Development checks

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`npm run make:showcase` generates `examples/showcase-save.json`, an optional
checkpoint with the network branch available and no pre-written solvers. It does
not change browser storage. Export your current save before importing a sample.
