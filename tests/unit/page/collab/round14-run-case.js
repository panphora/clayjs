import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runCase(name, args = []) {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const env = fileURLToPath(new URL("./env-dom.js", import.meta.url));
  const file = fileURLToPath(new URL(`./round14-fixtures/${name}`, import.meta.url));
  const out = spawnSync(process.execPath, ["--import", env, file, ...args], {
    cwd: root, encoding: "utf8", timeout: 60000,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  if (out.error || out.status !== 0) throw new Error(`${name}: ${out.error ?? out.status}\n${out.stdout}\n${out.stderr}`);
}
