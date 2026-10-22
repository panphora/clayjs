import { hostTest } from "./round14-host.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

hostTest.each([0, 1, 3])("400 saves retain provenance with %i comparisons per cycle", (comparisons) => {
  execFileSync(process.execPath, [
    "--import", fileURLToPath(new URL("./env-dom.js", import.meta.url)),
    fileURLToPath(new URL("./round14b-ancestry.mjs", import.meta.url)), String(comparisons),
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 15000 });
});
