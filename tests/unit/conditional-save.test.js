/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * Spec §6, `conditional`: the client half. A host that advertises the capability
 * stamps the bytes it stored, accepts that stamp back as `If-Match`, and refuses
 * with 412 rather than overwriting a version this tab has never seen.
 *
 * Everything here is driven through the public surface — the save lane, the
 * savestatus attribute, the clay:save-* events — so the test says nothing about
 * where the stamp is kept, only that the right value goes out and the right thing
 * happens when it is refused.
 */

let saveMod, etagMod, metaMod;
let responses;
let calls;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function installRouter() {
  calls = { meta: [], save: [] };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/_/meta")) {
      calls.meta.push([target, options]);
      const body = responses.meta;
      if (!body) return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
      return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) };
    }
    calls.save.push([target, options]);
    const answer = responses.save(calls.save.length);
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      // `text` lets a case answer with a genuinely empty body, which is what a
      // proxy does when it refuses on the host's behalf.
      text: async () => (answer.text !== undefined ? answer.text : JSON.stringify(answer.body ?? {}))
    };
  });
}

const accepted = (etag) => () => ({ body: etag ? { msg: "Saved", etag } : { msg: "Saved" } });
const refused = () => ({
  status: 412,
  body: { msg: "This document changed since you last loaded it.", code: "conflict" }
});

function ifMatchOf(index) {
  return calls.save[index][1].headers["If-Match"];
}

async function edit(text) {
  document.getElementById("c").textContent = text;
}

// Re-run discovery from scratch, the way a freshly loaded page does, so one file
// can exercise several kinds of host.
async function rediscover() {
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  await etagMod.seedEtag();
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  responses = {
    meta: { spec: 1, extensions: ["conditional"], document: { etag: "seed-1" } },
    save: accepted("stored-1")
  };
  installRouter();
  saveMod = await import("../../src/core/save.js");
  etagMod = await import("../../src/core/etag.js");
  metaMod = await import("../../src/core/host-meta.js");
  await flush();
});

beforeEach(() => {
  const metaBody = responses.meta;
  installRouter();
  responses.meta = metaBody;
  document.documentElement.removeAttribute("savestatus");
});

test("the first save of a page that has never saved carries the stamp discovery seeded", async () => {
  responses.save = accepted("stored-1");
  await edit("one");

  const result = await saveMod.savePage();

  expect(result.ok).toBe(true);
  expect(calls.save).toHaveLength(1);
  // Without a seed this save would be unconditional, and the save most likely to
  // collide is the first one: the page has been open longest by then.
  expect(ifMatchOf(0)).toBe("seed-1");
});

test("later saves carry the stamp the host returned, never one derived from the bytes sent", async () => {
  // The reformatting case. `stored-1` deliberately has nothing to do with the body
  // of save one, exactly as a host with formathtml="true" stamps bytes the client
  // never sent. If the client ever computed its own stamp, save two would carry a
  // value the host could not match and would be refused for no reason.
  responses.save = accepted("stored-2");
  await edit("two");
  await saveMod.savePage();

  expect(ifMatchOf(0)).toBe("stored-1");
  expect(ifMatchOf(0)).not.toContain("two");

  responses.save = accepted("stored-3");
  await edit("three");
  await saveMod.savePage();

  expect(ifMatchOf(1)).toBe("stored-2");
});

test("a host that never advertised conditional is sent no If-Match, even when it returns an etag", async () => {
  responses.meta = { spec: 1, extensions: ["sync"], document: { etag: "seed-x" } };
  await rediscover();

  responses.save = accepted("stored-x");
  await edit("plain host");
  await saveMod.savePage();
  await edit("plain host again");
  await saveMod.savePage();

  // §5: a client must not infer a capability any other way, and a host that never
  // promised to honour the header may do anything at all with it.
  expect(ifMatchOf(0)).toBeUndefined();
  expect(ifMatchOf(1)).toBeUndefined();

  // The positive control on the same page and the same stamp. Without it this
  // test would pass against a client that never sends the header at all, which is
  // to say against the code this change replaces.
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-x" } };
  await rediscover();
  await edit("announced host");
  await saveMod.savePage();

  expect(ifMatchOf(2)).toBe("seed-x");
});

test("no stamp means no header, and the first save's own response arms the next one", async () => {
  // A private document, or any caller the host will not hand a per-document block
  // to: `conditional` is offered, but this page has no stamp to send yet.
  responses.meta = { spec: 1, extensions: ["conditional"] };
  await rediscover();

  responses.save = accepted("stored-y");
  await edit("unseeded");
  await saveMod.savePage();
  expect(ifMatchOf(0)).toBeUndefined();

  await edit("unseeded again");
  await saveMod.savePage();
  expect(ifMatchOf(1)).toBe("stored-y");
});

test("an accepted save that answers with no stamp clears the old one instead of sending it again", async () => {
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-z" } };
  await rediscover();

  responses.save = accepted(null);
  await edit("no stamp back");
  await saveMod.savePage();
  expect(ifMatchOf(0)).toBe("seed-z");

  // The document on disk is our bytes now, so `seed-z` describes something the
  // host has stopped storing. Sending it again would 412 forever.
  await edit("no stamp back twice");
  await saveMod.savePage();
  expect(ifMatchOf(1)).toBeUndefined();
});

test("a save that times out reconciles the stamp before anything retries", async () => {
  // §7: the write may have landed. If it did, the stamp held here describes bytes
  // the host replaced, and the retry would be refused for a change this tab made.
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "before-timeout" } };
  await rediscover();

  // The write lands on the host and the answer never reaches the browser, so the
  // host's stamp moves during the request the client is about to give up on.
  responses.save = () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "it-landed" } };
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };
  await edit("slow network");
  const timedOut = await saveMod.savePage();
  expect(timedOut.msgType).toBe("unknown");
  await flush();

  responses.save = accepted("stored-t");
  await edit("the retry");
  await saveMod.savePage();

  expect(ifMatchOf(calls.save.length - 1)).toBe("it-landed");
});

describe("a 412", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-c" } };
    await rediscover();
    responses.save = refused;
  });

  test("is reported as a conflict, not as a failed save", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    const result = await saveMod.savePage();
    const status = document.documentElement.getAttribute("savestatus");
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.ok).toBe(false);
    expect(result.msgType).toBe("conflict");
    expect(result.code).toBe("conflict");
    expect(status).toBe("conflict");
    expect(seen).toHaveLength(1);
    expect(seen[0].msg).toBe("This document changed since you last loaded it.");
  });

  // Spec §6: the host may name what moved the document, and only the host can know.
  // Being told it was your own other tab is a very different thing to being told a
  // colleague overwrote you, so the field has to survive the whole way from the
  // refusal body to the event the notice listens to.
  test("carries the host's word on what changed the file through to the event", async () => {
    responses.save = () => ({
      status: 412,
      body: { msg: "This document changed since you last loaded it.", code: "conflict", changedBy: "another-tab" }
    });
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.changedBy).toBe("another-tab");
    expect(seen[0].changedBy).toBe("another-tab");
  });

  // A host that cannot tell must say nothing rather than guess, and the page then
  // uses the phrase that is true in every case.
  test("says nothing about the source when the host does not", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(seen[0].changedBy).toBeNull();
  });

  // A regression guard rather than a test of new behaviour: a refused save has
  // always left the baselines where they were. It is here because the conflict
  // branch is a new path through applySaveResult, and the one thing that path must
  // never do is record bytes as saved that the host refused to write.
  test("keeps the edits: the page stays dirty and the close warning still fires", async () => {
    await edit("still mine");
    await saveMod.savePage();

    expect(saveMod.getUnsavedChanges()).toBe(true);
    const { captureForDirtyCheck } = await import("../../src/core/snapshot.js");
    expect(captureForDirtyCheck()).not.toBe(saveMod.getLastSavedDirty());
  });

  test("stops autosave, so the same refusal is not retried every throttle window", async () => {
    await edit("hold me");
    await saveMod.savePage();
    expect(saveMod.isSaveConflicted()).toBe(true);

    const before = calls.save.length;
    await edit("more typing");
    const auto = await saveMod.savePageThrottled();

    expect(auto.msgType).toBe("skipped");
    expect(calls.save).toHaveLength(before);
  });

  // A proxy can refuse on the host's behalf and send nothing at all. There is no
  // `code` in an empty body to read, so the status has to carry this on its own.
  test("still conflicts when the refusal has no body", async () => {
    responses.save = () => ({ status: 412, text: "" });
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("nothing came back but the number");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.msgType).toBe("conflict");
    expect(saveMod.isSaveConflicted()).toBe(true);
    expect(seen).toHaveLength(1);
  });

  test("clay.save.overwrite takes a fresh stamp from the host, lands, and clears the hold", async () => {
    await edit("keep mine");
    await saveMod.savePage();
    expect(saveMod.isSaveConflicted()).toBe(true);

    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "theirs-9" } };
    responses.save = accepted("mine-10");

    const result = await saveMod.saveOverwritingConflict();

    expect(result.ok).toBe(true);
    expect(ifMatchOf(calls.save.length - 1)).toBe("theirs-9");
    expect(saveMod.isSaveConflicted()).toBe(false);
    expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  });
});

// htmlclay refuses a save that arrives while an outside process is truncating the
// file, and that refusal lifts itself within a second. Reading its 409 as §6's
// conflict suspended autosave until a person intervened, over a condition that had
// already cleared. The status decides (§3), so this is an ordinary failure and the
// next autosave goes out and lands.
describe("a 409 that calls itself a conflict", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-409" } };
    await rediscover();
    responses.save = () => ({
      status: 409,
      body: { msg: "Refusing to save over a truncation in progress", code: "conflict" }
    });
  });

  test("is an error, holds nothing, and the next autosave still goes out", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("typed while the file was being truncated");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.ok).toBe(false);
    expect(result.msgType).toBe("error");
    expect(saveMod.isSaveConflicted()).toBe(false);
    expect(seen).toHaveLength(0);
    expect(document.documentElement.getAttribute("savestatus")).toBe("error");

    const before = calls.save.length;
    responses.save = accepted("stored-409");
    await edit("and the guard has lifted");
    const auto = await saveMod.savePageThrottled();

    expect(auto.ok).toBe(true);
    expect(calls.save).toHaveLength(before + 1);
  });
});

describe("live sync", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional", "sync"], document: { etag: "seed-s" } };
    await rediscover();
    responses.save = accepted("stored-s");
  });

  test("a disk-sourced frame replaces the stamp, so the next save is not refused for a change it applied", async () => {
    responses.meta = { spec: 1, extensions: ["conditional", "sync"], document: { etag: "disk-2" } };
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 7, source: "disk" } }));
    await flush();

    await edit("after the disk frame");
    await saveMod.savePage();

    expect(ifMatchOf(calls.save.length - 1)).toBe("disk-2");
  });

  test("a peer's snapshot leaves the stamp alone and asks the host nothing", async () => {
    const before = calls.meta.length;
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 8, source: "peer" } }));
    await flush();

    await edit("after a peer frame");
    await saveMod.savePage();

    // §10 relays never write to disk, so the stamp is still true after one lands.
    expect(calls.meta).toHaveLength(before);
    expect(ifMatchOf(calls.save.length - 1)).toBe("seed-s");
  });
});
