import type { VirtualFileSystem } from '../core/filesystem';
export const starterSource = '# Read the evidence and submit your result here.\n';
export const homeFiles: Record<string, string> = {
  '/home/README.md': `# Your Shellcraft workspace

Start with mission start files-1. Use ls and cat to inspect evidence.
The shell and .sc files use exactly the same language. Try guide scripts.
Save your program with edit /home/solve.sc, then run /home/solve.sc.
One star means solved by any method. mission submit --script /home/solve.sc
verifies fresh cases for the optional second star. Hints never reduce stars.

Inside a level, filesystem commands refer to the connected host.
edit, vim, run, and use refer to your personal /home source notebook.
exit returns to the previous host; mission leave returns to the workspace.
Scripts may start and leave missions, keeping their own variables and functions.

Normal editor: Ctrl+S saves/exits, Ctrl+Q discards, Ctrl+Enter saves/exits/runs.
Vim: :w, :q, :q!, :wq/:x, :run.
Terminal blocks can span lines; Tab completes commands, values, paths, and known hosts.
Files and progress are saved. Terminal output, history, and variables are temporary.
`,
  '/home/solve.sc': starterSource,
  '/home/example.sc':
    '# Individual operations, not a mission solver.\nlet text = "release=r42"\necho (split "=" $text)\necho (match \'[0-9]+\' $text)\n',
};
export function installHomeFiles(filesystem: VirtualFileSystem) {
  for (const [path, text] of Object.entries(homeFiles)) {
    try {
      filesystem.stat(path);
      continue;
    } catch {
      /* Install only missing files. */
    }
    filesystem.writeFile(path, text);
  }
}
