/**
 * @jest-environment node
 */
import { JSDOM } from "jsdom";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createRooms, serializeLive } from "../../../src/server/rooms/index.js";
import { captureCheckpoint, isCheckpointCurrent, renderCheckpoint } from "../../../src/server/checkpoint/index.js";
import { MARKS, OPAQUE, VALUE } from "../../../src/page/projection.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { docFromValue, enc } from "../../../src/page/ybind/provider.js";

// The server checkpoint holds the same rule as the rest of the page: content a
// newer format put in the article's envelopes is never projected away. The
// article is rewritten only when it holds nothing the room's blocks cannot
// reproduce, and an envelope that is malformed is refused outright.

const tag = (name, value, ephemeral = false) =>
  `<script type="application/json" clay="live${ephemeral ? " ephemeral" : ""}" merge="${name}">${serializeLive(value)}</script>`;

const b64encode = (text) => Buffer.from(text, "utf8").toString("base64url");
const envelopeOf = (value) => `${OPAQUE}="1" ${VALUE}="${b64encode(JSON.stringify(value))}"`;

const fileOf = (value, article = "old article") =>
  `<!doctype html><html><head><title>Keep this title</title></head><body><article data-page data-rev="old">${article}</article>${tag("page", value)}${tag("game", { score: 0 })}<footer>Keep this footer</footer></body></html>`;
const withArticle = (html, article) => html.replace(/(<article data-page data-rev="old">)[\s\S]*?(<\/article>)/, `$1${article}$2`);

const createDocument = () => new JSDOM("").window.document;
const articleInside = (html) => html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1];

const roomOf = (value, article) => {
  const rooms = createRooms({ newEpoch: () => "unknown-checkpoint" });
  const source = fileOf(value, article);
  const room = rooms.open("/page.html", source, { nodeId: "node-1" });
  const capture = () => captureCheckpoint(room, { nodeId: "node-1", roomKey: "/page.html" });
  const render = (text = source, pinned = capture()) => renderCheckpoint(text, pinned, { createDocument });
  return { rooms, room, source, capture, render };
};

const editPage = (rooms, room, client, n, change) => {
  const doc = docFromValue(room.stores.get("page").value, { strict: true });
  doc.clientID = Number(client);
  change(doc.getText("flow"));
  const update = enc(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  const result = rooms.apply(room, client, { name: "page", n, ops: [{ op: "set", path: ["y", `edit-${client}-${n}`], value: update }], epoch: room.epoch, pageGeneration: room.pageTransition?.id ?? null });
  expect(result.seq).toBeGreaterThan(0);
};

test("the checkpoint replaces an article that moved on, and leaves a current one alone", () => {
  const { rooms, room, capture, render } = roomOf(seedValue([{ id: "p", text: "before" }]));
  const pinned = capture();
  const first = render(undefined, pinned);
  expect(first.kind).toBe("ok");
  expect(articleInside(first.html)).toBe('<p data-id="p">before</p>');
  expect(first.html).not.toContain("data-clay-page");
  expect(isCheckpointCurrent(first.html, pinned)).toBe(true);
  expect(render(undefined, pinned).html).toBe(first.html);

  editPage(rooms, room, "100", 1, (flow) => flow.insert(2, "X"));
  expect(isCheckpointCurrent(first.html, capture())).toBe(false);
  const second = render(first.html, capture());
  expect(second.kind).toBe("ok");
  expect(articleInside(second.html)).toBe('<p data-id="p">bXefore</p>');
  expect(isCheckpointCurrent(second.html, capture())).toBe(true);
});

test("an article carrying a newer format's record is never projected away", () => {
  const value = seedValue([{ id: "p", text: "before" }]);
  const envelope = `<p data-id="p" ${envelopeOf({ due: "2026-11-01" })}>before</p>`;
  const carried = roomOf(value, envelope);
  const refused = carried.render();
  expect(refused).toEqual({ kind: "refused", reason: "unknown-page-content" });
  expect(refused.html).toBeUndefined();
  expect(isCheckpointCurrent(carried.source, carried.capture())).toBe(false);

  const marks = roomOf(value, `<p data-id="p"><span ${MARKS}="${b64encode('[{"tokens":["u"]}]')}">before</span></p>`);
  expect(marks.render()).toEqual({ kind: "refused", reason: "unknown-page-content" });

  const plain = roomOf(value);
  expect(plain.render().kind).toBe("ok");
  expect(articleInside(plain.render().html)).toBe('<p data-id="p">before</p>');
});

test("a deliberately invalid envelope is refused and the source file is left as it stands", () => {
  const value = seedValue([{ id: "p", text: "before" }]);
  const cases = [
    ["not base64url JSON", `<div data-id="q" ${OPAQUE}="1" ${VALUE}="!!">text</div>`],
    ["a record naming a known block type", `<div data-id="q" ${envelopeOf({ t: "paragraph", c: "x" })}>text</div>`],
    ["a record with a structural position", `<div data-id="q" ${envelopeOf({ t: "quote", pos: "1" })}>text</div>`],
    ["JSON deeper than the budget", `<div data-id="q" ${envelopeOf({ t: "quote", extra: JSON.parse('{"a":'.repeat(40) + "1" + "}".repeat(40)) })}>text</div>`],
    ["entries that are not a marks envelope", `<p data-id="p"><span ${MARKS}="${b64encode('{"name":"x"}')}">before</span></p>`],
  ];
  for (const [why, article] of cases) {
    const { capture, render } = roomOf(value, article);
    const result = render(fileOf(value, article), capture());
    expect([why, result]).toEqual([why, { kind: "refused", reason: "invalid-document" }]);
    expect(Object.keys(result)).toEqual(["kind", "reason"]);
    expect(isCheckpointCurrent(fileOf(value, article), capture())).toBe(false);
  }
  const valid = roomOf(value, `<p data-id="p"><span ${MARKS}="${b64encode('[{"tokens":["u"]}]')}">before</span></p>`);
  expect(valid.render()).toEqual({ kind: "refused", reason: "unknown-page-content" });
  const plain = roomOf(value, `<p data-id="p">before</p>`);
  expect(plain.render().kind).toBe("ok");
});
