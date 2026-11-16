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

Browser completion checks: type a command prefix, accept with Tab, select with Up/Down or Shift+Tab, and dismiss with Esc. Move into an earlier argument and confirm later source survives acceptance. Check quoted directory traversal, Ctrl+Space, Shift+Enter multiline input, history after dismissal, and mouse acceptance without losing terminal focus. In Monaco check command/path suggestions, Tab acceptance, and the normal save/discard and Vim exit shortcuts.

Use a browser for layout, focus, keyboard shortcuts, terminal paste/input, Monaco completion interaction, and other UI behavior. Language, command, mission and save behavior can usually be tested with the driver or Vitest.
