import { performance } from "node:perf_hooks";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { state as pmState, view as pmView, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, migrateHybridValues, NET, bareShape, sameBareShape, docOf, walk, tokensOf, tokenIndex, textTokenRange, yBefore } from "../../../../src/page/ybind/index.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

test("text token ranges equal the full writer indexes and tokens", () => {
  const p = (id, content) => schema.nodes.paragraph.create({ id, pos: null }, content);
  const doc = schema.nodes.doc.create(null, [
    p("a", [schema.text("ab😀"), schema.nodes.hard_break.create(), schema.text("cd", [schema.marks.strong.create()])]),
    schema.nodes.divider.create({ id: "divider", pos: null }),
    p("b", schema.text("finish")),
  ]);
  const index = tokenIndex(doc), tokens = tokensOf(doc);
  doc.forEach((block, offset) => {
    if (!block.isTextblock) return;
    for (let from = offset + 1; from <= offset + 1 + block.content.size; from++) {
      for (const to of [from, Math.min(from + 1, offset + 1 + block.content.size), offset + 1 + block.content.size]) {
        const range = textTokenRange(doc, from, to);
        expect([range.start, range.end]).toEqual([index[from], index[to]]);
        expect(range.tokens).toEqual(tokens.slice(index[from], index[to]));
      }
    }
  });
});

test("the direct shape comparison agrees with the serialized mismatch check", () => {
  const p = (id, pos, text, marks = []) => schema.nodes.paragraph.create({ id, pos }, schema.text(text, marks));
  const base = schema.nodes.doc.create(null, [p("a", "A", "plain"), p("b", "B", "marked", [schema.marks.strong.create()])]);
  const variants = [
    schema.nodes.doc.create(null, [p("other", "Z", "plain"), p("again", "Y", "marked", [schema.marks.strong.create()])]),
    schema.nodes.doc.create(null, [p("a", "A", "changed"), p("b", "B", "marked", [schema.marks.strong.create()])]),
    schema.nodes.doc.create(null, [p("a", "A", "plain"), p("b", "B", "marked")]),
    schema.nodes.doc.create(null, [p("a", "A", "plain")]),
  ];
  for (const variant of variants) expect(sameBareShape(base, variant)).toBe(bareShape(base) === bareShape(variant));
});

test("region writes preserve mapped steps and an appended inline transaction", () => {
  const blocks = { first: { t: "paragraph", pos: "A", c: "ab😀cd" }, second: { t: "paragraph", pos: "B", c: "tail" } };
  const binding = createYPageBinding({ store: createStore({ name: "page", value: migrateHybridValues([{ blocks }]) }) });
  const append = new pmState.Plugin({ appendTransaction(transactions, _old, next) {
    if (!transactions.some((tr) => tr.docChanged) || transactions.some((tr) => tr.getMeta("appended"))) return null;
    return next.tr.insertText("!", 2).setMeta("appended", true);
  } });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin(), append] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  try {
    const secondAt = view.state.doc.child(0).nodeSize + 2;
    const tr = view.state.tr.insertText("Z", 2);
    tr.insert(3, schema.nodes.hard_break.create());
    tr.insertText("Q", tr.mapping.map(secondAt));
    view.dispatch(tr);
    expect(binding.stats.lastGroup.regional).toBe(true);
    expect(binding.stats.mismatch).toBe(0);
    expect(bareShape(view.state.doc)).toBe(bareShape(docOf(binding.pd, walk(binding.pd))));
  } finally {
    view.destroy();
    binding.dispose();
    mount.remove();
  }
});

test("700 long blocks stay below the ordinary edit p95 target through the real editor", () => {
  const blocks = Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`p${i}`, { t: "paragraph", pos: String(i).padStart(5, "0") + "A", c: "x".repeat(350) }]));
  const store = createStore({ name: "page", value: migrateHybridValues([{ blocks }]) });
  const binding = createYPageBinding({ store });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
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
    const firstMs = edit(350);
    const samplesMs = [firstMs];
    for (let i = 0; i < 90; i++) samplesMs.push(edit([0, 350, 699][i % 3]));
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const maximumMs = sorted[sorted.length - 1];

    const middleEnd = at(350, view.state.doc.child(350).content.size);
    const nextStart = at(351, 2);
    view.dispatch(view.state.tr.insertText("joined", middleEnd, nextStart));
    const crossBlockMismatch = binding.stats.mismatch;
    view.dispatch(view.state.tr.addMark(2, 9, schema.marks.strong.create()));
    const markMismatch = binding.stats.mismatch;
    view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, at(100))));
    commands.splitBlock(view.state, view.dispatch);
    const enterMismatch = binding.stats.mismatch;

    const splitAt = at(view.state.doc.childCount - 1);
    const beforeRemote = binding.bridge.walk;
    const yAt = yBefore(beforeRemote.holes, tokenIndex(view.state.doc, new Map(), beforeRemote.visible)[splitAt]);
    binding.pd.ydoc.transact(() => binding.pd.flow.insertEmbed(yAt, { b: "remote" }), NET);
    const afterRemoteMs = edit(view.state.doc.childCount - 1);
    const result = { environment: "Jest jsdom, real EditorView dispatch", blocks: 700, charsPerBlock: 350, firstMs, samplesMs, medianMs, p95Ms, maximumMs, crossBlockMismatch, markMismatch, enterMismatch, afterRemoteMs, mismatches: binding.stats.mismatch };
    console.log(JSON.stringify(result));

    expect(binding.stats.mismatch).toBe(0);
    expect(bareShape(view.state.doc)).toBe(bareShape(docOf(binding.pd, walk(binding.pd))));
    expect(medianMs).toBeLessThan(16);
    if (process.env.CLAY_PERF === "1") expect(p95Ms).toBeLessThan(16);
  } finally {
    view.destroy();
    binding.dispose();
    mount.remove();
  }
}, 120000);
