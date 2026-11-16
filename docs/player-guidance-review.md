# Player guidance review

The terminal is the entry point. There is no separate mission board or tutorial UI.

- Welcome points to mission start files-1, guide, hints, and ephemeral terminal state.
- Mission briefings and staged hints teach file traversal, active records, typed JSON, and network cycles.
- guide scripts uses small .sc operations, with the same syntax as the shell.
- guide strings documents split/contains/match and names RE2JS/RE2 syntax.
- guide network uses neighbors/ssh/exit, without a second scripted networking API.
- guide automation distinguishes ordinary scripts from isolated per-level verification.
- Starter files are a comment-only solve.sc and a small value-operation example. No complete solver is installed.
- help hides unavailable commands and includes interactive player functions.
- Editor hints preserve normal and Vim keyboard flows. Errors link to .sc source locations.
- Existing player-owned JavaScript files remain editable but cannot execute.

A fresh player playtest should confirm that users can paste an experiment from the shell into a file, add variables/loops without changing commands, distinguish active-host evidence from personal source, and understand why a self-contained verification program cannot use shell variables or leave its assigned mission.
