import { jest } from "@jest/globals";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createYProvider, docFromValue, enc, YDecodeError } from "../../../../src/page/ybind/provider.js";

let docs;
beforeEach(() => { docs = []; });
afterEach(() => { for (const doc of docs) doc.destroy(); });
const track = (doc) => { docs.push(doc); return doc; };
const valueOf = (y) => ({ v: 1, y });
const load = (value, options = { strict: true }) => track(docFromValue(value, options));
const encoded = (text) => {
  const doc = track(new Y.Doc());
  doc.getText("flow").insert(0, text);
  return enc(Y.encodeStateAsUpdateV2(doc));
};
const history = () => {
  const doc = track(new Y.Doc());
  const updates = [];
  doc.on("updateV2", (update) => updates.push(enc(update)));
  doc.getText("flow").insert(0, "abc");
  doc.getText("flow").insert(3, "def");
  doc.getText("flow").delete(0, 6);
  return { first: updates[0], second: updates[1], deleted: updates[2] };
};
const fails = (value, code) => {
  let caught;
  try { load(value); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(YDecodeError);
  expect(caught.code).toBe(code);
};

test("strict loading accepts a complete value without g and leaves the input unchanged", () => {
  const value = valueOf({ seed: encoded("complete page") });
  const before = JSON.stringify(value);
  expect(load(value).getText("flow").toString()).toBe("complete page");
  expect(JSON.stringify(value)).toBe(before);
  expect(load(valueOf({})).getText("flow").toString()).toBe("");
});

test("strict loading accepts the provider's multipart output and rejects a missing piece", () => {
  const store = createStore({ name: "page", value: { v: 1, g: 0, y: {} } });
  const source = track(new Y.Doc());
  const provider = createYProvider({ store, ydoc: source, setTimer: () => 0, clearTimer: () => {} });
  try { source.getText("flow").insert(0, "large ".repeat(2400)); } finally { provider.dispose(); }
  const keys = Object.keys(store.value.y);
  expect(keys.length).toBeGreaterThan(1);
  expect(load(store.value).getText("flow").toString()).toBe("large ".repeat(2400));
  const partial = JSON.parse(JSON.stringify(store.value));
  delete partial.y[keys[1]];
  fails(partial, "incomplete-update");
  expect(load(partial, { strict: false }).getText("flow").toString()).toBe("");
});

test("strict loading checks insertion prerequisites after every entry has been applied", () => {
  const { first, second } = history();
  fails(valueOf({ dependent: second }), "unresolved-update");
  const permissive = load(valueOf({ dependent: second }), { strict: false });
  expect(permissive.getText("flow").toString()).toBe("");
  expect(permissive.store.pendingStructs).not.toBeNull();
  const complete = load(valueOf({ "a-dependent": second, "z-prerequisite": first }));
  expect(complete.getText("flow").toString()).toBe("abcdef");
  expect(complete.store.pendingStructs).toBeNull();
});

test("strict loading also rejects missing deletion prerequisites", () => {
  const { first, second, deleted } = history();
  fails(valueOf({ deleted }), "unresolved-update");
  const permissive = load(valueOf({ deleted }), { strict: false });
  expect(permissive.store.pendingDs).not.toBeNull();
  const complete = load(valueOf({ "a-deleted": deleted, "b-dependent": second, "z-prerequisite": first }));
  expect(complete.getText("flow").toString()).toBe("");
  expect(complete.store.pendingStructs).toBeNull();
  expect(complete.store.pendingDs).toBeNull();
});

test("an older consistent state remains valid when a later update is absent", () => {
  const { first, second } = history();
  expect(first).not.toBe(second);
  expect(load(valueOf({ first })).getText("flow").toString()).toBe("abc");
  expect(load(valueOf({ first, second })).getText("flow").toString()).toBe("abcdef");
});

test.each([
  ["mixed counts", (full, a, b) => ({ "b.0.2": a, "b.1.3": b })],
  ["extra index", (full, a, b) => ({ "b.0.2": a, "b.1.2": b, "b.2.2": "" })],
  ["zero count", (full) => ({ "b.0.0": full })],
  ["duplicate index", (full, a, b) => ({ "b.0.2": a, "b.00.2": a, "b.1.2": b })],
  ["whole and parts", (full, a, b) => ({ b: full, "b.0.2": a, "b.1.2": b })],
])("strict loading rejects %s even when the permissive join decodes", (_, make) => {
  const full = encoded("valid update");
  const middle = Math.floor(full.length / 2);
  const value = valueOf(make(full, full.slice(0, middle), full.slice(middle)));
  expect(load(value, { strict: false }).getText("flow").toString()).toBe("valid update");
  fails(value, "invalid-update");
});

test("strict base64 rejects Node's ignored garbage while retaining whitespace and optional padding", () => {
  const full = encoded("hello world");
  const dirty = valueOf({ seed: full + "@@" });
  expect(load(dirty, { strict: false }).getText("flow").toString()).toBe("hello world");
  fails(dirty, "invalid-update");
  expect(load(valueOf({ seed: ` \n${full.replace(/=+$/, "")}\t` })).getText("flow").toString()).toBe("hello world");
});

// A store holds up to 4 MiB, and a backtracking base64 check overflowed V8's backtrack stack
// at about 4.4 MB of base64 in a fresh process (and at 3.3 MB after earlier files in the same
// jest worker had used up part of it), so strict loading refused a legitimate large page.
test("strict base64 checks an update of several MB without exhausting the regexp stack", () => {
  const text = "s".repeat(4_000_000);
  const seed = encoded(text);
  expect(seed.length).toBeGreaterThan(5_000_000);
  expect(load(valueOf({ seed })).getText("flow").length).toBe(text.length);
  fails(valueOf({ seed: seed + "@" }), "invalid-update");
});

test.each([null, { v: 0, y: {} }, { v: 1 }, { v: 1, y: [] }])("strict loading rejects an unsupported envelope: %p", (value) => {
  fails(value, "invalid-value");
});

test("strict loading rejects a non-string update", () => {
  fails(valueOf({ seed: 42 }), "invalid-update");
});

test("a structurally invalid update destroys its temporary document and returns a typed error", () => {
  const destroy = jest.spyOn(Y.Doc.prototype, "destroy");
  try {
    fails(valueOf({ seed: "AA==" }), "invalid-update");
    expect(destroy).toHaveBeenCalledTimes(1);
  } finally { destroy.mockRestore(); }
});
