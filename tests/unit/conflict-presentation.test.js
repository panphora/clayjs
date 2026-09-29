import { rowOf, plain, headingAbove, structuralSentence } from "../../src/core/conflict-presentation.js";
import { conflicts, beginApply, completeApply } from "../../src/sync/conflicts.js";

/**
 * How a replaced edit is named and quoted in the notice. Names come from what the
 * person can see on the page (the element's kind and the nearest heading above it),
 * never from authored ids, and every engine slice reaches the notice as text: the
 * page is read, never written.
 *
 * Records here are the ledger's shape, with an `id` and the engine's fields.
 */

const PAGE =
  '<h2 id="h">Pricing</h2><p>Simple plans.</p><a id="cta" href="/signup">Sign up</a>' +
  '<section id="team"><h3>Team plan</h3><p id="tp">$12 per seat per month, billed yearly.</p></section>' +
  '<section id="faq"><h3>FAQ</h3><p>Can I cancel any time?</p></section>';

beforeEach(() => {
  document.body.innerHTML = PAGE;
});

test("a name says what the thing is and where it sits on the page", () => {
  const text = rowOf({ id: "1", kind: "text", node: document.querySelector("#h"), local: "Plans for teams", remote: "Pricing" });
  expect(text.name).toBe("Page heading");

  const attr = rowOf({ id: "2", kind: "attr", el: document.querySelector("#cta"), name: "href", local: "/signup-v2", remote: "/signup" });
  expect(attr.name).toBe("Link address under Pricing");

  const structure = rowOf({ id: "3", kind: "structure", el: document.querySelector("#faq"), reason: "edit-beats-delete" });
  expect(structure.name).toBe("FAQ section");

  const under = rowOf({ id: "4", kind: "text", node: document.querySelector("#tp").firstChild, local: "$9 per seat", remote: "$12 per seat" });
  expect(under.name).toBe("Paragraph under Team plan");
});

test("with no heading above it, an element is named by its kind alone", () => {
  document.body.innerHTML = '<p id="x">hi</p>';

  const row = rowOf({ id: "1", kind: "text", node: document.querySelector("#x"), local: "a", remote: "b" });

  expect(row.name).toBe("Paragraph");
  expect(headingAbove(document.querySelector("#x"))).toBeNull();
});

test("a long heading is cut back, and the ellipsis is the only thing left out", () => {
  document.body.innerHTML = '<h2>A heading that runs on well past the forty characters a name can hold</h2><p id="x">hi</p>';

  const row = rowOf({ id: "1", kind: "text", node: document.querySelector("#x"), local: "a", remote: "b" });

  expect(row.name.endsWith("…")).toBe(true);
  const heading = row.name.slice("Paragraph under ".length);
  expect(heading.length).toBeLessThanOrEqual(41);
  expect(heading.endsWith("…")).toBe(true);
});

test("a data block is named, and the ring never lands on a hidden element", () => {
  document.body.innerHTML = '<script type="application/json" id="data">{"a":1}</script><p id="x">hi</p>';

  const script = document.querySelector("#data");
  const row = rowOf({ id: "1", kind: "text", node: script.firstChild, local: "1", remote: "2" });

  expect(row.name).toBe("Data block");
  expect(row.target).not.toBe(script);
  expect(row.target === null || row.target.contains(script)).toBe(true);
});

test("a node inside a template's content is shown through the template's host", () => {
  document.body.innerHTML = '<div id="wrap"><template id="t"><p>Hi</p></template></div>';

  const tpl = document.querySelector("#t");
  const row = rowOf({ id: "1", kind: "text", node: tpl.content.querySelector("p").firstChild, local: "a", remote: "b" });

  expect(row.target).toBe(document.querySelector("#wrap"));
  expect(row.target).not.toBe(tpl);
});

test("a duplicate id cannot point the ring at the wrong element", () => {
  document.body.innerHTML = '<p id="dup">one</p><p id="dup">two</p>';

  const second = document.querySelectorAll("#dup")[1];
  const row = rowOf({ id: "1", kind: "text", node: second, local: "a", remote: "b" });

  expect(second.textContent).toBe("two");
  expect(row.target).toBe(second);
  expect(row.target).not.toBe(document.getElementById("dup"));
});

test("a clash quotes the engine's own text around it, and says only where it cut", () => {
  document.body.innerHTML =
    '<h2>Team plan</h2><p id="p">Our team plan includes five seats, shared folders, priority support and a great price for everyone.</p>';
  const p = document.querySelector("#p");
  const full = p.textContent;
  const merged = full.replace("great", "low");
  const start = full.indexOf("great");
  const mergedStart = merged.indexOf("low");
  const sideOf = (text, at, fragment) => ({ text, start: at, end: at + fragment.length, fragment, span: null, scope: null });
  const mergedSide = sideOf(merged, mergedStart, "low");

  const row = rowOf({
    id: "1", kind: "text", local: "great", remote: "low",
    recovery: {
      version: 1, key: "t", localLost: true, applied: true, unavailable: null,
      subject: { key: "b:[1,0]", nodeType: 1, base: [[1, 0]], local: [[1, 0]], remote: [[1, 0]], merged: [[1, 0]], live: [p] },
      text: {
        encoding: "plain", base: null,
        local: sideOf(full, start, "great"),
        merged: mergedSide, remote: mergedSide,
        liveSpan: null, liveScope: null,
      },
    },
  });

  expect(row.yours.hit).toBe("great");
  expect(row.now.hit).toBe("low");
  expect(row.yours.before.endsWith("priority support and a ")).toBe(true);
  expect(row.now.before.endsWith("priority support and a ")).toBe(true);
  expect(row.yours.after).toBe(" price for everyone.");
  expect(row.now.after).toBe(" price for everyone.");
  expect(row.yours.cutBefore).toBe(true);
  expect(row.now.cutBefore).toBe(true);
  expect(row.yours.cutAfter).toBe(false);
  expect(row.now.cutAfter).toBe(false);
  expect(row.target).toBe(p);
});

test("the words around a clash come from the engine's own text, not the live page", () => {
  document.body.innerHTML = '<p id="p">something else entirely</p>';
  const p = document.querySelector("#p");
  const full = "A \uFFFC and\u001E a great day";
  const merged = "A \uFFFC and a low\u001Eday";
  const start = full.indexOf("great");
  const mergedStart = merged.indexOf("low");
  const sideOf = (text, at, fragment) => ({ text, start: at, end: at + fragment.length, fragment, span: null, scope: null });
  const mergedSide = sideOf(merged, mergedStart, "low");

  const row = rowOf({
    id: "2", kind: "text", local: "great", remote: "low",
    recovery: {
      version: 1, key: "t2", localLost: true, applied: true, unavailable: null,
      subject: { key: "b:[1,1]", nodeType: 1, base: [[1, 1]], local: [[1, 1]], remote: [[1, 1]], merged: [[1, 1]], live: [p] },
      text: {
        encoding: "plain", base: null,
        local: sideOf(full, start, "great"),
        merged: mergedSide, remote: mergedSide,
        liveSpan: null, liveScope: null,
      },
    },
  });

  expect(row.yours.before).toBe("A [item] and\n a ");
  expect(row.yours.after).toBe(" day");
  expect(row.now.after).toBe("\nday");
  for (const text of [row.yours.before, row.yours.hit, row.yours.after, row.now.before, row.now.hit, row.now.after]) {
    expect(text).not.toContain("\uFFFC");
    expect(text).not.toContain("\u001E");
  }
});

test("a subject that is gone from the page is named from this tab's own copy", () => {
  const root = document.implementation.createHTMLDocument("").documentElement;
  root.querySelector("body").innerHTML = '<section id="faq"><h2>FAQ</h2></section>';
  window.clay = { conflicts };
  const applyId = beginApply({ source: "peer", seq: null, etag: null, domain: "sync", root });
  const report = {
    kind: "structure",
    recovery: {
      version: 1, key: "s1", localLost: true, applied: true, unavailable: null,
      subject: { key: "b:[1,0]", nodeType: 1, base: [[1, 0]], local: [[1, 0]], remote: [[1, 0]], merged: [[1, 0]], live: [] },
      structure: {
        localAction: "moved", remoteAction: "moved", localPlacement: null, remotePlacement: null,
        mergedPlacement: null, localOrder: null, mergedOrder: null, localFragment: null, fragmentKind: "element",
      },
    },
  };

  const ids = completeApply(applyId, [report], { ticket: 1 });
  expect(ids).toHaveLength(1);

  const row = rowOf(report);

  expect(row.name).toBe("Section");
  expect(row.target).toBeNull();
  expect(row.sentence).toBe("You moved this section. The other edit moved it somewhere else. Their position is showing.");

  conflicts.acknowledge(ids, { reason: "accepted" });
  delete window.clay;
});

test("an attribute is named by its qualified name, and the ring lands on the live element", () => {
  document.body.innerHTML = '<svg><a id="x" xlink:href="/a">Go</a></svg>';
  const link = document.querySelector("#x");

  const row = rowOf({
    id: "3", kind: "attr", local: "/mine", remote: "/theirs",
    recovery: {
      version: 1, key: "a1", localLost: true, applied: true, unavailable: null,
      subject: { key: "b:[1,0]", nodeType: 1, base: [[1, 0]], local: [[1, 0]], remote: [[1, 0]], merged: [[1, 0]], live: [link] },
      attribute: { namespaceURI: "http://www.w3.org/1999/xlink", localName: "href", qualifiedName: "xlink:href" },
    },
  });

  expect(row.name).toBe('"xlink:href" attribute');
  expect(row.target).toBe(link);
  expect(row.yours.hit).toBe("/mine");
  expect(row.now.hit).toBe("/theirs");
});

test("an engine slice is parsed inert: text, never HTML", async () => {
  window.__pwned = undefined;

  expect(plain('<img src=x onerror="window.__pwned=1">hi')).toBe("hi");
  await new Promise((r) => setTimeout(r, 0));

  expect(window.__pwned).toBeUndefined();
});

test("a raw text conflict is quoted exactly, and a literal < is not markup", () => {
  document.body.innerHTML = '<p id="a"><textarea id="ta">x</textarea></p>';

  const row = rowOf({
    id: "1", kind: "text", node: document.querySelector("#ta").firstChild,
    local: "if a<b then use <div> tags &copy;", remote: "x",
  });

  expect(row.yours.hit).toBe("if a<b then use <div> tags &copy;");
  expect(row.now.hit).toBe("x");
});

test("an inline-merge slice still arrives as HTML and is read as its text", () => {
  document.body.innerHTML = '<p id="a">x</p>';

  const row = rowOf({
    id: "1", kind: "text", node: document.querySelector("#a").firstChild,
    lss: 0, lse: 5, local: "<b>mine</b> &amp; more", remote: "x",
  });

  expect(row.yours.hit).toBe("mine & more");
});

test("a structural loss is described in words the person can check", () => {
  expect(structuralSentence({ reason: "edit-beats-delete" }, "Section"))
    .toBe("You deleted this section. The other edit changed it at the same time, so it is still here.");
  expect(structuralSentence({ detail: "move-beats-delete" }, "Paragraph"))
    .toBe("You deleted this paragraph. The other edit moved it at the same time, so it is still here.");
  expect(structuralSentence({ detail: "insert-collision" }, "Paragraph"))
    .toBe("You added something here. The other edit added something else in the same place. Theirs is showing.");
  expect(structuralSentence({ reason: "who-knows" }, "Paragraph"))
    .toBe("Your change here was replaced by the other edit.");
  expect(structuralSentence({}, "Section"))
    .toBe("Your change here was replaced by the other edit.");
});
