// A second, bare static server (repo root) used only by the cross-origin fixture:
// it serves the PAGE on this port while clay.js + satellites are loaded from the
// stub server's origin (:4601). Port is argv[2], default 4602.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.argv[2]) || 4602;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    const path = url.pathname === "/" ? "/tests/fixtures/basic.html" : url.pathname;
    const data = await readFile(join(root, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(port, () => console.log(`clayjs static server: http://localhost:${port}`));
