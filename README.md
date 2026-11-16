# Shellcraft

A terminal programming puzzle game about investigating files and networks and building reusable tools.

## Run

Use Node.js 24 LTS or newer.

```sh
npm ci
npm run dev
```

Start with `mission start files-1`. Six file levels teach traversal, filtering, and references. After files-2, a four-level network branch opens. One star means solved by any method; `mission submit --script /home/solve.sc` verifies five fresh cases for the optional second star. Hints and automation stars never block ordinary progression.

## One language, shell and scripts

The prompt and saved `.sc` files use the same statically typed language:

```text
let files = (ls /notes)
for file in $files {
  echo $file.name
}
```

Commands return structured values. Uncaptured values are rendered; assignment and nested calls preserve their types. Variables infer types; functions require typed signatures. String/list operations are ordinary commands, not methods. There are no pipes or JavaScript execution.

Use `edit /home/solve.sc`, then `run /home/solve.sc`. `use /home/lib.sc` imports declaration-only libraries. Interactive variables/functions persist in memory; each script gets a fresh scope. Scripts may start and leave missions without losing their own execution state. Ordinary navigation persists exactly as it does manually.

The editor provides highlighting, completion, diagnostics, hover, signatures, variable rename and definition links. Normal editing uses Ctrl+S to save/exit, Ctrl+Q to discard, Ctrl+Enter to save/exit/run. Vim uses :w, :q, :q!, :wq/:x and :run. The terminal supports multiline input, syntax highlighting, and Tab completion.

See [language specification](docs/language-spec.md) and `guide` for syntax and small examples.

## Workspace and persistence

Filesystem commands operate on the current host; `edit`, `vim`, `run`, and `use` access your personal /home notebook. Level evidence is read-only. Home is outside level networks. `exit` returns to the previous level connection; `mission leave` returns home.

IndexedDB saves files, stars, the active level, and editor drafts. Terminal output, history, and interpreter bindings are never saved. Use one tab per origin and `save export/import` for backups. Existing player files, including legacy JavaScript, are preserved; missing .sc skeletons are installed without overwriting files.

## Implementation

- `src/runtime/`: Chevrotain grammar, type checker, bounded interpreter, shared language tools and value renderer.
- `src/commands/`: game commands, one registry, and the `CommandSystem` backend boundary.
- `src/commands/values/`: native string/list/JSON commands, registered through the same interface.
- `src/core/`: virtual filesystem, navigation, and persistent-in-memory REPL.
- `src/game/`: levels, verification environments, worker, and saves.
- `src/ui/`: xterm and Monaco/Vim workstation.
- `tests/fixtures/`: complete solvers, never installed in player workspaces.

Regex matching uses **[RE2JS](https://github.com/le0pard/re2js)** with [RE2 syntax](https://github.com/google/re2/wiki/Syntax). Package versions are locked in package-lock.json. The game has no application server; player programs cannot access real files, networks, browser/Node globals, or npm packages.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`npm run make:showcase` writes an optional example save with networking available and no complete solvers.
