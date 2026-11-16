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

The editor provides highlighting, completion, diagnostics, hover, signatures, variable rename and definition links. Normal editing uses Ctrl+S to save/exit, Ctrl+Q to discard, Ctrl+Enter to save/exit/run. Vim uses :w, :q, :q!, :wq/:x and :run. The terminal supports multiline input and syntax highlighting. Invalid command arguments show the error and command help together. Completion runs only when you press Tab: a unique match is inserted with a trailing space (directories keep / so you can continue the path), and ambiguous matches extend to their longest shared prefix. If the input cannot be extended, press Tab twice to print the possible matches, then type more to choose one. No terminal popup appears. Up/Down browse submitted commands; Down past the newest command restores your unfinished input and caret. History is temporary and clears with the terminal when changing missions. Enter submits the source. Terminal and editor completion share commands, subcommands, variables, types, fields, and argument suggestions, including quoted paths at the caret. Filesystem commands complete the current host; edit/vim/run complete personal workspace paths and use resolves module paths relative to the source file. Host suggestions include only discovered neighbors.

See [language specification](docs/language-spec.md) and `guide` for syntax and small examples.

## Workspace and persistence

Filesystem commands operate on the current host; `edit`, `vim`, `run`, and `use` access your personal /home notebook. Level evidence is read-only. Home is outside level networks. `exit` returns to the previous level connection; `mission leave` returns home.

IndexedDB saves files, stars, the active level, and editor drafts. Terminal output, history, and interpreter bindings are never saved. Use one tab per origin and `save export/import` for backups. `save` shows save help. `save reset` asks for confirmation, then permanently removes workspace files, progress, stars, and drafts and creates a fresh workstation. Export a backup first. Other startup and migration operations preserve existing player files, including legacy JavaScript; missing .sc skeletons are installed without overwriting files.

## Implementation

- `src/runtime/`: Chevrotain grammar, type checker, bounded interpreter, shared language tools and value renderer.
- `src/commands/`: game commands, one registry, and the `CommandSystem` backend boundary.
- `src/commands/values/`: native string/list/JSON commands, registered through the same interface.
- `src/core/`: virtual filesystem, navigation, and persistent-in-memory REPL.
- `src/game/`: levels, verification environments, worker, and saves.
- `src/ui/`: xterm and Monaco/Vim workstation.
- `tests/fixtures/`: complete solvers, never installed in player workspaces.

Regex matching uses **[RE2JS](https://github.com/le0pard/re2js)** with [RE2 syntax](https://github.com/google/re2/wiki/Syntax). Package versions are locked in package-lock.json. The game has no application server; player programs cannot access real files, networks, browser/Node globals, or npm packages.

## Browser-free testing

Run `npm --silent run game -- --json -c "mission start files-1" -c "ls /notes"` for structured responses from the real game without a browser. Use `--jsonl` for a persistent AI/tool session, `--script` for local source, and `--state` only when an explicit test save is wanted. See [testing guide](docs/testing.md).

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run format:check
```

`npm run make:showcase` writes an optional example save with networking available and no complete solvers.

## GitHub Pages deployment

In the repository's Settings > Pages, select **GitHub Actions** as the build source once. Pushes to main then run .github/workflows/pages.yml: npm ci, formatting, the full test suite, and the production build (including TypeScript checks). Only a successful build is uploaded from dist and deployed. The workflow can also be started manually on main. It uses Node.js 24 and GitHub's Pages artifact/deployment actions; no personal access token or gh-pages branch is needed.

The workflow reads the configured Pages base path, so project assets work under /shellcraft/ and custom-domain sites can use /. For a local project-path build, set VITE_BASE_PATH=/shellcraft/ before npm run build; ordinary local builds use /.

Published build IDs look like **42.1-e675464**: workflow run number, attempt number, and the first seven characters of the Git commit. Attempts distinguish reruns without tags or package-version changes. Type `version` in the game to display the loaded bundle's version string. The same version is published at version.json beside index.html and recorded in the workflow summary. An already-open tab reports the bundle it loaded; reload to pick up a later deployment. Local builds without CI metadata report development. Build identity is independent of player save versions.
