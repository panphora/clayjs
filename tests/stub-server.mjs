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

    let html = body;
    if ((req.headers["content-type"] || "").includes("application/json")) {
      const envelope = JSON.parse(body);                        // {content, snapshotHtml, userDriven}
      html = envelope.content;
      await writeFile(join(tmp, name + ".envelope.json"), JSON.stringify(envelope, null, 2));
    }
    await writeFile(join(tmp, name), html);
    await writeFile(join(tmp, name + ".meta.json"), JSON.stringify({
      token,
      pageUrl: req.headers["page-url"] || null,
      userDriven: req.headers["x-hyperclay-user-driven"] || null,
      contentType: req.headers["content-type"] || null,
    }, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ msg: "Saved" }));
  }
  try {
    const path = url.pathname === "/" ? "/tests/fixtures/basic.html" : url.pathname;
    const data = await readFile(join(root, path));
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
