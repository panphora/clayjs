import { jest } from "@jest/globals";

/**
 * The operations that are not the mode switch and still write: stamping who wrote a
 * change (people) and asking an agent to rewrite a file (wire).
 *
 * Both take long enough to outlive the session that started them \u2014 a host identity
 * round trip, a name prompt, a helper's identity answer, the save lane's import \u2014 and
 * both write on the far side of that await. A switch that starts while one is in
 * flight must not be left with a stamp or a POST made on its behalf, and an exit must
 * not report a clean view over a wire request whose save hold is still standing.
 *
 * Reading is not writing and is not gated: a reader still reads who wrote what, and a
 * helper request that writes nothing here still goes out during an exit.
 */

const A = { id: "AAAAAAAAAAAAAAAAAAAAAA", name: "Ada Chen" };
const B = { id: "BBBBBBBBBBBBBBBBBBBBBB", name: "Sam Ortiz" };

const withPeople = (people) => ({ spec: 1, extensions: ["people"], document: { etag: "e", people } });
const helperHost = { spec: 1, extensions: ["wire"], document: {} };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const throwOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a refusal");
};

// --- the wire ------------------------------------------------------------------

let wire;
let wireParticipant;
let save;
let facts;
let resetHostMeta;
let sockets;
let calls;

class FakeEventSource {
  constructor() {
    this.closed = false;
    sockets.push(this);
    Promise.resolve().then(() => this.onopen && this.onopen());
  }
  close() {
    this.closed = true;
  }
}

// One router for both lanes, recording what went out and in what order. `metaReply`
// and `wireReply` let one test hold its own answer open.
function routeFetch({ metaReply, wireReply } = {}) {
  global.fetch = jest.fn((url, init = {}) => {
    const target = String(url);
    if (target.includes("/_/meta")) {
      calls.push({ lane: "meta" });
      if (metaReply) return metaReply();
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(helperHost) });
    }
    if (target.includes("/_/wire/send")) {
      calls.push({ lane: "wire", body: JSON.parse(init.body) });
      if (wireReply) return wireReply();
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ delivered: 1 }) });
    }
    calls.push({ lane: "save" });
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved" }) });
  });
}

const laneCalls = (lane) => calls.filter((call) => call.lane === lane);

beforeAll(async () => {
  window.clayEditMode = true;
  sockets = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ wire, wireParticipant } = await import("../../src/plugins/wire.js"));
  save = await import("../../src/core/save.js");
  // Held here: the people tests below reset the module registry, and the facts this
  // wire instance reads have to stay the ones this instance was built with.
  facts = await import("../../src/core/is-edit-mode.js");
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  sockets = [];
  calls = [];
  document.body.innerHTML = "<main><p>one</p></main>";
  window.clay = { save: save.savePage };
  facts.commitModeFacts({ mode: "edit", isEditMode: true, generation: 0 });
  resetHostMeta();
  routeFetch();
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await tick();
  delete window.clay;
  resetHostMeta();
});

test("a helper identity answer that lands after the page left edit ends the request unposted", async () => {
  // The helper's identity round trip, held open so the page can leave edit while it runs.
  const gates = [];
  routeFetch({
    metaReply: () => new Promise((resolve) => {
      gates.push(() => resolve({ ok: true, status: 200, text: async () => JSON.stringify(helperHost) }));
    }),
  });

  const handle = wire.send({}, { id: "helper-edit", helper: "redpen", document: "edit" });
  await tick();
  expect(gates.length).toBeGreaterThan(0);

  facts.commitModeFacts({ mode: "view", isEditMode: false, generation: 1 });
  const settled = expect(handle.done).resolves.toMatchObject({
    state: "error",
    errorCode: "stale-document",
  });
  for (const open of gates) open();
  await settled;

  // Nothing was flushed and nothing was sent for a session that has ended.
  expect(laneCalls("save")).toHaveLength(0);
  expect(laneCalls("wire")).toHaveLength(0);
});

test("an exit closes admission to edit requests and leaves a helper request alone", async () => {
  const lease = wireParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  try {
    expect(lease.quiesce()).toBeUndefined();

    const refused = wire.send({ area: "intro" }, { id: "after-quiesce" });
    await tick();
    await expect(refused.done).resolves.toMatchObject({ state: "error", errorCode: "stale-document" });
    expect(laneCalls("wire")).toHaveLength(0);

    // A helper's request writes nothing here, so the exit is no reason to keep it back.
    const helper = wire.send({}, { id: "during-exit", helper: "search" });
    await tick();
    await tick();
    expect(laneCalls("wire").map(({ body }) => body.document)).toEqual(["none"]);
    expect(helper.state).toBe("sent");

    lease.resume();
    expect(lease.quiesce()).toBeUndefined();
  } finally {
    lease.dispose();
  }
});

test("an active save hold stays pending until its own request settles", async () => {
  const lease = wireParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  try {
    wire.send({}, { id: "held" });
    await tick();
    expect(laneCalls("wire")).toHaveLength(1);
    expect(save.autosaveIsSuspended()).toBe(true);

    // The barrier cannot flush around a request that holds the lane, so the exit waits
    // for the request itself rather than resuming autosave underneath it.
    expect(throwOf(() => lease.quiesce())).toMatchObject({ code: "pending-input", pending: ["held"] });
    expect(save.autosaveIsSuspended()).toBe(true);

    wire.cancel("held");
    await tick();
    expect(save.autosaveIsSuspended()).toBe(false);
    expect(lease.quiesce()).toBeUndefined();
  } finally {
    lease.dispose();
  }
});

// --- people --------------------------------------------------------------------

const dialog = () => document.querySelector("[data-clay-modal]");
const button = (label) => [...dialog().querySelectorAll("button")].find((b) => b.textContent === label);
const dataFor = (id) => document.querySelector(`[clay-people] data[value="${id}"]`);

async function load({ meta, editMode = true, stored = null } = {}) {
  jest.resetModules();
  document.body.innerHTML = "";
  window.localStorage.clear();
  if (stored) window.localStorage.setItem("clay:people:me", JSON.stringify(stored));
  window.clay = { isEditMode: editMode };
  global.fetch = jest.fn(meta === undefined
    ? async () => ({ ok: false, status: 404 })
    : typeof meta === "function" ? meta
    : async () => ({ ok: true, status: 200, text: async () => JSON.stringify(meta) }));
  const mod = await import("../../src/plugins/people.js");
  await mod.ready;
  return mod;
}

// What the controller commits when the page leaves edit: this person stops being
// anybody, and every await already in flight belongs to the session before it.
async function leaveEdit() {
  const mode = await import("../../src/core/is-edit-mode.js");
  mode.commitModeFacts({ mode: "view", isEditMode: false, generation: 1 });
  window.clay.isEditMode = false;
}

test("a host answer that arrives after the page left edit stamps nothing", async () => {
  const answer = { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
  let answered = null;
  let held = false;
  const mod = await load({
    meta: () => (held
      ? new Promise((resolve) => { answered = () => resolve(answer); })
      : Promise.resolve(answer)),
  });

  const li = document.createElement("li");
  document.body.append(li);

  held = true;
  const pending = mod.author(li);
  await tick();
  expect(answered).not.toBeNull();

  await leaveEdit();
  const refused = expect(pending).rejects.toMatchObject({ code: "stale-document" });
  answered();
  await refused;

  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();
});

test("a name chosen after the page left edit stamps nothing", async () => {
  const mod = await load();
  const li = document.createElement("li");
  document.body.append(li);

  const pending = mod.author(li);
  await tick();
  expect(dialog()).not.toBeNull();

  await leaveEdit();
  const refused = expect(pending).rejects.toMatchObject({ code: "stale-document" });
  dialog().querySelector("input").value = "Grace Hopper";
  button("Continue").click();
  await refused;

  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();
});

test("a reader still reads who wrote what", async () => {
  const mod = await load({ editMode: false, stored: A });
  document.body.innerHTML = `<div clay-people hidden><data value="${A.id}">Ada Chen</data></div>`;
  await tick();

  expect(mod.currentMe()).toBeNull();
  expect(mod.people.get(A.id).name).toBe("Ada Chen");
  expect(mod.people.list().map(({ id }) => id)).toEqual([A.id]);
  expect(mod.people.get(B.id).name).toBe("Unknown person");
  expect(dataFor(A.id).textContent).toBe("Ada Chen");
});

test("the lease refuses an exit over an unanswered name prompt, and dispose takes it down", async () => {
  const mod = await load();
  const lease = mod.peopleParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();

  const li = document.createElement("li");
  document.body.append(li);
  const pending = mod.author(li);
  await tick();
  expect(dialog()).not.toBeNull();

  // A half-answered prompt is input nobody has committed: quiesce leaves it standing.
  expect(throwOf(() => lease.quiesce())).toMatchObject({ code: "pending-input", pending: ["name"] });

  lease.resume();
  expect(dialog()).not.toBeNull();

  lease.dispose();
  expect(await pending).toBeNull();
  expect(dialog()).toBeNull();
  expect(li.hasAttribute("data-by")).toBe(false);
});

test("a stopped session stops watching the registry, and the next read starts it again", async () => {
  const observed = [];
  const disconnected = [];
  const realObserve = MutationObserver.prototype.observe;
  const realDisconnect = MutationObserver.prototype.disconnect;
  MutationObserver.prototype.observe = function (...args) {
    observed.push(args[0]);
    return realObserve.apply(this, args);
  };
  MutationObserver.prototype.disconnect = function () {
    disconnected.push(this);
    return realDisconnect.call(this);
  };

  try {
    const mod = await load({ stored: A });
    expect(observed).toHaveLength(1);

    const lease = mod.peopleParticipant().prepare({ generation: 1, isCurrent: () => true });
    lease.enable();
    expect(observed).toHaveLength(1);

    lease.dispose();
    expect(disconnected).toHaveLength(1);

    // A read is not a session and starts the watcher again, so the names it reads keep
    // following the page once the edit session has ended.
    mod.people.list();
    expect(observed).toHaveLength(2);

    const root = document.createElement("div");
    root.setAttribute("clay-people", "");
    root.hidden = true;
    document.body.append(root);
    const el = document.createElement("data");
    el.setAttribute("value", B.id);
    el.textContent = "Sam Ortiz";
    root.append(el);
    await tick();

    expect(mod.people.list().map(({ id }) => id)).toEqual([B.id]);
  } finally {
    MutationObserver.prototype.observe = realObserve;
    MutationObserver.prototype.disconnect = realDisconnect;
  }
});
