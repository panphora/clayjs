import { jest } from "@jest/globals";

const BODY = '<p id="a">budget is over</p><div clay="no-save">secret</div>';

let conflicts;
let beginApply;
let completeApply;
let failApply;
let snapshot;
let download;
let notice;

let blobs = [];
let anchors = [];
let createObjectURL;
let revokeObjectURL;
let clickSpy;

beforeAll(async () => {
  window.clayEditMode = true;
  // The notice's one frame is a requestAnimationFrame; the harness turns it into a
  // timeout so a draw is a thing the test can wait for.
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  ({ conflicts, beginApply, completeApply, failApply } = await import("../../src/sync/conflicts.js"));
  snapshot = await import("../../src/core/snapshot.js");
  download = await import("../../src/core/conflict-download.js");
  notice = await import("../../src/core/conflict-notice.js");
  clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    anchors.push(this);
  });
});

beforeEach(() => {
  window.clay = { conflicts };
  document.body.innerHTML = BODY;
  blobs = [];
  anchors = [];
  createObjectURL = jest.fn((blob) => { blobs.push(blob); return "blob:x"; });
  revokeObjectURL = jest.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  clickSpy.mockClear();
});

afterEach(async () => {
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
  for (const rec of conflicts.list()) conflicts.acknowledge([rec.id], { reason: "accepted" });
  await new Promise((r) => setTimeout(r, 0));
  document.querySelector("[data-clay-conflict]")?.remove();
});

const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const parsed = (html) => new DOMParser().parseFromString(html, "text/html");
const blockOf = (html) => parsed(html).querySelector("#clay-lost-edits");
const payload = (html) => JSON.parse(blockOf(html).textContent);
const outside = (html) => html.replace(/<script type="application\/json" id="clay-lost-edits"[\s\S]*?<\/script>/, "");
const pageText = (html) => {
  const doc = parsed(html);
  blockOf(html).remove();
  return doc.body.textContent;
};

function peerLoss({ local, remote, ticket = 1 }) {
  const root = snapshot.captureSnapshot({ flushUndo: false });
  document.querySelector("#a").textContent = remote;
  const applyId = beginApply({ source: "peer", seq: 3, etag: "E1", domain: "sync", root });
  const [id] = completeApply(applyId, [{ kind: "text", node: document.querySelector("#a").firstChild, local, remote }], { ticket });
  return { applyId, id };
}

test("the peer lane's file is the page this tab had, with the edit listed as JSON", () => {
  const { id } = peerLoss({ local: "budget is over", remote: "budget is approved" });

  const { html, name } = download.buildRecovery([conflicts.get(id)]);

  expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  expect(pageText(html)).toContain("budget is over");
  expect(outside(html)).not.toContain("budget is approved");
  expect(outside(html)).not.toContain("secret");
  expect(payload(html).edits[0].yours.hit).toBe("budget is over");
  expect(name).toMatch(/-my-copy-\d{8}-\d{6}\.html$/);
});

test("a save-domain clone is already prepared and is written as it stands", () => {
  const { saveClone } = snapshot.captureForMerge();
  document.querySelector("#a").textContent = "budget is approved";
  const applyId = beginApply({ source: "disk", domain: "save", root: saveClone });
  const [id] = completeApply(applyId, [
    { kind: "text", node: document.querySelector("#a").firstChild, local: "budget is over", remote: "budget is approved" },
  ], { ticket: 1 });

  const { html } = download.buildRecovery([conflicts.get(id)]);

  expect(pageText(html)).toContain("budget is over");
  expect(outside(html).split("budget is over")).toHaveLength(2);
  expect(outside(html)).not.toContain("budget is approved");
  expect(outside(html)).not.toContain("secret");
});

test("with two applies the newest page is the document and the older one rides along", () => {
  document.body.innerHTML = '<p id="a">first text</p>';
  const first = snapshot.captureSnapshot({ flushUndo: false });
  document.body.innerHTML = '<p id="a">second text</p>';
  const second = snapshot.captureSnapshot({ flushUndo: false });
  document.querySelector("#a").textContent = "merged text";

  const one = beginApply({ source: "peer", domain: "sync", root: first });
  const [idOne] = completeApply(one, [{ kind: "text", node: document.querySelector("#a").firstChild, local: "first text", remote: "merged text" }], { ticket: 1 });
  const two = beginApply({ source: "peer", domain: "sync", root: second });
  const [idTwo] = completeApply(two, [{ kind: "text", node: document.querySelector("#a").firstChild, local: "second text", remote: "merged text" }], { ticket: 2 });

  const { html } = download.buildRecovery([conflicts.get(idTwo), conflicts.get(idOne)]);

  expect(pageText(html)).toContain("second text");
  expect(outside(html)).not.toContain("first text");

  const data = payload(html);
  expect(data.edits).toHaveLength(2);
  expect(data.earlierPages).toHaveLength(1);
  expect(data.earlierPages[0].applyId).toBe(one);
  expect(data.earlierPages[0].source).toBe("peer");
  expect(data.earlierPages[0].html).toContain("first text");
});

test("a value that looks like markup cannot end the JSON block early", () => {
  const nasty = "</script><!--x";
  const { saveClone } = snapshot.captureForMerge();
  const applyId = beginApply({ source: "peer", domain: "sync", root: saveClone });
  const [id] = completeApply(applyId, [
    { kind: "attr", el: document.querySelector("#a"), name: "title", local: nasty, remote: "budget" },
  ], { ticket: 1 });

  const { html } = download.buildRecovery([conflicts.get(id)]);

  expect(html).not.toContain(nasty);
  const data = JSON.parse(blockOf(html).textContent);
  expect(data.edits[0].yours.hit).toBe(nasty);
});

test("the ledger's clone comes back untouched, and two downloads agree", () => {
  const { id } = peerLoss({ local: "budget is over", remote: "budget is approved" });
  const apply = conflicts.recoveryOf(id);
  const before = apply.root.outerHTML;

  const first = download.buildRecovery([conflicts.get(id)]).html;
  const second = download.buildRecovery([conflicts.get(id)]).html;

  expect(apply.root.outerHTML).toBe(before);
  const strip = (html) => html.replace(/"savedAt":"[^"]*"/, '"savedAt":""');
  expect(strip(second)).toBe(strip(first));
});

test("a refused save downloads the live page, named as my version", () => {
  document.body.innerHTML = '<p id="a">typed after the refusal</p>';

  const { html, name } = download.buildRecovery([], { refused: true });

  expect(pageText(html)).toContain("typed after the refusal");
  expect(payload(html).refused).toBe(true);
  expect(name).toMatch(/-my-version-\d{8}-\d{6}\.html$/);
});

test("the file is named after the page", () => {
  expect(download.documentName("/writer.html")).toBe("writer");
  expect(download.documentName("/")).toBe("index");
  expect(download.documentName("/a/b/notes.htm")).toBe("notes");
});

test("a page name is decoded, and an escape that cannot be read is kept as written", () => {
  expect(download.documentName("/notes.htmlclay")).toBe("notes");
  expect(download.documentName("/My%20Notes.html")).toBe("My Notes");
  expect(download.documentName("/%E0%A4%A")).toBe("%E0%A4%A");
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const buttons = () => [...document.querySelectorAll("[data-clay-conflict] button")];
const saying = (re) => buttons().find((b) => re.test(b.textContent));

test("a refused download carries every open record, not only the rows it drew", async () => {
  const unclaimed = peerLoss({ local: "budget is over", remote: "budget is approved", ticket: 1 });
  const claimed = peerLoss({ local: "budget is over", remote: "budget is approved", ticket: 2 });
  conflicts.claim([claimed.id], { owner: "writer" });
  const failedApply = beginApply({ source: "disk", domain: "save", root: document.body.cloneNode(true) });
  const [failedId] = failApply(failedApply, new Error("morph threw"), { ticket: 3 });

  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: "another-tab", etag: "E1" } }));
  await tick();
  await tick();
  saying(/Review/).click();
  const dl = saying(/Download my copy/);
  expect(dl).toBeDefined();
  dl.click();
  await tick();

  const data = payload(await blobText(blobs[0]));

  expect(data.refused).toBe(true);
  // The claimed loss is nobody's to draw; the refusal's copy still holds it because
  // a reload after Accept theirs takes the whole ledger with it.
  const applies = data.earlierPages.map((p) => p.applyId);
  expect(applies).toHaveLength(3);
  expect(new Set(applies)).toEqual(new Set([unclaimed.applyId, claimed.applyId, failedApply]));
  expect(data.edits.map((e) => e.id)).toEqual(expect.arrayContaining([unclaimed.id, claimed.id, failedId]));

  const incomplete = data.edits.find((e) => e.kind === "apply-incomplete");
  expect(incomplete.name).toBe("Sync update that did not finish");
  expect(incomplete.error).toBe("Error: morph threw");
});

test("a refused download runs no page code and flushes no undo", () => {
  window.__ranSave = undefined;
  window.__ranSnapshot = undefined;
  document.body.innerHTML =
    '<p id="a">typed after the refusal</p>' +
    '<div onbeforesave="window.__ranSave=(window.__ranSave||0)+1">a</div>' +
    '<div onbeforesnapshot="window.__ranSnapshot=(window.__ranSnapshot||0)+1">b</div>' +
    '<div clay="no-save">secret</div>';
  const flush = jest.fn();
  window.clay.undo = { flush };

  const { html } = download.buildRecovery([], { refused: true });

  expect(pageText(html)).toContain("typed after the refusal");
  expect(window.__ranSave).toBeUndefined();
  expect(window.__ranSnapshot).toBeUndefined();
  expect(flush).not.toHaveBeenCalled();
  expect(html).not.toContain("secret");
});

test("the blob URL is revoked late, so a slow download is not cancelled", () => {
  jest.useFakeTimers();
  try {
    expect(download.downloadRecovery([])).toBe(true);

    jest.advanceTimersByTime(1000);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    jest.advanceTimersByTime(39000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  } finally {
    jest.useRealTimers();
  }
});

test("a download saves nothing, acknowledges nothing and fetches nothing", async () => {
  const { id } = peerLoss({ local: "budget is over", remote: "budget is approved" });
  const size = conflicts.size;
  window.fetch = jest.fn();

  expect(download.downloadRecovery([conflicts.get(id)])).toBe(true);

  expect(window.fetch).not.toHaveBeenCalled();
  expect(conflicts.size).toBe(size);
  expect(clickSpy).toHaveBeenCalledTimes(1);

  const anchor = anchors[0];
  expect(anchor.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  expect(anchor.download).toMatch(/-my-copy-\d{8}-\d{6}\.html$/);
  expect(anchor.href).toContain("blob:x");
  expect(document.body.contains(anchor)).toBe(false);

  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).not.toHaveBeenCalled();

  expect(await blobText(blobs[0])).toContain("budget is over");
});

test("a download that cannot be built reports failure", () => {
  URL.createObjectURL = () => { throw new Error("x"); };
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});

  expect(download.downloadRecovery([])).toBe(false);
  expect(clickSpy).not.toHaveBeenCalled();
  expect(revokeObjectURL).not.toHaveBeenCalled();

  logged.mockRestore();
});
