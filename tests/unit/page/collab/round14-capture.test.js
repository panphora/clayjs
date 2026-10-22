import { hostTest } from "./round14-host.js";
import { runCase } from "./round14-run-case.js";

hostTest("review/unframed-peer-descendant.mjs list", () => runCase("review/unframed-peer-descendant.mjs", ["list"]), 65000);
hostTest("review/unframed-peer-descendant.mjs plain", () => runCase("review/unframed-peer-descendant.mjs", ["plain"]), 65000);
hostTest("review/unframed-peer-descendant.mjs twice", () => runCase("review/unframed-peer-descendant.mjs", ["twice"]), 65000);
hostTest("review/unframed-peer-descendant.mjs confirmed-early", () => runCase("review/unframed-peer-descendant.mjs", ["confirmed-early"]), 65000);
hostTest("review/restart-lineage.mjs ", () => runCase("review/restart-lineage.mjs", []), 65000);
