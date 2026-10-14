// node tests/bench/save-bench.mjs [count ...]
// Times ClayJS + sapjs in headless Chromium on a todo page of N rows, in edit mode:
// one sapjs change with the ClayJS hub, undo and dirty tracking attached; the
// autosave dirty check; and a full Cmd+S save until the host answers.
// SAP_JS=<path> serves that file as /v1/sap.js instead of entries/sap.js.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const COUNTS = process.argv.slice(2).map(Number).filter(Boolean);
if (!COUNTS.length) COUNTS.push(1000, 10000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const pages = new Map();
let saves = 0;

function todoPage(n) {
  let rows = "";
  for (let i = 0; i < n; i++) {
    const done = i % 3 === 0;
    rows += `<li item data-id="t${i}" class:done="item.done"${done ? ' class="done"' : ""}><input type="checkbox" bind="done" persist${done ? " checked" : ""}><span bind="title">Task number ${i}</span></li>\n`;
  }
  const left = n - Math.ceil(n / 3);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>save bench ${n}</title>
<script>window.clayEditMode = true;</script>
<script src="/v1/clay.js?plugins=sync,sortable,undo"></script>
<script src="/v1/sap.js"></script>
</head>
<body>
<main sap>
<ul items="todos">
<li item template data-id="" class:done="item.done"><input type="checkbox" bind="done" persist><span bind="title"></span></li>
${rows}</ul>
<output text="count(state.todos, t => !t.done) + ' left'">${left} left</output>
</main>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname.startsWith("/_/save")) {
    for await (const _ of req);
    saves++;
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ msg: "Saved" }));
  }
  if (pages.has(url.pathname)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(pages.get(url.pathname));
  }
  try {
    const path = url.pathname.replace(/^\/(?:v\d+|\d+\.\d+\.\d+)\//, "/");
    const versioned = path !== url.pathname;
    let data;
    if (versioned && path === "/sap.js" && process.env.SAP_JS) data = await readFile(process.env.SAP_JS);
    else data = versioned
      ? await readFile(join(ROOT, "entries", path)).catch(() => readFile(join(ROOT, path)))
      : await readFile(join(ROOT, path));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

for (const n of COUNTS) {
  pages.set(`/bench-${n}.html`, todoPage(n));
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`${base}/bench-${n}.html`);
  await page.waitForFunction(() => window.Sap && window.Sap.status().apps.length > 0 && window.clay, null, { timeout: 120000 });
  const load = Date.now() - t0;
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const tick = () => new Promise((res) => setTimeout(res, 0));
    const median = (s) => { s.sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(1); };
    const box = document.querySelector('[data-id="t5"] input');
    const change = [];
    for (let i = 0; i < 9; i++) {
      await tick();
      const a = performance.now();
      box.checked = !box.checked;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      await tick();
      document.body.offsetHeight;
      change.push(performance.now() - a);
    }
    const save = [];
    for (let i = 0; i < 5; i++) {
      box.checked = !box.checked;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      const a = performance.now();
      const done = new Promise((res) => document.addEventListener("clay:save-saved", res, { once: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", keyCode: 83, metaKey: true, ctrlKey: true, bubbles: true }));
      await Promise.race([done, new Promise((res) => setTimeout(res, 20000))]);
      save.push(performance.now() - a);
      await new Promise((res) => setTimeout(res, 300));
    }
    return { change: median(change), save: median(save), bytes: document.documentElement.outerHTML.length, left: document.querySelector("output").textContent };
  });
  console.log(`todo+clay ${String(n).padStart(6)}  load ${load}   change ${r.change}   save ${r.save}   bytes ${r.bytes}   ${r.left}   saves ${saves}   errors ${errors.length ? errors.slice(0, 2).join(" | ") : 0}`);
  saves = 0;
  await page.close();
}
await browser.close();
server.close();
