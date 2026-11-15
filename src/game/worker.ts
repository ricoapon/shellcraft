/// <reference lib="webworker" />
import { GameEngine } from './engine';
import { CampaignStorage, validateGameSave } from './save';
import type { GameRequest, GameResponse } from './protocol';
import { welcomeMessage } from '../content/player-support';

const storage = new CampaignStorage();
let engine: GameEngine | undefined;
let canSave = true;
let warning: string | undefined;
let queue = Promise.resolve();
let lastTick = performance.now();
let lastScreenRefresh = lastTick;
let timerPending = false;
let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;

function post(response: GameResponse) {
  self.postMessage(response);
}
function safeView() {
  try {
    return engine?.view();
  } catch {
    return undefined;
  }
}
async function persist() {
  if (!engine || !canSave) return;
  try {
    await storage.save(engine.snapshot());
    warning = undefined;
  } catch {
    warning =
      'Saving failed. Changes are temporary until a later save succeeds. Use save export for a backup.';
  }
}

async function handle(request: GameRequest): Promise<void> {
  try {
    if (request.type === 'init') {
      let saved;
      try {
        saved = await storage.load();
      } catch {
        canSave = false;
        warning =
          'Could not read your save. Temporary session only; the existing record is preserved. You can import a backup.';
      }
      engine = new GameEngine(saved);
      await engine.initialize();
      if (!engine.settings.supportVersion) {
        engine.shell = {
          entries: [
            ...engine.shell.entries,
            {
              input: '[welcome]',
              output: [
                welcomeMessage(
                  !!engine.campaign.progress.active ||
                    engine.campaign.progress.completed.length > 0,
                ).join('\n'),
              ],
              workingDirectory: engine.world.session.workingDirectory,
              host: engine.world.host.id,
            },
          ].slice(-200),
        };
        engine.settings.supportVersion = 1;
        await persist();
      }
      post({
        id: request.id,
        ok: true,
        view: engine.view(),
        entries: engine.shell.entries,
        warning,
      });
      return;
    }
    if (!engine) throw new Error('Workstation is still loading.');
    const payload = request.payload as Record<string, unknown> | undefined;
    let reply;
    let resetTerminal = false;
    switch (request.type) {
      case 'command':
        reply = await engine.execute(String(request.payload));
        break;
      case 'openEditor':
        engine.openEditor(String(payload?.path), Number(payload?.line ?? 1));
        break;
      case 'editorDraft':
        if (engine.settings.editor) engine.settings.editor.draft = String(request.payload);
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(() => {
          queue = queue.then(persist);
        }, 400);
        post({ id: request.id, ok: true });
        return;
      case 'saveEditor':
        engine.saveEditor(String(request.payload));
        break;
      case 'closeEditor':
        await engine.closeEditor(
          (payload?.action ?? 'discard') as 'save' | 'discard' | 'run',
          payload?.text === undefined ? undefined : String(payload.text),
        );
        resetTerminal = true;
        break;
      case 'layout':
        engine.settings.layout = request.payload === 'tabs' ? 'tabs' : 'split';
        break;
      case 'activePanel':
        engine.settings.activePanel = String(request.payload);
        break;
      case 'interact':
        engine.interact(String(payload?.panel), String(payload?.handler), payload?.value);
        break;
      case 'export':
        post({ id: request.id, ok: true, save: engine.snapshot() });
        return;
      case 'import': {
        const snapshot = validateGameSave(request.payload);
        const replacement = new GameEngine(snapshot);
        await replacement.initialize();
        engine.dispose();
        engine = replacement;
        canSave = true;
        warning = undefined;
        resetTerminal = true;
        break;
      }
    }
    await persist();
    post({
      id: request.id,
      ok: true,
      view: engine.view(),
      reply,
      warning,
      ...(resetTerminal || request.type === 'interact' ? { entries: engine.shell.entries } : {}),
    });
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      view: safeView(),
      warning,
    });
  }
}

self.onmessage = (event: MessageEvent<GameRequest>) => {
  queue = queue.then(() => handle(event.data));
};

setInterval(() => {
  const active = engine?.campaign.progress.active;
  if (!engine || !active || active.paused || active.status !== 'active' || timerPending) {
    if (!timerPending) lastTick = lastScreenRefresh = performance.now();
    return;
  }
  const now = performance.now();
  const advanceTick = now - lastTick >= 1000 / active.speed;
  const refreshScreens =
    engine.settings.panels.length > 0 &&
    now - lastScreenRefresh >= (engine.settings.screenRefreshMs ?? 1000);
  if (!advanceTick && !refreshScreens) return;
  timerPending = true;
  if (advanceTick) lastTick = now;
  lastScreenRefresh = now;
  queue = queue.then(async () => {
    try {
      if (engine?.campaign.progress.active?.paused === false) {
        let notice: readonly string[] | undefined;
        if (advanceTick) {
          notice = engine.advancePlayback();
          await persist();
        }
        post({ ok: true, view: engine.view(), warning, ...(notice?.length ? { notice } : {}) });
      }
    } catch (error) {
      if (engine?.campaign.progress.active) engine.campaign.active.paused = true;
      post({ ok: false, error: String(error), view: safeView() });
    } finally {
      timerPending = false;
    }
  });
}, 100);
