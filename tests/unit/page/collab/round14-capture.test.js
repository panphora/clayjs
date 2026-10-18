import { runCase } from "./round14-run-case.js";

test("review/unframed-peer-descendant.mjs list", () => runCase("review/unframed-peer-descendant.mjs", ["list"]), 65000);
test("review/unframed-peer-descendant.mjs plain", () => runCase("review/unframed-peer-descendant.mjs", ["plain"]), 65000);
test("review/unframed-peer-descendant.mjs twice", () => runCase("review/unframed-peer-descendant.mjs", ["twice"]), 65000);
test("review/unframed-peer-descendant.mjs confirmed-early", () => runCase("review/unframed-peer-descendant.mjs", ["confirmed-early"]), 65000);
test("review/restart-lineage.mjs ", () => runCase("review/restart-lineage.mjs", []), 65000);
