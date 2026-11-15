import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { missions } from '../content/missions';

it('groups listing, briefings, hints, answers, status, and resets under mission', async () => {
  const game = new GameEngine();
  try {
    expect((await game.execute('mission')).output).toEqual(
      (await game.execute('mission list')).output,
    );
    expect((await game.execute('mission list')).output.join('\n')).toContain('deployment');
    await game.execute('mission start deployment');
    expect((await game.execute('mission briefing')).output.join('\n')).toContain('fifteen notes');
    expect((await game.execute('mission hint')).output.join('\n')).toContain('/notes/INDEX.txt');
    expect(JSON.parse((await game.execute('mission status')).output[0]).status).toBe('active');
    await game.execute('mission submit copper-lantern');
    expect(game.campaign.active.status).toBe('complete');
    await game.execute('mission reset');
    expect(game.campaign.active.status).toBe('active');
    expect(game.campaign.progress.completed).toEqual(['deployment']);
  } finally {
    game.dispose();
  }
});

it('lists and buys upgrades through one command without charging twice', async () => {
  const game = new GameEngine();
  try {
    expect((await game.execute('upgrade')).output).toEqual(
      (await game.execute('upgrade list')).output,
    );
    expect((await game.execute('upgrade list')).output[0]).toBe('0 tokens available.');
    await game.execute('mission start deployment');
    await game.execute('mission submit copper-lantern');
    await game.execute('upgrade buy scripting');
    expect(game.campaign.progress.unlocked).toEqual(['scripting']);
    expect(game.campaign.progress.tokens).toBe(1);
    expect((await game.execute('upgrade list')).output.join('\n')).toContain('✓ scripting');
    expect((await game.execute('upgrade buy scripting')).output.join('\n')).toContain(
      'already unlocked',
    );
    expect(game.campaign.progress.tokens).toBe(1);
    expect((await game.execute('help upgrade')).output[0]).toContain('buy <capability>');
  } finally {
    game.dispose();
  }
});

it.each([
  'mission list extra',
  'mission start',
  'mission reset extra',
  'mission briefing extra',
  'mission hint extra',
  'mission submit',
  'mission status extra',
  'mission unknown',
  'upgrade list extra',
  'upgrade buy',
  'upgrade buy scripting extra',
  'upgrade unknown',
])('rejects malformed concept commands: %s', async (command) => {
  const game = new GameEngine();
  try {
    expect((await game.execute(command)).output[0]).toMatch(/^Usage: (mission|upgrade) /);
    expect(game.campaign.progress.active).toBeUndefined();
    expect(game.campaign.progress.tokens).toBe(0);
    expect(game.campaign.progress.unlocked).toEqual([]);
  } finally {
    game.dispose();
  }
});

it('advertises only the canonical concept commands and removes the former aliases', async () => {
  const game = new GameEngine();
  try {
    const commands = (await game.execute('help')).output.map((line) => line.split(/\s+/)[0]);
    expect(commands).toContain('mission');
    expect(commands).toContain('upgrade');
    for (const command of [
      'missions',
      'upgrades',
      'unlock',
      'briefing',
      'hint',
      'submit',
      'status',
    ]) {
      expect(commands).not.toContain(command);
      expect((await game.execute(command)).output[0]).toContain(`Unknown command: ${command}`);
    }
  } finally {
    game.dispose();
  }
});

it('reveals command help after buying capabilities and keeps overview descriptions brief', async () => {
  const game = new GameEngine();
  try {
    const initial = (await game.execute('help')).output;
    for (const name of ['run', 'startup', 'screen', 'controller']) {
      expect(initial.some((line) => line.startsWith(name + ' '))).toBe(false);
      expect((await game.execute('help ' + name)).output[0]).toContain('Unknown command');
    }
    expect(initial.find((line) => line.startsWith('rm '))).toBe('rm — Delete files.');
    expect(initial.at(-1)).toBe('Run help <command> for more information.');
    expect((await game.execute('help rm')).output.join('\n')).toContain('Use --');
    expect((await game.execute('run /home/scripts/search.js')).output[0]).toContain(
      'Command locked',
    );
    await game.execute('mission start deployment');
    await game.execute('mission submit copper-lantern');
    await game.execute('upgrade buy scripting');
    const unlocked = (await game.execute('help')).output;
    expect(unlocked).toContain('run — Run a saved script.');
    expect(unlocked.some((line) => line.startsWith('startup '))).toBe(false);
    expect((await game.execute('help run')).output[0]).toBe('Usage: run <home-path> [args...]');
    await game.execute('mission start archive');
    await game.execute('mission submit glass-orbit');
    await game.execute('upgrade buy commands');
    await game.execute('startup /home/startup.js');
    expect((await game.execute('help find-text')).output[0]).toContain('find-text <text>');
    game.world.home.filesystem.writeFile(
      '/home/reserved.js',
      'export function setup(ctx){ctx.commands.register("screen",()=>{});}',
    );
    expect((await game.execute('startup /home/reserved.js')).output.join('\n')).toContain(
      'Reserved or invalid command name: screen',
    );
  } finally {
    game.dispose();
  }
});

it('keeps only the simulation concept command for playback controls', async () => {
  const game = new GameEngine();
  try {
    expect((await game.execute('help simulation')).output[0]).toContain('Unknown command');
    game.campaign.progress.completed = missions.slice(0, 10).map((mission) => mission.id);
    await game.execute('mission start thermal');
    expect((await game.execute('help simulation')).output[0]).toContain('simulation status');
    await game.execute('simulation speed 2');
    await game.execute('simulation resume');
    expect(JSON.parse((await game.execute('simulation')).output[0])).toMatchObject({
      paused: false,
      speed: 2,
      tick: 0,
    });
    await game.execute('simulation step 2');
    expect(JSON.parse((await game.execute('simulation status')).output[0])).toMatchObject({
      paused: true,
      speed: 2,
      tick: 2,
    });
    expect((await game.execute('simulation step 2 extra')).output[0]).toContain(
      'Usage: simulation',
    );
    expect((await game.execute('simulation speed 999')).output[0]).toContain('Choose speed');
    for (const command of ['files', 'runtime', 'pause', 'resume', 'step', 'speed']) {
      expect((await game.execute(command)).output[0]).toContain('Unknown command');
    }
  } finally {
    game.dispose();
  }
});
