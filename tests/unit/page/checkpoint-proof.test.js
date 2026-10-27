// Scenario: the proof one accepted save produces, and the page state a host hands back.
//
// A save is proved against the capture that was sent, never against the store: an edit
// made after the capture is in the store and is not in the bytes the host took. And a
// proof is only worth the records it covers, so a state that does not project onto the
// accepted article, a state from another version, another generation or another document,
// and a host that answers 412, 428 or 404 all leave every record where it was.

import { webcrypto } from "node:crypto";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { toBase64 } from "../../../src/vendor/yjs.vendor.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { canonicalPageBytes, containsUpdate, digestHex, validatePageCheckpoint } from "../../../src/page/ybind/recovery-proof.js";
import { articleOfPageState } from "../../../src/page/save-projection.js";
import {
  captureProof,
  checkpointAccepted,
  readPageState,
  refetchedProof,
  verifyPageState,
} from "../../../src/page/checkpoint-proof.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const AUTHORITY = { host: "fixture.test", documentId: "0b7f3d0e-2a55-4f77-9c31-8a1c0b9a1e42", principalId: "person-1" };
const GENERATION = "3f".repeat(16);
const CONTEXT = { authority: AUTHORITY, lineage: { generation: GENERATION } };
const ACCEPTED = { authority: AUTHORITY, lineage: { generation: GENERATION } };
const HREF = "/_/page-state";
const ETAG = '"file-1"';

const stateOf = (doc) => ({ v: 1, g: 0, y: { seed: toBase64(Y.encodeStateAsUpdateV2(doc)) } });
const load = (value) => {
  const doc = new Y.Doc();
  for (const key of Object.keys(value.y).sort()) Y.applyUpdateV2(doc, Y.fromBase64(value.y[key]), NET);
  return doc;
};
const record = (id, revision, update, context = CONTEXT) => ({ id, revision, update, context });
const digestOf = async (state) => digestHex(canonicalPageBytes(state));

function edit(doc, change) {
  const updates = [];
  const onUpdate = (update) => updates.push(update);
  doc.on("updateV2", onUpdate);
  try { change(doc.getText("flow")); } finally { doc.off("updateV2", onUpdate); }
  return Y.mergeUpdatesV2(updates);
}

// Positions in the flow: 0 is the first paragraph's marker, 1 is before its first
// character, 2 is between its first and second. Every edit lands inside a paragraph, so
// the state stays a page a projection can render.
const seed = seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);
const typed = load(seed);
const added = edit(typed, (flow) => flow.insert(2, "!"));
const later = edit(typed, (flow) => flow.insert(3, "?"));
const removed = edit(typed, (flow) => flow.delete(1, 1));

// The capture's state: the seed with `added` in it, and neither edit that followed.
const docA = load(seed);
Y.applyUpdateV2(docA, added);
const STATE_A = stateOf(docA);
const ARTICLE_A = articleOfPageState(STATE_A);

// The state the host persisted after both later edits, deletions included.
const STATE_B = stateOf(typed);
const ARTICLE_B = articleOfPageState(STATE_B);

// Another writer's own insertion: a state and a record this page never had.
const stranger = load(seed);
const foreign = edit(stranger, (flow) => flow.insert(2, "Z"));

// A fixture page-state adapter: the contract every host answers, over a state we name.
const adapter = (over = {}) => async (url, init) => {
  const state = over.state ?? STATE_B;
  const status = over.status ?? 200;
  const body = {
    version: over.version ?? 1,
    documentId: over.documentId ?? AUTHORITY.documentId,
    generation: over.generation ?? GENERATION,
    etag: over.etag ?? ETAG,
    stateHash: over.stateHash ?? await digestOf(state),
    tag: over.tag ?? JSON.stringify(state),
  };
  return { ok: status >= 200 && status < 300, status, url, init, text: async () => JSON.stringify(body) };
};
const refusedBy = (status) => async (url, init) => ({ ok: false, status, url, init, text: async () => "" });

// A fixture page.yjs channel: it narrows the caller's list through the same validator a
// real store calls, and reports what it retired.
function channel() {
  const held = new Map();
  const calls = [];
  return {
    held,
    calls,
    add(id, revision) { held.set(String(id), revision); },
    async checkpoint({ records = [], proof = null } = {}) {
      calls.push({ records: records.map(({ id, revision }) => ({ id, revision })), proof });
      const answer = await validatePageCheckpoint(proof, records);
      const retired = records.filter(({ id, revision }) => answer.some((item) => item.revision === revision && String(item.id) === String(id)));
      for (const { id } of retired) held.delete(String(id));
      return { ok: true, retired };
    },
  };
}

const captured = (over = {}) => ({
  capture: "capture-1",
  records: [record("added", 1, added)],
  accepted: ACCEPTED,
  article: ARTICLE_A,
  state: STATE_A,
  etag: ETAG,
  ...over,
});

test("the fixture's states differ by an insertion and a deletion", () => {
  expect(ARTICLE_A).toBe('<p data-id="p">h!ello</p>\n<p data-id="q">world</p>');
  expect(ARTICLE_B).toBe('<p data-id="p">!?ello</p>\n<p data-id="q">world</p>');
  expect(containsUpdate(canonicalPageBytes(STATE_A), added)).toBe(true);
  expect(containsUpdate(canonicalPageBytes(STATE_A), later)).toBe(false);
  expect(containsUpdate(canonicalPageBytes(STATE_A), removed)).toBe(false);
  expect(containsUpdate(canonicalPageBytes(STATE_B), later)).toBe(true);
  expect(containsUpdate(canonicalPageBytes(STATE_B), removed)).toBe(true);
  expect(containsUpdate(canonicalPageBytes(STATE_B), foreign)).toBe(false);
});

test("the capture's own proof covers what its bytes carried, never an edit made after it", async () => {
  const proof = await captureProof({ ...captured(), records: [record("added", 1, added), record("later", 2, later)] });
  expect(proof.ok).toBe(true);
  expect(proof.covered).toEqual([{ id: "added", revision: 1 }]);
  expect(proof.proof.capture).toBe("capture-1");
  expect(proof.proof.stateDigest).toBe(await digestOf(STATE_A));
  expect(proof.proof.receipt).toEqual({ file: ETAG, pageState: await digestOf(STATE_A) });

  // The same two records against the bytes that carry the later edit are both covered.
  const grown = await captureProof({ ...captured({ state: STATE_B, article: ARTICLE_B }), records: [record("added", 1, added), record("later", 2, later)] });
  expect(grown.covered).toEqual([{ id: "added", revision: 1 }, { id: "later", revision: 2 }]);
});

test("a deletion the capture's state does not carry is kept", async () => {
  const records = [record("added", 1, added), record("removed", 2, removed)];
  const atCapture = await captureProof(captured({ records }));
  expect(atCapture.covered).toEqual([{ id: "added", revision: 1 }]);
  const afterDelete = await captureProof(captured({ records, state: STATE_B, article: ARTICLE_B }));
  expect(afterDelete.covered).toEqual([{ id: "added", revision: 1 }, { id: "removed", revision: 2 }]);
});

test("an authored transform that changed the article produces no proof", async () => {
  const authored = await captureProof(captured({ article: ARTICLE_A.replace("world", "WORLD") }));
  expect(authored).toMatchObject({ ok: false, code: "article-mismatch" });

  const unfetched = await captureProof(captured({ state: null }));
  expect(unfetched).toMatchObject({ ok: false, code: "no-capture-state" });

  const unstamped = await captureProof(captured({ etag: null }));
  expect(unstamped).toMatchObject({ ok: false, code: "missing-etag" });

  const undecodable = await captureProof(captured({ state: { v: 1, g: 0, y: { seed: "not base64!" } } }));
  expect(undecodable.ok).toBe(false);
});

test("a state for another version of the same document is refused", async () => {
  const answer = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ etag: '"file-2"' }) });
  expect(answer.ok).toBe(true);
  expect(await verifyPageState(answer, { accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG })).toMatchObject({ ok: false, code: "etag-mismatch" });

  const stale = await verifyPageState({ ...answer, etag: ETAG }, { accepted: ACCEPTED, article: ARTICLE_B, etag: '"file-2"' });
  expect(stale).toMatchObject({ ok: false, code: "etag-mismatch" });

  const proven = await refetchedProof({ read: answer, capture: "capture-1", records: [record("added", 1, added)], accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG });
  expect(proven).toMatchObject({ ok: false, code: "etag-mismatch" });
});

test("server and other-writer checkpoints cover insertions and deletions, and nothing else", async () => {
  const answer = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ state: STATE_B }) });
  expect(answer).toMatchObject({
    ok: true,
    version: 1,
    documentId: AUTHORITY.documentId,
    generation: GENERATION,
    etag: ETAG,
    stateHash: await digestOf(STATE_B),
    tag: JSON.stringify(STATE_B),
  });

  const proven = await refetchedProof({
    read: answer,
    capture: "capture-2",
    records: [record("added", 1, added), record("removed", 2, removed), record("foreign", 3, foreign)],
    accepted: ACCEPTED,
    article: ARTICLE_B,
    etag: ETAG,
  });
  expect(proven.ok).toBe(true);
  expect(proven.covered).toEqual([{ id: "added", revision: 1 }, { id: "removed", revision: 2 }]);
  expect(proven.proof.receipt).toEqual({ file: ETAG, pageState: await digestOf(STATE_B) });

  // The state an earlier version stored covers the insertion and not the deletion.
  const earlier = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ state: STATE_A }) });
  const partial = await refetchedProof({ read: earlier, capture: "capture-3", records: [record("added", 1, added), record("removed", 2, removed)], accepted: ACCEPTED, article: ARTICLE_A, etag: ETAG });
  expect(partial.covered).toEqual([{ id: "added", revision: 1 }]);
});

test("an epoch reset or a lost permission cannot reuse a proof", async () => {
  const reset = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ generation: "7a".repeat(16) }) });
  expect(await verifyPageState(reset, { accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG })).toMatchObject({ ok: false, code: "foreign-generation" });

  const relogged = { authority: { ...AUTHORITY, principalId: "person-2" }, lineage: ACCEPTED.lineage };
  const answer = await readPageState({ href: HREF, etag: ETAG, fetch: adapter() });
  const proven = await refetchedProof({ read: answer, capture: "capture-4", records: [record("added", 1, added)], accepted: relogged, article: ARTICLE_B, etag: ETAG });
  expect(proven.ok).toBe(true);
  expect(proven.covered).toEqual([]);
});

test("a valid but unrelated page state is refused", async () => {
  const otherDocument = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ documentId: "8c1e0d5a-40f2-4b3c-9f88-0d1f6d3b7a11" }) });
  expect(await verifyPageState(otherDocument, { accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG })).toMatchObject({ ok: false, code: "foreign-document" });

  const wrongHash = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ stateHash: "0".repeat(64) }) });
  expect(await verifyPageState(wrongHash, { accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG })).toMatchObject({ ok: false, code: "state-digest-mismatch" });

  const otherArticle = await readPageState({ href: HREF, etag: ETAG, fetch: adapter() });
  expect(await verifyPageState(otherArticle, { accepted: ACCEPTED, article: ARTICLE_A, etag: ETAG })).toMatchObject({ ok: false, code: "article-mismatch" });

  const garbage = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ tag: "{\"v\":1,\"g\":0,\"y\":{\"seed\":\"@@@\"}}" }) });
  expect(garbage.ok).toBe(true);
  expect(await verifyPageState(garbage, { accepted: ACCEPTED, article: ARTICLE_B, etag: ETAG })).toMatchObject({ ok: false, code: "invalid-state" });

  const unknownVersion = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ version: 2 }) });
  expect(unknownVersion).toMatchObject({ ok: false, code: "unsupported-version" });

  // A state that decodes to a page the article never showed is refused, not adopted.
  const otherPage = await readPageState({ href: HREF, etag: ETAG, fetch: adapter({ state: STATE_B }) });
  expect(await verifyPageState(otherPage, { accepted: ACCEPTED, article: articleOfPageState(stateOf(stranger)), etag: ETAG })).toMatchObject({ ok: false, code: "article-mismatch" });
});

test("a lost reply keeps everything, and a verified refetch clears exactly what it covers", async () => {
  const page = channel();
  page.add("added", 1);
  page.add("later", 2);
  page.add("foreign", 3);
  const records = [record("added", 1, added), record("later", 2, later), record("foreign", 3, foreign)];

  const attempts = [];
  const read = async ({ etag }) => {
    attempts.push(etag);
    if (attempts.length === 1) return { ok: false, code: "unavailable", message: "The page-state request did not complete" };
    return readPageState({ href: HREF, etag, fetch: adapter({ state: STATE_B }) });
  };

  const lost = await checkpointAccepted({ channel: page, records, capture: "capture-5", accepted: ACCEPTED, article: ARTICLE_B, state: null, etag: ETAG, href: HREF, read });
  expect(lost).toMatchObject({ ok: false, code: "unavailable", retired: [] });
  expect([...page.held.keys()]).toEqual(["added", "later", "foreign"]);
  expect(page.calls).toHaveLength(0);

  const cleared = await checkpointAccepted({ channel: page, records, capture: "capture-5", accepted: ACCEPTED, article: ARTICLE_B, state: null, etag: ETAG, href: HREF, read });
  expect(cleared.ok).toBe(true);
  expect(cleared.retired).toEqual([{ id: "added", revision: 1 }, { id: "later", revision: 2 }]);
  expect([...page.held.keys()]).toEqual(["foreign"]);
  expect(attempts).toEqual([ETAG, ETAG]);
});

test("a pinned capture is proved without asking the host, and retires only what it covers", async () => {
  const page = channel();
  page.add("added", 1);
  page.add("later", 2);
  const calls = [];
  const read = async (request) => { calls.push(request); return { ok: false, code: "unavailable" }; };

  const result = await checkpointAccepted({ channel: page, records: [record("added", 1, added), record("later", 2, later)], capture: "capture-7", accepted: ACCEPTED, article: ARTICLE_A, state: STATE_A, etag: ETAG, href: HREF, read });
  expect(result).toMatchObject({ ok: true, retired: [{ id: "added", revision: 1 }] });
  expect([...page.held.keys()]).toEqual(["later"]);
  expect(calls).toHaveLength(0);
});

test("412, 428 and 404 from the conditional read each keep every record", async () => {
  for (const [status, code] of [[412, "etag-mismatch"], [428, "etag-required"], [404, "no-page-state"]]) {
    const page = channel();
    page.add("added", 1);
    const answer = await readPageState({ href: HREF, etag: ETAG, fetch: refusedBy(status) });
    expect(answer).toMatchObject({ ok: false, code });

    const result = await checkpointAccepted({ channel: page, records: [record("added", 1, added)], capture: "capture-6", accepted: ACCEPTED, article: ARTICLE_A, state: null, etag: ETAG, href: HREF, fetch: refusedBy(status) });
    expect(result).toMatchObject({ ok: false, code, retired: [] });
    expect([...page.held.keys()]).toEqual(["added"]);
    expect(page.calls).toHaveLength(0);
  }
});

test("the client never asks without a condition, and asks with the accepted one", async () => {
  const calls = [];
  const fetch = adapter({ state: STATE_B });
  const counting = async (url, init) => { calls.push({ url, init }); return fetch(url, init); };

  expect(await readPageState({ href: HREF, etag: "", fetch: counting })).toMatchObject({ ok: false, code: "missing-etag" });
  expect(await readPageState({ href: HREF, etag: null, fetch: counting })).toMatchObject({ ok: false, code: "missing-etag" });
  expect(calls).toHaveLength(0);

  const answer = await readPageState({ href: HREF, etag: ETAG, fetch: counting });
  expect(answer.ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].init.headers["If-Match"]).toBe(ETAG);
  expect(calls[0].init.method).toBe("GET");
  expect(calls[0].init.cache).toBe("no-store");
  expect(new URL(calls[0].url).pathname).toBe(HREF);

  expect(await readPageState({ href: null, etag: ETAG, fetch: counting })).toMatchObject({ ok: false, code: "no-page-state" });
  expect(await readPageState({ href: HREF, etag: ETAG, fetch: async () => { throw new Error("offline"); } })).toMatchObject({ ok: false, code: "unavailable" });
});

test("the page-state resource comes from discovery, and only from a host that announced it", async () => {
  const { hostPageStateHref, resetHostMeta } = await import("../../../src/core/host-meta.js");
  const discovery = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const announcing = { spec: 1, extensions: ["page-recovery-v1"], document: { pageState: { href: "/_/page-state" } } };

  resetHostMeta();
  global.fetch = discovery(announcing);
  expect(await hostPageStateHref()).toBe("/_/page-state");

  resetHostMeta();
  global.fetch = discovery({ ...announcing, extensions: [] });
  expect(await hostPageStateHref()).toBeNull();

  resetHostMeta();
  global.fetch = discovery({ ...announcing, document: { etag: "a1" } });
  expect(await hostPageStateHref()).toBeNull();

  resetHostMeta();
  global.fetch = discovery({ ...announcing, document: { pageState: { href: "" } } });
  expect(await hostPageStateHref()).toBeNull();
});
