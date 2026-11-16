import { useEffect, useEffectEvent, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Readline } from 'xterm-readline';

import type { TranscriptEntry } from '../core/shell';
import type { EngineReply } from '../game/engine';
import '@xterm/xterm/css/xterm.css';

interface Props {
  initialEntries: readonly TranscriptEntry[];
  getLocation(): { host: string; directory: string; level?: string };
  onCommand(input: string): Promise<EngineReply>;
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

export function Terminal({ initialEntries, getLocation, onCommand, onOpenSource }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Startup data is replayed once; React updates must not reset the live terminal.
  const savedEntries = useRef(initialEntries);
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
      readline.setHighlighter({
        highlight: (line) => line,
        highlightChar: () => false,
        highlightPrompt,
      });
      terminal.loadAddon(fit);
      terminal.loadAddon(readline);
      terminal.open(element);
      fit.fit();
      terminal.focus();
      const links = terminal.registerLinkProvider({
        provideLinks(lineNumber, callback) {
          const text =
            terminal.buffer.active.getLine(lineNumber - 1)?.translateToString(true) ?? '';
          const matches = [...text.matchAll(/(\/home\/[^():\n]*?\.m?js):(\d+)/g)];
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
          const input = await readline.read(
            plainText(formatPrompt(current.directory, current.host)),
            { signal: controller.signal },
          );
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
