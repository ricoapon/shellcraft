import { expect, it } from 'vitest';
import { GameEngine } from './engine';
import { validateGameSave } from './save';

it('keeps new files as recoverable drafts until explicitly saved', async () => {
  const game = new GameEngine();
  let restored: GameEngine | undefined;
  try {
    await game.execute('edit /home/draft.js');
    game.settings.editor!.draft = 'unsaved draft';
    expect(() => game.world.home.filesystem.readFile('/home/draft.js')).toThrow('Path not found');
    restored = new GameEngine(validateGameSave(game.snapshot()));
    expect(restored.settings.editor?.draft).toBe('unsaved draft');
    await restored.closeEditor('discard');
    expect(restored.settings.editor).toBeUndefined();
    expect(() => restored!.world.home.filesystem.readFile('/home/draft.js')).toThrow(
      'Path not found',
    );
  } finally {
    game.dispose();
    restored?.dispose();
  }
});

it('discards edits without overwriting a file and saves only on request', async () => {
  const game = new GameEngine();
  try {
    game.world.home.filesystem.writeFile('/home/notes.txt', 'original');
    game.openEditor('/home/notes.txt');
    game.settings.editor!.draft = 'discard me';
    expect(() => game.openEditor('/home/another.txt')).toThrow('Close the current editor');
    expect(game.world.home.filesystem.readFile('/home/notes.txt')).toBe('original');
    const recovered = new GameEngine(validateGameSave(game.snapshot()));
    expect(recovered.settings.editor?.draft).toBe('discard me');
    expect(recovered.settings.editor?.saved).toBe('original');
    recovered.dispose();
    await game.closeEditor('discard', 'discard me');
    game.openEditor('/home/notes.txt');
    expect(game.settings.editor!.draft).toBe('original');
    await game.closeEditor('save', 'keep me');
    expect(game.settings.editor).toBeUndefined();
    expect(game.world.home.filesystem.readFile('/home/notes.txt')).toBe('keep me');
  } finally {
    game.dispose();
  }
});

it('saves, closes, and runs the new source exactly once', async () => {
  const game = new GameEngine();
  try {
    game.campaign.progress.unlocked = ['scripting'];
    await game.execute('edit "/home/my script.mjs"');
    await game.closeEditor('run', 'export function main(ctx) { ctx.print("new-source-ran"); }');
    expect(game.settings.editor).toBeUndefined();
    expect(game.shell.entries.at(-1)?.output).toEqual(['new-source-ran']);
    expect(game.shell.entries.filter((entry) => entry.input.startsWith('run '))).toHaveLength(1);
  } finally {
    game.dispose();
  }
});

it('selects normal or Vim editing explicitly and preserves source on failed saves', async () => {
  const game = new GameEngine();
  try {
    await game.execute('vim /home/note.js');
    expect(game.settings.vim).toBe(true);
    await game.closeEditor('save', 'original');
    await game.execute('edit /home/note.js');
    expect(game.settings.vim).toBe(false);
    await expect(game.closeEditor('save', 'x'.repeat(250001))).rejects.toThrow('250 KB');
    expect(game.settings.editor?.path).toBe('/home/note.js');
    expect(game.world.home.filesystem.readFile('/home/note.js')).toBe('original');
    await game.closeEditor('discard');
    expect(() => game.openEditor('/home/scripts')).toThrow('Is a directory');
  } finally {
    game.dispose();
  }
});
