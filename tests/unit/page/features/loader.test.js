import { readFileSync } from "node:fs";
import { createFeatureLoader } from "../../../../src/page/feature-loader.js";
import { FEATURES } from "../../../../src/page/features/registry.js";
import * as tableModule from "../../../../src/page/features/table.js";
import * as boardModule from "../../../../src/page/features/board.js";
import * as mediaModule from "../../../../src/page/features/media.js";
import * as toolModule from "../../../../src/page/features/tool.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const harness = () => {
  const loads = [];
  const installs = [];
  const reports = [];
  const feature = { id: "table", dispose: () => { feature.disposed = (feature.disposed ?? 0) + 1; } };
  const mod = { createFeature: () => feature };
  const gate = deferred();
  const loader = createFeatureLoader({
    load: (id) => { loads.push(id); return gate.promise.then(() => mod); },
    install: (id, m) => { installs.push(id); return m.createFeature(); },
    reportError: (error) => reports.push(error),
  });
  return { loader, loads, installs, reports, gate, feature, mod };
};

test("two concurrent ensure calls for one feature load it once", async () => {
  const { loader, loads, installs, gate, feature } = harness();
  const first = loader.ensure("table");
  const second = loader.ensure("table");
  expect(loads).toEqual(["table"]);
  gate.resolve();
  expect(await first).toBe(feature);
  expect(await second).toBe(feature);
  expect(loads).toEqual(["table"]);
  expect(installs).toEqual(["table"]);
  expect(loader.has("table")).toBe(true);
  expect(await loader.ensure("table")).toBe(feature);
  expect(loads).toEqual(["table"]);
});

test("an aborted caller rejects while the other resolves", async () => {
  const { loader, gate, feature } = harness();
  const controller = new AbortController();
  const aborted = loader.ensure("table", { signal: controller.signal });
  const kept = loader.ensure("table");
  const reason = new Error("gone");
  controller.abort(reason);
  await expect(aborted).rejects.toBe(reason);
  gate.resolve();
  await expect(kept).resolves.toBe(feature);
});

test("a failure rejects, reports once, and the next ensure loads again", async () => {
  const loads = [];
  const reports = [];
  const feature = { id: "table" };
  let attempt = 0;
  const loader = createFeatureLoader({
    load: (id) => {
      loads.push(id);
      attempt++;
      return attempt === 1 ? Promise.reject(new Error("no network")) : Promise.resolve({ createFeature: () => feature });
    },
    install: (_id, mod) => mod.createFeature(),
    reportError: (error) => reports.push(error),
  });
  await expect(loader.ensure("table")).rejects.toThrow("no network");
  await tick();
  expect(reports).toHaveLength(1);
  expect(loader.has("table")).toBe(false);
  await expect(loader.ensure("table")).resolves.toBe(feature);
  expect(loads).toEqual(["table", "table"]);
  expect(reports).toHaveLength(1);
});

test("dispose during a pending load makes the result inert and disposes installed features once", async () => {
  const { loader, installs, gate, feature } = harness();
  gate.resolve();
  await loader.ensure("table");
  expect(installs).toEqual(["table"]);

  const other = harness();
  const pending = other.loader.ensure("table");
  pending.catch(() => {});
  other.loader.dispose();
  other.gate.resolve();
  await pending;
  await tick();
  expect(other.installs).toEqual([]);
  expect(other.loader.has("table")).toBe(false);

  loader.dispose();
  expect(feature.disposed).toBe(1);
  await expect(loader.ensure("table")).rejects.toThrow("disposed");
});

test("an async install that rejects once recovers on the next ensure and its feature is disposed once", async () => {
  let loads = 0;
  let attempts = 0;
  let disposals = 0;
  const feature = { dispose: () => { disposals += 1; } };
  const loader = createFeatureLoader({
    load: () => { loads += 1; return Promise.resolve({ createFeature: () => feature }); },
    install: async (_id, mod) => {
      attempts += 1;
      if (attempts === 1) throw new Error("install failed");
      await tick();
      return mod.createFeature();
    },
    reportError: () => {},
  });
  await expect(loader.ensure("tool")).rejects.toThrow("install failed");
  expect(loader.has("tool")).toBe(false);
  await expect(loader.ensure("tool")).resolves.toBe(feature);
  expect(loader.has("tool")).toBe(true);
  expect(loads).toBe(2);
  loader.dispose();
  expect(disposals).toBe(1);
});

test("an install that resolves after dispose is disposed at once and never installed", async () => {
  let disposals = 0;
  const feature = { dispose: () => { disposals += 1; } };
  const gate = deferred();
  const loader = createFeatureLoader({
    load: () => Promise.resolve({}),
    install: () => gate.promise.then(() => feature),
    reportError: () => {},
  });
  const pendingEnsure = loader.ensure("tool");
  pendingEnsure.catch(() => {});
  await tick();
  loader.dispose();
  gate.resolve();
  await pendingEnsure;
  await tick();
  expect(loader.has("tool")).toBe(false);
  expect(disposals).toBe(1);
});

test("a host-local runtime prefix activates every feature without reaching clayjs.com", async () => {
  const index = JSON.parse(readFileSync(new URL("../../../../dist/offline-manifest.json", import.meta.url), "utf8"));
  const prefix = `/_/clayjs/${index.version}/`;
  const modules = {
    "src/page/features/table.js": tableModule,
    "src/page/features/board.js": boardModule,
    "src/page/features/media.js": mediaModule,
    "src/page/features/tool.js": toolModule,
  };
  const requested = [];
  const fetches = [];
  const installs = [];

  const realFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    fetches.push(String(input));
    throw new Error(`clayjs: the offline test refuses ${String(input)}`);
  };
  const importUnderPrefix = (url) => {
    if (!url.startsWith(prefix)) return Promise.reject(new Error(`clayjs: the feature loader left its local prefix: ${url}`));
    const mod = modules[url.slice(prefix.length)];
    return mod ? Promise.resolve(mod) : Promise.reject(new Error(`clayjs: ${url} is not in this release`));
  };

  const loader = createFeatureLoader({
    load: (id) => {
      const url = `${prefix}src/${FEATURES[id].module}`;
      requested.push(url);
      return importUnderPrefix(url);
    },
    install: (id, mod) => { installs.push(id); return mod.createFeature(); },
  });

  try {
    const ids = Object.keys(FEATURES).sort();
    expect(ids).toEqual(["board", "media", "table", "tool"]);
    for (const id of ids) {
      expect(await loader.ensure(id)).toBeTruthy();
      expect(loader.has(id)).toBe(true);
    }
    expect(installs).toEqual(ids);
    expect(requested).toHaveLength(ids.length);
    for (const url of requested) {
      expect(url.startsWith(prefix)).toBe(true);
      expect(url.startsWith("https://clayjs.com/")).toBe(false);
      expect(Object.hasOwn(index.files, url.slice(prefix.length))).toBe(true);
    }
    expect(fetches).toEqual([]);
  } finally {
    globalThis.fetch = realFetch;
    loader.dispose();
  }
});
