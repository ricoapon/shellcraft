# Shared language migration

Each numbered stage is a separate commit. Work directly on master.

1. **Execution contract.** Commit the language specification and this migration plan. Keep mission/progression state independent from interpreter lifetime; permit campaign management from programs. Navigation behaves identically in shell submissions and scripts.
2. **Language core.** Add source-located parsing, static types/inference, imports, functions, control flow, a bounded interpreter, and focused tests. Keep the existing application running during this stage.
3. **Shared execution.** Give commands typed signatures and structured results. Route terminal input and saved programs through one compiler/interpreter and renderer. Isolate verification cases, not ordinary navigation. Remove the JavaScript bridge.
4. **Workstation integration.** Add multiline shell input and Shellcraft highlighting, diagnostics, and completion in the editor, using the shared language metadata. Preserve keyboard/Vim flows and player files.
5. **Content and verification.** Rewrite hints, guides, skeletons, test solvers, and project documentation. Remove obsolete dependencies and examples. Run language, game, persistence, UI, and build checks.

## Required invariants

- Commands use the shared registry and `CommandSystem`; no interpreter dependency on `GameEngine` or mutable world internals.
- Commands return values; one renderer handles uncaptured results in either execution mode.
- Parse/type errors are detected before the submission/file changes game state.
- Interactive bindings persist only in memory. Script bindings start fresh; neither bindings nor terminal history enter saves.
- A running script survives mission start/leave/reset, retaining its own variables/functions and execution budget. Verification receives an independent game and interpreter.
- Existing player files are preserved. Only skeletons and small examples are installed.

## Validation

Exercise overloads, malformed source, imports, recursion, scope, return types, runtime limits, and prototype-safe records. Compare pasted programs with scripts, test structured display/capture, and run a multi-mission program through the actual command interface. Keep a full campaign solver only in test fixtures.
