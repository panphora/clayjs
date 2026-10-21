globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin, blockJson } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, reduceRecovery, createOriginIndex, blocksFromYValue, physicalKeyOf, authorKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const A = 100, B = 200, C = 300;
const SEED_CLIENT = 1;

const COLS = { c1: { pos: "a0", name: "Name" }, c2: { pos: "a1", name: "Count" } };
const ROWS = {
  r1: { pos: "a0", cells: { c1: "Alpha", c2: "2" } },
  r2: { pos: "a1", cells: { c1: "Beta", c2: "3" } },
};
const IMAGE = { src: "/fixture.png", alt: "Fixture", caption: "Keep me", width: 320, align: "right" };

const FIXTURE = [
  { id: "p", text: "P" },
  { id: "img", t: "image", attrs: { src: IMAGE.src, alt: IMAGE.alt, caption: IMAGE.caption, width: IMAGE.width, align: IMAGE.align, parent: null } },
  { id: "tab", t: "table", attrs: { cols: COLS, rows: ROWS, sort: null, parent: null } },
];

const seedDoc = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = SEED_CLIENT;
  seedFrom(pd, FIXTURE);
  pd.origins.set(authorKey(SEED_CLIENT), "seed");
  return pd;
};

const clone = (source, client) => {
  const ydoc = new Y.Doc();
  ydoc.clientID = client;
  Y.applyUpdateV2(ydoc, Y.encodeStateAsUpdateV2(source.ydoc));
  return createPageDoc(ydoc);
};

const opened = [];
const close = (tab) => {
  const at = opened.indexOf(tab);
  if (at >= 0) opened.splice(at, 1);
  tab.view.destroy();
  tab.bridge.dispose();
  tab.bridge.pd.ydoc.destroy();
  tab.mount.remove();
};
afterEach(() => {
  for (const tab of opened.splice(0)) close(tab);
});

function open(pd) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount };
  opened.push(tab);
  return tab;
}

const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const localClock = (ydoc, client) => Y.decodeStateVector(Y.encodeStateVector(ydoc)).get(client) ?? 0;

const markersOf = (pd) => {
  const out = [];
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed?.b !== undefined) out.push({ key: physicalKeyOf(it.id), id: it.content.embed.b, client: it.id.client, clock: it.id.clock });
  }
  return out;
};

const freshMarkers = (pd, client, clock) => markersOf(pd).filter((marker) => marker.client === client && marker.clock >= clock);

const sourcePairs = (pd) => {
  const index = createOriginIndex(pd.origins);
  try {
    return walk(pd, index).visible.filter((seg) => !seg.implicit).map((seg) => [seg.id, physicalKeyOf(index.resolve(seg.brk))]);
  } finally { index.dispose(); }
};

const reload = (pd) => blocksFromYValue(yValueOf(clone(pd, 900).ydoc));

const pmNode = (tab, id) => {
  let found = null;
  tab.view.state.doc.forEach((node) => { if (node.attrs.id === id) found = node; });
  if (!found) throw new Error(`Missing PM block ${id}`);
  return found;
};

const pmTable = (tab) => { const json = blockJson(pmNode(tab, "tab")); return { rows: json.rows, cols: json.cols }; };
const pmImage = (tab) => {
  const json = blockJson(pmNode(tab, "img"));
  return { t: json.t, src: json.src, alt: json.alt, caption: json.caption, width: json.width, align: json.align };
};

const expectTable = (tab, pristine) => {
  const json = blockJson(pmNode(tab, "tab"));
  expect(json.cols).toEqual(COLS);
  expect(Object.keys(json.rows)).toEqual(["r1", "r2"]);
  expect(json.rows.r1.cells).toEqual(ROWS.r1.cells);
  expect(json.rows.r2.cells).toEqual(ROWS.r2.cells);
  expect({ rows: json.rows, cols: json.cols }).toEqual(pristine);
  expect(pmImage(tab)).toEqual({ t: "image", ...IMAGE });
};

const expectValue = (pd) => {
  expect(reload(pd)).toEqual({
    tab: { t: "table", pos: "00000001", cols: COLS, rows: ROWS },
    p: { t: "paragraph", pos: "00000002", c: "P" },
    img: { t: "image", pos: "00000003", ...IMAGE },
  });
};

const expectNoRecovery = (tab) => {
  expect(tab.bridge.recoverable).toEqual([]);
  expect(tab.bridge.notices).toEqual([]);
};

const recoveryOf = (pd) => {
  const index = createOriginIndex(pd.origins);
  try { return reduceRecovery(pd, { index }); } finally { index.dispose(); }
};

const deliver = (tab, update) => {
  const before = localClock(tab.pd.ydoc, tab.pd.ydoc.clientID);
  Y.applyUpdateV2(tab.pd.ydoc, update, NET);
  return localClock(tab.pd.ydoc, tab.pd.ydoc.clientID) === before;
};

let permutations = 0, mainReloads = 0, undoEndpoints = 0, redoEndpoints = 0;

test("case 16: a concurrent image move and table move merge to tab, p, img through Undo and Redo", () => {
  const orders = [
    [A, B, C], [A, C, B], [B, A, C],
    [B, C, A], [C, A, B], [C, B, A],
  ];

  for (const order of orders) {
    const seed = seedDoc();
    const seedMarkers = markersOf(seed);
    const seedP = seedMarkers.find((marker) => marker.id === "p").key;
    const seedImg = seedMarkers.find((marker) => marker.id === "img").key;
    expect(reload(seed)).toEqual({
      p: { t: "paragraph", pos: "00000001", c: "P" },
      img: { t: "image", pos: "00000002", ...IMAGE },
      tab: { t: "table", pos: "00000003", cols: COLS, rows: ROWS },
    });

    const a = open(clone(seed, A));
    a.pd.origins.set(authorKey(A), "A");
    const b = open(clone(seed, B));
    b.pd.origins.set(authorKey(B), "B");
    const c = open(clone(seed, C));
    c.pd.origins.set(authorKey(C), "C");
    const pristine = pmTable(a);

    const beforeA = localClock(a.pd.ydoc, A);
    const beforeB = localClock(b.pd.ydoc, B);
    const beforeC = localClock(c.pd.ydoc, C);

    expect(a.bridge.moveBlocks({ ids: ["img"], afterId: "tab" })).toEqual({ status: "moved", ids: ["img"] });
    expect(b.bridge.moveBlocks({ ids: ["tab"], afterId: null, parent: null })).toEqual({ status: "moved", ids: ["tab"] });

    const freshA = freshMarkers(a.pd, A, beforeA);
    const freshB = freshMarkers(b.pd, B, beforeB);
    expect(freshA.map((marker) => marker.id)).toEqual(["img"]);
    expect(freshB.map((marker) => marker.id)).toEqual(["tab"]);
    expect(freshMarkers(a.pd, A, beforeA).some((marker) => marker.id === "tab")).toBe(false);
    expect(markersOf(a.pd).filter((marker) => marker.id === "tab" && marker.client === A)).toEqual([]);
    expect(freshMarkers(c.pd, C, beforeC)).toEqual([]);
    const aImg = freshA[0].key;
    const bTab = freshB[0].key;

    const baseline = Y.encodeStateVector(seed.ydoc);
    const updates = new Map([
      [A, Y.encodeStateAsUpdateV2(a.pd.ydoc, baseline)],
      [B, Y.encodeStateAsUpdateV2(b.pd.ydoc, baseline)],
      [C, Y.encodeStateAsUpdateV2(c.pd.ydoc, baseline)],
    ]);

    const merged = clone(seed, 500);
    for (const client of order) {
      Y.applyUpdateV2(merged.ydoc, updates.get(client));
      Y.applyUpdateV2(merged.ydoc, updates.get(client));
    }

    permutations++;
    expect(sourcePairs(merged)).toEqual([["tab", bTab], ["p", seedP], ["img", aImg]]);
    expectValue(merged);
    mainReloads++;
    expect(markersOf(merged).filter((marker) => marker.id === "tab" && marker.client === A)).toEqual([]);
    expect(recoveryOf(merged).list.filter((record) => record.recoverable)).toEqual([]);
    expect(walk(merged).orphans).toEqual([]);
    expectNoRecovery(a);
    expectNoRecovery(b);
    expectNoRecovery(c);

    const mergedUpdate = Y.encodeStateAsUpdateV2(merged.ydoc);
    expect(deliver(a, mergedUpdate)).toBe(true);
    expect(deliver(b, mergedUpdate)).toBe(true);
    expect(deliver(c, mergedUpdate)).toBe(true);
    for (const tab of [a, b, c]) {
      settled(tab);
      expect(sourcePairs(tab.pd)).toEqual([["tab", bTab], ["p", seedP], ["img", aImg]]);
      expectTable(tab, pristine);
      expectNoRecovery(tab);
    }

    expect(a.bridge.undo()).toBe(true);
    const undoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    settled(a);
    expect(deliver(b, undoUpdate)).toBe(true);
    expect(deliver(c, undoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, undoUpdate, NET);
    undoEndpoints++;
    expect(sourcePairs(merged)).toEqual([["tab", bTab], ["p", seedP], ["img", seedImg]]);
    expectValue(merged);
    expect(markersOf(b.pd).filter((marker) => marker.id === "tab" && marker.client === B).map((marker) => marker.key)).toEqual([bTab]);
    for (const tab of [a, b, c]) {
      settled(tab);
      expect(sourcePairs(tab.pd)).toEqual([["tab", bTab], ["p", seedP], ["img", seedImg]]);
      expectTable(tab, pristine);
      expectNoRecovery(tab);
    }

    expect(a.bridge.redo()).toBe(true);
    const redoUpdate = Y.encodeStateAsUpdateV2(a.pd.ydoc);
    settled(a);
    expect(deliver(b, redoUpdate)).toBe(true);
    expect(deliver(c, redoUpdate)).toBe(true);
    Y.applyUpdateV2(merged.ydoc, redoUpdate, NET);
    redoEndpoints++;
    expect(sourcePairs(merged)).toEqual([["tab", bTab], ["p", seedP], ["img", aImg]]);
    expectValue(merged);
    for (const tab of [a, b, c]) {
      settled(tab);
      expect(sourcePairs(tab.pd)).toEqual([["tab", bTab], ["p", seedP], ["img", aImg]]);
      expectTable(tab, pristine);
      expectNoRecovery(tab);
    }

    console.log(`case 16 permutation ${order.join(",")}: main, Undo and Redo endpoints verified`);
    for (const tab of [a, b, c]) close(tab);
    merged.ydoc.destroy();
    seed.ydoc.destroy();
  }

  console.log(`case 16: ${permutations} permutations, ${mainReloads} strict main reloads, ${undoEndpoints} Undo endpoints, ${redoEndpoints} Redo endpoints`);
  expect({ permutations, mainReloads, undoEndpoints, redoEndpoints }).toEqual({ permutations: 6, mainReloads: 6, undoEndpoints: 6, redoEndpoints: 6 });
});
