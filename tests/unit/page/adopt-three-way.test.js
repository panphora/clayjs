import { blocksOfValues, project, renderModel, revOf, fragmentCleaner } from "../../../src/page/projection.js";
import { blockMap } from "../../../src/page/model.js";
import { installAdoption, readFile } from "../../../src/page/adopt-boot.js";
import { createPageEditor } from "../../../src/page/editor.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const fallbacks = (blocks) => (id) => (typeof blocks[id]?.artifact?.fallbackHtml === "string" ? blocks[id].artifact.fallbackHtml : "");

// The saved file as the save transform writes it, optionally hand-edited.
function fileOf(record, { edit = () => {}, rev = true } = {}) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = renderModel(model, { fallbackOf: fallbacks(blocks), clean: fragmentCleaner(document) });
  const revAttr = rev ? ` data-rev="${revOf(model)}"` : "";
  const page = `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(record).replace(/</g, "\\u003c")}</script></head><body><article class="page" clay="freeze" data-page="1"${revAttr}>\n${html}\n</article></body></html>`;
  const d = new DOMParser().parseFromString(page, "text/html");
  edit(d);
  return "<!DOCTYPE html>" + d.documentElement.outerHTML;
}
const read = (html) => readFile(new DOMParser().parseFromString(html, "text/html"));

const RECORD = {
  blocks: {
    h: { t: "heading", pos: "1", level: 1, c: "Title" },
    a: { t: "paragraph", pos: "2", c: "Hello world" },
    b: { t: "paragraph", pos: "3", c: "Second block" },
  },
  deleted: {},
};

describe("a hand edit is adopted as a three-way merge", () => {
  let mount, view;
  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
  });
  afterEach(() => {
    view?.destroy();
    mount.remove();
  });

  test("different words of one block are both kept", async () => {
    const current = clone(RECORD.blocks);
    current.a.c = "Hello brave world";
    view = createPageEditor(mount, { blocks: current });
    const notices = [];
    const source = read(fileOf(RECORD, { edit: (d) => { d.querySelector('[data-id="a"]').textContent = "Hello world!"; } }));
    const controller = installAdoption({ view, source, hold: () => {}, release: () => {}, notice: (n) => notices.push(n) });
    await controller.idle();
    expect(blockMap(view.state.doc).a.c).toBe("Hello brave world!");
    expect(notices).toHaveLength(1);
    expect(notices[0].conflicts).toBeUndefined();
    expect(notices[0].copy).toBeUndefined();
    controller.dispose();
  });

  test("the same words changed on both sides go to the file and keep a copy", async () => {
    const current = clone(RECORD.blocks);
    current.a.c = "Hello there";
    view = createPageEditor(mount, { blocks: current });
    const notices = [];
    const source = read(fileOf(RECORD, { edit: (d) => { d.querySelector('[data-id="a"]').textContent = "Hello friend"; } }));
    const controller = installAdoption({ view, source, hold: () => {}, release: () => {}, snapshot: () => "COPY", notice: (n) => notices.push(n) });
    await controller.idle();
    expect(blockMap(view.state.doc).a.c).toBe("Hello friend");
    expect(notices).toHaveLength(1);
    expect(notices[0].conflicts).toHaveLength(1);
    expect(notices[0].copy).toBe("COPY");
    controller.dispose();
  });

  test("a block the file deleted but the tab edited is kept", async () => {
    const current = clone(RECORD.blocks);
    current.b.c = "Second block, edited";
    view = createPageEditor(mount, { blocks: current });
    const notices = [];
    const source = read(fileOf(RECORD, { edit: (d) => { d.querySelector('[data-id="b"]').remove(); } }));
    const controller = installAdoption({ view, source, hold: () => {}, release: () => {}, snapshot: () => "COPY", notice: (n) => notices.push(n) });
    await controller.idle();
    expect(blockMap(view.state.doc).b.c).toBe("Second block, edited");
    expect(notices.every((n) => n.copy === undefined)).toBe(true);
    controller.dispose();
  });

  test("edits to different blocks are both kept", async () => {
    const current = clone(RECORD.blocks);
    current.b.c = "Second block, edited";
    view = createPageEditor(mount, { blocks: current });
    const source = read(fileOf(RECORD, { edit: (d) => { d.querySelector('[data-id="h"]').textContent = "New title"; } }));
    const controller = installAdoption({ view, source, hold: () => {}, release: () => {}, notice: () => {} });
    await controller.idle();
    expect(blockMap(view.state.doc).h.c).toBe("New title");
    expect(blockMap(view.state.doc).b.c).toBe("Second block, edited");
    controller.dispose();
  });
});
