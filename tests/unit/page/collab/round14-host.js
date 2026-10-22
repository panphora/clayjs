import { existsSync } from "node:fs";

export const hasHyperclay = existsSync(new URL("../../../../../hyperclay/server-lib/live-data-rooms.js", import.meta.url));
export const hostTest = hasHyperclay ? test : test.skip;
export const hostDescribe = hasHyperclay ? describe : describe.skip;
