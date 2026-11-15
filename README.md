# Shellcraft

A local programming puzzle game. Build a personal terminal workstation while
investigating simulated computers, earning tokens, and unlocking JavaScript tools.

## Run

Use Node.js 24 LTS or newer and npm.

```sh
npm ci
npm run dev
```

Open Vite's local URL. Start with `mission list`, then `mission start deployment`.
The in-game `guide` command explains the controls, programming APIs, and recovery options.
Use `guide start` for the basics and `guide stuck` when you need direction.
The campaign has thirteen core missions plus two scheduling challenges.

```sh
npm test
npm run typecheck
npm run build
```

The production build is written to `dist/` and can be hosted as static files.
Use `npm run preview` to serve that build locally.
Monaco, Vim bindings, diagrams, and network rendering load when needed.
The editor replaces the terminal. Use `edit <path>` for Ctrl+S (save/exit),
Ctrl+Q (discard/exit), and Ctrl+Enter (save/exit/run). Use `vim <path>` for Vim
commands: `:w`, `:q`, `:q!`, `:wq`/`:x`, and `:run`.

## Structure

- `src/core/`: filesystem, path, session, and shell primitives.
- `src/commands/`: command definitions, registry, help, and the typed system API boundary.
- `src/game/`: host/network model, campaign rules, orchestration, worker protocol, and saves.
- `src/runtime/`: isolated QuickJS player modules and their game API bridge.
- `src/content/`: mission fixtures, capability progression, editable examples, and operator guide.
- `src/ui/`: xterm workstation, Monaco editor, and declarative screen renderers.
- `src/persistence/`: legacy save reader used when migrating existing workstations.
- `docs/`: original design specification and implementation/verification notes.

The [player guidance review](docs/player-guidance-review.md) records likely sticking
points across the fifteen assignments and areas for a fresh playtest.

Node.js runs development tools; there is no application server. Every host, file,
network connection, and simulation action belongs to the game. Player code has no
access to the real filesystem, network, browser globals, or Node APIs.

## Programming model

Player source files are JavaScript modules under `/home`. Scripts export
`main(ctx, args)`; startup modules export `setup(ctx)`; screens export
`render(view, observations)`; controllers export `control(state)`.

Imports resolve through the home filesystem. The editor and script files remain
available during remote connections. Capabilities are unlocked permanently using
mission rewards, and script execution does not consume tokens.

QuickJS runs inside a Web Worker with per-call execution, memory, stack, API-call,
and output limits. UI event handlers stay inside that interpreter; screen output
is declarative data. Render functions are read-only. Mission rules validate all
returned controller actions in saved order against the same tick snapshot.

## Saves and recovery

The game saves locally in IndexedDB after commands, editor saves, and simulation
ticks. Editor drafts are also saved. Backups can be exported/imported from the
terminal using `save export` and `save import`. Reloading the page recovers the last saved state.

Payload version 3 includes remote hosts, connection stacks, progression, player
code/data, observations, simulation state, panels, controllers, and editor settings.
Earlier saves migrate without overwriting existing home files. Loading and imports
validate state before use. Playback resumes paused, and startup registrations are
rebuilt from source without re-executing the terminal transcript.

Use one game tab per origin: simultaneous tabs are not synchronized. Browser data
can be cleared or evicted, so export important workstations. Export/import is local
and does not upload files to a service.

## Scope

Command and path completion are deferred at the user's request. The parser supports whitespace,
quotes, and escapes, without pipes, redirection, or OS shell execution. The game
has optional Vim bindings; it does not emulate a complete operating system.

See [implementation notes](docs/implementation.md) for the design mapping,
verification evidence, and remaining limitations.

For a populated workstation to explore, run `npm run make:showcase`, then use
`save import` in the terminal and select `examples/showcase-save.json`. This is a
separate sample save with capabilities unlocked, a thermal mission, screens, and
a controller; importing it replaces the current save, so export your own first.
