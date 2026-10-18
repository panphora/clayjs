import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test.each([0, 2])("a host advertising provenance version %i: refused below 2, saved at 2", (version) => {
  execFileSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL("./round14b-host-gate.mjs", import.meta.url)), String(version),
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10000 });
});
