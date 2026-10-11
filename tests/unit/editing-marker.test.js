import { jest } from "@jest/globals";
import { personColor } from "../../src/lib/person-face.js";

/**
 * The outline around the block somebody else is editing.
 *
 * The marker reads the frame the host sent, not `presence.roster`, because the two
 * fields it needs are its own to validate: a person it cannot read draws nothing,
 * and a frame entry that is this reader (`you: true`) is never drawn at all.
 *
 * The release-blocking pair below is the same pair the presence stack carries, and
 * for the same reason: `captureForSaveAndComparison()` hands its clone to peers on
 * `clay:snapshot-ready` BEFORE it strips the save-only regions, so a marker marked
 * only `no-save` would broadcast a name and a colour to every peer. `no-snapshot`
 * is the token that runs before the clone is emitted.
 *
 * jsdom, not web-test-runner: what matters here is what the real capture path
 * serializes and what the real DOM records, both of which jsdom performs exactly.
 */

const ADA = { id: "Ibtc-Ocln_ly6CcAoDss6g", name: "Ada Chen", canEdit: true, you: false };
const LINUS = { id: "p_linus", name: "Linus Pauling", canEdit: true, you: false };
const ME = { id: "p_me", name: "Grace Hopper", canEdit: true, you: true };

// What the target block measures, in a browser that has laid the page out.
const RECT = { top: 100, left: 20, width: 300, height: 40, bottom: 140, right: 320 };

const metaAnswer = (extensions) => ({
  ok: true,
  text: async () => JSON.stringify({ spec: 1, extensions, document: null }),
});

async function load({ extensions = ["sync", "presence"] } = {}) {
  jest.resetModules();
  document.body.innerHTML = "";
  global.fetch = jest.fn(async () => metaAnswer(extensions));
  const { editingMarker } = await import("../../src/sync/editing-marker.js");
  const { presence } = await import("../../src/sync/presence.js");
  const snapshot = await import("../../src/core/snapshot.js");
  return { marker: editingMarker, presence, snapshot };
}

const box = () => document.querySelector("[data-clay-editing-marker]");
const boxes = () => [...document.querySelectorAll("[data-clay-editing-marker]")];
const root = () => document.querySelector("[data-clay-editing]");
const chips = () => [...document.querySelectorAll("[data-clay-editing-chip]")];

// One spelling for a colour: the engine normalizes `color` and `background-color`
// to rgb() and leaves `border-color` as authored, so the two are only comparable
// after a round trip through a property that normalizes.
const asColor = (value) => {
  const probe = document.createElement("div");
  probe.style.color = value;
  return probe.style.getPropertyValue("color");
};

// jsdom measures nothing, so every target block is given a size by hand.
function fixture() {
  document.body.innerHTML =
    '<div id="block" contenteditable="true">the block</div>' +
    '<div id="second" contenteditable="true">the second block</div>';
  const blocks = [...document.body.children];
  for (const el of blocks) el.getBoundingClientRect = () => RECT;
  return blocks;
}

const frame = (...people) => ({ people, anonymous: 0 });

const realRaf = window.requestAnimationFrame;

beforeEach(() => {
  document.body.innerHTML = "";
  window.requestAnimationFrame = (cb) => {
    cb();
    return 0;
  };
});

afterEach(() => {
  window.requestAnimationFrame = realRaf;
  delete global.fetch;
});

// =============================================================================
// The host gate, and who is never drawn
// =============================================================================

test("a host that never announced presence draws nothing at all", async () => {
  const { marker } = await load({ extensions: ["sync", "upload"] });
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "1" }));

  expect(root()).toBeNull();
  expect(box()).toBeNull();
});

test("yourself is never drawn, even with a path the host named", async () => {
  const { marker } = await load();
  fixture();

  await marker.update(frame({ ...ME, editing: "1" }));

  expect(root()).toBeNull();
  expect(box()).toBeNull();
});

test("a frame entry it cannot read draws nothing", async () => {
  const { marker } = await load();
  fixture();

  const unreadable = [
    // A selector is not a path.
    { ...ADA, editing: "#main" },
    // Nor is a number.
    { ...ADA, editing: 7 },
    // A path past the last child of body.
    { ...ADA, editing: "9" },
    // A person with no id has no colour to pick and no identity to trust.
    { name: "Ada Chen", canEdit: true, you: false, editing: "0" },
  ];

  for (const person of unreadable) {
    await marker.update(frame(ME, person));
    expect(root()).toBeNull();
    expect(box()).toBeNull();
  }
});

// =============================================================================
// What it draws
// =============================================================================

test("a block the reader does not have yet is outlined as soon as a sync brings it in", async () => {
  const { marker } = await load();
  fixture();
  const third = document.createElement("div");
  third.textContent = "a third block";
  third.getBoundingClientRect = () => RECT;
  document.body.appendChild(third);

  // The block the other person is in is one this reader's document does not have
  // yet: their report arrives a save-and-relay before their structure does.
  await marker.update(frame(ME, { ...ADA, editing: "3" }));
  expect(box()).toBeNull();

  const added = document.createElement("div");
  added.textContent = "the block the peer just made";
  added.getBoundingClientRect = () => RECT;
  document.body.appendChild(added);
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));

  expect(box()).not.toBeNull();
});

test("a block another person edits is outlined in their colour, with their name on it", async () => {
  const { marker } = await load();
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "1" }));

  expect(boxes().length).toBe(1);
  expect(asColor(box().style.getPropertyValue("border-color"))).toBe(asColor(personColor(ADA.id)));
  expect(chips().length).toBe(1);
  expect(chips()[0].textContent).toBe("Ada Chen");
  expect(chips()[0].style.getPropertyValue("background-color")).toBe(asColor(personColor(ADA.id)));
});

test("two people in one block share the box and keep their own chips", async () => {
  const { marker } = await load();
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "0" }, { ...LINUS, editing: "0" }));

  // Two overlapping outlines in two colours read as noise, so the block gets one
  // outline in the first person's colour and each person keeps a chip of their own.
  expect(boxes().length).toBe(1);
  expect(asColor(box().style.getPropertyValue("border-color"))).toBe(asColor(personColor(ADA.id)));
  expect(chips().map((el) => el.textContent)).toEqual(["Ada Chen", "Linus Pauling"]);
  expect(chips().map((el) => el.style.getPropertyValue("background-color"))).toEqual([
    asColor(personColor(ADA.id)),
    asColor(personColor(LINUS.id)),
  ]);
});

test("two blocks in one frame get one box each", async () => {
  const { marker } = await load();
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "0" }, { ...LINUS, editing: "1" }));

  expect(boxes().length).toBe(2);
  expect(chips().map((el) => el.textContent)).toEqual(["Ada Chen", "Linus Pauling"]);
});

test("a later frame that names no block takes the outline down and stops following", async () => {
  const { marker } = await load();
  fixture();
  await marker.update(frame(ME, { ...ADA, editing: "0" }));
  expect(box()).not.toBeNull();

  const removed = jest.spyOn(window, "removeEventListener");
  try {
    await marker.update(frame(ME, ADA));

    expect(box()).toBeNull();
    expect(root().style.display).toBe("none");
    // Nothing left to keep in step with, so the follow listeners go with it.
    expect(removed.mock.calls.some(([type]) => type === "scroll")).toBe(true);
  } finally {
    removed.mockRestore();
  }
});

test("clear() takes the outline and the root away", async () => {
  const { marker } = await load();
  fixture();
  await marker.update(frame(ME, { ...ADA, editing: "0" }));
  expect(root()).not.toBeNull();

  marker.clear();

  expect(root()).toBeNull();
  expect(box()).toBeNull();
});

test("a target with no size yet draws nothing and picks the block up on the next layout", async () => {
  const { marker } = await load();
  document.body.innerHTML = '<div id="block">the block</div>';
  const block = document.getElementById("block");

  await marker.update(frame(ME, { ...ADA, editing: "0" }));
  expect(box()).toBeNull();

  block.getBoundingClientRect = () => RECT;
  window.dispatchEvent(new Event("resize"));

  expect(box()).not.toBeNull();
});

test("the chip row sits above the block, or below it when there is no room above", async () => {
  const { marker } = await load();
  const [block] = fixture();
  const person = { ...ADA, editing: "0" };

  block.getBoundingClientRect = () => ({ ...RECT, top: 5, bottom: 45 });
  await marker.update(frame(ME, person));
  expect(box().firstElementChild.style.getPropertyValue("top")).toBe("100%");
  expect(box().firstElementChild.style.getPropertyValue("bottom")).toBe("");

  block.getBoundingClientRect = () => RECT;
  await marker.update(frame(ME, person));
  expect(box().firstElementChild.style.getPropertyValue("bottom")).toBe("100%");
  expect(box().firstElementChild.style.getPropertyValue("top")).toBe("");
});

test("runtime chrome already in body does not shift the path", async () => {
  const { marker, presence } = await load();
  // The stack is built first, into an otherwise empty body, which is where a
  // page's first roster frame leaves it.
  await presence.update(frame(ADA, ME));
  expect(document.querySelector("[data-clay-presence]")).not.toBeNull();

  const block = document.createElement("div");
  block.textContent = "first block";
  document.body.appendChild(block);
  block.getBoundingClientRect = () => RECT;

  await marker.update(frame(ME, { ...ADA, editing: "0" }));

  // Path "0" is the first content block, not the stack that was in body first.
  expect(box()).not.toBeNull();
});

// =============================================================================
// The marker is not document content
// =============================================================================

test("every element it creates is marked out of the save, the watch and the snapshot", async () => {
  const { marker } = await load();
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "0" }));

  const created = [root(), ...root().querySelectorAll("*")];
  // Root, one box, one chip row, one chip.
  expect(created.length).toBe(4);
  for (const el of created) {
    expect(el.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  }
  // The name is in one text node and in no attribute anywhere.
  expect(chips()[0].textContent).toBe("Ada Chen");
  for (const el of created) {
    for (const { name, value } of Array.from(el.attributes)) {
      expect(name).not.toContain("Ada Chen");
      expect(value).not.toContain("Ada Chen");
    }
  }
});

test("a name that looks like markup is still only text", async () => {
  const { marker } = await load();
  fixture();

  const name = "<img src=x onerror=alert(1)>";
  await marker.update(frame(ME, { ...ADA, name, editing: "0" }));

  expect(chips()[0].textContent).toBe(name);
  expect(chips()[0].querySelector("img")).toBeNull();
});

test("RELEASE-BLOCKING: no name, no marker and no colour reaches a snapshot or a save", async () => {
  const { marker, snapshot } = await load();
  fixture();

  await marker.update(frame(ME, { ...ADA, editing: "0" }));
  expect(box()).not.toBeNull();

  const serialized = snapshot.captureSnapshot().outerHTML;
  const { forSave } = snapshot.captureForSaveAndComparison();

  for (const text of [serialized, forSave]) {
    expect(text).not.toContain("Ada Chen");
    expect(text).not.toContain("data-clay-editing");
    expect(text).not.toContain(personColor(ADA.id));
  }
  // The capture ran over a document that really did hold the marker.
  expect(root()).not.toBeNull();
});

test("the edited element itself is never written to", async () => {
  const { marker } = await load();
  const [block] = fixture();
  const records = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(block, { subtree: true, attributes: true, childList: true });
  const style = block.getAttribute("style");
  const cls = block.getAttribute("class");

  try {
    await marker.update(frame(ME, { ...ADA, editing: "0" }));
    await marker.update(frame(ME, { ...LINUS, editing: "0" }, { ...ADA, editing: "0" }));
    marker.clear();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(records).toEqual([]);
    expect(block.getAttribute("style")).toBe(style);
    expect(block.getAttribute("class")).toBe(cls);
  } finally {
    observer.disconnect();
  }
});
