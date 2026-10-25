/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalizeRuntimeHTML } from "../../../src/server/offline-runtime/index.js";
import { verifyOfflineClosure } from "../../../scripts/verify-offline-closure.mjs";

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/offline-runtime/html.json");
const READY_TIMEOUT = 120000;
const CASE_TIMEOUT = 120000;

const NAMES = ["htmlclay", "hyperclay-local"];
const CASES = 3;

const configured = process.env.CLAY_OFFLINE_HOSTS ? JSON.parse(process.env.CLAY_OFFLINE_HOSTS) : null;
const suite = configured ? describe : describe.skip;
if (!configured) {
  console.info("offline-host-contract: CLAY_OFFLINE_HOSTS is unset, skipping the cross-host closure contract");
}

const executed = new Map();
const count = (name) => executed.set(name, (executed.get(name) ?? 0) + 1);

// Response-scoped root attributes: a host stamps its own documentetag and, on HTML Clay,
// save tokens (testdata/conformance/host-test.html strips the same set). None is written
// to the file.
const RESPONSE_ATTR = /\s+(?:documentetag|savetoken|htmlclaytoken|documentid|htmlclayid)="[^"]*"/g;
const stripResponseMetadata = (html) => html.replace(RESPONSE_ATTR, "");
const LOCAL_URL = /(?:src|href)="([^"]*\/_\/clayjs\/[^"]*)"/g;

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

for (const host of configured ?? []) {
  suite(host.name, () => {
    let root;
    let child;
    let ready;
    let index;
    let localIndex;
    let board;
    let doc;

    beforeAll(async () => {
      const kanban = JSON.parse(await readFile(FIXTURES, "utf8")).cases.find((entry) => entry.name === "kanban-head");
      board = kanban.input;
      doc = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Notes</title>\n</head>\n<body>\n<p>Notes</p>\n</body>\n</html>\n";
      root = await mkdtemp(path.join(os.tmpdir(), `clay-host-${host.name}-`));
      await mkdir(path.join(root, "notes/2026"), { recursive: true });
      await writeFile(path.join(root, "board.html"), board);
      await writeFile(path.join(root, "notes/2026/doc.html"), doc);
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
  });
}

suite("every configured host executed every case", () => {
  test("the case counts match the hosts", () => {
    for (const name of NAMES) expect({ name, cases: executed.get(name) ?? 0 }).toEqual({ name, cases: CASES });
  });
});
