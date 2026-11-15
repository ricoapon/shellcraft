# Workstation interface constraints

- Keep the main application title bar as **Shellcraft** only.
- Do not add anything else to that title bar: no buttons, navigation, subtitles,
  token counters, badges, or status indicators. This space is intentionally empty.
- The default interface is the framed terminal and that title bar. Do not add a
  mission board, persistent side menus, mission/tick strips, or capability/autosave
  status bars. Expose game management through terminal commands instead.
- Show the editor only when the player opens it. Player-created screens may appear
  after the player explicitly adds them. Their contextual controls are separate
  from the application's title bar and must not turn into general application chrome.
- The editor replaces the terminal and custom screens while open. Use hotkeys,
  not editor buttons or mode checkboxes. Keep its shortcut hints at the bottom.
  `edit` opens normal editing; `vim` opts into Vim bindings. Saving and discarding
  are explicit exit actions. In normal mode Ctrl+S saves/exits, Ctrl+Q discards/exits,
  and Ctrl+Enter saves/exits/runs. Vim mode uses :w, :q, :q!, :wq, :x, and lowercase
  :run instead; do not install the normal editor's Ctrl shortcuts in Vim mode.
  Show only the custom :run hint in Vim mode. Keep the footer height fixed so
  opening the Vim command line with : never resizes or shifts the editor.
- Prefer the embedded browser for previews and browser verification. Do not switch
  to an external browser without an explicit user request.
