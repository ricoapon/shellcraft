import { getQuickJS } from 'quickjs-emscripten';
import type { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten';
import { resolvePath } from '../core/path';
import type { CommandInfo } from '../commands/command';

export interface Registrations {
  commands: CommandInfo[];
  screens: { name: string; title?: string }[];
  controllers: { name: string }[];
}
export interface ViewNode {
  type: string;
  title?: string;
  text?: string;
  data?: unknown;
  children?: ViewNode[];
  onSelect?: string;
  onClick?: string;
  [key: string]: unknown;
}

const bootstrap = `
function call(name, ...args) {
  const result = JSON.parse(__bridge(name, JSON.stringify(args)));
  if (result.error) throw new Error(result.error);
  return result.value;
}
function filesystem(host) {
  return {
    list: (path = '.') => call('fs.list', host, path),
    read: path => call('fs.read', host, path),
    readFile: path => call('fs.read', host, path),
    write: (path, content) => call('fs.write', host, path, content),
    writeFile: (path, content) => call('fs.write', host, path, content),
    mkdir: path => call('fs.mkdir', host, path),
    stat: path => call('fs.stat', host, path),
  };
}
globalThis.__commands = Object.create(null);
globalThis.__screens = Object.create(null);
globalThis.__controllers = Object.create(null);
globalThis.__handlers = Object.create(null);
globalThis.ctx = {
  fs: filesystem(null), home: filesystem('home'),
  print: (...values) => call('print', values.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ')),
  session: {
    get host() { return call('session.info').host; },
    get workingDirectory() { return call('session.info').workingDirectory; },
    connect: host => call('session.connect', host),
    exit: () => call('session.exit'),
  },
  network: {
    neighbors: host => call('network.neighbors', host),
    connect: host => {
      const id = call('network.connect', host);
      return { id, fs: filesystem(id), neighbors: () => call('network.neighbors', id), inspect: () => call('inspect', id) };
    },
  },
  inspect: host => call('inspect', host),
  storage: {
    get: (key, fallback = null) => call('storage.get', key) ?? fallback,
    set: (key, value) => call('storage.set', key, value),
    delete: key => call('storage.delete', key),
  },
  commands: {
    register: (name, fn, metadata = {}) => {
      call('capability', 'commands');
      if (typeof fn !== 'function') throw new Error('Command handler must be a function.');
      __commands[name] = { fn, ...metadata };
    },
    invoke: (name, args = []) => call('commands.invoke', name, args),
  },
  screens: {
    register: (name, render, options = {}) => {
      call('capability', 'screens');
      if (typeof render !== 'function') throw new Error('Screen renderer must be a function.');
      __screens[name] = { render, ...options };
    },
  },
  controllers: {
    register: (name, control) => {
      call('capability', 'controllers');
      if (typeof control !== 'function') throw new Error('Controller must be a function.');
      __controllers[name] = control;
    },
  },
  simulation: {
    get state() { return call('simulation.state'); },
    pause: () => call('simulation.pause'), resume: () => call('simulation.resume'),
    step: (count = 1) => call('simulation.step', count),
  },
  mission: {
    get briefing() { return call('mission.briefing'); },
    get actions() { return call('mission.actions'); },
    get observations() { return call('observations'); },
    get status() { return call('mission.status'); },
    action: action => call('mission.action', action),
    submit: answer => call('mission.submit', answer),
  },
  get capabilities() { return call('capabilities'); },
};
globalThis.console = { log: ctx.print, warn: ctx.print, error: ctx.print };
globalThis.view = {};
for (const type of ['text','table','barChart','lineChart','mermaid','networkGraph','button']) {
  view[type] = props => ({ type, ...(typeof props === 'string' ? {text:props} : props) });
}
view.stack = (...children) => ({ type:'stack', children: children.flat() });
function serializeView(value, scope) {
  for (const key of Object.keys(__handlers)) if (key.startsWith(scope + ':')) delete __handlers[key];
  let index = 0;
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (typeof entry !== 'function') return entry;
    const id = scope + ':handler-' + index++;
    __handlers[id] = entry;
    return id;
  }));
}
`;

/** Each source module owns an isolated interpreter and its registrations. No eval on the host. */
export class PlayerModule {
  private deadline = 0;
  private operations = 0;
  private readonly vm: QuickJSContext;
  private readonly runtime: QuickJSRuntime;
  private disposed = false;

  private constructor(
    readonly path: string,
    quickJS: Awaited<ReturnType<typeof getQuickJS>>,
    readModule: (path: string) => string,
    api: (name: string, args: unknown[]) => unknown,
  ) {
    this.runtime = quickJS.newRuntime();
    this.runtime.setMemoryLimit(32 * 1024 * 1024);
    this.runtime.setMaxStackSize(512 * 1024);
    this.runtime.setInterruptHandler(() => performance.now() > this.deadline);
    this.runtime.setModuleLoader(
      (name) => readModule(name),
      (base, name) => {
        if (!name.startsWith('/') && !name.startsWith('.'))
          throw new Error('Import player modules using absolute or relative game paths.');
        return resolvePath(name, base.slice(0, base.lastIndexOf('/')) || '/');
      },
    );
    this.vm = this.runtime.newContext();
    const bridge = this.vm.newFunction('__bridge', (method, values) => {
      try {
        if (++this.operations > 10_000)
          throw new Error('Game API operation limit exceeded (10000).');
        const result = api(this.vm.getString(method), JSON.parse(this.vm.getString(values)));
        return this.vm.newString(JSON.stringify({ value: result ?? null }));
      } catch (error) {
        return this.vm.newString(
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        );
      }
    });
    this.vm.setProp(this.vm.global, '__bridge', bridge);
    bridge.dispose();
    this.evaluate(bootstrap);
    try {
      this.evaluate(
        `import * as entry from ${JSON.stringify(path)}; globalThis.__entry = entry;`,
        '/__launch.mjs',
        true,
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  static async create(
    path: string,
    readModule: (path: string) => string,
    api: (name: string, args: unknown[]) => unknown,
  ): Promise<PlayerModule> {
    return new PlayerModule(path, await getQuickJS(), readModule, api);
  }

  evaluate(code: string, filename = '/__bridge.js', module = false): unknown {
    if (this.disposed) throw new Error('Module has been unloaded. Reload its source.');
    this.deadline = performance.now() + 250;
    this.operations = 0;
    const result = this.vm.evalCode(code, filename, { type: module ? 'module' : 'global' });
    if (result.error) {
      const error = this.vm.dump(result.error) as { message?: string; stack?: string };
      result.error.dispose();
      throw new Error(
        `${this.path}: ${error.message ?? String(error)}${error.stack ? `\n${error.stack}` : ''}`,
      );
    }
    const value = this.vm.dump(result.value);
    result.value.dispose();
    return value;
  }

  hasExport(name: string): boolean {
    return this.evaluate(`typeof __entry[${JSON.stringify(name)}] === 'function'`) === true;
  }

  invoke(name: string, args: string[] = []): unknown {
    if (!this.hasExport(name)) throw new Error(`${this.path} must export function ${name}.`);
    return this.evaluate(
      `globalThis.__result = __entry[${JSON.stringify(name)}](ctx, ${JSON.stringify(args)});
      if (__result && typeof __result.then === 'function') throw new Error('Player entry points must finish synchronously.');
      __result;`,
      this.path,
    );
  }

  registrations(): Registrations {
    return this.evaluate(`({
      commands:Object.entries(__commands).map(([name, value])=>({name,description:value.description,details:value.details,usage:value.usage,example:value.example})),
      screens:Object.entries(__screens).map(([name,value])=>({name,title:value.title})),
      controllers:Object.keys(__controllers).map(name=>({name}))
    })`) as Registrations;
  }

  command(name: string, args: string[]): void {
    this.evaluate(
      `globalThis.__result=__commands[${JSON.stringify(name)}].fn(${JSON.stringify(args)});
      if(__result&&typeof __result.then==='function') throw new Error('Player commands must finish synchronously.');`,
      this.path,
    );
  }

  render(name: string | undefined, observations: unknown, scope = 'view'): ViewNode {
    const fn = name ? `__screens[${JSON.stringify(name)}].render` : '__entry.render';
    return this.evaluate(
      `serializeView(${fn}(view, ${JSON.stringify(observations)}), ${JSON.stringify(scope)})`,
      this.path,
    ) as ViewNode;
  }

  control(name: string | undefined, observations: unknown): unknown {
    const fn = name ? `__controllers[${JSON.stringify(name)}]` : '__entry.control';
    return this.evaluate(`${fn}(${JSON.stringify(observations)})`, this.path);
  }

  interact(handler: string, value: unknown): void {
    this.evaluate(
      `if (typeof __handlers[${JSON.stringify(handler)}] !== 'function') throw new Error('Screen changed; select the item again.');
      globalThis.__result=__handlers[${JSON.stringify(handler)}](${JSON.stringify(value)});
      if(__result&&typeof __result.then==='function') throw new Error('Screen handlers must finish synchronously.');`,
      this.path,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.vm.dispose();
    this.runtime.dispose();
  }
}
