import { useEffect, useEffectEvent, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { conf, language } from 'monaco-editor/languages/definitions/javascript/javascript.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import type { WorkstationSettings } from '../../game/engine';

const vimCommands = new WeakMap<object, (name: string, args: string) => void>();

(globalThis as typeof globalThis & { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'javascript' || label === 'typescript') return new TypeScriptWorker();
    if (label === 'json') return new JsonWorker();
    return new EditorWorker();
  },
};

// Load Monaco's JavaScript grammar eagerly with the editor.
monaco.languages.setLanguageConfiguration('javascript', conf);
monaco.languages.setMonarchTokensProvider('javascript', language);
monaco.editor.defineTheme('shellcraft', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C6A0F6' },
    { token: 'string', foreground: 'A6DA95' },
    { token: 'number', foreground: 'F5A97F' },
    { token: 'comment', foreground: '87998D', fontStyle: 'italic' },
    { token: 'delimiter', foreground: 'B8CAD1' },
  ],
  colors: {
    'editor.background': '#101816',
    'editor.foreground': '#d7e3dc',
    'editor.lineHighlightBackground': '#19241f',
    'editorCursor.foreground': '#8fdbab',
  },
});

interface Props {
  file: NonNullable<WorkstationSettings['editor']>;
  vim: boolean;
  onDraft(text: string): void;
  onSave(text: string): Promise<void>;
  onExit(action: 'save' | 'discard' | 'run', text: string): Promise<void>;
}

export default function Editor({ file, vim, onDraft, onSave, onExit }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const exiting = useRef(false);
  const saved = useRef(file.saved);
  const [dirty, setDirty] = useState(file.draft !== file.saved);
  const [message, setMessage] = useState('');
  const draft = useEffectEvent(onDraft);
  const exit = useEffectEvent(onExit);
  const save = useEffectEvent(onSave);

  useEffect(() => {
    const model = monaco.editor.createModel(
      file.draft,
      /\.[cm]?js$/.test(file.path)
        ? 'javascript'
        : file.path.endsWith('.json')
          ? 'json'
          : 'markdown',
      monaco.Uri.parse('file://' + file.path),
    );
    const instance = monaco.editor.create(container.current!, {
      model,
      theme: 'shellcraft',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      wordWrap: 'on',
      accessibilitySupport: 'auto',
      contextmenu: false,
    });
    editor.current = instance;
    exiting.current = false;
    const subscription = instance.onDidChangeModelContent(() => {
      setDirty(instance.getValue() !== saved.current);
      draft(instance.getValue());
    });
    async function finish(action: 'save' | 'discard' | 'run') {
      if (exiting.current) return;
      exiting.current = true;
      try {
        await exit(action, instance.getValue());
      } catch (error) {
        setMessage(String(error));
        exiting.current = false;
      }
    }
    if (!vim) {
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void finish('save'));
      instance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyQ,
        () => void finish('discard'),
      );
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void finish('run'));
    }
    if (file.line) {
      instance.setPosition({ lineNumber: file.line, column: 1 });
      instance.revealLineInCenter(file.line);
    }
    instance.focus();
    return () => {
      subscription.dispose();
      instance.setModel(null);
      instance.dispose();
      model.dispose();
      editor.current = null;
    };
    // A file change creates a fresh model; draft updates preserve the cursor.
  }, [file.path, vim]);

  useEffect(() => {
    if (file.line && editor.current) {
      editor.current.setPosition({ lineNumber: file.line, column: 1 });
      editor.current.revealLineInCenter(file.line);
    }
  }, [file.path, file.line]);

  useEffect(() => {
    if (!vim || !editor.current) return;
    let disposed = false;
    let mode: { dispose(): void } | undefined;
    import('monaco-vim')
      .then(({ initVimMode, VimMode }) => {
        if (disposed || !editor.current) return;
        const instance = editor.current;
        const api = (
          VimMode as typeof VimMode & {
            Vim: {
              defineEx(
                name: string,
                prefix: string,
                callback: (adapter: object, params: { argString?: string }) => void,
              ): void;
            };
          }
        ).Vim;
        for (const [name, prefix] of [
          ['write', 'w'],
          ['quit', 'q'],
          ['wq', 'wq'],
          ['xit', 'x'],
          ['run', 'run'],
        ]) {
          api.defineEx(name, prefix, (adapter, params) =>
            vimCommands.get(adapter)?.(name, params.argString?.trim() ?? ''),
          );
        }
        const adapter = initVimMode(instance, status.current!);
        mode = adapter;
        vimCommands.set(adapter, (name, args) => {
          if (exiting.current) return;
          if (args && args !== '!') {
            setMessage('This command does not accept file arguments.');
            return;
          }
          const modified = instance.getValue() !== saved.current;
          if (name === 'quit' && modified && args !== '!') {
            setMessage('No write since last change. Use :w to save or :q! to discard.');
            return;
          }
          const value = instance.getValue();
          if (name === 'write') {
            exiting.current = true;
            void save(value)
              .then(() => {
                if (disposed) return;
                saved.current = value;
                setDirty(instance.getValue() !== value);
                setMessage('Saved');
              })
              .catch((error) => setMessage(String(error)))
              .finally(() => {
                exiting.current = false;
              });
            return;
          }
          const action =
            name === 'run'
              ? 'run'
              : name === 'wq' || (name === 'xit' && modified)
                ? 'save'
                : 'discard';
          exiting.current = true;
          void exit(action, value).catch((error) => {
            setMessage(String(error));
            exiting.current = false;
          });
        });
      })
      .catch((error) => setMessage('Vim could not load: ' + String(error)));
    return () => {
      disposed = true;
      if (mode) vimCommands.delete(mode);
      mode?.dispose();
    };
  }, [vim, file.path]);

  return (
    <section className="editor-pane" aria-label="Code editor">
      <div className="editor-file" title={file.path}>
        Code notebook — {file.path}
        {dirty ? ' •' : ''}
      </div>
      <div className="monaco-container" ref={container} />
      <div className="editor-status">
        <span className="editor-shortcuts">
          {vim
            ? ':run save, quit & run'
            : 'Ctrl+S save & exit · Ctrl+Q discard & exit · Ctrl+Enter save, exit & run'}
        </span>
        <span className="vim-status" ref={status} />
        {message && (
          <span className="editor-message" role="status">
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
