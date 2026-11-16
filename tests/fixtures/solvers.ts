/** Complete solvers are test fixtures, never installed into the player's workspace. */
export const solver = `
export function main(ctx) {
  let release;
  try { release=JSON.parse(ctx.fs.read('/deploy/current.json')).release; } catch {}
  let answer;
  function scan(fs,path='/') {
    for(const entry of fs.list(path)) {
      if(entry.type==='directory') scan(fs,entry.path);
      else {
        const text=fs.read(entry.path);
        try {
          const record=JSON.parse(text);
          if(record.password && record.release===release) answer=record.password;
        } catch {
          if(text.includes('active=false')) continue;
          const match=text.match(/password=([^\\s]+)/i);
          if(match) answer=match[1];
        }
      }
    }
  }
  if(ctx.mission.status.id.startsWith('network')) {
    const visited=new Set();
    function visit(id) {
      if(visited.has(id)) return;
      visited.add(id);
      const host=ctx.network.connect(id);
      scan(host.fs);
      for(const next of host.neighbors()) visit(next);
    }
    visit(ctx.session.host);
  } else scan(ctx.fs);
  ctx.mission.submit(answer);
}`;
