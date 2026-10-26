import { afterAll, beforeAll, expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The first switch to edit, run from the built chunks with every request off this machine
 * refused. setMode reloads into an edit boot (src/core/edit-mode.js), so this boots the
 * built loader in edit mode, the way the reloaded page does, and waits for the editor.
 */

const root = path.resolve(new URL("../..", import.meta.url).pathname);
// The page tag and article of the shipped Document load fixture, read without importing
// any page code: a source import here would load a second Yjs beside the built chunks'.
const FIXTURE = new DOMParser().parseFromString(
  readFileSync(path.join(root, "tests/fixtures/load/document.html"), "utf8"), "text/html");
const HEAD = FIXTURE.querySelector('script[merge="page"]')?.outerHTML ?? "";
const BODY = FIXTURE.querySelector("article[data-page]").outerHTML;

let outdir;
const dirs = [];
const requests = [];
const refused = [];

beforeAll(async () => {
  outdir = await mkdtemp(path.join(os.tmpdir(), "clay-mode-runtime-"));
  const build = pathToFileURL(path.join(root, "scripts/build-chunks.mjs")).href;
  execFileSync(process.execPath, [
    "--input-type=module",
    "-e",
    `const { emitChunks } = await import(${JSON.stringify(build)}); await emitChunks({ root: ${JSON.stringify(root)}, outdir: ${JSON.stringify(outdir)} });`,
  ], { cwd: root, stdio: "pipe" });
  await writeFile(path.join(outdir, "package.json"), '{"type":"module"}\n');
}, 120000);

afterAll(async () => {
  for (const dir of [outdir, ...dirs]) await rm(dir, { recursive: true, force: true });
});

function localHost() {
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    close() { this.readyState = 2; }
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input?.url ?? input), location.href);
    requests.push(url.href);
    if (url.origin !== location.origin) {
      refused.push(url.href);
      throw new TypeError(`offline: ${url.href} is not on this machine`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => (url.pathname === "/_/meta" ? { spec: 1, extensions: ["page"], document: null } : {}),
      text: async () => (url.pathname === "/_/meta" ? JSON.stringify({ spec: 1, extensions: ["page"], document: null }) : url.pathname === "/" ? `<!DOCTYPE html><html><head>${HEAD}</head><body>${BODY}</body></html>` : ""),
      headers: { get: () => null },
    };
  };
}

const settle = async (until, ms = 10000) => {
  const end = Date.now() + ms;
  while (!until() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 25));
  return until();
};

test("the first switch's edit boot loads the editor from the built release with the network refused", async () => {
  const dir = `${outdir}-boot`;
  dirs.push(dir);
  await cp(outdir, dir, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  const base = pathToFileURL(dir + path.sep).href;

  document.head.innerHTML = HEAD;
  document.body.innerHTML = BODY;
  window.clay = {};
  window.clayEditMode = true;
  localHost();

  const runtime = { ...(await import(new URL(manifest.runtime, base).href)).default, base };
  const edit = { ...(await import(new URL(manifest.edit, base).href)).default, base };
  const { boot } = await import(new URL(manifest.entries["loader.js"], base).href);
  let ready = null;
  await boot("https://clayjs.com/1.0.0", new URLSearchParams("plugins=page"), (clay) => { ready = clay; }, runtime, edit);

  expect(ready).toBe(window.clay);
  const mounted = await settle(() => document.querySelector(".ProseMirror"));
  expect(mounted).toBeTruthy();
  expect(refused).toEqual([]);
}, 60000);
