import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { BlockSelection } from "../../../src/page/blocks.js";
import { REMOTE } from "../../../src/page/model.js";
import { setEditorActive } from "../../../src/page/editor.js";
import { editor, posOf, select, shape } from "./view-helpers.js";

/**
 * The touch drag from the grip: a hold of a quarter second inside eight px starts
 * the drag the mouse starts on its first move, and a tap before then is the menu.
 * The layout is the fake one drag.test.js uses. The hold is real time, so each
 * test waits for it the way a finger does.
 */

// jsdom has no scrollingElement, which the auto-scroll measures against.
beforeEach(() => {
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: document.documentElement });
});
afterEach(() => { document.body.innerHTML = ""; });

const ROW = 30;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function layout(view) {
  let at = 0;
  view.state.doc.forEach((n, _, i) => {
    const dom = view.nodeDOM(at);
    dom.getBoundingClientRect = () => ({ left: 0, top: i * ROW, width: 600, height: 20, right: 600, bottom: i * ROW + 20 });
    at += n.nodeSize;
  });
  view.posAtCoords = ({ top }) => {
    const i = Math.max(0, Math.min(Math.floor(top / ROW), view.state.doc.childCount - 1));
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
}
function page(spec, caretId = spec[0][0]) {
  const view = editor(spec);
  layout(view);
  select(view, posOf(view, caretId));
  return view;
}
const grip = (view) => view.dom.parentElement.querySelector(".page-grip");
const shell = (view) => view.dom.parentElement;
const menu = (view) => shell(view).querySelector(".page-menu");
const line = (view) => shell(view).querySelector(".page-drop");
const live = (view) => shell(view).querySelector(".page-live").textContent;
const chrome = (view) => view.pluginViews.find((p) => p.menuEl);
const ptr = (type, props = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: props.x ?? 0, clientY: props.y ?? 0 });
  Object.defineProperty(e, "pointerId", { value: props.pointerId ?? 1 });
  Object.defineProperty(e, "pointerType", { value: props.pointerType ?? "touch" });
  return e;
};
const hoverBlock = (view, i) => shell(view).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: i * ROW + 2 }));
const press = (view, i, y = i * ROW + 10) => {
  hoverBlock(view, i);
  grip(view).dispatchEvent(ptr("pointerdown", { x: -20, y }));
};
const order = (view) => { const out = []; view.state.doc.forEach((n) => out.push(n.attrs.id)); return out; };
const dragging = (view) => shell(view).classList.contains("is-dragging");
const held = async (view, i, y) => { press(view, i, y); await wait(320); };

const FOUR = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];

describe("the hold that starts a touch drag", () => {
  test("a short tap opens the block menu and never drags", async () => {
    const view = page(FOUR);
    press(view, 2, 70);
    await wait(120);
    expect(dragging(view)).toBe(false);
    grip(view).dispatchEvent(ptr("pointerup", { x: -20, y: 70 }));
    expect(view.state.selection instanceof BlockSelection).toBe(true);
    expect(view.state.selection.span(view.state.doc)).toEqual({ lo: 2, hi: 2 });
    expect(menu(view).hidden).toBe(false);
    expect(live(view)).not.toBe("Moved 1 block");
  });

  test("a quarter second of stillness starts the drag", async () => {
    const view = page(FOUR);
    press(view, 1, 40);
    await wait(120);
    expect(dragging(view)).toBe(false);
    await wait(220);
    expect(dragging(view)).toBe(true);
    expect(view.state.selection instanceof BlockSelection).toBe(true);
    expect(line(view).hidden).toBe(false);
    grip(view).dispatchEvent(ptr("pointerup", { x: -20, y: 40 }));
  });

  test("movement past eight px before the hold cancels it, and the release opens nothing", async () => {
    const view = page(FOUR);
    press(view, 0, 10);
    await wait(60);
    grip(view).dispatchEvent(ptr("pointermove", { x: 30, y: 60 }));
    expect(dragging(view)).toBe(false);
    await wait(320);
    expect(dragging(view)).toBe(false);
    expect(line(view).hidden).toBe(true);
    grip(view).dispatchEvent(ptr("pointerup", { x: 30, y: 60 }));
    expect(menu(view).hidden).toBe(true);
  });

  test("a scroll before the hold invalidates it", async () => {
    const view = page(FOUR);
    press(view, 0, 10);
    await wait(60);
    document.body.dispatchEvent(new Event("scroll"));
    await wait(320);
    expect(dragging(view)).toBe(false);
    expect(line(view).hidden).toBe(true);
    grip(view).dispatchEvent(ptr("pointerup", { x: -20, y: 10 }));
    expect(menu(view).hidden).toBe(true);
  });
});

describe("a held touch drag", () => {
  test("one successful move and one undo step", async () => {
    const view = page(FOUR);
    await held(view, 0, 10);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 24 }));
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 2 * ROW + 24 }));
    expect(shape(view)).toBe("B | C | A | D");
    expect(live(view)).toBe("Moved 1 block");
    history.undo(view.state, view.dispatch);
    expect(shape(view)).toBe("A | B | C | D");
  });

  test("a block a peer inserted above does not take the drag's place", async () => {
    const view = page(FOUR);
    await held(view, 1, 40);
    const tr = view.state.tr.insert(0, view.state.schema.nodes.paragraph.create({ id: "peer" }, view.state.schema.text("Peer"))).setMeta(REMOTE, true);
    view.dispatch(tr);
    layout(view);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 3 * ROW + 10 }));
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 3 * ROW + 10 }));
    expect(order(view)).toEqual(["peer", "a", "c", "b", "d"]);
  });

  test("a remote deletion of the dragged block cancels without moving a replacement", async () => {
    const view = page(FOUR);
    await held(view, 0, 10);
    const at = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.delete(0, at).setMeta(REMOTE, true));
    layout(view);
    const before = view.state.doc;
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 10 }));
    expect(dragging(view)).toBe(false);
    expect(view.state.doc).toBe(before);
    expect(live(view)).toBe("Move cancelled");
  });

  test("leaving the pointer near the bottom edge scrolls, and the release stops it", async () => {
    const view = page(FOUR);
    const parent = view.dom.parentElement.parentElement;
    parent.style.overflowY = "auto";
    let top = 0;
    Object.defineProperty(parent, "scrollTop", { configurable: true, get: () => top, set: (v) => { top = v; } });
    Object.defineProperty(parent, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(parent, "clientHeight", { configurable: true, value: 300 });
    parent.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300 });
    await held(view, 0, 150);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 290 }));
    for (let i = 0; i < 200 && top === 0; i++) await wait(10);
    expect(top).toBeGreaterThan(0);
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 290 }));
    const stopped = top;
    await wait(60);
    expect(top).toBe(stopped);
  });
});

describe("cancelling a held touch drag", () => {
  test.each(["pointercancel", "lostpointercapture"])("a %s leaves the document alone", async (type) => {
    const view = page(FOUR);
    await held(view, 0, 10);
    const before = view.state.doc;
    grip(view).dispatchEvent(ptr(type));
    expect(dragging(view)).toBe(false);
    expect(line(view).hidden).toBe(true);
    expect(view.state.doc).toBe(before);
    expect(live(view)).toBe("Move cancelled");
  });

  test("a second touch cancels", async () => {
    const view = page(FOUR);
    await held(view, 0, 10);
    const before = view.state.doc;
    document.body.dispatchEvent(ptr("pointerdown", { pointerId: 2, x: 200, y: 200 }));
    expect(dragging(view)).toBe(false);
    expect(view.state.doc).toBe(before);
    expect(live(view)).toBe("Move cancelled");
  });

  test("the window losing focus cancels", async () => {
    const view = page(FOUR);
    await held(view, 0, 10);
    const before = view.state.doc;
    window.dispatchEvent(new Event("blur"));
    expect(dragging(view)).toBe(false);
    expect(view.state.doc).toBe(before);
    expect(live(view)).toBe("Move cancelled");
  });

  test("leaving edit mode cancels", async () => {
    const view = page(FOUR);
    await held(view, 0, 10);
    const before = view.state.doc;
    setEditorActive(view, false);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 10 }));
    expect(dragging(view)).toBe(false);
    expect(view.state.doc).toBe(before);
    expect(live(view)).toBe("Move cancelled");
  });

  test("every path clears the timer, the listeners and the preview", async () => {
    const view = page(FOUR);
    press(view, 0, 10);
    expect(chrome(view).drag.state.hold).toBeTruthy();
    grip(view).dispatchEvent(ptr("pointercancel"));
    expect(chrome(view).drag.state).toBe(null);
    expect(dragging(view)).toBe(false);
    expect(line(view).hidden).toBe(true);
    await wait(320);
    expect(dragging(view)).toBe(false);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 10 }));
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 2 * ROW + 10 }));
    expect(dragging(view)).toBe(false);
    expect(menu(view).hidden).toBe(true);
  });
});

describe("a refused move", () => {
  // The unit editor has no binding, so its dispatch stands in for the bridge's
  // admission: a transaction that carries or rewrites an opaque block is refused
  // before it writes, exactly as the binding refuses it.
  const guarded = (view) => {
    const dispatch = view.dispatch;
    const opaqueAt = (doc) => { const out = new Map(); doc.forEach((n, pos) => { if (n.type.name === "opaque_block") out.set(n.attrs.id, pos); }); return out; };
    view.dispatch = (tr) => {
      const was = opaqueAt(view.state.doc);
      if (tr.docChanged && [...opaqueAt(tr.doc)].some(([id, pos]) => was.get(id) !== pos)) return { status: "refused", code: "unsupported-format" };
      return dispatch(tr);
    };
  };
  const mixed = () => {
    const view = page([["a", "paragraph", "A"], ["c", "paragraph", "C"]]);
    const at = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.insert(at, view.state.schema.nodes.opaque_block.create({ id: "u", pos: "C", raw: { t: "future_block" } })));
    layout(view);
    return view;
  };

  test("an opaque span is refused and the document keeps its order", async () => {
    const view = mixed();
    expect(view.state.doc.child(1).type.name).toBe("opaque_block");
    guarded(view);
    await held(view, 1, 40);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 15 }));
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 2 * ROW + 15 }));
    expect(order(view)).toEqual(["a", "u", "c"]);
  });

  test("a refused move never announces success", async () => {
    const view = mixed();
    guarded(view);
    await held(view, 1, 40);
    grip(view).dispatchEvent(ptr("pointermove", { x: 5, y: 2 * ROW + 15 }));
    grip(view).dispatchEvent(ptr("pointerup", { x: 5, y: 2 * ROW + 15 }));
    expect(live(view)).not.toBe("Moved 1 block");
    expect(live(view)).toBe("Move cancelled");
  });
});
