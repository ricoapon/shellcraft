import { missions, upgrades } from './missions';
import type { MissionKind } from './missions';

export function welcomeMessage(returning = false): string[] {
  return [
    returning ? 'Welcome back to Shellcraft.' : 'Welcome to Shellcraft.',
    'Explore simulated computers, solve missions, and build your own scripts and tools.',
    'Mission rewards buy permanent programming upgrades. Running your tools costs no tokens.',
    returning
      ? 'Use mission to pick up your current assignment or find the next one.'
      : 'Start with mission to see assignments, then mission start deployment.',
    'help lists available commands; help <command> explains one.',
    'Not sure what to do? Try mission briefing, mission hint, or guide start.',
    'Your progress and home files are saved in this browser.',
  ];
}

export const capabilityHelp: Record<string, string> = {
  scripting:
    'New tool: run. Try help run, then edit /home/scripts/search.js. guide scripts explains modules and imports.',
  commands:
    'New tool: startup. Read /home/startup.js with edit, then use startup /home/startup.js. guide commands explains registration and reloading.',
  network:
    'Your scripts can now connect to discovered hosts without moving the terminal. See /home/scripts/crawl.js and guide api.',
  screens:
    'New tool: screen. Collect observations with neighbors and inspect, then try screen add /home/screens/network.js. See guide screens.',
  telemetry:
    'Simulation ticks now retain measurement history. A custom screen can display it; guide simulation explains observations and history.',
  controllers:
    'New tool: controller. In a simulation mission, try controller add /home/controllers/balance.js, then simulation step. See guide simulation.',
};

export function nextSteps(
  completed: readonly string[],
  unlocked: readonly string[],
  tokens: number,
): string[] {
  const next = missions.find(
    (mission, index) =>
      !completed.includes(mission.id) &&
      (index === 0 || completed.includes(missions[index - 1].id)),
  );
  const purchasable = upgrades.find(
    (upgrade) =>
      !unlocked.includes(upgrade.id) && completed.length >= upgrade.after && tokens >= upgrade.cost,
  );
  const lines: string[] = [];
  if (purchasable)
    lines.push(
      `Upgrade available: upgrade buy ${purchasable.id} (${purchasable.cost} tokens). Use upgrade list to compare tools.`,
    );
  if (next) lines.push(`Next assignment: mission start ${next.id} — ${next.title}.`);
  else
    lines.push(
      'CAMPAIGN COMPLETE. You have completed all 15 assignments. Use mission list to replay them with your own tools.',
    );
  return lines;
}

export function missionGuide(kind: MissionKind): string {
  if (kind === 'thermal' || kind === 'moving' || kind === 'coordination') return 'simulation';
  if (kind === 'service') return 'stuck';
  if (kind === 'traffic' || kind === 'isolation') return 'screens';
  if (kind === 'records') return 'api';
  return 'start';
}
