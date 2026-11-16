import { expect, it, vi } from 'vitest';
import { CommandHistory } from './history';
import { Readline } from './readline';

const draft = { source: 'echo unfinished', cursor: 5 };

it('recalls older and newer submissions and restores the unfinished draft and caret', () => {
  const history = new CommandHistory();
  history.append('echo first');
  history.append('echo second\necho third');
  expect(history.move('older', draft)?.source).toBe('echo second\necho third');
  expect(history.move('older', draft)?.source).toBe('echo first');
  expect(history.move('older', draft)).toBeUndefined();
  expect(history.move('newer', draft)?.source).toBe('echo second\necho third');
  expect(history.move('newer', draft)).toEqual(draft);
  expect(history.move('newer', draft)).toBeUndefined();
});

it('keeps recalled edits out of stored commands and resets recall on submit, cancel, and clear', () => {
  const history = new CommandHistory();
  history.append('echo first');
  history.move('older', draft);
  expect(history.move('newer', { source: 'edited recall', cursor: 4 })).toEqual(draft);
  history.append('echo first');
  history.append('  ');
  expect(history.move('older', draft)?.source).toBe('echo first');
  expect(history.move('older', draft)).toBeUndefined();
  history.reset();
  const newDraft = { source: 'new draft', cursor: 3 };
  history.move('older', newDraft);
  expect(history.move('newer', draft)).toEqual(newDraft);
  history.clear();
  expect(history.move('older', draft)).toBeUndefined();
});

it('never reads or writes browser history storage through the Readline addon', () => {
  const localStorage = { getItem: vi.fn(), setItem: vi.fn() };
  vi.stubGlobal('window', { localStorage });
  try {
    const readline = new Readline();
    readline.appendHistory('echo private');
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
