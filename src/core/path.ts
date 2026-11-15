/** Resolve a game path lexically using POSIX separators, independent of the host OS. */
export function resolvePath(path: string, workingDirectory = '/'): string {
  if (!workingDirectory.startsWith('/')) throw new Error('Working directory must be absolute.');
  if (path.includes('\0') || workingDirectory.includes('\0'))
    throw new Error('Paths cannot contain null characters.');

  const parts: string[] = [];
  const combined = path.startsWith('/') ? path : `${workingDirectory}/${path}`;
  for (const part of combined.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}
