/**
 * serialize-steps: the sliced save's serializations write the same bytes a slice at a time.
 *
 * `save-job.js` serializes three trees per save, and on a large document each one is
 * hundreds of milliseconds of uninterrupted work. The generator forms here build the same
 * strings from the same tree, `yield`ing every `SLICE_BYTES` of output, so the save can hand
 * the page back in the middle of one. The bytes must be identical to the one-call
 * functions', including the <noscript> raw-text handling and the text escaping every parent
 * element brings with it.
 */

import { drain } from "../../src/lib/slice.js";
import { serializeClone, serializeForCompare, serializeForSync } from "../../src/core/snapshot.js";
import { serializeCloneSteps, serializeForCompareSteps, serializeForSyncSteps } from "../../src/core/serialize-steps.js";
import { TAB_LOCAL_ROOT_ATTRS } from "../../src/lib/root-attrs.js";

const SLICE_BYTES = 64 * 1024;

const entry = (i) =>
  `<article data-entry="${i}"><h2>Day ${i}</h2>`
  + `<p>Entry ${i} &amp; more &lt;tag&gt; a b "q" 'q'</p><p>second</p></article>`;

// 5,000 entries plus one of every shape whose serialization is not simply its children:
// a raw-text <style> and a <script> with markup characters in it, a </template> whose
// content lives elsewhere, an <svg> subtree, a comment, a text-only <noscript>, and the
// two elements that keep a leading newline and escape their text.
function buildLargePage() {
  document.head.innerHTML = `
    <style>a > b { }</style>
    <script>if (a < b && c) {}</script>
    <template><p>t</p></template>
  `;
  document.body.innerHTML = Array.from({ length: 5000 }, (_, i) => entry(i)).join("\n  ");
  document.body.insertAdjacentHTML("beforeend", `
    <svg viewBox="0 0 10 10"><circle r="1"/></svg>
    <!-- c -->
    <pre>
x</pre>
    <textarea>
x</textarea>
    <div id="attrs" title="a &amp; b" data-quote='"q"' data-lt="a &lt; b">attrs</div>
  `);
  // A scripting browser holds a <noscript>'s markup as one text node; that is the shape
  // `serializeClone` writes raw, so set it the way the page would have it.
  const noscript = document.createElement("noscript");
  noscript.textContent = "<p>raw</p>";
  document.body.appendChild(noscript);
}

function buildSmallPage() {
  document.body.innerHTML = `
    <header><h1>Small</h1></header>
    <main><p>one &amp; two</p><p>three &lt; four</p></main>
    <footer><span title="q">five</span></footer>
  `;
}

// A body whose only child is one big container, the shape a page with a single wrapper takes:
// the save has to descend into that child to have anything to yield between.
function buildSingleContainerPage() {
  const article = (i) => `${entry(i)}<p>Entry ${i} body text, long enough that 2,000 of them run past 256 KB.</p>`;
  document.body.innerHTML = `<main>${Array.from({ length: 2000 }, (_, i) => article(i)).join("")}</main>`;
}

const countYields = (gen) => {
  let yields = 0;
  for (let step = gen.next(); !step.done; step = gen.next()) yields++;
  return yields;
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("a large page's sliced serializations are the one-call bytes", () => {
  buildLargePage();
  const saveClones = [document.documentElement.cloneNode(true), document.documentElement.cloneNode(true)];
  const compareClones = [document.documentElement.cloneNode(true), document.documentElement.cloneNode(true)];

  const noscript = saveClones[0].querySelector("noscript");
  const rawText = noscript.childNodes[0].data;
  expect(rawText).toBe("<p>raw</p>");

  const slicedSave = drain(serializeCloneSteps(saveClones[0]));
  expect(slicedSave).toBe(serializeClone(saveClones[1]));
  // The swap is only for the length of the serialization: the clone holds the page's node.
  expect(noscript.childNodes).toHaveLength(1);
  expect(noscript.childNodes[0].nodeType).toBe(3);
  expect(noscript.childNodes[0].data).toBe(rawText);

  expect(drain(serializeForCompareSteps(compareClones[0]))).toBe(serializeForCompare(compareClones[1]));
});

test("a small page's sliced serializations are the one-call bytes", () => {
  buildSmallPage();
  const clone = document.documentElement.cloneNode(true);
  expect(drain(serializeCloneSteps(clone.cloneNode(true)))).toBe(serializeClone(clone));
  expect(drain(serializeForCompareSteps(clone.cloneNode(true)))).toBe(serializeForCompare(clone));
});

test("a body holding one big child is still sliced, and its bytes are the one-call bytes", () => {
  buildSingleContainerPage();
  const clone = document.documentElement.cloneNode(true);
  const bytes = serializeClone(clone).length;
  expect(bytes).toBeGreaterThan(256 * 1024);
  expect(countYields(serializeCloneSteps(clone))).toBeGreaterThan(3);
  expect(countYields(serializeForCompareSteps(clone))).toBeGreaterThan(3);
  expect(drain(serializeCloneSteps(clone.cloneNode(true)))).toBe(serializeClone(clone));
  expect(drain(serializeForCompareSteps(clone.cloneNode(true)))).toBe(serializeForCompare(clone));
});

test("a capture's sync serialization is the one-call bytes, tab-local root attrs and all", () => {
  const TAB_LOCAL = "savestatus";
  expect(TAB_LOCAL_ROOT_ATTRS.has(TAB_LOCAL)).toBe(true);

  for (const build of [buildLargePage, buildSmallPage]) {
    build();
    const [sliced, oneCall] = [document.documentElement.cloneNode(true), document.documentElement.cloneNode(true)];
    for (const clone of [sliced, oneCall]) {
      clone.querySelector("body").setAttribute("data-kept", "kept");
      clone.setAttribute(TAB_LOCAL, "saved");
    }
    expect(drain(serializeForSyncSteps(sliced))).toBe(serializeForSync(oneCall));
  }
});

test("a large page yields once per 64 KB written, a small one not at all", () => {
  buildLargePage();
  const clone = document.documentElement.cloneNode(true);
  const bytes = serializeClone(clone).length;
  expect(bytes).toBeGreaterThan(4 * SLICE_BYTES);
  const yields = countYields(serializeCloneSteps(clone));
  expect(yields).toBeGreaterThanOrEqual(Math.floor(bytes / SLICE_BYTES) - 1);

  buildSmallPage();
  const small = document.documentElement.cloneNode(true);
  expect(countYields(serializeCloneSteps(small.cloneNode(true)))).toBe(0);
  expect(countYields(serializeForCompareSteps(small.cloneNode(true)))).toBe(0);
});

test("a generator abandoned midway restores the noscript text", () => {
  buildLargePage();
  const clone = document.documentElement.cloneNode(true);
  const noscript = clone.querySelector("noscript");

  const gen = serializeCloneSteps(clone);
  gen.next();
  // Mid-serialization the raw text stands in as a marker, which is why the restore has to
  // happen however the generator is left.
  expect(noscript.childNodes[0].data).not.toBe("<p>raw</p>");

  gen.return(undefined);
  expect(noscript.childNodes).toHaveLength(1);
  expect(noscript.childNodes[0].data).toBe("<p>raw</p>");
});
