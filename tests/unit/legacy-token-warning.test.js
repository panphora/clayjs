// Scenario: dropping the pre-rename save token announces itself.
//
// The break is deliberate, and its failure mode is the reason it needs a voice. htmlclay
// at or below 1.8.0 injects only `htmlclaytoken` AND sets the isAdminOfCurrentResource
// cookie on every document serve, so the page stays fully editable while every save 404s
// against a host that registers only `POST /_/save/{token}`. Editable and unsaveable is
// the worst shape a break can take, and one console line is the difference between it and
// a bug nobody can trace.
//
// Its own file because the warning fires once per module instance and jest caches modules
// per file: a spy installed after any earlier import of host-attrs.js would be watching a
// warning that had already happened.

import { jest } from "@jest/globals";

test("finding only the pre-rename spelling says so, once", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  const { saveToken } = await import("../../src/core/host-attrs.js");
  saveToken();
  saveToken();

  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain("htmlclaytoken");
  expect(warn.mock.calls[0][0]).toContain("1.9.0");
  warn.mockRestore();
});

test("a host serving the current name says nothing", async () => {
  document.documentElement.setAttribute("savetoken", "tok-spec");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  const { saveToken } = await import("../../src/core/host-attrs.js");
  saveToken();

  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});
