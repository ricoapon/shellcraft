import { requireArguments, type Command } from './command';
import { guideSections } from '../content/guide';

export const guide: Command = {
  name: 'guide',
  usage: 'guide [topic|all]',
  description: 'Read the operator guide.',
  details: 'Read the operator guide and JavaScript API reference in the terminal.',
  execute(args) {
    requireArguments(args, 0, guide.usage!, 1);
    if (!args.length)
      return [
        'OPERATOR GUIDE',
        ...guideSections.map(
          (section, index) => `${index + 1}. ${section.title} — guide ${section.id}`,
        ),
        'Read a topic with guide <topic> or guide <number>, or use guide all. Not sure what to do? Try guide stuck.',
      ];
    const selected =
      args[0] === 'all'
        ? [...guideSections]
        : guideSections.filter(
            (section, index) =>
              section.id === args[0].toLowerCase() ||
              String(index + 1) === args[0] ||
              section.title.toLowerCase() === args[0].toLowerCase(),
          );
    if (!selected.length) throw new Error('Unknown guide section. Run guide for the index.');
    return selected.map(
      (section) =>
        `${section.title}\n${section.text}${'code' in section ? '\n' + section.code : ''}`,
    );
  },
};
