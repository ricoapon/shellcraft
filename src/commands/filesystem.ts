import { requireArguments, type Command } from './command';
import { parseOptions } from './options';

/** Adapt structured filesystem operations to human-readable shell commands. */
export const filesystemCommands: readonly Command[] = [
  {
    name: 'pwd',
    description: 'Print the current directory.',
    usage: 'pwd',
    execute(args, system) {
      requireArguments(args, 0, 'pwd');
      return [system.filesystem.directory()];
    },
  },
  {
    name: 'ls',
    description: 'List files and directories.',
    details:
      'List multiple paths, or use -- before filenames starting with a dash. Options such as -l are reserved but not implemented. Dotfiles are hidden by default.',
    usage: 'ls [path...]',
    execute(args, system) {
      const { options, operands } = parseOptions(args);
      if (options.length) throw new Error(`ls: unsupported option: ${options[0]}`);
      const paths = operands.length ? operands : ['.'];
      return paths.flatMap((path) => {
        try {
          const entry = system.filesystem.stat(path);
          if (entry.type === 'file') return [path];
          const names = system.filesystem
            .list(path)
            .filter((child) => !child.name.startsWith('.'))
            .map((child) => child.name);
          return paths.length > 1 ? [`${path}:`, ...names] : names;
        } catch (error) {
          return [`ls: ${error instanceof Error ? error.message : 'Could not list path.'}`];
        }
      });
    },
  },
  {
    name: 'cd',
    description: 'Change the current directory.',
    usage: 'cd <path>',
    execute(args, system) {
      requireArguments(args, 1, 'cd <path>');
      system.filesystem.cd(args[0]);
      return [];
    },
  },
  {
    name: 'cat',
    description: 'Print a text file.',
    usage: 'cat <path>',
    execute(args, system) {
      requireArguments(args, 1, 'cat <path>');
      return [system.filesystem.read(args[0])];
    },
  },
  {
    name: 'mkdir',
    description: 'Create a directory.',
    details: 'The parent directory must already exist.',
    usage: 'mkdir <path>',
    execute(args, system) {
      requireArguments(args, 1, 'mkdir <path>');
      system.filesystem.mkdir(args[0]);
      return [];
    },
  },
  {
    name: 'write',
    description: 'Create or replace a text file.',
    details:
      'Replace a workspace file in full. Quote text containing spaces; use single quotes around JSON to preserve its double quotes. The parent directory must exist. Level evidence is read-only; use edit /home/solve.js for your personal code notebook while inside a level.',
    example: 'write notes.txt "hello world"',
    usage: 'write <path> "text"',
    execute(args, system) {
      requireArguments(args, 2, 'write <path> "text"');
      system.filesystem.write(args[0], args[1]);
      return [];
    },
  },
  {
    name: 'rm',
    description: 'Delete files.',
    details:
      'Delete one or more writable files. Use -- before filenames starting with a dash. Directories and options such as -r are not supported.',
    example: 'rm -- -draft.txt',
    usage: 'rm <path...>',
    execute(args, system) {
      const { options, operands } = parseOptions(args);
      if (options.length) throw new Error(`rm: unsupported option: ${options[0]}`);
      if (!operands.length) throw new Error('Usage: rm <path...>');
      return operands.flatMap((path) => {
        try {
          system.filesystem.remove(path);
          return [];
        } catch (error) {
          return [`rm: ${error instanceof Error ? error.message : 'Could not delete file.'}`];
        }
      });
    },
  },
];
