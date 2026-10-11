/**
 * The index path of the block a person is working in.
 *
 * The path is a promise two tabs can keep: peers' DOMs agree only on the
 * snapshot tree, so every child that differs between tabs has to be invisible
 * here too. Runtime chrome is one such child (`clay="no-save no-watch
 * no-snapshot"`, appended to body by whichever tab drew it) and an injected
 * browser-extension element is the other. Both are absent from every snapshot
 * peers receive, so counting either would put this tab's outline on the wrong
 * block for everyone else.
 *
 * `blockOf` is deliberately finer than the editable region `section-notice.js`
 * remembers: a Writer-style page makes one `contenteditable` element the whole
 * article, so an outline around the region would say nothing. The block is the
 * child of that host which holds the caret.
 */

let blockOf;
let pathOf;
let elementAt;

beforeAll(async () => {
  ({ blockOf, pathOf, elementAt } = await import("../../src/sync/editing-path.js"));
});

beforeEach(() => {
  document.body.innerHTML = "";
});

// Three levels, so a round trip covers an index at every depth.
function fixture() {
  document.body.innerHTML =
    '<main id="one">' +
    '<section id="a"><p id="a1">one</p><p id="a2">two</p></section>' +
    '<section id="b"><div id="b1"><span id="b1a">x</span></div></section>' +
    "</main>" +
    '<aside id="two"><p id="c">c</p></aside>';
}

function article(html = '<p id="p1">one</p><p id="p2">t<b id="bold">w</b>o</p><p id="p3">three</p>') {
  document.body.innerHTML = `<article id="article" contenteditable="true">${html}</article>`;
  return document.getElementById("article");
}

const caretIn = (node) => {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const noCaret = () => document.getSelection().removeAllRanges();

const chrome = (tag = "div", attributes = { clay: "no-save no-watch no-snapshot" }) => {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
};

test("every element in the page round trips through its own path", () => {
  fixture();
  const elements = [...document.body.querySelectorAll("*")];

  expect(elements.length).toBe(9);
  for (const el of elements) {
    expect(elementAt(pathOf(el))).toBe(el);
  }
});

test("a runtime chrome root first in body does not shift the content's path", () => {
  fixture();
  const content = document.getElementById("a1");
  const before = pathOf(content);

  document.body.prepend(chrome());

  expect(pathOf(content)).toBe(before);
  expect(elementAt(before)).toBe(content);
  expect(elementAt("0")).toBe(document.getElementById("one"));
});

test("an injected extension element first in body does not shift the content's path", () => {
  fixture();
  const content = document.getElementById("a1");
  const before = pathOf(content);

  document.body.prepend(chrome("grammarly-extension", {}));

  expect(pathOf(content)).toBe(before);
  expect(elementAt(before)).toBe(content);
  expect(elementAt("0")).toBe(document.getElementById("one"));
});

test("a plain element first in body does shift the path", () => {
  fixture();
  const content = document.getElementById("a1");

  expect(pathOf(content)).toBe("0.0.0");
  document.body.prepend(chrome("div", {}));
  expect(pathOf(content)).toBe("1.0.0");
});

test("the block is the child of the editable host that holds the caret", () => {
  const host = article();

  caretIn(document.getElementById("p2"));
  expect(blockOf(host)).toBe(document.getElementById("p2"));

  caretIn(document.getElementById("bold"));
  expect(blockOf(host)).toBe(document.getElementById("p2"));
});

test("a host with no element child of its own is its own block", () => {
  const host = article("just text");

  noCaret();
  expect(blockOf(host)).toBe(host);

  caretIn(host.firstChild);
  expect(blockOf(host)).toBe(host);
});

test("a form control is the block, wherever it sits", () => {
  document.body.innerHTML = '<div contenteditable="true"><input id="field"></div>';

  expect(blockOf(document.getElementById("field"))).toBe(document.getElementById("field"));
});

test("a region that declares itself non-editable is no block at all", () => {
  document.body.innerHTML =
    '<div id="island" contenteditable="false">x</div><div id="plain">y</div>';

  expect(blockOf(document.getElementById("island"))).toBeNull();
  expect(blockOf(document.getElementById("plain"))).toBeNull();
  expect(blockOf(null)).toBeNull();
});

test("pathOf answers null for anything the host could not draw", () => {
  fixture();
  expect(pathOf(document.body)).toBeNull();
  expect(pathOf(document.createElement("p"))).toBeNull();

  const detached = document.createElement("div");
  detached.innerHTML = '<p id="inside"></p>';
  expect(pathOf(detached.querySelector("p"))).toBeNull();

  const hidden = document.createElement("div");
  hidden.setAttribute("clay", "no-snapshot");
  hidden.innerHTML = '<p id="invisible"></p>';
  document.body.appendChild(hidden);
  expect(pathOf(hidden.querySelector("p"))).toBeNull();
  expect(pathOf(hidden)).toBeNull();

  let deep = document.createElement("span");
  const outermost = deep;
  for (let i = 0; i < 65; i++) {
    const parent = document.createElement("span");
    parent.appendChild(deep);
    deep = parent;
  }
  document.body.appendChild(deep);
  expect(pathOf(outermost)).toBeNull();

  // The index guard, on a page with more siblings than a path can name. The
  // child list is stood in for instead of built: 10001 real siblings cost jsdom
  // minutes to walk for this one branch.
  const wide = document.createElement("div");
  const crowded = document.createElement("i");
  wide.appendChild(crowded);
  document.body.appendChild(wide);
  const filler = document.createElement("span");
  Object.defineProperty(wide, "children", {
    configurable: true,
    value: [...Array(10000).fill(filler), crowded],
  });
  expect(pathOf(crowded)).toBeNull();
});

test("elementAt answers null for anything the host could not have sent", () => {
  fixture();

  expect(elementAt("")).toBeNull();
  expect(elementAt("1.")).toBeNull();
  expect(elementAt("#main")).toBeNull();
  expect(elementAt("-1")).toBeNull();
  expect(elementAt("9")).toBeNull();
});
