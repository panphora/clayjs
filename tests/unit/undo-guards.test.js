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
