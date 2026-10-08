import { jest } from "@jest/globals";

// Scenario: who is editing and who wrote what. A host that knows its callers names
// them through /_/meta; with no host the person is asked once, and a host that
// failed to answer is never mistaken for a host that said "nobody".

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

const A = { id: "AAAAAAAAAAAAAAAAAAAAAA", name: "Ada Chen" };
const B = { id: "BBBBBBBBBBBBBBBBBBBBBB", name: "Sam Ortiz" };
const withPeople = (people) => ({ spec: 1, extensions: ["people"], document: { etag: "e", people } });

const tick = () => new Promise((r) => setTimeout(r, 0));
const dialog = () => document.querySelector("[data-clay-modal]");
const button = (label) => [...dialog().querySelectorAll("button")].find((b) => b.textContent === label);
const dataFor = (id) => document.querySelector(`[clay-people] data[value="${id}"]`);
const errorOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };

test("a host that names me is clay.me, and author records me", async () => {
  const mod = await load({ meta: withPeople({ me: A, members: [A, B] }) });

  expect(mod.currentMe().id).toBe(A.id);
  expect(mod.currentMe().name).toBe("Ada Chen");
  expect(mod.currentMe().initials).toBe("AC");

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(li.dataset.by).toBe(A.id);
  expect(mine.id).toBe(A.id);
  expect(dialog()).toBeNull();
  expect(dataFor(A.id).textContent).toBe("Ada Chen");
});

test("available() is the host's team, and null with no host", async () => {
  const hosted = await load({ meta: withPeople({ me: A, members: [A, B] }) });
  expect((await hosted.people.available()).map((p) => p.id)).toEqual([A.id, B.id]);

  const bare = await load();
  expect(await bare.people.available()).toBeNull();
});

test("with no host the first author asks once and remembers the name", async () => {
  const mod = await load();
  const li = document.createElement("li");
  const li2 = document.createElement("li");
  document.body.append(li, li2);

  const first = mod.author(li);
  await tick();
  const input = dialog().querySelector("input");
  input.value = "  Grace   Hopper ";
  button("Continue").click();

  const mine = await first;
  expect(mine.name).toBe("Grace Hopper");
  expect(mine.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(JSON.parse(window.localStorage.getItem("clay:people:me")).id).toBe(mine.id);

  const second = await mod.author(li2);
  expect(second.id).toBe(mine.id);
  expect(dialog()).toBeNull();
  expect(li2.dataset.by).toBe(mine.id);
  expect(document.querySelectorAll("[clay-people] data[value]").length).toBe(1);
});

test("cancelling the name prompt authors nothing", async () => {
  const mod = await load();
  const li = document.createElement("li");
  document.body.append(li);

  const pending = mod.author(li);
  await tick();
  button("Cancel").click();

  expect(await pending).toBeNull();
  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();
});

test("a host that failed to answer never falls back to a local name", async () => {
  const mod = await load({ meta: async () => ({ ok: false, status: 503 }), stored: A });

  expect(mod.currentMe()).toBeNull();

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toMatchObject({ code: "people-unavailable" });
  expect(dialog()).toBeNull();
});

test("a guest on a people host is whoever this browser says", async () => {
  const mod = await load({ meta: withPeople({ me: null }), stored: B });

  expect(mod.currentMe().id).toBe(B.id);
});

test("view mode has no viewer and cannot author", async () => {
  const mod = await load({ editMode: false, stored: A });

  expect(mod.currentMe()).toBeNull();

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toThrow("not in edit mode");
});

test("get() prefers the host's live name and never writes", async () => {
  const mod = await load({ meta: withPeople({ me: null, members: [A, B] }) });
  document.body.innerHTML = `<div clay-people hidden><data value="${B.id}">Sam Old</data></div>`;

  expect(mod.people.get(B.id).name).toBe("Sam Ortiz");
  expect(document.querySelector("data").textContent).toBe("Sam Old");
  expect(mod.people.get("nobody-at-all").name).toBe("Unknown person");
  expect(mod.people.get("nobody-at-all").initials).toBe("?");
});

test("add() upserts by id and refuses a person it cannot name", async () => {
  const mod = await load();

  mod.people.add(A);
  mod.people.add(A);
  mod.people.add({ ...A, name: "Ada C." });

  const found = document.querySelectorAll(`[clay-people] data[value="${A.id}"]`);
  expect(found.length).toBe(1);
  expect(found[0].textContent).toBe("Ada C.");

  expect(() => mod.people.add({ id: "short", name: "x" })).toThrow(TypeError);
  expect(() => mod.people.add({ id: A.id, name: "" })).toThrow();
});

test("remove() forgets a person the document no longer names", async () => {
  const mod = await load();
  mod.people.add(A);
  expect(mod.people.list().map((p) => p.id)).toEqual([A.id]);

  mod.people.remove(A.id);

  expect(mod.people.list()).toEqual([]);
  expect(dataFor(A.id)).toBeNull();
});

test("a name this browser chose can be renamed here and in this page", async () => {
  const mod = await load({ stored: A });
  mod.people.add(A);
  let fired = 0;
  document.addEventListener("clay:people", () => { fired += 1; });

  expect(mod.people.canRename()).toBe(true);

  const next = mod.people.rename("Ada Lovelace");

  expect(next.id).toBe(A.id);
  expect(next.name).toBe("Ada Lovelace");
  expect(next.initials).toBe("AL");
  expect(mod.currentMe().id).toBe(A.id);
  expect(mod.currentMe().name).toBe("Ada Lovelace");
  expect(dataFor(A.id).textContent).toBe("Ada Lovelace");
  expect(JSON.parse(window.localStorage.getItem("clay:people:me")).name).toBe("Ada Lovelace");
  expect(fired).toBe(1);
});

test("a name the host gave is the host's to change", async () => {
  const mod = await load({ meta: withPeople({ me: A, members: [A] }), stored: B });
  mod.people.add(A);

  expect(mod.people.canRename()).toBe(false);

  const refused = errorOf(() => mod.people.rename("Sam Ortiz"));
  expect(refused.code).toBe("not-renamable");

  expect(mod.currentMe().id).toBe(A.id);
  expect(mod.currentMe().name).toBe("Ada Chen");
  expect(dataFor(A.id).textContent).toBe("Ada Chen");
  expect(JSON.parse(window.localStorage.getItem("clay:people:me")).name).toBe("Sam Ortiz");
});

test("rename refuses an email address or no name at all", async () => {
  const mod = await load({ stored: A });
  mod.people.add(A);

  for (const bad of ["a@b.co", ""]) {
    const refused = errorOf(() => mod.people.rename(bad));
    expect(refused).toBeInstanceOf(TypeError);
    expect(refused.message).toContain("clay.people.rename: needs a name");
  }

  expect(mod.currentMe().name).toBe("Ada Chen");
  expect(dataFor(A.id).textContent).toBe("Ada Chen");
  expect(JSON.parse(window.localStorage.getItem("clay:people:me")).name).toBe("Ada Chen");
});

test("a page that does not name me yet keeps the new name off the page", async () => {
  const mod = await load({ stored: A });

  expect(document.querySelector("[clay-people]")).toBeNull();
  expect(mod.people.canRename()).toBe(true);

  const next = mod.people.rename("Ada Lovelace");

  expect(next.name).toBe("Ada Lovelace");
  expect(mod.currentMe().name).toBe("Ada Lovelace");
  expect(document.querySelector("[clay-people]")).toBeNull();
  expect(document.querySelectorAll("[clay-people] data[value]").length).toBe(0);
});

test("an email address is never a name", async () => {
  const mod = await load();
  const li = document.createElement("li");
  document.body.append(li);

  const pending = mod.author(li);
  await tick();
  const input = dialog().querySelector("input");
  input.value = "ada@example.test";
  button("Continue").click();

  expect(dialog()).not.toBeNull();
  expect(dialog().querySelector("p").textContent).toBe("Use a name, not an email address. Everyone who can read this page will see it.");
  expect(window.localStorage.getItem("clay:people:me")).toBeNull();
  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();

  input.value = "Ada Chen";
  input.dispatchEvent(new Event("input"));
  expect(dialog().querySelector("p").textContent).toBe("Saved in this browser. Everyone who can read this page will see it.");

  button("Continue").click();

  expect((await pending).name).toBe("Ada Chen");
  expect(() => mod.people.add({ id: "abcdefgh", name: "a@b.co" })).toThrow(TypeError);
});

test("a name is text, never markup", async () => {
  const mod = await load();
  const markup = "<img src=x onerror=alert(1)>";

  mod.people.add({ id: A.id, name: markup });

  const el = dataFor(A.id);
  expect(el.querySelector("img")).toBeNull();
  expect(el.textContent).toBe(markup);
});

test("clay:people fires when the document's registry changes", async () => {
  const mod = await load({ meta: withPeople({ me: A, members: [A, B] }) });
  const registry = document.createElement("div");
  registry.setAttribute("clay-people", "");
  document.body.append(registry);
  await tick();

  let fired = 0;
  document.addEventListener("clay:people", () => { fired += 1; });

  const el = document.createElement("data");
  el.setAttribute("value", B.id);
  el.textContent = "Sam Ortiz";
  registry.append(el);
  await tick();

  expect(fired).toBeGreaterThan(0);
  expect(mod.people.list().map((p) => p.id)).toContain(B.id);
});

test("a late host answer still lands, after ready", async () => {
  let release;
  const answer = new Promise((resolve) => { release = resolve; });
  const mod = await load({
    meta: async () => {
      const people = await answer;
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) };
    },
  });

  let fired = 0;
  document.addEventListener("clay:people", () => { fired += 1; });

  // ready resolved without the answer, so nobody is named yet.
  expect(mod.currentMe()).toBeNull();

  release({ me: A, members: [A, B] });
  await answer;
  await tick();

  expect(fired).toBeGreaterThan(0);
  expect(mod.currentMe().id).toBe(A.id);
});

test("view mode has no me, even when the host names the viewer", async () => {
  const mod = await load({ meta: withPeople({ me: { id: "aaaaaaaaaaaa", name: "Ada" } }) });

  // The host answered while the page was editable, so it did name the viewer.
  expect(mod.currentMe().id).toBe("aaaaaaaaaaaa");

  window.clay = { isEditMode: false };

  expect(mod.currentMe()).toBeNull();
});

test("a read-only page never asks the host", async () => {
  const mod = await load({ editMode: false });

  await mod.ready;

  const asked = global.fetch.mock.calls.filter(([url]) => String(url).includes("/_/meta"));
  expect(asked.length).toBe(0);
});

test("list() shows the host's live name for a saved id", async () => {
  const mod = await load({ meta: withPeople({ me: { id: "aaaaaaaaaaaa", name: "Ada Current" } }) });
  document.body.innerHTML = `<div clay-people hidden><data value="aaaaaaaaaaaa">Ada Previous</data></div>`;
  await tick();

  expect(mod.people.list()[0].name).toBe("Ada Current");
  expect(dataFor("aaaaaaaaaaaa").textContent).toBe("Ada Previous");
});

test("every registry in the document is read", async () => {
  const mod = await load();
  document.body.innerHTML =
    `<div clay-people hidden><data value="${A.id}">Ada Chen</data></div>` +
    `<div clay-people hidden><data value="${B.id}">Sam Ortiz</data></div>`;
  await tick();

  expect(mod.people.list().map((p) => p.id)).toEqual([A.id, B.id]);
  expect(mod.people.get(B.id).name).toBe("Sam Ortiz");
});

test("removing the clay-people attribute empties the list", async () => {
  const mod = await load();
  document.body.innerHTML = `<div clay-people hidden><data value="${A.id}">Ada Chen</data></div>`;
  await tick();
  const registryEl = document.querySelector("[clay-people]");

  expect(mod.people.list().length).toBe(1);

  registryEl.removeAttribute("clay-people");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mod.people.list()).toEqual([]);
});

test("the registry observer emits only on a real change", async () => {
  const mod = await load();
  document.body.innerHTML = `<div clay-people hidden><data value="${A.id}">Ada Chen</data></div>`;
  await tick();
  const registry = document.querySelector("[clay-people]");

  let markup = "";
  let fired = 0;
  document.addEventListener("clay:people", () => {
    fired += 1;
    // Re-rendering the registry with the markup it already has mutates it without changing it.
    if (!markup) markup = registry.innerHTML;
    if (fired < 12) registry.innerHTML = markup;
  });

  mod.people.add(B);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(fired).toBeGreaterThan(0);

  // The listeners of the plugin instances earlier tests in this file left behind have
  // settled by now, so this second, content-preserving mutation is measured on its own.
  fired = 0;
  registry.innerHTML = markup;
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(fired).toBe(0);
});

test("a blip after a good answer keeps the known person", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      if (calls === 2) return { ok: false, status: 502 };
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
    },
  });
  expect(mod.currentMe().id).toBe(A.id);

  await mod.people.available();
  expect(calls).toBe(2);

  expect(mod.currentMe().id).toBe(A.id);

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(mine.id).toBe(A.id);
  expect(li.dataset.by).toBe(A.id);
  expect(dialog()).toBeNull();
});

test("an author() in the same task opens no second prompt", async () => {
  const mod = await load();
  const liA = document.createElement("li");
  const liB = document.createElement("li");
  const liC = document.createElement("li");
  document.body.append(liA, liB, liC);

  const first = mod.author(liA);
  await tick();
  dialog().querySelector("input").value = "Grace Hopper";
  const chained = first.then(() => mod.author(liB));

  button("Continue").click();
  // Same task as the answer: the name is already recorded, so this opens nothing.
  const sameTask = mod.author(liC);

  expect(document.querySelectorAll("[data-clay-modal]").length).toBe(0);

  const [a, b, c] = await Promise.all([first, chained, sameTask]);

  expect(a.id).toBe(b.id);
  expect(b.id).toBe(c.id);
  expect(liA.dataset.by).toBe(liB.dataset.by);
  expect(liB.dataset.by).toBe(liC.dataset.by);
  expect(document.querySelectorAll("[data-clay-modal]").length).toBe(0);
});

test("a prompt whose element was removed from the page is asked again", async () => {
  const mod = await load();
  const liA = document.createElement("li");
  const liB = document.createElement("li");
  document.body.append(liA, liB);

  const first = mod.author(liA);
  await tick();
  const dead = dialog();
  expect(dead).not.toBeNull();
  dead.remove();

  const second = mod.author(liB);
  await tick();

  expect(dialog()).not.toBeNull();
  expect(dialog()).not.toBe(dead);
  expect(await first).toBeNull();

  dialog().querySelector("input").value = "Grace Hopper";
  button("Continue").click();

  const mine = await second;
  expect(mine.name).toBe("Grace Hopper");
  expect(liB.dataset.by).toBe(mine.id);
  expect(liA.hasAttribute("data-by")).toBe(false);
});

// A host that names people can change who you are while the page stays open, so a stamp
// asks it again first and stamps nothing when it cannot answer.
test("a stamp asks the host again, so a new host person is stamped", async () => {
  let people = { me: A, members: [A] };
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) };
    },
  });
  const asked = calls;
  expect(mod.currentMe().id).toBe(A.id);

  people = { me: B, members: [A, B] };

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(calls).toBeGreaterThan(asked);
  expect(mine.id).toBe(B.id);
  expect(li.dataset.by).toBe(B.id);
  expect(dataFor(B.id).textContent).toBe("Sam Ortiz");
  expect(dataFor(A.id)).toBeNull();
});

test("a host that stops naming me is asked again, and asks me instead", async () => {
  let people = { me: A, members: [A] };
  const mod = await load({
    meta: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) }),
  });
  expect(mod.currentMe().id).toBe(A.id);

  people = { me: null };

  const li = document.createElement("li");
  document.body.append(li);
  const pending = mod.author(li);
  await tick();
  expect(dialog()).not.toBeNull();
  dialog().querySelector("input").value = "Grace Hopper";
  button("Continue").click();

  const mine = await pending;
  expect(mine.name).toBe("Grace Hopper");
  expect(mine.id).not.toBe(A.id);
  expect(li.dataset.by).toBe(mine.id);
  expect(dataFor(A.id)).toBeNull();
});

test("a host that stops naming me falls back to a name this browser chose", async () => {
  let people = { me: A, members: [A] };
  const mod = await load({
    meta: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) }),
    stored: B,
  });
  expect(mod.currentMe().id).toBe(A.id);

  people = { me: null };

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(dialog()).toBeNull();
  expect(mine.id).toBe(B.id);
  expect(li.dataset.by).toBe(B.id);
  expect(dataFor(B.id).textContent).toBe("Sam Ortiz");
});

test("a rename in the app keeps the id and the stamp carries the new name", async () => {
  let people = { me: A, members: [A] };
  const mod = await load({
    meta: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) }),
  });
  expect(mod.currentMe().name).toBe("Ada Chen");

  people = { me: { id: A.id, name: "Ada L." }, members: [A] };

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(mine.id).toBe(A.id);
  expect(mine.name).toBe("Ada L.");
  expect(li.dataset.by).toBe(A.id);
  expect(dataFor(A.id).textContent).toBe("Ada L.");
});

test("a fresh answer that fails after a good one stamps nothing", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      if (calls > 1) return { ok: false, status: 503 };
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
    },
  });
  expect(mod.currentMe().id).toBe(A.id);
  document.body.innerHTML = `<div clay-people hidden><data value="${B.id}">Sam Ortiz</data></div>`;

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toMatchObject({ code: "people-unavailable" });

  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelectorAll("[clay-people] data[value]").length).toBe(1);
  expect(dataFor(B.id).textContent).toBe("Sam Ortiz");
  // The last good answer still names the viewer on screen.
  expect(mod.currentMe().id).toBe(A.id);
});

test("a fresh answer that never arrives stamps nothing", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      if (calls > 1) throw new Error("offline");
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
    },
  });
  expect(mod.currentMe().id).toBe(A.id);

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toMatchObject({ code: "people-unavailable" });

  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();
});

test("two stamps at once share one fresh answer", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
    },
  });
  const asked = calls;
  const liA = document.createElement("li");
  const liB = document.createElement("li");
  document.body.append(liA, liB);

  const [a, b] = await Promise.all([mod.author(liA), mod.author(liB)]);

  expect(calls - asked).toBe(1);
  expect(a.id).toBe(A.id);
  expect(b.id).toBe(A.id);
  expect(liA.dataset.by).toBe(A.id);
  expect(liB.dataset.by).toBe(A.id);
});

test("a stamp on a host without people asks nothing more", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["files"], document: null }) };
    },
    stored: B,
  });
  const asked = calls;

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(calls).toBe(asked);
  expect(mine.id).toBe(B.id);
  expect(li.dataset.by).toBe(B.id);
});

test("cancelling the prompt after the host stops naming me stamps nothing", async () => {
  let people = { me: A, members: [A] };
  const mod = await load({
    meta: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) }),
  });
  expect(mod.currentMe().id).toBe(A.id);

  people = { me: null };

  const li = document.createElement("li");
  document.body.append(li);
  const pending = mod.author(li);
  await tick();
  button("Cancel").click();

  expect(await pending).toBeNull();
  expect(li.hasAttribute("data-by")).toBe(false);
  expect(document.querySelector("[clay-people]")).toBeNull();
});

test("returning focus, discovery and name lookup write nothing", async () => {
  const mod = await load({ meta: withPeople({ me: A, members: [A, B] }) });
  document.body.innerHTML = `<div clay-people hidden><data value="${A.id}">Ada Chen</data></div>`;
  await tick();
  const before = document.body.innerHTML;

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  await tick();
  delete document.visibilityState;

  expect(document.body.innerHTML).toBe(before);

  expect(mod.people.get(A.id).name).toBe("Ada Chen");
  expect(mod.people.get("nobody-at-all").name).toBe("Unknown person");
  expect(document.body.innerHTML).toBe(before);
});

// Local with profile sharing on can know that a person is here and still be unable to
// name them (a rejected key, a server too old to send the person). It says so in the
// answer rather than failing discovery, so the page keeps its capabilities, and ClayJS
// must not quietly become whoever this browser last was.
test("a host that cannot name a person right now is never the browser's name", async () => {
  const mod = await load({ meta: withPeople({ me: null, unavailable: true }), stored: A });
  document.body.innerHTML = `<div clay-people hidden><data value="${B.id}">Sam Ortiz</data></div>`;
  await tick();

  expect(mod.currentMe()).toBeNull();

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toMatchObject({
    code: "people-unavailable",
    message: expect.stringContaining("can't name you right now"),
  });

  expect(li.hasAttribute("data-by")).toBe(false);
  expect(dialog()).toBeNull();
  expect(document.querySelectorAll("[clay-people] data[value]").length).toBe(1);
  expect(dataFor(B.id).textContent).toBe("Sam Ortiz");
  expect(dataFor(A.id)).toBeNull();
  expect(mod.people.canRename()).toBe(false);
});

test("the marker lifts when the host names a person again", async () => {
  let people = { me: null, unavailable: true };
  const mod = await load({
    meta: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(withPeople(people)) }),
    stored: B,
  });
  expect(mod.currentMe()).toBeNull();

  people = { me: A, members: [A] };

  const li = document.createElement("li");
  document.body.append(li);
  const mine = await mod.author(li);

  expect(mine.id).toBe(A.id);
  expect(li.dataset.by).toBe(A.id);
  expect(mod.currentMe().id).toBe(A.id);
});

test("an answer that cannot name a person still carries the host's capabilities", async () => {
  const mod = await load({
    meta: { spec: 1, extensions: ["people", "upload"], document: { etag: "e", people: { me: null, unavailable: true } } },
  });
  const { hostSupports } = await import("../../src/core/host-meta.js");

  expect(mod.currentMe()).toBeNull();
  expect(await hostSupports("upload")).toBe(true);
});

test("a fresh answer that is not a capability document names the lost connection", async () => {
  let calls = 0;
  const mod = await load({
    meta: async () => {
      calls += 1;
      if (calls > 1) return { ok: false, status: 401 };
      return { ok: true, status: 200, text: async () => JSON.stringify(withPeople({ me: A, members: [A] })) };
    },
  });
  expect(mod.currentMe().id).toBe(A.id);

  const li = document.createElement("li");
  document.body.append(li);
  await expect(mod.author(li)).rejects.toMatchObject({
    code: "people-unavailable",
    message: expect.stringContaining("lost its connection to the host"),
  });

  expect(li.hasAttribute("data-by")).toBe(false);
});

// Every test leaves a plugin instance watching document.body, so the file ends with an
// empty one: the environment's teardown removes body's children, and a registry still
// there would wake every observer with no document left to read.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});
