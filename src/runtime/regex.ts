import { RE2JS } from 're2js';

/** RE2JS 2.x: RE2 syntax, case-sensitive matching, optional capture selection.
 * https://github.com/le0pard/re2js
 * https://github.com/google/re2/wiki/Syntax
 */
export function matchText(pattern: string, text: string, group = 0): string[] {
  if (!Number.isSafeInteger(group) || group < 0)
    throw new Error('Regex group must be a non-negative integer.');
  if (pattern.length > 256) throw new Error('Regex pattern exceeds 256 characters.');
  if (text.length > 250_000) throw new Error('Regex input exceeds 250 KB.');
  const matcher = RE2JS.compile(pattern).matcher(text),
    matches: string[] = [];
  if (group > matcher.groupCount())
    throw new Error(
      `Capture group ${group} does not exist. Pattern has ${matcher.groupCount()} capture groups.`,
    );
  while (matcher.find()) {
    matches.push(matcher.group(group) ?? '');
    if (matches.length > 10_000) throw new Error('Regex match count limit exceeded.');
  }
  return matches;
}
