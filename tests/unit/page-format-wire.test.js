/**
 * @jest-environment node
 */
import { expect, test } from "@jest/globals";

// Every page write declares the format in a header, and the server bundle reads the same
// constants, so importing them must never touch `window`: they live in a module of their
// own, with no imports at all.
test("the page format constants load outside a browser", async () => {
  expect(typeof window).toBe("undefined");

  const { PAGE_FORMAT, PAGE_FORMAT_HEADER } = await import("../../src/core/page-format.js");

  expect(PAGE_FORMAT).toBe(1);
  expect(PAGE_FORMAT_HEADER).toBe("X-Clay-Page-Format");
});
