export interface HistoryInput {
  source: string;
  cursor: number;
}

/** Command recall belongs to a live terminal, never to the game save. */
export class CommandHistory {
  private entries: string[] = [];
  private position = 0;
  private draft: HistoryInput = { source: '', cursor: 0 };

  append(source: string) {
    if (source.trim() && this.entries.at(-1) !== source) {
      this.entries.push(source);
      if (this.entries.length > 200) this.entries.shift();
    }
    this.reset();
  }

  reset() {
    this.position = this.entries.length;
    this.draft = { source: '', cursor: 0 };
  }

  clear() {
    this.entries = [];
    this.reset();
  }

  move(direction: 'older' | 'newer', current: HistoryInput): HistoryInput | undefined {
    if (direction === 'older') {
      if (this.position === 0) return;
      if (this.position === this.entries.length) this.draft = { ...current };
      this.position--;
    } else {
      if (this.position === this.entries.length) return;
      this.position++;
    }
    if (this.position === this.entries.length) return { ...this.draft };
    const source = this.entries[this.position];
    return { source, cursor: source.length };
  }
}
