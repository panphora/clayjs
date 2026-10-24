import { jest } from "@jest/globals";
import { storage } from "../../src/lib/doc-storage.js";

const path = (p) => window.history.pushState({}, "", p);

afterEach(() => {
  path("/");
  jest.restoreAllMocks();
});

test("two documents on one origin keep separate values under the same key", () => {
  path("/one.html");
  expect(storage.local.set("panel", "one")).toBe(true);
  path("/two.html");
  expect(storage.local.set("panel", "two")).toBe(true);

  expect(storage.local.get("panel")).toBe("two");
  path("/one.html");
  expect(storage.local.get("panel")).toBe("one");
});

test("values round-trip as JSON under clay:doc:<path>:<key>", () => {
  path("/entry.html");
  const value = { open: ["c-1", "c-2"], width: 320, pinned: false };
  storage.local.set("layout", value);
  storage.session.set("layout", value);

  expect(JSON.parse(window.localStorage.getItem("clay:doc:/entry.html:layout"))).toEqual(value);
  expect(JSON.parse(window.sessionStorage.getItem("clay:doc:/entry.html:layout"))).toEqual(value);
  expect(storage.local.get("layout")).toEqual(value);
  expect(storage.session.get("layout")).toEqual(value);

  storage.local.set("empty", null);
  expect(storage.local.get("empty")).toBe(null);
  expect(storage.local.get("never-written")).toBe(undefined);

  storage.local.remove("layout");
  expect(window.localStorage.getItem("clay:doc:/entry.html:layout")).toBe(null);
  expect(storage.local.get("layout")).toBe(undefined);
});

test("a setItem that throws keeps the value readable in this tab and returns false", () => {
  path("/denied.html");
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("denied", "QuotaExceededError");
  });

  expect(storage.local.set("draft", { text: "kept" })).toBe(false);
  expect(storage.local.get("draft")).toEqual({ text: "kept" });
});

test("a sessionStorage that throws falls back to memory for the life of the tab", () => {
  path("/blocked.html");
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new DOMException("access denied", "SecurityError");
    },
  });

  try {
    expect(storage.session.set("seen", 7)).toBe(false);
    expect(storage.session.get("seen")).toBe(7);
    storage.session.remove("seen");
    expect(storage.session.get("seen")).toBe(undefined);
  } finally {
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
});
