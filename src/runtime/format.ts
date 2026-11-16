import type { Value } from './types';
/** Presentation is applied only at an uncaptured value boundary. */
export function formatValue(value: Value): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((v) => typeof v === 'object' && !Array.isArray(v))) {
      const rows = value as Record<string, Value>[];
      const keys = [...new Set(rows.flatMap(Object.keys))];
      const cells = rows.map((row) =>
        keys.map((k) => (Object.hasOwn(row, k) ? formatValue(row[k]) : '')),
      );
      const widths = keys.map((k, i) =>
        Math.min(80, Math.max(k.length, ...cells.map((row) => row[i].length))),
      );
      const line = (row: string[]) =>
        row
          .map((v, i) => v.replace(/\n/g, ' ').slice(0, 80).padEnd(widths[i]))
          .join('  ')
          .trimEnd();
      return [line(keys), ...cells.map(line)].join('\n');
    }
    return value.map(formatValue).join('\n');
  }
  if (typeof value === 'object' && Object.keys(value).length === 0) return '{}';
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join('\n');
  return String(value);
}
