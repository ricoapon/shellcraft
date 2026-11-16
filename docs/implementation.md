# Implementation notes

The current game focuses on six file-investigation levels and four networking
levels. `game-design.md` is the original design archive, not the current feature
list. Simulations, time controls, thermal jobs, controllers, custom screens,
startup command registrations, and the capability shop have been removed.

## Progression

`src/content/missions.ts` defines each level's concept, prerequisite, briefing,
staged hints, and seeded evidence generator. `Campaign` manages discovery,
completion, and best stars. Files-2 opens both files-3 and network-1. Ordinary
completions unlock levels; extra automation stars never gate them. JavaScript
language features and basic scripting are available immediately.

One star means a correct answer by any method. Two stars use a player-submitted
module against five fresh variations. Each case has a separate world, empty
player data, and fresh QuickJS interpreters, while allowing imports from a fixed
snapshot of the player's saved code. Verification starts at the entry host and
leaves the explored world, connection, and personal data unchanged. Failures
report a seed for a reproducible practice case; practice never awards stars.
Complete reusable solvers live only under `tests/fixtures/`.

## World and command boundary

`World.home` is a separate personal workspace; `World.hosts` contains only level
vertices. A level connection stack begins at the entry host, without a hidden
home connection. `exit` cannot escape the level; `mission leave` explicitly ends
it. Terminal filesystem operations inspect the current machine. `edit`, `vim`,
`run`, and imports use the player's code notebook under /home. Level evidence
and script filesystem APIs are read-only. Discovery is explicit before remote
script handles can be opened.

Commands own parsing, short/detailed help, availability, and execution under
`src/commands/`. `CommandSystem` is their backend API; there is no engine command
switch or separate help table. Script APIs use the same validated backend rules.
QuickJS retains a 250 ms call limit, 32 MB heap, bounded stack/output and 10000
API-call limit. Modules are disposed after each script execution.

## Persistence and transitions

Save version 4 deliberately excludes terminal transcripts and readline history.
Only the world, progression, personal data, and editor settings/drafts are saved.
The decoder whitelists durable fields, including when reading older records.
Older player files are preserved while retired mission state is discarded.
Legacy supplied solver files are not silently deleted from existing workspaces.

Starting/resetting/leaving a level returns a clear-screen response and replaces
the live terminal with the context introduction. Replacing xterm also drops its
readline history. Reload synthesizes a new introduction; it does not replay old
commands. The title and prompt/window accents distinguish purple level space
from green home. The editor preserves the current level context and replaces
the terminal until a keyboard exit action.

## Verification status

TypeScript checks pass. Regression coverage has been updated for the ten-level
playthrough, branch choice, both star tiers, verification isolation and imports,
practice seeds, read-only evidence, home isolation, clean transitions, editor
drafts, migration and history-free persistence.

The current automated suite could not start: Vite's esbuild subprocess fails with
`spawn EPERM` under this sandbox. The preview server has the same restriction;
the embedded browser reported connection refused. No permission was requested,
and no current browser or test pass is claimed. A production build remains to be
run with subprocess execution available. The checked-in tests and
`player-guidance-review.md` describe the remaining checks.

Diagram/chart dependencies were removed. The existing DOMPurify override is
retained because Monaco also depends on it. The lockfile was pruned without
changing retained versions, then validated by an offline lockfile-only install.
