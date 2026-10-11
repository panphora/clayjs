import { jest } from "@jest/globals";

let route, parseHash, formatHash, start, stop, apply;

beforeAll(async () => {
  history.replaceState(null, "", "/app.html");
  ({ default: route, parseHash, formatHash, start, stop, apply } = await import("../../src/route/route.js"));
});

const PAGE = `
  <section id="entries" route="entry">
    <article data-id="e-1">one</article>
    <article data-id="e-2">two</article>
  </section>
  <nav id="index" route="entry by data-key">
    <a data-key="e-1">one</a>
    <a data-key="e-2">two</a>
  </nav>`;

function reset(url = "/app.html") {
  stop();
  for (const a of [...document.documentElement.attributes]) {
    if (a.name.startsWith("route-")) document.documentElement.removeAttribute(a.name);
  }
  document.body.innerHTML = PAGE;
  history.replaceState(null, "", url);
  start();
}

const active = () => [...document.querySelectorAll("[route-active]")].map((el) => `${el.tagName.toLowerCase()}:${el.getAttribute("data-id") || el.getAttribute("data-key")}=${el.getAttribute("route-active")}`);
const nextTick = () => new Promise((r) => setTimeout(r, 0));

afterAll(() => stop());

test("parseHash reads pairs, ignores anchors and bad names", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  expect(parseHash("#entry=e-1&view=week")).toEqual({ entry: "e-1", view: "week" });
  expect(parseHash("#section-2")).toEqual({});
  expect(parseHash("#Bad=1&active=x&ok=")).toEqual({});
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  expect(formatHash({ entry: "a b", view: "" })).toBe("#entry=a+b");
});

test("boot mirrors the hash onto <html> and stamps the matching child of each container", () => {
  reset("/app.html#entry=e-2&view=week");
  expect(document.documentElement.getAttribute("route-entry")).toBe("e-2");
  expect(document.documentElement.getAttribute("route-view")).toBe("week");
  expect(active()).toEqual(["article:e-2=entry", "a:e-2=entry"]);
  expect(route.get()).toEqual({ entry: "e-2", view: "week" });
  expect(window.clay.route).toBe(route);
});

test("set pushes a history entry, moves the stamp and fires one clay:route", async () => {
  reset("/app.html#entry=e-1");
  const events = [];
  const on = (e) => events.push(e.detail);
  document.addEventListener("clay:route", on);
  const before = history.length;
  route.set({ entry: "e-2" });
  await nextTick();
  expect(location.hash).toBe("#entry=e-2");
  expect(history.length).toBe(before + 1);
  expect(active()).toEqual(["article:e-2=entry", "a:e-2=entry"]);
  expect(events).toHaveLength(1);
  expect(events[0].changed).toEqual(["entry"]);
  expect(events[0].previous).toEqual({ entry: "e-1" });
  document.removeEventListener("clay:route", on);
});

test("set with null removes the param, the root attribute and the stamp", async () => {
  reset("/app.html#entry=e-1&view=week");
  route.set({ entry: null });
  await nextTick();
  expect(location.hash).toBe("#view=week");
  expect(document.documentElement.hasAttribute("route-entry")).toBe(false);
  expect(active()).toEqual([]);
  route.set({ view: null });
  await nextTick();
  expect(location.hash).toBe("");
  expect(document.documentElement.hasAttribute("route-view")).toBe(false);
});

test("replace does not add a history entry and still applies", () => {
  reset("/app.html#entry=e-1");
  const before = history.length;
  route.set({ entry: "e-2" }, { replace: true });
  expect(history.length).toBe(before);
  expect(active()).toEqual(["article:e-2=entry", "a:e-2=entry"]);
});

test("Back restores the previous stamp", async () => {
  reset("/app.html#entry=e-1");
  route.set({ entry: "e-2" });
  await nextTick();
  history.back();
  await new Promise((r) => setTimeout(r, 20));
  expect(location.hash).toBe("#entry=e-1");
  expect(active()).toEqual(["article:e-1=entry", "a:e-1=entry"]);
});

test("apply with nothing changed writes nothing and fires nothing", async () => {
  reset("/app.html#entry=e-1");
  let mutations = 0;
  const mo = new MutationObserver((r) => { mutations += r.length; });
  mo.observe(document.documentElement, { attributes: true, subtree: true });
  let fired = 0;
  const on = () => fired++;
  document.addEventListener("clay:route", on);
  apply();
  await nextTick();
  expect(mutations).toBe(0);
  expect(fired).toBe(0);
  mo.disconnect();
  document.removeEventListener("clay:route", on);
});

test("a record added later is stamped without a call", async () => {
  reset("/app.html#entry=e-3");
  const article = document.createElement("article");
  article.setAttribute("data-id", "e-3");
  document.getElementById("entries").appendChild(article);
  await nextTick();
  expect(article.getAttribute("route-active")).toBe("entry");
});

test("removing the matched record reports it unmatched and leaves the hash", async () => {
  reset("/app.html#entry=e-1");
  const events = [];
  const on = (e) => events.push(e.detail);
  document.addEventListener("clay:route", on);
  document.querySelector('#entries [data-id="e-1"]').remove();
  document.querySelector('#index [data-key="e-1"]').remove();
  await nextTick();
  expect(location.hash).toBe("#entry=e-1");
  expect(events.at(-1).unmatched).toEqual(["entry"]);
  document.removeEventListener("clay:route", on);
});

test("a plain anchor hash clears the route", async () => {
  reset("/app.html#entry=e-1");
  location.hash = "#top";
  await new Promise((r) => setTimeout(r, 20));
  expect(route.get()).toEqual({});
  expect(active()).toEqual([]);
});
