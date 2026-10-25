import { createFeatureLoader } from "../../../../src/page/feature-loader.js";

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
