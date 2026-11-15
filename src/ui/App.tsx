import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GameClient } from '../game/client';
import type { EngineReply, EngineView } from '../game/engine';
import type { RequestType } from '../game/protocol';
import type { TranscriptEntry } from '../core/shell';
import { Terminal } from './Terminal';
import type { TerminalHandle } from './Terminal';

const Editor = lazy(() => import('./editor/Editor'));
const ScreenRenderer = lazy(() => import('./Screens'));

class PanelBoundary extends Component<
  { children: ReactNode; label?: string; onClose?: () => void },
  { error?: string }
> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div
        className="error-message"
        tabIndex={this.props.onClose ? 0 : undefined}
        ref={(element) => {
          if (this.props.onClose) element?.focus();
        }}
        onKeyDown={(event) => {
          if (
            this.props.onClose &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'q'
          ) {
            event.preventDefault();
            this.props.onClose();
          }
        }}
      >
        <pre>
          {this.props.label ?? 'Screen'} display failed: {this.state.error}. Close and reopen it
          after fixing the problem.
        </pre>
        {this.props.onClose && <p>Ctrl+Q exit without saving</p>}
      </div>
    ) : (
      this.props.children
    );
  }
}

export function App() {
  const client = useRef<GameClient | null>(null);
  const terminal = useRef<TerminalHandle | null>(null);
  const location = useRef({ host: 'home', directory: '/home' });
  const importInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<EngineView>();
  const [entries, setEntries] = useState<readonly TranscriptEntry[]>();
  const [terminalVersion, setTerminalVersion] = useState(0);
  const [failure, setFailure] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let disposed = false;
    setEntries(undefined);
    setView(undefined);
    setFailure('');
    const instance = new GameClient((response) => {
      if (disposed) return;
      if (response.view) {
        location.current = { host: response.view.host, directory: response.view.directory };
        setView(response.view);
      }
      if (response.entries) {
        setEntries(response.entries);
        setTerminalVersion((version) => version + 1);
      }
      if (response.notice) terminal.current?.write(response.notice);
      if (response.warning !== undefined) setWarning(response.warning);
      else if (response.ok) setWarning('');
      if (!response.ok && response.error && response.id === undefined) setFailure(response.error);
    });
    client.current = instance;
    instance.request('init').catch((error) => {
      if (!disposed) setFailure(String(error));
    });
    return () => {
      disposed = true;
      instance.dispose();
      client.current = null;
    };
  }, []);

  async function request(type: RequestType, payload?: unknown) {
    if (!client.current) throw new Error('Workstation is still loading.');
    return client.current.request(type, payload);
  }
  function send(type: RequestType, payload?: unknown) {
    void request(type, payload).catch((error) => setFailure(String(error)));
  }
  async function exportSave() {
    const response = await request('export');
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ format: 'shellcraft', version: 3, state: response.save }, null, 2)],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `shellcraft-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSave(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error('Save file exceeds 20 MB.');
      const data = JSON.parse(await file.text());
      if (data.format !== 'shellcraft' || data.version !== 3)
        throw new Error('Select an exported Shellcraft save.');
      await request('import', data.state);
      setFailure('');
    } catch (error) {
      setFailure(String(error));
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  }
  async function command(input: string): Promise<EngineReply> {
    setFailure('');
    const response = await request('command', input);
    const reply = response.reply!;
    if (reply.action === 'export') await exportSave();
    if (reply.action === 'import') importInput.current?.click();
    return reply;
  }

  const panels =
    view?.panels.filter(
      (panel) =>
        view.settings.layout !== 'tabs' ||
        panel.id === (view.settings.activePanel ?? view.panels[0]?.id),
    ) ?? [];
  return (
    <main className="workstation">
      <div className="terminal-window">
        <header className="window-titlebar">
          <h1>Shellcraft</h1>
        </header>
        {(failure || warning) && (
          <pre className="storage-error" role="alert">
            {failure || warning}
          </pre>
        )}
        <input
          hidden
          ref={importInput}
          type="file"
          accept=".json,application/json"
          aria-label="Import Shellcraft save"
          onChange={(event) => void importSave(event.target.files?.[0])}
        />
        <div className="workspace-body">
          <div className="work-area">
            {!view?.settings.editor &&
              (entries === undefined ? (
                <pre className="loading-message" role="status">
                  Booting workstation…
                </pre>
              ) : (
                <Terminal
                  key={terminalVersion}
                  apiRef={terminal}
                  initialEntries={entries}
                  getLocation={() => location.current}
                  onCommand={command}
                  onOpenSource={(path, line) => send('openEditor', { path, line })}
                />
              ))}
            {view?.settings.editor && (
              <PanelBoundary
                key={view.settings.editor.path}
                label="Editor"
                onClose={() => send('closeEditor')}
              >
                <Suspense fallback={<pre className="loading-message">Loading Monaco…</pre>}>
                  <Editor
                    key={view.settings.editor.path}
                    file={view.settings.editor}
                    vim={view.settings.vim}
                    onDraft={(text) => send('editorDraft', text)}
                    onSave={async (text) => {
                      await request('saveEditor', text);
                    }}
                    onExit={async (action, text) => {
                      await request('closeEditor', { action, text });
                    }}
                  />
                </Suspense>
              </PanelBoundary>
            )}
          </div>
          {!view?.settings.editor && panels.length > 0 && (
            <aside className="custom-screens" aria-label="Player-created screens">
              {panels.map((panel) => (
                <section className="player-panel" key={panel.id}>
                  <h2 className="panel-title">{panel.title}</h2>
                  {panel.error ? (
                    <div className="error-message">
                      <pre>{panel.error}</pre>
                      <a
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          send('openEditor', { path: panel.path });
                        }}
                      >
                        Edit source
                      </a>
                    </div>
                  ) : (
                    panel.view && (
                      <PanelBoundary>
                        <Suspense fallback={<pre>Loading renderer…</pre>}>
                          <ScreenRenderer
                            node={panel.view}
                            onInteract={(handler, value) =>
                              send('interact', { panel: panel.id, handler, value })
                            }
                          />
                        </Suspense>
                      </PanelBoundary>
                    )
                  )}
                </section>
              ))}
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
