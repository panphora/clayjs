/**
 * @jest-environment jsdom
 */

/**
 * The CMS as a mode lease.
 *
 * The CMS owns a real editing session over the page, so a live switch has to be able to
 * start it, take it back and start it again without a reload. The source (hypercms
 * d1b6597) exposes that session as prepare/quiesce/resume/dispose; the adapter's job is
 * to hand it to the mode controller as one lease:
 *
 *   - `prepare` builds nothing, because the source mounts only on `enable`, and a vendor
 *     build without that lifecycle is refused instead of opened beside the controller;
 *   - the lease keeps the source's order, so the CMS enters after the modules that
 *     prepare the page for editing;
 *   - a real edit through the mounted session reaches the page;
 *   - an upload's painted preview ([data-hcms-uploading]) refuses the exit as
 *     `pending-input`, and the refusal leaves the session mounted, admitting and
 *     mid-edit, so the same lease resumes once the upload settles;
 *   - `dispose` goes through the CMS's own teardown and is idempotent, so a repeat entry
 *     starts a fresh session over the page.
 *
 * The modules are the real ones, driven in the order a boot and a switch drive them.
 */
import { jest } from "@jest/globals";
import { cms } from "../../src/vendor/hypercms.vendor.js";
import { cmsParticipant } from "../../src/plugins/cms.js";

// The CMS refreshes its form from the mutation hub, which the loader installs on
// window.clay. These tests commit one field and assert, so a hub that subscribes and
// never fires is all the CMS needs.
const Mutation = { onAnyChange: () => () => {} };

const RULES = { title: "h1" };

function mountRules() {
  const el = document.createElement("script");
  el.setAttribute("data-rules-name", "cms");
  el.setAttribute("data-rules-version", "1");
  el.setAttribute("type", "application/json");
  el.textContent = JSON.stringify(RULES);
  document.head.appendChild(el);
  return el;
}

const shell = () => document.querySelector("[data-hcms-shell]");
const title = () => document.querySelector("h1");

const throwOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a refusal");
};

const leases = [];

const enter = async (context = {}) => {
  const lease = await cmsParticipant({ pageRoot: document.body }).prepare({
    generation: 1,
    isCurrent: () => true,
    ...context,
  });
  leases.push(lease);
  return lease;
};

beforeAll(() => {
  window.clay = { ...(window.clay || {}), mode: "view", Mutation };
});

beforeEach(() => {
  document.documentElement.setAttribute("style", "--color-accent: #0284c7");
  document.body.innerHTML = "<h1>Hello</h1>";
  leases.length = 0;
});

afterEach(() => {
  while (leases.length) leases.pop().dispose();
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
  document.head.querySelectorAll('script[data-rules-name="cms"]').forEach((el) => el.remove());
});

test("prepare mounts nothing, enable mounts the session, and dispose takes it back", async () => {
  mountRules();
  const lease = await enter();

  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();

  lease.enable();
  expect(cms.isOpen).toBe(true);
  expect(shell()).not.toBeNull();

  lease.dispose();
  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();

  lease.dispose();
  expect(cms.isOpen).toBe(false);
});

test("the participant takes the source's order and keeps one stable id", () => {
  const participant = cmsParticipant({ pageRoot: document.body });

  expect(participant.order).toBe(1000);
  expect(participant.id).toBe("clay:cms");
});

test("an edit through the mounted session reaches the page", async () => {
  mountRules();
  const lease = await enter();
  lease.enable();

  cms.api.setValue("title", "Changed");

  expect(title().textContent).toBe("Changed");
});

test("a painted upload preview refuses the exit as pending-input, and the same session resumes", async () => {
  mountRules();
  const lease = await enter();
  lease.enable();

  title().setAttribute("data-hcms-uploading", "");
  expect(throwOf(() => lease.quiesce())).toMatchObject({ code: "pending-input", pending: ["preview"] });

  expect(cms.isOpen).toBe(true);
  cms.api.setValue("title", "Still editing");
  expect(title().textContent).toBe("Still editing");

  title().removeAttribute("data-hcms-uploading");
  expect(lease.quiesce()).toEqual({ ok: true });
  expect(() => cms.api.setValue("title", "Refused")).toThrow(/not admitting/);

  lease.resume();
  cms.api.setValue("title", "Again");
  expect(title().textContent).toBe("Again");
});

test("prepare answers for a stale generation before it mounts anything", async () => {
  mountRules();

  await expect(enter({ signal: { aborted: true } })).rejects.toMatchObject({ code: "stale-document" });
  await expect(enter({ isCurrent: () => false })).rejects.toMatchObject({ code: "stale-document" });

  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();
});

test("a vendor build without the lifecycle is refused before anything mounts", async () => {
  mountRules();
  const source = cms.prepareModeLease;
  delete cms.prepareModeLease;
  try {
    await expect(enter()).rejects.toMatchObject({ code: "unsupported-plugin" });
    expect(cms.isOpen).toBe(false);
    expect(shell()).toBeNull();
  } finally {
    cms.prepareModeLease = source;
  }
});

test("a second entry mounts a fresh session over the page", async () => {
  mountRules();
  const first = await enter();
  first.enable();
  first.dispose();
  leases.length = 0;

  const second = await enter();
  second.enable();

  expect(cms.isOpen).toBe(true);
  expect(shell()).not.toBeNull();
  cms.api.setValue("title", "Second session");
  expect(title().textContent).toBe("Second session");
});

test("adoption of a boot that opened no CMS starts nothing, and its dispose leaves nothing behind", async () => {
  mountRules();

  // An explicit edit boot whose page never opened the CMS has no session to hand back.
  const lease = await enter({ initial: true });
  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();

  // The controller never enables an adopted lease; if it did, nothing would start.
  lease.enable();
  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();

  expect(lease.quiesce()).toEqual({ ok: true });
  lease.resume();
  lease.dispose();
  expect(cms.isOpen).toBe(false);
  expect(shell()).toBeNull();

  // The next entry is the one that mounts, and its dispose is the one that takes it down.
  const live = await enter();
  live.enable();
  expect(shell()).not.toBeNull();
  live.dispose();
  expect(shell()).toBeNull();
});

test("a boot that opened the CMS itself keeps its reload, and nothing is torn down under it", async () => {
  mountRules();
  expect(cms.open({ pageRoot: document.body }).ok).toBe(true);
  expect(cms.isOpen).toBe(true);

  // The session the page opened is not one the source hands out a lease for, so the
  // adapter refuses it here, before anything is quiesced or disposed.
  await expect(enter({ initial: true })).rejects.toMatchObject({ code: "unsupported-plugin" });

  expect(cms.isOpen).toBe(true);
  expect(shell()).not.toBeNull();

  cms.close();
  expect(cms.isOpen).toBe(false);
});

test("a live import in view opens nothing, and the page's own events do not either", async () => {
  jest.resetModules();
  mountRules();

  try {
    const mod = await import("../../src/plugins/cms.js");
    // The vendor's own auto-open is behind write admission, and nothing here opens a
    // session on its own.
    expect(mod.cms.isOpen).toBe(false);
    expect(shell()).toBeNull();

    document.dispatchEvent(new Event("clay:sync-applied"));
    await Promise.resolve();
    expect(shell()).toBeNull();
    expect(typeof mod.modeParticipant).toBe("function");
  } finally {
    jest.resetModules();
  }
});
