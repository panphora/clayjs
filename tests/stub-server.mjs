import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = join(root, "tests", "tmp");
await mkdir(tmp, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname.startsWith("/_/save")) {
    if (url.searchParams.get("fail") === "1" || req.headers["x-stub-fail"]) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ msg: "Stub says no" }));
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const page = new URL(req.headers["page-url"] || "http://x/unknown.html");
    const name = basename(page.pathname) || "index.html";
    const token = url.pathname.replace(/^\/_\/save\/?/, "");   // "" for the plain endpoint

    // Spec §3: the body is the document, as text, always.
    await writeFile(join(tmp, name), body);
    await writeFile(join(tmp, name + ".meta.json"), JSON.stringify({
      token,
      pageUrl: req.headers["page-url"] || null,
      saveTrigger: req.headers["save-trigger"] || null,
      contentType: req.headers["content-type"] || null,
    }, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ msg: "Saved" }));
  }
  try {
    const raw = url.pathname === "/" ? "/tests/fixtures/basic.html" : url.pathname;
    // Mirror the deploy so fixtures load the URL shape production actually serves.
    // Every library URL carries a version prefix (/v1/clay.js, /1.0.0/src/loader.js);
    // build.js flattens entries/ into each prefix, so /v1/clay.js is entries/clay.js on
    // disk. The unversioned /clay.js is retired and must 404 here exactly as it does in
    // production: a fixture suite that answers the old URL cannot notice a page still
    // asking for it, which is how the homepage shipped loading a 404.
    const path = raw.replace(/^\/(?:v\d+|\d+\.\d+\.\d+)\//, "/");
    const versioned = path !== raw;
    const data = versioned
      ? await readFile(join(root, "entries", path)).catch(() => readFile(join(root, path)))
      : await readFile(join(root, path));
    const headers = { "Content-Type": TYPES[extname(path)] || "application/octet-stream" };
    // Simulate the production _headers rule (/src/* -> Access-Control-Allow-Origin: *)
    // so a classic bootstrap's cross-origin import() of /src/* succeeds in tests too.
    if (path.startsWith("/src/")) headers["Access-Control-Allow-Origin"] = "*";
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(4601, () => console.log("clayjs stub server: http://localhost:4601"));
