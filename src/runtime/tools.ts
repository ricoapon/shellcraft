import { Checker } from './checker';
import type { CheckedProgram, Symbols } from './checker';
import { LanguageError, list, typeName } from './types';
import type { LanguageHost, Location, Type } from './types';
import type { Statement } from './ast';
import { lexicalTokens } from './syntax';
export interface ToolSymbol {
  name: string;
  detail: string;
  type?: Type;
  source: string;
  offset: number;
  start: number;
  end: number;
  kind: 'variable' | 'command' | 'type';
}
export interface LanguageTools {
  diagnostics: { message: string; line: number; column: number }[];
  completions: { label: string; insertText: string; detail: string }[];
  symbols: ToolSymbol[];
  replaceFrom: number;
  hover?: string;
  signature?: string;
  references?: { offset: number; length: number }[];
}
export interface ToolContext {
  host: LanguageHost;
  analyze(source: string, path: string, terminal: boolean): CheckedProgram;
  declarations: Symbols;
  commands: readonly { name: string; description?: string; usage?: string }[];
  paths(prefix: string, workspace: boolean): readonly string[];
  hosts: readonly string[];
}
export function languageTools(
  source: string,
  path: string,
  offset: number,
  terminal: boolean,
  context: ToolContext,
): LanguageTools {
  offset = Math.max(0, Math.min(source.length, offset));
  const result: LanguageTools = {
    diagnostics: [],
    completions: [],
    symbols: [],
    replaceFrom: offset,
  };
  let checked: CheckedProgram | undefined;
  try {
    checked = context.analyze(source, path, terminal);
  } catch (error) {
    if (error instanceof LanguageError)
      result.diagnostics.push({
        message: error.message,
        line: error.location.line,
        column: error.location.column,
      });
    else
      result.diagnostics.push({
        message: error instanceof Error ? error.message : String(error),
        line: 1,
        column: 1,
      });
  }
  // Recover complete preceding statements for completion while the current line is incomplete.
  if (!checked) {
    const partial = source.slice(0, offset).replace(/\.$/, '');
    const opened: string[] = [];
    for (const token of lexicalTokens(partial).tokens) {
      if (['(', '[', '{'].includes(token.image)) opened.push(token.image);
      if ([')', ']', '}'].includes(token.image)) opened.pop();
    }
    const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    try {
      checked = context.analyze(
        partial +
          opened
            .reverse()
            .map((c) => closing[c])
            .join(''),
        path,
        terminal,
      );
    } catch {
      /* Recover an earlier valid submission below. */
    }
    const prefix = source.slice(0, offset),
      breaks = [...prefix.matchAll(/[;\n]/g)].map((m) => m.index!);
    for (const end of checked ? [] : [...breaks.reverse().slice(0, 20), 0]) {
      try {
        checked = context.analyze(source.slice(0, end), path, terminal);
        break;
      } catch {
        /* Earlier valid prefix may still provide symbols. */
      }
    }
  }
  const aliases = checked?.symbols.aliases ?? context.declarations.aliases;
  const resolver = new Checker(context.host.commands(), terminal ? 'terminal' : 'script', {
    bindings: new Map(),
    functions: new Map(),
    aliases,
  });
  const tokens = lexicalTokens(source).tokens;
  const braces: { start: number; end: number }[] = [],
    stack: number[] = [];
  for (const t of tokens) {
    if (t.image === '{') stack.push(t.startOffset);
    if (t.image === '}') {
      const start = stack.pop();
      if (start !== undefined) braces.push({ start, end: (t.endOffset ?? t.startOffset) + 1 });
    }
  }
  for (const start of stack) braces.push({ start, end: source.length + 1 });
  const blockRange = (body: Statement[], fallback: { start: number; end: number }) => {
    if (!body.length) return fallback;
    return (
      braces
        .filter((b) => b.start < body[0].at.offset && b.end > body[0].at.offset)
        .sort((a, b) => b.start - a.start)[0] ?? fallback
    );
  };
  const make = (
    name: string,
    type: Type | undefined,
    kind: ToolSymbol['kind'],
    at: Location,
    scope: { start: number; end: number },
    detail?: string,
  ) => {
    const text = at.source === path ? source.slice(at.offset) : '';
    const match =
      kind === 'variable'
        ? new RegExp('^(?:let|mut|for)\\s+(' + name + ')').exec(text)
        : new RegExp('^(?:def|type)\\s+(' + name + ')').exec(text);
    const declaration = match ? at.offset + match[0].lastIndexOf(name) : at.offset;
    result.symbols.push({
      name,
      detail: detail ?? (type ? typeName(type) : kind),
      type,
      source: at.source,
      offset: declaration,
      start: scope.start,
      end: scope.end,
      kind,
    });
  };
  const root = { start: 0, end: source.length + 1 };
  let inFunction = false;
  const gather = (body: Statement[], scope = root, parameters = false) => {
    for (const s of body) {
      if (s.kind === 'binding') {
        const t = s.annotation ? resolver.resolve(s.annotation) : checked?.types.get(s.value);
        make(s.name, t, 'variable', s.at, scope);
      } else if (s.kind === 'def') {
        const range = blockRange(s.body, scope),
          sig =
            s.name +
            ' [' +
            s.parameters.map((p) => p.name + ': ' + typeName(resolver.resolve(p.type))).join(', ') +
            '] -> ' +
            typeName(resolver.resolve(s.result));
        make(s.name, undefined, 'command', s.at, root, sig);
        if (offset > range.start && offset < range.end) inFunction = true;
        for (const p of s.parameters) {
          const at = { ...s.at, offset: source.indexOf(p.name, s.at.offset + s.name.length + 4) };
          make(p.name, resolver.resolve(p.type), 'variable', at, range);
        }
        gather(s.body, range, true);
      } else if (s.kind === 'for') {
        const range = blockRange(s.body, scope),
          t = checked?.types.get(s.value);
        make(s.name, t?.kind === 'list' ? t.element : undefined, 'variable', s.at, range);
        gather(s.body, range, parameters);
      } else if (s.kind === 'if') {
        gather(s.yes, blockRange(s.yes, scope), parameters);
        gather(s.no, blockRange(s.no, scope), parameters);
      } else if (s.kind === 'while') gather(s.body, blockRange(s.body, scope), parameters);
      else if (s.kind === 'type') make(s.name, aliases.get(s.name), 'type', s.at, root);
    }
  };
  try {
    if (checked) gather(checked.statements);
  } catch {
    /* Invalid annotations already have diagnostics. */
  }
  if (terminal)
    for (const [name, binding] of context.declarations.bindings)
      if (!result.symbols.some((s) => s.name === name && s.kind === 'variable'))
        make(
          name,
          binding.type,
          'variable',
          { source: '<previous submission>', offset: 0, line: 1, column: 1 },
          root,
        );
  if (!terminal)
    make(
      'args',
      list({ kind: 'string' }),
      'variable',
      { source: '<script arguments>', offset: 0, line: 1, column: 1 },
      root,
    );
  const visible = result.symbols.filter(
    (s) =>
      s.start <= offset &&
      s.end >= offset &&
      (s.kind !== 'variable' || s.offset < offset || s.source !== path) &&
      !(inFunction && s.kind === 'variable' && s.start === 0),
  );
  const before = source.slice(0, offset),
    word = /[\w$./-]*$/.exec(before)?.[0] ?? '';
  result.replaceFrom = offset - word.length;
  const add = (label: string, detail: string, insertText = label) => {
    if (label.startsWith(word) || word === '' || (word.startsWith('$') && label.startsWith(word)))
      result.completions.push({ label, insertText, detail });
  };
  const field = /\$([A-Za-z_]\w*)((?:\[\d+\]|\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/.exec(before);
  if (field) {
    let type = visible.filter((s) => s.name === field[1] && s.kind === 'variable').at(-1)?.type;
    for (const access of field[2].matchAll(/\[(\d+)\]|\.([A-Za-z_]\w*)/g)) {
      if (access[1] !== undefined) type = type?.kind === 'list' ? type.element : undefined;
      else type = type?.kind === 'record' ? type.fields[access[2]] : undefined;
    }
    const part = field[3] ?? '';
    result.replaceFrom = offset - part.length;
    if (type?.kind === 'record')
      for (const [name, t] of Object.entries(type.fields))
        if (name.startsWith(part))
          result.completions.push({ label: name, insertText: name, detail: typeName(t) });
  } else {
    for (const command of context.commands)
      add(command.name, command.usage ?? command.description ?? 'command');
    for (const symbol of visible)
      add(symbol.kind === 'variable' ? '$' + symbol.name : symbol.name, symbol.detail);
    for (const name of [
      'let',
      'mut',
      'if',
      'else',
      'for',
      'while',
      'def',
      'type',
      'use',
      'return',
      'break',
      'continue',
      'string',
      'number',
      'bool',
      'void',
      'list',
    ])
      add(name, 'language');
    const line = before
      .slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1)
      .trimStart();
    if (/^\s*(ssh|neighbors)\s+/.test(line))
      for (const id of context.hosts) add(id, 'discovered host');
    const commandName = /^([\w-]+)/.exec(line)?.[1],
      command = context.commands.find((c) => c.name === commandName);
    if (command?.usage?.includes('path') || commandName === 'use') {
      const workspace = ['edit', 'vim', 'run', 'use'].includes(commandName ?? '');
      for (const candidate of context.paths(word, workspace))
        add(candidate, 'path', /\s/.test(candidate) ? JSON.stringify(candidate) : candidate);
    }
    const native = context.host.commands().find((c) => c.name === commandName);
    const words = line.split(/\s+/);
    for (const sig of native?.signatures ?? [])
      if (sig.prefix?.length) {
        const n = words.length - 2;
        if (n >= 0 && sig.prefix.slice(0, n).every((v, i) => v === words[i + 1]) && sig.prefix[n])
          add(sig.prefix[n], 'subcommand');
      }
  }
  const unique = new Map(result.completions.map((c) => [c.label, c]));
  result.completions = [...unique.values()];
  const reference = /\$?([A-Za-z_][\w-]*)$/.exec(before)?.[1];
  if (reference)
    result.hover =
      visible.find((s) => s.name === reference)?.detail ??
      context.commands.find((c) => c.name === reference)?.usage;
  const call = /(?:^|[;(])\s*([A-Za-z_][\w-]*)\s+[^()]*$/.exec(
    before.slice(before.lastIndexOf('\n') + 1),
  );
  if (call)
    result.signature =
      visible.find((s) => s.name === call[1] && s.kind === 'command')?.detail ??
      context.commands.find((c) => c.name === call[1])?.usage;
  const symbol = reference
    ? visible.filter((s) => s.name === reference && s.kind === 'variable').at(-1)
    : undefined;
  if (symbol && symbol.source === path) {
    result.references = [{ offset: symbol.offset, length: symbol.name.length }];
    for (const token of tokens)
      if (
        token.startOffset >= symbol.start &&
        token.startOffset < symbol.end &&
        token.image.split('.')[0] === '$' + symbol.name
      )
        result.references.push({ offset: token.startOffset + 1, length: symbol.name.length });
  }
  return result;
}
