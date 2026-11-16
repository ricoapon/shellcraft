# Browser-free game testing

The driver runs the real GameEngine, language, commands, and renderer in Node through Vite's TypeScript loader. It uses an isolated in-memory game, never browser IndexedDB. No web server or browser is started.

## Command sequences

```sh
npm --silent run game -- --json -c "mission start files-1" -c "ls /notes" -c "cat /notes/access.txt"
```

Each -c accepts complete Shellcraft source, including semicolons, variables, functions and multiline blocks. Commands share one REPL session. --script ./program.sc executes local source through the actual run command in a fresh script scope; use -c to install any required virtual /home libraries first.

Without --json, the driver prints terminal output. With --json it emits one response per operation, including ok, rendered output, raw emitted values, error when present, host, directory and view. For example, an ls result appears as a list of file records in values[0], while output contains its table. Captured values remain in the program instead of being emitted. Batch failures set exit code 1; completed effects remain applied. --state <file> explicitly loads/saves a test save between invocations. No state file is written by default.

## Persistent JSON-lines session

Start `npm --silent run game -- --jsonl` and send one JSON object per stdin line:

```json
{"command":"mission start files-1"}
{"command":"let text = (cat /notes/access.txt); echo $text"}
{"script":"echo $args","args":["example"]}
{"inspect":true}
{"analyze":{"source":"let value: number = \"wrong\"","offset":26,"path":"/home/test.sc"}}
{"snapshot":true}
{"reset":true}
```

Requests receive one JSON response each. Errors do not end the session; closing stdin ends it. A failed request makes the final process exit code 1. inspect returns the current view; snapshot returns a full developer test snapshot; reset creates a fresh game. analyze invokes shared diagnostics/completion without executing source.

AI tooling can keep this process open to inspect output and issue follow-up commands. Tests may also import createTestSession from scripts/test-game.mjs and call request/close directly.

To inspect completion at a caret, send `{"analyze":{"source":"echo (cat /no); echo kept","offset":13,"path":"<terminal>"}}`. Completion returns `replaceFrom`/`replaceTo` offsets plus insertion text and optional directory cursor offsets. Check that accepting a suggestion preserves later arguments and statements. Automated coverage includes quoting, path scopes, module-relative paths, argument metadata, and discovery without side effects.

Browser completion checks: typing must show no popup. Tab inserts a unique match with a trailing space (missio becomes mission followed by a space), reuses an existing separator without doubling it, leaves directories ready for path traversal, or extends to the longest shared prefix (for example, mission st becomes mission sta). With no further shared characters, the first Tab stays quiet and the second prints matches as terminal output, restoring the current draft and caret. Type more to choose a match. Move into an earlier argument and confirm later source survives completion and match listing. Check quoted directory traversal, rapid double Tab, Shift+Enter multiline input, and normal cursor/history keys. Verify Up/Down recall after typing and editing, draft/caret restoration after the newest entry, and multiline command recall. Match listing must not create history entries. Reload and mission transitions must clear history. In Monaco check command/path suggestions, Tab acceptance, and the normal save/discard and Vim exit shortcuts.

Use a browser for layout, focus, keyboard shortcuts, terminal paste/input, Monaco completion interaction, and other UI behavior. Language, command, mission and save behavior can usually be tested with the driver or Vitest.

Save-management checks compare bare save with help save, verify argument errors include usage without executing earlier statements, and check that save reset only requests an interactive action. Worker tests use fake IndexedDB to verify successful reset, clean reload, and preservation of the current game when reset persistence fails. The browser-free driver returns the reset action without accepting a browser confirmation; its separate reset request resets only isolated test state.
