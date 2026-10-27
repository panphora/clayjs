/**
 * @jest-environment node
 */
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { JSDOM } from "jsdom";
import { stampPageRev, rebasePage, captureFormat, checkPageFormatAdmission } from "../../../src/server/rooms/index.js";
import { blocksOfValues, project, renderModel, revOf, fragmentCleaner } from "../../../src/page/projection.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { docFromValue, enc } from "../../../src/page/ybind/provider.js";
import { PAGE_FORMAT_META, PAGE_FORMAT_UPGRADE } from "../../../src/page/format-level.js";

// The room contract for the format floor: what a capture needs, what the document
// already carries, and the refusal a lower-capability writer gets before any
// mutation. The floor is canonical metadata outside the page value, and it only
// rises: a stale save that omits the marker cannot lower it.

const createDocument = () => new JSDOM("<!doctype html><html><body></body></html>").window.document;
const pageTag = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
const marker = (floor) => `<meta name="${PAGE_FORMAT_META}" content="${floor}">`;
const doc = (value, { floor = 0, article = '<article data-page><p data-id="p">before</p></article>' } = {}) =>
  `<!doctype html><html><head>${floor ? marker(floor) : ""}<title>t</title></head><body>${article}${pageTag(value)}</body></html>`;

// The plain page, and a page a newer runtime formatted with a named extension mark.
const plainValue = seedValue([{ id: "p", text: "before" }]);
function futureValue() {
  const d = docFromValue(plainValue, { strict: true });
  d.clientID = 100;
  d.getText("flow").format(1, 3, { "underline~future": { color: "red" } });
  const update = enc(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  const value = { v: 1, g: 0, y: { ...plainValue.y, "edit-100-1": update } };
  expect(project(blocksOfValues([JSON.parse(JSON.stringify(value))]))).toBeTruthy();
  return value;
}

const refusal = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
};

test("a document without the marker is floor 0, and with it the floor it names", () => {
  const plain = doc(plainValue);
  expect(captureFormat(plain)).toBe(0);
  expect(captureFormat(doc(plainValue, { floor: 1 }))).toBe(0);
  expect(checkPageFormatAdmission({ currentHtml: plain, html: plain, capability: 1 })).toMatchObject({ ok: true, activate: false, floor: 0 });
});

test("a capture holding a newer runtime's mark needs floor 1, and is refused to a writer below it", () => {
  const future = futureValue();
  const capture = doc(future);
  expect(captureFormat(capture)).toBe(1);
  const plain = doc(plainValue);

  const thrown = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: capture, capability: 0 }));
  expect(thrown).not.toBeNull();
  expect(thrown.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(thrown.statusCode).toBe(409);
  expect(thrown.minimum).toBe(1);
  // Nothing was mutated: the source is the same string it was, and no capture
  // came back to store.
  expect(plain).toBe(doc(plainValue));
  expect(plain.includes(PAGE_FORMAT_META)).toBe(false);

  const missing = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: capture }));
  expect(missing.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(captureFormat(doc(future, { floor: 1 }))).toBe(1);
});

test("a capable writer activates floor 1, and the body it gets back carries the marker", () => {
  const capture = doc(futureValue());
  const plain = doc(plainValue);
  const decision = checkPageFormatAdmission({ currentHtml: plain, html: capture, capability: 1 });
  expect(decision).toMatchObject({ ok: true, activate: true, floor: 1 });
  expect(decision.html).toContain(marker(1));
  expect(decision.html).toContain(pageTag(futureValue()).slice(0, 40));
  expect(decision.html.indexOf(marker(1))).toBeLessThan(decision.html.indexOf("<article"));
  const again = checkPageFormatAdmission({ currentHtml: decision.html, html: decision.html, capability: 1 });
  expect(again).toMatchObject({ ok: true, activate: false, floor: 1 });
});

test("a future descriptor smuggled into a floor-0 update without a marker is refused before broadcast", () => {
  const smuggled = doc(futureValue());
  const plain = doc(plainValue);
  const error = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: smuggled, capability: 0 }));
  expect(error.code).toBe(PAGE_FORMAT_UPGRADE);
  const legacy = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: smuggled, capability: "one" }));
  expect(legacy.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: smuggled, capability: "0" })).code).toBe(PAGE_FORMAT_UPGRADE);
});

test("a stale save that omits the marker cannot lower an established floor", () => {
  const established = doc(plainValue, { floor: 1 });
  const stale = doc(plainValue);
  expect(stale.includes(PAGE_FORMAT_META)).toBe(false);
  const decision = checkPageFormatAdmission({ currentHtml: established, html: stale, capability: 1 });
  expect(decision).toMatchObject({ ok: true, activate: false, floor: 1 });
  expect(decision.html).toContain(marker(1));
  // The body's own content is otherwise the one the writer sent.
  expect(decision.html.replace(marker(1), "")).toBe(stale);
  const below = refusal(() => checkPageFormatAdmission({ currentHtml: established, html: stale, capability: 0 }));
  expect(below.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(below.minimum).toBe(1);
});

test("a marker in the capture needs a writer that can write that floor", () => {
  const plain = doc(plainValue);
  const marked = doc(plainValue, { floor: 1 });
  const error = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: marked, capability: 0 }));
  expect(error.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(checkPageFormatAdmission({ currentHtml: plain, html: marked, capability: 1 })).toMatchObject({ ok: true, activate: true, floor: 1 });
});

test("a floor rise is refused while an admitted editor could not read the result", () => {
  const plain = doc(plainValue);
  const capture = doc(futureValue());
  const error = refusal(() => checkPageFormatAdmission({ currentHtml: plain, html: capture, capability: 1, admitted: [1, 0] }));
  expect(error.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(error.minimum).toBe(1);
  // Once the floor stands, the same incompatible editor blocks nothing new: the
  // document is floor 1 and no further activation happens.
  const established = doc(plainValue, { floor: 1 });
  expect(checkPageFormatAdmission({ currentHtml: established, html: established, capability: 1, admitted: [0] })).toMatchObject({ ok: true, activate: false, floor: 1 });
});

test("a version restored as an edit keeps the floor, and an unmarked restore adds none", () => {
  const html = `<!doctype html><html><head></head><body><article data-page="1"><p>x</p></article></body></html>`;
  const restored = stampPageRev(html, "r1", 1);
  expect(restored).toContain(marker(1));
  expect(restored).toContain('data-rev="r1"');
  expect(stampPageRev(restored, "r2", 1)).toBe(restored.replace('data-rev="r1"', 'data-rev="r2"'));
  expect(stampPageRev(html, "r1")).toBe(`<!doctype html><html><head></head><body><article data-page="1" data-rev="r1"><p>x</p></article></body></html>`);
  expect(stampPageRev(html, "r1", 1).includes(marker(1))).toBe(true);
});

test("an outside writer's rebase keeps the floor the stored document had", () => {
  const pageOf = (record) => {
    const d = createDocument();
    const model = project(blocksOfValues([record]));
    const html = renderModel(model, { fallbackOf: () => "", clean: fragmentCleaner(d) });
    const rev = revOf(model);
    return { rev, file: `<!doctype html>\n<html><head><title>t</title></head><body>\n<article data-page data-rev="${rev}">\n${html}\n</article>${pageTag(record)}\n</body></html>\n` };
  };
  const A = { blocks: { a: { t: "paragraph", pos: "1", c: "Hello world" }, b: { t: "paragraph", pos: "2", c: "Second block" } }, deleted: {} };
  const B = JSON.parse(JSON.stringify(A));
  B.blocks.b.c = "Second block, revised";
  const base = pageOf(A);
  const stored = pageOf(B);
  const stamped = { ...stored, file: stored.file.replace("<head>", `<head>${marker(1)}`) };
  const incoming = base.file.replace("Hello world", "Hello outside world");
  const result = rebasePage({ storedHtml: stamped.file, state: { v: 1, rev: stored.rev, tag: pageTag(B) }, incomingHtml: incoming, baseHtml: base.file, createDocument });
  expect(result).not.toBeNull();
  expect(result.html).toContain(marker(1));
  expect(result.html).toContain("Hello outside world");
  expect(result.html).toContain("Second block, revised");
  const lower = rebasePage({ storedHtml: stored.file, state: { v: 1, rev: stored.rev, tag: pageTag(B) }, incomingHtml: incoming, baseHtml: base.file, createDocument });
  expect(lower.html.includes(PAGE_FORMAT_META)).toBe(false);
});
