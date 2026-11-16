# Files and networking playtest

This is the current review checklist. The earlier fifteen-mission sequence is
retired. No separate tutorial or additional application chrome is needed.

| Level     | New complication                   | Reusable player knowledge              |
| --------- | ---------------------------------- | -------------------------------------- |
| files-1   | Read a named file                  | Read and submit a value                |
| files-2   | Search a few files                 | Directory listing and iteration        |
| files-3   | Nested directories                 | Traversal added to search              |
| files-4   | Multiple password matches          | Filter active records                  |
| files-5   | Credential referenced by a release | Parse and join evidence                |
| files-6   | Larger, deeper variations          | Keep and improve the existing solver   |
| network-1 | Evidence on another host           | Reuse file operations after connecting |
| network-2 | Branching connections              | Reuse search across hosts              |
| network-3 | Cycles                             | Add a visited set to exploration       |
| network-4 | Evidence split across hosts        | Combine traversal and reference lookup |

## First playtest

- Begin with a clean profile: only starter skeletons should be present, without
  installed recursive searches or crawlers. Existing player saves retain files.
- Enter files-1: old terminal output disappears, the title names the level, the
  accent becomes purple, and the prompt is on archive rather than home.
- Complete files-1 manually or automatically. Scripting works from the start;
  one-star solutions never require a script.
- Complete files-2 and verify that both files-3 and network-1 are offered.
- Try reusing a search across files-2, files-3, files-4 and files-6. Each added
  complication should require an understandable extension or no changes at all.
- Verify that hints reveal one clue at a time and do not affect stars.
- Attempt an automation submission containing a hardcoded password: fresh-case
  verification should fail and report a reproducible seed. A reusable solution
  should earn two stars without changing the explored instance or personal data.
- Verify that a practice seed earns no stars, even on success. Second stars must
  never be prerequisites for ordinary levels.

## Navigation, editor, and persistence

- Use neighbors and ssh in network-1, then exit. At gateway, exit should explain
  mission leave. Home must never appear as a network neighbor or script handle.
- Use edit /home/solve.js while remote. It should be clear that this is the
  player's traveling code notebook, while ctx.fs reads the remote evidence.
- Leave the level: clear terminal, green accent and home title; files/stars kept.
- Reload during a level: fresh level introduction, no old commands or terminal
  text. Inspect an exported save to confirm it contains no shell/transcript data.
- Save or discard normal editor changes with hotkeys. Recheck Vim :q protection,
  :q!, :wq, and custom :run. New files should remain recoverable drafts until saved.
- Import an older save: player files should survive; retired systems, old mission
  progression and terminal output should not return. Reject damaged imports
  without replacing the active save.

Current coverage is source review plus TypeScript checking. The automated suite,
production build, and embedded-browser playthrough still need execution when the
sandbox permits the esbuild subprocess. No current full playthrough is claimed.
