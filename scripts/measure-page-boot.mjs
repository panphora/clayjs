import { pathToFileURL } from "node:url";
import { createInstall, disposeInstall, runBoot } from "../src/page/boot.js";

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];
const TABLE = { id: "tbl", t: "table", pos: "Z", cols: { c1: { pos: "1", name: "Name", kind: "text" } }, rows: {} };

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

// What a boot did, as one number per call and per settle. Two windows are what the
// overlap is read from: the editor's code download, and authority preparation's own
// network work (metadata, the forced first save, the room join). The step that holds
// them says nothing: a fixture whose authority waits for the editor download starts
// both steps in the same tick and its preparation is still serial behind it.
const recorder = () => {
  let order = 0;
  const editor = { start: null, end: null };
  const authority = { start: null, end: null };
  return {
    editor,
    authority,
    beginEditor: () => { editor.start ??= ++order; },
    settleEditor: () => { editor.end = ++order; },
    beginAuthority: () => { authority.start ??= ++order; },
    settleAuthority: () => { authority.end = ++order; },
  };
};

// The transport answers metadata, the forced first save, the room join and the two
// code downloads. Each answer is a controllable fixture, so a boot can be held,
// refused or lost without a browser, a server or a clock.
const transport = ({ meter = null, firstSave = "ok", join = "ok", editor = "ok", part = "ok" } = {}) => ({
  metadata: async () => {
    meter?.beginAuthority();
    await settle();
    return { spec: 1, extensions: ["page", "live-data"] };
  },
  firstSave: async () => {
    meter?.beginAuthority();
    await settle();
    if (firstSave === "412") {
      meter?.settleAuthority();
      return { ok: false, status: 412, code: "conflict", msg: "This document changed since you last loaded it." };
    }
    if (firstSave === "refused") {
      meter?.settleAuthority();
      return { ok: false, code: "refused", msg: "The host refused the first save." };
    }
    return { ok: true, msgType: "success" };
  },
  join: async () => {
    meter?.beginAuthority();
    await settle();
    meter?.settleAuthority();
    return { ready: join === "ok" };
  },
  importEditor: async () => {
    meter?.beginEditor();
    await settle();
    meter?.settleEditor();
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

// A fixture mirrors the step it stands for in page.js: the editor's import, the feature
// parts started beside it and awaited at input, the metadata, forced save and join of
// authority preparation. `setup` runs once per measurement, before the boot starts.
const FIXTURES = [
  {
    name: "tagged text",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    async loadEditorAssets(inst) {
      const net = transport({ meter: inst.meter });
      const editor = await net.importEditor();
      return { ok: true, editor, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport({ meter: inst.meter }), source);
    },
  },
  {
    name: "seeded text",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: true }) }),
    async loadEditorAssets(inst) {
      const net = transport({ meter: inst.meter });
      await settle(2);
      const editor = await net.importEditor();
      return { ok: true, editor, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport({ meter: inst.meter }), source);
    },
  },
  {
    name: "required feature",
    readSource: () => ({ ok: true, source: pageSource([...BLOCKS, TABLE], { tags: 1, seeded: false }) }),
    async loadEditorAssets(inst, source) {
      const net = transport({ meter: inst.meter });
      const featureIds = Object.values(source.blocks).some((block) => block.t === "table") ? ["table"] : [];
      // page.js prepares each part beside the editor import and waits for the installs
      // at input, so the part is not part of the editor's download.
      const parts = Promise.allSettled(featureIds.map((id) => net.importPart(id)));
      const editor = await net.importEditor();
      return { ok: true, editor, featureIds, parts };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport({ meter: inst.meter }), source);
    },
  },
  {
    name: "serial boot",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    setup(inst) {
      return { download: transport({ meter: inst.meter }).importEditor() };
    },
    async loadEditorAssets(inst, source, run) {
      const editor = await run.download;
      return { ok: true, editor, featureIds: [] };
    },
    // Everything authority preparation does waits for the editor's code, which is the
    // serial boot the overlap has to report as none.
    async prepareAuthority(inst, source, run) {
      await run.download;
      return authorityFrom(transport({ meter: inst.meter }), source);
    },
  },
  {
    name: "blocked",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    async loadEditorAssets(inst) {
      const net = transport({ meter: inst.meter, editor: "throw" });
      try {
        await net.importEditor();
      } catch (error) {
        return { ok: false, reason: "editor-assets-failed" };
      }
      return { ok: true, editor: null, featureIds: [] };
    },
    async prepareAuthority(inst, source) {
      return authorityFrom(transport({ meter: inst.meter }), source);
    },
  },
  {
    name: "cancelled",
    readSource: () => ({ ok: true, source: pageSource(BLOCKS, { tags: 1, seeded: false }) }),
    setup() {
      return { editorGate: deferred(), joinGate: deferred() };
    },
    loadEditorAssets(inst, source, run) {
      inst.meter.beginEditor();
      return run.editorGate.promise;
    },
    prepareAuthority: (inst, source, run) => run.joinGate.promise,
    cancel(inst, run) {
      disposeInstall(inst);
      run.editorGate.resolve({ ok: false, cancelled: true });
      run.joinGate.resolve({ ok: false, cancelled: true });
    },
  },
];

// Overlap is the editor download and authority preparation on the wire at the same
// time: preparation began before the editor's code arrived, and the download began
// before preparation settled. An unfinished branch is still on the wire; a branch that
// never began is nothing to overlap with.
const overlaps = (editor, authority) => {
  if (editor.start === null || authority.start === null) return false;
  const end = (at) => (at === null ? Infinity : at);
  return authority.start < end(editor.end) && editor.start < end(authority.end);
};

async function measureFixture(fixture) {
  const phases = [];
  const mounted = { view: null };
  let inputAccepted = false;

  const inst = createInstall({ onPhase: (result) => phases.push(result.phase) });
  inst.meter = recorder();
  const run = fixture.setup?.(inst) ?? {};

  const steps = {
    readSource: (inst) => fixture.readSource(inst),
    loadEditorAssets: (inst, source) => fixture.loadEditorAssets(inst, source, run),
    prepareAuthority: (inst, source) => fixture.prepareAuthority(inst, source, run),
    mountAndAttach: (inst, source, loaded) => {
      mounted.view = { editable: false, features: loaded?.featureIds ?? [] };
      return { ok: true, view: mounted.view, parts: loaded.parts ?? Promise.resolve() };
    },
    adoptSource: async () => ({ ok: true }),
    enableInput: async (inst, attached) => {
      if (!inst.mounted || inst.mounted !== attached.view) return { ok: false, reason: "view-detached" };
      await attached.parts;
      attached.view.editable = true;
      inputAccepted = true;
      return { ok: true };
    },
  };

  const boot = runBoot(inst, steps);
  await Promise.resolve();
  if (fixture.cancel) fixture.cancel(inst, run);
  const result = await boot;

  return {
    fixture: fixture.name,
    installId: inst.installId,
    phases,
    assetsOverlappedAuthority: overlaps(inst.meter.editor, inst.meter.authority),
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
