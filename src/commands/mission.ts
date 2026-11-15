import type { Command } from './command';
import type { CommandSystem } from './system';
import { missionGuide, nextSteps } from '../content/player-support';

function objectiveHelp(system: CommandSystem): string[] {
  const current = system.mission.current();
  if (!current) return ['Start with mission start deployment.'];
  if (current.status === 'complete')
    return [
      'This assignment is complete. Use mission to find the next assignment, or mission reset to replay it without extra rewards.',
    ];
  if (current.status === 'failed')
    return [
      'This attempt has ended. Use mission hint to review your approach, then mission reset to try again. Your home tools are kept.',
    ];
  return [
    current.requiresAnswer
      ? 'When you find the answer, use mission submit <answer> (submit the value, not the marker name).'
      : 'This objective completes automatically when its conditions are met; no answer submission is needed.',
    ...(['thermal', 'moving', 'coordination'].includes(current.kind)
      ? ['Time starts paused. Use simulation step to advance, or simulation resume for playback.']
      : []),
    `Stuck? mission hint gives a free clue. guide ${missionGuide(current.kind)} explains the tools.`,
  ];
}

function orientation(system: CommandSystem): string[] {
  const current = system.mission.current();
  if (current?.status === 'active')
    return [
      'Current assignment: ' + current.title + '. Use mission briefing for the objective.',
      ...(system.session.host() === 'home' ? ['Connect with ssh ' + current.entry + '.'] : []),
      'For a free clue use mission hint; for general help use guide stuck.',
    ];
  if (current?.status === 'failed')
    return [
      'Your mission is paused after a failure. Use mission hint to review your approach, then mission reset. Your home tools are kept.',
    ];
  return nextSteps(
    system.mission
      .list()
      .filter((item) => item.completed)
      .map((item) => item.id),
    system.upgrades
      .list()
      .filter((item) => item.owned)
      .map((item) => item.id),
    system.upgrades.tokens(),
  );
}

export const mission: Command = {
  name: 'mission',
  description: 'Browse and manage missions.',
  details:
    'List, start, or reset missions; read their briefing, hints, and status; submit an answer. Defaults to list. Resets preserve your workstation and hints are free.',
  usage: 'mission list | start <id> | reset | briefing | hint | submit <answer> | status',
  example: 'mission start deployment',
  execute(args, system) {
    const [action = 'list', ...parameters] = args;
    switch (action) {
      case 'list':
        if (parameters.length) break;
        return [
          ...system.mission
            .list()
            .map(
              (item) =>
                `${item.completed ? '✓' : item.available ? '→' : '·'} ${item.id.padEnd(14)} ${item.title} · ${item.reward} tokens`,
            ),
          '✓ completed; → available; · locked. Start an assignment with mission start <id>.',
          ...orientation(system),
        ];
      case 'start':
        if (parameters.length !== 1) break;
        return [system.mission.start(parameters[0]), ...objectiveHelp(system)];
      case 'reset':
        if (parameters.length) break;
        return [
          system.mission.reset(),
          'Remote systems reset; your home files, tools, and upgrades are kept.',
          ...objectiveHelp(system),
        ];
      case 'briefing':
        if (parameters.length) break;
        {
          const current = system.mission.current();
          return current
            ? [
                current.title,
                current.briefing,
                'Entry host: ' + current.entry + '. Connect with ssh ' + current.entry + '.',
                ...objectiveHelp(system),
              ]
            : ['Use mission to see assignments, then mission start deployment.'];
        }
      case 'hint':
        if (parameters.length) break;
        return [
          system.mission.current()?.hint ??
            'Start with mission start deployment. Use guide start for the basics.',
        ];
      case 'submit':
        if (parameters.length !== 1) break;
        return [system.mission.submit(parameters[0])];
      case 'status':
        if (parameters.length) break;
        return [JSON.stringify(system.mission.status(), null, 2)];
    }
    throw new Error('Usage: ' + mission.usage);
  },
};
