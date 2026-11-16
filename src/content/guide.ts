export const guideSections = [
  {
    id: 'start',
    title: 'Start here',
    text: 'Use mission start files-1. Starting a level clears the terminal and connects to its entry host. Read evidence with ls and cat, then mission submit <password>. mission hint reveals staged clues, without a star penalty. mission lists both branches and their prerequisites. Networking opens after files-2; you can keep exploring files or switch branches. mission leave returns to your workspace and clears the terminal again. A new start creates fresh evidence; your files and stars stay.',
  },
  {
    id: 'editor',
    title: 'Your traveling code workspace',
    text: 'Home is outside level networks. Think of /home as your personal code notebook, carried into each level. edit, vim, and run always refer to that notebook. Terminal ls/cat and ctx.fs refer to the current machine. Imports read notebook modules; there is no ctx.home or network route home. edit uses Ctrl+S to save/exit, Ctrl+Q to discard/exit, Ctrl+Enter to save/exit/run. Vim uses :w, :q, :q!, :wq/:x, and custom :run. New files remain drafts until saved.',
  },
  {
    id: 'scripts',
    title: 'Your first script',
    text: 'Scripting is available from the start; the first file level can also be solved manually. edit /home/solve.js opens an empty main(ctx,args). Start small: print the current host or list a directory, then inspect the result. ctx.fs.list returns records with name, path, and type (file or directory). ctx.fs.read(path) returns text. JSON.parse(text) turns JSON into fields. A for...of loop visits entries; a function can reuse a procedure for nested directories. No language features are locked. These examples show individual operations, not complete solvers.',
    code: 'export function main(ctx, args) {\n  ctx.print(ctx.session.host);\n  ctx.print(ctx.fs.list("/"));\n}\n\n// Individual operations you can try inside main:\n// const text = ctx.fs.read("/notes/access.txt");\n// ctx.print(text);\n// ctx.mission.submit(yourAnswer);',
  },
  {
    id: 'network',
    title: 'Exploring networks',
    text: 'Network levels start on their entry host. neighbors discovers adjacent IDs; ssh <id> moves to one and exit returns to the previous connection. At the entry, mission leave goes home. In scripts, ctx.network.neighbors() discovers neighbors of the interactive host; ctx.network.connect(id) returns a handle with fs and neighbors() and keeps the interactive session unchanged. Discover a host before opening a handle. Cycles mean an exploration may revisit the same host; consider storing visited IDs in a Set.',
    code: '// Two individual operations (inside main):\n// const ids = ctx.network.neighbors();\n// const host = ctx.network.connect(ids[0]);\n// ctx.print(host.fs.list("/"));',
  },
  {
    id: 'automation',
    title: 'The optional automation star',
    text: 'Your program exports synchronous main(ctx,args) and calls ctx.mission.submit(password). mission submit --script /home/solve.js runs it against five fresh instances without intervention. Layouts and answers change within the level rules. Each case starts at the entry host with an empty ctx.storage and a new interpreter, but can import your saved libraries. Files, answers, and state from manual exploration are not copied. Failure reports a seed: append it to the same command to practice that exact case without awarding stars. Successful full verification earns two stars, including the ordinary completion star. Manual exploration and hints never disqualify you. Verification leaves your explored instance and current connection untouched.',
  },
  {
    id: 'api',
    title: 'API reference',
    text: 'ctx.fs.list(path="."), read(path), stat(path) inspect the current machine. handle.fs exposes the same operations on a discovered host. Evidence is read-only. ctx.session.host and workingDirectory describe the interactive session; connect(id) and exit() navigate it. ctx.network.neighbors(id?) discovers hosts; connect(id) returns a handle. ctx.mission.briefing and status describe the level; submit(value) checks the password. ctx.print(value) writes terminal output. ctx.storage.get(key,fallback), set(key,value), delete(key) store personal JSON data for ordinary runs. Storage is intentionally empty in each verification case. ctx.capabilities lists unlocked APIs. Imports resolve only under /home. Browser globals, Node, timers, npm imports and asynchronous entry points are unavailable. Each call has a 250 ms execution limit, 32 MB heap, 10000 API-call limit and bounded output.',
  },
  {
    id: 'stuck',
    title: 'When you get stuck',
    text: 'Need direction? mission shows your current level and available branches; mission briefing restates the task. Need a clue? mission hint reveals one step at a time. Cannot find a file? Check the host and directory in the prompt; use pwd, ls, and cat. Cannot find your source? edit /home/solve.js always opens your personal code notebook. Stuck at a host? exit goes back one connection; mission leave ends the level. A script ran but earned no automation star? Use mission submit --script <path> for fresh-case verification. A failed verification does not change your explored evidence. Reloading starts a clean terminal with the current level introduction, keeping files and progress. No timers or deadlines apply.',
  },
  {
    id: 'recovery',
    title: 'Saves and recovery',
    text: 'Files, stars, the active level and editor drafts are saved in this browser. Terminal output and readline history are never saved or restored. Use save export before clearing browser data; save import restores a backup. Old saves preserve player files, but retired missions and their unlocks are replaced by the new progression. Old supplied solver files already in your workspace remain yours; fresh workspaces include only a blank solve.js. Play in one tab per origin to avoid competing saves.',
  },
] as const;
