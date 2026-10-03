import { jest } from "@jest/globals";
import { RUNTIME_ONLY } from "../../src/ui/bevel-controls.js";
import { TOKENS, GLYPHS } from "../../src/ui/bevel.js";
import { captureAsync, last } from "./helpers/injected-ui.js";

/**
 * One notice for the two things this tab holds that the page no longer shows:
 * edits another save replaced (the ledger, clay.conflicts) and a save the host
 * refused. It never decides for the person: Minimize, Escape, a save and a later
 * frame all leave every loss where it is, and only Accept theirs — the ids the
 * panel actually drew — acknowledges one.
 *
 * Real timers throughout: the ledger and save lanes own timers of their own, and
 * the notice's one frame is a requestAnimationFrame the harness turns into a
 * timeout so a draw is a thing the test can wait for.
 *
 * The refused half drives a real 412 through save.savePage() with a fetch mock, the
 * way live-sync-stale-frame-review.test.js does, so the hold, the event detail and
 * the release are the library's own.
 */

const PAGE =
  '<h2 id="h">Pricing</h2><p>Simple plans.</p><a id="cta" href="/signup">Sign up</a>' +
  '<section id="team"><h3>Team plan</h3><p id="tp">$12 per seat per month, billed yearly.</p></section>' +
  '<section id="faq"><h3>FAQ</h3><p>Can I cancel any time?</p></section>';

const META = { spec: 1, extensions: ["sync", "conditional"], document: { etag: "E0" } };

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });

// Let pending promise work schedule its render, then wait out that animation frame.
const frame = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 0));
const tick = () => new Promise((r) => setTimeout(r, 0));

let conflicts;
let beginApply;
let completeApply;
let failApply;
let save;
let snapshot;
let reloadAfterDiscard;
let notice;
let overwrite;

beforeAll(async () => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.scrollTo = () => {};
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    if (u.includes("/_/meta")) return respond(200, META);
    if (method === "POST" && u.includes("/_/save")) {
      const r = saveResponse(options);
      return respond(r.status, r.body);
    }
    return respond(404, "");
  });

  ({ conflicts, beginApply, completeApply, failApply } = await import("../../src/sync/conflicts.js"));
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  ({ reloadAfterDiscard } = await import("../../src/core/unsaved-warning.js"));
  notice = await import("../../src/core/conflict-notice.js");
});

beforeEach(async () => {
  overwrite = jest.fn().mockResolvedValue({ ok: true, msg: "Saved" });
  window.clay = { conflicts, save: { overwrite } };
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E1" } });
  document.body.innerHTML = PAGE;
  const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(forComparison, forDirty);
  await frame();
});

afterEach(async () => {
  // Nothing a test left behind is allowed to reach the next one: the hold, the
  // refusal, the ledger and the draw are all this notice's state.
  if (save.isSaveConflicted()) save.conflictResolvedBySync("E1");
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
  for (const rec of conflicts.list()) conflicts.acknowledge([rec.id], { reason: "accepted" });
  await frame();
});

const root = () => document.querySelector("[data-clay-conflict]");
const surface = () => (root() ? root().firstElementChild : null);
const panel = () => document.querySelector('[data-clay-conflict] [role="dialog"]');
const shown = () => (root() ? root().textContent : "");
const panelText = () => (panel() ? panel().textContent : "");
const visible = () => !!root() && root().style.display === "flex";
const buttons = () => (root() ? [...root().querySelectorAll("button")] : []);
const buttonSaying = (re) => buttons().find((b) => re.test(b.textContent));
// A failed download wears "Try again" too, so the refused panel's own control is
// taken by position: the minimize icon, then download, keep, accept.
const keepButton = () => buttons()[2];

// A listed edit: the well draws a sticky head and then one row per record, so the
// rows are everything under that head. The eye is the row's one button.
const well = () => (panel() ? panel().lastElementChild : null);
const rows = () => (well() ? [...well().children].slice(1) : []);
const values = (row) => [...row.lastElementChild.children].map((cell) => cell.textContent);
const eyeOf = (row) => row.querySelector("button");
const ringOn = () => [...document.body.children].find((node) => node !== root() && node.getAttribute("clay") === RUNTIME_ONLY && node.style.position === "fixed");

const edit = () => {
  const p = document.querySelector("p");
  p.textContent = "Simple plans, edited.";
};

/** One apply of the given engine conflicts, landed synchronously. */
function apply(list) {
  const applyId = beginApply({ source: "peer", domain: "sync", root: document.body.cloneNode(true) });
  return completeApply(applyId, list, { ticket: 1 });
}

const textRecord = () => ({ kind: "text", node: document.querySelector("#h"), local: "Plans for teams", remote: "Pricing", base: "Pricing" });
const attrRecord = () => ({ kind: "attr", el: document.querySelector("#cta"), name: "href", local: "/signup-v2", remote: "/signup" });
const structureRecord = () => ({ kind: "structure", el: document.querySelector("#team"), reason: "edit-beats-delete" });

const three = () => apply([textRecord(), attrRecord(), structureRecord()]);
const oneMore = () => apply([{ kind: "text", node: document.querySelector("#tp"), local: "$9 per seat", remote: "$12 per seat" }]);

/** A real 412: the hold, the event and the detail are all the library's own. */
async function refuse(changedBy = "another-tab") {
  edit();
  saveResponse = () => ({ status: 412, body: { code: "conflict", changedBy, etag: "E1" } });
  const result = await save.savePage();
  expect(result.msgType).toBe("conflict");
  expect(save.isSaveConflicted()).toBe(true);
  await frame();
}

const review = () => buttonSaying(/Review/).click();

test("the bar arrives a frame after the ledger changes, not with them", async () => {
  expect(visible()).toBe(false);

  three();

  // The ledger has them and the bar does not yet: a listener that claims its own
  // records inside clay:sync-applied has to get there before the first draw.
  expect(conflicts.size).toBe(3);
  expect(visible()).toBe(false);

  await frame();

  expect(visible()).toBe(true);
  expect(shown()).toContain("Another edit replaced 3 changes.");
  expect(surface().getAttribute("role")).toBe("status");
  expect(buttons()).toHaveLength(1);
  expect(buttons()[0].textContent).toBe("Review");
});

test("the bar never lands in the saved file", async () => {
  three();
  await frame();

  expect(root().getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(root().getAttribute("data-clay-conflict")).toBe("");
});

test("the panel lists what the bar counted, and draws nothing that decides for anybody", async () => {
  three();
  await frame();
  review();

  const dialog = panel();
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("aria-label")).toBe("Another edit replaced 3 changes");
  expect(shown()).toContain("The page is showing the other edit.");
  expect(buttonSaying(/Download my copy/)).toBeDefined();
  expect(buttonSaying(/Accept theirs/)).toBeDefined();
  expect(buttons().map((b) => b.textContent).filter((label) => /revert/i.test(label))).toEqual(["Revert to mine"]);

  // Focus lands on the heading, so a screen reader reads the reason first and a
  // keyboard lands inside the thing that just opened.
  const title = dialog.querySelector('[tabindex="-1"]');
  expect(title).not.toBeNull();
  expect(document.activeElement).toBe(title);

  expect(buttonSaying(/See the edits/)).toBeDefined();
  expect(panelText()).toContain("3 edits");
});

test("Minimize returns to the bar and acknowledges nothing", async () => {
  three();
  await frame();
  review();
  expect(conflicts.size).toBe(3);

  root().querySelector('button[aria-label="Minimize"]').click();

  expect(panel()).toBeNull();
  expect(visible()).toBe(true);
  expect(document.activeElement).toBe(buttonSaying(/Review/));
  expect(conflicts.size).toBe(3);
});

test("Escape minimizes the panel and acknowledges nothing", async () => {
  three();
  await frame();
  review();

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  expect(panel()).toBeNull();
  expect(visible()).toBe(true);
  expect(conflicts.size).toBe(3);
});

test("Accept theirs covers the ids the panel drew, and only those", async () => {
  three();
  await frame();
  review();
  expect(panelText()).toContain("3 edits");

  // A fourth record lands with no frame in between: it was never shown, so this
  // choice does not answer for it.
  oneMore();
  expect(conflicts.size).toBe(4);

  buttonSaying(/Accept theirs/).click();

  expect(conflicts.size).toBe(1);
  await frame();
  expect(shown()).toContain("Another edit replaced 1 change.");
});

test("a save never hides what the ledger is holding", async () => {
  three();
  await frame();

  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));

  expect(visible()).toBe(true);
  expect(shown()).toContain("Another edit replaced 3 changes.");
  expect(conflicts.size).toBe(3);
});

test("a record somebody else claimed is not this notice's to show", async () => {
  const ids = three();
  await frame();
  expect(shown()).toContain("3 changes");

  const fourth = oneMore()[0];
  const lease = conflicts.claim([fourth], { owner: "writer" });
  await frame();
  expect(shown()).toContain("3 changes");
  expect(conflicts.size).toBe(4);

  lease.release();
  await frame();
  expect(shown()).toContain("4 changes");
  expect(ids).toHaveLength(3);
});

test("a claim made before the first draw keeps the bar from flashing", async () => {
  const claimAll = () => {
    for (const rec of conflicts.list()) if (!rec.claimedBy) conflicts.claim([rec.id], { owner: "writer" });
  };
  document.addEventListener("clay:sync-conflicts-changed", claimAll);
  try {
    three();
    await frame();
  } finally {
    document.removeEventListener("clay:sync-conflicts-changed", claimAll);
  }

  expect(visible()).toBe(false);
  // Held, just not by this notice: the record still keeps the close warning up.
  expect(conflicts.size).toBe(3);
});

test("records that arrived since the last look are marked new, until they are looked at", async () => {
  three();
  await frame();
  review();
  root().querySelector('button[aria-label="Minimize"]').click();

  oneMore();
  await frame();
  expect(shown()).toContain("Another edit replaced 4 changes.");

  review();
  expect(panelText()).toContain("1 new");

  buttonSaying(/See the edits/).click();
  expect(panelText()).not.toContain("1 new");
});

test("an update that could not be applied says so, and is not counted as a replaced edit", async () => {
  const applyId = beginApply({ source: "disk", domain: "save", root: document.body.cloneNode(true) });
  const ids = failApply(applyId, new Error("morph threw"), { ticket: 2 });
  expect(ids).toHaveLength(1);
  expect(conflicts.size).toBe(1);

  await frame();
  expect(shown()).toContain("A sync update did not finish. Your edits here are safe.");
  expect(shown()).not.toContain("replaced");

  review();
  expect(panelText()).toContain("Part of an update from elsewhere could not be applied");
  expect(buttonSaying(/Download my copy/)).toBeDefined();
  expect(buttonSaying(/Accept theirs/)).toBeDefined();
});

test("a refusal comes first, and the losses it holds are named inside it", async () => {
  three();
  await frame();
  await refuse("another-tab");

  expect(surface().getAttribute("role")).toBe("alert");
  expect(shown()).toContain("This page changed in another tab. Your edits here are safe.");

  review();
  expect(panelText()).toContain("3 earlier replaced edits are also held in this tab");
  expect(panelText()).toContain("Download my copy includes them.");
  expect(buttonSaying(/Download my copy/)).toBeDefined();
  expect(buttonSaying(/Keep mine/)).toBeDefined();
  expect(buttonSaying(/Accept theirs/)).toBeDefined();

  // The version that refused the save arrived; the refusal is answered and what
  // the tab still holds takes the notice back.
  save.conflictResolvedBySync("E1");
  expect(save.isSaveConflicted()).toBe(false);
  document.dispatchEvent(new CustomEvent("clay:save-conflict-resolved"));
  await frame();

  expect(panel().getAttribute("aria-label")).toBe("Another edit replaced 3 changes");
  expect(buttonSaying(/Keep mine/)).toBeUndefined();
  root().querySelector('button[aria-label="Minimize"]').click();
  expect(surface().getAttribute("role")).toBe("status");
  expect(shown()).toContain("Another edit replaced 3 changes.");
});

test("the refused notice leads with reassurance, then says what happened", async () => {
  await refuse("wat");

  const said = shown();
  expect(said).toContain("This page changed elsewhere.");
  expect(said).toContain("Your edits here are safe");
  expect(said.indexOf("changed elsewhere")).toBeLessThan(said.indexOf("Your edits here are safe"));
  expect(said).not.toContain("Saving is paused");

  review();
  expect(panelText()).toContain("nothing will be overwritten until you choose");
});

test("names the source when the host knows one, and stays vague when it does not", async () => {
  await refuse("another-tab");
  expect(shown()).toContain("in another tab");

  await refuse("an-agent");
  expect(shown()).toContain("by an agent");

  // A filesystem write has no author, and an unknown value must not reach the page.
  await refuse("wat");
  expect(shown()).toContain("This page changed elsewhere.");
});

test("says a timed-out save may be the cause, and never over a host that named one", async () => {
  // The tab keeps its stamp across a timeout rather than reconciling, so a refusal
  // may be answering the person's own write. Only the notice words itself on it.
  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: null, afterTimeout: true } }));
  await frame();
  expect(shown()).toContain("possibly by your own save that timed out");
  expect(shown()).toContain("Your edits here are safe");

  // The host actually knows. Its answer beats the guess.
  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: "another-person", afterTimeout: true } }));
  await frame();
  expect(shown()).toContain("by someone else");
  expect(shown()).not.toContain("timed out");

  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: null, afterTimeout: false } }));
  await frame();
  expect(shown()).toContain("This page changed elsewhere.");
  expect(shown()).toContain("Your edits here are safe");
});

test("a refused save's notice goes away when a save lands", async () => {
  await refuse();
  expect(visible()).toBe(true);

  // The tab is no longer holding a refusal — the version that refused it is the one
  // it has — so the save event that follows is this notice's to act on.
  save.conflictResolvedBySync("E1");
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
  await frame();

  expect(root().style.display).toBe("none");
});

test("an old save event cannot erase a newer refusal", async () => {
  await refuse("another-tab");
  expect(save.isSaveConflicted()).toBe(true);

  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));

  expect(surface().getAttribute("role")).toBe("alert");
  expect(shown()).toContain("This page changed in another tab.");
});

test("Keep mine asks the library to overwrite", async () => {
  await refuse();
  review();

  buttonSaying(/Keep mine/).click();
  await tick();

  expect(overwrite).toHaveBeenCalledTimes(1);
});

test("a second press while the save is in flight does not send a second save", async () => {
  let release;
  overwrite.mockImplementation(() => new Promise((r) => { release = r; }));

  await refuse();
  review();
  const keep = buttonSaying(/Keep mine/);
  keep.click();
  await tick();
  buttonSaying(/Saving…/).click();
  buttonSaying(/Saving…/).click();

  expect(overwrite).toHaveBeenCalledTimes(1);
  release({ ok: true });
  await tick();
});

test("an overwrite that fails stays on screen and offers another go", async () => {
  overwrite.mockResolvedValue({ ok: false, msg: "Network error" });

  await refuse();
  review();
  buttonSaying(/Keep mine/).click();
  await frame();

  expect(visible()).toBe(true);
  expect(panelText()).toContain("That did not save either. Your edits here are still here.");
  expect(buttonSaying(/Try again/)).toBeDefined();
});

test("Keep mine skipped offers another go, and a later save finishes it", async () => {
  overwrite.mockResolvedValue({ ok: false, msg: "Save already in progress", msgType: "skipped" });

  await refuse();
  review();
  buttonSaying(/Keep mine/).click();
  await frame();

  // The bytes never left, so nothing was saved: the notice stays up and the
  // control offers the press again rather than sitting mid-save forever.
  expect(save.isSaveConflicted()).toBe(true);
  expect(keepButton().textContent).toBe("Try again");
  expect(keepButton().isDisabled()).toBe(false);

  save.conflictResolvedBySync("E1");
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
  await frame();

  // The save that finishes here is not this button's save, so it is not reported
  // as one; the refusal it answers is already gone.
  expect(shown()).not.toContain("This page changed");
  expect(conflicts.size).toBe(0);
});

describe("the discard arms before it fires", () => {
  test("the first press is a choice, not a confirmation", async () => {
    await refuse();
    review();

    buttonSaying(/Accept theirs/).click();

    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();
    expect(panelText()).toContain("This drops your unsaved edits.");
  });

  test("the second press reloads when nothing changed in between", async () => {
    await refuse();
    review();
    buttonSaying(/Accept theirs/).click();

    // The two halves of a double click are one decision, so the confirm only
    // counts once that press window has passed.
    await new Promise((r) => setTimeout(r, 550));

    const reload = jest.fn();
    const real = window.location;
    // jsdom's Location.reload cannot be redefined in place, and the notice reads
    // window.location at the moment it reloads.
    delete window.location;
    window.location = { reload };
    try {
      buttonSaying(/Yes, drop my edits/).click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      delete window.location;
      window.location = real;
    }
  });

  test("Escape backs out of an armed discard", async () => {
    await refuse();
    review();
    buttonSaying(/Accept theirs/).click();
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
    expect(buttonSaying(/Accept theirs/)).toBeDefined();
  });

  test("it disarms itself, so a panel left open is not one stray press from a discard", async () => {
    await refuse();
    review();
    buttonSaying(/Accept theirs/).click();
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

    await new Promise((r) => setTimeout(r, 5100));

    // Armed no longer: the next press arms again instead of dropping anything.
    const again = buttonSaying(/Accept theirs/);
    expect(again).toBeDefined();
    again.click();
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();
  }, 10000);

  test("a fresh refusal never opens already armed", async () => {
    await refuse();
    review();
    buttonSaying(/Accept theirs/).click();
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

    document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: "an-agent" } }));
    await frame();

    expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
    expect(buttonSaying(/Accept theirs/)).toBeDefined();
  });
});

test("a loss arriving after the arming disarms it", async () => {
  await refuse();
  review();
  buttonSaying(/Accept theirs/).click();
  expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

  oneMore();

  expect(notice._test.state().armed).toBeNull();
  await frame();
  expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
  expect(buttonSaying(/Accept theirs/)).toBeDefined();
});

test("typing on the page disarms it", async () => {
  await refuse();
  review();
  buttonSaying(/Accept theirs/).click();
  expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

  document.querySelector("p").dispatchEvent(new Event("input", { bubbles: true }));

  await frame();
  expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
  expect(buttonSaying(/Accept theirs/)).toBeDefined();
});

test("a confirmed reload passes one beforeunload, and only one", async () => {
  const reload = jest.fn();
  const blocked = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  edit();
  expect(blocked()).toBe(true);

  expect(reloadAfterDiscard({ isCurrent: () => false, reload })).toBe(false);
  expect(reload).not.toHaveBeenCalled();

  expect(reloadAfterDiscard({ isCurrent: () => true, reload })).toBe(true);
  expect(reload).toHaveBeenCalledTimes(1);
  // The reload the person confirmed is let through; the close that follows still warns.
  expect(blocked()).toBe(false);
  expect(blocked()).toBe(true);
});

test("every element the notice draws is runtime-only, classless and !important", async () => {
  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const drawn = [...root().querySelectorAll("*")];
  expect(drawn.length).toBeGreaterThan(5);
  for (const el of drawn) {
    if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    expect(el.getAttribute("class")).toBeNull();
    expect(el.getAttribute("id")).toBeNull();
    expect(el.getAttribute("clay")).toBe(RUNTIME_ONLY);
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style.item(i);
      expect(el.style.getPropertyPriority(prop)).toBe("important");
    }
  }
});

test("a page whose sync plugin never loaded still gets the refused notice", async () => {
  window.clay = { save: { overwrite } };

  await refuse("an-agent");

  expect(surface().getAttribute("role")).toBe("alert");
  expect(shown()).toContain("This page changed by an agent.");

  review();
  expect(panel()).not.toBeNull();
  expect(buttonSaying(/Keep mine/)).toBeDefined();
});

test("a row names the edit, quotes both versions, and offers the eye", async () => {
  apply([
    { kind: "text", node: document.querySelector("#h"), local: "Plans for teams", remote: "Pricing", base: "Pricing" },
    { kind: "attr", el: document.querySelector("#cta"), name: "href", local: "/signup-v2", remote: "/signup" },
    { kind: "structure", el: document.querySelector("#faq"), reason: "edit-beats-delete" },
  ]);
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const drawn = rows();
  expect(drawn).toHaveLength(3);
  expect(drawn.map((row) => row.firstElementChild.firstElementChild.textContent))
    .toEqual(["Page heading", "Link address under Pricing", "FAQ section"]);

  expect(values(drawn[0])).toEqual(["Yours", "Plans for teams", "Now", "Pricing"]);
  expect(values(drawn[1])).toEqual(["Yours", "/signup-v2", "Now", "/signup"]);
  expect(drawn[2].textContent).toContain("You deleted this section. The other edit changed it at the same time, so it is still here.");

  expect(eyeOf(drawn[0]).getAttribute("aria-label")).toBe("Show Page heading on page");
  expect(eyeOf(drawn[1]).getAttribute("aria-label")).toBe("Show Link address under Pricing on page");
});

test("a record the page never showed draws Yours and no Now", async () => {
  apply([{
    kind: "text", local: "slow", remote: "fast",
    recovery: {
      version: 1, key: "missing-output", localLost: true, applied: false, unavailable: "missing-output",
      subject: { key: "b:[1,1]", nodeType: 3, base: [[1, 1]], local: [[1]], remote: [[1, 1]], merged: [[1, 1]], live: [] },
      text: {
        encoding: "plain", base: null,
        local: { text: "One slow fox.", start: 4, end: 8, fragment: "slow", span: null, scope: null },
        merged: null, remote: null,
      },
    },
  }]);
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const drawn = rows();
  expect(drawn).toHaveLength(1);
  expect(values(drawn[0])).toEqual(["Yours", "One slow fox."]);
  expect(drawn[0].textContent).toContain("The other edit replaced this, and the page changed again before it could be shown here. Download my copy keeps your version.");
  expect(drawn[0].textContent).not.toContain("Now");
  expect(eyeOf(drawn[0])).toBeNull();
});

test("another tab's markup is text in the notice, never an element", async () => {
  apply([{ kind: "text", node: document.querySelector("#h"), local: '<img src=x onerror="window.__pwned2=1">x', remote: "Pricing" }]);
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  expect(panelText()).toContain("x");
  expect(root().querySelector("img")).toBeNull();

  await tick();
  expect(window.__pwned2).toBeUndefined();
});

test("the eye scrolls to the element and rings it without touching the page", async () => {
  const h = document.querySelector("#h");
  h.scrollIntoView = jest.fn();
  const untouched = h.outerHTML;

  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  expect(ringOn()).toBeUndefined();
  eyeOf(rows()[0]).click();

  expect(h.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(h.scrollIntoView.mock.calls[0][0].block).toBe("center");

  // Ours and runtime-only, outside the notice: the page's element gets no attribute,
  // class or style, so the dirty gate and the saved bytes see nothing.
  const ring = ringOn();
  expect(ring).toBeDefined();
  expect(root().contains(ring)).toBe(false);
  expect(h.outerHTML).toBe(untouched);

  await new Promise((r) => setTimeout(r, 2600));
  expect(document.body.contains(ring)).toBe(false);
}, 10000);

test("with the panel covering the bottom of the screen, the eye centres the element in the space above it", async () => {
  const h = document.querySelector("#h");
  h.scrollIntoView = jest.fn();
  h.getBoundingClientRect = () => ({ top: 409, bottom: 435, left: 0, right: 300, width: 300, height: 26 });
  const untouched = h.outerHTML;
  const innerHeight = window.innerHeight;
  const scrollBy = window.scrollBy;
  window.scrollBy = jest.fn();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  try {
    three();
    await frame();
    review();
    buttonSaying(/See the edits/).click();
    root().getBoundingClientRect = () => ({ top: 403, bottom: 828, left: 12, right: 378, width: 366, height: 425 });
    eyeOf(rows()[0]).click();

    expect(h.scrollIntoView.mock.calls.map((c) => c[0].block)).toEqual(["center"]);
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    // Space above the panel is 403px; the element's centre (422) goes to 201.5.
    expect(window.scrollBy.mock.calls[0][0].top).toBeCloseTo(422 - 201.5);
    expect(h.outerHTML).toBe(untouched);
  } finally {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
    window.scrollBy = scrollBy;
  }
});

test("a target taller than the space above the panel shows its top", async () => {
  const h = document.querySelector("#h");
  h.scrollIntoView = jest.fn();
  h.getBoundingClientRect = () => ({ top: 409, bottom: 1009, left: 0, right: 300, width: 300, height: 600 });
  const untouched = h.outerHTML;
  const innerHeight = window.innerHeight;
  const scrollBy = window.scrollBy;
  window.scrollBy = jest.fn();
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
  try {
    three();
    await frame();
    review();
    buttonSaying(/See the edits/).click();
    root().getBoundingClientRect = () => ({ top: 403, bottom: 828, left: 12, right: 378, width: 366, height: 425 });
    eyeOf(rows()[0]).click();

    expect(h.scrollIntoView.mock.calls.map((c) => c[0].block)).toEqual(["center"]);
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
    // 600px does not fit in the 403px above the panel: its top goes 12px below the viewport's.
    expect(window.scrollBy.mock.calls[0][0].top).toBe(409 - 12);
    expect(h.outerHTML).toBe(untouched);
  } finally {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
    window.scrollBy = scrollBy;
  }
});

test("Minimize takes the ring with it", async () => {
  const h = document.querySelector("#h");
  h.scrollIntoView = jest.fn();

  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();
  eyeOf(rows()[0]).click();

  const ring = ringOn();
  expect(ring).toBeDefined();

  root().querySelector('button[aria-label="Minimize"]').click();

  expect(document.body.contains(ring)).toBe(false);
});

test("the eye uses the generated Bevel glyph", async () => {
  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const svg = eyeOf(rows()[0]).querySelector("svg");
  const template = document.createElement("template");
  template.innerHTML = GLYPHS.conflictEye;
  const source = template.content.firstElementChild;
  expect(svg.getAttribute("viewBox")).toBe(source.getAttribute("viewBox"));
  expect(svg.querySelector("path").getAttribute("d")).toBe(source.querySelector("path").getAttribute("d"));
  expect([svg.getAttribute("width"), svg.getAttribute("height"), svg.getAttribute("aria-hidden")])
    .toEqual(["16", "16", "true"]);
});

test("every element the notice resets gets its colour scheme back", async () => {
  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const drawn = [...root().querySelectorAll("*")];
  expect(drawn.length).toBeGreaterThan(5);

  let reset = 0;
  for (const node of drawn) {
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    if (node.style.getPropertyValue("all") !== "initial") continue;
    reset++;
    expect(node.style.getPropertyValue("color-scheme")).toBe("inherit");
  }
  expect(reset).toBeGreaterThan(5);

  // The root is the one element that carries the page's scheme rather than inherit.
  expect(["light", "dark", "light dark"]).toContain(root().style.getPropertyValue("color-scheme"));
});

test("a Keep mine that lands clears the refused notice and says so", async () => {
  await refuse("another-tab");
  review();
  expect(buttonSaying(/Keep mine/)).toBeDefined();

  // The real exit from a conflict: ask the host for the document's stamp and force
  // the save with it. save.js fires clay:save-saved before it releases the hold.
  window.clay.save.overwrite = save.saveOverwritingConflict;
  saveResponse = () => ({ status: 200, body: { msg: "Saved", etag: "E2" } });

  buttonSaying(/Keep mine/).click();
  await frame();
  await frame();

  expect(shown()).toContain("Saved your version over theirs.");
  expect(shown()).not.toContain("This page changed");
  expect(save.isSaveConflicted()).toBe(false);

  // Let the toast expire before the next test builds a notice in this root.
  await new Promise((r) => setTimeout(r, 4100));
}, 15000);

test("Download my copy writes one file, says so, and acknowledges nothing", async () => {
  three();
  await frame();
  review();

  const create = jest.fn(() => "blob:notice");
  URL.createObjectURL = create;
  URL.revokeObjectURL = jest.fn();

  buttonSaying(/Download my copy/).click();

  expect(create).toHaveBeenCalledTimes(1);
  expect(buttonSaying(/Downloaded/)).toBeDefined();
  expect(conflicts.size).toBe(3);

  await new Promise((r) => setTimeout(r, 1300));
  expect(buttonSaying(/Download my copy/)).toBeDefined();
  expect(conflicts.size).toBe(3);
}, 10000);

test("a download that cannot be built offers another go, and keeps every loss", async () => {
  three();
  await frame();
  review();

  URL.createObjectURL = () => { throw new Error("x"); };
  URL.revokeObjectURL = jest.fn();
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});

  buttonSaying(/Download my copy/).click();

  expect(buttonSaying(/Try again/)).toBeDefined();
  expect(conflicts.size).toBe(3);

  logged.mockRestore();
});

test("a value that looks like markup is quoted as text and never becomes an element", async () => {
  window.__pwned = undefined;
  const quotedAttr = '"><img src=x onerror="window.__pwned=1">';
  const rawText = '<img src=x onerror="window.__pwned=1">';
  apply([
    { kind: "attr", el: document.querySelector("#cta"), name: "title", local: quotedAttr, remote: "/signup" },
    { kind: "text", node: document.querySelector("#h"), local: rawText, remote: "Pricing" },
  ]);
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  expect(root().querySelector("img")).toBeNull();
  expect(window.__pwned).toBeUndefined();

  const shownValues = rows().map((row) => values(row).join(" "));
  expect(shownValues.some((text) => text.includes(quotedAttr))).toBe(true);
  expect(shownValues.some((text) => text.includes(rawText))).toBe(true);
});

test("the section notice yields to the conflict bar, and comes back when it is gone", async () => {
  const { sectionNotice } = await import("../../src/sync/section-notice.js");

  three();
  await frame();
  expect(visible()).toBe(true);

  sectionNotice.show("Ana");
  const section = document.querySelector("[data-clay-section-notice]");
  expect(section).not.toBeNull();
  expect(section.style.display).toBe("none");
  expect(section.textContent).not.toContain("Ana");

  for (const rec of conflicts.list()) conflicts.acknowledge([rec.id], { reason: "accepted" });
  await frame();
  expect(visible()).toBe(false);

  sectionNotice.show("Ana");
  expect(section.style.display).toBe("flex");
  expect(section.textContent).toContain("Ana changed this section");

  sectionNotice.destroy();
});

test("a save event does not widen what Accept covers", async () => {
  three();
  await frame();
  review();
  expect(panelText()).toContain("3 edits");

  // The record lands with the panel drawn and no frame in between, and the save
  // event that follows only asks for a redraw.
  oneMore();
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));
  buttonSaying(/Accept theirs/).click();

  expect(conflicts.size).toBe(1);
  await frame();
  expect(shown()).toContain("Another edit replaced 1 change.");
});

test("the two halves of a double click are one decision", async () => {
  await refuse();
  review();

  buttonSaying(/Accept theirs/).click();
  const armed = buttonSaying(/Yes, drop my edits/);
  expect(armed).toBeDefined();

  const reload = jest.fn();
  const real = window.location;
  delete window.location;
  window.location = { reload };
  try {
    // The first press redrew the panel under the pointer; the second click lands
    // on the confirm button in the same task.
    armed.click();

    expect(reload).not.toHaveBeenCalled();
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

    // Past the press window, the same press is a decision again.
    await new Promise((r) => setTimeout(r, 550));
    buttonSaying(/Yes, drop my edits/).click();
    expect(reload).toHaveBeenCalledTimes(1);
  } finally {
    delete window.location;
    window.location = real;
  }
});

test("a record claimed after the draw is not acknowledged by Accept", async () => {
  const ids = apply([textRecord(), attrRecord()]);
  await frame();
  review();
  expect(panelText()).toContain("2 edits");

  const lease = conflicts.claim([ids[0]], { owner: "writer" });
  buttonSaying(/Accept theirs/).click();

  // The claim owner's record is theirs to settle: only the record this notice
  // still holds is answered for.
  expect(conflicts.get(ids[0])).not.toBeNull();
  expect(conflicts.get(ids[1])).toBeNull();
  lease.release();
});

test("an old Keep completion cannot clear a newer attempt's busy state", async () => {
  const pending = [];
  overwrite.mockImplementation(() => new Promise((r) => pending.push(r)));

  await refuse();
  review();
  buttonSaying(/Keep mine/).click();
  await tick();
  expect(overwrite).toHaveBeenCalledTimes(1);

  // A new refusal, then a second attempt: the first one's result is stale now.
  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: "another-tab" } }));
  await frame();
  buttonSaying(/Keep mine/).click();
  await tick();
  expect(overwrite).toHaveBeenCalledTimes(2);

  pending[0]({ ok: false, msgType: "conflict" });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: {} }));
  await frame();

  expect(keepButton().textContent).toBe("Saving…");
  expect(keepButton().isDisabled()).toBe(true);

  pending[1]({ ok: false, msgType: "conflict" });
  await frame();
  expect(keepButton().textContent).toBe("Try again");
});

test("an overwrite that comes back skipped offers another go", async () => {
  overwrite.mockResolvedValue({ ok: false, msg: "Save already in progress", msgType: "skipped" });

  await refuse();
  review();
  buttonSaying(/Keep mine/).click();
  await frame();

  expect(save.isSaveConflicted()).toBe(true);
  const again = keepButton();
  expect(again.textContent).toBe("Try again");
  expect(again.isDisabled()).toBe(false);

  again.click();
  await tick();
  expect(overwrite).toHaveBeenCalledTimes(2);
});

test("an unrelated save error does not mark Keep mine as failed", async () => {
  let release;
  overwrite.mockImplementation(() => new Promise((r) => { release = r; }));

  await refuse();
  review();
  buttonSaying(/Keep mine/).click();
  await tick();

  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { msg: "Network error" } }));
  await frame();

  // The overwrite is still on the wire, so this button's own answer is not in.
  expect(keepButton().textContent).toBe("Saving…");
  expect(keepButton().isDisabled()).toBe(true);

  release({ ok: true });
  await frame();
});

test("a release with no save behind it drops the refusal it was showing", async () => {
  await refuse("another-tab");
  expect(surface().getAttribute("role")).toBe("alert");

  // The version that refused the save is on this page now, so the refusal is
  // over even though nothing was written.
  save.conflictResolvedBySync("E1");
  expect(save.isSaveConflicted()).toBe(false);
  await frame();

  expect(visible()).toBe(false);
});

test("a press that no longer matches says why nothing was dropped", async () => {
  const { gateMarkDirty } = await import("../../src/lib/dirty-gate.js");

  await refuse();
  review();
  buttonSaying(/Accept theirs/).click();
  expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();

  gateMarkDirty();
  await new Promise((r) => setTimeout(r, 550));

  const reload = jest.fn();
  const real = window.location;
  delete window.location;
  window.location = { reload };
  try {
    buttonSaying(/Yes, drop my edits/).click();
    expect(reload).not.toHaveBeenCalled();
  } finally {
    delete window.location;
    window.location = real;
  }

  expect(panelText()).toContain("Something changed on the page after your first press");
  expect(buttonSaying(/Accept theirs/)).toBeDefined();
});

test("an eye keeps focus when a frame redraws the list", async () => {
  three();
  await frame();
  review();
  buttonSaying(/See the edits/).click();

  const before = eyeOf(rows()[0]);
  const label = before.getAttribute("aria-label");
  before.focus();
  expect(document.activeElement).toBe(before);

  oneMore();
  await frame();

  expect(rows()).toHaveLength(4);
  expect(document.activeElement).toBe(eyeOf(rows()[0]));
  expect(eyeOf(rows()[0]).getAttribute("aria-label")).toBe(label);
});

test("focus lands on Review after Accept, even when a record was not covered", async () => {
  three();
  await frame();
  review();
  oneMore();

  buttonSaying(/Accept theirs/).click();
  await frame();

  expect(document.activeElement).toBe(buttonSaying(/Review/));
});

test("a redraw of the same refusal is not announced again", async () => {
  await refuse("another-tab");
  expect(surface().getAttribute("role")).toBe("alert");

  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: {} }));
  await frame();
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: {} }));
  await frame();

  // The bar was rebuilt, not re-announced: a screen reader hears the refusal once.
  expect(surface().getAttribute("role")).toBeNull();
  expect(shown()).toContain("This page changed in another tab. Your edits here are safe.");
});

test("the eye icon cannot be hidden by the page's own CSS", async () => {
  const style = document.createElement("style");
  style.textContent = "svg { display:none !important }";
  document.head.appendChild(style);
  try {
    three();
    await frame();
    review();
    buttonSaying(/See the edits/).click();

    const svg = eyeOf(rows()[0]).querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.style.display).toBe("block");
    expect(svg.style.getPropertyPriority("display")).toBe("important");
  } finally {
    style.remove();
  }
});

test("the replaced edits well uses the sunk ground", async () => {
  three();
  await frame();
  review();

  const calls = await captureAsync(async () => {
    buttonSaying(/See the edits/).click();
    await frame();
  });

  // jsdom drops light-dark() from el.style, so the written declarations are read
  // from the call log: the well is the scroller holding the list's sticky head.
  const list = well();
  expect(list).not.toBeNull();
  expect(last(calls, list, "background")).toContain("#F4ECDF");
  expect(last(calls, list, "background")).toBe(TOKENS.sunk);
  expect(last(calls, list, "border")).toBe(`1px solid ${TOKENS["line-2"]}`);
});
