# Programming Terminal Game — Design Specification

## 1. Game identity

A programming puzzle game in which the player builds their own terminal environment while exploring remote computers and solving missions. The home computer is both the player's base and their main creation: commands, reusable functions, automation, maps, charts, and control panels accumulate across missions.

The player begins with a small shell and basic filesystem commands. Each mission creates a practical reason to extend their tools. Solving missions awards resources used to unlock additional programming capabilities and expand the workstation.

Most operations resolve immediately. Dynamic missions use a running simulation that the player can pause, step, and control through short scripts.

## 2. Core game loop

1. Start on the home computer and select an available mission.
2. Connect to its entry server using `ssh`.
3. Inspect files, machines, connections, and mission-specific systems.
4. Write or extend commands, scripts, and screens to understand and manipulate the system.
5. Complete the mission's objective and receive its resource reward.
6. Return home, unlock capabilities, and retain the tools created during the mission.
7. Apply and extend those tools in subsequent missions.

Completed missions remain available as resettable test environments. Player code and workstation configuration persist independently of mission resets.

# Part I — Terminal and Workstation

**Implementation priority: build this foundation first.** The terminal is a reusable environment. Missions described in Part II supply data, actions, and objectives through its interfaces.

## 3. Home computer and sessions

The home computer contains the player's scripts, reusable modules, saved observations, and screen definitions. These files remain accessible while operating a remote session.

A terminal session tracks:

- The connected host.
- The current working directory.
- Command history and output.
- The active mission, when connected to a mission environment.

The prompt displays the host and working directory. `ssh <host>` switches the active connection to a reachable machine. `exit` returns to the previous connection; exiting the mission entry connection returns home. Each connection preserves its own working directory.

Filesystem commands operate on the active session's host. Programmatic connections use explicit host handles so a crawler can inspect several machines without changing the interactive terminal session.

## 4. Built-in foundation

The initial shell provides the following commands and facilities:

| Facility | Purpose |
| --- | --- |
| `help [command]` | Describe available commands, their arguments, and examples. |
| `ls [path]` | List directory entries. |
| `cd <path>` | Change the working directory. |
| `pwd` | Print the current working directory. |
| `cat <path>` | Display a text file. |
| `ssh <host>` | Connect to a reachable machine. |
| `exit` | Return to the previous connection. |
| `edit <path>` | Open a player-owned file in the code editor. |
| `run <path> [args...]` | Execute a saved script when scripting is unlocked. |
| `clear` | Clear terminal output. |

The shell supports quoted arguments, command history, keyboard navigation, and command/path completion for information the player has discovered.

The editor provides syntax highlighting, save/run actions, and errors linked to the relevant source location. The terminal preserves output while the player edits code.

## 5. Player programming model

Player code uses JavaScript modules. Scripts execute immediately against the current game state and finish. Reusable functions are imported from player-owned files.

The game exposes structured data to scripts. Terminal commands format that data for human reading. A script that lists files receives file records; the player can then print, filter, group, or visualize those records.

The runtime exposes game files and game actions inside a sandbox. Execution limits keep the workstation responsive. Errors identify the script and source location while preserving access to the terminal and editor.

### 5.1 Script entry point

A command script exports a `main` function:

```js
export function main(ctx, args) {
  const entries = ctx.fs.list(args[0] ?? ".");

  for (const entry of entries) {
    ctx.print(entry.name);
  }
}
```

`ctx` supplies the active session, unlocked capabilities, output functions, and persistent storage. The filesystem API resolves relative paths using the session's working directory.

### 5.2 Player-created commands and aliases

The player registers functions as terminal commands:

```js
import { searchFiles } from "/home/lib/search.js";

export function setup(ctx) {
  ctx.commands.register("find-text", (args) => {
    const [text, path = "."] = args;
    const matches = searchFiles(ctx, path, text);

    for (const match of matches) {
      ctx.print(`${match.path}:${match.lineNumber}: ${match.text}`);
    }
  });

  ctx.commands.register("home", () => {
    ctx.session.connect("home");
  });
}
```

A player-owned startup module exports `setup(ctx)`. The workstation runs it when loading a save and supports reloading it after edits. Registrations belong to their source module; reloading that module replaces its previous registrations.

Aliases are short registered functions. More sophisticated helpers, argument handling, and command menus are built from the same mechanism.

## 6. API boundaries

| API area | Responsibilities |
| --- | --- |
| Filesystem | List, read, and modify permitted game files; return stable file paths and entry types. |
| Sessions | Report the current host and directory; manage interactive connections. |
| Network | Discover adjacent hosts and create explicit scripted connection handles. |
| Commands | Register player functions, supply help metadata, and invoke commands. |
| Storage | Preserve player data between executions and across saves. |
| Screens | Register render functions, configure layouts, and bind interactions. |
| Simulation | Read tick/speed state and expose pause, resume, and step controls. |
| Controllers | Register short functions that produce actions on simulation ticks. |
| Mission | Expose briefing, discovered observations, permitted actions, and objective status. |

Individual capabilities have unlock requirements. The terminal runtime implements the common interfaces; mission definitions supply their available data and actions.

Discovered information includes stable identifiers and observation timestamps. Saved observations remain useful when a remote machine becomes unreachable. Screens can distinguish current observations from older ones.

## 7. Player-created screens

The workstation contains a terminal, editor, and player-defined screen area. Players create screens in code and arrange them into saved layouts with panels or tabs.

The rendering library provides:

- Text and formatted values.
- Tables with sorting and selection.
- Bar charts.
- Line charts for historical measurements.
- Mermaid diagrams generated from strings.
- Network graphs with node and edge styling.
- Buttons and selection handlers that invoke player functions.

The player determines which data to collect, which calculations to perform, and how to present the results. The library renders the supplied representation.

### 7.1 Screen lifecycle

A screen module exports a render function. The workstation calls it when relevant observations change and at a configured refresh interval during simulation playback. Refreshing a screen reads collected state; inspection and mutation happen through explicit commands or controllers.

A render function returns a declarative view:

```js
export function render(view, observations) {
  return view.barChart({
    title: "Outgoing connections",
    data: observations.nodes.map(node => ({
      label: node.name,
      value: node.connections.length
    }))
  });
}
```

The same data can generate Mermaid source or populate a table. Chart selection and graph interaction supply stable entity IDs to player-defined handlers. Actions use the same game APIs available to terminal scripts.

Render failures appear inside the affected panel with a link to its source. Layout, screen configuration, and history buffers persist in the save.

### 7.2 Screen development progression

Players progressively build:

1. Search results with filenames and matching lines.
2. Network maps generated from discovered connections.
3. Comparisons such as incoming and outgoing connection counts.
4. Service dependency views and diagnostic results.
5. Live temperature, load, and queue displays.
6. Interactive planning panels and automation diagnostics.

## 8. Time, simulation, and automation

Static missions change when the player performs actions. Dynamic missions advance through discrete simulation ticks, with real-time playback controlling how frequently ticks occur.

Pause, resume, single-step, and playback-speed controls are available for dynamic missions. Opening the code editor pauses the active simulation. The player resumes it explicitly after editing.

Each tick follows a defined order:

1. Apply scheduled external events, such as incoming jobs.
2. Build the observation snapshot available to controllers.
3. Invoke enabled controllers in saved registration order.
4. Validate and apply returned actions in that order.
5. Advance transfers, processing, cooling, and other mission systems.
6. Update observations and history, evaluate objectives, and refresh screens.

Each controller receives the same tick snapshot. Action results report conflicts or failures for inspection on the following tick.

Controllers execute once per tick and finish immediately. Persistent controller state is stored explicitly through player storage.

```js
export function control(state) {
  const transfer = chooseTransfer(state);
  return transfer ? [transfer] : [];
}
```

The player can enable, disable, replace, and inspect controllers. Screens show their decisions and resulting system behavior.

Dynamic missions support a progression from manual commands to visual monitoring, recommendations, automatic control, and controller improvement.

## 9. Persistence and progression

The save contains:

- Home filesystem and player source code.
- Registered startup module and workstation layout.
- Saved observations, player notes, and controller state.
- Unlocked capabilities and available resources.
- Mission availability, completion, and active mission state.

Mission rewards unlock capabilities such as scripted file access, scripted connections, custom screens, telemetry subscriptions, and controllers. Players implement search commands, crawlers, aliases, and balancing strategies using those capabilities.

Existing tools remain useful across missions. Later missions introduce new relationships and data that extend the same tools.

## 10. Terminal-first implementation sequence

### Stage A — Shell and filesystem

Implement the home computer, a fixture remote server, session navigation, the base commands, history, completion, and persistence.

**Completion check:** the player can connect, inspect files, return home, reload the application, and recover the saved state.

### Stage B — Editor and scripts

Implement JavaScript modules, the script context, structured filesystem access, execution errors, imports, and saved player code.

**Completion check:** the player writes a file-search script, runs it against the fixture server, and imports its search function from another script.

### Stage C — Custom commands

Implement startup modules, command registration, argument forwarding, help metadata, and registration reloads.

**Completion check:** a player-created search command and navigation shortcut remain available after reloading the save.

### Stage D — Custom screens

Implement panel registration, layouts, text, tables, charts, Mermaid rendering, graph interactions, and saved configuration.

**Completion check:** player code displays fixture observations as a table, connection-count chart, and network diagram, with a selection invoking a player command.

### Stage E — Simulation hooks

Implement the tick lifecycle, playback controls, observation history, and controller registration using a small heat/load fixture.

**Completion check:** a custom panel updates during playback; a short controller redistributes fixture load; pause and single-step reproduce the behavior reliably.

These fixtures establish the terminal interfaces used by the mission content below.

# Part II — Levels and Mission Content

**Implementation priority: develop after the terminal foundation.** Levels are configurations of files, network structure, simulation rules, available capabilities, objectives, and rewards.

## 11. Shared level structure

Every level defines:

- A briefing and explicit completion objective.
- An entry host and initial player access.
- Files, machines, connections, services, and other entities.
- Information revealed by inspection and actions permitted on each entity.
- Static or dynamic simulation behavior.
- Success and failure conditions.
- A resource reward and associated capability unlocks.
- A repeatable reset state for replay and tool testing.

Objectives evaluate world state independently of the player's implementation. Terminal commands, custom screens, and automation operate through the same mission actions.

## 12. Opening levels

| Level | Situation and objective | Player tool development |
| --- | --- | --- |
| 1. Deployment note | Search 10–20 files and submit the password identified by the active deployment note. | Learn navigation and file inspection; earn access to scripting. |
| 2. Search the archive | Locate a key in a larger collection of files using a recognizable marker. | Write file-reading loops, filter matching lines, and register a search command. |
| 3. Nested archive | Search a directory tree containing several matching files. | Add recursion and return paths and line numbers with results. |
| 4. Active credentials | Identify the current credential among backups and deployment records. | Parse records and connect evidence across files. |
| 5. Connected machines | Find a credential located somewhere on a small network. | Reuse the search tool through manual connections; earn scripted network access. |
| 6. Network discovery | Locate a target across a larger connected network. | Build a crawler, avoid duplicate visits, save observations, and display a generated map. |

## 13. Visual investigation levels

### 13.1 Traffic collector

A compromised machine gathers traffic from several nodes and forwards it outside the network. Identify it and stop the exfiltration while maintaining required services.

Available observations include connections, traffic direction, volume, and service identity. Useful player screens include connection-count bars, directed network maps, and traffic overlays.

### 13.2 Network isolation

Separate hostile machines by disabling a limited number of links while preserving specified friendly connections.

The player maps alternative routes, marks proposed changes, previews reachability, and applies the selected disconnections.

### 13.3 Service repair

Restore a failed application by inspecting service dependencies, logs, configuration, and health checks.

Failures propagate through dependencies. A dependency diagram and stored diagnostic results help locate the underlying fault. Repair actions include configuration changes and service restarts.

### 13.4 Conflicting records

Determine a shipment's actual destination from stale records, corrections, and timestamps from different machines.

The player builds parsers, normalizes timestamps, and displays a combined timeline retaining the source of each record.

## 14. Dynamic control levels

### 14.1 Thermal balancing

Operate a network of processing nodes and complete a workload within its deadlines.

- Processing creates heat.
- Nodes have different capacities and cooling rates.
- Transfers use links with limited bandwidth and take simulation time.
- High temperatures reduce processing speed.
- Severe overheating shuts down a node.

The player initially inspects temperatures and transfers jobs manually. Custom screens show temperature, processing load, transfer activity, queued jobs, and historical trends. Later, controllers recommend or execute transfers.

Subsequent versions introduce job priorities, cooling failures, and changing demand. These extend the player's scheduler and diagnostic screens.

### 14.2 Moving process

Track a process moving through the network on simulation ticks. Collect partial sightings, infer its movement rule, and prepare a trap at the correct location and tick.

Useful tools include log parsers, a sightings timeline, predicted locations, and a map distinguishing observed and inferred positions.

### 14.3 Coordinated update

Prepare changes on several machines and commit them within the required simulation step while respecting dependencies.

The player builds action queues, assertions, and a plan display. The objective checks the resulting system state and coordination constraints.

## 15. Intended player experience

Across the campaign, the player moves from individual commands to reusable functions, network tools, custom visualizations, and automated controllers.

Their home workstation records that progression visibly: a simple shell develops into a personal operating environment whose commands, screens, and behavior come from their own code.
