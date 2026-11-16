import { useEffect, useEffectEvent, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Readline } from './readline';
import { CommandHistory } from './history';

import type { TranscriptEntry } from '../core/shell';
import type { EngineReply } from '../game/engine';
import type { LanguageTools } from '../runtime/tools';
import { isIncomplete } from '../runtime/syntax';
import { terminalCompletionEdit } from '../runtime/completion';
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
      const history = new CommandHistory();
      const highlightPrompt = (prompt: string) =>
        `${location().level ? '\x1b[38;2;199;165;235m' : '\x1b[38;2;143;219;171m'}${prompt}\x1b[39m`;
      let inputActive = false,
        applying = false,
        sourceLine = '',
        cursor = 0,
        revision = 0;
      let lastTab: { source: string; cursor: number } | undefined;
      let listing: { source: string; cursor: number; labels: string[] } | undefined;
      let restore: { source: string; cursor: number } | undefined;
      let promptController: AbortController | undefined;
      let completionQueue = Promise.resolve();
      const apply = (edit: { source: string; cursor: number }) => {
        applying = true;
        readline.updateLine(edit.source);
        const backwards = Array.from(edit.source.slice(edit.cursor)).length;
        if (backwards) terminal.input('\x1b[D'.repeat(backwards), false);
        sourceLine = edit.source;
        cursor = edit.cursor;
        applying = false;
      };
      const complete = async (version: number) => {
        if (!inputActive || version !== revision) return;
        const source = readline.getLine(),
          position = cursor;
        const info = await inspectSource(source, position);
        if (
          !inputActive ||
          version !== revision ||
          readline.getLine() !== source ||
          cursor !== position
        )
          return;
        const edit = terminalCompletionEdit(source, position, info);
        if (edit && (edit.source !== source || edit.cursor !== position)) {
          lastTab = undefined;
          apply(edit);
        } else if (info.completions.length > 1) {
          if (lastTab?.source === source && lastTab.cursor === position) {
            listing = {
              source,
              cursor: position,
              labels: info.completions.map((item) => item.label),
            };
            lastTab = undefined;
            inputActive = false;
            promptController?.abort();
          } else lastTab = { source, cursor: position };
        } else lastTab = undefined;
      };
      readline.setHighlighter({
        highlight: (line, position) => {
          if (inputActive && (line !== sourceLine || position !== cursor)) {
            sourceLine = line;
            cursor = position;
            if (!applying) {
              revision++;
              lastTab = undefined;
            }
          }
          if (restore) {
            const edit = restore;
            restore = undefined;
            // Readline has just anchored the fresh prompt. Restore the draft
            // after its initial refresh finishes, including the original caret.
            queueMicrotask(() => {
              if (inputActive) apply(edit);
            });
          }
          return highlightSource(line);
        },
        highlightChar: () => true,
        highlightPrompt,
      });
      readline.setCheckHandler((source) => !isIncomplete(source));
      // Readline owns Shift+Enter. Capture completion and recall before xterm.
      const onKeyDown = (event: KeyboardEvent) => {
        const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
        if (plain && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          revision++;
          lastTab = undefined;
          if (inputActive) {
            const recalled = history.move(event.key === 'ArrowUp' ? 'older' : 'newer', {
              source: readline.getLine(),
              cursor,
            });
            if (recalled) apply(recalled);
          }
          return;
        }
        if (event.ctrlKey && event.key.toLowerCase() === 'c') history.reset();
        if (
          event.key !== 'Tab' ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          revision++;
          lastTab = undefined;
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!inputActive) return;
        const version = revision;
        completionQueue = completionQueue
          .then(() => complete(version))
          .catch(() => {
            lastTab = undefined;
          });
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
        if (!entry.input.startsWith('[')) history.append(entry.input);
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
          promptController = new AbortController();
          let input: string;
          try {
            input = await readline.read(plainText(formatPrompt(current.directory, current.host)), {
              signal: AbortSignal.any([controller.signal, promptController.signal]),
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            if (!listing) throw error;
            // End the displayed input line, list matches, then read the same
            // draft again. Nothing is submitted or added to command history.
            readline.println('\r\n' + listing.labels.map(plainText).join('  '));
            restore = { source: listing.source, cursor: listing.cursor };
            listing = undefined;
            continue;
          }
          inputActive = false;
          revision++;
          lastTab = undefined;
          if (controller.signal.aborted) return;
          history.append(input);
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
            history.clear();
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
        revision++;
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
    </section>
  );
}
