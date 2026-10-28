globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { performance } from "node:perf_hooks";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createYPageBinding, seedValue, createPageDoc, docOf, walk, bareShape } from "../../../src/page/ybind/index.js";
import { buildLongDocument } from "./helpers/long-document.js";

const BLOCKS = 700;
const CHARS = 350;
const WARMUP = 30;
const SAMPLES = 200;

test("700 paragraphs of 350 characters keep delivered text transactions under the p95 target through the real editor", () => {
  const blocks = Array.from({ length: BLOCKS }, (_, i) => ({ id: `p${i}`, text: "x".repeat(CHARS) }));
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
  });
  binding.attach(view);
  const at = (index, offset = 175) => {
    let pos;
    view.state.doc.forEach((block, start, i) => { if (i === index) pos = start + 1 + Math.min(offset, block.content.size); });
    return pos;
  };
  const edit = (index) => {
    const tr = view.state.tr.insertText("a", at(index));
    const start = performance.now();
    view.dispatch(tr);
    return performance.now() - start;
  };
  try {
    for (let i = 0; i < WARMUP; i++) edit([0, 350, 699][i % 3]);
    const samplesMs = [];
    let delivered = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const before = view.state.doc;
      samplesMs.push(edit([0, 350, 699][i % 3]));
      if (view.state.doc !== before) delivered++;
    }
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const maximumMs = sorted[sorted.length - 1];

    const reloaded = new Y.Doc();
    Y.applyUpdateV2(reloaded, Y.encodeStateAsUpdateV2(binding.ydoc));
    const pd = createPageDoc(reloaded);
    const roundTrip = bareShape(docOf(pd, walk(pd)));
    reloaded.destroy();

    const result = {
      environment: "Jest jsdom, real page editor dispatch through the Yjs binding",
      blocks: BLOCKS,
      charsPerBlock: CHARS,
      warmup: WARMUP,
      samples: samplesMs.length,
      delivered,
      medianMs,
      p95Ms,
      maximumMs,
      mismatches: binding.stats.mismatch,
      roundTrip: roundTrip === bareShape(view.state.doc),
    };
    console.log(JSON.stringify(result));

    expect(delivered).toBe(SAMPLES);
    expect(binding.stats.mismatch).toBe(0);
    expect(roundTrip).toBe(bareShape(view.state.doc));
    // The p95 is a dedicated-machine claim; under a parallel suite only the median is.
    expect(medianMs).toBeLessThan(16);
    if (process.env.CLAY_PERF === "1") expect(p95Ms).toBeLessThan(16);
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
}, 300000);

const TEXT_BLOCKS = new Set(["paragraph", "heading", "list_item", "callout", "quote", "toggle"]);

test("2,000 real blocks keep delivered text transactions under the timing targets", () => {
  const fixture = buildLongDocument();
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(fixture.value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
  });
  binding.attach(view);
  const anchors = () => {
    const found = [];
    view.state.doc.forEach((block, start) => { if (TEXT_BLOCKS.has(block.type.name) && block.content.size > 2) found.push(start + 1); });
    return found;
  };
  const at = (which) => {
    const found = anchors();
    return which === 0 ? found[0] : which === 1 ? found[Math.floor(found.length / 2)] : found[found.length - 1];
  };
  const edit = (which) => {
    const tr = view.state.tr.insertText("a", at(which));
    const start = performance.now();
    view.dispatch(tr);
    return performance.now() - start;
  };
  try {
    for (let i = 0; i < WARMUP; i++) edit(i % 3);
    const samplesMs = [];
    let delivered = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const before = view.state.doc;
      samplesMs.push(edit(i % 3));
      if (view.state.doc !== before) delivered++;
    }
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const maximumMs = sorted[sorted.length - 1];

    const reloaded = new Y.Doc();
    Y.applyUpdateV2(reloaded, Y.encodeStateAsUpdateV2(binding.ydoc));
    const pd = createPageDoc(reloaded);
    const roundTrip = bareShape(docOf(pd, walk(pd)));
    reloaded.destroy();

    const result = {
      environment: "Jest jsdom, real page editor dispatch through the Yjs binding",
      fixture: "helpers/long-document.js",
      blocks: fixture.total,
      counts: fixture.counts,
      warmup: WARMUP,
      samples: samplesMs.length,
      delivered,
      medianMs,
      p95Ms,
      maximumMs,
      mismatches: binding.stats.mismatch,
      roundTrip: roundTrip === bareShape(view.state.doc),
    };
    console.log(JSON.stringify(result));

    expect(delivered).toBe(SAMPLES);
    expect(binding.stats.mismatch).toBe(0);
    expect(roundTrip).toBe(bareShape(view.state.doc));
    // The fixture's real shape is timed on a dedicated machine only: under a parallel
    // suite the run still proves correctness, and CLAY_PERF=1 makes the claim.
    if (process.env.CLAY_PERF === "1") {
      expect(medianMs).toBeLessThan(16);
      expect(p95Ms).toBeLessThan(33);
    }
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
}, 300000);

// Soft deletes never compact, and the structure repairs after block deletes nest the blocks
// around them: typing after heavy deleting is where per-keystroke cost that grows with the
// document's history shows (Document 14).
test("2,000 real blocks after 100 block deletes and 300 backspaces keep typing under the timing targets", () => {
  const fixture = buildLongDocument();
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(fixture.value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
  });
  binding.attach(view);
  const blockAt = (i) => {
    let out = null;
    view.state.doc.forEach((block, start, index) => { if (index === i) out = { block, start }; });
    return out;
  };
  const anchors = () => {
    const found = [];
    view.state.doc.forEach((block, start) => { if (TEXT_BLOCKS.has(block.type.name) && block.content.size > 2) found.push(start + 1); });
    return found;
  };
  const at = (which) => {
    const found = anchors();
    return which === 0 ? found[0] : which === 1 ? found[Math.floor(found.length / 2)] : found[found.length - 1];
  };
  const edit = (which) => {
    const tr = view.state.tr.insertText("a", at(which));
    const start = performance.now();
    view.dispatch(tr);
    return performance.now() - start;
  };
  try {
    for (let k = 0; k < 100; k++) {
      const { block, start } = blockAt(20 + k * 17);
      if (block.type.name === "paragraph") view.dispatch(view.state.tr.delete(start, start + block.nodeSize));
    }
    for (let k = 0; k < 300; k++) {
      const { block, start } = blockAt(100 + (k % 50) * 30);
      if (TEXT_BLOCKS.has(block.type.name) && block.content.size >= 3) view.dispatch(view.state.tr.delete(start + 2, start + 3));
    }
    for (let i = 0; i < WARMUP; i++) edit(i % 3);
    const samplesMs = [];
    let delivered = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const before = view.state.doc;
      samplesMs.push(edit(i % 3));
      if (view.state.doc !== before) delivered++;
    }
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const maximumMs = sorted[sorted.length - 1];

    const reloaded = new Y.Doc();
    Y.applyUpdateV2(reloaded, Y.encodeStateAsUpdateV2(binding.ydoc));
    const pd = createPageDoc(reloaded);
    const roundTrip = bareShape(docOf(pd, walk(pd)));
    reloaded.destroy();

    console.log(JSON.stringify({
      environment: "Jest jsdom, real page editor dispatch through the Yjs binding, after heavy deleting",
      blocks: view.state.doc.childCount,
      gone: binding.pd.gone.size,
      hidden: binding.bridge.walk.hidden.length,
      samples: samplesMs.length,
      delivered,
      medianMs,
      p95Ms,
      maximumMs,
      mismatches: binding.stats.mismatch,
    }));

    expect(delivered).toBe(SAMPLES);
    expect(binding.stats.mismatch).toBe(0);
    expect(roundTrip).toBe(bareShape(view.state.doc));
    if (process.env.CLAY_PERF === "1") {
      expect(medianMs).toBeLessThan(16);
      expect(p95Ms).toBeLessThan(33);
    }
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});
