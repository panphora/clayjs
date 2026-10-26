import { describe, expect, test } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COALESCE_MS,
  EXPIRE_MS,
  MAX_PAGE_ID_BYTES,
  MAX_RECORD_ID,
  MAX_REL_BYTES,
  MAX_SELECTION_IDS,
  MAX_TARGET_BYTES,
  PRESENCE_VERSION,
  RATE_BURST,
  RATE_PER_SECOND,
  RECORD_FIELDS,
  RENEW_MS,
  normalizeEditing,
  normalizeSelfSession,
  normalizeSessions,
  requestBody,
  targetKey,
  validateTarget,
} from "../../src/sync/presence-target.js";

/**
 * The target union, on its own.
 *
 * Kanban's record targets and a Document's page targets are one contract: what an
 * `editing` value may be, what bounds it, how a roster session is read, and the
 * exact bytes a target becomes on the wire. The legacy dotted path is asserted
 * byte for byte, because the request Kanban's host receives today must not change
 * shape because a second kind of target was added beside it.
 */

const accepted = (value) => {
  const result = validateTarget(value);
  expect(result.ok).toBe(true);
  return result.target;
};

const refused = (value, reason) => {
  const result = validateTarget(value);
  expect(result.ok).toBe(false);
  if (reason) expect(result.reason).toBe(reason);
};

const RECORD = { kind: "record", id: "card-42", field: "title" };
const PAGE = {
  kind: "page",
  v: 1,
  epoch: "room-7",
  generation: 12,
  selection: {
    kind: "text",
    anchor: { block: "p1", rel: "AAAAAA==" },
    head: { block: "p1", rel: "AAAAAQ==" },
  },
};

describe("the legacy dotted path", () => {
  test("a block path is still a target, exactly as it was", () => {
    expect(accepted("0")).toBe("0");
    expect(accepted("1.2")).toBe("1.2");
    expect(accepted(Array.from({ length: 64 }, (_, i) => i % 10).join(".")).length).toBeGreaterThan(0);
    expect(accepted(null)).toBeNull();
  });

  test("a path deeper than the marker's own bound is refused, not clamped", () => {
    refused(Array.from({ length: 65 }, () => "1").join("."), "path");
    refused("", "path");
    refused("a.b", "path");
    refused("1..2", "path");
    refused("1.2 ", "path");
  });

  test("the dotted request body is byte-for-byte what the host reads today", () => {
    expect(JSON.stringify(requestBody({ target: "1.2" }))).toBe('{"editing":"1.2"}');
    expect(JSON.stringify(requestBody({ target: null }))).toBe('{"editing":null}');
    expect(JSON.stringify(requestBody({ target: null, session: { token: "t" }, n: 3 }))).toBe('{"editing":null}');
  });
});

describe("a record target", () => {
  test("travels in the single-field shape before the connection issues a session", () => {
    const target = accepted(RECORD);

    // Kanban M8's payload, character for character.
    expect(JSON.stringify(requestBody({ target }))).toBe('{"editing":{"kind":"record","id":"card-42","field":"title"}}');
  });

  test("uses the extended envelope once a session exists", () => {
    const target = accepted(RECORD);

    expect(JSON.stringify(requestBody({ target, session: { id: "s", token: "opaque" }, n: 7 }))).toBe(
      '{"v":1,"session":"opaque","n":7,"editing":{"kind":"record","id":"card-42","field":"title"}}'
    );
  });

  test("a fieldless Journal record is valid and keeps its exact shape", () => {
    const target = accepted({ kind: "record", id: "journal-1" });

    expect(target).toEqual({ kind: "record", id: "journal-1" });
    expect(JSON.stringify(requestBody({ target }))).toBe('{"editing":{"kind":"record","id":"journal-1"}}');
  });

  test("every documented field is valid, and nothing else is", () => {
    expect([...RECORD_FIELDS]).toEqual([
      "title", "description", "labels", "members", "dates", "checklist", "comment", "attachments",
    ]);
    for (const field of RECORD_FIELDS) expect(accepted({ kind: "record", id: "c1", field })).toEqual({ kind: "record", id: "c1", field });
    refused({ kind: "record", id: "c1", field: "colour" }, "field");
    refused({ kind: "record", id: "c1", field: null }, "field");
  });

  test("an id is ASCII and at most 128 characters", () => {
    expect(accepted({ kind: "record", id: "x".repeat(MAX_RECORD_ID) }).id.length).toBe(128);
    refused({ kind: "record", id: "x".repeat(MAX_RECORD_ID + 1) }, "id");
    refused({ kind: "record", id: "café" }, "id");
    refused({ kind: "record", id: "" }, "id");
    refused({ kind: "record", id: 42 }, "id");
  });

  test("unknown keys and unknown kinds are refused rather than ignored", () => {
    refused({ kind: "record", id: "c1", secret: "x" }, "key");
    refused({ kind: "card", id: "c1" }, "kind");
    refused({ kind: "record" }, "id");
    refused({ kind: "record", id: "c1", field: "title", v: 1 }, "key");
  });
});

describe("a page target", () => {
  test("a text selection is accepted and normalized", () => {
    expect(accepted(PAGE)).toEqual(PAGE);
  });

  test("blocks and cells are the other two variants, and nothing else is", () => {
    expect(accepted({ ...PAGE, selection: { kind: "blocks", ids: ["p1", "p2"] } }).selection)
      .toEqual({ kind: "blocks", ids: ["p1", "p2"] });
    expect(accepted({ ...PAGE, selection: { kind: "cell", block: "t1", row: "r1", col: "c1" } }).selection)
      .toEqual({ kind: "cell", block: "t1", row: "r1", col: "c1" });
    refused({ ...PAGE, selection: { kind: "caret", block: "p1" } }, "selection");
    refused({ ...PAGE, selection: null }, "selection");
  });

  test("a block selection is bounded to 128 ids", () => {
    const ids = Array.from({ length: MAX_SELECTION_IDS }, (_, i) => `p${i}`);
    expect(accepted({ ...PAGE, selection: { kind: "blocks", ids } }).selection.ids.length).toBe(128);
    refused({ ...PAGE, selection: { kind: "blocks", ids: [...ids, "p128"] } }, "selection");
    refused({ ...PAGE, selection: { kind: "blocks", ids: [] } }, "selection");
  });

  test("the version, epoch and generation are required and bounded", () => {
    refused({ ...PAGE, v: 2 }, "version");
    refused({ ...PAGE, v: undefined }, "version");
    refused({ ...PAGE, epoch: "" }, "epoch");
    refused({ ...PAGE, epoch: "é".repeat(MAX_PAGE_ID_BYTES / 2 + 1) }, "epoch");
    refused({ ...PAGE, generation: -1 }, "generation");
    refused({ ...PAGE, generation: 1.5 }, "generation");
    refused({ ...PAGE, generation: "0" }, "generation");
  });

  test("a relative position is base64 and bounded once decoded", () => {
    const rel = (bytes) => Buffer.alloc(bytes).toString("base64");
    expect(accepted({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "p1", rel: rel(MAX_REL_BYTES) } } })
      .selection.anchor.rel.length).toBeGreaterThan(0);

    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "p1", rel: rel(MAX_REL_BYTES + 1) } } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "p1", rel: "not base64!" } } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "p1", rel: "" } } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "", rel: "AAAAAA==" } } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { rel: "AAAAAA==" } } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, head: null } }, "selection");
  });

  test("unknown keys anywhere in the target are refused", () => {
    refused({ ...PAGE, html: "<b>x</b>" }, "key");
    refused({ ...PAGE, selection: { ...PAGE.selection, text: "hello" } }, "selection");
    refused({ ...PAGE, selection: { kind: "cell", block: "t1", row: "r1", col: "c1", offset: 3 } }, "selection");
    refused({ ...PAGE, selection: { ...PAGE.selection, anchor: { block: "p1", rel: "AAAAAA==", index: 4 } } }, "selection");
  });

  test("a target larger than 8 KiB is refused", () => {
    const ids = Array.from({ length: 128 }, (_, i) => `${i}`.padEnd(100, "x"));
    const selection = { kind: "blocks", ids };
    expect(JSON.stringify({ ...PAGE, selection }).length).toBeGreaterThan(MAX_TARGET_BYTES);

    refused({ ...PAGE, selection }, "size");
    expect(MAX_TARGET_BYTES).toBe(8192);
  });

  test("nothing but the extended envelope can carry page coordinates", () => {
    const target = accepted(PAGE);

    expect(requestBody({ target })).toBeNull();
    expect(JSON.stringify(requestBody({ target, session: { id: "s", token: "opaque" }, n: 1 }))).toBe(
      `{"v":${PRESENCE_VERSION},"session":"opaque","n":1,"editing":${JSON.stringify(target)}}`
    );
    expect(requestBody({ target, session: { id: "s", token: "opaque" }, n: -1 })).toBeNull();
  });
});

describe("the target key", () => {
  test("is stable across key order and distinct across targets", () => {
    const one = accepted({ kind: "record", id: "c1", field: "title" });
    const two = accepted({ field: "title", id: "c1", kind: "record" });

    expect(targetKey(one)).toBe(targetKey(two));
    expect(targetKey(one)).not.toBe(targetKey(accepted({ kind: "record", id: "c1", field: "labels" })));
    expect(targetKey(null)).toBe("");
    expect(targetKey("1.2")).not.toBe(targetKey(accepted(RECORD)));
  });
});

describe("roster sessions", () => {
  const session = (over) => ({ id: "s1", you: false, n: 1, editing: null, ...over });

  test("a stale n cannot overwrite the newer value for that session", () => {
    const previous = new Map([["s1", session({ n: 8, editing: "3" })]]);

    expect(normalizeSessions([session({ n: 7, editing: "9" })], previous)).toEqual([session({ n: 8, editing: "3" })]);
    expect(normalizeSessions([session({ n: 9, editing: "9" })], previous)).toEqual([session({ n: 9, editing: "9" })]);
  });

  test("several sessions of one person stay separate, each with its own target", () => {
    const sessions = normalizeSessions([
      session({ id: "a", you: true, n: 3, editing: "0" }),
      session({ id: "b", you: false, n: 12, editing: accepted(PAGE) }),
    ]);

    expect(sessions.map((one) => one.id)).toEqual(["a", "b"]);
    expect(sessions.map((one) => one.editing)).toEqual(["0", PAGE]);
    expect(sessions.map((one) => one.you)).toEqual([true, false]);
  });

  test("a malformed session is dropped, and a malformed target becomes null", () => {
    const sessions = normalizeSessions([
      null,
      { n: 1 },
      session({ id: "", n: 1 }),
      session({ id: "s2", editing: { kind: "page" } }),
      session({ id: "s3", n: -4 }),
    ]);

    expect(sessions).toEqual([
      { id: "s2", you: false, n: 1, editing: null },
      { id: "s3", you: false, n: 0, editing: null },
    ]);
    expect(normalizeSessions(undefined)).toEqual([]);
  });
});

describe("person-level editing and the private self session", () => {
  test("page coordinates never become a person-level target", () => {
    expect(normalizeEditing(accepted(PAGE))).toBeNull();
    expect(normalizeEditing(RECORD)).toEqual({ kind: "record", id: "card-42", field: "title" });
    expect(normalizeEditing("1.2")).toBe("1.2");
    expect(normalizeEditing(undefined)).toBeNull();
    expect(normalizeEditing({ kind: "nope" })).toBeNull();
  });

  test("the self session needs both a public id and a private token", () => {
    expect(normalizeSelfSession({ id: "pub", token: "opaque" })).toEqual({ id: "pub", token: "opaque" });
    expect(normalizeSelfSession({ id: "pub" })).toBeNull();
    expect(normalizeSelfSession({ token: "opaque" })).toBeNull();
    expect(normalizeSelfSession({ id: "", token: "opaque" })).toBeNull();
    expect(normalizeSelfSession(null)).toBeNull();
  });
});

describe("the shared numbers", () => {
  test("are the ones the host and the client both keep to", () => {
    expect(PRESENCE_VERSION).toBe(1);
    expect(COALESCE_MS).toBe(250);
    expect(RENEW_MS).toBe(5000);
    expect(EXPIRE_MS).toBe(15000);
    expect(RATE_PER_SECOND).toBe(10);
    expect(RATE_BURST).toBe(20);
    expect(MAX_TARGET_BYTES).toBe(8 * 1024);
    expect(MAX_PAGE_ID_BYTES).toBe(256);
    expect(MAX_REL_BYTES).toBe(1024);
  });
});

describe("the module stays pure", () => {
  // The facade publishes page coordinates, so it must be readable in a reader that
  // downloads no editor at all: no Yjs, no ProseMirror, no page module, no visual
  // library, and not the chrome that draws the roster.
  const HERE = dirname(fileURLToPath(import.meta.url));
  const ROOT = resolve(HERE, "../..");
  const FORBIDDEN = [
    { name: "yjs", test: (path) => /(^|\/)yjs([/.]|$)|yjs/i.test(path) },
    { name: "prosemirror", test: (path) => /prosemirror/i.test(path) },
    { name: "a page module", test: (path) => path.includes("src/page/") },
    { name: "the Bevel visual library", test: (path) => /(^|\/)ui\/bevel|bevel-controls/.test(path) },
    { name: "the roster chrome", test: (path) => path.endsWith("src/sync/presence.js") },
  ];
  const RELATIVE = /(?:^|[\n;}])\s*(?:import|export)\b[^;'"]*?\sfrom\s*["']([^"']+)["']/g;
  const SIDE_EFFECT = /(?:^|[\n;}])\s*import\s*["']([^"']+)["']/g;
  const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  const specifiersOf = (code) => [
    ...[...code.matchAll(RELATIVE)].map((match) => match[1]),
    ...[...code.matchAll(SIDE_EFFECT)].map((match) => match[1]),
    ...[...code.matchAll(DYNAMIC)].map((match) => match[1]),
  ];

  function graph(entry) {
    const seen = new Map();
    const queue = [entry];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file) || !existsSync(file)) continue;
      const code = readFileSync(file, "utf8");
      seen.set(file, specifiersOf(code));
      for (const specifier of seen.get(file)) {
        if (!specifier.startsWith(".")) continue;
        queue.push(resolve(dirname(file), specifier));
      }
    }
    return seen;
  }

  test("presence-target.js reaches no Yjs, ProseMirror, page or Bevel module", () => {
    const files = [...graph(resolve(ROOT, "src/sync/presence-target.js")).keys()];

    expect(files).toContain(resolve(ROOT, "src/sync/presence-target.js"));
    expect(files).toContain(resolve(ROOT, "src/sync/editing-path.js"));
    for (const file of files) {
      const path = file.split(sep).join("/");
      for (const rule of FORBIDDEN) expect(`${rule.name}: ${rule.test(path)}`).toBe(`${rule.name}: false`);
    }
  });

  test("the scanner sees the imports it is meant to see", () => {
    expect(specifiersOf(readFileSync(resolve(ROOT, "src/sync/presence-store.js"), "utf8")))
      .toContain("./presence-target.js");
    expect(FORBIDDEN[0].test(resolve(ROOT, "src/vendor/yjs.vendor.js").split(sep).join("/"))).toBe(true);
    expect(FORBIDDEN[2].test(resolve(ROOT, "src/page/awareness.js").split(sep).join("/"))).toBe(true);
    expect(FORBIDDEN[3].test(resolve(ROOT, "src/ui/bevel.js").split(sep).join("/"))).toBe(true);
  });
});
