import * as monaco from 'monaco-editor';
import type { LanguageTools } from '../../runtime/tools';
export type Inspect = (source: string, offset: number) => Promise<LanguageTools>;
let inspector: Inspect | undefined;
export function setInspector(value: Inspect | undefined) {
  inspector = value;
}
monaco.languages.register({ id: 'shellcraft', extensions: ['.sc'] });
monaco.languages.setLanguageConfiguration('shellcraft', {
  comments: { lineComment: '#' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  wordPattern: /\$?[A-Za-z_][\w-]*/g,
});
monaco.languages.setMonarchTokensProvider('shellcraft', {
  keywords: [
    'let',
    'mut',
    'if',
    'else',
    'for',
    'in',
    'while',
    'def',
    'type',
    'use',
    'return',
    'break',
    'continue',
    'and',
    'or',
    'not',
  ],
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/"(?:\\.|[^"\\])*"/, 'string'],
      [/'[^']*'?/, 'invalid'],
      [/\$[A-Za-z_]\w*/, 'variable'],
      [/-?\d+(?:\.\d+)?/, 'number'],
      [/\b(?:true|false)\b/, 'number'],
      [/\b(?:string|number|bool|void|list|File)\b/, 'type'],
      [/[A-Za-z_][\w-]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/[{}()[\]]/, '@brackets'],
      [/[=<>!+*/%|-]+/, 'operator'],
    ],
  },
});
monaco.languages.registerCompletionItemProvider('shellcraft', {
  triggerCharacters: ['$', '.', '/', ' ', '"'],
  async provideCompletionItems(model, position, _context, cancellation) {
    if (!inspector) return { suggestions: [] };
    const source = model.getValue(),
      version = model.getVersionId(),
      offset = model.getOffsetAt(position);
    const info = await inspector(source, offset);
    if (
      cancellation.isCancellationRequested ||
      model.isDisposed() ||
      model.getVersionId() !== version
    )
      return { suggestions: [] };
    const start = model.getPositionAt(info.replaceFrom),
      end = model.getPositionAt(info.replaceTo);
    const kinds = {
      command: monaco.languages.CompletionItemKind.Function,
      variable: monaco.languages.CompletionItemKind.Variable,
      field: monaco.languages.CompletionItemKind.Field,
      type: monaco.languages.CompletionItemKind.Class,
      file: monaco.languages.CompletionItemKind.File,
      directory: monaco.languages.CompletionItemKind.Folder,
      value: monaco.languages.CompletionItemKind.Value,
    };
    const escapeSnippet = (text: string) => text.replace(/[\\$}]/g, (char) => '\\' + char);
    return {
      incomplete: true,
      suggestions: info.completions.map((c) => ({
        label: c.label,
        detail: c.detail,
        kind: kinds[c.kind ?? 'value'],
        insertText:
          c.cursorOffset === undefined
            ? c.insertText
            : escapeSnippet(c.insertText.slice(0, c.cursorOffset)) +
              '$0' +
              escapeSnippet(c.insertText.slice(c.cursorOffset)),
        insertTextRules:
          c.cursorOffset === undefined
            ? undefined
            : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        filterText: c.insertText,
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
      })),
    };
  },
});
monaco.languages.registerHoverProvider('shellcraft', {
  async provideHover(model, position) {
    if (!inspector) return;
    const word = model.getWordAtPosition(position);
    if (!word) return;
    const end = { lineNumber: position.lineNumber, column: word.endColumn };
    const info = await inspector(model.getValue(), model.getOffsetAt(end));
    if (info.hover) return { contents: [{ value: '```text\n' + info.hover + '\n```' }] };
  },
});
monaco.languages.registerDefinitionProvider('shellcraft', {
  async provideDefinition(model, position) {
    if (!inspector) return;
    const word = model.getWordAtPosition(position);
    if (!word) return;
    const info = await inspector(
      model.getValue(),
      model.getOffsetAt({ lineNumber: position.lineNumber, column: word.endColumn }),
    );
    const symbol = info.symbols
      .filter(
        (s) =>
          s.name === word.word.replace(/^\$/, '') &&
          s.start <= model.getOffsetAt(position) &&
          s.end >= model.getOffsetAt(position),
      )
      .at(-1);
    if (!symbol || !symbol.source.startsWith('/home/')) return;
    const target = monaco.Uri.parse('file://' + symbol.source),
      targetModel = monaco.editor.getModel(target);
    const at = targetModel?.getPositionAt(symbol.offset) ?? { lineNumber: 1, column: 1 };
    return {
      uri: target,
      range: new monaco.Range(
        at.lineNumber,
        at.column,
        at.lineNumber,
        at.column + symbol.name.length,
      ),
    };
  },
});

monaco.languages.registerSignatureHelpProvider('shellcraft', {
  signatureHelpTriggerCharacters: [' ', '('],
  async provideSignatureHelp(model, position) {
    if (!inspector) return;
    const info = await inspector(model.getValue(), model.getOffsetAt(position));
    if (!info.signature) return;
    return {
      value: {
        signatures: [{ label: info.signature, parameters: [] }],
        activeSignature: 0,
        activeParameter: 0,
      },
      dispose() {},
    };
  },
});
monaco.languages.registerRenameProvider('shellcraft', {
  async provideRenameEdits(model, position, newName) {
    if (!inspector) return { edits: [], rejectReason: 'Language service unavailable.' };
    if (!/^[A-Za-z_]\w*$/.test(newName))
      return { edits: [], rejectReason: 'Use a variable identifier.' };
    const word = model.getWordAtPosition(position);
    if (!word) return { edits: [], rejectReason: 'Select a variable.' };
    const info = await inspector(
      model.getValue(),
      model.getOffsetAt({ lineNumber: position.lineNumber, column: word.endColumn }),
    );
    if (!info.references?.length)
      return { edits: [], rejectReason: 'Rename a variable in this source file.' };
    if (info.symbols.some((s) => s.name === newName && s.name !== word.word.replace(/^\$/, '')))
      return { edits: [], rejectReason: 'Name already declared.' };
    return {
      edits: info.references.map((ref) => {
        const a = model.getPositionAt(ref.offset),
          b = model.getPositionAt(ref.offset + ref.length);
        return {
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: {
            range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
            text: newName,
          },
        };
      }),
    };
  },
});
