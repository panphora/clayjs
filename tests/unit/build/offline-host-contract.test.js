/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeRuntimeHTML } from "../../../src/server/offline-runtime/index.js";
import { parse } from "../../../src/vendor/parse5.vendor.js";
import { verifyOfflineClosure } from "../../../scripts/verify-offline-closure.mjs";

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/offline-runtime/html.json");
const READY_TIMEOUT = 120000;
const CASE_TIMEOUT = 120000;

const NAMES = ["htmlclay", "hyperclay-local"];
const CASES = 8;

const configured = process.env.CLAY_OFFLINE_HOSTS ? JSON.parse(process.env.CLAY_OFFLINE_HOSTS) : null;
const KANBAN = process.env.CLAY_KANBAN_TEMPLATE ? path.resolve(process.env.CLAY_KANBAN_TEMPLATE) : null;
const hosts = configured && KANBAN ? configured : [];
const suite = hosts.length ? describe : describe.skip;
if (!configured) {
  console.info("offline-host-contract: CLAY_OFFLINE_HOSTS is unset, skipping the cross-host closure contract");
}
if (configured && !KANBAN) {
  test("CLAY_KANBAN_TEMPLATE names the real Kanban template", () => {
    throw new Error(
      "offline-host-contract: CLAY_OFFLINE_HOSTS is set, so CLAY_KANBAN_TEMPLATE must name starter-templates/templates/01-kanban/kanban.html",
    );
  });
}

const executed = new Map();
const count = (name) => executed.set(name, (executed.get(name) ?? 0) + 1);

// Response-scoped root attributes: a host stamps its own documentetag and, on HTML Clay,
// save tokens (testdata/conformance/host-test.html strips the same set). None is written
// to the file.
const RESPONSE_ATTR = /\s+(?:documentetag|savetoken|htmlclaytoken|documentid|htmlclayid)="[^"]*"/g;
const stripResponseMetadata = (html) => html.replace(RESPONSE_ATTR, "");
const LOCAL_URL = /(?:src|href)="([^"]*\/_\/clayjs\/[^"]*)"/g;
const DESCRIPTOR = /<script[^>]*id="clay-runtime-map"[^>]*>([\s\S]*?)<\/script>/;
const CLAY_SCRIPT = /<script src="(https:\/\/clayjs\.com\/[^"]*\/clay\.js\?[^"]*)"/;
const PUBLIC_URL = /^https:\/\/clayjs\.com\//;

// A release chunk names its imports as relative module specifiers; the browser fetches
// each one through the host, so the test follows them from the served bytes.
const IMPORT_SPEC = /(?:from|import)\s*\(?\s*"(\.[^"]*)"/g;

function elementsOf(html) {
  const found = [];
  const walk = (node) => {
    if (node.tagName) found.push(node);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(parse(html, { sourceCodeLocationInfo: true }));
  return found;
}

const attrOf = (node, name) => node.attrs?.find((attr) => attr.name === name)?.value;

// The URLs a host rewrites: src on a script, href on a link, when the disk bytes name
// the public runtime.
function runtimeURLsOnDisk(html) {
  const urls = [];
  for (const node of elementsOf(html)) {
    const value = node.tagName === "script" ? attrOf(node, "src") : node.tagName === "link" ? attrOf(node, "href") : null;
    if (value && PUBLIC_URL.test(value)) urls.push(value);
  }
  return urls;
}

// Every card is an <li class="card" data-id>; its outer HTML is the bytes a save must
// leave alone.
function cardsOf(html) {
  const cards = [];
  for (const node of elementsOf(html)) {
    if (node.tagName !== "li") continue;
    if (!/\bcard\b/.test(attrOf(node, "class") ?? "")) continue;
    const id = attrOf(node, "data-id");
    if (!id) continue;
    const location = node.sourceCodeLocation;
    cards.push({ id, outer: html.slice(location.startOffset, location.endOffset) });
  }
  return cards;
}

// resolveModules answers the loader's own module ids ("plugins/derive.js"). The release
// lists each of those under src/, and, where the chunked build split one out, a chunk
// named after it under m/ ("m/plugins/derive-<HASH>.js"). Modules the build folds into a
// shared chunk (the reader core) have only the src/ path. The chunk hash belongs to the
// build the host vendored, so the names are matched against the host's own index.
function releasePathsOf(name, files) {
  const paths = [];
  if (Object.hasOwn(files, `src/${name}`)) paths.push(`src/${name}`);
  const prefix = `m/${name.replace(/\.js$/, "")}-`;
  for (const file of Object.keys(files)) {
    if (file.startsWith(prefix) && file.endsWith(".js")) paths.push(file);
  }
  return paths;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function startFixture(host, root) {
  const child = spawn(host.command[0], [...host.command.slice(1), "--root", root], {
    cwd: host.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${host.name}: no READY line within ${READY_TIMEOUT} ms\n${stderr}`)), READY_TIMEOUT);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const line = stdout.split("\n").find((entry) => entry.startsWith("READY "));
      if (!line) return;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line.slice("READY ".length)));
      } catch (error) {
        reject(new Error(`${host.name}: unreadable READY line: ${error.message}`));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${host.name}: exited with ${code} before READY\n${stderr}`));
    });
  });
  return { child, ready };
}

const stopped = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 10000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });

if (configured) {
  test("CLAY_OFFLINE_HOSTS names both hosts", () => {
    expect(configured.map((host) => host.name).sort()).toEqual(NAMES);
    expect(new Set(configured.map((host) => host.name)).size).toBe(configured.length);
  });
}

for (const host of hosts) {
  suite(host.name, () => {
    let root;
    let child;
    let ready;
    let index;
    let localIndex;
    let board;
    let doc;
    let page;
    let template;

    beforeAll(async () => {
      const kanban = JSON.parse(await readFile(FIXTURES, "utf8")).cases.find((entry) => entry.name === "kanban-head");
      board = kanban.input;
      doc = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Notes</title>\n</head>\n<body>\n<p>Notes</p>\n</body>\n</html>\n";
      template = await readFile(KANBAN, "utf8");
      page = await readFile(path.join(ROOT, "tests/fixtures/load/document.html"), "utf8");
      root = await mkdtemp(path.join(os.tmpdir(), `clay-host-${host.name}-`));
      await mkdir(path.join(root, "notes/2026"), { recursive: true });
      await writeFile(path.join(root, "board.html"), board);
      await writeFile(path.join(root, "notes/2026/doc.html"), doc);
      await writeFile(path.join(root, "kanban.html"), template);
      await writeFile(path.join(root, "page.html"), page);
      index = JSON.parse(await readFile(host.index, "utf8"));
      localIndex = JSON.parse(await readFile(path.join(ROOT, "dist/offline-manifest.json"), "utf8"));
      const started = startFixture(host, root);
      child = started.child;
      ready = await started.ready;
    }, 300000);

    afterAll(async () => {
      if (child) await stopped(child);
      if (root) await rm(root, { recursive: true, force: true });
    });

    test("every path in the host's index is served with its recorded bytes and type", async () => {
      count(host.name);
      expect(ready.host).toBe(host.name);
      const result = await verifyOfflineClosure({ baseURL: `${ready.baseURL}${ready.runtime}`, indexFile: host.index });
      expect(result.problems).toEqual([]);
      expect(result.files).toBe(Object.keys(index.files).length);
      expect(result.files).toBeGreaterThan(400);
      const vendored = new Set(Object.keys(index.files));
      const checkout = new Set(Object.keys(localIndex.files));
      const differing = [...vendored].filter((pub) => !checkout.has(pub)).length +
        [...checkout].filter((pub) => !vendored.has(pub)).length;
      console.info(
        `offline-host-contract: ${host.name} vendored ${vendored.size} paths, ${differing} differ from this checkout's dist index`,
      );
    }, CASE_TIMEOUT);

    test("the host projects a document to local URLs that answer, and canonicalizes back to the disk bytes", async () => {
      count(host.name);
      const response = await fetch(ready.documents["board.html"].url);
      expect(response.status).toBe(200);
      const served = await response.text();
      expect(served).toContain('id="clay-runtime-map"');

      const locals = [...served.matchAll(LOCAL_URL)].map((match) => match[1]);
      expect(locals.length).toBeGreaterThan(0);
      for (const local of locals) {
        expect(local.startsWith(ready.runtime)).toBe(true);
        const target = await fetch(new URL(local, ready.baseURL));
        expect({ local, status: target.status }).toEqual({ local, status: 200 });
      }

      const documentURL = ready.documents["board.html"].url;
      const releases = { [index.version]: { version: index.version, files: index.files, aliases: index.aliases } };
      const canonical = canonicalizeRuntimeHTML(served, { releases, documentURL });
      expect(canonical.descriptorRemoved).toBe(true);
      expect(canonical.changed).toBeGreaterThan(0);
      expect(canonical.html).toMatch(/\sdocumentetag="[^"]*"/);
      expect(stripResponseMetadata(canonical.html)).toBe(stripResponseMetadata(board));
    }, CASE_TIMEOUT);

    test("a save of the projected document writes canonical public URLs to disk", async () => {
      count(host.name);
      const response = await fetch(ready.documents["board.html"].url);
      const served = await response.text();
      const etag = /documentetag="([^"]*)"/.exec(served)?.[1];
      expect(typeof etag).toBe("string");
      const edited = served.replace("<div id=\"board\"></div>", "<div id=\"board\">Ship it</div>");
      expect(edited).not.toBe(served);

      const save = ready.documents["board.html"].save;
      const saved = await fetch(save.url, {
        method: save.method,
        headers: { ...save.headers, "If-Match": etag },
        body: edited,
      });
      expect(saved.status).toBe(200);

      const disk = await readFile(path.join(root, "board.html"), "utf8");
      expect(disk).toContain("Ship it");
      expect(disk).toContain("https://clayjs.com/v1/clay.js");
      expect(disk).toContain("https://clayjs.com/v1/sap.js");
      expect(disk).toContain("https://clayjs.com/v1/src/page/themes/light-1.css");
      expect(disk).not.toContain("/_/clayjs/");
      expect(disk).not.toContain("clay-runtime-map");
      expect(disk).not.toContain("documentetag");
    }, CASE_TIMEOUT);

    test("the real Kanban board's runtime URLs are projected onto the host and every other byte is the disk's", async () => {
      count(host.name);
      const documentURL = ready.documents["kanban.html"].url;
      const response = await fetch(documentURL);
      expect(response.status).toBe(200);
      const served = await response.text();

      const descriptor = JSON.parse(DESCRIPTOR.exec(served)[1]);
      const diskURLs = runtimeURLsOnDisk(template);
      expect(diskURLs.length).toBeGreaterThanOrEqual(5);
      expect(diskURLs).toContain("https://clayjs.com/v1/fonts/work-sans-latin-wght-normal.woff2");
      expect(diskURLs).toContain("https://clayjs.com/v1/sap.js");
      expect(diskURLs).toContain("https://clayjs.com/v1/clay-router.js");

      for (const url of diskURLs) {
        const mapping = descriptor.entries.find((entry) => entry.original === url);
        expect({ url, projected: Boolean(mapping) }).toEqual({ url, projected: true });
        expect({ url, underRuntime: mapping.local.startsWith(ready.runtime) }).toEqual({ url, underRuntime: true });
        const target = await fetch(new URL(mapping.local, ready.baseURL));
        expect({ local: mapping.local, status: target.status }).toEqual({ local: mapping.local, status: 200 });
        const publicPath = mapping.local.slice(ready.runtime.length).replace(/[?#][\s\S]*$/, "");
        expect({ local: mapping.local, sha256: sha256(Buffer.from(await target.arrayBuffer())) })
          .toEqual({ local: mapping.local, sha256: index.files[publicPath].sha256 });
      }

      // The figma link is author content and the rest of the document is text: undo only
      // the projection and the response-scoped root attributes and the disk bytes return.
      expect(served).toContain('href="https://www.figma.com/"');
      const canonical = canonicalizeRuntimeHTML(served, {
        releases: { [index.version]: { version: index.version, files: index.files, aliases: index.aliases } },
        documentURL,
      });
      expect(canonical.descriptorRemoved).toBe(true);
      expect(canonical.changed).toBe(diskURLs.length);
      expect(stripResponseMetadata(canonical.html)).toBe(stripResponseMetadata(template));
    }, CASE_TIMEOUT);

    test("every module the board's plugin query resolves to, late ones included, is in the host's index and served", async () => {
      count(host.name);
      const query = CLAY_SCRIPT.exec(template)[1].replace(/^https:\/\/clayjs\.com\/v1\//, "");
      expect(query).toBe("clay.js?plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu&exclude=richclay");
      const params = new URLSearchParams(query.slice(query.indexOf("?") + 1));

      // src/loader.js:12 imports the merge engine for clay.morph and only calls it on the
      // first remote change, so no resolveModules answer names it and only a closure that
      // adds it sees it. It loads whether or not the document is in edit mode.
      const MERGE_ENGINE = "sync/merge-engine.js";

      // The board asks for what the host's own release's loader resolves, not this checkout's:
      // a module added after the vendored release is one that release never requests.
      // The file has no imports, so the bytes the host serves load on their own from a temp copy.
      const logic = await fetch(new URL(`${ready.runtime}src/loader-logic.js`, ready.baseURL));
      expect(logic.status).toBe(200);
      const logicFile = path.join(await mkdtemp(path.join(os.tmpdir(), "loader-logic-")), "loader-logic.mjs");
      await writeFile(logicFile, Buffer.from(await logic.arrayBuffer()));
      const { resolveModules } = await import(pathToFileURL(logicFile).href);

      const paths = new Set();
      for (const isEditMode of [true, false]) {
        const resolved = resolveModules(params, isEditMode, { hasSap: true });
        for (const name of [...resolved.core, ...resolved.plugins, ...resolved.late, MERGE_ENGINE]) {
          const releasePaths = releasePathsOf(name, index.files);
          expect({ name, listed: releasePaths.length > 0 }).toEqual({ name, listed: true });
          for (const releasePath of releasePaths) paths.add(releasePath);
        }
      }
      expect(paths.size).toBeGreaterThan(0);

      // A chunk's own imports are the next late load: the sortable plugin's chunk names
      // the vendored SortableJS bundle this way, and live sync's names the merge engine's.
      const pending = [...paths].filter((releasePath) => releasePath.startsWith("m/"));
      const followed = new Set();
      while (pending.length) {
        const chunk = pending.pop();
        if (followed.has(chunk)) continue;
        followed.add(chunk);
        const target = await fetch(new URL(ready.runtime + chunk, ready.baseURL));
        expect({ chunk, status: target.status }).toEqual({ chunk, status: 200 });
        const text = await target.text();
        for (const match of text.matchAll(IMPORT_SPEC)) {
          const next = path.posix.normalize(path.posix.join(path.posix.dirname(chunk), match[1]));
          if (!Object.hasOwn(index.files, next) || paths.has(next)) continue;
          paths.add(next);
          pending.push(next);
        }
      }

      for (const releasePath of paths) {
        expect({ releasePath, inIndex: Object.hasOwn(index.files, releasePath) }).toEqual({ releasePath, inIndex: true });
        const target = await fetch(new URL(ready.runtime + releasePath, ready.baseURL));
        expect({ releasePath, status: target.status }).toEqual({ releasePath, status: 200 });
      }

      const named = (pattern) => [...paths].filter((releasePath) => pattern.test(releasePath));
      const derive = named(/\/plugins\/derive-/);
      const mergeEngine = named(/\/sync\/merge-engine(-|\.js$)/);
      const sortableChunk = named(/\/vendor\/Sortable\.vendor-/);
      const sortablePlugin = named(/\/plugins\/sortable\.js$/);
      const sync = named(/\/sync\//);
      expect({ derive: derive.length > 0, mergeEngine: mergeEngine.length > 0 }).toEqual({ derive: true, mergeEngine: true });
      expect({ sortableChunk: sortableChunk.length > 0, sortablePlugin: sortablePlugin.length > 0 })
        .toEqual({ sortableChunk: true, sortablePlugin: true });
      expect({ sync: sync.length > 1 }).toEqual({ sync: true });
      console.info(
        `offline-host-contract: ${host.name} serves ${paths.size} release paths for the board's query ` +
          `(derive ${derive.join(",")}, merge engine ${mergeEngine.join(",")}, sortable ${[...sortableChunk, ...sortablePlugin].join(",")}, ` +
          `sync ${sync.join(",")})`,
      );
    }, CASE_TIMEOUT);

    test("a save of the projected board writes public URLs, keeps the change, and leaves every other card's bytes alone", async () => {
      count(host.name);
      const documentURL = ready.documents["kanban.html"].url;
      const first = await (await fetch(documentURL)).text();
      const etag = /documentetag="([^"]*)"/.exec(first)?.[1];
      expect(typeof etag).toBe("string");

      const before = '<h3 class="card-title" editmode:contenteditable inert-contenteditable="plaintext-only">Referral program for early users</h3>';
      const after = '<h3 class="card-title" editmode:contenteditable inert-contenteditable="plaintext-only">Referral program for late adopters</h3>';
      expect(first).toContain(before);
      const edited = first.replace(before, after);
      expect(edited).not.toBe(first);

      const save = ready.documents["kanban.html"].save;
      const saved = await fetch(save.url, {
        method: save.method,
        headers: { ...save.headers, "If-Match": etag },
        body: edited,
      });
      expect(saved.status).toBe(200);

      const disk = await readFile(path.join(root, "kanban.html"), "utf8");
      expect(disk).toContain("Referral program for late adopters");
      expect(disk).toContain("https://clayjs.com/v1/clay.js?plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu&exclude=richclay");
      expect(disk).toContain("https://clayjs.com/v1/fonts/work-sans.css");
      expect(disk).not.toContain("/_/clayjs/");
      expect(disk).not.toContain("clay-runtime-map");
      expect(disk).not.toContain("documentetag");

      const reopened = await (await fetch(documentURL)).text();
      const mapped = (html) => JSON.parse(DESCRIPTOR.exec(html)[1]).entries.map((entry) => entry.local);
      expect(mapped(reopened)).toEqual(mapped(first));

      const originalCards = cardsOf(template);
      const savedCards = cardsOf(disk);
      expect(originalCards.length).toBeGreaterThan(10);
      expect(savedCards.map((card) => card.id)).toEqual(originalCards.map((card) => card.id));
      const changed = savedCards.filter((card, index) => card.outer !== originalCards[index].outer);
      expect(changed.map((card) => card.id)).toEqual(["c-k3v9q2"]);
    }, CASE_TIMEOUT);

    test("the Page document\u0027s first switch to edit loads only release files the host serves, read with the host\u0027s own load plan", async () => {
      count(host.name);
      const query = CLAY_SCRIPT.exec(page)[1].replace(/^https:\/\/clayjs\.com\/v1\/clay\.js\?/, "");
      expect(query).toBe("plugins=page,menu");

      const tempDir = await mkdtemp(path.join(os.tmpdir(), `edit-set-${host.name}-`));
      try {
        const manifestResponse = await fetch(new URL(`${ready.runtime}m/manifest.json`, ready.baseURL));
        expect({ manifest: "m/manifest.json", status: manifestResponse.status }).toEqual({ manifest: "m/manifest.json", status: 200 });
        const manifest = JSON.parse(await manifestResponse.text());
        for (const releasePath of ["src/loader-logic.js", "src/lib/boot-imports.js", "src/page/features/registry.js", "m/manifest.json", `m/${manifest.edit}`]) {
          const response = await fetch(new URL(ready.runtime + releasePath, ready.baseURL));
          expect({ releasePath, status: response.status }).toEqual({ releasePath, status: 200 });
          const target = path.join(tempDir, releasePath);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, Buffer.from(await response.arrayBuffer()));
        }

        const script = path.join(ROOT, "tests/fixtures/offline-runtime/edit-set.mjs");
        const plan = JSON.parse(execFileSync(process.execPath, ["--no-warnings", script, tempDir, query], { encoding: "utf8" }));
        expect(plan.missing).toEqual([]);
        expect(plan.files.length).toBeGreaterThan(50);

        for (const file of plan.files) {
          expect({ file, inIndex: Object.hasOwn(index.files, file) }).toEqual({ file, inIndex: true });
          const response = await fetch(new URL(ready.runtime + file, ready.baseURL));
          expect({ file, status: response.status }).toEqual({ file, status: 200 });
          expect({ file, sha256: sha256(Buffer.from(await response.arrayBuffer())) })
            .toEqual({ file, sha256: index.files[file]?.sha256 });
        }

        const { entries } = JSON.parse(await readFile(path.join(tempDir, "m/manifest.json"), "utf8"));
        expect(plan.files).toContain(`m/${entries["page/editor.js"]}`);
        expect(plan.files).toContain(`m/${entries["core/mode-lifecycle.js"]}`);
        console.info(
          `offline-host-contract: ${host.name} loads ${plan.files.length} release files for the Page document\u0027s ` +
            `first edit boot (${query})`,
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }, CASE_TIMEOUT);

    test("after a first edit, a save and a reopen, a second change saves with the new ETag and the stale one is refused", async () => {
      count(host.name);
      const documentURL = ready.documents["page.html"].url;
      const first = await (await fetch(documentURL)).text();
      const etag1 = /documentetag="([^"]*)"/.exec(first)?.[1];
      expect(typeof etag1).toBe("string");

      const before = '<h1 data-id="title"></h1>';
      const after = '<h1 data-id="title">First note</h1>';
      expect(page.split(before).length - 1).toBe(1);
      expect(first.split(before).length - 1).toBe(1);
      const edited = first.replace(before, after);
      expect(edited).not.toBe(first);

      const save = ready.documents["page.html"].save;
      const saved = await fetch(save.url, {
        method: save.method,
        headers: { ...save.headers, "If-Match": etag1 },
        body: edited,
      });
      expect({ status: saved.status, body: await saved.text() }).toEqual({ status: 200, body: expect.any(String) });

      const reopened = await (await fetch(documentURL)).text();
      expect(reopened).toContain(ready.runtime);
      expect(reopened).toContain('id="clay-runtime-map"');
      expect(reopened).toContain("First note");
      const etag2 = /documentetag="([^"]*)"/.exec(reopened)?.[1];
      expect(typeof etag2).toBe("string");
      expect(etag2).not.toBe(etag1);

      const second = '<p data-id="p1"></p>';
      const secondAfter = '<p data-id="p1">Second note</p>';
      expect(reopened.split(second).length - 1).toBe(1);
      const editedAgain = reopened.replace(second, secondAfter);
      expect(editedAgain).not.toBe(reopened);
      const savedAgain = await fetch(save.url, {
        method: save.method,
        headers: { ...save.headers, "If-Match": etag2 },
        body: editedAgain,
      });
      expect({ status: savedAgain.status, body: await savedAgain.text() }).toEqual({ status: 200, body: expect.any(String) });

      const diskPath = path.join(root, "page.html");
      const diskBeforeStale = await readFile(diskPath);
      const stale = await fetch(save.url, {
        method: save.method,
        headers: { ...save.headers, "If-Match": etag1 },
        body: reopened,
      });
      const staleBody = await stale.text();
      console.info(`offline-host-contract: ${host.name} answered ${stale.status} to the stale ETag ${etag1}: ${staleBody}`);
      expect({ status: stale.status }).toEqual({ status: 412 });
      expect(await readFile(diskPath)).toEqual(diskBeforeStale);

      const disk = await readFile(diskPath, "utf8");
      expect(disk).toContain("First note");
      expect(disk).toContain("Second note");
      expect(disk).not.toContain("/_/clayjs/");
      expect(disk).not.toContain("clay-runtime-map");
      expect(disk).not.toContain("documentetag");
      expect(disk).toContain("https://clayjs.com/v1/clay.js?plugins=page,menu");
    }, CASE_TIMEOUT);
  });
}

suite("every configured host executed every case", () => {
  test("the case counts match the hosts", () => {
    for (const name of NAMES) expect({ name, cases: executed.get(name) ?? 0 }).toEqual({ name, cases: CASES });
  });
});
