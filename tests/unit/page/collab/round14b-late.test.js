import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test.each(["state-first", "confirm-first", "lost-answer"])("saved pending tail is counted once: %s", (order) => {
  for (const adds of [2, 3]) execFileSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL("./round14b-late.mjs", import.meta.url)), order,
  ], { env: { ...process.env, NODE_OPTIONS: "", ADDS: String(adds) }, timeout: 10000 });
});
