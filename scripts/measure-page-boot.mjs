import { pathToFileURL } from "node:url";
import { createInstall, disposeInstall, runBoot } from "../src/page/boot.js";

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const TABLE = { id: "tbl", t: "table", pos: "Z", cols: { c1: { pos: "1", name: "Name", kind: "text" } }, rows: {} };

const now = () => globalThis.performance?.now?.() ?? Date.now();
const settle = async (turns = 1) => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const pageSource = (blocks, extra = {}) => ({
  ...extra,
  blocks: Object.fromEntries(blocks.map((block) => [block.id, block])),
});

// The transport answers metadata, the forced first save, the room join and the two
// code downloads. Each answer is a controllable fixture, so a boot can be held,
// refused or lost without a browser, a server or a clock.
const transport = ({ firstSave = "ok", join = "ok", editor = "ok", part = "ok" } = {}) => ({
  metadata: async () => {
    await settle();
    return { spec: 1, extensions: ["page", "live-data"] };
  },
  firstSave: async () => {
    await settle();
    if (firstSave === "412") return { ok: false, status: 412, code: "conflict", msg: "This document changed since you last loaded it." };
    if (firstSave === "refused") return { ok: false, code: "refused", msg: "The host refused the first save." };
    return { ok: true, msgType: "success" };
  },
  join: async () => {
    await settle();
    return { ready: join === "ok" };
  },
  importEditor: async () => {
    await settle();
    if (editor === "throw") throw new Error("the editor's code did not arrive");
    return { createPageEditor: () => ({}), refreshMountedView: () => {} };
  },
  importPart: async (id) => {
    await settle();
    if (part === "throw") throw new Error(`the ${id} part did not arrive`);
    return { id };
  },
});

async function authorityFrom(net, source) {
  const meta = await net.metadata();
  if (!meta.extensions.includes("page")) return { ok: false, reason: "missing-capability" };
  if (source.seeded) {
    const saved = await net.firstSave();
    if (!saved.ok) return { ok: false, reason: saved.status === 412 ? "first-save-conflict" : "first-save-refused" };
  }
  const handle = await net.join();
  if (!handle.ready) return { ok: false, reason: "admission-failed" };
  return { ok: true, store: "page", handle };
}

const editorGate = deferred();
const joinGate = deferred();

const FIXTURES = [
  {
    name: "tagged text",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    async loadEditorAssets() {
      const net = transport();
      const editor = await net.importEditor();
      return { ok: true, editor, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport(), source);
    },
  },
  {
    name: "seeded text",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: true }) }),
    async loadEditorAssets() {
      const net = transport();
      await settle(2);
      const editor = await net.importEditor();
      return { ok: true, editor, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport(), source);
    },
  },
  {
    name: "required feature",
    readSource: () => ({ ok: true, source: pageSource([...BLOCKS, TABLE], { tags: 1, seeded: false }) }),
    async loadEditorAssets(inst, source) {
      const net = transport();
      const featureIds = Object.values(source.blocks).some((block) => block.t === "table") ? ["table"] : [];
      const editor = await net.importEditor();
      for (const id of featureIds) await net.importPart(id);
      return { ok: true, editor, featureIds };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport(), source);
    },
  },
  {
    name: "blocked",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    async loadEditorAssets() {
      const net = transport({ editor: "throw" });
      try {
        await net.importEditor();
      } catch (error) {
        return { ok: false, reason: "editor-assets-failed" };
      }
      return { ok: true, editor: null, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport(), source);
    },
  },
  {
    name: "cancelled",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    loadEditorAssets: () => editorGate.promise,
    prepareAuthority: () => joinGate.promise,
    cancel(inst) {
      disposeInstall(inst);
      editorGate.resolve({ ok: false, cancelled: true });
      joinGate.resolve({ ok: false, cancelled: true });
    },
  },
];

const overlaps = (assets, authority) => {
  if (assets.start === null || authority.start === null) return false;
  const end = (at) => (at === null ? Infinity : at);
  return assets.start < end(authority.end) && authority.start < end(assets.end);
};

async function measureFixture(fixture) {
  const phases = [];
  const assetWindow = { start: null, end: null };
  const authorityWindow = { start: null, end: null };
  const mounted = { view: null };
  let inputAccepted = false;

  const steps = {
    readSource: (inst) => fixture.readSource(inst),
    loadEditorAssets: (inst, source) => {
      assetWindow.start = now();
      return Promise.resolve(fixture.loadEditorAssets(inst, source)).then((result) => {
        assetWindow.end ??= now();
        return result;
      });
    },
    prepareAuthority: (inst, source) => {
      authorityWindow.start = now();
      return Promise.resolve(fixture.prepareAuthority(inst, source)).then((result) => {
        authorityWindow.end ??= now();
        return result;
      });
    },
    mountAndAttach: (inst, source, loaded) => {
      mounted.view = { editable: false, features: loaded?.featureIds ?? [] };
      return { ok: true, view: mounted.view };
    },
    adoptSource: async () => ({ ok: true }),
    enableInput: async (inst, attached) => {
      if (!inst.mounted || inst.mounted !== attached.view) return { ok: false, reason: "view-detached" };
      attached.view.editable = true;
      inputAccepted = true;
      return { ok: true };
    },
  };

  const inst = createInstall({ onPhase: (result) => phases.push(result.phase) });
  const boot = runBoot(inst, steps);
  await Promise.resolve();
  if (fixture.cancel) fixture.cancel(inst);
  const result = await boot;

  const assets = { ...assetWindow };
  const authority = { ...authorityWindow };
  return {
    fixture: fixture.name,
    installId: inst.installId,
    phases,
    assetsOverlappedAuthority: overlaps(assets, authority),
    firstReady: result ? (result.reason ? `${result.phase} (${result.reason})` : result.phase) : "cancelled",
    inputAccepted: inputAccepted && mounted.view?.editable === true,
  };
}

export async function measureBoot() {
  const results = [];
  for (const fixture of FIXTURES) results.push(await measureFixture(fixture));
  return results;
}

export function formatReport(results) {
  const lines = ["clayjs page boot meter", "coordinator fixtures: no browser, no network, no wall-clock target", ""];
  for (const result of results) {
    lines.push(result.fixture);
    lines.push(`  install         ${result.installId}`);
    lines.push(`  phases          ${result.phases.join(" -> ")}`);
    lines.push(`  assets overlap  ${result.assetsOverlappedAuthority ? "yes" : "no"}`);
    lines.push(`  first ready     ${result.firstReady}`);
    lines.push(`  input accepted  ${result.inputAccepted ? "yes" : "no"}`);
    lines.push("");
  }
  const accepting = results.filter((result) => result.inputAccepted).length;
  lines.push(`${results.length} fixtures, ${accepting} accepted input`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(formatReport(await measureBoot()));
}
