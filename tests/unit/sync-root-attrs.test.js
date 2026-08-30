import { serializeForSync } from "../../src/core/snapshot.js";

// serializeForSync emits a complete document, so the open tag starts after the doctype.
const DOCTYPE = "<!DOCTYPE html>";
const openTag = (html) => html.slice(DOCTYPE.length, html.indexOf(">", DOCTYPE.length));
import { isTabLocalRootAttr, TAB_LOCAL_ROOT_ATTRS } from "../../src/lib/root-attrs.js";
import { HyperMorph } from "../../src/vendor/hyper-morph.vendor.js";

// documentid joined this list when htmlclay adopted the spec's spelling for its
// durable file identity. It was previously the example of an attribute that
// SHOULD ride along, chosen when the name was still hypothetical; it is now the
// host-injected id itself, so it belongs here beside htmlclayid, its pre-spec
// spelling, and gets the same treatment for the same reason.
const TAB_LOCAL = [
  "savetoken",
  "htmlclaytoken",
  "documentid",
  "htmlclayid",
  "savestatus",
  "editmode",
  "pageowner",
];

function makeClone() {
  const clone = document.documentElement.cloneNode(true);
  clone.setAttribute("lang", "en");
  clone.setAttribute("class", "theme-dark");
  clone.setAttribute("data-doc-version", "durable-xyz789");
  clone.setAttribute("savetoken", "ephemeral-abc123");
  clone.setAttribute("htmlclaytoken", "ephemeral-def456");
  clone.setAttribute("documentid", "durable-file-uuid");
  clone.setAttribute("htmlclayid", "pre-spec-file-uuid");
  clone.setAttribute("savestatus", "unsaved");
  clone.setAttribute("editmode", "true");
  clone.setAttribute("pageowner", "true");
  return clone;
}

test("the tab-local names are exactly the set the module publishes", () => {
  expect([...TAB_LOCAL_ROOT_ATTRS].sort()).toEqual([...TAB_LOCAL].sort());
});

test("the sync payload drops every tab-local attribute from the root", () => {
  const html = serializeForSync(makeClone());
  const rootTag = openTag(html);
  for (const name of TAB_LOCAL) {
    expect(rootTag).not.toContain(`${name}=`);
  }
});

test("the sync payload keeps the author's own root attributes", () => {
  const html = serializeForSync(makeClone());
  const rootTag = openTag(html);
  expect(rootTag).toContain('lang="en"');
  expect(rootTag).toContain('class="theme-dark"');
  expect(rootTag).toContain('data-doc-version="durable-xyz789"');
});

test("every removed attribute is restored on the clone afterwards", () => {
  const clone = makeClone();
  const before = TAB_LOCAL.map((name) => [name, clone.getAttribute(name)]);
  serializeForSync(clone);
  for (const [name, value] of before) {
    expect(clone.getAttribute(name)).toBe(value);
  }
  expect(clone.getAttribute("data-doc-version")).toBe("durable-xyz789");
});

test("the same names on a non-root element are left alone", () => {
  const clone = makeClone();
  const el = clone.ownerDocument.createElement("div");
  el.id = "author-owned";
  for (const name of TAB_LOCAL) el.setAttribute(name, `author-${name}`);
  clone.querySelector("body").appendChild(el);

  const html = serializeForSync(clone);
  for (const name of TAB_LOCAL) {
    expect(html).toContain(`${name}="author-${name}"`);
  }
});

test("isTabLocalRootAttr is true for each tab-local name on the root", () => {
  for (const name of TAB_LOCAL) {
    expect(isTabLocalRootAttr(name, document.documentElement)).toBe(true);
  }
});

test("isTabLocalRootAttr is false for each of them on any other element", () => {
  const el = document.createElement("div");
  for (const name of TAB_LOCAL) {
    expect(isTabLocalRootAttr(name, el)).toBe(false);
  }
  expect(isTabLocalRootAttr("savetoken", document.body)).toBe(false);
});

test("isTabLocalRootAttr is false for the author's own root attributes", () => {
  expect(isTabLocalRootAttr("lang", document.documentElement)).toBe(false);
  expect(isTabLocalRootAttr("data-doc-version", document.documentElement)).toBe(false);
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
