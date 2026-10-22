import { hostTest } from "./round14-host.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

hostTest.each(["retired", "zero"])("unapplied old request retries under the new epoch's generation: %s", (variant) => {
  execFileSync(process.execPath, [
    fileURLToPath(new URL("./round14c-generation.mjs", import.meta.url)), variant,
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 5000 });
});
