import { stringArguments, type Command } from './command';
import { list, string } from '../runtime/types';
import { guideSections } from '../content/guide';
export const guide: Command = {
  name: 'guide',
  usage: 'guide [topic|all]',
  description: 'Read the operator guide.',
  signatures: [
    {
      completion: [{ kind: 'choices', values: ['all', ...guideSections.map((s) => s.id)] }],
      parameters: [string],
      minimum: 0,
      result: list(string),
    },
  ],
  execute(args) {
    const [topic] = stringArguments(args);
    if (!topic)
      return {
        value: [
          'OPERATOR GUIDE',
          ...guideSections.map((s, i) => `${i + 1}. ${s.title} — guide ${s.id}`),
          'Read guide <topic> or guide all. Try guide stuck for troubleshooting.',
        ],
      };
    const selected =
      topic === 'all'
        ? [...guideSections]
        : guideSections.filter(
            (s, i) =>
              s.id === topic.toLowerCase() ||
              String(i + 1) === topic ||
              s.title.toLowerCase() === topic.toLowerCase(),
          );
    if (!selected.length) throw new Error('Unknown guide section. Run guide for the index.');
    return {
      value: selected.map((s) => s.title + '\n' + s.text + ('code' in s ? '\n' + s.code : '')),
    };
  },
};
