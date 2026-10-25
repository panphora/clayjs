// Scenario: which document a recovery copy belongs to, and who wrote it.
//
// Two failures are worth a whole file. A recovery record filed under the wrong
// document hands one file's unsaved writing to another, and a writer id copied
// from sessionStorage makes a duplicated tab overwrite the original's recovery
// instead of standing beside it. The document identity here is the host's own
// durable file identity (`documentid`, or the pre-rename `htmlclayid`), read once
// from the root, never from the save-token list, and never asked for over the wire.

import { jest } from "@jest/globals";
import { HOST_IDENTITY_ATTRS, SAVE_TOKEN_ATTRS, LEGACY_SAVE_TOKEN_ATTRS } from "../../src/lib/root-attrs.js";
import { createIdentity, hostIdentityOf, newWriterId, pathIdentityOf } from "../../src/recovery/identity.js";

const root = () => document.documentElement;

afterEach(() => {
  for (const attr of [...HOST_IDENTITY_ATTRS, ...SAVE_TOKEN_ATTRS, ...LEGACY_SAVE_TOKEN_ATTRS]) {
    root().removeAttribute(attr);
  }
});

test("edit mode files a document under the host's own identity", () => {
  root().setAttribute("documentid", "history-key-1");
  const identity = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });

  expect(identity.scope).toEqual(["https://a.test", "documentid", "history-key-1", "edit"]);
  expect(identity.identityKind).toBe("documentid");
});

test("the pre-rename spelling names the same kind of file identity", () => {
  root().setAttribute("htmlclayid", "history-key-old");
  const identity = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });

  expect(identity.scope[1]).toBe("htmlclayid");
  expect(identity.scope[2]).toBe("history-key-old");
  expect(hostIdentityOf(root())).toEqual({ kind: "htmlclayid", identity: "history-key-old" });
});

test("a host identity wins over the path, and the path fallback is the exact pathname", () => {
  root().setAttribute("documentid", "history-key-1");
  const withHost = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });

  expect(withHost.scope[2]).toBe("history-key-1");
  expect(withHost.identityKind).toBe("documentid");

  root().removeAttribute("documentid");
  const bare = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });
  expect(bare.identityKind).toBe("path");
  expect(bare.scope).toEqual(["https://a.test", "path", "/journal.html", "edit"]);
  expect(pathIdentityOf("")).toEqual({ kind: "path", identity: "/" });

  const query = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html?editmode=true#entry-3", root: root() });
  expect(query.scope[2]).toBe("/journal.html");
  expect(query.identityKind).toBe("path");
});

test("a save token is never an identity", () => {
  for (const attr of [...SAVE_TOKEN_ATTRS, ...LEGACY_SAVE_TOKEN_ATTRS]) root().setAttribute(attr, "credential");

  const identity = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });
  expect(identity.identityKind).toBe("path");
  expect(identity.scope).not.toContain("credential");
});

test("two paths, two origins and two modes never share a scope", () => {
  const one = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/one.html", root: null });
  const two = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/two.html", root: null });
  const elsewhere = createIdentity({ mode: "edit", origin: "https://b.test", pathname: "/one.html", root: null });
  const draft = createIdentity({ mode: "draft", origin: "https://a.test", pathname: "/one.html", root: null });

  expect(new Set([one.scope.join(" "), two.scope.join(" "), elsewhere.scope.join(" "), draft.scope.join(" ")]).size).toBe(4);
  expect(draft.scope[3]).toBe("draft");
  expect(draft.identityKind).toBe("path");
});

test("a draft stays path-scoped even where the host names the document", () => {
  root().setAttribute("documentid", "history-key-1");
  const draft = createIdentity({ mode: "draft", origin: "https://a.test", pathname: "/journal.html", root: root() });

  expect(draft.scope).toEqual(["https://a.test", "path", "/journal.html", "draft"]);
});

test("the root is read once, and a later change is reported rather than followed", () => {
  root().setAttribute("documentid", "history-key-1");
  const identity = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });
  const captured = [...identity.scope];
  expect(identity.check(root())).toMatchObject({ ok: true, code: null });

  root().setAttribute("documentid", "history-key-2");
  const mismatch = identity.check(root());
  expect(mismatch.ok).toBe(false);
  expect(mismatch.code).toBe("identity-mismatch");
  expect(mismatch.found).toEqual({ kind: "documentid", identity: "history-key-2" });
  expect(identity.scope).toEqual(captured);

  root().removeAttribute("documentid");
  expect(identity.check(root()).code).toBe("identity-missing");
  expect(identity.scope).toEqual(captured);
});

test("an identity that appears after the load is a later binding, not a rewrite", () => {
  const identity = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/journal.html", root: root() });
  expect(identity.identityKind).toBe("path");

  root().setAttribute("documentid", "history-key-1");
  const check = identity.check(root());
  expect(check).toMatchObject({ ok: true, code: null });
  expect(check.bound).toEqual({ kind: "documentid", identity: "history-key-1" });
  expect(identity.scope).toEqual(["https://a.test", "path", "/journal.html", "edit"]);
});

test("a writer id is fresh for every page load and never comes from storage", () => {
  window.sessionStorage.setItem("clay:recovery:writer", "a-duplicated-tab-would-inherit-this");
  const read = jest.spyOn(Storage.prototype, "getItem");
  try {
    const first = newWriterId();
    const second = newWriterId();
    expect(first).not.toBe(second);
    expect(first).not.toBe("a-duplicated-tab-would-inherit-this");

    const one = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/x", root: null });
    const two = createIdentity({ mode: "edit", origin: "https://a.test", pathname: "/x", root: null });
    expect(one.writerId).not.toBe(two.writerId);
    expect(one.scope).toEqual(two.scope);
    expect(read.mock.calls.filter(([key]) => String(key).includes("writer"))).toEqual([]);
  } finally {
    read.mockRestore();
    window.sessionStorage.clear();
  }
});
