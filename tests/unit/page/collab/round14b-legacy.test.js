import { hostTest } from "./round14-host.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

hostTest.each(["legacy", "v2", "plain"])("stamped peer capture retires known landed ops: %s", (format) => {
  execFileSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL("./round14b-legacy.mjs", import.meta.url)), format,
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10000 });
});
