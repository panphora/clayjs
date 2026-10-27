/**
 * One cohort of the published-version matrix, in a process of its own.
 *
 * Step 7 of Document 11 runs every cohort in a separate child that loads its own
 * package copy, and the cohorts exchange serialized HTML, canonical JSON and
 * encoded Yjs bytes, never a ProseMirror or Yjs object. This file is that child.
 *
 *   node worker.mjs --root <package dir> [--kind package|newer] < job.json
 *
 * The job is one JSON object, `{ scenario, input }`, on stdin; the answer is one
 * JSON line on stdout,
 *
 *   { ok, runtime: { name, version, root, kind }, cases: [{ name, kind, ok, detail }], output }
 *
 * where `kind` is "positive" (the cohort did the ordinary thing) or "negative"
 * (the cohort refused what it must refuse). The matrix script fails when a child
 * reports no positive or no negative case, so a scenario cannot pass by doing
 * nothing. A negative case that does not throw is itself a failure.
 *
 * `--kind newer` runs the fixture newer writer (newer-writer.mjs) instead of a
 * package: it writes and reads floor-1 content the runtime under test has no
 * native schema for, which is how R's generic extension contract is exercised
 * before F exists.
 *
 * The `feature-` scenarios are Document 11 Step 9's half: they run the same
 * document through the published R package and this tree, one child each, and
 * cover simultaneous known and unknown formatting, a deletion and its Undo, a
 * neighbouring block edited beside the quote, a reopen without live tags, the
 * server checkpoint, the offline reader and the same-browser lane's floor
 * boundary.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIXTURES = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL("../../../../package.json", import.meta.url));

// The answer is one JSON line on stdout; a runtime's stray log line must not
// break it.
for (const name of ["log", "info", "debug", "warn"]) {
  console[name] = (...args) => process.stderr.write(`${name}: ${args.join(" ")}\n`);
}

function parseArgs(argv) {
  const flags = { root: ".", kind: "package" };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    flags[token.slice(2)] = argv[++index];
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

function installDom() {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const win = dom.window;
  globalThis.window = win;
  globalThis.document = win.document;
  for (const key of Object.getOwnPropertyNames(win)) {
    if (key in globalThis) continue;
    try { globalThis[key] = win[key]; } catch {}
  }
}

// Only the runtime's own modules: a cohort never shares a module instance with
// another cohort, because each child imports its own copy from its own root.
async function loadRuntime(root) {
  const base = pathToFileURL(path.resolve(root) + path.sep);
  const modules = new Map();
  const load = async (rel) => {
    if (!modules.has(rel)) modules.set(rel, await import(new URL(`src/${rel}`, base).href));
    return modules.get(rel);
  };
  const pkg = JSON.parse(readFileSync(new URL("package.json", base), "utf8"));
  return { root: path.resolve(root), name: pkg.name, version: pkg.version, base, load, projection: await load("page/projection.js") };
}

const cases = [];
async function record(kind, name, run) {
  try {
    const detail = await run();
    cases.push({ name, kind, ok: true, detail: detail ?? null });
  } catch (error) {
    cases.push({ name, kind, ok: false, detail: `${error?.name ?? "Error"}: ${error?.message ?? error}` });
  }
}
const positive = (name, run) => record("positive", name, run);
const negative = (name, run) => record("negative", name, async () => {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  if (!caught) throw new Error(`the cohort accepted ${JSON.stringify(name)} instead of refusing it`);
  return caught.code ?? caught.name ?? "refused";
});

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const canon = (value) =>
  Array.isArray(value) ? `[${value.map(canon).join(",")}]`
    : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canon(value[key])).join(",")}}`
      : JSON.stringify(value ?? null);

// A block's order and its key are the writer's own bookkeeping and are
// re-derived on open; everything else in its record is the content a cohort has
// to keep.
const withoutBookkeeping = ({ pos, id, ...rest }) => rest;
const marker = (floor) => (floor > 0 ? `<meta name="clay-page-format" content="${floor}">` : "");
const pageTag = (value) =>
  `<script type="application/json" merge="page" clay="live">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
const fileOf = (inner, rev, value, floor) =>
  `<!doctype html>\n<html>\n<head>${marker(floor)}<title>A page</title></head>\n<body>\n<article data-page="1" data-rev="${rev}">${inner}</article>\n${pageTag(value)}\n</body>\n</html>`;
const articleOf = (inner, rev) => {
  const article = globalThis.document.createElement("article");
  article.setAttribute("data-page", "1");
  article.setAttribute("data-rev", rev);
  article.innerHTML = inner;
  return article;
};
const articleInside = (html) => html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1];
const revInside = (html) => (html.match(/data-rev="([^"]*)"/) ?? [])[1] ?? "";
const textOf = (html) => html.replace(/<[^>]*>/g, "");

function renderArticle(rt, blocks) {
  const model = rt.projection.project(blocks);
  const clean = rt.projection.fragmentCleaner(globalThis.document);
  return { model, rev: rt.projection.revOf(model), inner: rt.projection.renderModel(model, { clean }), clean };
}

const parseArticle = (rt, inner, rev) => rt.projection.parseModel(articleOf(inner, rev));

async function updateOf(rt, value) {
  const Y = await rt.load("vendor/yjs.vendor.js");
  const { docFromValue, enc } = await rt.load("page/ybind/provider.js");
  const doc = docFromValue(value);
  const text = enc(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  return [text];
}

async function valueOfUpdates(rt, updates) {
  const Y = await rt.load("vendor/yjs.vendor.js");
  const { dec, yValueOf } = await rt.load("page/ybind/provider.js");
  const doc = new Y.Doc();
  for (const text of updates) Y.applyUpdateV2(doc, dec(text), null);
  const value = yValueOf(doc);
  doc.destroy();
  return value;
}

const blocksOfUpdates = async (rt, updates) =>
  (await rt.load("page/ybind/decode.js")).blocksFromYValue(await valueOfUpdates(rt, updates));

function keptIn(where, decoded, blocks, keeps) {
  for (const id of keeps) {
    must(decoded[id] != null, `the block ${id} is missing after ${where}`);
    must(canon(withoutBookkeeping(decoded[id])) === canon(withoutBookkeeping(blocks[id])), `the block ${id} changed through ${where}`);
  }
}

const itemsOf = (blocks) => Object.entries(blocks).map(([id, record]) => ({ id, ...record }));

// The essentials every reader of a record has to agree on: its block type, its
// text and the marks over it. Defaults a writer leaves out are not compared.
function essentials(where, items, blocks) {
  for (const [id, block] of Object.entries(blocks)) {
    const item = items.find((entry) => entry.id === id);
    must(item, `the block ${id} is missing after ${where}`);
    must(item.t === block.t, `the block ${id} came back as ${item.t} after ${where}`);
    must((item.c ?? "") === (block.c ?? ""), `the text of ${id} changed through ${where}`);
    if (block.m) must(canon(item.m ?? []) === canon(block.m), `the marks over ${id} changed through ${where}`);
  }
}

// The artifacts a floor-0 comparison needs: the article bytes a reader sees, the
// canonical model, the page value the save wire carries and its Yjs updates.
async function writeDocument(rt, blocks, malformed) {
  const written = renderArticle(rt, blocks);
  const value = (await rt.load("page/ybind/migrate.js")).migrateHybridValues([{ blocks }]);
  const updates = await updateOf(rt, value);

  const parsed = parseArticle(rt, written.inner, written.rev);
  const decoded = await blocksOfUpdates(rt, updates);
  await positive("a known mark renders and parses back with its text and marks", () => {
    essentials("a parse of the writer's own article", parsed, blocks);
    return written.rev;
  });
  await positive("the writer's own page value decodes to the same text and marks", () => {
    essentials("a decode of the writer's own page value", itemsOf(decoded), blocks);
    return Object.keys(decoded).length;
  });
  if (malformed) await negative("a malformed mark descriptor is refused", () => renderArticle(rt, malformed.blocks));
  return { articleHtml: written.inner, rev: written.rev, model: written.model, parsed, decoded, value, updates };
}

// --- scenarios -------------------------------------------------------------

async function scenarioWrite(rt, input) {
  const documented = await writeDocument(rt, input.blocks, input.malformed);
  const floor = Number(input.floor ?? 0);
  let fileHtml = fileOf(documented.articleHtml, documented.rev, documented.value, floor);
  if (floor > 0) {
    const formatLevel = await rt.load("page/format-level.js");
    fileHtml = formatLevel.withPageFormatFloor(fileHtml, floor);
    await positive("the capture carries the canonical floor marker", () => {
      must(formatLevel.pageFormatFloor(fileHtml) === floor, "the written file does not declare its floor");
      return formatLevel.pageFormatFloor(fileHtml);
    });
  }
  await positive("the saved file reads back with the same text and marks", () => {
    essentials("a reopen of the saved file", parseArticle(rt, articleInside(fileHtml), documented.rev), input.blocks);
    return documented.rev;
  });
  return { ...documented, fileHtml, floor, blocks: input.blocks };
}

async function scenarioRead(rt, input) {
  const { articleHtml, rev, expected, updates } = input;
  const output = { model: null, blocks: null };
  await positive("another cohort's article parses to the model that cohort wrote", () => {
    const parsed = parseArticle(rt, articleHtml, rev);
    must(canon(parsed) === canon(expected), "the other cohort's article parsed to a different model");
    output.model = parsed;
    return parsed.length;
  });
  if (updates) {
    await positive("another cohort's Yjs updates decode to the blocks that cohort wrote", async () => {
      const decoded = await blocksOfUpdates(rt, updates);
      must(canon(decoded) === canon(input.expectedBlocks), "the other cohort's updates decoded to different blocks");
      output.blocks = decoded;
      return Object.keys(decoded).length;
    });
  }
  if (rt.projection.OPAQUE) {
    await negative("an article with an unreadable envelope is refused", () =>
      parseArticle(rt, '<p data-id="p" data-clay-page-opaque="1" data-clay-page-value="!!not-base64!!">x</p>', "rev"));
  }
  await negative("a malformed mark descriptor is refused on the way in", () =>
    renderArticle(rt, { p: { t: "paragraph", pos: "00000001", c: "abc", m: [[3, 'x["underline"']] } }));
  return output;
}

// A cohort without a floor of its own has to refuse floor-1 content instead of
// dropping it; a cohort with one has to keep every record.
async function scenarioReadNewer(rt, input) {
  const { blocks, articleHtml, rev, updates, keeps } = input;
  if (keeps) {
    await positive("floor-1 content is kept, records and all", async () => {
      const decoded = await blocksOfUpdates(rt, updates);
      const model = parseArticle(rt, articleHtml, rev);
      const projected = rt.projection.project(blocks);
      for (const id of keeps) {
        must(canon(withoutBookkeeping(decoded[id])) === canon(withoutBookkeeping(blocks[id])), `the block ${id} was not kept through the Yjs decode`);
        must(canon(model.find((item) => item.id === id)) === canon(projected.find((item) => item.id === id)),
          `the block ${id} was not kept through the article`);
      }
      return keeps;
    });
  } else {
    await negative("floor-1 content is refused rather than dropped", async () => {
      await blocksOfUpdates(rt, updates);
    });
  }
  await negative("a malformed mark descriptor is refused", () =>
    renderArticle(rt, { p: { t: "paragraph", pos: "00000001", c: "abc", m: [[3, 'x["underline"']] } }));
  return { keeps: keeps ?? null };
}

async function scenarioAdmit(rt, input) {
  const { currentHtml, html, capability, admitted, floorZeroHtml } = input;
  const { checkPageFormatAdmission } = await rt.load("server/rooms/index.js");
  const { pageFormatFloor } = await rt.load("page/format-level.js");
  const output = {
    refusal: null,
    decision: null,
    currentHtml,
    html,
    floors: { current: pageFormatFloor(currentHtml), capture: pageFormatFloor(html) },
    readable: null,
  };

  await negative("a writer below the floor is refused before mutation", () => {
    try {
      checkPageFormatAdmission({ currentHtml, html, capability, admitted });
    } catch (error) {
      output.refusal = { code: error.code, minimum: error.minimum, statusCode: error.statusCode, message: error.message };
      throw error;
    }
  });
  await positive("an ordinary floor-0 capture stays writable", () => {
    const answer = checkPageFormatAdmission({ currentHtml: floorZeroHtml, html: floorZeroHtml, capability: 0, admitted: [0, 1] });
    must(answer.ok && answer.floor === 0, "a floor-0 capture was not admitted");
    must(answer.html === floorZeroHtml, "a floor-0 capture gained a marker");
    output.decision = { ok: answer.ok, activate: answer.activate, floor: answer.floor };
    return answer.floor;
  });
  await positive("the stored file still renders readable HTML", () => {
    const items = parseArticle(rt, articleInside(currentHtml), revInside(currentHtml));
    const blocks = {};
    items.forEach((item, index) => { blocks[item.id] = { ...item, pos: String(index + 1).padStart(8, "0") }; });
    const readable = renderArticle(rt, blocks);
    output.readable = readable.inner;
    const text = textOf(readable.inner);
    for (const wanted of input.visible ?? []) must(text.includes(wanted), `the stored file no longer shows ${JSON.stringify(wanted)}`);
    must(readable.inner.length > 0, "the stored file has no readable article");
    return readable.rev;
  });
  return output;
}

async function scenarioPreserve(rt, input) {
  const { blocks, articleHtml, rev, keeps } = input;
  const neighbour = input.neighbour ?? {};
  const { migrateHybridValues, seedPageFromArticle } = await rt.load("page/ybind/migrate.js");
  const { blocksFromYValue } = await rt.load("page/ybind/decode.js");
  const { yValueOf, enc } = await rt.load("page/ybind/provider.js");
  const Y = await rt.load("vendor/yjs.vendor.js");
  const { createStore } = await rt.load("live/store.js");
  const { createYPageBinding } = await rt.load("page/ybind/index.js");
  const { identityPlugin } = await rt.load("page/model.js");
  const { state: pmState, view: pmView } = await rt.load("vendor/prosemirror.vendor.js");
  const output = { stages: {} };

  await positive("a tagless reopen of the newer article keeps every unknown record", () => {
    const seeded = blocksFromYValue(seedPageFromArticle(articleOf(articleHtml, rev)));
    keptIn("a tagless reopen", seeded, blocks, keeps);
    output.stages.reopened = seeded;
    return Object.keys(seeded).length;
  });

  await positive("migrating the reopened value keeps every unknown record", () => {
    const items = parseArticle(rt, articleHtml, rev);
    const reopened = {};
    items.forEach((item, index) => { reopened[item.id] = { ...item, pos: String(index + 1).padStart(8, "0") }; });
    const migrated = blocksFromYValue(migrateHybridValues([{ blocks: reopened }]));
    keptIn("migration", migrated, blocks, keeps);
    output.stages.migrated = migrated;
    return Object.keys(migrated).length;
  });

  const value = migrateHybridValues([{ blocks }]);
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = globalThis.document.body.appendChild(globalThis.document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (transaction) => binding.dispatch(transaction),
  });
  binding.attach(view);
  try {
    await positive("a neighbouring paragraph edits beside the unknown records", () => {
      let found = null;
      view.state.doc.forEach((node, offset) => { if (!found && node.attrs.id === neighbour.id) found = { node, offset }; });
      must(found, "the neighbour block is missing from the binding");
      view.dispatch(view.state.tr.insertText(neighbour.add, found.offset + 1 + found.node.textContent.length));
      const edited = blocksFromYValue(yValueOf(binding.ydoc));
      must(edited[neighbour.id].c === blocks[neighbour.id].c + neighbour.add, "the neighbouring edit did not land");
      keptIn("the neighbouring edit", edited, blocks, keeps);
      output.stages.edited = edited;
      output.editedUpdates = [enc(Y.encodeStateAsUpdateV2(binding.ydoc))];
      return edited[neighbour.id].c;
    });
    await positive("Undo restores the neighbour and still keeps every unknown record", () => {
      must(binding.undo() === true, "Undo did not run");
      const undone = blocksFromYValue(yValueOf(binding.ydoc));
      must(undone[neighbour.id].c === blocks[neighbour.id].c, "Undo did not restore the neighbour text");
      keptIn("Undo", undone, blocks, keeps);
      output.stages.undone = undone;
      return undone[neighbour.id].c;
    });
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }

  await positive("the server checkpoint writes the unknown records back into the article", async () => {
    const { createRooms } = await rt.load("server/rooms/index.js");
    const { captureCheckpoint, renderCheckpoint } = await rt.load("server/checkpoint/index.js");
    const edited = output.stages.edited;
    const written = renderArticle(rt, edited);
    const source = fileOf(written.inner, written.rev, await valueOfUpdates(rt, output.editedUpdates), 1);
    const rooms = createRooms({ newEpoch: () => "compat-checkpoint" });
    const room = rooms.open("/page.html", source, { nodeId: "node-1" });
    must(room, "the room did not open");
    const capture = captureCheckpoint(room, { nodeId: "node-1", roomKey: "/page.html" });
    const { JSDOM } = require("jsdom");
    const checkpoint = renderCheckpoint(source, capture, { createDocument: () => new JSDOM("").window.document });
    must(checkpoint.kind === "ok", `the checkpoint refused the page: ${checkpoint.reason}`);
    const reopened = blocksFromYValue(seedPageFromArticle(articleOf(articleInside(checkpoint.html), revInside(checkpoint.html))));
    keptIn("the checkpoint", reopened, blocks, keeps);
    must(reopened[neighbour.id].c === edited[neighbour.id].c, "the checkpointed article lost the neighbour edit");
    output.checkpointHtml = checkpoint.html;
    output.stages.checkpoint = reopened;
    return checkpoint.revision ?? checkpoint.kind;
  });
  return output;
}

async function scenarioOffline(rt, input) {
  const { fileHtml, blocks } = input;
  const { OPAQUE, VALUE } = rt.projection;
  const output = { fallback: null, envelopes: {}, refused: [] };
  const article = articleInside(fileHtml);
  const rev = revInside(fileHtml);

  await positive("a newer saved file reads without the page tag and shows its fallback", () => {
    const withoutTags = fileHtml.replace(/<script\b[^>]*\bclay="live"[^>]*>[\s\S]*?<\/script>/g, "");
    must(!/clay="live"/.test(withoutTags), "a live page tag survived the reader's view");
    must(/data-rev="/.test(withoutTags), "the reader lost the article");
    const items = parseArticle(rt, articleInside(withoutTags), rev);
    const opaque = items.find((item) => item.t === "future_block");
    must(opaque, "the reader lost the block it cannot draw");
    const text = opaque.c ?? "";
    must(text.length > 0, "the block the reader cannot draw has no readable fallback");
    must(textOf(article).includes(text), "the readable fallback is not what the article shows");
    output.fallback = text;
    return text;
  });

  await positive("the inert envelope carries the whole record", () => {
    const records = [...article.matchAll(new RegExp(`${OPAQUE}="1" ${VALUE}="([A-Za-z0-9_-]+)"`, "g"))]
      .map((match) => JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")));
    must(records.length > 0, "the article has no envelope");
    output.envelopes = Object.fromEntries(records.map((record) => [record.t, record]));
    const record = output.envelopes.future_block;
    must(record, "no envelope carries the block the reader cannot draw");
    must(record.maxLevel === 3 && (record.c ?? null) === output.fallback, "the envelope did not carry the whole record");
    return canon(record);
  });

  await positive("a command that would rewrite the block is refused, not performed", async () => {
    const { canTurnInto, REFUSED } = await rt.load("page/items.js");
    const { createStore } = await rt.load("live/store.js");
    const { createYPageBinding } = await rt.load("page/ybind/index.js");
    const { migrateHybridValues } = await rt.load("page/ybind/migrate.js");
    const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(migrateHybridValues([{ blocks }]))) });
    const binding = createYPageBinding({ store, captureTimeout: 0 });
    try {
      const refused = [];
      const allowed = [];
      binding.doc().forEach((node) => {
        if (canTurnInto(node, { type: "heading" })) allowed.push(node.attrs.id);
        else refused.push(node.attrs.id);
      });
      output.refused = refused;
      must(refused.includes("t"), "the block the runtime cannot draw was not refused a rewrite");
      must(allowed.includes("z"), "an ordinary paragraph was refused a rewrite it can carry");
      must(REFUSED.code === "unsupported-format", "a refusal no longer names the format it cannot carry");
      return refused;
    } finally {
      binding.dispose();
      binding.ydoc.destroy();
    }
  });

  const { pageFormatFloor } = await rt.load("page/format-level.js");
  await positive("the reader leaves the newer file's floor as it found it", () => {
    must(pageFormatFloor(fileHtml) === 1, "the newer file lost its floor marker");
    return pageFormatFloor(fileHtml);
  });
  await negative("an envelope that is not canonical JSON is refused", () =>
    parseArticle(rt, '<p data-id="p" data-clay-page-opaque="1" data-clay-page-value="!!not-base64!!">x</p>', "rev"));
  return output;
}

async function scenarioInvalid(rt, input) {
  const { fileHtml, updates } = input;
  const { blocksFromPageValues } = await rt.load("page/ybind/decode.js");
  const { dec, yValueOf } = await rt.load("page/ybind/provider.js");
  const Y = await rt.load("vendor/yjs.vendor.js");
  const output = { refusals: [], before: null, after: null, source: fileHtml, sourceAfter: fileHtml, unchangedBytes: null };

  await negative("an invalid Yjs update is refused", () => {
    try {
      blocksFromPageValues([{ v: 1, g: [], y: { flow: "zzz" } }]);
    } catch (error) {
      output.refusals.push({ input: "update", code: error.code ?? null, name: error.name });
      throw error;
    }
  });
  await negative("a page value that is not version 1 is refused", () => {
    try {
      blocksFromPageValues([{ v: 2 }]);
    } catch (error) {
      output.refusals.push({ input: "value", code: error.code ?? null, name: error.name });
      throw error;
    }
  });
  await negative("an envelope holding bytes that are not JSON is refused", () => {
    try {
      parseArticle(rt, '<p data-id="p" data-clay-page-opaque="1" data-clay-page-value="!!not-base64!!">x</p>', "rev");
    } catch (error) {
      output.refusals.push({ input: "envelope", code: error.code ?? null, name: error.name });
      throw error;
    }
  });

  await positive("an invalid update adopts nothing and leaves the source as it was", () => {
    const tag = JSON.parse(new RegExp('<script[^>]*merge="page"[^>]*>([\\s\\S]*?)</script>').exec(fileHtml)[1]);
    output.before = blocksFromPageValues([tag]);
    const doc = new Y.Doc();
    for (const text of updates) Y.applyUpdateV2(doc, dec(text), null);
    const before = Buffer.from(Y.encodeStateAsUpdateV2(doc)).toString("base64");
    let refused = false;
    try {
      Y.applyUpdateV2(doc, dec("zzzzzzzz"), null);
    } catch {
      refused = true;
    }
    const after = Buffer.from(Y.encodeStateAsUpdateV2(doc)).toString("base64");
    must(refused, "an invalid update was applied instead of refused");
    must(before === after, "an invalid update changed the document it was refused");
    output.unchangedBytes = before === after;
    output.after = blocksFromPageValues([yValueOf(doc)]);
    must(canon(output.before) === canon(output.after), "the refused update changed the decoded document");
    must(fileHtml === output.sourceAfter, "the source file changed");
    doc.destroy();
    return Object.keys(output.before).length;
  });
  return output;
}

async function scenarioNewerSave(rt) {
  const newer = await import(new URL("newer-writer.mjs", import.meta.url).href);
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "newer-format.json"), "utf8"));
  const blocks = newer.newerBlocks(manifest);
  const written = renderArticle(rt, blocks);
  const value = (await rt.load("page/ybind/migrate.js")).migrateHybridValues([{ blocks }]);
  const updates = await updateOf(rt, value);
  const formatLevel = await rt.load("page/format-level.js");
  const fileHtml = formatLevel.withPageFormatFloor(fileOf(written.inner, written.rev, value, manifest.floor), manifest.floor);

  await positive("the newer writer declares the floor its formats need", () => {
    must(formatLevel.pageFormatFloor(fileHtml) === manifest.floor, "the newer file does not declare its floor");
    must(formatLevel.requiredPageFormat(written.model) === manifest.floor, "the newer content does not need its floor");
    return formatLevel.requiredPageFormat(written.model);
  });
  await positive("the newer writer's own file reads back to its records", () => {
    const parsed = parseArticle(rt, written.inner, written.rev);
    for (const id of manifest.keeps) {
      must(canon(parsed.find((item) => item.id === id)) === canon(written.model.find((item) => item.id === id)),
        `the newer writer lost its own record ${id}`);
    }
    return manifest.keeps;
  });
  await negative("malformed newer content is refused", () => {
    newer.assertRecord(manifest.malformed.blocks.p);
    renderArticle(rt, manifest.malformed.blocks);
  });
  return {
    blocks,
    model: written.model,
    articleHtml: written.inner,
    rev: written.rev,
    value,
    updates,
    fileHtml,
    keeps: manifest.keeps,
    neighbour: manifest.neighbour,
    floor: manifest.floor,
  };
}

async function scenarioNewerVerify(rt, input) {
  const newer = await import(new URL("newer-writer.mjs", import.meta.url).href);
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "newer-format.json"), "utf8"));
  const output = { records: {}, neighbour: null };
  const read = () => newer.readNewer(rt.projection, articleOf(articleInside(input.fileHtml), revInside(input.fileHtml)), manifest);
  const projected = rt.projection.project(newer.newerBlocks(manifest));

  await positive("the newer writer still reads its own records in R's checkpointed file", () => {
    const items = read();
    for (const id of manifest.keeps) {
      must(items.get(id), `the newer writer cannot find its record ${id}`);
      must(canon(items.get(id)) === canon(projected.find((item) => item.id === id)), `the newer writer read a different record for ${id}`);
      output.records[id] = items.get(id);
    }
    return manifest.keeps;
  });
  await positive("the neighbour edit R made is visible to the newer writer", () => {
    const neighbour = read().get(manifest.neighbour.id);
    must(neighbour, "the neighbour block is missing");
    must(neighbour.c === manifest.neighbour.c + manifest.neighbour.add, "the neighbour edit did not survive");
    output.neighbour = neighbour.c;
    return neighbour.c;
  });
  await negative("the newer writer refuses a malformed record of its own format", () => newer.assertRecord(manifest.malformed.blocks.p));
  return output;
}

// --- Document 11 Step 9: real R and real F in one matrix ---------------------

// A file as a reader without the editor sees it: no live page tag.
const liveTagged = (html) => html.replace(/<script\b[^>]*\bclay="live"[^>]*>[\s\S]*?<\/script>/g, "");

// One page open on the page value's own records, the way the editor opens it:
// no article, so nothing a writer's markup would hide can come between them.
async function openPage(rt, blocks) {
  const { migrateHybridValues } = await rt.load("page/ybind/migrate.js");
  const { createStore } = await rt.load("live/store.js");
  const { createYPageBinding } = await rt.load("page/ybind/index.js");
  const { identityPlugin } = await rt.load("page/model.js");
  const { state: pmState, view: pmView } = await rt.load("vendor/prosemirror.vendor.js");
  const value = migrateHybridValues([{ blocks }]);
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = globalThis.document.body.appendChild(globalThis.document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (transaction) => binding.dispatch(transaction),
  });
  binding.attach(view);
  const find = (id) => {
    let found = null;
    view.state.doc.forEach((node, offset) => { if (!found && node.attrs.id === id) found = { node, offset }; });
    return found;
  };
  const close = () => {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  };
  return { binding, view, find, close };
}

// What one cohort makes of another cohort's saved file: its page value read as
// records, its article read as a reader without the editor reads it, and the
// floor its content really needs.
async function scenarioFeatureRead(rt, input) {
  const { blocks, keeps, updates, fileHtml, floor, malformed } = input;
  const output = { records: null, floor: null, text: null };
  await positive("the page value's Yjs updates decode to the writer's whole record", async () => {
    const decoded = await blocksOfUpdates(rt, updates);
    keptIn("the page value", decoded, blocks, keeps);
    output.records = decoded;
    return keeps.join(",");
  });
  await positive("the saved file reads without its live tag and shows every block's text", () => {
    const withoutTags = liveTagged(fileHtml);
    must(!/clay="live"/.test(withoutTags), "a live page tag survived the reader's view");
    const shown = textOf(articleInside(withoutTags));
    for (const [id, block] of Object.entries(blocks)) {
      must(shown.includes(block.c ?? ""), `the reader no longer shows ${JSON.stringify(block.c)} for ${id}`);
    }
    output.text = Object.keys(blocks).length;
    return `${output.text} blocks`;
  });
  await positive("the content's floor is the one the file declares", async () => {
    const { requiredPageFormat, pageFormatFloor } = await rt.load("page/format-level.js");
    must(pageFormatFloor(fileHtml) === floor, `the file declares floor ${pageFormatFloor(fileHtml)}`);
    const required = requiredPageFormat(rt.projection.project(output.records));
    must(required === floor, `the records need floor ${required}`);
    output.floor = required;
    return required;
  });
  if (malformed) await negative("a malformed named descriptor is refused", () => renderArticle(rt, malformed.blocks));
  return output;
}

// The ordinary editing flow on another cohort's document: a neighbouring block
// edited beside the quote, Undo, a deletion inside the marked text and its Undo,
// the command the runtime cannot carry, and the server checkpoint of the result.
async function scenarioFeatureEdit(rt, input) {
  const { blocks, keeps, neighbour, quote, marked, malformed } = input;
  const { blocksFromYValue } = await rt.load("page/ybind/decode.js");
  const { yValueOf, enc } = await rt.load("page/ybind/provider.js");
  const Y = await rt.load("vendor/yjs.vendor.js");
  const { canTurnInto } = await rt.load("page/items.js");
  const knows = "quote" in rt.projection.DEFAULTS;
  const kept = keeps.filter((id) => id !== neighbour.id);
  const page = await openPage(rt, blocks);
  const output = { stages: {}, knows, refused: [] };
  const records = () => blocksFromYValue(yValueOf(page.binding.ydoc));
  try {
    await positive("a neighbouring block edited beside the quote keeps every record", () => {
      const at = page.find(neighbour.id);
      must(at, "the neighbour block is missing");
      page.view.dispatch(page.view.state.tr.insertText(neighbour.add, at.offset + 1 + at.node.textContent.length));
      const edited = records();
      must(edited[neighbour.id].c === blocks[neighbour.id].c + neighbour.add, "the neighbouring edit did not land");
      keptIn("the neighbouring edit", edited, blocks, kept);
      output.stages.edited = edited;
      output.editedUpdates = [enc(Y.encodeStateAsUpdateV2(page.binding.ydoc))];
      return edited[neighbour.id].c;
    });
    await positive("Undo restores the neighbour and keeps every record", () => {
      must(page.binding.undo() === true, "Undo did not run");
      const undone = records();
      must(undone[neighbour.id].c === blocks[neighbour.id].c, "Undo did not restore the neighbour text");
      keptIn("Undo", undone, blocks, kept);
      output.stages.undone = undone;
      return undone[neighbour.id].c;
    });
    await positive("a deletion inside the marked text and Undo restore the whole record", () => {
      const at = page.find(marked);
      must(at, `the block ${marked} is missing`);
      const from = at.offset + 1;
      page.view.dispatch(page.view.state.tr.delete(from, from + 2));
      const cut = records();
      const expected = blocks[marked].c.slice(2);
      must(cut[marked].c === expected, `the deletion left ${JSON.stringify(cut[marked]?.c)}`);
      must(page.binding.undo() === true, "Undo did not run");
      const back = records();
      must(back[marked].c === blocks[marked].c, "Undo did not restore the deleted text");
      keptIn("the deletion and its Undo", back, blocks, kept);
      output.stages.deleted = cut;
      output.stages.restored = back;
      return `${JSON.stringify(cut[marked].c)} then ${JSON.stringify(back[marked].c)}`;
    });
    if (knows) {
      await positive("a runtime with the native block may rewrite the quote", () => {
        const at = page.find(quote);
        must(at, "the quote block is missing");
        must(canTurnInto(at.node, { type: "paragraph" }) === true, "the native quote was refused a rewrite");
        return "rewritable";
      });
    } else {
      await positive("the block the runtime cannot draw is refused a rewrite and a deletion", () => {
        const at = page.find(quote);
        must(at, "the quote block is missing");
        must(canTurnInto(at.node, { type: "paragraph" }) === false, "the opaque block was allowed a rewrite");
        output.refused.push(quote);
        const before = canon(records());
        page.view.dispatch(page.view.state.tr.delete(at.offset, at.offset + at.node.nodeSize));
        must(canon(records()) === before, "the opaque block was deleted instead of refused");
        return `${quote}: no rewrite, no deletion`;
      });
    }
    if (malformed) await negative("a malformed named descriptor is refused", () => renderArticle(rt, malformed.blocks));

    await positive("the server checkpoint writes the edited records back into the article", async () => {
      const { createRooms } = await rt.load("server/rooms/index.js");
      const { captureCheckpoint, renderCheckpoint } = await rt.load("server/checkpoint/index.js");
      const { seedPageFromArticle } = await rt.load("page/ybind/migrate.js");
      const edited = output.stages.edited;
      const written = renderArticle(rt, edited);
      const source = fileOf(written.inner, written.rev, await valueOfUpdates(rt, output.editedUpdates), input.floor ?? 1);
      const rooms = createRooms({ newEpoch: () => "compat-feature" });
      const room = rooms.open("/page.html", source, { nodeId: "node-1" });
      must(room, "the room did not open");
      const capture = captureCheckpoint(room, { nodeId: "node-1", roomKey: "/page.html" });
      const { JSDOM } = require("jsdom");
      const checkpoint = renderCheckpoint(source, capture, { createDocument: () => new JSDOM("").window.document });
      must(checkpoint.kind === "ok", `the checkpoint refused the page: ${checkpoint.reason}`);
      const reopened = blocksFromYValue(seedPageFromArticle(articleOf(articleInside(checkpoint.html), revInside(checkpoint.html))));
      keptIn("the checkpoint", reopened, edited, kept);
      must(reopened[neighbour.id].c === edited[neighbour.id].c, "the checkpointed article lost the neighbour edit");
      output.checkpointHtml = checkpoint.html;
      output.stages.checkpoint = reopened;
      return checkpoint.revision ?? checkpoint.kind;
    });
  } finally {
    page.close();
  }
  return output;
}

// Save, strip every live tag, reopen: what a reader without the editor keeps.
async function scenarioFeatureTagless(rt, input) {
  const { blocks, keeps, fileHtml, exact } = input;
  const { seedPageFromArticle } = await rt.load("page/ybind/migrate.js");
  const { blocksFromYValue } = await rt.load("page/ybind/decode.js");
  const output = { reopened: null };
  await positive("a reopen without live tags keeps every block and its text", () => {
    const withoutTags = liveTagged(fileHtml);
    must(!/clay="live"/.test(withoutTags), "a live page tag survived the reopen");
    const reopened = blocksFromYValue(seedPageFromArticle(articleOf(articleInside(withoutTags), revInside(withoutTags))));
    output.reopened = reopened;
    const shown = textOf(renderArticle(rt, reopened).inner);
    for (const [id, block] of Object.entries(blocks)) {
      must(reopened[id] != null, `the block ${id} is missing after the tagless reopen`);
      must(shown.includes(block.c ?? ""), `the block ${id} lost its text`);
    }
    return Object.keys(reopened).length;
  });
  if (exact) {
    await positive("the reopen gives back the writer's whole record", () => {
      keptIn("a tagless reopen", output.reopened, blocks, keeps);
      return keeps.join(",");
    });
  }
  return output;
}

// The document read where the host's pinned offline runtime reads it.
async function scenarioFeatureOffline(rt, input) {
  const { blocks, fileHtml, floor } = input;
  const output = { blocks: null, floor: null };
  await positive("the saved file reads without its live tag and shows every block's text", () => {
    const withoutTags = liveTagged(fileHtml);
    must(!/clay="live"/.test(withoutTags), "a live page tag survived the reader's view");
    const shown = textOf(articleInside(withoutTags));
    for (const [id, block] of Object.entries(blocks)) {
      must(shown.includes(block.c ?? ""), `the reader no longer shows ${JSON.stringify(block.c)} for ${id}`);
    }
    output.blocks = Object.keys(blocks).length;
    return `${output.blocks} blocks`;
  });
  await positive("the reader leaves the file's floor marker as it found it", async () => {
    const { pageFormatFloor } = await rt.load("page/format-level.js");
    must(pageFormatFloor(fileHtml) === floor, `the file declares floor ${pageFormatFloor(fileHtml)}`);
    output.floor = floor;
    return floor;
  });
  await negative("an envelope that is not canonical JSON is refused", () =>
    parseArticle(rt, '<p data-id="p" data-clay-page-opaque="1" data-clay-page-value="!!not-base64!!">x</p>', "rev"));
  return output;
}

// The same-browser lane's floor boundary: floor 1 moves every tab to a channel
// of its own, so a tab that cannot read floor 1 never sees a future-format frame.
async function scenarioFeatureChannel(rt, input) {
  const pagePath = input.path ?? "/page.html";
  const { localLaneKey, FORMAT_SCOPE } = await rt.load("live/local-lane.js");
  const { localChannel } = await rt.load("live/local-channel.js");
  const output = { before: null, after: null };
  const later = async (check, ms = 2000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return check();
  };
  await positive("the floor-1 transition opens a channel of its own", () => {
    output.before = localLaneKey(0, pagePath);
    output.after = localLaneKey(1, pagePath);
    must(output.before === `clay-live:${pagePath}`, `the floor-0 scope is ${output.before}`);
    must(output.after === `clay-live:${pagePath}:${FORMAT_SCOPE}`, `the floor-1 scope is ${output.after}`);
    must(FORMAT_SCOPE === "page-format:1", `the transition scope is ${FORMAT_SCOPE}`);
    must(localLaneKey(2, pagePath) === output.after, "a higher floor left the scope");
    return output.after;
  });
  await positive("a tab left on the old scope never receives a future-format frame", async () => {
    const oldTab = localChannel(output.before);
    const oldPeer = localChannel(output.before);
    const newTab = localChannel(output.after);
    const newPeer = localChannel(output.after);
    const old = [];
    const next = [];
    const released = [
      oldTab.subscribe("durable", (data) => old.push(data)),
      oldPeer.subscribe("durable", () => {}),
      newTab.subscribe("durable", (data) => next.push(data)),
      newPeer.subscribe("durable", () => {}),
    ];
    try {
      oldPeer.post({ type: "live", frame: "floor-zero" });
      must(await later(() => old.length >= 1), "the old scope delivered nothing at all");
      newPeer.post({ type: "live", frame: "floor-one" });
      must(await later(() => next.length >= 1), "the new scope delivered nothing to its own tab");
      must(!old.some((data) => data.frame === "floor-one"), "the old scope received the future-format frame");
      must(old.every((data) => data.v === 4), "the wire version changed inside the scope");
      must(next.every((data) => data.frame === "floor-one"), "the new scope received the old scope\u0027s frame");
      return `${old.length} old, ${next.length} new`;
    } finally {
      for (const release of released) release();
    }
  });
  return output;
}

const SCENARIOS = {
  write: scenarioWrite,
  read: scenarioRead,
  "read-newer": scenarioReadNewer,
  admit: scenarioAdmit,
  preserve: scenarioPreserve,
  offline: scenarioOffline,
  invalid: scenarioInvalid,
  "newer-save": scenarioNewerSave,
  "newer-verify": scenarioNewerVerify,
  "feature-read": scenarioFeatureRead,
  "feature-edit": scenarioFeatureEdit,
  "feature-tagless": scenarioFeatureTagless,
  "feature-offline": scenarioFeatureOffline,
  "feature-channel": scenarioFeatureChannel,
};

async function main() {
  installDom();
  const job = JSON.parse(readFileSync(0, "utf8"));
  const scenario = SCENARIOS[job.scenario];
  if (!scenario) throw new RangeError(`page compat: no scenario ${JSON.stringify(job.scenario)}`);
  const rt = await loadRuntime(flags.root);
  if (flags.kind === "newer") rt.name = "fixture newer writer";
  const output = await scenario(rt, job.input ?? {});
  const ok = cases.every((entry) => entry.ok);
  process.stdout.write(JSON.stringify({ ok, runtime: { name: rt.name, version: rt.version, root: rt.root, kind: flags.kind }, cases, output }) + "\n");
}

await main();
