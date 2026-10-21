import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const run = (script, ...args) => {
  const out = spawnSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL(`./${script}`, import.meta.url)),
    ...args,
  ], { encoding: "utf8", timeout: 90000, env: { ...process.env, NODE_OPTIONS: "" } });
  if (out.error || out.status !== 0) throw new Error(`${out.error ?? out.status}\n${out.stdout}\n${out.stderr}`);
};

describe("a peer's checkpoint or a restarted room while a store's save is unanswered", () => {
  test.each(["counter", "list", "confirm-first", "state-first"])("checkpoint %s applies each captured edit once", (variant) => run("round14d-checkpoint.mjs", variant), 95000);
  test.each(["restart", "control"])("room %s applies each captured edit once", (variant) => run("round14d-restart.mjs", variant), 95000);
});

describe("a store's wait never holds the document", () => {
  test.each(["omitted", "hang", "uncertain-proved"])("%s", (variant) => run("round14d-lifecycle.mjs", variant), 95000);
  test("a stopped lane falls back to file values", () => run("round14d-stopped.mjs"), 95000);
});

describe("a save with no answer that nothing can prove", () => {
  test.each(["uncertain", "uncertain-network", "uncertain-timeout", "uncertain-only"])("%s gives up its ops with a notice and the document saves", (variant) => run("round14d-lifecycle.mjs", variant), 95000);
  test("a document save while the ops wait sends the store exactly as the unanswered save did", () => run("round14d-window.mjs"), 95000);
  test.each(["bad-gateway", "network", "timeout"])("%s leaves later edits of every store and the page saveable", (variant) => run("round14d-uncertain.mjs", variant), 95000);
});
