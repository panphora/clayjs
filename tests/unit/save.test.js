import { jest } from "@jest/globals";

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

function okFetch() {
  return jest.fn(async () => ({ ok: true, json: async () => ({ msg: "Saved" }) }));
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
