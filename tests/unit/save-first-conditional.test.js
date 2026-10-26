/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * A live entry learns the host's conditional-save capability from discovery, and the
 * commit that enters edit cannot wait for that answer (Opus 14). The first save of the
 * session waits for it instead, so the save that follows a live entry still carries
 * If-Match when the host announced the capability: without that wait the answer landed
 * after the request, the header was left off, and the save went out unconditional against
 * a host that would have honoured one.
 */

let saveMod, etagMod, metaMod;
let calls;
let releaseMeta;

const META = { spec: 1, extensions: ["conditional"], document: { etag: "seed-1" } };

const metaResponse = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: () => null },
  text: async () => JSON.stringify(META),
});

const saved = () => ({
  ok: true,
  status: 200,
  statusText: "",
  headers: { get: () => null },
  text: async () => JSON.stringify({ msg: "Saved", etag: "stored-1" }),
});

// Discovery answers only when the test lets it, so the entry's own save happens while the
// capability is still on the wire.
function installRouter() {
  calls = { meta: 0, save: [] };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (String(url).includes("/_/meta")) {
      calls.meta++;
      await new Promise((resolve) => { releaseMeta = resolve; });
      return metaResponse();
    }
    calls.save.push([String(url), options]);
    return saved();
  });
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  installRouter();
  saveMod = await import("../../src/core/save.js");
  etagMod = await import("../../src/core/etag.js");
  metaMod = await import("../../src/core/host-meta.js");
});

beforeEach(() => {
  installRouter();
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  document.documentElement.removeAttribute("savestatus");
});

test("the first save after a live entry waits for the capability and carries If-Match", async () => {
  // This tab represents the file the entry is built from.
  etagMod.recordEtag("E1");
  const participant = saveMod.modeParticipant();
  const lease = participant.prepare({ represented: { bytes: "<html></html>", etag: "E1", seq: 1 } });
  try {
    lease.enable();
    // The person saves before discovery has answered.
    document.getElementById("c").textContent = "typed at once";
    const pending = saveMod.savePageForce();
    expect(calls.save).toHaveLength(0);
    releaseMeta();
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(calls.save[0][1].headers["If-Match"]).toBe("E1");
  } finally {
    lease.dispose();
  }
});
