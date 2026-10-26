/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The simple DOM controls a mode session turns on: contenteditable, the disabled and
 * readonly spellings, onclick, and the edit-only resources. They are attribute flips, so
 * they are the one part of an edit session that really can be handed back — but only if
 * the session owns exactly what it installed:
 *
 *   - the save-time restore installs once, however many times a session asks for it, so a
 *     second entry cannot put a second transform in front of the same capture;
 *   - a control that arrives after the boot sweep (add-from's clone, a live frame) is
 *     activated as it lands, and not while the session is quiesced;
 *   - leaving hands back the spelling the file served, and removing the session's own
 *     subscription is what stops the next insertion from being activated at all.
 *
 * The modules are the real ones, driven in the order a boot and a switch drive them.
 */

const FIXTURE = `
  <article id="doc">
    <h1 id="title" editmode:contenteditable inert-contenteditable="plaintext-only">Authored title</h1>
    <input id="due" viewmode:disabled disabled="disabled" value="2026-10-25">
    <span id="menu" editmode:onclick inert-onclick="alert(1)">menu</span>
  </article>
  <ul id="tasks"><li data-id="t-1">one</li></ul>
  <button id="add" type="button" add-from="#task-tpl" add-to="#tasks">Add task</button>
  <template id="task-tpl">
    <li><span class="label" editmode:contenteditable inert-contenteditable="plaintext-only">New</span></li>
  </template>
  <input id="who" persist value="">
`;

let adminAttrs;
let addFrom;
let persist;
let editable;
let inputs;

const servable = () => document.body.innerHTML;

// The hub flushes on its own microtask; give the observer and any debounce their turn.
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/core/preserve-authored.js");
  await import("../../src/core/snapshot.js");
  adminAttrs = await import("../../src/core/admin-attrs.js");
  editable = await import("../../src/core/admin-contenteditable.js");
  inputs = await import("../../src/core/admin-inputs.js");
  addFrom = await import("../../src/attrs/add-from.js");
  persist = await import("../../src/core/persist.js");
});

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("a lease activates the served controls, and dispose hands the served bytes back", async () => {
  const before = servable();
  const lease = adminAttrs.controlsLease();

  lease.enable();
  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("title").hasAttribute("inert-contenteditable")).toBe(false);
  expect(document.getElementById("due").hasAttribute("disabled")).toBe(false);
  expect(document.getElementById("menu").getAttribute("onclick")).toBe("alert(1)");

  lease.dispose();
  expect(servable()).toBe(before);
});

test("a control inserted after enable is activated, and dispose puts its authored form back", async () => {
  const lease = adminAttrs.controlsLease();
  lease.enable();

  const holder = document.createElement("div");
  holder.innerHTML =
    '<div id="late" editmode:contenteditable inert-contenteditable="plaintext-only">late</div>' +
    '<input id="late-input" viewmode:readonly readonly="readonly">';
  document.getElementById("doc").append(holder);
  await flush();

  expect(document.getElementById("late").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("late-input").hasAttribute("readonly")).toBe(false);

  lease.dispose();
  expect(document.getElementById("late").getAttribute("inert-contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("late").hasAttribute("contenteditable")).toBe(false);
  expect(document.getElementById("late-input").getAttribute("readonly")).toBe("readonly");
});

test("a template blueprint is not activated when the template itself is inserted", async () => {
  const lease = adminAttrs.controlsLease();
  lease.enable();

  const holder = document.createElement("div");
  holder.innerHTML = '<template id="tpl"><p class="label" editmode:contenteditable inert-contenteditable="plaintext-only">Card</p></template>';
  document.getElementById("doc").append(holder);
  await flush();

  const blueprint = document.querySelector("#tpl").content.querySelector(".label");
  expect(blueprint.getAttribute("inert-contenteditable")).toBe("plaintext-only");
  expect(blueprint.hasAttribute("contenteditable")).toBe(false);

  lease.dispose();
});

test("quiesce admits no new control, and resume takes the ones that arrived meanwhile", async () => {
  const lease = adminAttrs.controlsLease();
  lease.enable();
  lease.quiesce();

  const holder = document.createElement("div");
  holder.innerHTML = '<div id="held" editmode:contenteditable inert-contenteditable="">held</div>';
  document.getElementById("doc").append(holder);
  await flush();

  expect(document.getElementById("held").hasAttribute("contenteditable")).toBe(false);

  lease.resume();
  holder.insertAdjacentHTML("beforeend", '<div id="after" editmode:contenteditable inert-contenteditable="">after</div>');
  await flush();

  expect(document.getElementById("after").getAttribute("contenteditable")).toBe("");

  lease.dispose();
});

test("dispose removes its own subscription, so a later control stays inert", async () => {
  const lease = adminAttrs.controlsLease();
  lease.enable();
  lease.dispose();

  const holder = document.createElement("div");
  holder.innerHTML = '<div id="later" editmode:contenteditable inert-contenteditable="">later</div>';
  document.getElementById("doc").append(holder);
  await flush();

  expect(document.getElementById("later").hasAttribute("contenteditable")).toBe(false);
});

test("an add-from clone is activated through the same lease as it lands", async () => {
  const lease = adminAttrs.controlsLease();
  lease.enable();

  document.getElementById("add").click();
  await flush();

  const label = document.querySelector("#tasks > li:last-child .label");
  expect(label.getAttribute("contenteditable")).toBe("plaintext-only");

  lease.dispose();
  expect(label.getAttribute("inert-contenteditable")).toBe("plaintext-only");
  expect(label.hasAttribute("contenteditable")).toBe(false);
});

test("the module installs one set of transforms, and install() hands back that same one", () => {
  expect(adminAttrs.install()).toBe(adminAttrs.install());
  expect(adminAttrs.init).toBe(adminAttrs.install);
  expect(persist.install()).toBe(persist.install());
  expect(addFrom.install()).toBe(addFrom.install());
});

test("the loader's cache answers with one module instance, never a cache-busted copy", async () => {
  const { MODULES } = await import("../../src/loader-logic.js");
  const first = await MODULES["core/admin-attrs.js"]();
  const second = await MODULES["core/admin-attrs.js"]();

  expect(first).toBe(second);
  expect(first).toBe(adminAttrs);
});

test("an add-from installation is one click listener, so a click adds one item", () => {
  const button = document.getElementById("add");
  button.click();
  button.click();

  expect(document.querySelectorAll("#tasks > li").length).toBe(3);
});

test("a persist subscription removes the exact listeners and capture option it added", () => {
  const added = jest.spyOn(document, "addEventListener");
  const removed = jest.spyOn(document, "removeEventListener");

  const subscription = persist.default();
  const listeners = added.mock.calls.filter(([type]) => type === "input" || type === "change");
  expect(listeners.length).toBe(2);

  subscription.stop();
  expect(removed.mock.calls).toEqual(listeners);
  expect(removed.mock.calls.every(([, , options]) => options === true)).toBe(true);
});

test("the controls participant prepares the session lease a live entry enables", async () => {
  const participant = adminAttrs.modeParticipant();
  expect(participant.id).toBe("clay:controls");
  expect(participant.order).toBe(110);

  const before = document.getElementById("doc").outerHTML;
  const lease = participant.prepare({ initial: false, destination: "host" });
  lease.enable();

  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("due").hasAttribute("disabled")).toBe(false);

  const holder = document.createElement("div");
  document.body.append(holder);

  lease.quiesce();
  holder.innerHTML = '<div id="held" editmode:contenteditable inert-contenteditable="">held</div>';
  await flush();
  expect(document.getElementById("held").hasAttribute("contenteditable")).toBe(false);

  lease.resume();
  holder.insertAdjacentHTML("beforeend", '<div id="after" editmode:contenteditable inert-contenteditable="">after</div>');
  await flush();
  expect(document.getElementById("after").getAttribute("contenteditable")).toBe("");

  lease.dispose();
  expect(document.getElementById("doc").outerHTML).toBe(before);
  holder.remove();
});

test("initial adoption starts no watcher, and its dispose hands the served controls back", async () => {
  // What an explicit initial edit's own on-page-load helpers did before the adoption.
  editable.enableContentEditable();
  inputs.enableAdminInputs();
  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");

  const adopted = adminAttrs.modeParticipant().prepare({ initial: true, destination: "host" });
  adopted.enable();

  const holder = document.createElement("div");
  document.body.append(holder);
  holder.innerHTML = '<div id="unwatched" editmode:contenteditable inert-contenteditable="">unwatched</div>';
  await flush();
  expect(document.getElementById("unwatched").hasAttribute("contenteditable")).toBe(false);

  adopted.dispose();
  const title = document.getElementById("title");
  expect(title.hasAttribute("contenteditable")).toBe(false);
  expect(title.getAttribute("inert-contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("due").getAttribute("disabled")).toBe("disabled");
  holder.remove();
});

// Last in the file: stopping the installation is what the test proves, so no later test
// may rely on the click listener this one takes away.
test("add-from's installation removes the exact click subscription it added", () => {
  const removed = jest.spyOn(document, "removeEventListener");
  const installation = addFrom.install();

  installation.stop();
  expect(removed.mock.calls).toEqual([["click", expect.any(Function), false]]);

  document.getElementById("add").click();
  expect(document.querySelectorAll("#tasks > li").length).toBe(1);
});
