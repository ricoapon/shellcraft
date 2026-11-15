export const guideSections = [
  {
    id: 'start',
    title: 'Start here',
    text: 'Run mission list, then mission start deployment. Connect to the entry host with ssh. Inspect its files, follow the evidence, and use mission submit <answer>. Mission rewards are tokens: use upgrade list to view capabilities and upgrade buy <capability> to purchase one. Scripts cost no tokens to execute. Hints from mission hint are free. Completed missions can be replayed without extra rewards, and resets never erase your home files.',
    code: 'mission list\nmission start deployment\nssh deploy\nls /notes\ncat /notes/INDEX.txt\nmission submit <password-you-found>\nexit\nupgrade list\nupgrade buy scripting',
  },
  {
    id: 'editor',
    title: 'Your workstation',
    text: 'Terminal commands act on the current host. edit, vim, and run always use your home files, even while connected remotely. The editor replaces the terminal until you exit. With edit: Ctrl+S saves and exits, Ctrl+Q discards and exits, and Ctrl+Enter saves, exits, and runs. With vim: :w saves and keeps editing, :q quits if unchanged, :q! discards, :wq or :x saves and quits, and :run saves, quits, and runs. Draft recovery never changes a file until you explicitly save it. Opening the editor pauses simulation; exiting does not resume time. The source link on a runtime error opens the relevant file and line. Completion is deliberately deferred.',
    code: 'edit /home/scripts/search.js\nrun /home/scripts/search.js RECOVERY_KEY /archive\nstartup /home/startup.js\nstartup reload',
  },
  {
    id: 'scripts',
    title: 'JavaScript modules and structured files',
    text: 'A script exports main(ctx,args). Imports resolve exclusively through your home filesystem. fs.list returns file records with path, name, and type; it does not return terminal text. Read/write/mkdir/stat are synchronous game operations. Remote mission files are read-only except explicitly permitted configuration paths. Code runs inside QuickJS in a worker with a 250 ms call budget, 32 MB heap, 10000 API-call limit, and bounded output. Browser, Node, real network, timers, npm modules, and asynchronous entry points are unavailable.',
    code: 'import { searchFiles } from "/home/lib/search.js";\nexport function main(ctx, args) {\n  const matches = searchFiles(ctx, args[0] ?? "KEY", "/");\n  ctx.storage.set("matches", matches);\n  for (const match of matches) ctx.print(match);\n}',
  },
  {
    id: 'api',
    title: 'Game API reference',
    text: 'ctx.fs acts on the active session. ctx.home acts on home. ctx.session.host / workingDirectory report navigation; connect(host) and exit() change the interactive session. ctx.network.neighbors(host?) discovers adjacent IDs. ctx.network.connect(id) returns an explicit handle after discovery; handle.fs and handle.neighbors() do not move the terminal. ctx.inspect(host?) collects current observations. ctx.storage.get(key,fallback), set(key,value), delete(key) persist JSON player data. ctx.mission.briefing / observations / status provide mission information; action(action) and submit(answer) use the same validated actions as the terminal. ctx.simulation.state / pause() / resume() / step(count) control time. ctx.capabilities lists unlocked APIs.',
    code: 'const host = ctx.network.connect("mesh-1");\nctx.print(host.fs.list("/"));\nctx.print(host.neighbors());\nctx.print(ctx.session.host); // unchanged',
  },
  {
    id: 'commands',
    title: 'Reusable commands',
    text: 'After unlocking commands, use startup <path> to choose a module exporting setup(ctx). Registrations belong to that source; reloading replaces its previous registrations. The startup module is restored when loading a save. Import shared functions rather than invoking run from another script. ctx.commands.invoke(name,args) can invoke synchronous game commands.',
    code: 'export function setup(ctx) {\n  ctx.commands.register("hello", args => {\n    ctx.print("Hello " + (args[0] ?? "operator"));\n  }, {description:"A personal greeting", usage:"hello [name]"});\n}',
  },
  {
    id: 'screens',
    title: 'Custom screens',
    text: 'Unlock screens, then use screen add <path>. A module exports render(view,observations). Rendering is read-only: it reads collected observations and saved data, and returns a declarative view. It must not inspect or mutate the world. Do those operations through commands or event handlers. Render errors affect only that panel. Use screen layout split or screen layout tabs, and screen focus <id> to choose a tab. Use screen refresh <milliseconds> to configure refreshes during playback (100 to 60000 ms). Layout, source paths, refresh interval, and panels are saved. Available view helpers: text, table, barChart, lineChart, mermaid, networkGraph, button, and stack. Tables and charts accept data arrays. Graphs accept nodes with stable id/label and edges with source/target. onSelect receives the stable entity ID; onClick invokes a function.',
    code: 'export function render(view, observations) {\n  return view.barChart({\n    title:"Connections",\n    data: observations.nodes.map(n => ({id:n.id,label:n.name,value:n.connections.length})),\n    onSelect: id => ctx.inspect(id)\n  });\n}\n// Try /home/screens/network.js and /home/screens/telemetry.js',
  },
  {
    id: 'simulation',
    title: 'Simulation and controllers',
    text: 'Dynamic missions start paused. Use simulation step to advance exact ticks or simulation resume for playback. Tick order: scheduled events, shared observation snapshot, controllers in saved order, validated actions in order, mission systems, observations/history/objective evaluation. Conflicting actions report failures in results on the following tick. Unlock telemetry for measurement history. Controllers export control(state), return an action array, and finish immediately. Direct mutation is forbidden; persistent controller memory belongs in ctx.storage. A failing controller is disabled without stopping other controllers.',
    code: 'export function control(state) {\n  const hot = state.nodes.find(n => n.load > 60);\n  const idle = state.nodes.find(n => n.load < 10);\n  return hot && idle ? [{type:"transfer",from:hot.id,to:idle.id,amount:20}] : [];\n}\n// controller add /home/controllers/balance.js\n// controller off balance\n// simulation step 10',
  },
  {
    id: 'scheduling',
    title: 'Priority and cooling challenges',
    text: 'After the core campaign, the Priority surge and Cooling failure assignments extend thermal balancing. state.jobs exposes remaining work, host, priority, and deadline. state.transfers exposes in-flight work and shared link bandwidth. Higher-priority jobs are processed first. Scheduled arrivals and cooling changes happen before the controller snapshot; a missed job deadline fails the mission. Archived observations from earlier missions are available under observations.archives. Mission resets preserve these archives, home files, and controller memory.',
  },
  {
    id: 'recovery',
    title: 'Backups and recovery',
    text: 'All state stays in this browser profile and origin. Use save export for a JSON backup before clearing browser storage or switching browsers. Use save import to select a backup. Import validates the snapshot before replacing a game. Reloading the page restarts the worker and recovers the most recent saved state. Playback resumes paused after reload. Old single-computer saves migrate with your files intact. Mission replay resets remote environments, not your code, notes, layouts, controllers, or progression. Multiple simultaneous tabs are not synchronized; play in one tab to avoid overwriting newer saves.',
  },
  {
    id: 'stuck',
    title: 'When you get stuck',
    text: [
      'Need a direction? mission shows your current assignment or the next one. mission briefing restates the objective; mission hint gives a free clue without spending tokens.',
      'Cannot find a command? help lists what is available now; help <command> explains its syntax. upgrade list shows which tools you can buy. Some controls only appear in matching missions.',
      'Cannot find a file? The prompt names your current host and directory. Use pwd and ls, then cat <path> to read a file. exit returns home. edit, vim, and run always use home files, even when the terminal is connected remotely.',
      "Need to change a remote configuration? Read it with cat first, then use write <path> '<complete contents>' while connected to that host. write replaces the entire file; quote JSON with single quotes so its double quotes survive. Remote paths are read-only except where the briefing allows changes. See help write.",
      'Found an answer? Use mission submit <value>, not the marker name. Repair, network-action, and simulation objectives complete automatically through actions; they do not need a submitted answer.',
      'Time not moving? Dynamic missions start paused. simulation status shows the current tick; simulation step advances it. Transfers take ticks to arrive, and queued commits execute on the next tick. Opening the editor pauses time; exiting keeps it paused until you resume.',
      'Screen missing data? Discover hosts with neighbors and collect observations with inspect <host>. Screens only display collected observations. Measurement history requires the telemetry upgrade and new simulation ticks.',
      'Controller stopped? controller list shows disabled controllers and errors. Fix the source, then controller add <path> to reload it. A controller must return actions, not directly change the world.',
      'Want another attempt? mission reset rebuilds the remote mission while preserving home files and upgrades. Replaying a completed mission gives no extra tokens. guide recovery explains browser-local saves and backups.',
    ].join('\n\n'),
  },
] as const;
