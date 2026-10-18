import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("400 accepted file saves retain no settled capture records", () => {
  const out = spawnSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL("./round14d-retention.mjs", import.meta.url)),
  ], { encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_OPTIONS: "" } });
  if (out.error || out.status !== 0) throw new Error(`${out.error ?? out.status}\n${out.stdout}\n${out.stderr}`);
}, 65000);
