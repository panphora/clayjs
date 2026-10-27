import { jest } from "@jest/globals";

/**
 * A flush that has already answered sends no further save.
 *
 * `flushSave` bounds its answer with `Promise.race`, which leaves the losing
 * `flushBytes` running. Once the deadline has passed the caller is told the flush
 * timed out and whatever it does next belongs to the page again: an autosave, or a
 * second flush. The abandoned loop used to keep going, compare the page, find the
 * text typed after the timeout and put it on the wire behind the caller's back.
 */

let saveMod;

function okResponse(body = { msg: "Saved" }) {
  return { ok: true, status: 200, statusText: "", text: async () => JSON.stringify(body) };
}

// The clock is installed before the module loads: the load-time settle is a timer of
// its own, and a flush would otherwise wait it out on the test's clock.
beforeAll(async () => {
  jest.useFakeTimers();
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  saveMod = await import("../../src/core/save.js");
  // The load-time settle is not the person's work and a flush waits for it: let it
  // run its course so the clock this test controls is about the flush alone.
  await jest.advanceTimersByTimeAsync(3000);
  expect(saveMod.baselineSettled()).toBe(true);
});

test("a flush that timed out sends nothing typed after its deadline", async () => {

  const calls = [];
  const waiting = [];
  global.fetch = jest.fn((url, options) => {
    calls.push({ url: String(url), options });
    return new Promise((resolve) => waiting.push(resolve));
  });

  const editor = document.getElementById("c");
  editor.textContent = "typed before the timeout";

  let outcome = null;
  const flushed = saveMod.flushSave({ timeoutMs: 1000 }).then(
    (value) => { outcome = value; },
    (error) => { outcome = error; }
  );
  await jest.advanceTimersByTimeAsync(0);
  expect(calls).toHaveLength(1);
  expect(calls[0].options.body).toContain("typed before the timeout");

  // The host does not answer within the flush's budget.
  await jest.advanceTimersByTimeAsync(1000);
  await flushed;
  expect(outcome).toMatchObject({ state: "failed", message: "Save timed out." });

  // Typed after the caller was told the flush timed out.
  editor.textContent = "typed after the timeout";
  waiting[0](okResponse({ msg: "Saved", etag: "E-late" }));
  await jest.advanceTimersByTimeAsync(50);

  // The request already on the wire finished; nothing new started, and the text the
  // page gained after the deadline never left.
  expect(calls).toHaveLength(1);
  expect(calls[0].options.body).not.toContain("typed after the timeout");

  // And it is not lost: an ordinary flush afterwards still saves it.
  global.fetch = jest.fn(async () => okResponse({ msg: "Saved", etag: "E-next" }));
  await expect(saveMod.flushSave({ timeoutMs: 1000 })).resolves.toEqual({ state: "saved", etag: "E-next" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1].body).toContain("typed after the timeout");
});
