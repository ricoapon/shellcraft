import type { VirtualFileSystem } from '../core/filesystem';

export const homeFiles: Record<string, string> = {
  '/home/README.md': `# Shellcraft workstation

Start with mission list, then mission start deployment and ssh deploy.
Use help for command discovery, help <command> for details, and mission briefing for the objective.
If you get stuck, mission hint gives a free clue and guide stuck explains common problems.
Search missions use mission submit <answer>; action missions finish automatically when their objective is met.
Earn tokens once per mission and spend them with upgrade buy <capability>.
Your files and workstation survive mission resets.

Run guide start for the basics or guide for the topic index and API reference. Starter code under /home is yours to edit.
edit /home/scripts/search.js opens Monaco. Ctrl+S saves/exits; Ctrl+Q discards/exits; Ctrl+Enter saves/exits/runs.
vim /home/scripts/search.js uses Vim: :w saves, :q quits, :q! discards, :wq or :x saves/quits, :run saves/quits/runs.
When working remotely, /home paths in edit/run always refer to your home computer.

Progression: scripting → commands → network → screens → telemetry → controllers.
Execution is free after unlock. Time, memory, API-call, and output limits protect the workstation.
Autocomplete is intentionally deferred.
`,
  '/home/lib/search.js': `// Reusable functions are imported from your home filesystem.
export function searchFiles(ctx, text, path = ".", fs = ctx.fs) {
  const results = [];
  function visit(directory) {
    for (const entry of fs.list(directory)) {
      if (entry.type === "directory") visit(entry.path);
      else fs.read(entry.path).split("\\n").forEach((line, index) => {
        if (line.includes(text)) results.push({path:entry.path,lineNumber:index+1,text:line});
      });
    }
  }
  visit(path);
  return results;
}
`,
  '/home/scripts/search.js': `import { searchFiles } from "/home/lib/search.js";

export function main(ctx, args) {
  const [text = "KEY", path = "/archive"] = args;
  const matches = searchFiles(ctx, text, path);
  for (const match of matches) ctx.print(match.path + ":" + match.lineNumber + ": " + match.text);
  ctx.storage.set("lastSearch", matches);
  ctx.print(matches.length + " matches");
}
`,
  '/home/scripts/crawl.js': `import { searchFiles } from "/home/lib/search.js";

export function main(ctx, args) {
  const marker = args[0] ?? "TARGET_KEY";
  const visited = new Set();
  function visit(id) {
    if (visited.has(id) || id === "home") return;
    visited.add(id);
    const host = ctx.network.connect(id);
    host.inspect();
    for (const match of searchFiles(ctx, marker, "/", host.fs)) {
      ctx.print(id + ":" + match.path + ":" + match.lineNumber + ": " + match.text);
    }
    for (const neighbor of host.neighbors()) visit(neighbor);
  }
  visit(ctx.session.host);
  ctx.storage.set("visited", [...visited]);
  ctx.print("Visited " + visited.size + " hosts. Your interactive session did not move.");
}
`,
  '/home/startup.js': `import { searchFiles } from "/home/lib/search.js";

export function setup(ctx) {
  ctx.commands.register("find-text", args => {
    const [text = "KEY", path = "/"] = args;
    for (const match of searchFiles(ctx, text, path)) {
      ctx.print(match.path + ":" + match.lineNumber + ": " + match.text);
    }
  }, {description:"Recursively search game files.", usage:'find-text <text> [path]'});
  ctx.commands.register("home", () => ctx.session.connect("home"), {description:"Return to the home computer."});
}
`,
  '/home/screens/network.js': `export function render(view, observations) {
  return view.stack(
    view.text({title:"Collected network", text:"Click a discovered node to inspect it. Stale observations are dimmed."}),
    view.networkGraph({
      nodes: observations.nodes.map(n => ({id:n.id,label:n.name,color:n.stale?"#66706a":"#8fdbab"})),
      edges: observations.nodes.flatMap(n => n.connections.map(to => ({source:n.id,target:to}))),
      onSelect: id => { ctx.inspect(id); ctx.print("Inspected " + id); }
    }),
    view.barChart({title:"Outgoing connections", data:observations.nodes.map(n=>({id:n.id,label:n.name,value:n.connections.length}))})
  );
}
`,
  '/home/screens/telemetry.js': `export function render(view, observations) {
  return view.stack(
    view.barChart({title:"Temperature", data:observations.nodes.map(n=>({id:n.id,label:n.name,value:n.temperature}))}),
    view.table({title:"Processing nodes", data:observations.nodes.map(n=>({id:n.id,load:Number(n.load.toFixed(1)),temperature:Number(n.temperature.toFixed(1)),online:n.online}))}),
    view.lineChart({title:"Temperature history", data:observations.history.map(h=>({x:h.tick,y:h.nodes[0]?.temperature??0}))}),
    view.table({title:"Jobs and priorities",data:observations.jobs.map(job=>({id:job.id,host:job.host,remaining:Number(job.remaining.toFixed(1)),priority:job.priority,deadline:job.deadline}))}),
    view.text({title:"Previous action results",text:observations.results.join("\\n")||"No actions yet."})
  );
}
`,
  '/home/screens/search.js': `export function render(view) {
  return view.table({title:"Last search results",data:ctx.storage.get("lastSearch",[])});
}
`,
  '/home/screens/dependencies.js': `export function render(view, observations) {
  return view.stack(
    view.mermaid({title:"Service dependencies",text:"graph LR\\n  frontend --> api\\n  api --> db"}),
    view.table({title:"Observed service health",data:observations.nodes.map(n=>({id:n.id,service:n.service,stale:!!n.stale}))})
  );
}
`,
  '/home/controllers/balance.js': `// Controllers receive the same tick snapshot. Return actions; do not loop forever.
export function control(state) {
  const nodes = state.nodes.filter(n => n.online && n.id.startsWith("compute-"));
  if (nodes.length < 2) return [];
  const hot = [...nodes].sort((a,b)=>b.load-a.load)[0];
  const idle = [...nodes].sort((a,b)=>a.load-b.load)[0];
  if (hot.load - idle.load < 20) return [];
  return [{type:"transfer",from:hot.id,to:idle.id,amount:Math.floor((hot.load-idle.load)/2)}];
}
`,
  '/home/controllers/update.js': `export function control(state) {
  if (state.tick !== 1) return [];
  return ["database","api-node","web-node"].map(host=>({type:"commit",host}));
}
`,
};

export function installHomeFiles(filesystem: VirtualFileSystem): void {
  for (const [path, content] of Object.entries(homeFiles)) {
    try {
      filesystem.stat(path);
      continue;
    } catch {
      /* Install only missing examples. Never overwrite player code. */
    }
    let parent = '';
    let blocked = false;
    for (const segment of path.split('/').slice(1, -1)) {
      parent += `/${segment}`;
      try {
        if (filesystem.stat(parent).type !== 'directory') {
          blocked = true;
          break;
        }
      } catch {
        filesystem.mkdir(parent);
      }
    }
    if (!blocked) filesystem.writeFile(path, content);
  }
}
