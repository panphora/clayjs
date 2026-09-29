import { rowOf, plain, headingAbove, structuralSentence } from "../../src/core/conflict-presentation.js";

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

test("a clash quotes the words around it, and says only where it cut", () => {
  const tp = document.querySelector("#tp").firstChild;
  const row = rowOf({ id: "1", kind: "text", node: tp, range: [0, 22], local: "$9 per seat", remote: "$12 per seat per month" });

  expect(row.now.hit).toBe("$12 per seat per month");
  expect(row.now.after.startsWith(", billed")).toBe(true);
  expect(row.now.cutBefore).toBe(false);
  expect(row.now.cutAfter).toBe(false);

  const words = [];
  for (let i = 0; i < 40; i++) words.push(`word${i}`);
  document.body.innerHTML = `<p id="long">${words.join(" ")}</p>`;

  const long = document.querySelector("#long").firstChild;
  const full = long.textContent;
  const start = full.indexOf("word20");
  const end = start + "word20".length;
  const middle = rowOf({ id: "2", kind: "text", node: long, range: [start, end], local: "mine", remote: full.slice(start, end) });

  expect(middle.now.cutBefore).toBe(true);
  expect(middle.now.cutAfter).toBe(true);
  const raw = full.slice(start - 40, start);
  const firstSpace = raw.indexOf(" ");
  expect(firstSpace).toBeGreaterThan(-1);
  expect(middle.now.before).toBe(raw.slice(firstSpace + 1));
  expect(full[full.indexOf(middle.now.before) - 1]).toBe(" ");
});

test("a range that is not the text the engine says it is quotes nothing around it", () => {
  const tp = document.querySelector("#tp").firstChild;
  const row = rowOf({ id: "1", kind: "text", node: tp, range: [0, 10], local: "$9 per seat", remote: "$9 per seat" });

  expect(row.now).toEqual({ before: "", hit: "$9 per seat", after: "", cutBefore: false, cutAfter: false });
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
