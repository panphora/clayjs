/**
 * @jest-environment jsdom
 */

/**
 * The guarded replay as the page sees it.
 *
 * ClayJS asks the engine for a whole-entry replay, so the plugin's own state has
 * to follow the engine's answer:
 *
 *   - a refused undo or redo is announced as one `clay:undo-refused` event with
 *     the engine's receipt, and neither the page nor the stack moves;
 *   - persist controls take their attributes back only after a successful
 *     replay, never after a refusal;
 *   - ClayJS's derived, tab-local and route state is not page content, so a
 *     change to it cannot make the recorded edit unsafe.
 */

const FIXTURE = `
  <article id="card" data-id="card" sap>
    <span id="count" attr:count="1">1</span>
    <p id="text">authored</p>
  </article>
  <input id="field" type="text" persist value="attr">
`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.getElementById("text");
const count = () => document.getElementById("count");
const card = () => document.getElementById("card");
const field = () => document.getElementById("field");

let plugin;
let undo;
const leases = [];
const refusals = [];

const onRefused = (event) => refusals.push(event.detail);

const enter = async () => {
  const lease = await plugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  leases.push(lease);
  return lease;
};

// Keep the recorded target the same node: a text-node data write is one scalar
// edit, where assigning textContent replaces the node.
const setText = (el, value) => {
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.data = value;
  else el.textContent = value;
};

const edit = async (value) => {
  setText(text(), value);
  await settle();
  undo.flush();
};

const peerWrite = (write) => {
  undo.pause();
  try { write(); } finally { undo.resume() }
};

beforeAll(async () => {
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
});

beforeEach(() => {
  refusals.length = 0;
  // A new page starts in the default mode; a mode a case picked is that page's own.
  undo.setRecording("automatic");
  window.clay = {};
  document.documentElement.removeAttribute("route-tab");
  document.body.innerHTML = FIXTURE;
  document.addEventListener("clay:undo-refused", onRefused);
});

afterEach(() => {
  document.removeEventListener("clay:undo-refused", onRefused);
  while (leases.length) leases.pop().dispose();
  window.clay = undefined;
});

test("a derived, tab-local or route attribute change after an edit does not refuse its undo", async () => {
  await enter();
  await edit("typed");

  count().setAttribute("count", "2");
  card().setAttribute("route-active", "");
  document.documentElement.setAttribute("route-tab", "b");
  await settle();
  undo.flush();

  expect(undo.history).toHaveLength(1);
  const receipt = undo.undo();
  expect(receipt).toEqual({ ok: true, entryId: expect.any(String), label: "Edit", direction: "undo" });
  expect(refusals).toHaveLength(0);
  expect(text().textContent).toBe("authored");
});

test("a peer's change to the edited text refuses the undo, announced once", async () => {
  await enter();
  await edit("typed");
  peerWrite(() => setText(text(), "peer"));
  await settle();
  undo.flush();

  const receipt = undo.undo();

  expect(receipt).toEqual({
    ok: false,
    code: "content-changed",
    entryId: undo.history[0].id,
    label: "Edit",
    direction: "undo",
  });
  expect(refusals).toHaveLength(1);
  expect(refusals[0]).toEqual({
    ok: false,
    code: "content-changed",
    entryId: undo.history[0].id,
    label: "Edit",
    direction: "undo",
  });
  expect(text().textContent).toBe("peer");
  expect(undo.history).toHaveLength(1);
  expect(undo.canUndo).toBe(true);
  expect(undo.canRedo).toBe(false);
});

test("a refused redo is announced once and leaves the page and the stack as they were", async () => {
  await enter();
  await edit("typed");
  const { id } = undo.history[0];
  expect(undo.undo().ok).toBe(true);
  expect(text().textContent).toBe("authored");

  peerWrite(() => setText(text(), "peer redo"));
  await settle();
  undo.flush();

  const receipt = undo.redo();

  expect(receipt).toEqual({
    ok: false,
    code: "content-changed",
    entryId: id,
    label: "Edit",
    direction: "redo",
  });
  expect(refusals).toHaveLength(1);
  expect(refusals[0]).toEqual({
    ok: false,
    code: "content-changed",
    entryId: id,
    label: "Edit",
    direction: "redo",
  });
  expect(text().textContent).toBe("peer redo");
  expect(undo.canRedo).toBe(true);
  expect(undo.canUndo).toBe(false);
});

test("persist controls are not restored after a refusal and are after a success", async () => {
  await enter();
  await edit("typed");
  field().value = "live";

  peerWrite(() => setText(text(), "peer"));
  await settle();
  undo.flush();
  expect(undo.undo().ok).toBe(false);
  expect(refusals).toHaveLength(1);
  expect(field().value).toBe("live");

  peerWrite(() => setText(text(), "typed"));
  await settle();
  undo.flush();
  expect(undo.undo().ok).toBe(true);
  expect(field().value).toBe("attr");
});

describe("removed subtrees", () => {
  test("a deleted card inside an app redoes after its painted attribute is repainted", async () => {
    document.body.insertAdjacentHTML("beforeend", '<main id="app" sap><ul id="lists"><li id="gone" attr:data-count="n" data-count="2">List<b attr:data-count="n" data-count="1">Card</b></li></ul></main>');
    await enter();
    undo.setRecording("commands");
    const list = document.getElementById("gone");

    undo.command("Delete list", () => list.remove());
    expect(undo.undo()).toMatchObject({ ok: true, direction: "undo" });
    // The app repaints the restored list, as sapjs does after a merge or a refresh.
    list.setAttribute("data-count", "3");

    expect(undo.redo()).toMatchObject({ ok: true, direction: "redo" });
    expect(document.getElementById("gone")).toBeNull();
    expect(refusals).toHaveLength(0);
    document.getElementById("app").remove();
  });
});

describe("added subtrees", () => {
  let resolveRegionPolicy;
  beforeAll(async () => {
    ({ resolveRegionPolicy } = await import("../../src/lib/region-policy.js"));
  });

  const addCard = async (inner) => {
    const added = document.createElement("article");
    added.id = "added";
    added.setAttribute("sap", "");
    added.innerHTML = inner;
    document.body.appendChild(added);
    await settle();
    undo.flush();
    return added;
  };

  test("a derived attribute changed on an added card does not refuse undoing the add", async () => {
    await enter();
    await addCard('<span id="n" attr:count="1">1</span>');

    document.getElementById("n").setAttribute("count", "2");
    await settle();
    undo.flush();

    expect(undo.undo()).toMatchObject({ ok: true, direction: "undo" });
    expect(document.getElementById("added")).toBeNull();
    expect(refusals).toHaveLength(0);
  });

  test("saved content with its own history inside an added card refuses undoing the add", async () => {
    window.clay = { region: { resolveRegionPolicy } };
    await enter();
    await addCard('<div id="own" clay="no-undo"><p>kept</p></div>');

    const receipt = undo.undo();

    expect(receipt).toMatchObject({ ok: false, code: "protected", direction: "undo" });
    expect(refusals).toEqual([receipt]);
    expect(document.getElementById("own").textContent).toBe("kept");
    expect(undo.history).toHaveLength(1);
  });

  test("editor chrome inside an added card is not protected", async () => {
    window.clay = { region: { resolveRegionPolicy } };
    await enter();
    await addCard('<div clay="editor-ui">chrome</div><p>body</p>');

    expect(undo.undo()).toMatchObject({ ok: true });
    expect(document.getElementById("added")).toBeNull();
  });
});

describe("clay:undo-change", () => {
  const changes = [];
  const onChange = (event) => changes.push(event.detail);
  const summary = (detail) => ({
    canUndo: detail.canUndo,
    canRedo: detail.canRedo,
    undo: detail.undo?.label ?? null,
    redo: detail.redo?.label ?? null,
    refused: detail.redo?.refused?.code ?? detail.undo?.refused?.code ?? null,
  });

  beforeEach(() => {
    changes.length = 0;
    document.addEventListener("clay:undo-change", onChange);
  });
  afterEach(() => document.removeEventListener("clay:undo-change", onChange));

  test("names the entries the next Undo and Redo would replay, through a refusal and its dismissal", async () => {
    await enter();
    undo.setRecording("commands");
    expect(summary(changes.at(-1))).toEqual({ canUndo: false, canRedo: false, undo: null, redo: null, refused: null });

    undo.command("Rename", () => setText(text(), "renamed"));
    expect(summary(changes.at(-1))).toMatchObject({ canUndo: true, undo: "Rename" });

    undo.undo();
    expect(summary(changes.at(-1))).toEqual({ canUndo: false, canRedo: true, undo: null, redo: "Rename", refused: null });

    peerWrite(() => setText(text(), "peer"));
    const refused = undo.redo();
    expect(refused.ok).toBe(false);
    expect(summary(changes.at(-1))).toMatchObject({ canRedo: true, redo: "Rename", refused: refused.code });

    undo.discard(refused.entryId);
    expect(summary(changes.at(-1))).toEqual({ canUndo: false, canRedo: false, undo: null, redo: null, refused: null });
    expect(text().textContent).toBe("peer");

    leases.pop().dispose();
    expect(summary(changes.at(-1))).toEqual({ canUndo: false, canRedo: false, undo: null, redo: null, refused: null });
  });
});
