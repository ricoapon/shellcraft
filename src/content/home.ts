import type { VirtualFileSystem } from '../core/filesystem';
export const homeFiles: Record<string, string> = {
  '/home/README.md': `# Your code workspace

Choose a level with mission. Files and stars are saved; terminal output is temporary.
Starting a level connects to its entry machine. Home is outside every level network.
Your personal code travels with you: edit, vim, and run always open /home source files.
The scripts read evidence from the level through ctx.fs, not from the code workspace.

Begin with mission start files-1. Scripting is available immediately; networking opens after files-2.
Use guide scripts for tiny examples, mission hint for staged clues, and help <command> for syntax.
No complete solvers are supplied. Build tools you can keep improving.

One star: solve by any method. Two stars: mission submit --script /home/solve.js
verifies your program on five fresh instances. Its main(ctx,args) should call
ctx.mission.submit(value). Verification ignores cached player data and preserves your explored instance.

edit: Ctrl+S saves/exits, Ctrl+Q discards/exits, Ctrl+Enter saves/exits/runs.
vim: :w saves, :q quits, :q! discards, :wq or :x saves/quits, :run saves/quits/runs.
`,
  '/home/solve.js':
    'export function main(ctx, args) {\n  // Read the evidence and submit your result here.\n}\n',
};
export function installHomeFiles(filesystem: VirtualFileSystem) {
  for (const [path, text] of Object.entries(homeFiles)) {
    try {
      filesystem.stat(path);
    } catch {
      filesystem.writeFile(path, text);
    }
  }
}
