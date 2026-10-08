import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const changed = (previous, next) => !previous || !next
  || previous.length !== next.length
  || previous.some((value, index) => !Object.is(value, next[index]));

/**
 * Runs real component/custom-hook code without a browser or React internals.
 * JSX stays as inspectable elements, hooks retain their normal render/effect
 * boundaries, and tests dispatch the event handlers the component renders.
 * Network promises are controlled by each test, not by this harness.
 */
export function renderComponent(relativePath, initialProps, imports = {}, globals = {}, exportName = 'default') {
  const hooks = [];
  let cursor = 0;
  let pendingEffects = [];
  let dirty = true;
  let mounted = true;
  let props = initialProps;
  let tree;
  const react = {
    memo(component) { return component; },
    useDeferredValue(value) { return value; },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      }
      return [hooks[index].value, (value) => {
        if (!mounted) return;
        const next = typeof value === 'function' ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) {
          hooks[index].value = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) {
        hooks[index] = { dependencies, value: factory() };
      }
      return hooks[index].value;
    },
    useCallback(callback, dependencies) {
      return react.useMemo(() => callback, dependencies);
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) {
        const previous = hooks[index];
        const entry = { dependencies };
        hooks[index] = entry;
        pendingEffects.push(() => {
          previous?.cleanup?.();
          entry.cleanup = callback();
        });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;

  const jsx = (type, elementProps) => ({ type, props: elementProps ?? {} });
  const material = new Proxy({}, { get: (_target, key) => String(key) });
  const modules = new Map();
  // Every imported module shares one JavaScript realm, just as in the browser.
  // Separate VM contexts would make `error instanceof Error` fail across files.
  const context = vm.createContext({ console, setTimeout, clearTimeout, queueMicrotask, AbortController, Error, ...globals });
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    function require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name.startsWith('@mui/')) return material;
      if (name === '@/lib/homeTheme') return { brand: {}, CARD_RADIUS: 0 };
      const base = name.startsWith('@/')
        ? path.join(projectRoot, 'src', name.slice(2))
        : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
      const target = base && [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]
        .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(target, `Unexpected component dependency: ${name}`);
      return load(target);
    }
    const execute = vm.runInContext(`(function(exports, module, require) {\n${compiled}\n})`, context, { filename });
    execute(loadedModule.exports, loadedModule, require);
    return loadedModule.exports;
  }
  const Component = load(path.join(projectRoot, relativePath))[exportName];

  async function flush() {
    // Bound even a broken component's rerender loop. Idle microtasks let async
    // loading, queued RPCs and .finally callbacks settle without real sleeps.
    let idle = 0;
    for (let count = 0; count < 200; count += 1) {
      if (dirty && mounted) {
        dirty = false;
        cursor = 0;
        tree = Component(props);
        const effects = pendingEffects;
        pendingEffects = [];
        effects.forEach((effect) => effect());
        idle = 0;
      } else {
        idle += 1;
      }
      await Promise.resolve();
      if (idle >= 30) return;
    }
    throw new Error('Component failed to settle after 200 render/microtask rounds');
  }

  function all(predicate) {
    const found = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object' || !('type' in node) || !node.props) return;
      if (predicate(node)) found.push(node);
      // Material UI renders some content through element-valued slots, such as
      // Alert.action. Include those without treating sx/style objects as JSX.
      Object.values(node.props).forEach(visit);
    }
    visit(tree);
    return found;
  }

  return {
    flush,
    all,
    text() {
      function read(node) {
        if (Array.isArray(node)) return node.map(read).join(' ');
        if (node == null || typeof node === 'boolean') return '';
        if (typeof node !== 'object') return String(node);
        return read(node.props?.children);
      }
      return read(tree).replace(/\s+/g, ' ').trim();
    },
    async act(callback) {
      // Browser event dispatch does not await a handler's network request.
      callback();
      await flush();
    },
    async updateProps(nextProps) {
      props = nextProps;
      dirty = true;
      await flush();
    },
    unmount() {
      mounted = false;
      hooks.forEach((hook) => hook?.cleanup?.());
    },
  };
}
