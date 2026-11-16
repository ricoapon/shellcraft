import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Readline } from 'xterm-readline';

import type { TranscriptEntry } from '../core/shell';
import type { EngineReply } from '../game/engine';
import type { LanguageTools } from '../runtime/tools';
import { isIncomplete } from '../runtime/syntax';
import { completionEdit } from '../runtime/completion';
import type { CompletionItem } from '../runtime/completion';
import { highlightSource } from '../runtime/highlight';
import '@xterm/xterm/css/xterm.css';

interface Props {
  initialEntries: readonly TranscriptEntry[];
  getLocation(): { host: string; directory: string; level?: string };
  onCommand(input: string): Promise<EngineReply>;
  inspect(source: string, offset: number): Promise<LanguageTools>;
  onOpenSource(path: string, line: number): void;
}

function formatPrompt(workingDirectory: string, host = 'home'): string {
  const name = workingDirectory.slice(workingDirectory.lastIndexOf('/') + 1) || '/';
  return `${host}:${name} $ `;
}

/** Game output is plain text, never terminal control sequences. */
function plainText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').replace(/\n/g, '\r\n');
}

export function Terminal({ initialEntries, getLocation, onCommand, onOpenSource, inspect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [completion, setCompletion] = useState<{
    items: CompletionItem[];
    selected: number;
    left: number;
    top?: number;
    bottom?: number;
  }>();
  const acceptCompletion = useRef<((index: number) => void) | undefined>(undefined);
  const completionList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    completionList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({
      block: 'nearest',
    });
  }, [completion]);
  // Startup data is replayed once; React updates must not reset the live terminal.
  const savedEntries = useRef(initialEntries);
  const inspectSource = useEffectEvent(inspect);
  const execute = useEffectEvent(onCommand);
  const location = useEffectEvent(getLocation);
  const openSource = useEffectEvent(onOpenSource);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    // Strict Mode may discard an effect immediately. Open xterm on the next frame
    // so its own deferred viewport work cannot run after that discarded instance.
    const frame = requestAnimationFrame(() => {
      const element = host.current!;
      const terminal = new Xterm({
        cursorBlink: true,
        screenReaderMode: true,
        fontFamily: "'Cascadia Code', Consolas, monospace",
        fontSize: 15,
        lineHeight: 1.35,
        scrollback: 10_000,
        theme: { background: '#101816', foreground: '#d7e3dc', cursor: '#8fdbab' },
      });
      const fit = new FitAddon();
      const readline = new Readline();
      const highlightPrompt = (prompt: string) =>
        `${location().level ? '\x1b[38;2;199;165;235m' : '\x1b[38;2;143;219;171m'}${prompt}\x1b[39m`;
      let inputActive = false,
        applying = false,
        sourceLine = '',
        cursor = 0,
        requestId = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let menu:
        { source: string; cursor: number; info: LanguageTools; selected: number } | undefined;
      const hide = () => {
        menu = undefined;
        setCompletion(undefined);
      };
      const publish = () => {
        if (!menu) return;
        const rect = element.getBoundingClientRect(),
          cellHeight = rect.height / terminal.rows,
          cellWidth = rect.width / terminal.cols;
        const y = terminal.buffer.active.cursorY * cellHeight;
        setCompletion({
          items: menu.info.completions.slice(0, 100),
          selected: menu.selected,
          left: Math.max(0, Math.min(terminal.buffer.active.cursorX * cellWidth, rect.width - 420)),
          ...(y > 240 ? { bottom: Math.max(0, rect.height - y) } : { top: y + cellHeight }),
        });
      };
      const apply = (index: number) => {
        if (!menu || menu.source !== readline.getLine() || menu.cursor !== cursor) return;
        const item = menu.info.completions[index];
        if (!item) return;
        const edit = completionEdit(menu.source, menu.info, item);
        requestId++;
        clearTimeout(timer);
        applying = true;
        hide();
        readline.updateLine(edit.source);
        const backwards = Array.from(edit.source.slice(edit.cursor)).length;
        if (backwards) terminal.input('\x1b[D'.repeat(backwards), false);
        sourceLine = edit.source;
        cursor = edit.cursor;
        applying = false;
        terminal.focus();
        if (item.kind === 'directory') schedule(edit.source, edit.cursor, false);
      };
      acceptCompletion.current = apply;
      const request = async (source: string, position: number, acceptSingle: boolean) => {
        const id = ++requestId;
        try {
          const info = await inspectSource(source, position);
          if (
            !inputActive ||
            id !== requestId ||
            readline.getLine() !== source ||
            cursor !== position
          )
            return;
          if (!info.completions.length) {
            hide();
            return;
          }
          menu = { source, cursor: position, info, selected: 0 };
          if (acceptSingle && info.completions.length === 1) apply(0);
          else publish();
        } catch {
          if (id === requestId) hide();
        }
      };
      const schedule = (source: string, position: number, explicit: boolean) => {
        clearTimeout(timer);
        if (!explicit && !source.slice(0, position).trim()) {
          hide();
          return;
        }
        timer = setTimeout(() => void request(source, position, false), 140);
      };
      readline.setHighlighter({
        highlight: (line, position) => {
          if (inputActive && (line !== sourceLine || position !== cursor)) {
            sourceLine = line;
            cursor = position;
            if (!applying) {
              requestId++;
              hide();
              schedule(line, position, false);
            }
          }
          return highlightSource(line);
        },
        highlightChar: () => true,
        highlightPrompt,
      });
      readline.setCheckHandler((source) => !isIncomplete(source));
      const handleCompletionKey = (event: KeyboardEvent) => {
        if (event.type !== 'keydown') return true;
        const completionKey =
          event.key === 'Tab' || ((event.ctrlKey || event.metaKey) && event.code === 'Space');
        if (completionKey) {
          event.preventDefault();
          if (!inputActive) return false;
          clearTimeout(timer);
          if (event.key === 'Tab' && menu) {
            if (event.shiftKey) {
              menu.selected =
                (menu.selected - 1 + Math.min(100, menu.info.completions.length)) %
                Math.min(100, menu.info.completions.length);
              publish();
            } else apply(menu.selected);
          } else void request(readline.getLine(), cursor, event.key === 'Tab');
          return false;
        }
        if (menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          const count = Math.min(100, menu.info.completions.length);
          menu.selected = (menu.selected + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
          publish();
          return false;
        }
        if (event.key === 'Escape') {
          requestId++;
          clearTimeout(timer);
          hide();
          return false;
        }
        if (event.key === 'Enter') {
          requestId++;
          clearTimeout(timer);
          hide();
        }
        return true;
      };
      // Readline installs xterm's custom handler for Shift+Enter. Capture only
      // completion keys before xterm so both handlers keep their own shortcuts.
      const onKeyDown = (event: KeyboardEvent) => {
        if (!handleCompletionKey(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
      element.addEventListener('keydown', onKeyDown, true);
      terminal.loadAddon(fit);
      terminal.loadAddon(readline);
      terminal.open(element);
      fit.fit();
      terminal.focus();
      const links = terminal.registerLinkProvider({
        provideLinks(lineNumber, callback) {
          const text =
            terminal.buffer.active.getLine(lineNumber - 1)?.translateToString(true) ?? '';
          const matches = [...text.matchAll(/(\/home\/[^():\n]*?\.sc):(\d+)/g)];
          callback(
            matches.map((match) => ({
              text: match[0],
              range: {
                start: { x: match.index! + 1, y: lineNumber },
                end: { x: match.index! + match[0].length, y: lineNumber },
              },
              activate: () => openSource(match[1], Number(match[2])),
            })),
          );
        },
      });

      function writeOutput(output: readonly string[]) {
        for (const line of output) {
          const text = plainText(line);
          readline.write(text.endsWith('\r\n') ? text : `${text}\r\n`);
        }
      }

      for (const entry of savedEntries.current) {
        if (!entry.input.startsWith('['))
          readline.println(
            `${highlightPrompt(plainText(formatPrompt(entry.workingDirectory ?? '/home', entry.host)))}${plainText(entry.input)}`,
          );
        writeOutput(entry.output);
        if (!entry.input.startsWith('[')) readline.appendHistory(entry.input);
      }

      const controller = new AbortController();

      async function readCommands() {
        while (!controller.signal.aborted) {
          const current = location();
          terminal.options.theme = {
            background: current.level ? '#191321' : '#101816',
            foreground: '#d7e3dc',
            cursor: current.level ? '#c7a5eb' : '#8fdbab',
          };
          inputActive = true;
          sourceLine = '';
          cursor = 0;
          const input = await readline.read(
            plainText(formatPrompt(current.directory, current.host)),
            { signal: controller.signal },
          );
          inputActive = false;
          requestId++;
          clearTimeout(timer);
          hide();
          if (controller.signal.aborted) return;
          let result: EngineReply;
          try {
            result = await execute(input);
          } catch (error) {
            if (controller.signal.aborted) return;
            readline.println(plainText(error instanceof Error ? error.message : String(error)));
            continue;
          }
          if (controller.signal.aborted) return;
          if (result.clearScreen) {
            // Clear the viewport and scrollback, then let readline draw a fresh prompt.
            readline.write('\x1b[2J\x1b[3J\x1b[H');
            writeOutput(result.output);
          } else {
            writeOutput(result.output);
          }
        }
      }
      void readCommands().catch(() => {
        if (!controller.signal.aborted)
          readline.println('Terminal input failed. Reload to reconnect.');
      });

      const observer = new ResizeObserver(() => {
        if (element.clientWidth && element.clientHeight) fit.fit();
      });
      observer.observe(element);
      dispose = () => {
        inputActive = false;
        requestId++;
        clearTimeout(timer);
        acceptCompletion.current = undefined;
        element.removeEventListener('keydown', onKeyDown, true);
        controller.abort();

        observer.disconnect();
        links.dispose();
        terminal.dispose();
      };
    });
    return () => {
      cancelAnimationFrame(frame);
      dispose?.();
    };
  }, []);

  return (
    <section className="terminal-panel" aria-label="Terminal">
      <div ref={host} className="terminal-output" />
      {completion && (
        <div
          ref={completionList}
          className="terminal-completions"
          role="listbox"
          aria-label="Shell completions"
          style={{ left: completion.left, top: completion.top, bottom: completion.bottom }}
        >
          {completion.items.map((item, index) => (
            <div
              key={item.label}
              role="option"
              aria-selected={index === completion.selected}
              className={
                index === completion.selected ? 'completion-option selected' : 'completion-option'
              }
              onMouseDown={(event) => {
                event.preventDefault();
                acceptCompletion.current?.(index);
              }}
            >
              <span className="completion-label">{item.label}</span>
              <span className="completion-detail">{item.detail}</span>
            </div>
          ))}
          <div className="completion-hint">Tab accept · ↑↓ choose · Esc dismiss</div>
        </div>
      )}
    </section>
  );
}
