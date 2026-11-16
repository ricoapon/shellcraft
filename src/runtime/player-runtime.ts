import { getQuickJS } from 'quickjs-emscripten';
import type { QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten';
import { resolvePath } from '../core/path';
const bootstrap = `
function call(name,...args) {
  const result=JSON.parse(__bridge(name,JSON.stringify(args)));
  if(result.error) throw new Error(result.error);
  return result.value;
}
function filesystem(host) { return {
  list:(path='.')=>call('fs.list',host,path),
  read:path=>call('fs.read',host,path),
  stat:path=>call('fs.stat',host,path),
}; }
globalThis.ctx={
  fs:filesystem(null),
  print:(...values)=>call('print',values.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')),
  session:{get host(){return call('session.info').host;},get workingDirectory(){return call('session.info').workingDirectory;},connect:host=>call('session.connect',host),exit:()=>call('session.exit')},
  network:{neighbors:host=>call('network.neighbors',host),connect:host=>{const id=call('network.connect',host);return {id,fs:filesystem(id),neighbors:()=>call('network.neighbors',id)};}},
  storage:{get:(key,fallback=null)=>call('storage.get',key)??fallback,set:(key,value)=>call('storage.set',key,value),delete:key=>call('storage.delete',key)},
  mission:{get briefing(){return call('mission.briefing');},get status(){return call('mission.status');},submit:answer=>call('mission.submit',answer)},
  get capabilities(){return call('capabilities');},
};
globalThis.console={log:ctx.print,warn:ctx.print,error:ctx.print};
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.vm.dispose();
    this.runtime.dispose();
  }
}
