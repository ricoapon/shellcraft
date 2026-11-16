/** Small bounded backtracking regex evaluator. Never executes an untrusted native RegExp. */
type Node =
  | { kind: 'character'; test: (c: string) => boolean }
  | { kind: 'anchor'; end: boolean }
  | { kind: 'sequence'; nodes: Node[] }
  | { kind: 'choice'; nodes: Node[] }
  | { kind: 'repeat'; node: Node; minimum: number; maximum: number };
export function matchText(pattern: string, text: string): string[] {
  if (pattern.length > 256) throw new Error('Regex pattern exceeds 256 characters.');
  let position = 0,
    depth = 0,
    work = 0;
  const fail = (): never => {
    throw new Error('Invalid or unsupported regex pattern.');
  };
  const escape = (): ((c: string) => boolean) => {
    const c = pattern[position++];
    if (c === 'd') return (c) => c >= '0' && c <= '9';
    if (c === 'w') return (c) => /^[A-Za-z0-9_]$/.test(c);
    if (c === 's') return (c) => /^\s$/u.test(c);
    const literals: Record<string, string> = { n: '\n', r: '\r', t: '\t' };
    if (Object.hasOwn(literals, c)) return (v) => v === literals[c];
    if (!c || !'.[](){}*+?|^$\\-'.includes(c)) fail();
    return (v) => v === c;
  };
  const character = (): Node => {
    const c = pattern[position++];
    if (c === '\\') return { kind: 'character', test: escape() };
    if (c === '^' || c === '$') return { kind: 'anchor', end: c === '$' };
    if (c === '.') return { kind: 'character', test: (c) => c !== '\n' && c !== '\r' };
    if (c === '[') {
      const negate = pattern[position] === '^';
      if (negate) position++;
      const tests: ((c: string) => boolean)[] = [];
      while (position < pattern.length && pattern[position] !== ']') {
        const start = pattern[position++];
        if (start === '\\') tests.push(escape());
        else if (pattern[position] === '-' && pattern[position + 1] !== ']') {
          position++;
          const end = pattern[position++];
          if (!end || end === '\\' || start.codePointAt(0)! > end.codePointAt(0)!) fail();
          tests.push(
            (c) =>
              c.codePointAt(0)! >= start.codePointAt(0)! &&
              c.codePointAt(0)! <= end.codePointAt(0)!,
          );
        } else tests.push((c) => c === start);
      }
      if (pattern[position++] !== ']' || !tests.length) fail();
      return { kind: 'character', test: (c) => tests.some((test) => test(c)) !== negate };
    }
    if (c === '(') {
      if (++depth > 20 || pattern[position] === '?') fail();
      const node = choice();
      if (pattern[position++] !== ')') fail();
      depth--;
      return node;
    }
    if (!c || '*+?{}])'.includes(c)) fail();
    return { kind: 'character', test: (v) => v === c };
  };
  const sequence = (): Node => {
    const nodes: Node[] = [];
    while (position < pattern.length && !['|', ')'].includes(pattern[position])) {
      let node = character();
      const q = pattern[position];
      let minimum: number | undefined,
        maximum = 0;
      if (q === '*' || q === '+' || q === '?') {
        position++;
        minimum = q === '+' ? 1 : 0;
        maximum = q === '?' ? 1 : Infinity;
      } else if (q === '{') {
        const match = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(position));
        if (!match) fail();
        position += match![0].length;
        minimum = Number(match![1]);
        maximum =
          match![2] === undefined ? minimum : match![2] === '' ? Infinity : Number(match![2]);
        if (minimum > 1000 || (maximum !== Infinity && maximum > 1000) || maximum < minimum) fail();
      }
      if (minimum !== undefined) {
        if (node.kind === 'anchor') fail();
        node = { kind: 'repeat', node, minimum, maximum };
      }
      nodes.push(node);
    }
    return { kind: 'sequence', nodes };
  };
  const choice = (): Node => {
    const nodes = [sequence()];
    while (pattern[position] === '|') {
      position++;
      nodes.push(sequence());
    }
    return { kind: 'choice', nodes };
  };
  const root = choice();
  if (position !== pattern.length) fail();
  const input = Array.from(text);
  const tick = () => {
    if (++work > 200_000) throw new Error('Regex execution limit exceeded.');
  };
  function* evaluate(node: Node, start: number, nesting = 0): Generator<number> {
    tick();
    if (nesting > 1000) throw new Error('Regex nesting limit exceeded.');
    if (node.kind === 'character') {
      if (start < input.length && node.test(input[start])) yield start + 1;
    } else if (node.kind === 'anchor') {
      if (start === (node.end ? input.length : 0)) yield start;
    } else if (node.kind === 'choice') {
      for (const child of node.nodes) yield* evaluate(child, start, nesting + 1);
    } else if (node.kind === 'sequence') {
      function* next(index: number, at: number): Generator<number> {
        tick();
        if (index === nodeAsSequence.nodes.length) {
          yield at;
          return;
        }
        for (const end of evaluate(nodeAsSequence.nodes[index], at, nesting + 1))
          yield* next(index + 1, end);
      }
      const nodeAsSequence = node;
      yield* next(0, start);
    } else {
      // An explicit stack avoids host stack overflow for long greedy repetitions.
      const stack: { at: number; count: number; iterator?: Generator<number> }[] = [
        { at: start, count: 0 },
      ];
      while (stack.length) {
        tick();
        const current = stack[stack.length - 1];
        if (!current.iterator && current.count < node.maximum)
          current.iterator = evaluate(node.node, current.at, nesting + 1);
        const next = current.iterator?.next();
        if (next && !next.done && next.value !== current.at) {
          stack.push({ at: next.value, count: current.count + 1 });
          continue;
        }
        if (next && !next.done && next.value === current.at && current.count < node.minimum) {
          stack.push({ at: next.value, count: current.count + 1 });
          continue;
        }
        if (next && !next.done) continue;
        stack.pop();
        if (current.count >= node.minimum) yield current.at;
      }
    }
  }
  const matches: string[] = [];
  for (let start = 0; start <= input.length;) {
    const match = evaluate(root, start).next();
    if (match.done) {
      start++;
      continue;
    }
    matches.push(input.slice(start, match.value).join(''));
    if (matches.length > 10_000) throw new Error('Regex match count limit exceeded.');
    start = match.value > start ? match.value : start + 1;
  }
  return matches;
}
