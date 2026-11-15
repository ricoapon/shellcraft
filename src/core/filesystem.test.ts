import { describe, expect, it } from 'vitest';
import { VirtualFileSystem } from './filesystem';
import { resolvePath } from './path';

describe('game paths', () => {
  it.each([
    ['notes.txt', '/home', '/home/notes.txt'],
    ['../notes.txt', '/home/scripts', '/home/notes.txt'],
    ['/logs//./today/../app.txt/', '/home', '/logs/app.txt'],
    ['../../../../', '/home', '/'],
    ['', '/home', '/home'],
  ])('resolves %j from %j to %j', (path, directory, expected) => {
    expect(resolvePath(path, directory)).toBe(expected);
  });

  it('rejects a relative working directory and null characters', () => {
    expect(() => resolvePath('file', 'home')).toThrow('Working directory must be absolute');
    expect(() => resolvePath('/bad\0path')).toThrow('null characters');
  });
});

describe('virtual filesystem', () => {
  it('rejects oversized writes without damaging the previous file', () => {
    const fs = new VirtualFileSystem();
    fs.writeFile('/note.txt', 'keep');
    expect(() => fs.writeFile('/note.txt', 'x'.repeat(250001))).toThrow('size limit');
    expect(fs.readFile('/note.txt')).toBe('keep');
    fs.writeFile('/note.txt', 'shorter');
    expect(new VirtualFileSystem(fs.snapshot()).readFile('/note.txt')).toBe('shorter');
  });
  it('restores an independent snapshot including empty directories', () => {
    const original = new VirtualFileSystem();
    original.mkdir('/empty');
    original.writeFile('/notes.txt', 'before');
    const snapshot = original.snapshot();
    original.writeFile('/notes.txt', 'after');
    const restored = new VirtualFileSystem([...snapshot].reverse());
    expect(restored.readFile('/notes.txt')).toBe('before');
    expect(restored.list('/empty')).toEqual([]);
    restored.writeFile('/notes.txt', 'independent');
    expect(original.readFile('/notes.txt')).toBe('after');
  });

  it.each([
    null,
    [],
    [{ path: '/', type: 'file', content: 'bad root' }],
    [
      { path: '/', type: 'directory' },
      { path: '/', type: 'directory' },
    ],
    [
      { path: '/', type: 'directory' },
      { path: '/a/../b', type: 'directory' },
    ],
    [
      { path: '/', type: 'directory' },
      { path: '/file', type: 'file', content: 123 },
    ],
  ])('rejects invalid filesystem snapshots: %j', (snapshot) => {
    expect(() => new VirtualFileSystem(snapshot)).toThrow();
  });
  it('starts with an empty root and creates, reads, and overwrites text files', () => {
    const fs = new VirtualFileSystem();
    expect(fs.list('/')).toEqual([]);
    fs.mkdir('/home');
    fs.writeFile('notes.txt', 'first version', '/home');
    expect(fs.readFile('/home/notes.txt')).toBe('first version');
    fs.writeFile('./notes.txt', '', '/home');
    expect(fs.readFile('notes.txt', '/home')).toBe('');
  });

  it('lists direct children as sorted records with canonical paths', () => {
    const fs = new VirtualFileSystem();
    fs.mkdir('/home');
    fs.mkdir('/home/scripts');
    fs.writeFile('/home/scripts/tool.js', 'export {};');
    fs.writeFile('/home/notes.txt', 'notes');
    expect(fs.list('.', '/home')).toEqual([
      { path: '/home/notes.txt', name: 'notes.txt', type: 'file' },
      { path: '/home/scripts', name: 'scripts', type: 'directory' },
    ]);
    expect(fs.list('/')).toEqual([{ path: '/home', name: 'home', type: 'directory' }]);
    fs.list('/home').pop();
    expect(fs.list('/home')).toHaveLength(2);
  });

  it('rejects missing parents, missing files, and incompatible entry types', () => {
    const fs = new VirtualFileSystem();
    fs.writeFile('/file', 'keep me');
    expect(() => fs.mkdir('/missing/child')).toThrow('Path not found: /missing');
    expect(() => fs.writeFile('/missing/file', 'text')).toThrow('Path not found: /missing');
    expect(() => fs.readFile('/missing')).toThrow('Path not found: /missing');
    expect(() => fs.list('/file')).toThrow('Not a directory');
    expect(() => fs.mkdir('/file/child')).toThrow('Not a directory');
    expect(() => fs.writeFile('/file/child', 'text')).toThrow('Not a directory');
    expect(() => fs.readFile('/')).toThrow('Is a directory');
    expect(() => fs.writeFile('/', 'text')).toThrow('Is a directory');
    expect(() => fs.mkdir('/file')).toThrow('Path already exists');
    expect(fs.readFile('/file')).toBe('keep me');
  });

  it('keeps separate computers independent', () => {
    const home = new VirtualFileSystem();
    const remote = new VirtualFileSystem();
    home.writeFile('/notes.txt', 'private notes');
    expect(remote.list('/')).toEqual([]);
  });
});
