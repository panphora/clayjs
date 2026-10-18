import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { langOf, tokenize, highlightKey } from "../../../src/page/highlight.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

/**
 * Code block colours: a block with a language is highlighted after typing
 * pauses, a plain block never asks for tokens, the picker sets the language as
 * one undo step, and the real Shiki bundle loads and colours JavaScript.
 */

afterEach(() => { document.body.innerHTML = ""; });

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const fake = () => {
  const calls = [];
  const run = (code, lang) => {
    calls.push([code, lang]);
    return Promise.resolve([[{ content: code.slice(0, 5), offset: 0, color: "var(--page-code-token-keyword)", fontStyle: 0 }]]);
  };
  return { calls, run };
};
const decos = (view) => highlightKey.getState(view.state).find();
const code = (view) => view.dom.querySelector("pre");

test("langOf accepts ids and common aliases and drops anything unknown", () => {
  expect(["js", "TS", "bash", "py", "c++", "javascript", "klingon", "", null].map(langOf))
    .toEqual(["javascript", "typescript", "shellscript", "python", "cpp", "javascript", "", "", ""]);
});

test("a code block with a language gets colours without a document change or an undo step", async () => {
  const { calls, run } = fake();
  const view = editor([["c", "code_block", "const x = 1", { lang: "js" }]], { highlight: { tokenize: run, delay: 0 } });
  const depth = history.undoDepth(view.state);
  const doc = view.state.doc;
  await wait();
  expect(calls).toEqual([["const x = 1", "javascript"]]);
  expect(decos(view).map((d) => [d.from, d.to])).toEqual([[1, 6]]);
  expect(decos(view)[0].type.attrs.style).toBe("color: var(--page-code-token-keyword)");
  expect(view.state.doc).toBe(doc);
  expect(history.undoDepth(view.state)).toBe(depth);
});

test("a plain code block never loads the highlighter", async () => {
  const { calls, run } = fake();
  editor([["c", "code_block", "plain words"]], { highlight: { tokenize: run, delay: 0 } });
  await wait();
  expect(calls).toEqual([]);
});

test("typing highlights once after the pause, not on every keystroke", async () => {
  const { calls, run } = fake();
  const view = editor([["c", "code_block", "let a", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 40 } });
  await wait(60);
  calls.length = 0;
  select(view, posOf(view, "c", true));
  for (const ch of " = 12;") typeText(view, ch);
  expect(calls).toEqual([]);
  await wait(80);
  expect(calls).toEqual([["let a = 12;", "javascript"]]);
});

test("a result for text that has since changed is dropped", async () => {
  let release;
  const run = () => new Promise((r) => { release = () => r([[{ content: "abc", offset: 0, color: "var(--page-code-token-keyword)", fontStyle: 0 }]]); });
  const view = editor([["c", "code_block", "abc", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 0 } });
  await wait();
  select(view, posOf(view, "c"));
  typeText(view, "z");
  release();
  await wait();
  expect(decos(view)).toEqual([]);
});

test("the picker sets the language as one undo step, and Plain text clears the colours", async () => {
  const { calls, run } = fake();
  const view = editor([["c", "code_block", "print(1)"]], { highlight: { tokenize: run, delay: 0 } });
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  const picker = code(view).querySelector("select.page-code-lang");
  expect(picker.value).toBe("");
  picker.value = "python";
  picker.dispatchEvent(new Event("change"));
  expect(view.state.doc.child(0).attrs.lang).toBe("python");
  await wait();
  expect(calls).toEqual([["print(1)", "python"]]);
  expect(decos(view).length).toBe(1);
  picker.value = "";
  picker.dispatchEvent(new Event("change"));
  await wait();
  expect(decos(view)).toEqual([]);
  history.undo(view.state, view.dispatch);
  expect(view.state.doc.child(0).attrs.lang).toBe("python");
});

test("the real Shiki bundle loads on demand and colours JavaScript keywords", async () => {
  const lines = await tokenize("const x = 1 // note", "javascript");
  const byText = Object.fromEntries(lines.flat().map((t) => [t.content.trim(), t.color]));
  expect(byText.const).toBe("var(--page-code-token-keyword)");
  expect(byText["// note"]).toBe("var(--page-code-token-comment)");
});

describe("review round 1", () => {
  test("turning a coloured code block into text drops its colours", async () => {
    const { run } = fake();
    const view = editor([["c", "code_block", "const x = 1", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 0 } });
    await wait();
    expect(decos(view).length).toBe(1);
    const { turnInto, BLOCK_TYPES } = await import("../../../src/page/chrome.js");
    view.dispatch(turnInto(view.state, 0, BLOCK_TYPES[0]));
    await wait();
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(decos(view)).toEqual([]);
  });

  test("deleting a coloured block and undoing brings its colours back without tokenizing again", async () => {
    const { calls, run } = fake();
    const view = editor([["p", "paragraph", "P"], ["c", "code_block", "const x = 1", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 0 } });
    await wait();
    const n = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.delete(n, n + view.state.doc.child(1).nodeSize));
    await wait();
    expect(decos(view)).toEqual([]);
    history.undo(view.state, view.dispatch);
    await wait();
    expect(decos(view).length).toBe(1);
    expect(calls.length).toBe(1);
  });

  test("replacing all the code and undoing before the pause restores the colours", async () => {
    const { run } = fake();
    const view = editor([["c", "code_block", "const x = 1", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 30 } });
    await wait(50);
    select(view, posOf(view, "c"), posOf(view, "c", true));
    typeText(view, "q");
    history.undo(view.state, view.dispatch);
    await wait(60);
    expect(view.state.doc.child(0).textContent).toBe("const x = 1");
    expect(decos(view).length).toBe(1);
  });

  test("a removed code block is no longer observed", async () => {
    const observed = new Set();
    const win = document.defaultView;
    const prev = win.IntersectionObserver;
    win.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { observed.add(el); this.cb([{ target: el, isIntersecting: true }]); }
      unobserve(el) { observed.delete(el); }
      disconnect() { observed.clear(); }
    };
    try {
      const { run } = fake();
      const view = editor([["p", "paragraph", "P"], ["c", "code_block", "x", { lang: "javascript" }]], { highlight: { tokenize: run, delay: 0 } });
      await wait();
      expect(observed.size).toBe(1);
      const n = view.state.doc.child(0).nodeSize;
      view.dispatch(view.state.tr.delete(n, n + view.state.doc.child(1).nodeSize));
      await wait();
      expect(observed.size).toBe(0);
    } finally {
      win.IntersectionObserver = prev;
    }
  });
});
