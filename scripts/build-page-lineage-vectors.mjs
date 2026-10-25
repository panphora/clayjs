// The shared page-lineage vectors: one JSON file that clayjs, HTML Clay,
// hyperclay and Hyperclay Local all test their first-write decisions against.
//
//   node scripts/build-page-lineage-vectors.mjs --write
//   node scripts/build-page-lineage-vectors.mjs --check
//
// Every value here is built from the real seed encoder and the real renderer, so
// the file follows the code: a change to either fails the check until it is
// regenerated. Nothing here is random or time-dependent.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import * as Y from "../src/vendor/yjs.vendor.js";
import { seedPageFromArticle } from "../src/page/ybind/migrate.js";
import { entriesOf } from "../src/page/ybind/parts.js";
import { createPageDoc } from "../src/page/ybind/layout.js";
import { yValueOf } from "../src/page/ybind/provider.js";
import { project, renderModel, fragmentCleaner } from "../src/page/projection.js";
import { blocksFromPageValues } from "../src/page/ybind/decode.js";
import { splitPage, composePage, pageRev } from "../src/server/rooms/page-state.js";
import { articleOf } from "../src/server/rooms/page-rebase.js";
import { serializeLive } from "../src/server/rooms/live-data-ops.js";

const OUT = new URL("../tests/fixtures/offline-runtime/page-lineage.json", import.meta.url);
const TEMPLATE = readFileSync(new URL("../tests/fixtures/ypage-template.html", import.meta.url), "utf8");
const T = splitPage(TEMPLATE).file;
const dom = new JSDOM("");
const browserArticle = (html) => new JSDOM(html).window.document.querySelector("article[data-page]");
const seedOf = (html) => seedPageFromArticle(browserArticle(html));
const clientsOf = (value) => {
  const clients = new Set();
  for (const [, text] of entriesOf(value.y)) for (const c of Y.decodeStateVector(Y.encodeStateVectorFromUpdateV2(Y.fromBase64(text))).keys()) clients.add(c);
  return [...clients].sort((a, b) => a - b);
};
const docOf = (value, clientID) => {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  for (const [, text] of entriesOf(value.y)) Y.applyUpdateV2(doc, Y.fromBase64(text));
  return doc;
};
// An edit as the browser provider records it: the seed entries stay, the edit is one u<client36>-0 entry.
const edited = (value, clientID, change) => {
  const doc = docOf(value, clientID);
  const before = Y.encodeStateVector(doc);
  doc.transact(() => change(createPageDoc(doc)), "page-local");
  const u = Y.encodeStateAsUpdateV2(doc, before);
  return { v: 1, g: 0, y: { ...value.y, [`u${clientID.toString(36)}-0`]: Buffer.from(u).toString("base64") } };
};
const collapsed = (value) => yValueOf(docOf(value, 4242));
const tagOf = (value) => `<script type="application/json" merge="page" clay="live">${serializeLive(value)}</script>`;
const withTag = (file, value) => composePage(file, { v: 1, rev: pageRev(file), tag: tagOf(value) });

// The article's outer element located by source offsets, as the host reads it.
const articleIn = (file) => {
  const found = articleOf(file, dom.window.document);
  if (!found) throw new Error("Expected exactly one revisioned article");
  return found;
};
const withInner = (file, inner) => {
  const found = articleIn(file);
  return file.slice(0, found.inner[0]) + inner + file.slice(found.inner[1]);
};
// A real save: the article's inner HTML re-rendered from the value, its start tag untouched.
const rendered = (file, value) => withInner(file, `\n${renderModel(project(blocksFromPageValues([value])), { fallbackOf: () => "", clean: fragmentCleaner(dom.window.document) })}\n`);
const editBody = (file, value) => withTag(rendered(file, value), value);

const replaceOnce = (html, from, to) => {
  if (!html.includes(from)) throw new Error(`Fixture text not found: ${from}`);
  return html.replace(from, to);
};

// The probe's first edit: the title heading one level down.
const retitle = (page) => page.attrs.get("title").set("level", "2");
// The first block leaves the flow: its marker is one embed in the flow text.
const dropFirst = (page) => page.flow.delete(0, 1);
// Type a character into the second block's text, then erase it: two transactions, one entry.
const typeAndErase = (value) => {
  const doc = docOf(value, 1001);
  const before = Y.encodeStateVector(doc);
  const page = createPageDoc(doc);
  const at = page.flow.length;
  doc.transact(() => page.flow.insert(at, "x"), "page-local");
  doc.transact(() => page.flow.delete(at, 1), "page-local");
  const u = Y.encodeStateAsUpdateV2(doc, before);
  return { v: 1, g: 0, y: { ...value.y, [entryKey(1001)]: Buffer.from(u).toString("base64") } };
};
const entryKey = (clientID) => `u${clientID.toString(36)}-0`;
// An empty article gains its first block: a paragraph marker and its (empty) attributes.
const appendParagraph = (value, clientID = 1001) => {
  const doc = docOf(value, clientID);
  const before = Y.encodeStateVector(doc);
  const page = createPageDoc(doc);
  doc.transact(() => {
    page.attrs.set("p1", new Y.Map([["t", "paragraph"]]));
    page.flow.insertEmbed(page.flow.length, { b: "p1" }, {});
  }, "page-local");
  const u = Y.encodeStateAsUpdateV2(doc, before);
  return { v: 1, g: 0, y: { ...value.y, [entryKey(clientID)]: Buffer.from(u).toString("base64") } };
};

const loadFixture = (name) => splitPage(readFileSync(new URL(`../tests/fixtures/load/${name}.html`, import.meta.url), "utf8")).file;
const longPage = Array.from({ length: 400 }, (_, i) => `<p data-id="p${i + 1}">Paragraph ${i + 1} of a long page, written to need several seed parts.</p>`).join("\n");

const T2 = replaceOnce(
  replaceOnce(T, `data-rev="${pageRev(T)}"`, 'data-rev="1eaf0f0f0f0f0f0f"'),
  '<h1 data-id="title"></h1>',
  '<h1 data-id="title">An outside edit</h1>',
);
const E = withInner(T, "\n");
const L = withInner(T, longPage);
const TAGGED = editBody(T, edited(seedOf(T), 1001, retitle));
const CONVERTED = TEMPLATE;

// Articles that exercise the browser's parser against the host's: each replaces
// the template article's contents.
const IRREGULAR = [
  ["irregular-unclosed-p", "<p data-id=\"a\">An unclosed paragraph"],
  ["irregular-unclosed-li", "<ul><li data-id=\"a\">One<li data-id=\"b\">Two</ul>"],
  ["irregular-table-without-tbody", "<table data-id=\"t\"><thead><tr><th data-col=\"a\">A</th><th data-col=\"b\">B</th></tr></thead><tr><td>1</td><td>2</td></tr></table>"],
  ["irregular-fostered-text", "<table data-id=\"t\">loose text<thead><tr><th data-col=\"a\">A</th></tr></thead><tr><td>1</td></tr></table>"],
  ["irregular-div-in-p", "<p data-id=\"a\">A paragraph <div data-id=\"b\">with a block</div> inside it</p>"],
  ["irregular-entities", "<p data-id=\"a\">A &amp; B &lt; C &#8212; &#x2014; D&nbsp;E</p>"],
  ["irregular-template", "<template><p data-id=\"ghost\">Hidden in a template</p></template><p data-id=\"a\">Shown</p>"],
  ["irregular-inline-svg", "<p data-id=\"a\">Before <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><circle cx=\"5\" cy=\"5\" r=\"4\"></circle></svg> after</p>"],
  ["irregular-stray-end-tags", "<p data-id=\"a\">Text</span></div>"],
  ["irregular-form-input", "<form data-id=\"f\" action=\"/send\"><input name=\"q\" value=\"typed\"></form>"],
  ["irregular-pre-newline", "<pre data-id=\"code\">\nline one\nline two</pre>"],
  ["irregular-mixed", "<h2 data-id=\"h\">A heading</h2>\n<p data-id=\"p\">A paragraph.</p>\n<ul><li data-id=\"l1\">First</li><li data-id=\"l2\">Second</li></ul>"],
];

// The file each seed entry describes: a named base, or the template article with
// this entry's own contents.
export const fileOf = (entry) => {
  if (entry.html === "T") return T;
  if (entry.html === "T2") return T2;
  if (entry.html === "E") return E;
  if (entry.html === "L") return L;
  if (entry.html === "TAGGED") return TAGGED;
  if (entry.html.startsWith("load/")) return loadFixture(entry.html.slice("load/".length));
  return withInner(T, entry.html);
};

const seedEntry = (name, file) => {
  const seed = seedOf(file);
  const clients = clientsOf(seed);
  if (clients.length > 1) throw new Error(`${name}: a seed carries more than one client`);
  return { name, client: clients.length ? clients[0] : null, seed: serializeLive(seed), html: name };
};

const seedT = seedOf(T);
const seedE = seedOf(E);
const seedL = seedOf(L);

// The browsers keep their first seed after an outside edit, so T2's rival seed is its own.
const seedT2 = seedOf(T2);

const seeds = [
  seedEntry("T", T),
  seedEntry("T2", T2),
  seedEntry("E", E),
  seedEntry("L", L),
  seedEntry("TAGGED", TAGGED),
  seedEntry("load/document", loadFixture("document")),
  seedEntry("load/document-text", loadFixture("document-text")),
  seedEntry("load/document-rich", loadFixture("document-rich")),
  ...IRREGULAR.map(([name, html]) => {
    const seed = seedOf(withInner(T, html));
    const clients = clientsOf(seed);
    if (clients.length > 1) throw new Error(`${name}: a seed carries more than one client`);
    return { name, client: clients.length ? clients[0] : null, seed: serializeLive(seed), html };
  }),
];

const seedLFirstKey = Object.keys(seedL.y).filter((key) => key.startsWith("seed.0."))[0] ?? Object.keys(seedL.y)[0];
const seedLFirstPart = seedL.y[seedLFirstKey];
const noteless = replaceOnce(T, '<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="x-note" content="kept">');
const netZeroBody = editBody(T, typeAndErase(seedT));
const firstEditBody = editBody(T, edited(seedT, 1001, retitle));
const firstEditValue = edited(seedT, 1001, retitle);
const deleteOnlyValue = edited(seedT, 1001, dropFirst);

const writes = [
  { name: "seed-only-published", current: T, body: withTag(T, seedOf(T)), ifMatchOf: "current", pageWrite: null, expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "seed-only-v1", current: T, body: withTag(T, seedOf(T)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "nothing-to-write", htmlclay: "nothing-to-write" } },
  { name: "seed-only-v1-other-change", current: T, body: withTag(noteless, seedOf(T)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "first-edit", current: T, body: firstEditBody, ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "first-edit-collapsed", current: T, body: editBody(T, collapsed(firstEditValue)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "delete-only", current: T, body: editBody(T, deleteOnlyValue), ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "net-zero-edit", current: T, body: netZeroBody, ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: null } },
  { name: "stale-seed-edit", current: T2, body: firstEditBody, ifMatchOf: "current", pageWrite: "v1", expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "stale-seed-only", current: T2, body: withTag(T, seedOf(T)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "stale-stamp", current: T2, body: firstEditBody, ifMatchOf: "T", pageWrite: "v1", expect: { js: "412", htmlclay: "412" } },
  { name: "conversion-as-first-write", current: T, body: CONVERTED, ifMatchOf: "current", pageWrite: null, expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "empty-value-over-article", current: T, body: withTag(T, { v: 1, g: 0, y: { seed: "AAAAAAAAAQAAAAAAAA==" } }), ifMatchOf: "current", pageWrite: null, expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "incomplete-parts", current: T, body: withTag(T, { v: 1, g: 0, y: { [seedLFirstKey]: seedLFirstPart.slice(0, Math.floor(seedLFirstPart.length / 8) * 4) } }), ifMatchOf: "current", pageWrite: null, expect: { js: "invalid-capture", htmlclay: "invalid-capture" } },
  { name: "undecodable-entry", current: T, body: withTag(T, { v: 1, g: 0, y: { seed: "bm90IGEgeWpzIHVwZGF0ZQ==" } }), ifMatchOf: "current", pageWrite: null, expect: { js: "invalid-capture", htmlclay: "ordinary" } },
  { name: "same-lineage-over-tagged", current: TAGGED, body: editBody(T, edited(edited(seedT, 1001, retitle), 1002, dropFirst)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "ordinary", htmlclay: "ordinary" } },
  { name: "rival-over-tagged", current: TAGGED, body: editBody(T2, edited(seedT2, 1002, retitle)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "conversion-over-tagged", current: TAGGED, body: CONVERTED, ifMatchOf: "current", pageWrite: null, expect: { js: "seed-lineage", htmlclay: "ordinary" } },
  { name: "identical-tag", current: TAGGED, body: TAGGED, ifMatchOf: "current", pageWrite: null, expect: { js: "ordinary", htmlclay: "ordinary" } },
  { name: "outside-edit-drops-tag", current: TAGGED, body: T2, ifMatchOf: "current", pageWrite: null, expect: { js: "ordinary", htmlclay: "ordinary" } },
  { name: "new-site-from-template", current: "", body: CONVERTED, ifMatchOf: null, pageWrite: null, expect: { js: "initial", htmlclay: "initial" } },
  { name: "empty-seed-only-v1", current: E, body: withTag(E, seedOf(E)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "nothing-to-write", htmlclay: "nothing-to-write" } },
  { name: "empty-first-edit", current: E, body: editBody(E, appendParagraph(seedE)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "large-first-edit", current: L, body: editBody(L, edited(seedL, 1001, dropFirst)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "initial", htmlclay: "ordinary" } },
  { name: "large-seed-only-v1", current: L, body: withTag(L, seedOf(L)), ifMatchOf: "current", pageWrite: "v1", expect: { js: "nothing-to-write", htmlclay: "nothing-to-write" } },
];

// HTML Clay refuses a v1 body whose tag-stripped bytes equal the stored file.
const netZero = writes.find((write) => write.name === "net-zero-edit");
netZero.expect.htmlclay = splitPage(netZero.body).file === netZero.current ? "nothing-to-write" : "ordinary";

export function buildVectors() {
  return { v: 1, seeds, writes };
}

function verify() {
  const byName = new Map(writes.map((write) => [write.name, write]));
  if (splitPage(byName.get("seed-only-v1").body).file !== T) throw new Error("seed-only-v1: the body does not strip back to T");
  const parts = Object.keys(seedL.y);
  if (parts.length < 2) throw new Error("large fixture: the seed has one part, so no split entries");
  if (JSON.stringify(clientsOf(deleteOnlyValue)) !== JSON.stringify(clientsOf(seedT))) throw new Error("delete-only: a delete-only edit must add no client");
  if (JSON.stringify(clientsOf(firstEditValue)) !== JSON.stringify([...clientsOf(seedT), 1001].sort((a, b) => a - b))) throw new Error("first-edit: the value must carry the seed's client and 1001");
}

async function main() {
  verify();
  const text = JSON.stringify(buildVectors(), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    let current = null;
    try { current = readFileSync(OUT, "utf8"); } catch {}
    if (current === text) { console.log("In sync: tests/fixtures/offline-runtime/page-lineage.json"); return; }
    console.log("Stale: tests/fixtures/offline-runtime/page-lineage.json (run node scripts/build-page-lineage-vectors.mjs --write)");
    process.exit(1);
  }
  writeFileSync(OUT, text);
  console.log(`Updated: tests/fixtures/offline-runtime/page-lineage.json (${seeds.length} seeds, ${writes.length} writes)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
