/// <reference lib="webworker" />
import { GameEngine } from './engine';
import { CampaignStorage, validateGameSave } from './save';
import type { GameRequest, GameResponse } from './protocol';
const storage = new CampaignStorage();
let engine: GameEngine | undefined,
  canSave = true,
  warning: string | undefined;
let queue = Promise.resolve();
let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;
function post(response: GameResponse) {
  self.postMessage(response);
}
async function persist() {
  if (!engine || !canSave) return;
  try {
    await storage.save(engine.snapshot());
    warning = undefined;
  } catch {
    warning =
      'Saving failed. Changes are temporary until a save succeeds. Use save export for a backup.';
  }
}
async function handle(request: GameRequest) {
  try {
    if (request.type === 'init') {
      let saved;
      try {
        saved = await storage.load();
      } catch {
        canSave = false;
        warning =
          'Could not read your save. Temporary session; the existing record is preserved. Import a backup to recover.';
      }
      engine?.dispose();
      engine = new GameEngine(saved);
      await engine.initialize();
      await persist();
      post({
        id: request.id,
        ok: true,
        view: engine.view(),
        entries: engine.shell.entries,
        warning,
      });
      return;
    }
    if (!engine) throw new Error('Workstation is loading.');
    const payload = request.payload as Record<string, unknown> | undefined;
    if (request.type === 'language') {
      const language = engine.languageTools(
        String(payload?.source ?? ''),
        String(payload?.path ?? '<terminal>'),
        Number(payload?.offset ?? 0),
        payload?.terminal === true,
      );
      post({ id: request.id, ok: true, language, warning });
      return;
    }
    let reply,
      resetTerminal = false;
    switch (request.type) {
      case 'command':
        reply = await engine.execute(String(request.payload));
        resetTerminal = !!reply.clearScreen;
        break;
      case 'openEditor':
        engine.openEditor(String(payload?.path), Number(payload?.line ?? 1));
        break;
      case 'editorDraft':
        if (engine.settings.editor) {
          const text = String(request.payload);
          if (text.length > 250000) throw new Error('Draft exceeds 250 KB.');
          engine.settings.editor.draft = text;
        }
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
      case 'export':
        post({ id: request.id, ok: true, save: engine.snapshot() });
        return;
      case 'import': {
        const replacement = new GameEngine(validateGameSave(request.payload));
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
      ...(resetTerminal ? { entries: engine.shell.entries } : {}),
    });
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      view: engine?.view(),
      warning,
    });
  }
}
self.onmessage = (event: MessageEvent<GameRequest>) => {
  queue = queue.then(() => handle(event.data));
};
