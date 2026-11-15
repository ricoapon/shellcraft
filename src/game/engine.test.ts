import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions } from '../content/missions';
import { validateGameSave } from './save';

it('persists file deletion, including examples, and enforces remote write permissions', async () => {
  const game = new GameEngine();
  try {
    await game.execute('write /home/remove-me.txt temporary');
    expect((await game.execute('rm /home/remove-me.txt /home/scripts/search.js')).output).toEqual(
      [],
    );
    const restored = new GameEngine(validateGameSave(game.snapshot()));
    try {
      expect(() => restored.world.home.filesystem.stat('/home/remove-me.txt')).toThrow(
        'Path not found',
      );
      expect(() => restored.world.home.filesystem.stat('/home/scripts/search.js')).toThrow(
        'Path not found',
      );
    } finally {
      restored.dispose();
    }
    await game.execute('mission start deployment');
    await game.execute('ssh deploy');
    const before = game.world.host.filesystem.snapshot();
    expect((await game.execute('rm /notes/access.txt /notes/INDEX.txt')).output).toHaveLength(2);
    expect(game.world.host.filesystem.snapshot()).toEqual(before);
  } finally {
    game.dispose();
  }
});

it('plays the opening mission, retains tools across resets, and restores connections', async () => {
  const game = new GameEngine();
  try {
    await game.execute('mission start deployment');
    await game.execute('ssh deploy');
    expect((await game.execute('cat /notes/INDEX.txt')).output.join('')).toContain('aurora-7');
    await game.execute('mission submit copper-lantern');
    await game.execute('upgrade buy scripting');
    const restored = new GameEngine(game.snapshot());
    expect(restored.world.host.id).toBe('deploy');
    await restored.execute('exit');
    expect(restored.world.host.id).toBe('home');
    await restored.execute('mission reset');
    expect(restored.world.home.filesystem.readFile('/home/scripts/search.js')).toContain(
      'searchFiles',
    );
    restored.dispose();
  } finally {
    game.dispose();
  }
});

it('runs virtual imported scripts, restores startup commands, and replaces source registrations', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = ['deployment'];
    game.campaign.progress.unlocked = ['scripting', 'commands'];
    await game.execute('mission start archive');
    await game.execute('ssh vault');
    expect(
      (await game.execute('run /home/scripts/search.js RECOVERY_KEY /archive')).output.join(''),
    ).toContain('glass-orbit');
    expect((await game.execute('startup /home/startup.js')).output.join('')).toContain('Loaded');
    expect((await game.execute('find-text RECOVERY_KEY /archive')).output.join('')).toContain(
      'glass-orbit',
    );
    const restored = new GameEngine(game.snapshot());
    await restored.initialize();
    expect((await restored.execute('find-text RECOVERY_KEY /archive')).output.join('')).toContain(
      'glass-orbit',
    );
    restored.world.home.filesystem.writeFile(
      '/home/startup.js',
      'export function setup(ctx){ctx.commands.register("new-name",()=>ctx.print("new"));}',
    );
    await restored.execute('startup reload');
    expect((await restored.execute('find-text marker')).output.join('')).toContain(
      'Unknown command',
    );
    expect((await restored.execute('new-name')).output).toEqual(['new']);
    restored.dispose();
  } finally {
    game.dispose();
  }
});

it('crawls a discovered network without moving the interactive connection', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 5).map((m) => m.id);
    game.campaign.progress.unlocked = ['scripting', 'network'];
    await game.execute('mission start discovery');
    await game.execute('ssh mesh-0');
    const result = await game.execute('run /home/scripts/crawl.js TARGET_KEY');
    expect(result.output.join('')).toContain('violet-compass');
    expect(game.world.host.id).toBe('mesh-0');
    expect(Object.keys(game.campaign.progress.observations)).toHaveLength(8);
  } finally {
    game.dispose();
  }
});

it('protects remote files and forbids mutation from a screen render', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting', 'screens'];
    await game.execute('mission start deployment');
    await game.execute('ssh deploy');
    expect((await game.execute('write /notes/access.txt "fake"')).output.join('')).toContain(
      'Read-only',
    );
    game.world.home.filesystem.writeFile(
      '/home/screens/bad.js',
      'export function render(view){ctx.storage.set("oops",true);return view.text("bad");}',
    );
    await game.execute('screen add /home/screens/bad.js');
    expect(game.view().panels[0].error).toContain('read-only');
    expect(game.campaign.progress.playerData.oops).toBeUndefined();
  } finally {
    game.dispose();
  }
});

it('runs controllers against ticks and pauses when opening the editor', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = missions.slice(0, 10).map((m) => m.id);
    game.campaign.progress.unlocked = ['scripting', 'screens', 'telemetry', 'controllers'];
    await game.execute('mission start thermal');
    await game.execute('controller add /home/controllers/balance.js');
    await game.execute('simulation resume');
    game.openEditor('/home/controllers/balance.js');
    expect(game.campaign.active.paused).toBe(true);
    await game.execute('simulation step 35');
    expect(game.campaign.active.status).toBe('complete');
    expect(game.campaign.active.history.length).toBeGreaterThan(0);
  } finally {
    game.dispose();
  }
});

it('keeps explicit home and network handles independent of interactive directories', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.completed = ['deployment'];
    game.campaign.progress.unlocked = ['scripting', 'network'];
    await game.execute('mission start archive');
    await game.execute('ssh vault');
    await game.execute('cd /archive');
    game.world.home.filesystem.writeFile(
      '/home/scripts/handles.js',
      `export function main(ctx){
      ctx.print(ctx.network.connect(ctx.session.host).fs.list('.').map(e=>e.name));
      ctx.print(ctx.fs.list('.').length);
      ctx.session.connect('home');ctx.commands.invoke('cd',['/home/scripts']);
      ctx.print(ctx.home.list('.').some(e=>e.name==='README.md'));
    }`,
    );
    const reply = await game.execute('run /home/scripts/handles.js');
    expect(reply.output[0]).toBe('["archive"]');
    expect(Number(reply.output[1])).toBeGreaterThan(10);
    expect(reply.output[2]).toBe('true');
  } finally {
    game.dispose();
  }
});

it('does not bypass the scripted network unlock through interactive command APIs', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting'];
    await game.execute('mission start deployment');
    game.world.home.filesystem.writeFile(
      '/home/scripts/bypass.js',
      'export function main(ctx){ctx.commands.invoke("ssh",["deploy"]);}',
    );
    expect((await game.execute('run /home/scripts/bypass.js')).output.join('')).toContain(
      'Capability locked: network',
    );
    expect(game.world.host.id).toBe('home');
  } finally {
    game.dispose();
  }
});

it('keeps panel callbacks separate and applies their actions through the game API', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting', 'commands', 'screens'];
    game.world.home.filesystem.writeFile(
      '/home/screens/two.js',
      `export function setup(ctx){
      ctx.screens.register('first',view=>view.button({text:'First',onClick:()=>ctx.storage.set('clicked','first')}));
      ctx.screens.register('second',view=>view.button({text:'Second',onClick:()=>ctx.storage.set('clicked','second')}));
    }`,
    );
    await game.execute('startup /home/screens/two.js');
    const panels = game.view().panels;
    expect(panels).toHaveLength(2);
    game.interact('first', panels[0].view!.onClick!, null);
    expect(game.campaign.progress.playerData.clicked).toBe('first');
    game.interact('second', panels[1].view!.onClick!, null);
    expect(game.campaign.progress.playerData.clicked).toBe('second');
  } finally {
    game.dispose();
  }
});

it('bounds rejected input and oversized script output so the save stays loadable', async () => {
  const game = new GameEngine();
  try {
    const rejected = await game.execute('x'.repeat(5000));
    expect(rejected.output.join('')).toContain('Command is too long');
    expect(game.shell.entries[0].input).toHaveLength(4000);
    game.campaign.progress.unlocked = ['scripting'];
    game.world.home.filesystem.writeFile(
      '/home/scripts/large.js',
      'export function main(ctx){ctx.print("x".repeat(90000));}',
    );
    const result = await game.execute('run /home/scripts/large.js');
    expect(result.output.join('')).toContain('Output limit reached');
    expect(result.output.join('').length).toBeLessThan(10000);
  } finally {
    game.dispose();
  }
});

it('links script errors back to source paths containing spaces', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting'];
    game.world.home.filesystem.writeFile(
      '/home/my script.js',
      'export function main(ctx){\n throw new Error("example failure");\n}',
    );
    await game.execute('run "/home/my script.js"');
    expect(game.view().lastError?.path).toBe('/home/my script.js');
    expect(game.view().lastError?.line).toBe(2);
  } finally {
    game.dispose();
  }
});

it('exposes documentation and backups without redundant home-file or runtime commands', async () => {
  const game = new GameEngine();
  try {
    expect((await game.execute('guide')).output.join('')).toContain('Start here');
    expect((await game.execute('guide 1')).output.join('')).toContain('mission start deployment');
    expect((await game.execute('files /home/scripts')).output[0]).toContain('Unknown command');
    expect((await game.execute('save export')).action).toBe('export');
    expect((await game.execute('save import')).action).toBe('import');
    expect((await game.execute('runtime restart')).output[0]).toContain('Unknown command');
    game.campaign.progress.unlocked = ['screens'];
    await game.execute('screen layout tabs');
    expect(game.settings.layout).toBe('tabs');
    await game.execute('screen refresh 250');
    expect(game.settings.screenRefreshMs).toBe(250);
    expect((await game.execute('screen refresh 0')).output.join('')).toContain('100 to 60000');
  } finally {
    game.dispose();
  }
});
