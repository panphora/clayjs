import { beginApply, completeApply, conflicts } from "../../src/sync/conflicts.js";
import { trackConflictFootprints, replacementFootprint } from "../../src/sync/conflict-footprints.js";

const addLoss = (node) => {
  const apply = beginApply({ source: "peer", domain: "sync", root: document.documentElement.cloneNode(true) });
  const [id] = completeApply(apply, [{
    kind: "text",
    recovery: { key: "one", text: {}, subject: { live: [node], nodeType: 1, local: [] } },
  }], { ticket: 1 });
  return conflicts.get(id);
};

const replace = (old, tag = "h3") => {
  const fresh = document.createElement(tag);
  for (const a of old.attributes) fresh.setAttributeNS(a.namespaceURI, a.name, a.value);
  fresh.append(...[...old.childNodes].map((n) => n.cloneNode(true)));
  old.before(fresh);
  old.remove();
  return fresh;
};

beforeEach(() => {
  document.body.innerHTML = "<p>Two wild dogs.</p><p>Two wild dogs.</p>";
});

afterEach(() => {
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: "accepted" });
});

test("transfers the actual replaced node despite duplicate text", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  const fresh = trackConflictFootprints(() => replace(old));
  expect(replacementFootprint(rec)).toBe(fresh);
  expect(rec.recovery.subject.live).toEqual([old]);
});

test("follows a second proved retag without changing recovery identity", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  const fresh = trackConflictFootprints(() => replace(old));
  const latest = trackConflictFootprints(() => replace(fresh, "h2"));
  expect(replacementFootprint(rec)).toBe(latest);
  expect(rec.recovery.subject.live).toEqual([old]);
});

test("rejects a same-text insertion in a different position", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  trackConflictFootprints(() => {
    const fresh = document.createElement("h3");
    fresh.textContent = old.textContent;
    document.body.prepend(fresh);
    old.remove();
  });
  expect(replacementFootprint(rec)).toBeNull();
});

test("rejects replacement combined with a rearrangement", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  trackConflictFootprints(() => {
    replace(old);
    document.body.append(document.body.firstChild);
  });
  expect(replacementFootprint(rec)).toBeNull();
});

test("rejects replacement combined with another text edit", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  trackConflictFootprints(() => {
    replace(old);
    document.body.firstChild.firstChild.data = "Changed";
  });
  expect(replacementFootprint(rec)).toBeNull();
});

test("rejects a rebuilt block with changed content", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  trackConflictFootprints(() => {
    const fresh = document.createElement("h3");
    fresh.textContent = "Changed";
    old.before(fresh);
    old.remove();
  });
  expect(replacementFootprint(rec)).toBeNull();
});

test("never reconstructs a transition that happened before tracking", () => {
  const old = document.body.lastChild;
  const rec = addLoss(old);
  replace(old);
  trackConflictFootprints(() => {});
  expect(replacementFootprint(rec)).toBeNull();
});

test("runs without pending losses and disconnects after a synchronous error", () => {
  expect(trackConflictFootprints(() => 42)).toBe(42);
  const old = document.body.lastChild;
  const rec = addLoss(old);
  expect(() => trackConflictFootprints(() => { replace(old); throw new Error("stop"); })).toThrow("stop");
  expect(replacementFootprint(rec)).toBeNull();
});

test("returns the promise the merge produced, unchanged, and it resolves the same value", async () => {
  const old = document.body.lastChild;
  addLoss(old);
  const produced = Promise.resolve(42);
  const returned = trackConflictFootprints(() => produced);
  expect(returned).toBe(produced);
  await expect(returned).resolves.toBe(42);
});

test("rejects narrowing when the rebuilt block carries an attribute change", () => {
  document.body.innerHTML = '<p data-note="before">Two wild dogs.</p><p data-note="before">Two wild dogs.</p>';
  const old = document.body.lastChild;
  const rec = addLoss(old);
  trackConflictFootprints(() => {
    const fresh = document.createElement("h3");
    fresh.textContent = old.textContent;
    fresh.setAttribute("data-note", "after");
    old.before(fresh);
    old.remove();
  });
  expect(replacementFootprint(rec)).toBeNull();
});
