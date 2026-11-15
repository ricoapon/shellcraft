import { expect, it } from 'vitest';
import { guideSections } from './guide';
import { missions, upgrades } from './missions';
import { capabilityHelp, missionGuide, nextSteps, welcomeMessage } from './player-support';

it('offers an entry point without sending returning players back to the first mission', () => {
  expect(welcomeMessage().join('\n')).toContain('mission start deployment');
  expect(welcomeMessage(true).join('\n')).not.toContain('mission start deployment');
  expect(welcomeMessage(true).join('\n')).toContain('current assignment');
});

it('names the next assignment and only suggests affordable, eligible, unowned upgrades', () => {
  expect(nextSteps([], [], 99).join('\n')).toContain('mission start deployment');
  expect(nextSteps([], [], 99).join('\n')).not.toContain('upgrade buy');
  expect(nextSteps(['deployment'], [], 3).join('\n')).toContain('upgrade buy scripting');
  expect(nextSteps(['deployment'], [], 1).join('\n')).not.toContain('upgrade buy');
  expect(nextSteps(['deployment'], ['scripting'], 3).join('\n')).not.toContain(
    'upgrade buy scripting',
  );
  expect(nextSteps(['deployment'], ['scripting'], 3).join('\n')).toContain('mission start archive');
  expect(
    nextSteps(
      missions.map((m) => m.id),
      upgrades.map((u) => u.id),
      99,
    ).join('\n'),
  ).toContain('CAMPAIGN COMPLETE');
});

it('provides valid guide destinations for every mission and capability without revealing answers', () => {
  const topics = guideSections.map((section) => section.id);
  for (const mission of missions) expect(topics).toContain(missionGuide(mission.kind));
  for (const upgrade of upgrades) {
    expect(capabilityHelp[upgrade.id]).toBeTruthy();
    for (const match of capabilityHelp[upgrade.id].matchAll(/guide (\w+)/g))
      expect(topics).toContain(match[1]);
  }
  const support = [
    ...welcomeMessage(),
    ...Object.values(capabilityHelp),
    ...guideSections.map((section) => section.text),
  ].join('\n');
  for (const mission of missions) if (mission.answer) expect(support).not.toContain(mission.answer);
});
