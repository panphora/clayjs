/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.test/long-session.html"}
 */
// A long session on the 2,000-block fixture: two real page editors, bindings and
// stores, a seeded operation log, a room that can pause, duplicate and reorder
// delivery, checkpoints through the real projection, and a journal that is
// destroyed and recovered. One fixed seed: a pass that depends on another seed
// is a failure. The harness is in helpers/long-session.js, shared with
// scripts/measure-page-session.mjs.
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };

import { jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
import { runLongSession } from "./helpers/long-session.js";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const OPERATIONS = Number(process.env.CLAY_LONG_SESSION_OPERATIONS ?? 200);

test(`a seeded ${OPERATIONS}-operation session on ${2000} blocks with two real editors converges after every batch`, async () => {
  try {
    const report = await runLongSession({ operations: OPERATIONS, expect });
    console.log(JSON.stringify(report));
  } finally {
    jest.restoreAllMocks();
  }
}, 600000);
