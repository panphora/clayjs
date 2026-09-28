import { jest } from "@jest/globals";

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

function okFetch() {
  return jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
}

test("success => saved state + clay:save-saved + msgType success", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "changed-success";

  const seen = [];
  const onSaved = (e) => seen.push(e.type);
  document.addEventListener("clay:save-saved", onSaved);

  const result = await saveMod.savePage();

  expect(result.msgType).toBe("success");
  expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  expect(seen).toContain("clay:save-saved");
  expect(global.fetch).toHaveBeenCalled();
  document.removeEventListener("clay:save-saved", onSaved);
});

test("server 500 with {msg} => error state", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false, status: 500, statusText: "Server Error",
    json: async () => ({ msg: "boom" }),
  }));
  document.getElementById("content").textContent = "changed-500";

  const result = await saveMod.savePage();

  expect(result.msgType).toBe("error");
  expect(document.documentElement.getAttribute("savestatus")).toBe("error");
});

test("navigator.onLine=false + network failure => offline state", async () => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  global.fetch = jest.fn(async () => { throw new Error("network down"); });
  document.getElementById("content").textContent = "changed-offline";

  const result = await saveMod.savePage();

  expect(document.documentElement.getAttribute("savestatus")).toBe("offline");
  expect(result.msgType).toBe("error");
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

test("unchanged content => skipped, no fetch", async () => {
  global.fetch = okFetch();
  document.getElementById("content").textContent = "stable";
  await saveMod.savePage();            // establishes baseline == current
  global.fetch.mockClear();

  const result = await saveMod.savePage();  // nothing changed
  expect(result.msgType).toBe("skipped");
  expect(global.fetch).not.toHaveBeenCalled();
});

// Where a save came from has to survive the queue. A save that arrives while one
// is on the wire is remembered and run when the first settles (drainPendingSave),
// and that drained save carries the origin of the request that queued it: autosave
// tagged, anything else not. Live sync reads the tag to decide whether a save
// acknowledged a lost conflict, so a drained autosave must not read as the person.
// The throttled lane's window is module state on a wall clock, and these tests run
// back to back: each starts an hour past the window the previous one leaves open,
// so the first save goes out now rather than on a trailing edge.
function startThrottleClock(hoursAhead) {
  jest.useFakeTimers({ now: Date.now() + hoursAhead * 3600000 });
}

function heldSaveFetch() {
  let release;
  const held = new Promise((r) => { release = r; });
  let first = true;
  const urls = [];
  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    urls.push(target);
    if (first && target.includes("/_/save")) {
      first = false;
      await held;
    }
    return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify({ msg: "Saved" }) };
  });
  return { release, saves: () => urls.filter((u) => u.includes("/_/save")) };
}

test("a save the throttle queued behind an in-flight autosave is tagged on its event", async () => {
  startThrottleClock(1);
  const { release, saves } = heldSaveFetch();

  const seen = [];
  const onSaved = (e) => seen.push(e.detail);
  document.addEventListener("clay:save-saved", onSaved);
  try {
    document.getElementById("content").textContent = "queued-behind-one";
    saveMod.savePageThrottled();
    expect(saves()).toHaveLength(1);

    // A save is on the wire and the throttle window is open, so this one can only
    // queue: the autosave entry point's own call, arriving during the window.
    document.getElementById("content").textContent = "queued-behind-two";
    saveMod.savePageThrottled();
    jest.advanceTimersByTime(1300);
    expect(saves()).toHaveLength(1);

    release();
    await jest.advanceTimersByTimeAsync(50);

    expect(saves()).toHaveLength(2);
    expect(seen).toHaveLength(2);
    expect(seen[1].auto).toBe(true);
  } finally {
    document.removeEventListener("clay:save-saved", onSaved);
    jest.useRealTimers();
  }
});

test("and one queued by savePage() is not", async () => {
  startThrottleClock(2);
  const { release, saves } = heldSaveFetch();

  const seen = [];
  const onSaved = (e) => seen.push(e.detail);
  document.addEventListener("clay:save-saved", onSaved);
  try {
    document.getElementById("content").textContent = "manual-behind-one";
    saveMod.savePageThrottled();
    expect(saves()).toHaveLength(1);

    document.getElementById("content").textContent = "manual-behind-two";
    saveMod.savePage();
    release();
    await jest.advanceTimersByTimeAsync(50);

    expect(saves()).toHaveLength(2);
    expect(seen).toHaveLength(2);
    expect(seen[1].auto).toBeUndefined();
  } finally {
    document.removeEventListener("clay:save-saved", onSaved);
    jest.useRealTimers();
  }
});
