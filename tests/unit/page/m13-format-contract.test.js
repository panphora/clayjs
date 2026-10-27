/**
 * @jest-environment jsdom
 */
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { identityPlugin } from "../../../src/page/model.js";
import { canon, fragmentCleaner, parseModel, project, renderModel, revOf, blocksOfValues } from "../../../src/page/projection.js";
import { createStore } from "../../../src/live/store.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { yValueOf } from "../../../src/page/ybind/provider.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { M13_CASES, NEIGHBOUR, caseOf } from "../../fixtures/page/formats/m13-cases.mjs";
import { PAGE_FORMAT, PAGE_FORMAT_EXTENSION, PAGE_FORMAT_META, PAGE_FORMAT_UPGRADE, pageFormatFloor } from "../../../src/page/format-level.js";
import { createFormatGate } from "../../../src/page/format-gate.js";
import { captureFormat, checkPageFormatAdmission } from "../../../src/server/rooms/index.js";

/**
 * The R half of an M13 cohort row. R is the writer that shipped before any floor-1 format:
 * it has no mention mark, no toc block and no title icon, and it must still carry them.
 * So R's file is opened here, a neighbouring paragraph is edited, the page is checkpointed
 * and saved, and the reopened portable HTML must hold the original semantic records — the
 * label with its mention id, the toc block's record, the heading's icon and cover — beside
 * the new text.
 *
 * The other half of the row is here as well, driven through the room's admission helper
 * and the format gate: once the document's floor is 1 every case's capture is refused to a
 * writer with no floor-1 capability, before anything is written; floor-0 text stays
 * writable by every writer; and a host that does not advertise `page-format-v1` keeps the
 * new-format command off until it does.
 */

const clean = fragmentCleaner(document);
const byId = (items) => new Map(items.map((item) => [item.id, item]));
const articleOf = (inner, rev) => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};
const find = (doc, id) => {
  let found = null;
  doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; });
  return found;
};

// R's record for one case, as R's file states it.
const fromCase = (name) => {
  const formatCase = caseOf(name);
  const value = { blocks: formatCase.blocks, deleted: {} };
  return { formatCase, value, records: blocksOfValues([value]) };
};

// This writer opens R's file: the projection, its bytes, and the checkpoint the next boot
// takes from the article alone.
const openR = ({ records }) => {
  const model = project(records);
  const article = articleOf(renderModel(model, { clean }), revOf(model));
  const seeded = blocksFromYValue(seedPageFromArticle(article));
  return { model, article, seeded };
};

// A document opened on the checkpoint, where one neighbouring paragraph is edited through
// the editor exactly as a person would.
const editNeighbour = (blocks) => {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(seedValueOf(blocks))) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  try {
    const neighbour = find(view.state.doc, NEIGHBOUR.id);
    expect(neighbour).toBeTruthy();
    view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, neighbour.pos + 1 + neighbour.node.textContent.length));
    expect(find(view.state.doc, NEIGHBOUR.id).node.textContent).toBe(NEIGHBOUR.c + NEIGHBOUR.add);
    return blocksFromYValue(yValueOf(binding.ydoc));
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
};

// The checkpoint the editor wrote, in the value form a store holds: the article is the
// source, so the seeded value is what the store keeps whatever shape the edit left.
const seedValueOf = (blocks) => {
  const model = project(blocks);
  return seedPageFromArticle(articleOf(renderModel(model, { clean }), revOf(model)));
};

// A block's place in the order is the writer's own bookkeeping and is re-derived when the
// file is opened; everything else in its record is the content this contract is about.
const withoutPos = ({ pos, ...rest }) => rest;

const marker = (floor) => `<meta name="${PAGE_FORMAT_META}" content="${floor}">`;
const pageTag = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
const fileOf = (inner, rev, value, floor = 0) =>
  `<!doctype html>\n<html>\n<head>${floor ? marker(floor) : ""}<title>t</title></head>\n<body>\n<article data-page="1" data-rev="${rev}">\n${inner}\n</article>${pageTag(value)}\n</body>\n</html>`;

// A saved page file: the article this writer renders from the records, and the page value
// the editor would capture from it.
const fileFor = (records, floor = 0, keep = null) => {
  const kept = keep ? { [keep]: records[keep] } : records;
  const model = project(kept);
  const rev = revOf(model);
  const inner = renderModel(model, { clean });
  return { html: fileOf(inner, rev, seedPageFromArticle(articleOf(inner, rev)), floor), inner, rev, model };
};

const refusal = (fn) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
};

// A host that owns the canonical floor, as the gate's adapter seam states it.
const gateHost = () => {
  const calls = { activate: 0 };
  const state = { floor: 0, admitted: [PAGE_FORMAT] };
  return {
    calls,
    state,
    async read() {
      return { floor: state.floor };
    },
    async capabilities() {
      return state.admitted;
    },
    async activate({ floor }) {
      calls.activate += 1;
      state.floor = Math.max(state.floor, floor);
      return { accepted: true, receipt: { accepted: true } };
    },
  };
};

test.each(M13_CASES.map((entry) => entry.name))(
  "R's %s is checkpointed by this writer and survives a neighbouring edit",
  (name) => {
    const { records, formatCase } = fromCase(name);
    const { model, seeded } = openR({ records });

    // R's order and R's records, as a plain open of its file states them.
    expect(Object.keys(seeded)).toEqual(Object.keys(records));
    for (const id of formatCase.keeps) expect(withoutPos(seeded[id])).toEqual(withoutPos(records[id]));

    const saved = project(editNeighbour(seeded));
    const reopened = parseModel(articleOf(renderModel(saved, { clean }), revOf(saved)));

    for (const id of formatCase.keeps) expect(withoutPos(byId(reopened).get(id))).toEqual(withoutPos(byId(project(records)).get(id)));
    expect(byId(reopened).get(NEIGHBOUR.id).c).toBe(NEIGHBOUR.c + NEIGHBOUR.add);
    expect(revOf(reopened)).toBe(revOf(saved));
  },
);

test("the mention case keeps its id and its label in one record, not two", () => {
  const { records, formatCase } = fromCase("a person mention");
  const mention = records[formatCase.keeps[0]];
  expect(mention.c.slice(0, 12)).toBe("Ada Lovelace");
  expect(mention.m).toEqual([[12, 'x["mention",{"id":"p-ada"}]'], [11, ""]]);
  // The label is ordinary text: a writer with no mention mark reads the name it shows.
  const reopened = byId(parseModel(articleOf(renderModel(project(records), { clean }), revOf(project(records)))));
  expect(reopened.get("a").c).toBe("Ada Lovelace wrote this");
});

test("the toc case is the block this runtime draws from its own record, and its whole record comes back", () => {
  const { records, formatCase } = fromCase("a table of contents block");
  const toc = records[formatCase.keeps[0]];
  expect(toc).toEqual({ t: "toc", pos: "00000002", maxLevel: 3 });
  const model = project(records);
  const item = byId(model).get("t");
  expect(item.t).toBe("toc");
  expect(item.maxLevel).toBe(3);
});

test("the title case keeps a heading a heading and its icon and cover beside it", () => {
  const { records, formatCase } = fromCase("a title heading's icon and cover");
  const heading = records[formatCase.keeps[0]];
  expect(heading.t).toBe("heading");
  expect(heading.level).toBe(1);
  const item = byId(project(records)).get("h");
  expect(item.t).toBe("heading");
  expect(item.level).toBe(1);
  expect(item.pageIcon).toBe(heading.pageIcon);
  expect(item.pageCoverSrc).toBe("/cover.jpg");
  expect(item.pageCoverY).toBe(0.25);
});

test.each(M13_CASES.map((entry) => entry.name))(
  "a writer below the floor is refused the content of %s before any mutation once the document is floor 1",
  (name) => {
    const { records } = fromCase(name);
    const capture = fileFor(records);
    // The capture needs floor 1, which is why the document rose.
    expect(captureFormat(capture.html)).toBe(1);
    const stored = fileFor(records, 1).html;
    expect(pageFormatFloor(stored)).toBe(1);

    const thrown = refusal(() => checkPageFormatAdmission({ currentHtml: stored, html: capture.html, capability: 0, admitted: [1] }));
    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe(PAGE_FORMAT_UPGRADE);
    expect(thrown.minimum).toBe(1);
    expect(thrown.statusCode).toBe(409);
    // The pre-R writer's capture is untouched: no marker was added and no floor moved.
    expect(capture.html).toBe(fileFor(records).html);
    expect(pageFormatFloor(capture.html)).toBe(0);
    expect(pageFormatFloor(stored)).toBe(1);
  },
);

test.each(M13_CASES.map((entry) => entry.name))(
  "floor-0 text stays writable by every writer in the %s row",
  (name) => {
    const { records } = fromCase(name);
    const plain = fileFor(records, 0, NEIGHBOUR.id);
    expect(captureFormat(plain.html)).toBe(0);

    for (const capability of [0, 1, undefined]) {
      const decision = checkPageFormatAdmission({ currentHtml: plain.html, html: plain.html, capability, admitted: [0, 1] });
      expect(decision).toMatchObject({ ok: true, activate: false, floor: 0 });
      // Floor-0 text gains no marker on its way out.
      expect(decision.html).toBe(plain.html);
    }
  },
);

test.each(M13_CASES.map((entry) => entry.name))(
  "a host that does not advertise page-format-v1 keeps the new-format command of the %s row off until it does",
  async (name) => {
    const adapter = gateHost();
    let advertised = false;
    const gate = createFormatGate({ host: adapter, supported: () => advertised });
    const applied = [];
    const refused = await gate.run({ apply: () => applied.push(name) });
    expect(refused).toMatchObject({ status: "unsupported-host", code: "page-format-unsupported" });
    expect(refused.extension).toBe(PAGE_FORMAT_EXTENSION);
    expect(applied).toEqual([]);
    expect(adapter.calls.activate).toBe(0);
    expect(adapter.state.floor).toBe(0);

    advertised = true;
    const once = await gate.run({ apply: () => applied.push(name) });
    expect(once.status).toBe("applied");
    expect(applied).toEqual([name]);
    expect(adapter.state.floor).toBe(PAGE_FORMAT);
    expect(gate.floor).toBe(PAGE_FORMAT);
  },
);
