export const guideSections = [
  {
    id: 'start',
    title: 'Start here',
    text: 'Use mission start files-1. Starting a level connects to its entry host. Read evidence with ls and cat, then mission submit <password>. mission hint reveals staged clues without a star penalty. mission lists the file and network branches. Networking opens after files-2. mission leave returns to your workspace. Files and best stars survive fresh starts.',
  },
  {
    id: 'editor',
    title: 'Your traveling code workspace',
    text: 'Home is outside every level network. edit, vim, run, and use read your personal /home notebook; ls and cat inspect the current host. Normal editor: Ctrl+S saves/exits, Ctrl+Q discards/exits, Ctrl+Enter saves/exits/runs. Vim: :w, :q, :q!, :wq/:x, :run. New files remain drafts until saved. Source errors link to file and line. The editor provides type errors, hover, completion, signatures, variable rename and definition links.',
  },
  {
    id: 'scripts',
    title: 'The shell is the language',
    text: 'Type statements directly or save identical source in a .sc file. Use ; or newlines between statements. An unfinished block continues on the next line. Tab completes a unique match with a trailing space, or extends the shared prefix. Directories keep / so you can continue the path. When no more characters are shared, press Tab twice to print the possible matches, then type more to choose. Completion never opens a terminal popup. Up/Down browse command history; Down past the newest entry restores your unfinished input. History is temporary and clears when entering, resetting, or leaving a mission. Enter submits source; Shift+Enter adds a line. Completion works at the caret, including quoted paths. let declares an inferred immutable value; mut permits reassignment. Variables use $. Ordinary text requires double quotes; single quotes are rejected. Bare paths and command identifiers remain valid, as in cat /notes/access.txt and mission start files-1. Types are static; annotate where useful. Functions need typed parameters and return types. Lists and records are immutable values; append returns a replacement list. Script variables start fresh and cannot read shell variables. Navigation and completed game effects persist. Only small examples are supplied.',
    code: 'let text = "hello world"\necho (contains $text "world")\nlet files = (ls /)\nfor file in $files {\n  echo $file.name\n}\n\ndef read-note [path: string] -> string {\n  return (cat $path)\n}',
  },
  {
    id: 'strings',
    title: 'Strings, records, and regex',
    text: 'All value operations are commands available in the shell and scripts. Write contains $content "PASSWORD"; contains content PASSWORD is an error because ordinary text must be double-quoted. split, join, trim, contains, replace, slice, count, and match manipulate values. contains supports strings and list elements, selected by static types. ls returns File records with name, path, and type. Uncaptured values are displayed; assignment and nested calls retain their structure. from-json<Type> validates JSON into a declared record type. match uses RE2JS and RE2 syntax: https://github.com/google/re2/wiki/Syntax . It returns full matches only; lookaround and backreferences are unsupported.',
    code: 'let parts = (split "=" "release=r42")\necho $parts[1]\necho (match "[0-9]+" "r42 build17")\ntype Release = {release: string}\n# from-json<Release> accepts JSON with a string release field.',
  },
  {
    id: 'network',
    title: 'Exploring networks',
    text: 'neighbors discovers adjacent IDs. ssh <id> moves to a discovered adjacent host; exit restores the previous connection and directory. At the entry, mission leave returns home. The same commands work in scripts. Use hostname for the current ID. A list<string> of visited IDs, contains, and append can avoid revisiting cycles. There are no remote handles or separate scripted filesystem APIs.',
  },
  {
    id: 'automation',
    title: 'The optional automation star',
    text: 'mission submit --script /home/solve.sc runs source against five fresh cases. The script must call mission submit with the correct answer. Each case starts at the level entry with fresh variables and discoveries, using a fixed copy of your saved source files. Shell variables and personal cached data are not copied. Verification preserves your explored game. A failure reports a seed; supply it after the script path for one practice case without awarding stars. Verification programs cannot replace or leave the assigned mission. Ordinary scripts may start and leave missions, retaining their own execution state.',
  },
  {
    id: 'api',
    title: 'Commands and types',
    text: 'Use help for available commands and help <command> for usage. Invalid command arguments show the command help automatically. ls returns list<File>; cat and pwd return string; neighbors returns list<string>; mission status returns id/status fields; mission list returns level records; mission submit returns bool. echo prints any value and returns the same typed value, including when its result is captured. use /home/lib.sc imports typed functions and aliases from declaration-only files. There are no pipes, methods, classes, browser globals, external processes, timers, or JavaScript execution. Execution has step, allocation, depth, source-size and output limits.',
  },
  {
    id: 'stuck',
    title: 'When you get stuck',
    text: 'Use mission briefing for the task and mission hint for staged clues. Check hostname and pwd when paths surprise you. edit /home/solve.sc always opens personal source; cat reads evidence on the connected host. exit goes back one connection; mission leave ends the level. Ordinary completion and hints never block progression. Use mission submit --script <path> for the optional automation star. A failed verification leaves explored evidence unchanged. Reload restores files and progress with a clean terminal.',
  },
  {
    id: 'recovery',
    title: 'Saves and recovery',
    text: 'Files, stars, active level, and editor drafts are saved in this browser. Terminal output, history, variables and function registrations are never saved. Use save export/import for backups and one tab per origin. Use version to identify the loaded game build. Bare save shows help. save reset asks for confirmation before permanently deleting workspace files, progress, stars, and drafts and returning to a fresh workstation; export a backup first. Startup and migration preserve existing player-owned files, including old JavaScript; JavaScript cannot execute. Missing .sc starter files are installed without replacing your files.',
  },
] as const;
