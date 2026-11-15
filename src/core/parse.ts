/** A deliberately small grammar: whitespace, quotes, and backslash escapes. No operators. */
export function parseCommand(input: string): string[] {
  const words: string[] = [];
  let word = '';
  let started = false;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (const character of input) {
    if (escaped) {
      word += character;
      escaped = false;
    } else if (character === '\\' && quote !== "'") {
      escaped = true;
      started = true;
    } else if (quote) {
      if (character === quote) quote = undefined;
      else word += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += character;
      started = true;
    }
  }

  if (escaped) throw new Error('Incomplete escape.');
  if (quote) throw new Error('Unclosed quote.');
  if (started) words.push(word);
  return words;
}
