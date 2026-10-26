/**
 * @jest-environment jsdom
 */

/**
 * One resolver registry, two records.
 *
 * A conflict and a refused undo step both need the page's own name for what they are
 * about, so `clay.conflicts.registerContext` and the refused step's recovery ask the
 * same registry: the newest resolver answers first, a resolver that throws is a name
 * the record does not get, and only the four storable fields survive. A refused step
 * names its targets by the id its entry carries and the live element that id finds, so
 * a resolver written for the conflict ledger — one that reads the record's own node —
 * answers nothing here instead of naming the wrong card.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const PAGE =
  '<section id="board">' +
  '<ul data-id="l-1"><li class="card" data-id="c-1" title="hover">Alpha</li></ul>' +
  '<ul data-id="l-2"><li class="card" data-id="c-2" title="hover">Beta</li></ul>' +
  "</section>";

let ledger;
let undoRecovery;

const card = (id) => document.querySelector(`li[data-id="${id}"]`);

beforeEach(async () => {
  jest.resetModules();
  window.clayEditMode = true;
  localStorage.clear();
  document.body.innerHTML = PAGE;
  ledger = await import("../../src/sync/conflicts.js");
  undoRecovery = await import("../../src/recovery/undo.js");
  window.clay = { conflicts: ledger.conflicts };
});

afterEach(() => {
  delete window.clay;
});

function engineConflict(id, overrides = {}) {
  return {
    kind: "text",
    node: card(id),
    local: card(id).textContent,
    remote: `${card(id).textContent} edited elsewhere`,
    ...overrides,
  };
}

function applyWith(conflicts) {
  const applyId = ledger.beginApply({
    source: "peer", seq: 1, etag: "E1", domain: "sync",
    root: document.documentElement.cloneNode(true),
  });
  return ledger.completeApply(applyId, conflicts, { ticket: 1 });
}

/** One resolver for both records: a conflict names the node it touched, a refused step
 * names the element its target id finds. */
const cardResolver = () => (record) => {
  const el = record?.element ?? record?.node?.closest?.("li[data-id]");
  if (!el) return null;
  return {
    kind: "card",
    id: el.dataset.id,
    label: el.textContent,
    field: "title",
    open: () => el.scrollIntoView(),
  };
};

test("a refused target is named by the live element its id finds", () => {
  ledger.conflicts.registerContext(cardResolver());

  const named = undoRecovery.contextForTarget({ id: "c-2" });

  expect(named).toMatchObject({ kind: "card", id: "c-2", label: "Beta", field: "title" });
  expect(typeof named.open).toBe("function");
});

test("a document with no resolver falls back to the generic target context", () => {
  expect(undoRecovery.contextForTarget({ id: "c-1" })).toEqual({ kind: null, id: "c-1", label: null, field: null });
});

test("a resolver that throws leaves the step generic instead of losing its target", () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  ledger.conflicts.registerContext(() => {
    throw new Error("resolver failed");
  });

  expect(undoRecovery.contextForTarget({ id: "c-1" })).toEqual({ kind: null, id: "c-1", label: null, field: null });
  expect(errors).toHaveBeenCalled();
  errors.mockRestore();
});

test("the newest resolver answers first, and an earlier one still answers when it does not", () => {
  ledger.conflicts.registerContext(cardResolver());
  ledger.conflicts.registerContext((subject) => (subject?.source === "undo" ? null : { kind: "other", id: "wrong" }));

  expect(undoRecovery.contextForTarget({ id: "c-1" }).label).toBe("Alpha");
});

test("a conflicts record still gets its context through the moved registry", () => {
  ledger.conflicts.registerContext(cardResolver());
  const [first, second] = applyWith([engineConflict("c-1"), engineConflict("c-2")]);

  expect(ledger.conflicts.get(first).context).toMatchObject({ kind: "card", id: "c-1", label: "Alpha", field: "title" });
  expect(ledger.conflicts.get(second).context).toMatchObject({ kind: "card", id: "c-2", label: "Beta", field: "title" });
});

test("a conflict resolver does not name a refused step's subject", () => {
  // The ledger's own resolver reads `record.node`, so the undo subject — a source, an
  // id and an element — is not something it can mistake for a conflict record.
  ledger.conflicts.registerContext((record) => {
    const el = record?.node?.closest?.("li[data-id]");
    return el ? { kind: "card", id: el.dataset.id, label: "wrong" } : null;
  });

  expect(undoRecovery.contextForTarget({ id: "c-1" })).toEqual({ kind: null, id: "c-1", label: null, field: null });
});

test("the registered subject carries the source, the id and the live element", () => {
  const subjects = [];
  ledger.conflicts.registerContext((subject) => {
    subjects.push(subject);
    return null;
  });
  undoRecovery.contextForTarget({ id: "c-1" });

  expect(subjects).toHaveLength(1);
  expect(subjects[0].source).toBe("undo");
  expect(subjects[0].id).toBe("c-1");
  expect(subjects[0].element).toBe(card("c-1"));
});

test("registerContext still refuses a non-function and still unregisters", () => {
  expect(() => ledger.conflicts.registerContext("not a function")).toThrow(TypeError);

  const unregister = ledger.conflicts.registerContext(cardResolver());
  expect(undoRecovery.contextForTarget({ id: "c-1" }).label).toBe("Alpha");
  unregister();
  expect(undoRecovery.contextForTarget({ id: "c-1" })).toEqual({ kind: null, id: "c-1", label: null, field: null });
});

test("a target whose element is gone keeps the id and stays generic", () => {
  ledger.conflicts.registerContext(cardResolver());

  expect(undoRecovery.contextForTarget({ id: "gone" })).toEqual({ kind: null, id: "gone", label: null, field: null });
});
