import { jest } from "@jest/globals";

/**
 * The avatar stack, and the one thing about it that would ship a leak.
 *
 * captureForSaveAndComparison() clones the document, hands that clone to peers
 * on `clay:snapshot-ready`, and strips the save-only regions AFTER that. So the
 * two capture assertions here are not one assertion written twice: `no-save`
 * alone passes the first and fails the second, which is how an authorized editor
 * who can see names ends up broadcasting them to a visitor the host answered
 * with a count. `no-snapshot` runs before the clone is emitted, so it is the
 * token that reaches both.
 *
 * jsdom, not web-test-runner: every assertion here is about what the real
 * capture path serializes, which is DOM manipulation jsdom performs exactly, and
 * the two release-blocking ones run through snapshot.js itself rather than
 * through a restatement of it. The browser suite would add nothing and cannot
 * take a DOM node as an assertion's `actual` without hanging.
 */

// The roster event shape the server half sends, per recipient, on admission and
// whenever someone leaves. `id` is an opaque keyed pseudonym: it picks a colour
// and nothing else.
const ADA = { id: "p_9f3c21ab7e", name: "Ada Lovelace", canEdit: true, you: false };
const GRACE = { id: "p_4d81e0075c", name: "Grace Hopper", canEdit: false, you: true };
const ROSTER = { people: [ADA, GRACE], anonymous: 3 };

const NAMES = [ADA.name, GRACE.name];
const IDS = [ADA.id, GRACE.id];

const metaAnswer = (extensions) => ({
  ok: true,
  text: async () => JSON.stringify({ spec: 1, extensions, document: null }),
});

async function load({ extensions = ["sync", "presence"] } = {}) {
  jest.resetModules();
  global.fetch = jest.fn(async () => metaAnswer(extensions));
  const { presence } = await import("../../src/sync/presence.js");
  const snapshot = await import("../../src/core/snapshot.js");
  return { presence, snapshot };
}

const stack = () => document.querySelector("[data-clay-presence]");
const avatars = () => [...document.querySelectorAll("[data-clay-presence-avatar]")];
const tip = () => document.querySelector("[data-clay-presence-tip]");
const chip = () => document.querySelector("[data-clay-presence-count]");
const hover = (el) => el.dispatchEvent(new MouseEvent("mouseenter"));
const unhover = (el) => el.dispatchEvent(new MouseEvent("mouseleave"));

// One spelling for a colour: the engine normalizes `color` and `background-color`
// to rgb() and leaves `border-color` as authored, so the two are only comparable
// after a round trip through a property that normalizes.
const asColor = (value) => {
  const probe = document.createElement("div");
  probe.style.color = value;
  return probe.style.getPropertyValue("color");
};

beforeEach(() => {
  document.body.innerHTML = "";
});

// =============================================================================
// The host gate
// =============================================================================

test("a host that never announced presence draws nothing at all", async () => {
  const { presence } = await load({ extensions: ["sync", "upload"] });

  await presence.update(ROSTER);

  // Not an empty stack. hyperclay-local, HTML Clay and makerclay show nothing
  // today and they keep showing nothing until they adopt the capability.
  expect(stack()).toBeNull();
  expect(document.body.children.length).toBe(0);
});

test("the answer comes from the host, not from a frame arriving", async () => {
  const { presence } = await load({ extensions: ["sync", "upload"] });

  await presence.update(ROSTER);

  const asked = global.fetch.mock.calls.map(([url]) => new URL(url).pathname);
  expect(asked).toContain("/_/meta");
});

// =============================================================================
// What it draws
// =============================================================================

test("one circle per named participant, plus the count of everyone else", async () => {
  const { presence } = await load();

  await presence.update(ROSTER);

  expect(avatars().map((el) => el.textContent)).toEqual(["AL", "GH"]);
  expect(chip().textContent).toBe("+3 viewing");
  expect(stack().style.display).toBe("flex");
});

test("a recipient the host would not name gets the count and no circles", async () => {
  const { presence } = await load();

  await presence.update({ people: [], anonymous: 4 });

  expect(avatars()).toEqual([]);
  expect(chip().textContent).toBe("+4 viewing");
});

test("nobody else here means nothing on screen", async () => {
  const { presence } = await load();

  // Alone, named.
  await presence.update({ people: [ADA], anonymous: 0 });
  expect(stack()).toBeNull();

  // Alone, counted — the same person seen by a recipient who gets no names.
  await presence.update({ people: [], anonymous: 1 });
  expect(stack()).toBeNull();

  // Someone arrives, and then leaves again.
  await presence.update(ROSTER);
  expect(avatars().length).toBe(2);
  await presence.update({ people: [ADA], anonymous: 0 });
  expect(stack().style.display).toBe("none");
  expect(avatars()).toEqual([]);
  expect(chip().textContent).toBe("");
});

test("solid for canEdit, hollow for everyone else", async () => {
  const { presence } = await load();

  // The same participant both ways, so the only difference between the two
  // circles is the one the assertion is about.
  await presence.update({
    people: [{ ...ADA, canEdit: true }, { ...ADA, id: ADA.id, canEdit: false }],
    anonymous: 0,
  });
  const [solid, hollow] = avatars();

  const derived = solid.style.getPropertyValue("background-color");
  const face = solid.style.getPropertyValue("color");
  expect(derived).not.toBe("");
  expect(derived).not.toBe(face);

  // Hollow is the same three colours inverted: the derived colour becomes the
  // ink and the ring, and the fill becomes the face.
  expect(hollow.style.getPropertyValue("color")).toBe(derived);
  expect(hollow.style.getPropertyValue("background-color")).toBe(face);
  expect(asColor(hollow.style.getPropertyValue("border-color"))).toBe(derived);
  expect(asColor(solid.style.getPropertyValue("border-color"))).toBe(face);
});

test("the colour comes from the pseudonym", async () => {
  const { presence } = await load();

  // Both solid, so the fill is the derived colour in both circles and the
  // solid/hollow inversion cannot account for a difference between them.
  const solid = (person) => ({ ...person, canEdit: true });
  await presence.update({ people: [solid(ADA), solid(GRACE)], anonymous: 0 });
  const [first, second] = avatars().map((el) => el.style.getPropertyValue("background-color"));
  expect(first).not.toBe("");
  expect(first).not.toBe(second);

  // The same pseudonyms in a later frame keep the same colours, or a person
  // changes colour every time anybody joins.
  await presence.update({ people: [solid(GRACE), solid(ADA)], anonymous: 0 });
  const again = avatars().map((el) => el.style.getPropertyValue("background-color"));
  expect(again).toEqual([second, first]);
});

test("the name is on hover, and nowhere else", async () => {
  const { presence } = await load();

  await presence.update(ROSTER);
  const [ada, grace] = avatars();

  // At rest the full names are not in the document at all, and no element
  // carries one in an attribute — not even `title`.
  expect(tip().textContent).toBe("");
  for (const name of NAMES) expect(document.documentElement.outerHTML).not.toContain(name);
  expect(ada.getAttribute("title")).toBeNull();
  expect(ada.outerHTML).not.toContain(ADA.id);

  hover(ada);
  expect(tip().textContent).toBe("Ada Lovelace");
  unhover(ada);
  expect(tip().textContent).toBe("");

  // `you` is the only thing the reader's own circle says differently.
  hover(grace);
  expect(tip().textContent).toBe("Grace Hopper (you)");
});

// =============================================================================
// The chrome is not document content
// =============================================================================

test("every element it creates is marked out of the save, the watch and the snapshot", async () => {
  const { presence } = await load();

  await presence.update(ROSTER);
  hover(avatars()[0]);

  const created = [stack(), ...stack().querySelectorAll("*")];
  // Root, count chip, avatar row, tooltip, two circles.
  expect(created.length).toBe(6);
  for (const el of created) {
    expect(el.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  }
});

test("RELEASE-BLOCKING: no name and no roster id reaches forSave", async () => {
  const { presence, snapshot } = await load();

  await presence.update(ROSTER);
  hover(avatars()[0]);
  expect(tip().textContent).toBe("Ada Lovelace");

  const { forSave } = snapshot.captureForSaveAndComparison();

  expect(forSave).not.toContain("data-clay-presence");
  for (const name of NAMES) expect(forSave).not.toContain(name);
  for (const id of IDS) expect(forSave).not.toContain(id);
  // The capture ran over a document that really did hold the stack.
  expect(stack()).not.toBeNull();
});

test("RELEASE-BLOCKING: no name and no roster id reaches the clone peers receive", async () => {
  const { presence, snapshot } = await load();

  await presence.update(ROSTER);
  hover(avatars()[0]);
  expect(tip().textContent).toBe("Ada Lovelace");

  // The clone handed to live-sync, which is emitted BEFORE the save-only strip.
  // A listener may read it and must not write to it, so this only serializes.
  let emitted = null;
  const onReady = (event) => { emitted = event.detail.documentElement.outerHTML; };
  document.addEventListener("clay:snapshot-ready", onReady);
  try {
    snapshot.captureForSaveAndComparison();
  } finally {
    document.removeEventListener("clay:snapshot-ready", onReady);
  }

  expect(emitted).not.toBeNull();
  expect(emitted).not.toContain("data-clay-presence");
  for (const name of NAMES) expect(emitted).not.toContain(name);
  for (const id of IDS) expect(emitted).not.toContain(id);
});

test("a roster change is not an edit", async () => {
  const { presence, snapshot } = await load();
  const Mutation = (await import("../../src/lib/mutation.js")).default;

  document.body.innerHTML = "<p id=page>page content</p>";
  const before = snapshot.captureForComparison();

  // Two feeds, because they are bought by different tokens. `dirty` is the axis
  // the dirty gate itself consumes; `observed` is the one no-watch controls, and
  // it is the only one a stack marked no-save would not already have cleared.
  const dirty = [];
  const observed = [];
  Mutation.onAnyChange({ require: "dirty", omitChangeDetails: true }, () => dirty.push(1));
  Mutation.onAnyChange({ require: "observed", omitChangeDetails: true }, () => observed.push(1));

  await presence.update(ROSTER);
  hover(avatars()[0]);
  await presence.update({ people: [GRACE], anonymous: 6 });
  await new Promise((r) => setTimeout(r, 0));

  // Nothing the stack does changes the bytes autosave and the close warning
  // compare against, and nothing it does reaches the mutation hub at all.
  expect(snapshot.captureForComparison()).toBe(before);
  expect(dirty).toEqual([]);
  expect(observed).toEqual([]);

  // The control: the hub is wired up and would have reported a real edit.
  document.querySelector("#page").textContent = "edited";
  await new Promise((r) => setTimeout(r, 0));
  expect(dirty.length).toBeGreaterThan(0);
  expect(observed.length).toBeGreaterThan(0);
});

test("a peer's frame leaves the stack standing", async () => {
  const { presence } = await load();
  const { HyperMorph } = await import("../../src/vendor/hyper-morph.vendor.js");

  document.body.innerHTML = "<p id=page>mine</p>";
  await presence.update(ROSTER);
  expect(avatars().length).toBe(2);

  // What a peer sends: their document, which has never contained this tab's
  // chrome and never will.
  const peer = new DOMParser().parseFromString(
    "<!DOCTYPE html><html><head></head><body><p id=page>theirs</p></body></html>",
    "text/html"
  );
  await HyperMorph.morph(document.documentElement, peer.documentElement, {
    morphStyle: "outerHTML",
    head: { style: "merge" },
  });

  expect(document.querySelector("#page").textContent).toBe("theirs");
  expect(stack()).not.toBeNull();
  expect(avatars().length).toBe(2);
});

// =============================================================================
// A frame this client cannot understand
// =============================================================================

// =============================================================================
// The wire into the sync plugin
// =============================================================================

describe("the roster arrives as a named event", () => {
  // jsdom ships no EventSource, and live-sync's singleton auto-starts on import.
  class FakeEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 0;
    }
    close() {
      this.closed = true;
    }
  }

  async function connected({ extensions = ["sync", "presence"] } = {}) {
    jest.resetModules();
    global.fetch = jest.fn(async () => metaAnswer(extensions));
    global.EventSource = FakeEventSource;
    window.EventSource = FakeEventSource;

    const liveSyncModule = await import("../../src/sync/live-sync.js");
    liveSyncModule.liveSync.stop();
    const { presence } = await import("../../src/sync/presence.js");

    const sync = new liveSyncModule.LiveSync();
    sync.lane = "saved";
    sync.currentFile = "index.html";
    sync.resumeId = "r1";
    sync.connect();
    return { sync, presence };
  }

  const send = (sync, data) =>
    sync.sse.dispatchEvent(new MessageEvent("presence", { data }));

  // The event handlers run through two awaits (the memoized host answer), so a
  // microtask tick is not enough.
  const settle = () => new Promise((r) => setTimeout(r, 0));

  test("a presence frame reaches the stack", async () => {
    const { sync } = await connected();

    send(sync, JSON.stringify(ROSTER));
    await settle();

    expect(avatars().map((el) => el.textContent)).toEqual(["AL", "GH"]);
    expect(chip().textContent).toBe("+3 viewing");
  });

  test("a frame that will not parse is dropped, not thrown", async () => {
    const { sync } = await connected();

    expect(() => send(sync, "{not json")).not.toThrow();
    await settle();

    expect(stack()).toBeNull();
  });

  test("the stack goes with the stream", async () => {
    const { sync } = await connected();

    send(sync, JSON.stringify(ROSTER));
    await settle();
    expect(stack()).not.toBeNull();

    // Nothing feeds the roster once the stream is gone, so a list of people who
    // may all have left must not stay on screen.
    sync.stop();
    expect(stack()).toBeNull();
  });
});

test("a malformed roster draws nothing rather than drawing a guess", async () => {
  const { presence } = await load();

  await presence.update(ROSTER);
  expect(avatars().length).toBe(2);

  await presence.update({ people: [{ name: "No id" }, null, { id: 7 }], anonymous: "lots" });

  expect(stack().style.display).toBe("none");
  expect(document.documentElement.outerHTML).not.toContain("No id");
});
