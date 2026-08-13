import { jest } from "@jest/globals";

/**
 * The save lane's edges. Each of these was a way to report something untrue about
 * whether the user's bytes reached disk.
 */

let saveCore;
let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveCore = await import("../../src/core/save-core.js");
  saveMod = await import("../../src/core/save.js");
});

function res({ ok = true, status = 200, statusText = "OK", body = "" }) {
  return { ok, status, statusText, text: async () => body };
}

test("a 200 with an empty body is a success, not a failure", async () => {
  global.fetch = jest.fn(async () => res({ body: "" }));

  const result = await saveCore.saveHtml("<html></html>");

  expect(result.ok).toBe(true);
  expect(result.msgType).toBe("success");
});

test("a 502 HTML error page reports its status, not a JSON parse error", async () => {
  global.fetch = jest.fn(async () =>
    res({ ok: false, status: 502, statusText: "Bad Gateway", body: "<html>nginx</html>" })
  );

  const result = await saveCore.saveHtml("<html></html>");

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("error");
  expect(result.msg).toContain("502");
  expect(result.msg).not.toMatch(/JSON|token/i);
});

test("a timeout says it does not know, rather than asserting failure", async () => {
  global.fetch = jest.fn(async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });

  const result = await saveCore.saveHtml("<html></html>");

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("unknown");
  expect(result.code).toBe("timeout");
});

// Pointing replacePageWith at a path that 404s used to save the server's error
// page over the user's document.
test("a template fetch that 404s never reaches the save lane", async () => {
  const calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(String(url));
    return res({ ok: false, status: 404, statusText: "Not Found", body: "<html>Not Found</html>" });
  });

  const result = await saveCore.replacePageWith("/templates/missing.html");

  expect(result.ok).toBe(false);
  expect(result.msg).toContain("404");
  // Exactly one request: the template fetch. No POST followed it.
  expect(calls).toHaveLength(1);
});

test("a successful template fetch does save", async () => {
  global.fetch = jest.fn(async (url) =>
    String(url).includes("/templates/")
      ? res({ body: "<html>TEMPLATE</html>" })
      : res({ body: JSON.stringify({ msg: "Saved" }) })
  );

  const result = await saveCore.replacePageWith("/templates/blog.html");

  expect(result.ok).toBe(true);
  const post = global.fetch.mock.calls.find((c) => c[1]?.method === "POST");
  expect(post[1].body).toBe("<html>TEMPLATE</html>");
});

// A save requested while one is on the wire used to be dropped. If no later
// mutation retriggered autosave, those bytes never reached disk at all.
test("a save requested during a save is coalesced, not dropped", async () => {
  let release;
  const inFlight = new Promise((r) => { release = r; });
  let first = true;

  global.fetch = jest.fn(() => {
    if (first) {
      first = false;
      return inFlight.then(() => res({ body: JSON.stringify({ msg: "Saved" }) }));
    }
    return Promise.resolve(res({ body: JSON.stringify({ msg: "Saved" }) }));
  });

  document.getElementById("content").textContent = "first-bytes";
  const firstSave = saveMod.savePage();

  await Promise.resolve();
  document.getElementById("content").textContent = "second-bytes";
  await saveMod.savePage(); // resolves 'skipped', but queues

  release();
  await firstSave;
  await new Promise((r) => setTimeout(r, 0));

  const bodies = global.fetch.mock.calls.map((c) => c[1]?.body || "");
  expect(bodies.some((b) => b.includes("first-bytes"))).toBe(true);
  expect(bodies.some((b) => b.includes("second-bytes"))).toBe(true);
});

// Advancing the baseline for bytes that never reached the wire is the same defect
// as re-reading the live DOM after a save, one layer down.
test("a skipped save does not advance the baseline", async () => {
  let release;
  const inFlight = new Promise((r) => { release = r; });
  let first = true;
  global.fetch = jest.fn(() => {
    if (first) {
      first = false;
      return inFlight.then(() => res({ body: JSON.stringify({ msg: "Saved" }) }));
    }
    return Promise.resolve(res({ body: JSON.stringify({ msg: "Saved" }) }));
  });

  document.getElementById("content").textContent = "baseline-anchor";
  const firstSave = saveMod.savePage();
  await Promise.resolve();

  const before = saveMod.getLastSavedContents();

  // The lane is busy, so this never reaches the wire.
  const result = await saveCore.saveHtml("<html>never-sent</html>");
  expect(result.msgType).toBe("skipped");
  expect(result.ok).toBe(false);
  expect(saveMod.getLastSavedContents()).toBe(before);

  release();
  await firstSave;
  await new Promise((r) => setTimeout(r, 0));

  expect(saveMod.getLastSavedContents()).not.toContain("never-sent");
  expect(saveMod.getLastSavedContents()).toContain("baseline-anchor");
});
