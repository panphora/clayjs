import { jest } from "@jest/globals";

/**
 * The notice is fetched, not shipped: nothing asks for it until there is something for
 * it to show. A page whose ledger already holds something at boot is the one case with
 * no event to hand over, so the shell loads it at once and the notice draws from the
 * ledger it finds.
 */

const PAGE = '<h2 id="h">Pricing</h2><p>Simple plans.</p>';

const frame = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 0));

beforeAll(() => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
});

test("a page booting on a ledger that already holds an edit draws the bar without an event", async () => {
  document.body.innerHTML = PAGE;
  const { conflicts, beginApply, failApply } = await import("../../src/sync/conflicts.js");
  window.clay = { conflicts };
  const applyId = beginApply({ source: "peer", domain: "sync", root: document.body.cloneNode(true) });
  failApply(applyId, new Error("the peer frame did not parse"), { ticket: 1 });
  expect(conflicts.size).toBe(1);

  const root = () => document.querySelector("[data-clay-conflict]");
  expect(root()).toBeNull();

  await import("../../src/core/conflict-notice.js");
  await frame();
  await frame();

  expect(root()).not.toBeNull();
  expect(root().style.display).toBe("flex");
  expect(root().textContent).toContain("A sync update did not finish. Your edits here are safe.");
  expect([...root().querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Review"]);
});
