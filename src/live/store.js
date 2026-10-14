// A clay.live store: one JSON value held in memory and changed only through ops.
// What page code reads (state) is the last value the store accepted from outside
// (authoritative) with this tab's own unconfirmed ops (pending) replayed over it.
// Local ops change state at once. When authoritative moves, state is rebuilt in
// place, so an object or list page code holds a reference to stays live.

import { validateOp, checkOp, applyOp, applyOps, cloneJson, assignDeep, coalesce } from "./ops.js";

const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
const INDEX = /^(0|[1-9]\d*)$/;
const isContainer = (v) => v !== null && typeof v === "object";
const kind = (v) => (Array.isArray(v) ? "a list" : "an object");

function readPath(root, path) {
  let node = root;
  for (const seg of path) {
    if (!isContainer(node)) return undefined;
    if (Array.isArray(node)) node = node[Number(seg)];
    else node = Object.prototype.hasOwnProperty.call(node, seg) ? node[seg] : undefined;
  }
  return node;
}

// applyOp, except that a set replacing a container with one of the same kind
// rewrites it in place, so a proxy over the old container still points at the
// value page code sees.
function applyInPlace(root, op) {
  if (op.op === "set") {
    const current = readPath(root, op.path);
    if (isContainer(current) && isContainer(op.value) && Array.isArray(current) === Array.isArray(op.value)) {
      assignDeep(current, cloneJson(op.value));
      return;
    }
  }
  applyOp(root, op);
}

export function createStore({ name, value, ephemeral = false }) {
  if (!isContainer(value)) throw new TypeError(`clay.live("${name}"): the tag must hold a JSON object or list`);

  let authoritative = cloneJson(value);
  const state = cloneJson(value);
  let pending = [];
  let batch = null;
  let mode = "file";
  const listeners = new Set();
  const sinks = new Set();
  const views = new WeakMap();

  function emit(source, ops) {
    const event = { source, ops };
    for (const fn of [...listeners]) {
      try {
        fn(event);
      } catch (err) {
        console.error(`clay.live("${name}"): a change listener threw`, err);
      }
    }
  }

  function rebuild() {
    let next = cloneJson(authoritative);
    const kept = [];
    for (const op of pending) {
      try {
        checkOp(next, op);
        next = applyOp(next, op);
        kept.push(op);
      } catch {}
    }
    pending = kept;
    assignDeep(state, next);
  }

  function publish(ops) {
    for (const sink of [...sinks]) {
      try {
        sink(ops);
      } catch (err) {
        console.error(`clay.live("${name}"): a transport threw`, err);
      }
    }
    emit("local", ops);
  }

  function commit(rawOps) {
    const ops = rawOps.map(validateOp);
    for (const op of ops) {
      if (op.path.length === 0 && kind(op.value) !== kind(state)) {
        throw new TypeError(`clay.live("${name}"): the whole value must stay ${kind(state)}`);
      }
    }
    if (ops.length === 1) checkOp(state, ops[0]);
    else applyOps(cloneJson(state), ops);
    for (const op of ops) applyInPlace(state, op);
    pending.push(...ops);
    if (batch) batch.push(...ops);
    else publish(ops);
  }

  function view(target, path) {
    let byPath = views.get(target);
    if (!byPath) views.set(target, (byPath = new Map()));
    const key = JSON.stringify(path);
    let proxy = byPath.get(key);
    if (!proxy) {
      proxy = new Proxy(target, traps(path));
      byPath.set(key, proxy);
    }
    return proxy;
  }

  function traps(path) {
    return {
      get(target, prop) {
        if (Array.isArray(target) && MUTATORS.has(prop)) {
          return (...args) => {
            const copy = cloneJson(target);
            const result = Array.prototype[prop].apply(copy, args);
            commit([{ op: "set", path, value: copy }]);
            return result === copy ? view(target, path) : result;
          };
        }
        const value = target[prop];
        if (typeof prop === "symbol" || !isContainer(value) || !Object.prototype.hasOwnProperty.call(target, prop)) return value;
        return view(value, [...path, Array.isArray(target) ? Number(prop) : prop]);
      },
      set(target, prop, value) {
        if (typeof prop === "symbol") throw new TypeError(`clay.live("${name}"): symbol keys are not JSON`);
        if (Array.isArray(target)) {
          if (prop === "length") {
            const copy = cloneJson(target);
            copy.length = value;
            commit([{ op: "set", path, value: copy }]);
            return true;
          }
          if (!INDEX.test(prop)) throw new TypeError(`clay.live("${name}"): "${prop}" is not a list index`);
          commit([{ op: "set", path: [...path, Number(prop)], value }]);
          return true;
        }
        commit([{ op: "set", path: [...path, prop], value }]);
        return true;
      },
      deleteProperty(target, prop) {
        if (typeof prop === "symbol") return true;
        if (Array.isArray(target)) throw new TypeError(`clay.live("${name}"): remove a list item with splice`);
        commit([{ op: "del", path: [...path, prop] }]);
        return true;
      },
      defineProperty() {
        throw new TypeError(`clay.live("${name}"): assign values instead of defining properties`);
      },
      setPrototypeOf() {
        return false;
      },
      preventExtensions() {
        return false;
      },
    };
  }

  const data = view(state, []);
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const handle = Object.freeze({
    name,
    ephemeral,
    ready,
    get data() {
      return data;
    },
    get status() {
      return { mode };
    },
    set(path, value) {
      commit([{ op: "set", path, value }]);
    },
    delete(path) {
      commit([{ op: "del", path }]);
    },
    add(path, n = 1) {
      commit([{ op: "add", path, n }]);
    },
    update(fn) {
      if (typeof fn !== "function") throw new TypeError(`clay.live("${name}"): update() takes a function`);
      if (batch) return fn(data);
      batch = [];
      const mark = pending.length;
      let result;
      try {
        result = fn(data);
        if (result && typeof result.then === "function") {
          throw new TypeError(`clay.live("${name}"): update() runs synchronously; do async work before calling it`);
        }
      } catch (err) {
        batch = null;
        pending.length = mark;
        rebuild();
        throw err;
      }
      const ops = coalesce(batch);
      batch = null;
      pending.length = mark;
      pending.push(...ops);
      if (ops.length) publish(ops);
      return result;
    },
    on(type, fn) {
      if (type !== "change") throw new TypeError(`clay.live("${name}"): the only event is "change"`);
      if (typeof fn !== "function") throw new TypeError(`clay.live("${name}"): on() takes a function`);
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    off(type, fn) {
      listeners.delete(fn);
    },
    toJSON() {
      return cloneJson(state);
    },
  });
  resolveReady(handle);

  return {
    handle,
    name,
    ephemeral,
    // The live value itself, for serializing into a save. Never mutate it.
    get value() {
      return state;
    },
    get authoritative() {
      return authoritative;
    },
    get pending() {
      return pending.slice();
    },
    setMode(next) {
      mode = next;
    },
    // A transport hears every local op batch, in order, as it is committed.
    onLocal(fn) {
      sinks.add(fn);
      return () => sinks.delete(fn);
    },
    // A new value from outside. The first `confirmed` pending ops are already in
    // it and are dropped; the rest replay over it. A pending op that no longer
    // applies is dropped too.
    rebase(next, { source = "remote", confirmed = 0 } = {}) {
      if (!isContainer(next) || kind(next) !== kind(state)) {
        console.warn(`clay.live("${name}"): ignored an incoming value that is not ${kind(state)}`);
        return false;
      }
      authoritative = cloneJson(next);
      pending = pending.slice(confirmed);
      rebuild();
      emit(source, null);
      return true;
    },
  };
}
