import { serializeForSync } from "../../src/core/snapshot.js";
import { isTabLocalRootAttr, TAB_LOCAL_ROOT_ATTRS } from "../../src/lib/root-attrs.js";
import { HyperMorph } from "../../src/vendor/hyper-morph.vendor.js";

const SIX = [
  "savetoken",
  "htmlclaytoken",
  "clay-save-transport",
  "savestatus",
  "editmode",
  "pageowner",
];

function makeClone() {
  const clone = document.documentElement.cloneNode(true);
  clone.setAttribute("lang", "en");
  clone.setAttribute("class", "theme-dark");
  clone.setAttribute("documentid", "durable-xyz789");
  clone.setAttribute("savetoken", "ephemeral-abc123");
  clone.setAttribute("htmlclaytoken", "ephemeral-def456");
  clone.setAttribute("clay-save-transport", "desktop-json-v1");
  clone.setAttribute("savestatus", "unsaved");
  clone.setAttribute("editmode", "true");
  clone.setAttribute("pageowner", "true");
  return clone;
}

test("the six tab-local names are exactly the set the module publishes", () => {
  expect([...TAB_LOCAL_ROOT_ATTRS].sort()).toEqual([...SIX].sort());
});

test("the sync payload drops all six tab-local attributes from the root", () => {
  const html = serializeForSync(makeClone());
  const rootTag = html.slice(0, html.indexOf(">"));
  for (const name of SIX) {
    expect(rootTag).not.toContain(`${name}=`);
  }
});

test("the sync payload keeps lang, class and documentid on the root", () => {
  const html = serializeForSync(makeClone());
  const rootTag = html.slice(0, html.indexOf(">"));
  expect(rootTag).toContain('lang="en"');
  expect(rootTag).toContain('class="theme-dark"');
  expect(rootTag).toContain('documentid="durable-xyz789"');
});

test("every removed attribute is restored on the clone afterwards", () => {
  const clone = makeClone();
  const before = SIX.map((name) => [name, clone.getAttribute(name)]);
  serializeForSync(clone);
  for (const [name, value] of before) {
    expect(clone.getAttribute(name)).toBe(value);
  }
  expect(clone.getAttribute("documentid")).toBe("durable-xyz789");
});

test("the same six names on a non-root element are left alone", () => {
  const clone = makeClone();
  const el = clone.ownerDocument.createElement("div");
  el.id = "author-owned";
  for (const name of SIX) el.setAttribute(name, `author-${name}`);
  clone.querySelector("body").appendChild(el);

  const html = serializeForSync(clone);
  for (const name of SIX) {
    expect(html).toContain(`${name}="author-${name}"`);
  }
});

test("isTabLocalRootAttr is true for each of the six on the root", () => {
  for (const name of SIX) {
    expect(isTabLocalRootAttr(name, document.documentElement)).toBe(true);
  }
});

test("isTabLocalRootAttr is false for each of the six on any other element", () => {
  const el = document.createElement("div");
  for (const name of SIX) {
    expect(isTabLocalRootAttr(name, el)).toBe(false);
  }
  expect(isTabLocalRootAttr("savetoken", document.body)).toBe(false);
});

test("isTabLocalRootAttr is false for lang and documentid on the root", () => {
  expect(isTabLocalRootAttr("lang", document.documentElement)).toBe(false);
  expect(isTabLocalRootAttr("documentid", document.documentElement)).toBe(false);
});

const beforeAttributeUpdated = (name, element) =>
  isTabLocalRootAttr(name, element) ? false : undefined;

async function morphFrom(html) {
  const incoming = new DOMParser().parseFromString(html, "text/html");
  await HyperMorph.morph(document.documentElement, incoming.documentElement, {
    morphStyle: "outerHTML",
    ignoreActiveValue: true,
    head: { style: "merge" },
    callbacks: { beforeAttributeUpdated },
  });
}

test("a peer's token is not written onto this tab's root", async () => {
  document.documentElement.setAttribute("savetoken", "mine");
  await morphFrom(
    '<html savetoken="theirs" lang="fr"><head></head><body><p>peer</p></body></html>',
  );
  expect(document.documentElement.getAttribute("savetoken")).toBe("mine");
  expect(document.documentElement.getAttribute("lang")).toBe("fr");
});

test("a token-stripped frame does not remove this tab's own token", async () => {
  document.documentElement.setAttribute("savetoken", "mine");
  await morphFrom(
    '<html lang="de"><head></head><body><p>peer</p></body></html>',
  );
  expect(document.documentElement.getAttribute("savetoken")).toBe("mine");
  expect(document.documentElement.getAttribute("lang")).toBe("de");
});
