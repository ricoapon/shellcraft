import type { Command } from './command';

export const simulation: Command = {
  name: 'simulation',
  description: 'Control simulation playback.',
  details:
    'Pause, resume, advance exact ticks, or choose playback speed. Defaults to status. Stepping pauses playback. Opening the editor pauses the simulation; resume it explicitly afterward.',
  usage: 'simulation status | pause | resume | step [count] | speed <0.5|1|2|4>',
  example: 'simulation step 10',
  unlocked: (system) =>
    ['thermal', 'moving', 'coordination'].includes(system.mission.current()?.kind ?? ''),
  execute(args, system) {
    const [action = 'status', ...parameters] = args;
    switch (action) {
      case 'status':
        if (parameters.length) break;
        return [JSON.stringify(system.simulation.state(), null, 2)];
      case 'pause':
        if (parameters.length) break;
        system.simulation.pause();
        return ['Simulation paused.'];
      case 'resume':
        if (parameters.length) break;
        system.simulation.resume();
        return ['Simulation running.'];
      case 'step':
        if (parameters.length > 1) break;
        system.simulation.pause();
        return system.simulation.step(Number(parameters[0] ?? 1));
      case 'speed':
        if (parameters.length !== 1) break;
        system.simulation.speed(Number(parameters[0]));
        return ['Speed ' + parameters[0] + '×.'];
    }
    throw new Error('Usage: ' + simulation.usage);
  },
};
