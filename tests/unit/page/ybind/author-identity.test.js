globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, authorIdentity, authorKey } from "../../../../src/page/ybind/index.js";

const { EditorState } = pmState;

const fakeStorage = (entries = [], { throwOnGet = false } = {}) => {
  const map = new Map(entries);
  const order = [];
  return {
    order,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => { if (throwOnGet) throw new Error("denied"); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { order.push(k); map.set(k, v); },
  };
};

const open = (blocks, extra = {}) => {
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store, ...extra });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  return { store, binding, view, pd: binding.pd };
};
const texts = (view) => { const o = []; view.state.doc.forEach((n) => o.push(n.textContent)); return o; };

test("authorIdentity mints a token, records ownership first, and reuses the pointer", () => {
  const storage = fakeStorage();
  const first = authorIdentity(storage);
  expect(typeof first.token).toBe("string");
  expect(first.token.length).toBeGreaterThan(0);
  expect(first.owned).toEqual([first.token]);
  expect(storage.order).toEqual([`clay.page.author.owned.${first.token}`, "clay.page.author"]);
  expect(authorIdentity(storage)).toEqual({ token: first.token, owned: [first.token] });
});

test("authorIdentity falls back to an unowned token when storage throws", () => {
  const denied = fakeStorage([], { throwOnGet: true });
  const identity = authorIdentity(denied);
  expect(typeof identity.token).toBe("string");
  expect(identity.owned).toEqual([identity.token]);
});

test("the first local edit registers the author token in its own transaction", () => {
  const { view, pd } = open([{ id: "p", text: "hello" }, { id: "q", text: "world" }], { authorToken: "tok-a" });
  const key = authorKey(pd.ydoc.clientID);
  expect(pd.origins.has(key)).toBe(false);
  const seen = [];
  pd.ydoc.on("afterTransaction", (tr) => seen.push({ origins: tr.changed.has(pd.origins), flow: tr.changed.has(pd.flow) }));
  view.dispatch(view.state.tr.insertText("X", 2));
  expect(pd.origins.get(key)).toBe("tok-a");
  expect(seen.filter((entry) => entry.origins && entry.flow)).toHaveLength(1);
  expect(seen.filter((entry) => entry.origins && !entry.flow)).toEqual([]);
  view.dispatch(view.state.tr.insertText("Y", 3));
  expect(seen.filter((entry) => entry.origins)).toHaveLength(1);
});

test("undoing the first edit leaves the author record in place", () => {
  const { view, binding, pd } = open([{ id: "p", text: "hello" }, { id: "q", text: "world" }], { authorToken: "tok-a" });
  const key = authorKey(pd.ydoc.clientID);
  view.dispatch(view.state.tr.insertText("X", 2));
  expect(pd.origins.get(key)).toBe("tok-a");
  expect(binding.undo()).toBe(true);
  expect(texts(view)).toEqual(["hello", "world"]);
  expect(pd.origins.get(key)).toBe("tok-a");
});

test("content without an identifiable author gets no automatic deleted-block-edit notice and stays recoverable", () => {
  const notices = [];
  const { view, binding, pd } = open([{ id: "p", text: "hello" }, { id: "q", text: "world" }], { onNotice: (notice) => notices.push(notice) });
  let key = null;
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content.embed && it.content.embed.b === "q") key = `${it.id.client}.${it.id.clock}`;
  pd.ydoc.transact(() => pd.gone.set(key, { b: "q", e: null }), "page-net");
  expect(texts(view)).toEqual(["hello"]);
  expect(binding.bridge.walk.orphans.map((orphan) => orphan.text)).toEqual(["world"]);
  expect(notices.filter((notice) => notice.kind === "deleted-block-edit")).toEqual([]);
  expect(binding.recoverable.map((record) => record.source)).toEqual([key]);
  const displaced = binding.recoverable[0].blocks.flatMap((block) => block.runs).filter((run) => run.displaced);
  expect(displaced.map((run) => run.text)).toEqual(["world"]);
  expect(displaced.every((run) => run.author === null)).toBe(true);
});
