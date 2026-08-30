// The other half of the pre-rename warning: a host serving the current spelling
// says nothing.
//
// Both names are set, because that is the shape a current host actually serves:
// htmlclay 1.9.0 injects `savetoken` and goes on injecting `htmlclaytoken` forever,
// for the documents frozen against the old spelling. So the old name being present is
// not what makes a host stale, and warning on it alone would fire on every current
// host, which is as useless as never firing and worse for the reader, who is told to
// upgrade something already current.
//
// Its own file, and it has to be. The warning fires once per module instance and
// jest caches modules per test file, so running this beside the legacy test meant
// importing a module whose one-shot latch was already spent, on a jsdom root that
// still carried `htmlclaytoken`. It passed whatever `saveToken` did: replacing the
// warning with a warning on every host left both tests green.

import { jest } from "@jest/globals";

test("a host serving the current name says nothing, old name alongside or not", async () => {
  document.documentElement.setAttribute("savetoken", "tok-spec");
  document.documentElement.setAttribute("htmlclaytoken", "tok-spec");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  const { saveToken } = await import("../../src/core/host-attrs.js");

  expect(saveToken()).toBe("tok-spec");
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});
