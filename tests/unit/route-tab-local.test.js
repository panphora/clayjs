import { jest } from "@jest/globals";
import { isTabLocalAttr, stripRouteAttrs, isTabLocalRootAttr } from "../../src/lib/root-attrs.js";
import { HyperMorph } from "../../src/vendor/hyper-morph.vendor.js";

describe("isTabLocalAttr", () => {
  test("route-* on the root and route-active anywhere are tab-local", () => {
    expect(isTabLocalAttr("route-entry", document.documentElement)).toBe(true);
    expect(isTabLocalAttr("route-view", document.documentElement)).toBe(true);
    expect(isTabLocalAttr("route-active", document.createElement("li"))).toBe(true);
  });

  test("route-* away from the root is the author's", () => {
    expect(isTabLocalAttr("route-entry", document.createElement("div"))).toBe(false);
    expect(isTabLocalAttr("route", document.createElement("section"))).toBe(false);
  });

  test("the existing root names still count, and the author's root attributes do not", () => {
    expect(isTabLocalAttr("savestatus", document.documentElement)).toBe(true);
    expect(isTabLocalAttr("savetoken", document.documentElement)).toBe(true);
    expect(isTabLocalAttr("lang", document.documentElement)).toBe(false);
    expect(isTabLocalRootAttr("route-entry", document.documentElement)).toBe(false);
  });

  test("a clone's root counts as a root", () => {
    const clone = document.documentElement.cloneNode(true);
    expect(isTabLocalAttr("route-entry", clone)).toBe(true);
  });
});

test("stripRouteAttrs removes router state and nothing else", () => {
  const clone = document.documentElement.cloneNode(true);
  clone.setAttribute("route-entry", "e-1");
  clone.setAttribute("lang", "en");
  clone.querySelector("body").innerHTML =
    '<section route="entry"><article data-id="e-1" route-active="entry">a</article><div route-entry="author">b</div></section>';
  stripRouteAttrs(clone);
  expect(clone.hasAttribute("route-entry")).toBe(false);
  expect(clone.getAttribute("lang")).toBe("en");
  expect(clone.querySelector("[route-active]")).toBeNull();
  expect(clone.querySelector("section").getAttribute("route")).toBe("entry");
  expect(clone.querySelector("div").getAttribute("route-entry")).toBe("author");
});

describe("the mutation hub ignores router state", () => {
  let Mutation;
  beforeAll(async () => {
    Mutation = (await import("../../src/lib/mutation.js")).default;
  });

  test("route-* on the root and route-active on a record reach no subscriber", async () => {
    document.body.innerHTML = '<section route="entry"><article data-id="e-1">a</article></section>';
    await new Promise((r) => setTimeout(r, 10));
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });
    document.documentElement.setAttribute("route-entry", "e-1");
    document.querySelector("article").setAttribute("route-active", "entry");
    document.querySelector("article").removeAttribute("route-active");
    document.documentElement.removeAttribute("route-entry");
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toHaveLength(0);
    sub();
  });

  test("an author's route-* attribute on a child still does", async () => {
    document.body.innerHTML = '<div id="x"></div>';
    await new Promise((r) => setTimeout(r, 10));
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });
    document.getElementById("x").setAttribute("route-entry", "author");
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.length).toBeGreaterThan(0);
    sub();
  });
});

test("captureSnapshot and the sync payload carry no router state", async () => {
  const { captureSnapshot, serializeForSync } = await import("../../src/core/snapshot.js");
  document.documentElement.setAttribute("route-entry", "e-1");
  document.body.innerHTML = '<section route="entry"><article data-id="e-1" route-active="entry">a</article></section>';
  const clone = captureSnapshot({ flushUndo: false, authored: false });
  const html = serializeForSync(clone);
  expect(html).not.toContain("route-entry");
  expect(html).not.toContain("route-active");
  expect(html).toContain('route="entry"');
  expect(document.documentElement.getAttribute("route-entry")).toBe("e-1");
  expect(document.querySelector("article").getAttribute("route-active")).toBe("entry");
  document.documentElement.removeAttribute("route-entry");
});

test("the saved bytes carry no router state", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("route-entry", "e-1");
  document.body.innerHTML = '<section route="entry"><article id="a" data-id="e-1" route-active="entry">start</article></section>';
  const saveMod = await import("../../src/core/save.js");
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
  document.getElementById("a").textContent = "changed";
  await saveMod.savePage();
  expect(global.fetch).toHaveBeenCalled();
  const body = global.fetch.mock.calls[0][1].body;
  expect(body).not.toContain("route-entry");
  expect(body).not.toContain("route-active");
  expect(body).toContain('route="entry"');
  expect(body).toContain("changed");
  document.documentElement.removeAttribute("route-entry");
});

describe("an incoming frame cannot write or remove router state", () => {
  const beforeAttributeUpdated = (name, element) => (isTabLocalAttr(name, element) ? false : undefined);
  async function morphFrom(html) {
    const incoming = new DOMParser().parseFromString(html, "text/html");
    await HyperMorph.morph(document.documentElement, incoming.documentElement, {
      morphStyle: "outerHTML",
      ignoreActiveValue: true,
      head: { style: "merge" },
      callbacks: { beforeAttributeUpdated },
    });
  }

  test("a frame without route state leaves ours, and author changes still land", async () => {
    document.documentElement.setAttribute("route-entry", "e-1");
    document.body.innerHTML = '<section route="entry"><article data-id="e-1" route-active="entry">a</article></section>';
    await morphFrom('<html lang="fr"><head></head><body><section route="entry"><article data-id="e-1">a2</article></section></body></html>');
    expect(document.documentElement.getAttribute("route-entry")).toBe("e-1");
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
    expect(document.querySelector("article").getAttribute("route-active")).toBe("entry");
    expect(document.querySelector("article").textContent).toBe("a2");
    document.documentElement.removeAttribute("route-entry");
  });

  test("a frame carrying a peer's route state writes none of it", async () => {
    document.body.innerHTML = '<section route="entry"><article data-id="e-1">a</article><article data-id="e-2">b</article></section>';
    await morphFrom('<html route-entry="e-2"><head></head><body><section route="entry"><article data-id="e-1">a</article><article data-id="e-2" route-active="entry">b</article></section></body></html>');
    expect(document.documentElement.hasAttribute("route-entry")).toBe(false);
    expect(document.querySelector("[route-active]")).toBeNull();
  });
});
