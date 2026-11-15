/**
 * Separate option tokens from paths. `--` makes all remaining arguments operands.
 * Option values and supported flags belong to the individual command.
 */
export function parseOptions(args: readonly string[]): { options: string[]; operands: string[] } {
  const options: string[] = [];
  const operands: string[] = [];
  let acceptOptions = true;
  for (const arg of args) {
    if (acceptOptions && arg === '--') acceptOptions = false;
    else if (acceptOptions && arg.startsWith('-') && arg !== '-') options.push(arg);
    else operands.push(arg);
  }
  return { options, operands };
}
