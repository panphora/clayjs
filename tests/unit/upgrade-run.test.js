/**
 * The upgrade (plan 05, Step 6): an owner who accepts the notice gets the newer
 * published template with every data value kept, saved as one conditional
 * whole-document replacement. A fake source stands in for the host, so the
 * sequence, the conservation check and the refusal are all visible here.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jest } from "@jest/globals";
import { storage } from "../../src/lib/doc-storage.js";

const loads = [];
await jest.unstable_mockModule("../../src/plugins/upgrade-run.js", () => {
  const record = { starts: [] };
  loads.push(record);
  return { start: jest.fn(async (update) => { record.starts.push(update); return null; }) };
});

await import("../../src/plugins/upgrade.js");
const { start: startUpgrade, apply, lostValues } = await import("../../src/core/upgrade-run.js");
const { upgrade } = await import("../../src/vendor/hyper-html-api-upgrade.vendor.js");

const KANBAN = readFileSync(new URL("../fixtures/load/kanban-hyperclay.html", import.meta.url), "utf8");
const HTML_URL = "https://hyperclay.com/templates/kanban/owned/1.1.0.html";
const MANIFEST_URL = "https://hyperclay.com/templates/kanban/owned/latest.json";
const CONFLICT = "This document changed somewhere else. Reload and try again.";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function newerKanban() {
  return KANBAN
    .replace('<meta name="hyper-version" content="1.0.0">', '<meta name="hyper-version" content="1.1.0">')
    .replace("Referral program for early users", "A title only the new template has");
}

function manifestFor(html, overrides = {}) {
  return { id: "kanban", variant: "owned", version: "1.1.0", html: HTML_URL, sha256: sha256(html), ...overrides };
}

function updateFor(html, overrides = {}) {
  return { version: "1.1.0", html: HTML_URL, sha256: sha256(html), latestUrl: MANIFEST_URL, ...overrides };
}

function sourceFetcher(html, manifest = manifestFor(html)) {
  return jest.fn(async (url) => {
    if (url === MANIFEST_URL) return { ok: true, status: 200, json: async () => manifest };
    if (url === HTML_URL) return { ok: true, status: 200, text: async () => html };
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function loadPage(head, body) {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
}

function loadKanban(html = KANBAN) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  loadPage(parsed.head.innerHTML, parsed.body.innerHTML);
}

function setupClay(overrides = {}) {
  const clay = {
    canEdit: true,
    isDraftMode: false,
    isEditMode: true,
    storage,
    getHTML: jest.fn(() => "<!DOCTYPE html><html><body>this copy</body></html>"),
    save: {
      flush: jest.fn(async () => ({ state: "clean" })),
      replace: jest.fn(async () => ({ ok: true, etag: "etag-after" })),
    },
    host: { versions: Promise.resolve(true) },
    ...overrides,
  };
  window.clay = clay;
  return clay;
}

const MINI_SOURCE = "https://hyperclay.com/templates/mini/owned/latest.html";
const MINI_HTML_URL = "https://hyperclay.com/templates/mini/owned/1.1.0.html";
const MINI_MANIFEST_URL = "https://hyperclay.com/templates/mini/owned/latest.json";

function miniPage({ version, rules, title, note, transform = "" }) {
  return `<!DOCTYPE html><html><head>
<meta name="hyper-source" content="${MINI_SOURCE}">
<meta name="hyper-version" content="${version}">
<meta name="clay-template" content="mini owned">
<script type="application/json" data-rules-name="api" data-rules-version="1">${JSON.stringify(rules)}</script>
${transform ? `<script type="text/hyper-upgrade">${transform}</script>` : ""}
</head><body><h1 id="title">${title}</h1><p id="note">${note}</p></body></html>`;
}

function miniFetch(html) {
  const manifest = { id: "mini", variant: "owned", version: "1.1.0", html: MINI_HTML_URL, sha256: sha256(html) };
  return jest.fn(async (url) => {
    if (url === MINI_MANIFEST_URL) return { ok: true, status: 200, json: async () => manifest };
    if (url === MINI_HTML_URL) return { ok: true, status: 200, text: async () => html };
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function loadMini(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  loadPage(parsed.head.innerHTML, parsed.body.innerHTML);
  return { version: "1.1.0", html: MINI_HTML_URL, sha256: sha256(html), latestUrl: MINI_MANIFEST_URL };
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: {
        digest: async (algorithm, bytes) => createHash("sha256").update(Buffer.from(bytes)).digest(),
      },
    },
    configurable: true,
    writable: true,
  });
  const RealBlob = globalThis.Blob;
  class CodeBlob extends RealBlob {
    constructor(parts, options) {
      super(parts, options);
      this.__code = (parts || []).map((part) => String(part)).join("");
    }
  }
  globalThis.Blob = CodeBlob;
  URL.createObjectURL = (blob) => `data:text/javascript;base64,${Buffer.from(blob.__code, "utf8").toString("base64")}`;
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the conservation check", () => {
  test("a Kanban copy with boards, cards, checklists and comments keeps every value", async () => {
    loadKanban();
    const before = upgrade.extractAll(document).dataByName;
    const html = newerKanban();
    const clay = setupClay();
    const reload = jest.fn();

    const result = await apply(updateFor(html), {
      clay,
      fetchFn: sourceFetcher(html),
      reload,
      doc: document,
      loc: location,
    });

    expect(result.ok).toBe(true);
    expect(clay.save.flush).toHaveBeenCalledTimes(1);
    expect(clay.save.replace).toHaveBeenCalledTimes(1);
    const saved = clay.save.replace.mock.calls[0][0];
    const savedDoc = new DOMParser().parseFromString(saved, "text/html");
    expect(upgrade.extractAll(savedDoc).dataByName).toEqual(before);
    expect(saved).toContain("Choose per-token limits");
    expect(saved).toContain("Referral program for early users");
    expect(savedDoc.querySelector(".card-title").textContent).toBe("Referral program for early users");
    expect(savedDoc.querySelector('meta[name="hyper-version"]').getAttribute("content")).toBe("1.1.0");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("a transform's declared rename passes the check", async () => {
    const oldHtml = miniPage({ version: "1.0.0", rules: { title: "#title", note: "#note" }, title: "Old title", note: "Keep me" });
    const newHtml = miniPage({
      version: "1.1.0",
      rules: { heading: "#title", note: "#note" },
      title: "New template title",
      note: "New template note",
      transform:
        'export const renames = { "api.title": "api.heading" };' +
        'export default function (data) { return { api: { heading: data.api.title, note: data.api.note } }; }',
    });
    const update = loadMini(oldHtml);
    const clay = setupClay();

    const result = await apply(update, { clay, fetchFn: miniFetch(newHtml), reload: jest.fn(), doc: document, loc: location });

    expect(result.ok).toBe(true);
    const saved = clay.save.replace.mock.calls[0][0];
    expect(saved).toContain("Old title");
    expect(saved).toContain("Keep me");
  });

  test("an undeclared drop refuses and lists what would be lost", async () => {
    const oldHtml = miniPage({ version: "1.0.0", rules: { title: "#title", note: "#note" }, title: "Old title", note: "Keep me" });
    const newHtml = miniPage({
      version: "1.1.0",
      rules: { heading: "#title", note: "#note" },
      title: "New template title",
      note: "New template note",
      transform: "export default function (data) { return { api: { note: data.api.note } }; }",
    });
    const update = loadMini(oldHtml);
    const clay = setupClay();

    const result = await apply(update, { clay, fetchFn: miniFetch(newHtml), reload: jest.fn(), doc: document, loc: location });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("lost");
    expect(result.lost.map(({ path }) => path)).toContain("api.title");
    expect(result.message).toContain("api.title");
    expect(clay.save.replace).not.toHaveBeenCalled();
  });
});

describe("the save", () => {
  test("a 412 leaves the page unchanged and says so", async () => {
    loadKanban();
    const html = newerKanban();
    const clay = setupClay();
    clay.save.replace = jest.fn(async () => ({ ok: false, code: "conflict" }));
    const reload = jest.fn();
    const before = document.documentElement.outerHTML;

    const result = await apply(updateFor(html), {
      clay,
      fetchFn: sourceFetcher(html),
      reload,
      doc: document,
      loc: location,
    });

    expect(result).toEqual({ ok: false, code: "conflict", message: CONFLICT });
    expect(reload).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe("the offer", () => {
  test("a host without history requires the download first", async () => {
    loadKanban();
    const html = newerKanban();
    const clay = setupClay({ host: { versions: Promise.resolve(false) } });
    const anchor = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const ui = await startUpgrade(updateFor(html), { clay, fetchFn: sourceFetcher(html), doc: document, loc: location });

    expect(ui.body.textContent).toBe(
      "Your data moves into version 1.1.0. The page's layout and code are replaced; your current version stays in this document's history."
    );
    expect(ui.download).not.toBeNull();
    expect(ui.upgrade.disabled).toBe(true);

    ui.download.click();

    expect(clay.getHTML).toHaveBeenCalledTimes(1);
    expect(anchor).toHaveBeenCalledTimes(1);
    expect(ui.upgrade.disabled).toBe(false);
    ui.close();
  });

  test("a draft page never offers the upgrade", async () => {
    loadKanban();
    const html = newerKanban();
    const clay = setupClay({ isDraftMode: true });

    const ui = await startUpgrade(updateFor(html), { clay, fetchFn: sourceFetcher(html), doc: document, loc: location });
    expect(ui).toBeNull();
    expect(document.querySelector("[data-clay-upgrade]")).toBeNull();

    const result = await apply(updateFor(html), { clay, fetchFn: sourceFetcher(html), doc: document, loc: location });
    expect(result).toEqual({ ok: false, code: "draft" });
  });

  test("booting the notice does not fetch the upgrade module", async () => {
    document.head.innerHTML = "";
    window.clay = { canEdit: true, isDraftMode: false, storage };
    jest.resetModules();
    const at = loads.length;

    await import("../../src/plugins/upgrade.js");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads.length).toBe(at);

    document.dispatchEvent(new CustomEvent("clay:upgrade-requested", { detail: { version: "1.1.0" } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loads.length).toBe(at + 1);
  });
});

test("conservation counts repeated values: dropping one of two cards with the same title is a loss", () => {
  const before = { cards: [{ title: "Call Sam" }, { title: "Call Sam" }] };
  const after = { cards: [{ title: "Call Sam" }] };
  expect(lostValues(before, after)).toEqual([{ path: "cards[].title", value: "Call Sam" }]);
  expect(lostValues(before, before)).toEqual([]);
});
