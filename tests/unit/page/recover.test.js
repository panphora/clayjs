globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, authorKey } from "../../../src/page/ybind/index.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { moveBlock } from "../../../src/page/blocks.js";
import { createRecoverList, NOTICE_TEXT } from "../../../src/page/recover.js";

const run = (text, displaced, author = null) => ({ kind: "text", text, displaced, baseline: !displaced, author });
const record = (source, runs, type = "paragraph") => ({ source, revision: `rev-${source}`, blockId: "q", type, blocks: [{ id: "q", type, runs }] });

function fakeBinding() {
  let listener = null;
  return {
    restore: jest.fn(() => ({ status: "restored", id: "recovered:1.4" })),
    dismiss: jest.fn(),
    subscribeRecovery(fn) { listener = fn; fn({ recoverable: [], notices: [] }); return () => { listener = null; }; },
    push(snapshot) { listener?.(snapshot); },
    get listening() { return listener !== null; },
  };
}

const mounts = [];
const mountList = (options) => {
  const mount = document.body.appendChild(document.createElement("div"));
  const list = createRecoverList({ mount, ...options });
  mounts.push({ mount, list });
  return { mount, list, button: mount.querySelector(".page-recover"), panel: mount.querySelector(".page-recover-panel") };
};
const toasts = () => [...document.querySelectorAll("[data-clay-toast]")].filter((el) => el.textContent.includes(NOTICE_TEXT));
const buttonIn = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent === label);

afterEach(() => {
  for (const { mount, list } of mounts.splice(0)) { list.destroy(); mount.remove(); }
  jest.useRealTimers();
});

test("the button appears only when something is recoverable, and the panel lists each record with its displaced text marked", () => {
  const binding = fakeBinding();
  const { button, panel } = mountList({ binding, ownTokens: ["tok-a"] });
  expect(button.hidden).toBe(true);
  binding.push({ recoverable: [record("1.4", [run("bra", false), run("!Z", true, "tok-a")]), record("2.9", [run("note", true, "tok-b")], "heading")], notices: [] });
  expect(button.hidden).toBe(false);
  expect(button.textContent).toBe("Recover changes (2)");
  button.click();
  expect(panel.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const rows = panel.querySelectorAll(".page-recover-row");
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector(".page-recover-meta").textContent).toBe("Paragraph · You");
  expect(rows[0].querySelector(".page-recover-text").innerHTML).toBe("bra<mark>!Z</mark>");
  expect(rows[1].querySelector(".page-recover-meta").textContent).toBe("Heading · Another editor");
  expect(document.activeElement).toBe(rows[0].querySelector("button"));
});

test("Restore passes the record's source and revision, and reports the restored block", () => {
  const binding = fakeBinding();
  const onRestored = jest.fn();
  const { button, panel } = mountList({ binding, onRestored });
  binding.push({ recoverable: [record("1.4", [run("x", true)])], notices: [] });
  button.click();
  buttonIn(panel, "Restore").click();
  expect(binding.restore).toHaveBeenCalledWith("1.4", "rev-1.4");
  expect(onRestored).toHaveBeenCalledWith("recovered:1.4");
  binding.push({ recoverable: [], notices: [] });
  expect(button.hidden).toBe(true);
  expect(panel.hidden).toBe(true);
});

test("a stale Restore is reported and nothing else happens", () => {
  const binding = fakeBinding();
  binding.restore.mockReturnValueOnce({ status: "stale", notice: null });
  const onRestored = jest.fn(), onStale = jest.fn();
  const { button, panel } = mountList({ binding, onRestored, onStale });
  binding.push({ recoverable: [record("1.4", [run("x", true)])], notices: [] });
  button.click();
  buttonIn(panel, "Restore").click();
  expect(onStale).toHaveBeenCalledWith({ status: "stale", notice: null });
  expect(onRestored).not.toHaveBeenCalled();
});

test("Escape closes the panel and returns focus to the button", () => {
  const binding = fakeBinding();
  const { button, panel } = mountList({ binding });
  binding.push({ recoverable: [record("1.4", [run("x", true)])], notices: [] });
  button.click();
  panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(panel.hidden).toBe(true);
  expect(document.activeElement).toBe(button);
});

test("a personal notice shows one toast; Review opens the record and Dismiss dismisses every notice", () => {
  jest.useFakeTimers();
  const binding = fakeBinding();
  const { panel } = mountList({ binding });
  const recs = [record("1.4", [run("x", true)]), record("2.9", [run("y", true)])];
  const notices = [{ kind: "recovered-change", source: "2.9", revision: "rev-2.9" }, { kind: "recovered-change", source: "1.4", revision: "rev-1.4" }];
  binding.push({ recoverable: recs, notices });
  binding.push({ recoverable: recs, notices });
  expect(toasts()).toHaveLength(1);
  buttonIn(toasts()[0], "Review").click();
  expect(panel.hidden).toBe(false);
  expect(panel.querySelector(".is-target").dataset.source).toBe("2.9");
  expect(document.activeElement).toBe(panel.querySelector('[data-source="2.9"] button'));
  buttonIn(toasts()[0], "Dismiss").click();
  expect(binding.dismiss.mock.calls).toEqual([["2.9", "rev-2.9"], ["1.4", "rev-1.4"]]);
  binding.push({ recoverable: recs, notices: [] });
  jest.advanceTimersByTime(600);
  expect(toasts()).toHaveLength(0);
});

test("destroy unsubscribes and removes the button and panel", () => {
  const binding = fakeBinding();
  const { mount, list } = mountList({ binding });
  mounts.pop();
  list.destroy();
  mount.remove();
  expect(binding.listening).toBe(false);
  expect(mount.querySelector(".page-recover")).toBeNull();
});

test("with a real binding, a peer's text kept aside by an Undo is listed and Restore brings it back", () => {
  const seed = createPageDoc(new Y.Doc());
  seed.ydoc.clientID = 1;
  seedFrom(seed, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const tab = (client, token) => {
    const doc = new Y.Doc();
    doc.clientID = client;
    Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(seed.ydoc));
    const pd = createPageDoc(doc);
    pd.origins.set(authorKey(client), token);
    const bridge = createBridge({ pd, captureTimeout: 0, authorToken: token });
    const mount = document.body.appendChild(document.createElement("div"));
    const view = new pmView.EditorView(mount, {
      state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
      dispatchTransaction: (tr) => bridge.dispatch(tr),
    });
    bridge.attach(view);
    return { pd, bridge, view, mount };
  };
  const a = tab(300, "tok-a"), b = tab(200, "tok-b");
  const caretIn = (t, id, offset) => {
    let at = null;
    t.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1 + offset; });
    t.view.dispatch(t.view.state.tr.setSelection(pmState.TextSelection.create(t.view.state.doc, at)));
  };
  caretIn(a, "q", 0);
  moveBlock(1)(a.view.state, a.view.dispatch);
  Y.applyUpdateV2(b.pd.ydoc, Y.encodeStateAsUpdateV2(a.pd.ydoc), NET);
  caretIn(b, "q", 2);
  b.view.dispatch(b.view.state.tr.insertText("Z"));
  Y.applyUpdateV2(a.pd.ydoc, Y.encodeStateAsUpdateV2(b.pd.ydoc), NET);
  a.bridge.undo();

  const restored = [];
  const { button, panel } = mountList({ binding: a.bridge, ownTokens: ["tok-a"], onRestored: (id) => restored.push(id) });
  expect(button.textContent).toBe("Recover changes (1)");
  button.click();
  expect(panel.querySelector(".page-recover-meta").textContent).toBe("Paragraph · Another editor");
  expect(panel.querySelector("mark").textContent).toBe("Z");
  buttonIn(panel, "Restore").click();
  expect(restored).toHaveLength(1);
  const texts = [];
  a.view.state.doc.forEach((node) => texts.push(node.textContent));
  expect(texts.some((text) => text.includes("Z"))).toBe(true);
  expect(button.hidden).toBe(true);
  for (const t of [a, b]) { t.view.destroy(); t.bridge.dispose(); t.mount.remove(); }
});
