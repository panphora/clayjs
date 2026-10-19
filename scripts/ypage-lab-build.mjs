import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedValue } from "../src/page/ybind/seed.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tests", "fixtures", "ypage-lab.html");

const blocks = [
  { id: "lab1", text: "The first paragraph of the lab page." },
  { id: "lab2", text: "A second paragraph, a little longer than the first one, so that a caret has room to move." },
  { id: "lab3", text: "Third." },
  { id: "lab4", text: "" },
];

const seed = JSON.stringify(seedValue(blocks)).replace(/</g, "\\u003c");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Yjs page lab</title>
  <script>window.clayEditMode = true;</script>
  <script src="/v1/clay.js?plugins=live"></script>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; margin: 1rem; }
    .lab { display: grid; grid-template-columns: minmax(0, 1fr) 18rem; gap: 1rem; }
    .lab-editor { border: 1px solid #888; padding: .5rem 1rem; min-height: 14rem; white-space: pre-wrap; }
    .lab-editor .ProseMirror { outline: none; min-height: 12rem; }
    .lab-panel dl { display: grid; grid-template-columns: auto 1fr; gap: .2rem .8rem; margin: 0 0 .8rem; }
    .lab-panel dd { margin: 0; font-family: ui-monospace, monospace; word-break: break-all; }
    @media (max-width: 40rem) { .lab { grid-template-columns: minmax(0, 1fr); } }
  </style>
</head>
<body>
  <h1>Yjs page lab</h1>
  <p>Open this page in two or three windows of the same browser.</p>
  <script type="application/json" merge="page" clay="live ephemeral">${seed}</script>
  <div id="lab-root" clay="no-save no-watch"></div>
  <script type="module" src="/tests/fixtures/ypage-lab/boot.js"></script>
</body>
</html>
`;

await writeFile(OUT, html);
console.log("tests/fixtures/ypage-lab.html");
