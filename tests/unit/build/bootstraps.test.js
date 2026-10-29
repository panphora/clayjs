/**
 * @jest-environment node
 */
import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOOT_PREFIX, EDIT_DYNAMIC_IMPORTS, emitBootstraps, emitChunks } from "../../../scripts/build-chunks.mjs";
import { EDIT_BOOT_IMPORTS } from "../../../src/lib/boot-imports.js";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);

let chunkdir;
let outdir;
let built;

function embedded(code) {
  const start = code.indexOf("})({");
  if (start < 0) throw new Error("no embedded manifest");
  let depth = 0;
  for (let i = start + 3; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return JSON.parse(code.slice(start + 3, i + 1));
  }
  throw new Error("unterminated embedded manifest");
}

async function read(name) {
  return readFile(path.join(outdir, name), "utf8");
}

// The prelude statement alone: the `var __clayChunks = (function (M) { ... })(payload)`
// every bootstrap carries, ready to run against a document and a window.
function preludeOf(code) {
  const start = code.indexOf("var __clayChunks = ");
  const payload = code.indexOf("})({", start) + 3;
  let depth = 0;
  for (let i = payload; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 2) + ";";
  }
  throw new Error("no embedded manifest");
}

beforeAll(async () => {
  chunkdir = await mkdtemp(path.join(os.tmpdir(), "clay-chunks-"));
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-bootstraps-"));
  built = await emitChunks({ root, outdir: chunkdir });
  await emitBootstraps({ root, outdir, manifest: built.manifest, satellites: built.satellites });
}, 120000);

afterAll(async () => {
  await rm(chunkdir, { recursive: true, force: true });
  await rm(outdir, { recursive: true, force: true });
});

test("clay.js and each generated satellite parse as classic scripts", async () => {
  const names = ["clay.js", ...Object.keys(built.satellites)];
  expect(Object.keys(built.satellites)).toContain("all.js");
  for (const name of names) {
    const code = await read(name);
    expect(() => new Function(code)).not.toThrow();
  }
});

test("each bootstrap carries the shared runtime prelude exactly once", async () => {
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    expect(code.split("/* clay:chunk-prelude */").length - 1).toBe(0);
    expect(code.split("var __clayChunks = ").length - 1).toBe(1);
    expect(code.split("if (!clay.__runtime)").length - 1).toBe(1);
  }
});

test("no bootstrap imports from src/ outside the module-tree branch", async () => {
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    const src = code.split("\n").filter((line) => line.includes("import(") && line.includes("/src/"));
    expect(src.length).toBe(1);
    expect(src[0]).toContain('if (!R.chunks) return import(__clayChunks.tree + "/src/');
    expect(code.split('import(__clayChunks.tree + "/src/').length - 1).toBe(1);
    expect(code).not.toContain('import(base + "/src/');
  }
});

test("each bootstrap names one chunk directory and files the manifest lists", async () => {
  const files = built.manifest.files;
  const exists = async (file) => (await readFile(path.join(chunkdir, file))).length > 0;
  for (const name of ["clay.js", ...Object.keys(built.satellites)]) {
    const code = await read(name);
    expect(code.split('"dir":"m/"').length - 1).toBe(1);
    const M = embedded(code);
    expect(M.dir).toBe("m/");
    for (const file of [M.manifest, M.edit, ...M.preload].filter(Boolean)) {
      expect(files[file]).toBeTruthy();
      expect(await exists(file)).toBe(true);
    }
  }
});

test("clay.js preloads the loader, the runtime manifest and the boot prefix", async () => {
  const code = await read("clay.js");
  const M = embedded(code);
  expect(M.preload).toContain(built.manifest.entries["loader.js"]);
  expect(M.preload).toContain(built.manifest.runtime);
  for (const prefix of BOOT_PREFIX) {
    expect(M.preload).toContain(built.manifest.entries[prefix]);
  }
  expect(code).toContain('R.manifest.entries["loader.js"]');
  expect(M.manifest).toBe(built.manifest.runtime);
  expect(M.edit).toBe(built.manifest.edit);
  expect(M.version).toBeUndefined();
});

// An edit boot fetches more before ready than the loader's plan names: the supplement
// itself, and the chunks the edit halves of live sync and conflicts and the mode
// lifecycle reach with a dynamic import. The bootstrap preloads the supplement beside
// the runtime manifest, and the supplement lists the rest as edit boot imports, so a
// reader downloads none of it.
test("clay.js preloads the supplement on an edit page, and the supplement names the rest", async () => {
  const code = await read("clay.js");
  const M = embedded(code);
  const supplement = JSON.parse(
    (await readFile(path.join(chunkdir, built.manifest.edit), "utf8")).slice("export default ".length).replace(/;\s*$/, "")
  );

  // No reader's payload holds the supplement: only the edit decision adds its link,
  // and it does so before the import that would fetch it.
  expect(M.preload).not.toContain(M.edit);
  const added = code.indexOf("if (likelyEdit) M.preload.push(M.edit);");
  expect(added).toBeGreaterThan(-1);
  expect(added).toBeLessThan(code.indexOf("likelyEdit ? import(dir + M.edit)"));

  expect(EDIT_DYNAMIC_IMPORTS.length).toBeGreaterThan(0);
  for (const path of [...EDIT_BOOT_IMPORTS, ...EDIT_DYNAMIC_IMPORTS]) {
    expect(supplement.editBootImports).toContain(path);
    expect(supplement.entries[path]).toBeTruthy();
  }
});

// The supplement is the only conditional request the release makes, and a wrong guess
// costs hints, never a module: a page that asks for it early used one extra request, and
// an editor whose page did not preloads what the main manifest knows. An explicit
// ?editmode=true asks early, and so does a page that opts into edit through the
// window.clayEditMode global its own file set; an owner's cookie is permission, not an
// edit request, so an owner opening a document in view downloads no hint index (see
// mode-hints.test.js).
test("the bootstrap fetches the edit supplement for an explicit ?editmode=true or an opt-in global", async () => {
  const code = await read("clay.js");
  const at = code.indexOf("function __clayLikelyEdit");
  const end = code.indexOf("\n  }", at) + 4;
  expect(at).toBeGreaterThan(-1);
  const likelyEdit = new Function(`${code.slice(at, end)}\n  return __clayLikelyEdit;`)();

  expect(likelyEdit("?plugins=page&editmode=true", "")).toBe(true);
  expect(likelyEdit("?editmode=true", "")).toBe(true);
  expect(likelyEdit("?plugins=page", "isAdminOfCurrentResource=abc")).toBe(false);
  expect(likelyEdit("?plugins=page", "other=1; isAdminOfCurrentResource=abc")).toBe(false);
  expect(likelyEdit("?plugins=page", "")).toBe(false);
  expect(likelyEdit("?plugins=page&editmode=false", "isAdminOfCurrentResource=abc")).toBe(false);
  expect(likelyEdit("?editmode=false", "other=1")).toBe(false);

  // A standalone page that sets the global before the script is editable by its own
  // say-so, and the URL still wins over the global.
  globalThis.clayEditMode = true;
  try {
    expect(likelyEdit("?plugins=page")).toBe(true);
    expect(likelyEdit("?plugins=page&editmode=false")).toBe(false);
  } finally {
    delete globalThis.clayEditMode;
  }
  expect(likelyEdit("?plugins=page")).toBe(false);

  // Two imports of the one supplement: the early one this predicate decides, and the
  // cached hint fetch a resolved edit, draft or first entry uses.
  expect(code.split("import(dir + M.edit)").length - 1).toBe(2);
  expect(code).toContain("likelyEdit ? import(dir + M.edit)");
  expect(code).toContain("function loadEditHints()");
  expect(code).toContain("loadEditHints: loadEditHints");
});

// A satellite adds its links after the page has already parsed, so an href it repeats
// is a request the browser makes twice. The prelude seeds its set from the links already
// in the head, and only appends what is missing.
test("a satellite appends only the preload links the page does not already carry", async () => {
  const code = await read("all.js");
  const M = embedded(code);
  expect(M.preload.length).toBeGreaterThan(1);

  const dir = "https://cdn.test/v1/m/";
  const existing = { rel: "modulepreload", href: dir + M.preload[1] };
  const added = [];
  const document = {
    head: {
      querySelectorAll: (selector) => (selector === 'link[rel="modulepreload"]' ? [existing] : []),
      appendChild: (link) => added.push(link),
    },
    createElement: () => ({ setAttribute: () => {} }),
  };
  const window = { clay: { __runtime: Promise.resolve({ chunks: true }) }, location: { search: "" } };
  new Function("window", "document", "base", preludeOf(code))(window, document, "https://cdn.test/v1");

  expect(added.map((link) => link.href)).not.toContain(existing.href);
  expect(added.map((link) => link.href)).toEqual(M.preload.map((file) => dir + file).filter((href) => href !== existing.href));
});

test("each satellite preloads its own entry and the runtime manifest", async () => {
  for (const [name, target] of Object.entries(built.satellites)) {
    if (name === "clay.js") continue;
    const code = await read(name);
    const M = embedded(code);
    expect(M.preload[0]).toBe(built.manifest.entries[target]);
    expect(M.preload).toContain(built.manifest.runtime);
    expect(code).toContain(`R.manifest.entries["${target}"]`);
  }
});

