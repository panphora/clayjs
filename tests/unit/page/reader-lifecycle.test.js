import { jest } from "@jest/globals";

const streams = [];
let toolsEvaluated = false;

jest.unstable_mockModule("../../../src/sync/saved-stream.js", () => ({
  createSavedStream: (options) => {
    const handle = {
      options,
      started: false,
      stopped: false,
      ready: Promise.resolve(null),
      represented: options.represented,
      adopt(callbacks = {}) {
        Object.assign(options, callbacks);
        return handle;
      },
      start() { this.started = true; return this; },
      stop() { this.stopped = true; },
    };
    streams.push(handle);
    return handle;
  },
}));

jest.unstable_mockModule("../../../src/page/tools.js", () => {
  toolsEvaluated = true;
  return {
    createToolHost: () => ({
      mount(root, options) {
        root.setAttribute("data-mounted", options.id);
        return { dispose() { root.removeAttribute("data-mounted"); } };
      },
      dispose() {},
    }),
  };
});

let start;
let claim;
beforeAll(async () => {
  ({ start } = await import("../../../src/page/view.js"));
  ({ claim } = await import("../../../src/page/runtime-owner.js"));
});
beforeEach(() => {
  streams.length = 0;
  toolsEvaluated = false;
});

const FILE = (inner, { rev = "r1", title = "Reader" } = {}) =>
  `<!doctype html><html><head><title>${title}</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}">${inner}</article></body></html>`;

const load = (html) => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  return document.querySelector("article");
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const deliver = (candidate) => streams[streams.length - 1].options.onSnapshot(candidate);

test("start applies the represented bytes synchronously and stop returns that exact receipt", () => {
  load(FILE('<p data-id="a">Saved A</p>'));
  const bytes = FILE('<p data-id="a">Receipt A</p>', { title: "Receipt A" });
  const reader = start({ represented: { bytes, etag: "etag-a", seq: 7 } });
  const article = document.querySelector("article");
  expect(article.querySelector('[data-id="a"]').textContent).toBe("Receipt A");
  expect(document.title).toBe("Receipt A");
  expect(streams).toHaveLength(1);
  expect(streams[0].represented).toEqual({ bytes, etag: "etag-a", seq: 7 });
  expect(streams[0].started).toBe(true);

  const stopped = reader.stop();
  expect(stopped).toEqual({ bytes, etag: "etag-a", seq: 7 });
  expect(Object.isFrozen(stopped)).toBe(true);
  expect(reader.stop()).toBe(stopped);
  expect(streams[0].stopped).toBe(true);
  expect(article.querySelector('[data-id="a"]').textContent).toBe("Receipt A");
});

test("a frame after start applies, and the receipt is recorded before the status event", () => {
  load(FILE('<p data-id="a">Boot</p>'));
  const bytes = FILE('<p data-id="a">Applied B</p>');
  const reader = start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: "etag-a", seq: 1 } });
  let seen = null;
  document.addEventListener("clay:reader-status", () => { seen = reader.represented; }, { once: true });
  expect(deliver({ bytes, etag: "etag-b", seq: 2 })).toBe(true);
  expect(document.querySelector('[data-id="a"]').textContent).toBe("Applied B");
  expect(seen).toEqual({ bytes, etag: "etag-b", seq: 2 });
  expect(reader.stop()).toEqual({ bytes, etag: "etag-b", seq: 2 });
});

test("stop during a pending apply returns the previous receipt and the continuation is inert", () => {
  const a = FILE('<p data-id="a">A</p>');
  load(a);
  const reader = start({ represented: { bytes: a, etag: "etag-a", seq: 1 } });
  reader.stop();
  const b = FILE('<p data-id="a">B</p>');
  expect(deliver({ bytes: b, etag: "etag-b", seq: 2 })).toBe(false);
  expect(document.querySelector('[data-id="a"]').textContent).toBe("A");
  expect(reader.stop()).toEqual({ bytes: a, etag: "etag-a", seq: 1 });
});

test("a native apply failure keeps the previous receipt and restores its bytes", () => {
  const a = FILE('<p data-id="a">A</p>');
  load(a);
  const reader = start({ represented: { bytes: a, etag: "etag-a", seq: 1 } });
  const article = document.querySelector("article");
  const states = [];
  document.addEventListener("clay:reader-status", (event) => states.push(event.detail.state));
  const insert = article.insertBefore.bind(article);
  let failed = false;
  article.insertBefore = (...args) => {
    if (!failed) {
      failed = true;
      throw new Error("native apply refused this tree");
    }
    return insert(...args);
  };
  const b = FILE('<p data-id="a">B</p>');
  expect(deliver({ bytes: b, etag: "etag-b", seq: 2 })).toBe(false);
  article.insertBefore = insert;
  expect(streams[0].stopped).toBe(true);
  expect(reader.represented).toEqual({ bytes: a, etag: "etag-a", seq: 1 });
  expect(article.querySelector('[data-id="a"]').textContent).toBe("A");
  expect(states).toContain("blocked");
  expect(reader.stop()).toEqual({ bytes: a, etag: "etag-a", seq: 1 });
});

test("a reader refuses to start over a mounted editor or another owner", () => {
  load(FILE('<p data-id="a">A</p><div class="page-editor"></div>'));
  expect(() => start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: null, seq: null } })).toThrow(/mounted editor/);

  load(FILE('<p data-id="a">A</p>'));
  const article = document.querySelector("article");
  const release = claim(article, "editor");
  expect(() => start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: null, seq: null } })).toThrow(/already has a editor runtime/);
  release();
  const reader = start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: null, seq: null } });
  expect(reader.stop()).toEqual({ bytes: FILE('<p data-id="a">A</p>'), etag: null, seq: null });
});

test("a reader with no tool never evaluates the tool host", async () => {
  load(FILE('<p data-id="a">A</p>'));
  const reader = start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: null, seq: null } });
  await settle();
  expect(toolsEvaluated).toBe(false);
  reader.stop();
});

test("a tool document mounts from the accepted file, and a stop before the import resolves leaves the fallback", async () => {
  const toolFile = FILE('<section data-id="tool-1" data-type="tool"><script type="application/json" data-tool>{"artifact":{"title":"C","javascript":"function mount() {}"},"rev":"r1","state":{}}</script><p>fallback</p></section>');
  load(toolFile);
  const reader = start({ represented: { bytes: toolFile, etag: null, seq: null } });
  await settle();
  const root = document.querySelector('[data-id="tool-1"]');
  expect(toolsEvaluated).toBe(true);
  expect(root.getAttribute("data-mounted")).toBe("tool-1");
  reader.stop();
  expect(root.hasAttribute("data-mounted")).toBe(false);
  expect(root.textContent).toContain("fallback");
});

test("removal during a pending tool import never mounts it", async () => {
  const toolFile = FILE('<section data-id="tool-1" data-type="tool"><script type="application/json" data-tool>{"artifact":{"title":"C","javascript":"function mount() {}"},"rev":"r1","state":{}}</script><p>fallback</p></section>');
  load(toolFile);
  const reader = start({ represented: { bytes: toolFile, etag: null, seq: null } });
  reader.stop();
  await settle();
  const root = document.querySelector('[data-id="tool-1"]');
  expect(root.hasAttribute("data-mounted")).toBe(false);
  expect(root.textContent).toContain("fallback");
});

test("an accepted file records its etag, so a later save is not refused as stale", async () => {
  const etag = await import("../../../src/core/etag.js");
  load(FILE('<p data-id="a">A</p>'));
  const reader = start({ represented: { bytes: FILE('<p data-id="a">A</p>'), etag: "etag-a", seq: 1 } });

  expect(deliver({ bytes: FILE('<p data-id="a">B</p>'), etag: "etag-b", seq: 2 })).toBe(true);
  // The stamp module is the write path's lazy chunk; the reader records into it
  // rather than downloading it on first paint.
  await settle();
  expect(etag.lastSeenEtag()).toBe("etag-b");

  // A file nobody stamped claims no version: the stamp this page holds stays.
  expect(deliver({ bytes: FILE('<p data-id="a">C</p>'), etag: null, seq: 3 })).toBe(true);
  await settle();
  expect(etag.lastSeenEtag()).toBe("etag-b");
  reader.stop();
});
