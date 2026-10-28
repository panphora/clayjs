globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { decorationsFor } from "../../../src/page/blocks.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { buildLongDocument } from "./helpers/long-document.js";

const spans = (set) => JSON.stringify(set.find().map((d) => [d.from, d.to, d.spec, d.type.attrs ?? null]));
const blockAttrs = (view) => [...view.dom.children].map((el) => [el.className.includes("page-hidden"), el.getAttribute("style"), el.getAttribute("data-marker"), el.getAttribute("aria-expanded"), !!el.querySelector(".page-toggle-button")]);

function open() {
  const fixture = buildLongDocument();
  const binding = createYPageBinding({ store: createStore({ name: "page", value: JSON.parse(JSON.stringify(fixture.value)) }), captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board });
  binding.attach(view);
  return { binding, view, mount, close() { view.destroy(); binding.dispose(); binding.ydoc.destroy(); mount.remove(); } };
}

test("the outline decoration set holds what DecorationSet.create builds from the same decorations, child by child", () => {
  const { binding, view, close } = open();
  try {
    const doc = view.state.doc;
    const fast = decorationsFor(doc);
    const reference = pmView.DecorationSet.create(doc, fast.find());
    expect(fast.find().length).toBeGreaterThan(200);
    expect(fast.eq(reference)).toBe(true);
    expect(spans(fast)).toBe(spans(reference));
    doc.forEach((child, offset) => {
      const a = fast.forChild(offset, child), b = reference.forChild(offset, child);
      expect(spans(a)).toBe(spans(b));
    });
  } finally {
    close();
  }
}, 120000);

test("typing across the long document leaves every block's collapse attributes as a fresh editor renders them", () => {
  const a = open();
  try {
    const starts = [];
    a.view.state.doc.forEach((block, start) => { if (block.isTextblock && block.content.size > 2) starts.push(start + 1); });
    for (let i = 0; i < 40; i++) {
      const at = starts[(i * 37) % starts.length] + (i % 2);
      a.view.dispatch(a.view.state.tr.insertText("a", at));
      for (let j = 0; j < starts.length; j++) if (starts[j] > at) starts[j] += 1;
    }
    const mount = document.body.appendChild(document.createElement("div"));
    const fresh = createPageEditor(mount, { doc: a.view.state.doc, dispatch: () => {}, history: false });
    try {
      expect(blockAttrs(a.view)).toEqual(blockAttrs(fresh));
    } finally {
      fresh.destroy();
      mount.remove();
    }
    expect(a.binding.stats.mismatch).toBe(0);
  } finally {
    a.close();
  }
}, 120000);
