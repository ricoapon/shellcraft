import { expect, it } from 'vitest';
import { welcomeMessage } from './player-support';
import { missions } from './missions';
import { guideSections } from './guide';
it('explains temporary terminal output and the branching progression', () => {
  expect(welcomeMessage().join()).toContain('files-1');
  expect(welcomeMessage().join()).toContain('temporary');
  expect(guideSections.map((s) => s.id)).toContain('automation');
  for (const mission of missions)
    if (mission.prerequisite)
      expect(missions.some((m) => m.id === mission.prerequisite)).toBe(true);
});
