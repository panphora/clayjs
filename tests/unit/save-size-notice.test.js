import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveModules } from "../../src/loader-logic.js";

/**
 * The one quiet notice about a document growing into its host's advertised limit.
 *
 * `clay:save-size` reports a real save attempt's exact bytes, never a live reading, so
 * every sentence the notice draws says "At the last save attempt". Save.js fetches this
 * module only on a measurement that is near or over, and most edit boots never download
 * it at all — the graph test below is that promise, built the way a browser would fetch
 * it.
 *
 * The download is the safe copy this library already offers for the current document,
 * so conflict-download.js is stubbed here: what is under test is that the action calls
 * that path, not what the path writes.
 */

const downloads = [];

await jest.unstable_mockModule("../../src/core/conflict-download.js", () => ({
  downloadStored: (options) => {
    downloads.push(options);
    return true;
  },
}));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const size = (state, bytes = 850_000, maxBytes = 1_048_576) =>
  new CustomEvent("clay:save-size", { detail: { bytes, maxBytes, state } });
const noticeEl = () => document.querySelector("[data-clay-save-size]");
const shownCopy = () => {
  const root = noticeEl();
  return root ? root.querySelector("button") : null;
};

let notice;
let saveFacts;

beforeAll(async () => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
    text: async () => "",
    json: async () => ({}),
  }));
  notice = await import("../../src/core/save-size-notice.js");
  saveFacts = await import("../../src/core/is-edit-mode.js");
});

afterEach(() => {
  notice.stop();
  document.querySelectorAll("[data-clay-save-size]").forEach((el) => el.remove());
  downloads.length = 0;
});

describe("announceSaveSize: only a real measurement near or over asks for the notice", () => {
  test("an ok or unknown measurement downloads nothing and draws nothing", async () => {
    const { announceSaveSize } = await import("../../src/core/save-size.js");

    announceSaveSize(size("ok", 10, 1_048_576).detail);
    announceSaveSize(size("unknown", 10, null).detail);
    await tick();

    expect(noticeEl()).toBeNull();
  });

  test("a near measurement draws it, from the event that asked", async () => {
    const { announceSaveSize } = await import("../../src/core/save-size.js");

    announceSaveSize(size("near").detail);
    await tick();

    expect(noticeEl()).not.toBeNull();
    expect(noticeEl().textContent).toContain("At the last save attempt");
  });
});

describe("what the notice says", () => {
  test("a near measurement is one quiet element that recommends a copy and a smaller file", () => {
    notice.start(size("near"));

    const root = noticeEl();
    expect(root).not.toBeNull();
    expect(root.getAttribute("clay")).toBe("editor-ui");
    expect(root.getAttribute("role")).toBe("status");
    expect(root.textContent).toContain("This file is getting large.");
    expect(root.textContent).toContain("At the last save attempt: 830 KB of 1.0 MB.");
    expect(root.textContent).toContain("Download a copy, then reduce its size; saving still works.");
    // Near still saves: the copy is offered by an oversize document, not by this one.
    expect(shownCopy().hidden).toBe(true);
  });

  test("repeated measurements update one element instead of stacking notices", () => {
    notice.start(size("near"));
    const first = noticeEl();

    document.dispatchEvent(size("near", 880_000));
    document.dispatchEvent(size("near", 900_000));

    expect(document.querySelectorAll("[data-clay-save-size]")).toHaveLength(1);
    expect(noticeEl()).toBe(first);
    expect(first.textContent).toContain("At the last save attempt: 879 KB of 1.0 MB.");
  });

  test("a near that becomes over updates the text and offers the existing download", () => {
    notice.start(size("near"));

    document.dispatchEvent(size("over", 1_200_000));

    const root = noticeEl();
    expect(root.textContent).toContain("This host can't save a file this size.");
    expect(root.textContent).toContain("At the last save attempt: 1.1 MB of 1.0 MB.");
    expect(root.textContent).not.toContain("saving still works");
    expect(shownCopy().hidden).toBe(false);

    shownCopy().click();
    expect(downloads).toEqual([{}]);
  });

  test("a later measurement below the threshold takes it away, and a later one brings it back", () => {
    notice.start(size("over", 1_200_000));
    expect(noticeEl()).not.toBeNull();

    document.dispatchEvent(size("ok", 900_000));
    expect(noticeEl()).toBeNull();

    document.dispatchEvent(size("unknown", 900_000, null));
    expect(noticeEl()).toBeNull();

    document.dispatchEvent(size("near", 400_000));
    expect(noticeEl().textContent).toContain("At the last save attempt: 391 KB of 1.0 MB.");
    document.dispatchEvent(size("over", 1_200_000));
    expect(noticeEl().textContent).toContain("can't save a file this size");
  });
});

describe("leaving edit", () => {
  test("a committed exit removes the notice and its listeners", () => {
    notice.start(size("near"));
    expect(noticeEl()).not.toBeNull();

    saveFacts.commitModeFacts({ mode: "view", isEditMode: false });
    document.dispatchEvent(new Event("clay:modechange"));
    expect(noticeEl()).toBeNull();

    // Nothing is listening any more: the measurement of a save this session cannot make
    // draws nothing.
    document.dispatchEvent(size("near"));
    expect(noticeEl()).toBeNull();
  });

  test("a page that is not editing never draws one", () => {
    saveFacts.commitModeFacts({ mode: "view", isEditMode: false });
    notice.start(size("over"));
    expect(noticeEl()).toBeNull();
    saveFacts.commitModeFacts({ mode: "edit", isEditMode: true });
  });
});

describe("the boot graph", () => {
  const MODES = [
    { mode: "view", isEditMode: false, isDraftMode: false },
    { mode: "draft", isEditMode: true, isDraftMode: true },
    { mode: "edit", isEditMode: true, isDraftMode: false },
  ];

  const ROOT = new URL("../../", import.meta.url).pathname;

  const fixtureBoot = (file) => {
    const html = readFileSync(new URL(`../../tests/fixtures/load/${file}`, import.meta.url), "utf8");
    const src = html.match(/<script[^>]+src="([^"]*clay\.js[^"]*)"/);
    return {
      params: new URLSearchParams(new URL(src[1]).search),
      hasSap: /\ssap[\s>=]/.test(html.match(/<html[^>]*>/)[0]),
    };
  };

  const staticDeps = (inputs, file) =>
    (inputs[file]?.imports || [])
      .filter((im) => !im.external && im.kind === "import-statement")
      .map((im) => im.path);

  const walk = (inputs, entries) => {
    const seen = new Set();
    let frontier = [...entries];
    while (frontier.length) {
      const next = [];
      for (const file of frontier) {
        if (seen.has(file)) continue;
        seen.add(file);
        frontier.push(...staticDeps(inputs, file));
      }
      frontier = next;
    }
    return [...seen];
  };

  // esbuild refuses a codec whose Uint8Array comes from another realm, and jsdom hands
  // it exactly that, so the build runs in a plain node process and this test reads the
  // metafile it prints. The graph is the browser's own: static imports from a boot.
  const BUILD = `
import { build } from "esbuild";
const options = JSON.parse(process.env.CLAY_BUILD);
const result = await build({ ...options, metafile: true, write: false });
process.stdout.write(JSON.stringify({ inputs: result.metafile.inputs }));
`;

  function metafileInputs(options) {
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", BUILD], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CLAY_BUILD: JSON.stringify(options) },
    });
    if (run.status !== 0) throw new Error(`the boot graph could not be built: ${run.stderr}`);
    return JSON.parse(run.stdout).inputs;
  }

  function inputsFor(entryPoints) {
    return metafileInputs({
      absWorkingDir: ROOT,
      entryPoints: [...new Set(["src/loader.js", ...entryPoints, "src/core/save-size.js"])],
      bundle: true,
      splitting: true,
      format: "esm",
      outdir: "save-size-notice-out",
      external: ["https://*"],
      logLevel: "silent",
    });
  }

  for (const { mode, isEditMode, isDraftMode } of MODES) {
    test(`a journal ${mode} boot downloads neither the notice nor what it draws with`, () => {
      const { params, hasSap } = fixtureBoot("journal.html");
      const plan = resolveModules(params, isEditMode, { isDraftMode, hasSap });
      const entries = [...plan.core, ...plan.plugins].map((path) => `src/${path}`);
      // The save lane is built in every mode so its own edges are in the metafile even
      // on a boot that does not carry it; the walk below still starts at the boot.
      const inputs = inputsFor(entries);
      const graph = walk(inputs, ["src/loader.js", ...entries]);

      expect(graph).not.toContain("src/core/save-size-notice.js");
      expect(graph).not.toContain("src/core/conflict-download.js");

      // Built and fetched by the save lane, and by nothing else a boot carries.
      const dynamic = (inputs["src/core/save-size.js"]?.imports || [])
        .filter((im) => !im.external && im.kind === "dynamic-import")
        .map((im) => im.path);
      expect(dynamic).toContain("src/core/save-size-notice.js");
      const fetchedBy = Object.entries(inputs)
        .filter(([, input]) => (input.imports || []).some((im) => im.path === "src/core/save-size-notice.js"))
        .map(([name]) => name);
      expect(fetchedBy).toEqual(["src/core/save-size.js"]);
      // Not an unbuilt file: the chunk exists for the lane to fetch.
      expect(Object.keys(inputs)).toContain("src/core/save-size-notice.js");
    }, 60000);
  }
});
