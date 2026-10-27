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

/**
 * The R half of an M13 cohort row. R is the writer that shipped before any floor-1 format:
 * it has no mention mark, no toc block and no title icon, and it must still carry them.
 * So R's file is opened here, a neighbouring paragraph is edited, the page is checkpointed
 * and saved, and the reopened portable HTML must hold the original semantic records — the
 * label with its mention id, the toc block's record, the heading's icon and cover — beside
 * the new text.
 *
 * The other half of the row is not here: a writer older than R is refused once floor 1
 * activates, floor-0 text stays writable and an offline host lacks the capability until it
 * is upgraded. All three need the shared format gate and the host's capability, which do
 * not exist in this tree yet (Document 11 Step 5).
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

test("the toc case is a block this runtime cannot draw, and its whole record comes back", () => {
  const { records, formatCase } = fromCase("a table of contents block");
  const toc = records[formatCase.keeps[0]];
  expect(toc).toEqual({ t: "toc", pos: "00000002", c: "", maxLevel: 3 });
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
