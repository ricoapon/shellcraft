# Implementation and verification

The original specification is preserved in [game-design.md](game-design.md).
The application runs locally in the browser; there is no application backend.
The default interface is a framed xterm terminal with a title bar containing
only **Shellcraft**. The editor and player-created screens appear when requested.
See [the UI instructions](../src/ui/AGENTS.md) before changing that interface.

## Playing

Start with `mission list`, then `mission start deployment`, `mission briefing`, and `ssh deploy`.
Read the files and use `mission submit <answer>`. `mission hint` provides free guidance.
`upgrade list` describes permanent capabilities; `upgrade buy <capability>` purchases one.
`guide` lists the in-game documentation, including JavaScript APIs and examples.

Player support stays in the terminal: a one-time welcome (including a migration
message for existing profiles), named guide topics, free mission hints, explicit
answer/action instructions, and next-assignment/upgrade suggestions. Playback
prints completion, failure, and disabled-controller notices without logging every
tick or discarding a partially typed command. The
[player guidance review](player-guidance-review.md) covers likely sticking points
across all fifteen assignments and the remaining fresh-player playtest.

The campaign provides thirteen core missions and two bonus thermal challenges.
Missions progress from inspecting files through recursive searching, reconciling
records, network discovery, graph changes, dependency repair, scheduling,
tracking a moving process, and coordinated updates. Completed missions can be
reset for tool testing; rewards are granted once. Mission resets preserve home
files, player data, screen/controller configuration, and observation archives.

Examples under `/home` are editable source files. They include search functions,
a network crawler, a startup module, data screens, and controllers. They are
seeded once when a workstation is created or migrated, preserving existing player
files. Deleted examples remain deleted after reload. Commands remain
usable while scripts and screens are being developed. Scripts cost no tokens
to execute after their capabilities have been unlocked.

## Design mapping

Commands implement the Command pattern under `src/commands/`. Each definition owns
its execution, usage, short description, detailed help, examples, and availability
predicate. `CommandSystem` exposes typed backend operations; commands receive no
engine instance or mutable world state. The engine supplies the API implementations.
The shared registry handles built-in and player commands, including registration,
unloading, availability, and help lookup. Both shell entry points await commands.

The help overview contains short descriptions and a final hint about `help <command>`.
Detailed help contains flags, caveats, and examples. Locked commands are omitted
from both help forms, and the same availability predicate guards execution.

The command audit removed the redundant `files` and `runtime` commands: `exit`/`ls`
and reloading the page cover those operations. Playback controls share the
`simulation` command. Remaining commands provide standard filesystem/navigation,
programming tools, backup, or mission-specific actions. Mission-specific tools are
offered only in relevant mission types; capability-dependent tools appear after
their upgrades are purchased.

| Design area                                                | Implementation                                                            | Verification                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Home, hosts, sessions, navigation                          | `src/core/`, `src/game/world.ts`                                          | Session/world tests; independent connection directories and explicit scripted handles                                          |
| Shell, options, history, prompt, filesystem                | `src/commands/`, `src/ui/Terminal.tsx`                                    | Parser/filesystem tests; source inspection of xterm/readline integration                                                       |
| JavaScript modules and imports                             | `src/runtime/player-runtime.ts`                                           | Real QuickJS tests for imports, closures, execution limits, and unavailable platform globals                                   |
| Editor, source navigation, optional Vim                    | `src/ui/editor/Editor.tsx`, terminal source links                         | Embedded-browser editing, save/run, Vim activation, controlled error, and source-link navigation; engine source-location tests |
| Custom commands and startup reloads                        | `src/game/engine.ts`                                                      | Engine/runtime tests and save/reload during campaign playthrough                                                               |
| Structured API and capability boundaries                   | Engine API bridge and campaign action validation                          | Tests for structured files, independent handles, locked capabilities, read-only renders, controller restrictions               |
| Text, tables, bars, lines, Mermaid, networks, interactions | `src/ui/Screens.tsx` and declarative QuickJS view helpers                 | Embedded-browser tables/sorting, live charts, Mermaid labels, graph node callbacks; runtime/engine callback ownership tests    |
| Layout and screen lifecycle                                | Saved panels, terminal layout/focus/refresh commands, worker view updates | Engine/worker tests; configurable refresh between ticks; render failures isolated per panel                                    |
| Tick lifecycle and controllers                             | `src/game/campaign.ts`, engine controller dispatch                        | Tests for external events before shared snapshots, action order/conflicts, bandwidth, heat, deadlines, and coordinated commits |
| Playback and worker isolation                              | `src/game/worker.ts`, `src/game/client.ts`                                | Worker protocol tests with real QuickJS and simulated IndexedDB; timeout/restart implementation inspection                     |
| Saves, migration, imports, progression                     | `src/game/save.ts`, campaign progress                                     | Save validation/migration tests; worker round trips; full campaign restored between every mission                              |
| Mission content                                            | `src/content/missions.ts`                                                 | Complete fifteen-mission automated playthrough using earned tokens and actual scripts/screens/controllers                      |
| Terminal-only application interface                        | `src/ui/App.tsx`, `src/ui/AGENTS.md`                                      | Static-render guard excludes application navigation, buttons, token/status bars, and mission board                             |

The automated playthrough uses the public engine command path, earns and spends
tokens, runs the supplied player tools in QuickJS, checks objectives, validates
each snapshot, and reloads between missions. It complements focused tests for
invalid inputs and simulation edge cases. It does not substitute for checking
browser keyboard behavior, editor bindings, and graph/chart interactions.

## Runtime and persistence boundaries

- QuickJS runs in a dedicated worker with a 32 MB heap, 512 KB stack, 250 ms
  per-call budget, and 10,000 API-call limit. The bridge exchanges JSON data.
- Player code accesses simulated game files and actions. Browser globals, Node
  APIs, real network access, timers, and asynchronous entry points are absent.
- Rendering reads collected observations; commands and event handlers perform
  inspection and actions. Controllers return validated actions, with explicit
  persistent memory in player storage. Each controller sees the same tick state.
- Output, files, storage, screen trees, observations, histories, and imports have
  size limits. A failing controller is disabled; a failing screen reports its own
  source error. Reloading the page restarts the worker.
- IndexedDB autosaves commands, ticks, editor saves, and debounced drafts. Save
  version 3 includes remote files and active mission state as well as home files.
  Older workstation saves migrate without replacing player code.
- Import validates a replacement before changing the active game. Playback loads
  paused. Startup registrations are rebuilt from source; transcript commands are
  never replayed as actions. `save export` creates a local JSON backup.

## Review and known limits

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run format:check`.
The last completed full test run passed 113 tests across seventeen files, including
the fifteen-mission playthrough, before the final command audit. TypeScript and
formatting checks pass for the final changes. A fresh test run and production build
remain for review: the user requested no permission prompts, and the sandbox blocks
the esbuild subprocess. The elevated test request already in flight was rejected
automatically under that instruction. During this review, Git writes were also
sandbox-blocked, so the command refactor was left uncommitted. Production dependency audit previously found
zero known vulnerabilities on 2026-11-15.

The embedded browser was available without new approval. The final command review
checked the short help overview and closing hint, detailed `help rm`, player-command
reload and help, and `simulation step 2` advancing a reset thermal mission to tick 2.

Embedded-browser verification used a separate localhost origin to preserve the
player's existing save. Checks covered a fresh boot and deployment mission,
colored prompts, importing the showcase, Monaco editing/save/run, optional Vim
activation, a controlled script error and clickable source location, graph
selection invoking player code, sortable tables, Mermaid text labels, live
temperature/history updates, pause/step, controller completion of thermal work,
reload, and JSON export. The thermal objective completed at tick 33. These checks
found and fixed development WASM prebundling, xterm initialization, diagram label,
and editor error-isolation issues. Additional browser/device combinations,
mobile layout, and extended Vim editing remain manual review items.

The guidance update was checked in the embedded browser with the returning-player
welcome, named troubleshooting topic, mission-specific instructions, live moving
process completion and next-assignment notice. A partially typed `mission br`
survived that live notice. The new guidance regression tests have been added but
not run under the subprocess restriction described above. The fifteen-mission
guidance review is a source audit, not a claim of a fresh full browser playthrough.
Clearing the terminal and reloading also kept the one-time welcome cleared.

The editor now occupies the terminal's full workspace and hides custom screens
until exit. In normal editing, Ctrl+S saves/exits, Ctrl+Q discards/exits, and
Ctrl+Enter saves/exits/runs. Vim uses :w, :q, :q!, :wq, :x, and lowercase :run;
the normal editor's Ctrl shortcuts are not registered in Vim mode. A recovered
draft retains the on-disk baseline so :q can detect unsaved changes after reload.
Opening a new file creates only a draft until explicit save. Browser checks cover
the full-width layout, JavaScript token colors, normal discard/run shortcuts,
Vim unsaved-change protection, :w, :q, :q!, and :run.

Command/path completion is explicitly deferred at the user's request. The shell
parses quotes and escapes but does not implement pipes, redirection, or a complete
Bash option set. `ls` recognizes options and reports unsupported ones explicitly.
The chart API is deliberately small; line charts are single-series and network
graphs use a circle layout. Screens refresh after game operations and simulation
ticks, and at a configured playback interval (`screen refresh <milliseconds>`).
Multiple browser tabs do not coordinate their saves. Large editor
and diagram dependencies are lazy-loaded but still produce chunk-size notices
during production builds.

`npm run make:showcase` generates an independent populated save for review. It
does not modify browser storage. Importing it in the game replaces the current
save, so export an existing workstation first.
