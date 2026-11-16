import { RE2JS } from 're2js';

/** RE2JS 2.x: RE2 syntax, case-sensitive matching, full matches only.
 * https://github.com/le0pard/re2js
 * https://github.com/google/re2/wiki/Syntax
 */
export function matchText(pattern: string, text: string): string[] {
  if (pattern.length > 256) throw new Error('Regex pattern exceeds 256 characters.');
  if (text.length > 250_000) throw new Error('Regex input exceeds 250 KB.');
  const matcher = RE2JS.compile(pattern).matcher(text),
    matches: string[] = [];
  while (matcher.find()) {
    matches.push(matcher.group()!);
    if (matches.length > 10_000) throw new Error('Regex match count limit exceeded.');
  }
  return matches;
}
