# Workstation interface constraints

- At home, keep the title bar as **Shellcraft**. Inside a level, show
  **Shellcraft — <level ID>: <title>** and use a purple accent instead of green.
- Do not add buttons, navigation, token counters, badges, or status indicators.
- The default interface is the framed terminal and that title bar. Do not add a
  mission board, persistent side menus, mission/tick strips, or capability/autosave
  status bars. Expose game management through terminal commands instead.
- Entering, resetting, and leaving a level clears the terminal and its input history.
  Reload shows a fresh context introduction. Never persist transcripts or command history.
- Show the editor only when the player opens it. It is the personal code notebook
  carried into levels; home is not a network host inside a level.
- The editor replaces the terminal while open. Use hotkeys,
  not editor buttons or mode checkboxes. Keep its shortcut hints at the bottom.
  `edit` opens normal editing; `vim` opts into Vim bindings. Saving and discarding
  are explicit exit actions. In normal mode Ctrl+S saves/exits, Ctrl+Q discards/exits,
  and Ctrl+Enter saves/exits/runs. Vim mode uses :w, :q, :q!, :wq, :x, and lowercase
  :run instead; do not install the normal editor's Ctrl shortcuts in Vim mode.
  Show only the custom :run hint in Vim mode. Keep the footer height fixed so
  opening the Vim command line with : never resizes or shifts the editor.
- Prefer the embedded browser for previews and browser verification. Do not switch
  to an external browser without an explicit user request.
