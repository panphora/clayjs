/**
 * @jest-environment node
 */
import { afterAll, describe, expect, jest, test } from "@jest/globals";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

jest.setTimeout(900000);

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SCRIPT = path.join(ROOT, "scripts/check-page-recovery-hosts.mjs");

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

const lineOf = (stdout, host) => stdout.split("\n").filter((line) => line.startsWith(`${host}: `));

// A fixture adapter that stores the document it is handed and answers no page state for
// it: the host Step 3 and Step 4 must not be for, and the answer the script has to catch.
const DROPPING_ADAPTER = `import http from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const root = path.resolve(args[args.indexOf("--root") + 1]);
const document = path.join(root, "page.html");
const stamp = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/_/save") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await writeFile(document, Buffer.concat(chunks));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, msg: "Saved", msgType: "success", etag: stamp(await readFile(document)) }));
    return;
  }
  if (url.pathname.startsWith("/_/page-state")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "page state unavailable", code: "no-page-state" }));
    return;
  }
  const bytes = await readFile(document).catch(() => null);
  if (!bytes) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(bytes.toString("utf8").replace(/<html([^>]*)>/, (open, attrs) => \`<html\${attrs} documentetag="\${stamp(bytes)}" htmlclaytoken="stub-token">\`));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = \`http://127.0.0.1:\${server.address().port}\`;
const url = \`\${baseURL}/page.html\`;
process.stdout.write(\`READY \${JSON.stringify({
  host: "offline-fixture-server",
  baseURL,
  runtime: "/_/clayjs/1.17.0/",
  documents: {
    "page.html": {
      url,
      save: { method: "POST", url: \`\${baseURL}/_/save\`, headers: { "Content-Type": "text/plain;charset=UTF-8", "Document-URL": url } },
    },
  },
})}\\n\`);
`;

describe("check-page-recovery-hosts", () => {
  const roots = [];
  afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });

  test("every host the fixture run launches reports a result, and the one that keeps page state reports the saved text", async () => {
    const { stdout } = await run(["--fixtures"]);
    console.info(`check-page-recovery-hosts:\n${stdout}`);

    const hosts = ["htmlclay", "hyperclay-local", "hyperclay"];
    for (const host of hosts) {
      const lines = lineOf(stdout, host);
      expect({ host, lines: lines.length }).toEqual({ host, lines: 1 });
      expect({ host, empty: lines[0] === `${host}: ` }).toEqual({ host, empty: false });
    }

    const [local] = lineOf(stdout, "hyperclay-local");
    expect(local).toMatch(/^hyperclay-local: page-state sha256 [0-9a-f]{64} \(\d+ B, generation [0-9a-f]{32}\), reopened "/);
    expect(local).toContain('reopened "Pages keep every keystroke. words survive a restart."');
    expect(local).not.toContain("TEMPORARY");

    const [third] = lineOf(stdout, "hyperclay");
    expect(third).toMatch(/^hyperclay: (skipped \(no fixture adapter\)|page-state sha256 [0-9a-f]{64})/);
  });

  test("a host whose fixture adapter drops the page state makes the run fail", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dropping-adapter-"));
    roots.push(dir);
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await writeFile(path.join(dir, "scripts/offline-fixture-server.mjs"), DROPPING_ADAPTER);

    const { code, stdout } = await run(["--fixtures", "--htmlclay", dir, "--hyperclay-local", dir]);
    console.info(`check-page-recovery-hosts (dropping adapter):\n${stdout}`);

    expect(code).toBe(1);
    for (const host of ["htmlclay", "hyperclay-local"]) {
      const [line] = lineOf(stdout, host);
      expect({ host, failed: /: FAILED no page state for the saved bytes/.test(line) }).toEqual({ host, failed: true });
    }
  });
});
