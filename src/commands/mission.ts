import { stringArguments, type Command } from './command';
import { bool, list, nothing, number, record, string } from '../runtime/types';
const levelType = record({
  id: string,
  title: string,
  group: string,
  stars: number,
  available: bool,
  prerequisite: string,
});
export const mission: Command = {
  name: 'mission',
  description: 'Choose levels and submit solutions.',
  usage:
    'mission [list [files|network] | start <id> | reset | leave | briefing | hint | status | submit <answer> | submit --script <path> [seed]]',
  details:
    'One star means solved; two means a script solves fresh cases. Hints do not affect stars. Programs may start and leave missions. Verification runs independently.',
  signatures: [
    { parameters: [], result: list(levelType) },
    { prefix: ['list'], parameters: [string], minimum: 0, result: list(levelType) },
    { prefix: ['start'], parameters: [string], result: nothing },
    ...['reset', 'leave'].map((word) => ({ prefix: [word], parameters: [], result: nothing })),
    ...['briefing', 'hint'].map((word) => ({ prefix: [word], parameters: [], result: string })),
    { prefix: ['status'], parameters: [], result: record({ id: string, status: string }) },
    {
      prefix: ['submit', '--script'],
      parameters: [string, number],
      minimum: 1,
      result: nothing,
      terminalOnly: true,
    },
    { prefix: ['submit'], parameters: [string], result: bool },
  ],
  async execute(args, system) {
    const action = args[0] ?? 'list',
      values = args.slice(1);
    switch (action) {
      case 'list': {
        const [group] = stringArguments(values);
        if (group && !['files', 'network'].includes(group))
          throw new Error('Usage: ' + mission.usage);
        return {
          value: system.mission
            .list(group)
            .map((m) => ({ ...m, prerequisite: m.prerequisite ?? '' })),
        };
      }
      case 'start':
        return { clearScreen: true, output: system.mission.start(stringArguments(values)[0]) };
      case 'reset':
        return { clearScreen: true, output: system.mission.reset() };
      case 'leave':
        return { clearScreen: true, output: system.mission.leave() };
      case 'briefing':
        return { value: system.mission.briefing().join('\n') };
      case 'hint':
        return { value: system.mission.hint() };
      case 'status': {
        const m = system.mission.current();
        return { value: { id: m?.id ?? '', status: m?.status ?? 'none' } };
      }
      case 'submit': {
        if (values[0] === '--script') {
          const seed = values[2];
          if (
            seed !== undefined &&
            (typeof seed !== 'number' ||
              !Number.isSafeInteger(seed) ||
              seed < 0 ||
              seed > 0xffffffff)
          )
            throw new Error('Seed must be an integer from 0 to 4294967295.');
          return {
            output: await system.mission.verify(values[1] as string, seed as number | undefined),
          };
        }
        const output = system.mission.submit(stringArguments(values)[0]);
        return { output, value: system.mission.current()?.status === 'complete' };
      }
    }
    throw new Error('Usage: ' + mission.usage);
  },
};
