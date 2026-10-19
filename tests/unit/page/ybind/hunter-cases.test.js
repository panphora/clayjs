import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "harness", "cases");
const names = readdirSync(dir).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => f.slice(0, -3)).sort();

test("the case folder is not empty", () => {
  expect(names.length).toBe(20);
});

test.each(names)("case %s", async (name) => {
  const { run } = await import(join(dir, `${name}.js`));
  const result = await run();
  if (!result.pass) throw new Error(result.out.join("\n"));
}, 120000);
