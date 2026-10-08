import { jest } from "@jest/globals";

// Scenario: the client's side of local identity. A host that names people answers
// /_/meta with the person connected right now (an account on hyperclay.com, a Profile
// setting on HTML Clay and Hyperclay Local), and signing in or out changes who writes
// next without touching who already wrote. A host that names nobody leaves the name
// this browser chose, and its id, exactly as they are.

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

const LOCAL = { id: "q8Zr2mKx0vTn4yWb7cLd1e", name: "Ada Chen" };
const CLOUD = { id: "Tt6Dk6-X2ifBA989vUJlnw", name: "Ada Chen" };
const BROWSER = { id: "browserAAAA1", name: "Ada" };
const answer = (me) => ({ spec: 1, extensions: ["conditional", "people", "upload"], document: { etag: "e", people: { me } } });
const replying = (current) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(answer(current())) });

const element = () => { const el = document.createElement("li"); document.body.append(el); return el; };
const registry = () => [...document.querySelectorAll("[clay-people] data[value]")];
const dataFor = (id) => document.querySelector(`[clay-people] data[value="${id}"]`);
const ids = (people) => people.map((p) => p.id).sort();
const errorOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };

test("one id while connected: every stamp is the account's person, recorded once", async () => {
  const mod = await load({ meta: replying(() => CLOUD) });

  const stamped = [element(), element(), element()];
  for (const el of stamped) expect((await mod.author(el)).id).toBe(CLOUD.id);

  expect(stamped.map((el) => el.dataset.by)).toEqual([CLOUD.id, CLOUD.id, CLOUD.id]);
  expect(registry().length).toBe(1);
  expect(registry()[0].getAttribute("value")).toBe(CLOUD.id);
  expect(dataFor(CLOUD.id).textContent).toBe(CLOUD.name);
});

test("the handoff keeps ids written before sign-in and never merges them", async () => {
  let me = LOCAL;
  const mod = await load({ meta: replying(() => me) });

  const first = element();
  const second = element();
  const third = element();

  await mod.author(first);
  expect(first.dataset.by).toBe(LOCAL.id);

  me = CLOUD;
  await mod.author(second);

  expect(second.dataset.by).toBe(CLOUD.id);
  expect(first.dataset.by).toBe(LOCAL.id);
  expect(registry().length).toBe(2);
  expect(dataFor(LOCAL.id).textContent).toBe(LOCAL.name);
  expect(dataFor(CLOUD.id).textContent).toBe(CLOUD.name);
  expect(ids(mod.people.list())).toEqual(ids([LOCAL, CLOUD]));

  me = LOCAL;
  await mod.author(third);

  expect(third.dataset.by).toBe(LOCAL.id);
  expect(first.dataset.by).toBe(LOCAL.id);
  expect(registry().length).toBe(2);
});

test("a host that names nobody leaves the browser's stored name alone", async () => {
  let me = CLOUD;
  const mod = await load({ meta: replying(() => me), stored: BROWSER });

  const before = window.localStorage.getItem("clay:people:me");
  expect(mod.currentMe().id).toBe(CLOUD.id);
  expect(window.localStorage.getItem("clay:people:me")).toBe(before);

  me = null;
  const el = element();
  const mine = await mod.author(el);

  expect(mine.id).toBe(BROWSER.id);
  expect(el.dataset.by).toBe(BROWSER.id);
  expect(document.querySelector("[data-clay-modal]")).toBeNull();
  expect(window.localStorage.getItem("clay:people:me")).toBe(before);
});

test("a host with no directory still offers the document's registry", async () => {
  let me = LOCAL;
  const mod = await load({ meta: replying(() => me) });

  await mod.author(element());
  me = CLOUD;
  await mod.author(element());

  expect(await mod.people.available()).toBeNull();
  expect(ids(mod.people.list())).toEqual(ids([LOCAL, CLOUD]));
  expect(mod.people.list().map((p) => p.name)).toEqual([LOCAL.name, CLOUD.name]);
});

test("canRename follows the source: a host's person is the host's to rename", async () => {
  let me = CLOUD;
  const mod = await load({ meta: replying(() => me), stored: BROWSER });

  expect(mod.people.canRename()).toBe(false);
  expect(errorOf(() => mod.people.rename("X"))).toMatchObject({ code: "not-renamable" });

  me = null;
  await mod.people.available();

  expect(mod.people.canRename()).toBe(true);
  const renamed = mod.people.rename("Ada L.");
  expect(renamed.id).toBe(BROWSER.id);
  expect(renamed.name).toBe("Ada L.");
  expect(JSON.parse(window.localStorage.getItem("clay:people:me"))).toEqual({ id: BROWSER.id, name: "Ada L." });
});

// Every test leaves a plugin instance watching document.body, so the file ends with an
// empty one: the environment's teardown removes body's children, and a registry still
// there would wake every observer with no document left to read.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});
