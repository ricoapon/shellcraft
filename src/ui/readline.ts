import { History } from 'xterm-readline/lib/history';

// Readline 2.x calls these hooks unconditionally. Disable its persistence before
// constructing any addon; Shellcraft owns temporary recall in CommandHistory.
History.prototype.saveToLocalStorage = () => {};
History.prototype.restoreFromLocalStorage = () => {};

export { Readline } from 'xterm-readline';
