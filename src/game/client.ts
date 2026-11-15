import type { GameResponse, RequestType } from './protocol';

export class GameClient {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private id = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: GameResponse) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(onUpdate: (response: GameResponse) => void) {
    this.worker.onmessage = (event: MessageEvent<GameResponse>) => {
      const response = event.data;
      onUpdate(response);
      if (response.id !== undefined) {
        const pending = this.pending.get(response.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        if (response.ok) pending.resolve(response);
        else pending.reject(new Error(response.error ?? 'Workstation request failed.'));
      }
    };
    this.worker.onerror = (event) => {
      onUpdate({
        ok: false,
        error: event.message || 'Game worker failed to start. Reload the workstation.',
      });
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Game worker stopped.'));
      }
      this.pending.clear();
    };
  }

  request(type: RequestType, payload?: unknown): Promise<GameResponse> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error('Workstation request timed out. Reload the page to recover your last save.'),
        );
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, payload });
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Workstation closed.'));
    }
    this.pending.clear();
  }
}
