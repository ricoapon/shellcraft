import { stringArguments, type Command } from './command';
import { fileType, list, nothing, string } from '../runtime/types';
export const filesystemCommands: readonly Command[] = [
  {
    name: 'pwd',
    usage: 'pwd',
    description: 'Show the current directory.',
    signatures: [{ parameters: [], result: string }],
    execute: (_args, system) => ({ value: system.filesystem.directory() }),
  },
  {
    name: 'ls',
    usage: 'ls [path]',
    description: 'List file records.',
    details:
      'List immediate children, including dotfiles, sorted by name. A file path returns a one-element list.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host' }],
        parameters: [string],
        minimum: 0,
        result: list(fileType),
      },
    ],
    execute(args, system) {
      const [path = '.'] = stringArguments(args),
        entry = system.filesystem.stat(path),
        entries = entry.type === 'file' ? [entry] : [...system.filesystem.list(path)];
      return {
        value: entries
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
          .map((e) => ({ ...e })),
      };
    },
  },
  {
    name: 'cd',
    usage: 'cd <path>',
    description: 'Change the current directory.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host', entries: 'directory' }],
        parameters: [string],
        result: nothing,
      },
    ],
    execute(args, system) {
      system.filesystem.cd(stringArguments(args)[0]);
      return {};
    },
  },
  {
    name: 'cat',
    usage: 'cat <path>',
    description: 'Read file text.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host', entries: 'file' }],
        parameters: [string],
        result: string,
      },
    ],
    execute: (args, system) => ({ value: system.filesystem.read(stringArguments(args)[0]) }),
  },
  {
    name: 'write',
    usage: 'write <path> <text>',
    description: 'Create or replace a file.',
    details: 'The parent must exist. Level evidence is read-only. Quote text containing spaces.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host' }],
        parameters: [string, string],
        result: nothing,
      },
    ],
    execute(args, system) {
      const [path, text] = stringArguments(args);
      system.filesystem.write(path, text);
      return {};
    },
  },
  {
    name: 'mkdir',
    usage: 'mkdir <path>',
    description: 'Create a directory.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host', entries: 'directory' }],
        parameters: [string],
        result: nothing,
      },
    ],
    execute(args, system) {
      system.filesystem.mkdir(stringArguments(args)[0]);
      return {};
    },
  },
  {
    name: 'rm',
    usage: 'rm <path>',
    description: 'Remove a file.',
    details: 'Accepts one file; directories are rejected.',
    signatures: [
      {
        completion: [{ kind: 'path', scope: 'host', entries: 'file' }],
        parameters: [string],
        result: nothing,
      },
    ],
    execute(args, system) {
      system.filesystem.remove(stringArguments(args)[0]);
      return {};
    },
  },
];
