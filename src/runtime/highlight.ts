import { lexicalTokens } from './syntax';
const colors: Record<string, string> = {
  Text: '166;218;149',
  Unclosed: '166;218;149',
  SingleQuoted: '237;135;150',
  Numeric: '245;169;127',
  Variable: '138;173;244',
};
const keywords = new Set([
  'Let',
  'Mut',
  'Def',
  'TypeKeyword',
  'Use',
  'If',
  'Else',
  'For',
  'In',
  'While',
  'Return',
  'Break',
  'Continue',
  'And',
  'Or',
  'Not',
]);
export function highlightSource(source: string): string {
  const tokens = lexicalTokens(source).tokens;
  let at = 0,
    out = '';
  for (const token of tokens) {
    out += source.slice(at, token.startOffset);
    const color =
      colors[token.tokenType.name] ??
      (keywords.has(token.tokenType.name) ? '198;160;246' : undefined);
    out += (color ? '\x1b[38;2;' + color + 'm' : '') + token.image + (color ? '\x1b[39m' : '');
    at = (token.endOffset ?? token.startOffset) + 1;
  }
  return out + source.slice(at);
}
