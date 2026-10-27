// Document 12 §8's cross-host fixture: does each host keep the page state it was
// handed, across a restart, for the exact bytes it stored?
//
// It launches each host's offline fixture adapter in a temporary directory (never a
// production host, never the network beyond loopback), serves a page document, saves
// one whose page state carries a DELETION, stops the adapter, starts it again on the
// same directory, and asks the host for the page state of that revision, conditionally
// on the stamp the save returned. Per host it prints the persisted page-state byte hash
// and the text the state reopens to, and it fails when a host answers nothing or answers
// something other than what was saved.
//
//   node scripts/check-page-recovery-hosts.mjs --fixtures
//   node scripts/check-page-recovery-hosts.mjs --fixtures --htmlclay <dir> --hyperclay-local <dir>
//
// A host with no runnable local fixture adapter is reported as skipped, never faked:
// hyperclay's page-state tests need its Postgres test database, which is not a fixture
// adapter that can be launched against a temporary directory.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import * as Y from "../src/vendor/yjs.vendor.js";
import { seedValue } from "../src/page/ybind/seed.js";
import { createPageDoc } from "../src/page/ybind/layout.js";
import { blocksFromPageValues } from "../src/page/ybind/decode.js";
import { entriesOf } from "../src/page/ybind/parts.js";
import { fragmentCleaner, project, renderModel, revOf } from "../src/page/projection.js";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);
const READY_TIMEOUT = 300000;
const STOP_TIMEOUT = 10000;

const KEPT = "Pages keep every keystroke.";
const DELETED = " TEMPORARY";
const SAVED_TEXT = `${KEPT} words survive a restart.`;
const SAVED_STATE_TEXT = `${KEPT}${DELETED} words survive a restart.`;

const dom = new JSDOM("");
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// Where a run of the flow's text starts, in Y.Text offsets: the flow carries its block
// markers as embeds, so the text's own offsets and the text's Y.Text offsets differ.
function flowOffset(page, text) {
  const offsets = [];
  let index = 0;
  let joined = "";
  for (const op of page.flow.toDelta()) {
    if (typeof op.insert !== "string") {
      index += 1;
      continue;
    }
    for (let i = 0; i < op.insert.length; i += 1) offsets.push(index + i);
    joined += op.insert;
    index += op.insert.length;
  }
  const found = joined.indexOf(text);
  if (found < 0) return -1;
  const at = offsets[found];
  if (!Number.isInteger(at) || offsets[found + text.length - 1] !== at + text.length - 1) return -1;
  return at;
}

// The page value as §2's ybind provider composes it, then one transaction that deletes a
// word: the deletion is the edit a state-vector comparison cannot see, so a host that
// kept only the older snapshot answers the text without it and is caught here.
function savedValue() {
  const seed = seedValue([{ id: "p1", t: "paragraph", text: SAVED_STATE_TEXT }]);
  const ydoc = new Y.Doc();
  ydoc.clientID = 2;
  for (const [, text] of entriesOf(seed.y)) Y.applyUpdateV2(ydoc, Y.fromBase64(text));
  const before = Y.encodeStateVector(ydoc);
  const page = createPageDoc(ydoc);
  const at = flowOffset(page, DELETED);
  if (at < 0) throw new Error(`the seeded page does not carry ${JSON.stringify(DELETED)}`);
  ydoc.transact(() => page.flow.delete(at, DELETED.length), "page-local");
  return { v: 1, g: 0, y: { ...seed.y, "u2-0": Y.toBase64(Y.encodeStateAsUpdateV2(ydoc, before)) } };
}

const VALUE = savedValue();
const TAG = `<script type="application/json" merge="page" clay="live">${JSON.stringify(VALUE)}</script>`;

function articleOf(value) {
  const model = project(blocksFromPageValues([value]));
  return { html: renderModel(model, { fallbackOf: () => "", clean: fragmentCleaner(dom.window.document) }), rev: revOf(model) };
}

const ARTICLE = articleOf(VALUE);

function pageDocument() {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    "<title>Recovery check</title>",
    "</head>",
    "<body>",
    TAG,
    `<article data-page data-rev="${ARTICLE.rev}">${ARTICLE.html}</article>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

// The text an editor shows for one stored page state: the same projection the save
// wrote, run over the state the host handed back.
function textOfState(tag) {
  const open = tag.indexOf(">");
  const close = tag.lastIndexOf("</script>");
  if (open < 0 || close < open) throw new Error("the page tag is not a script element");
  const { html } = articleOf(JSON.parse(tag.slice(open + 1, close)));
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}

const HOSTS = [
  {
    name: "htmlclay",
    flag: "--htmlclay",
    dir: path.resolve(REPO, "../htmlclay"),
    // The sidecar lives under the history key, and this host names its page-state
    // resource per session token, the one it stamps on the served document.
    pageStateRequest: (ready, doc, served) => {
      const token = /\shtmlclaytoken="([^"]*)"/.exec(served)?.[1];
      if (!token) throw new Error("the served document carries no htmlclaytoken");
      return { url: `${ready.baseURL}/_/page-state/${token}`, headers: { "Document-URL": doc.url } };
    },
  },
  {
    name: "hyperclay-local",
    flag: "--hyperclay-local",
    dir: path.resolve(REPO, "../hyperclay-local"),
    pageStateRequest: (ready, doc) => ({ url: `${ready.baseURL}/_/page-state`, headers: { "Document-URL": doc.url } }),
  },
  {
    name: "hyperclay",
    flag: "--hyperclay",
    dir: path.resolve(REPO, "../hyperclay"),
  },
];

// A fixture adapter is a directory that can serve documents from a temporary root: the
// two local hosts both ship one under scripts/ (Node) or cmd/ (Go).
function adapterOf(dir) {
  if (!existsSync(dir)) return null;
  if (existsSync(path.join(dir, "scripts/offline-fixture-server.mjs"))) {
    return { command: [process.execPath, "scripts/offline-fixture-server.mjs"], cwd: dir };
  }
  if (existsSync(path.join(dir, "cmd/offline-fixture-server"))) {
    return { command: ["go", "run", "./cmd/offline-fixture-server"], cwd: dir };
  }
  return null;
}

function start(adapter, root) {
  const child = spawn(adapter.command[0], [...adapter.command.slice(1), "--root", root], {
    cwd: adapter.cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no READY line within ${READY_TIMEOUT} ms\n${stderr}`)), READY_TIMEOUT);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const line = stdout.split("\n").find((entry) => entry.startsWith("READY "));
      if (!line) return;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line.slice("READY ".length)));
      } catch (error) {
        reject(new Error(`unreadable READY line: ${error.message}`));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`exited with ${code} before READY\n${stderr}`));
    });
  });
  return { child, ready, log: () => stderr };
}

// One fetch that names what failed: undici's own message is a bare "fetch failed", and a
// check that cannot say which request died is a check nobody can act on.
async function fetched(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const cause = error?.cause;
    throw new Error(`${options?.method ?? "GET"} ${url} did not complete: ${cause?.code ?? ""} ${cause?.message ?? error.message}`.trim());
  }
}

const stopped = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, STOP_TIMEOUT);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });

async function save(ready) {
  const doc = ready.documents["page.html"];
  if (!doc) throw new Error("the adapter did not list page.html");
  const served = await (await fetched(doc.url)).text();
  const etag = /\sdocumentetag="([^"]*)"/.exec(served)?.[1];
  if (!etag) throw new Error("the served document carries no documentetag");
  const answer = await fetched(doc.save.url, {
    method: doc.save.method,
    headers: { ...doc.save.headers, "If-Match": etag },
    body: pageDocument(),
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`the save answered ${answer.status}: ${text.trim().slice(0, 200)}`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error("the save answer is not JSON"); }
  if (typeof body.etag !== "string" || !body.etag) throw new Error("the save answer carries no stamp");
  return { doc, etag: body.etag };
}

// After the restart the host serves the document again: the stamp it prints is the one
// its stored bytes have (the save's, when nothing moved), and the session token a page
// asks the page-state resource with belongs to the process that served the document.
async function readState(host, ready, doc, etag, value) {
  const served = await (await fetched(doc.url)).text();
  const reopenedEtag = /\sdocumentetag="([^"]*)"/.exec(served)?.[1];
  if (!reopenedEtag) throw new Error("the reopened document carries no documentetag");
  if (reopenedEtag !== etag) throw new Error(`the reopened document is stamped ${JSON.stringify(reopenedEtag)}, not the saved ${JSON.stringify(etag)}`);
  const request = host.pageStateRequest(ready, doc, served);
  const answer = await fetched(request.url, {
    method: "GET",
    headers: { ...request.headers, "If-Match": etag },
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`no page state for the saved bytes (${answer.status} ${text.trim().slice(0, 160)})`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error("the page-state answer is not JSON"); }
  if (body.version !== 1) throw new Error(`the page-state answer is version ${JSON.stringify(body.version)}`);
  if (typeof body.tag !== "string" || !body.tag) throw new Error("the page-state answer carries no tag");
  if (typeof body.stateHash !== "string" || !body.stateHash) throw new Error("the page-state answer carries no state digest");
  if (body.etag !== etag) throw new Error(`the page state belongs to ${JSON.stringify(body.etag)}, not the saved ${JSON.stringify(etag)}`);
  const digest = sha256(body.tag);
  if (digest !== body.stateHash) throw new Error(`the stored tag hashes to ${digest}, not the state digest ${body.stateHash}`);
  if (body.tag !== value.tag) throw new Error("the stored tag is not the one that was saved");
  const reopened = textOfState(body.tag);
  if (reopened !== value.text) throw new Error(`the state reopens as ${JSON.stringify(reopened)}, not ${JSON.stringify(value.text)}`);
  return { stateHash: body.stateHash, bytes: Buffer.byteLength(body.tag, "utf8"), generation: body.generation, text: reopened };
}

async function checkHost(host) {
  const adapter = adapterOf(host.dir);
  if (!adapter) {
    if (host.name === "hyperclay") return { skipped: "no fixture adapter" };
    throw new Error(`no fixture adapter under ${host.dir}`);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), `clay-page-recovery-${host.name}-`));
  let running = null;
  let log = () => "";
  try {
    await writeFile(path.join(root, "page.html"), pageDocument());
    running = start(adapter, root);
    log = running.log;
    const first = await running.ready;
    const saved = await save(first);
    await stopped(running.child);
    running = start(adapter, root);
    log = running.log;
    const second = await running.ready;
    const reopened = second.documents["page.html"];
    if (!reopened) throw new Error("the restarted adapter did not list page.html");
    const result = await readState(host, second, reopened, saved.etag, { tag: TAG, text: SAVED_TEXT });
    return result;
  } catch (error) {
    const said = log().trim().split("\n").slice(-2).join(" | ");
    if (said) throw new Error(`${error.message} (the adapter said: ${said})`);
    throw error;
  } finally {
    if (running) await stopped(running.child);
    await rm(root, { recursive: true, force: true });
  }
}

const USAGE = "usage: node scripts/check-page-recovery-hosts.mjs --fixtures [--htmlclay <dir>] [--hyperclay-local <dir>] [--hyperclay <dir>]";

function usage(why) {
  if (why) console.error(`check-page-recovery-hosts: ${why}`);
  console.error(USAGE);
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  let fixtures = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fixtures") {
      fixtures = true;
      continue;
    }
    const host = HOSTS.find((entry) => entry.flag === arg);
    if (!host) usage(`unknown argument ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) usage(`${arg} needs a directory`);
    host.dir = path.resolve(value);
    i += 1;
  }
  if (!fixtures) usage("--fixtures launches the hosts' fixture adapters; there is no other mode");

  console.log(`check-page-recovery-hosts: saving a page whose state deletes ${JSON.stringify(DELETED.trim())}, ` +
    `so a host that kept only the earlier article answers ${JSON.stringify(SAVED_STATE_TEXT)}`);

  let failed = false;
  for (const host of HOSTS) {
    try {
      const result = await checkHost(host);
      if (result.skipped) {
        console.log(`${host.name}: skipped (${result.skipped})`);
        continue;
      }
      console.log(
        `${host.name}: page-state sha256 ${result.stateHash} (${result.bytes} B, generation ${result.generation}), ` +
          `reopened ${JSON.stringify(result.text)}`,
      );
    } catch (error) {
      failed = true;
      console.log(`${host.name}: FAILED ${error.message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
