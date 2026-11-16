import type { Command } from './command';
import type { CommandSystem } from './system';
function orientation(system: CommandSystem): string[] {
  const current = system.mission.current();
  if (current?.status === 'active')
    return [`Current level: ${current.id}. Use mission briefing or mission hint.`];
  const levels = system.mission.list();
  const choices = ['files', 'network'].flatMap((group) => {
    const next = levels.find(
      (level) => level.group === group && level.available && level.stars === 0,
    );
    return next ? [`Next in ${group}: mission start ${next.id} — ${next.title}.`] : [];
  });
  return choices.length
    ? choices
    : [
        'Both branches complete. Return for optional automation stars or experiment with your tools.',
      ];
}
export const mission: Command = {
  name: 'mission',
  description: 'Choose levels and submit solutions.',
  usage:
    'mission [list [files|network] | start <id> | reset | leave | briefing | hint | status | submit <answer> | submit --script <path> [seed]]',
  details:
    'One star means solved; two means your program solves fresh instances without manual intervention. Hints are free and do not affect stars. Submit scripts exporting main(ctx,args), using ctx.mission.submit(value). An optional seed replays one practice case without awarding stars. Leaving discards the current instance, keeping your files and best stars.',
  example: 'mission start files-1',
  execute(args, system) {
    const [action = 'list', ...values] = args;
    switch (action) {
      case 'list':
        if (values.length > 1 || (values[0] && !['files', 'network'].includes(values[0]))) break;
        return [
          'FILES & NETWORKING',
          ...system.mission
            .list(values[0])
            .map(
              (m) =>
                `${m.available ? '→' : '·'} ${m.id.padEnd(12)} ${'★'.repeat(m.stars)}${'☆'.repeat(2 - m.stars)} ${m.title}${m.available ? '' : ` (complete ${m.prerequisite})`}`,
            ),
          '★ solved · ★★ automated. Automation stars are optional. Start with mission start <id>.',
          ...orientation(system),
        ];
      case 'start':
        if (values.length === 1)
          return { clearScreen: true, output: system.mission.start(values[0]) };
        break;
      case 'reset':
        if (!values.length) return { clearScreen: true, output: system.mission.reset() };
        break;
      case 'leave':
        if (!values.length) return { clearScreen: true, output: system.mission.leave() };
        break;
      case 'briefing':
        if (!values.length) return system.mission.briefing();
        break;
      case 'hint':
        if (!values.length) return [system.mission.hint()];
        break;
      case 'status':
        if (!values.length) return [JSON.stringify(system.mission.status(), null, 2)];
        break;
      case 'submit':
        if (values[0] === '--script' && (values.length === 2 || values.length === 3)) {
          const seed = values[2] === undefined ? undefined : Number(values[2]);
          if (
            seed !== undefined &&
            (!/^\d+$/.test(values[2]) || !Number.isSafeInteger(seed) || seed > 0xffffffff)
          )
            throw new Error('Seed must be an integer from 0 to 4294967295.');
          return system.mission.verify(values[1], seed);
        }
        if (values.length === 1 && values[0] !== '--script')
          return system.mission.submit(values[0]);
        break;
    }
    throw new Error('Usage: ' + mission.usage);
  },
};
