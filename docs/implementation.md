# Implementation notes

## Shared execution

The shell and saved .sc files use one Chevrotain grammar, static checker, interpreter, command registry, and value renderer. The interpreter depends only on LanguageHost (command metadata/invocation, workspace source reads, display), never GameEngine or mutable world state.

Commands own signatures, usage/help, availability and execution. Game commands use CommandSystem. Native value commands live under src/commands/values and use the same interface; no separate function dispatcher exists. Native overloads are explicit and selected statically. Unknown or invalid source is rejected before execution; availability and game rules are checked again at invocation.

Interactive bindings are ephemeral and survive submissions. A subsequent submission may replace a binding/function; duplicate declarations within a program are rejected. Script scopes start fresh. Imports resolve only within the personal /home notebook, load declarations once per execution, and reject cycles.

## Game environments

Mission lifecycle state belongs to GameEngine/World/Campaign; execution state belongs to LanguageSession. An ordinary program can start a mission, inspect evidence, submit, leave, and start another without replacing its interpreter or resetting its budget. Navigation and completed effects persist after completion/failure, exactly as for pasted statements. No final whole-game challenge or retired upgrade shop is added.

One star completes a level by any method. Five independent seeded cases verify the optional automation star. Each owns a fresh game/interpreter with a fixed snapshot of source files. Verification programs cannot replace/reset/leave the assigned case. Hints and second stars never gate progression. Complete solvers remain test fixtures only.

Home is outside the level graph. Filesystem commands inspect the active host; edit/vim/run/use access personal source. Evidence is read-only. neighbors explicitly discovers IDs; completion never discovers hosts.

## Limits and regex

Source is limited to 250,000 characters per file, 1,000,000 across imports and 50 import levels. Parsed delimiter nesting is bounded. Each execution has a 100,000-step budget, 2-second wall-clock deadline, 100-call function depth, bounded collection/string sizes, and a cumulative 32 MB allocation accounting budget. This is conservative accounting of produced values, not a JavaScript heap measurement. Output is bounded to 500 messages/80,000 characters. Runtime errors contain source locations and function frames.

Regex uses RE2JS (version locked in package-lock.json), not native JavaScript RegExp or a custom engine. Syntax follows https://github.com/google/re2/wiki/Syntax . match returns complete, non-overlapping matches. Pattern/input/match-count limits apply; backreferences and lookaround are unsupported. RE2JS project: https://github.com/le0pard/re2js .

## Workstation and saves

Readline uses the shared parser to continue incomplete statements and blocks. The worker supplies analysis and completion without executing game commands or saving. Monaco uses those services for diagnostics, types, signatures, references, and variable rename. The terminal has shared lexical highlighting and completion. Existing Vim and keyboard save/exit flows remain.

Cursor-aware completion in src/runtime/completion.ts uses the Chevrotain lexer and explicit per-signature argument targets. Suggestions carry a replacement range, insertion text, kind, and optional directory cursor position, shared by Readline and Monaco. Nested calls, quoted paths, source-relative imports, workspace paths, mission IDs, and discovered neighboring hosts use read-only tooling. Requests never execute unfinished source. Terminal completion captures Tab before xterm, preserving Readline's Shift+Enter handler. It runs only on Tab, inserts unique matches or a shared prefix, and prints ambiguous matches after two consecutive Tabs without an extension. Listing restarts the pending read with the same draft and caret, without executing source or adding history. There is no terminal suggestion popup; Monaco keeps its editor suggestions. Stale asynchronous responses are discarded in both interfaces.

Version 4 saves contain world/progression/player data/settings, excluding output, history, variables and function registrations. Existing player files and drafts are preserved, including legacy .js files; only .sc files execute. A language-installation marker installs missing skeletons without overwriting user files. Old campaign saves retain durable files while retired progression is migrated.

Starting/resetting/leaving a level clears terminal output/history and changes context styling. That UI transition does not reset language state. Reload starts a fresh REPL with a context introduction.

## Validation

Regression tests cover parsing/types/recursion/imports, regex, scope/limits, shared shell/script results, multiline input, completion without side effects, campaign-spanning execution, every level with fresh-case verification, verification isolation, editor flows, saves and migration. The browser-free driver in scripts/test-game.mjs runs this same stack and returns structured JSON without opening browser storage. See docs/testing.md. Build and test results are recorded in the migration log after running the final checks.
