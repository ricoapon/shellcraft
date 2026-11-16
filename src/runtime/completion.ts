import { lexicalTokens } from './syntax';
import type { CompletionTarget, NativeCommand } from './types';
import { typeName } from './types';
import type { ToolSymbol } from './tools';

export interface CompletionItem {
  label: string;
  insertText: string;
  detail: string;
  kind?: 'command' | 'variable' | 'field' | 'type' | 'file' | 'directory' | 'value';
  cursorOffset?: number;
}
export interface CompletionEnvironment {
  commands: readonly { name: string; usage?: string; description?: string }[];
  natives: readonly NativeCommand[];
  paths(
    prefix: string,
    target: Extract<CompletionTarget, { kind: 'path' }>,
    sourcePath: string,
  ): readonly { path: string; type: 'file' | 'directory' }[];
  hosts: readonly string[];
  missions: readonly string[];
}
interface Atom {
  text?: string;
}
interface Frame {
  command?: string;
  args: Atom[];
  group: string;
  generic: number;
  commandEnd?: number;
}
export interface CompletionResult {
  completions: CompletionItem[];
  replaceFrom: number;
  replaceTo: number;
}
function decode(image: string): string {
  if (image.startsWith('"')) {
    let content = image.slice(1, image.endsWith('"') ? -1 : undefined);
    if (content.endsWith('\\') && !content.endsWith('\\\\')) content = content.slice(0, -1);
    try {
      return JSON.parse('"' + content + '"');
    } catch {
      return content;
    }
  }
  return image;
}
export function completionsAt(
  source: string,
  path: string,
  offset: number,
  terminal: boolean,
  symbols: readonly ToolSymbol[],
  env: CompletionEnvironment,
): CompletionResult {
  const lexed = lexicalTokens(source),
    tokens = lexed.tokens;
  const output: CompletionResult = { completions: [], replaceFrom: offset, replaceTo: offset };
  if (
    (lexed.groups.comments ?? []).some(
      (t) => t.startOffset <= offset && offset <= (t.endOffset ?? t.startOffset) + 1,
    )
  )
    return output;
  let current = tokens.find(
    (t) =>
      t.startOffset <= offset &&
      offset <= (t.endOffset ?? t.startOffset) + 1 &&
      !['Newline', 'Semicolon'].includes(t.tokenType.name),
  );
  if (current?.tokenType.name === 'SingleQuoted') return output;
  if (current?.startOffset === offset && source[offset - 1] === '$') current = undefined;
  // A lone $ is an unfinished Variable token and is omitted by the lexer.
  const start = current?.startOffset ?? (source[offset - 1] === '$' ? offset - 1 : offset);
  const raw = source.slice(start, offset);
  output.replaceFrom = start;
  output.replaceTo = current ? (current.endOffset ?? current.startOffset) + 1 : offset;
  const quoted = raw.startsWith('"');
  const prefix = quoted ? decode(raw) : raw;
  const tokenTail = current
    ? source.slice(offset, (current.endOffset ?? offset) + 1).replace(quoted ? /"$/ : /$^/, '')
    : '';
  const frames: Frame[] = [{ args: [], group: 'root', generic: 0 }];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startOffset >= start) break;
    const text = token.image,
      frame = frames.at(-1)!;
    if (frame.generic) {
      if (text === '<') frame.generic++;
      if (text === '>') frame.generic--;
      continue;
    }
    if (text === '<' && frame.command && token.startOffset === frame.commandEnd) {
      frame.generic = 1;
      continue;
    }
    if (text === '(') {
      if (frame.command) frame.args.push({});
      frames.push({ args: [], group: '(', generic: 0 });
      continue;
    }
    if (text === ')') {
      if (frames.length > 1) frames.pop();
      continue;
    }
    if (text === '[' || (text === '{' && tokens[i + 2]?.image === ':')) {
      // Completed literal arguments count once, regardless of internal tokens.
      if (frame.command) frame.args.push({});
      const open = text,
        close = text === '[' ? ']' : '}';
      let depth = 1;
      while (++i < tokens.length && tokens[i].startOffset < start) {
        if (tokens[i].image === open) depth++;
        if (tokens[i].image === close && --depth === 0) break;
      }
      if (i >= tokens.length || tokens[i]?.startOffset >= start) {
        return output;
      }
      continue;
    }
    if (text === '{') {
      frames.push({ args: [], group: '{', generic: 0 });
      continue;
    }
    if (text === '}') {
      if (frames.length > 1) frames.pop();
      continue;
    }
    if (text === ';' || token.tokenType.name === 'Newline') {
      if (token.tokenType.name === 'Newline' && frame.group === '(') continue;
      frame.command = undefined;
      frame.args = [];
      continue;
    }
    if (
      text === '=' ||
      (text === 'in' && frame.command === '@for') ||
      (text === 'return' && !frame.command)
    ) {
      frame.command = undefined;
      frame.args = [];
      continue;
    }
    if (
      ['let', 'mut', 'for', 'def', 'type', 'if', 'else', 'while'].includes(text) &&
      !frame.command
    ) {
      frame.command = '@' + text;
      continue;
    }
    if (!frame.command) {
      frame.command = text;
      frame.commandEnd = (token.endOffset ?? token.startOffset) + 1;
    } else
      frame.args.push({ text: token.tokenType.name === 'Variable' ? undefined : decode(text) });
  }
  const frame = frames.at(-1)!;
  const items: CompletionItem[] = [];
  const add = (
    label: string,
    detail: string,
    kind: CompletionItem['kind'] = 'value',
    insertText = label,
    cursorOffset?: number,
  ) => {
    if (label.startsWith(prefix))
      items.push({
        label,
        detail,
        kind,
        insertText,
        ...(cursorOffset === undefined ? {} : { cursorOffset }),
      });
  };
  const before = source.slice(0, offset);
  const field = !quoted
    ? /\$([A-Za-z_]\w*)((?:\[\d+\]|\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/.exec(before)
    : null;
  if (field) {
    let type = symbols.filter((s) => s.kind === 'variable' && s.name === field[1]).at(-1)?.type;
    for (const access of field[2].matchAll(/\[(\d+)\]|\.([A-Za-z_]\w*)/g))
      type =
        access[1] !== undefined
          ? type?.kind === 'list'
            ? type.element
            : undefined
          : type?.kind === 'record'
            ? type.fields[access[2]]
            : undefined;
    const part = field[3] ?? '';
    output.replaceFrom = offset - part.length;
    output.replaceTo = offset + (/^\w*/.exec(source.slice(offset))?.[0].length ?? 0);
    if (type?.kind === 'record')
      for (const [name, t] of Object.entries(type.fields))
        if (name.startsWith(part))
          items.push({ label: name, insertText: name, kind: 'field', detail: typeName(t) });
    return { ...output, completions: items };
  }
  if (!quoted && raw.startsWith('$')) {
    for (const symbol of symbols)
      if (symbol.kind === 'variable') add('$' + symbol.name, symbol.detail, 'variable');
  } else if (!quoted && /(?:[:]|->|<)\s*[A-Za-z_]*$/.test(before)) {
    for (const name of ['string', 'number', 'bool', 'void', 'list', 'File'])
      add(name, 'type', 'type');
    for (const symbol of symbols)
      if (symbol.kind === 'type') add(symbol.name, symbol.detail, 'type');
  } else if (!frame.command) {
    if (!quoted) {
      for (const command of env.commands)
        if (
          terminal ||
          !env.natives.find((c) => c.name === command.name)?.signatures.every((s) => s.terminalOnly)
        )
          add(command.name, command.usage ?? command.description ?? 'command', 'command');
      for (const symbol of symbols)
        if (symbol.kind === 'command') add(symbol.name, symbol.detail, 'command');
      for (const name of [
        'let',
        'mut',
        'if',
        'for',
        'while',
        'def',
        'type',
        'use',
        'return',
        'break',
        'continue',
      ])
        add(name, 'language', 'value');
    }
  } else {
    const native = env.natives.find((c) => c.name === frame.command);
    const signatures = (native?.signatures ?? []).filter((s) => terminal || !s.terminalOnly);
    const completed = frame.args.map((a) => a.text);
    let specificity = -1;
    const targets: CompletionTarget[] = [];
    for (const sig of signatures) {
      const words = sig.prefix ?? [];
      const known = words.slice(0, Math.min(words.length, completed.length));
      if (!known.every((word, i) => word === completed[i])) continue;
      if (completed.length < words.length) {
        if (!quoted) add(words[completed.length], 'subcommand');
        continue;
      }
      if (words.length < specificity) continue;
      if (words.length > specificity) {
        targets.length = 0;
        specificity = words.length;
      }
      const index = completed.length - words.length;
      const target = sig.completion?.[index];
      if (target) targets.push(target);
    }
    if (frame.command === 'use') targets.push({ kind: 'path', scope: 'module', extension: '.sc' });
    for (const target of targets) {
      if (target.kind === 'path') {
        // Paths are literal suggestions only; never evaluate an unfinished expression.
        for (const entry of env.paths(prefix, target, path)) {
          if (!entry.path.startsWith(prefix) || /[\u0000-\u001f]/.test(entry.path)) continue;
          const tail =
            entry.type === 'directory' && tokenTail.includes('/')
              ? tokenTail.slice(tokenTail.indexOf('/') + 1)
              : '';
          const value = entry.path + tail;
          const quote = quoted || !/^[A-Za-z0-9_./-]+$/.test(value);
          const encode = (text: string) => (quote ? JSON.stringify(text) : text);
          const insertText = encode(value),
            cursorOffset =
              entry.type === 'directory' ? encode(entry.path).length - (quote ? 1 : 0) : undefined;
          items.push({
            label: entry.path,
            detail:
              entry.type === 'directory'
                ? 'directory'
                : target.scope === 'host'
                  ? 'host file'
                  : 'workspace file',
            kind: entry.type,
            insertText,
            ...(cursorOffset === undefined ? {} : { cursorOffset }),
          });
        }
      } else if (!quoted) {
        if (target.kind === 'host') for (const host of env.hosts) add(host, 'discovered host');
        if (target.kind === 'mission') for (const id of env.missions) add(id, 'available mission');
        if (target.kind === 'command')
          for (const command of env.commands)
            add(command.name, command.description ?? 'command', 'command');
        if (target.kind === 'choices') for (const value of target.values) add(value, 'argument');
      }
    }
    if (!quoted)
      for (const symbol of symbols)
        if (symbol.kind === 'variable') add('$' + symbol.name, symbol.detail, 'variable');
  }
  output.completions = [...new Map(items.map((item) => [item.label, item])).values()].sort(
    (a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
  return output;
}
export function completionEdit(
  source: string,
  info: CompletionResult,
  item: CompletionItem,
): { source: string; cursor: number } {
  return {
    source: source.slice(0, info.replaceFrom) + item.insertText + source.slice(info.replaceTo),
    cursor: info.replaceFrom + (item.cursorOffset ?? item.insertText.length),
  };
}

/** Bash-style Tab: accept a unique match, otherwise extend only the shared prefix. */
export function terminalCompletionEdit(
  source: string,
  cursor: number,
  info: CompletionResult,
): { source: string; cursor: number } | undefined {
  const [first, ...others] = info.completions;
  if (!first) return;
  if (!others.length) {
    const edit = completionEdit(source, info, first);
    if (first.kind === 'directory' || edit.cursor < info.replaceFrom + first.insertText.length)
      return edit;
    const next = edit.source[edit.cursor];
    if (next !== undefined && /\s/.test(next)) {
      if (next === ' ' || next === '\t') edit.cursor++;
      return edit;
    }
    return {
      source: edit.source.slice(0, edit.cursor) + ' ' + edit.source.slice(edit.cursor),
      cursor: edit.cursor + 1,
    };
  }
  let prefix = first.label;
  for (const item of others) {
    let length = 0;
    while (length < prefix.length && prefix[length] === item.label[length]) length++;
    prefix = prefix.slice(0, length);
  }
  const raw = source.slice(info.replaceFrom, cursor);
  const quoted = raw.startsWith('"');
  const typed = quoted ? decode(raw) : raw;
  if (prefix.length <= typed.length || !prefix.startsWith(typed)) return;
  if (info.completions.every((item) => item.kind === 'file' || item.kind === 'directory')) {
    // Encode the shared path itself: candidates may need different quoting.
    // Keep any later path components when completing in the middle of a path.
    const remainder = source.slice(cursor, info.replaceTo).replace(quoted ? /"$/ : /$^/, '');
    const slash = remainder.indexOf('/');
    const tail = slash < 0 ? '' : remainder.slice(slash + (prefix.endsWith('/') ? 1 : 0));
    const value = prefix + tail;
    const quote = quoted || !/^[A-Za-z0-9_./-]+$/.test(value);
    const encode = (text: string) => (quote ? JSON.stringify(text) : text);
    return completionEdit(source, info, {
      ...first,
      insertText: encode(value),
      cursorOffset: encode(prefix).length - (quote ? 1 : 0),
    });
  }
  return completionEdit(source, info, { ...first, insertText: prefix, cursorOffset: undefined });
}
