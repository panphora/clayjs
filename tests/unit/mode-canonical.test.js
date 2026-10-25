/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * A clean view -> edit -> view cycle is not an edit. Everything the runtime rewrote on
 * the way in has to come back byte for byte: the inert spelling the file carried, the
 * author's `disabled="disabled"`, the authored contents of a [freeze] region, and the
 * blueprint inside a <template>. The evidence in the plan showed it did not: a second
 * activation turned `inert-contenteditable="plaintext-only"` into `"true"`, and leaving
 * edit wrote `disabled=""` over the author's spelling.
 *
 * The captures are the always wave's preservation foundation, so they are taken while
 * the page is still in view, before a reader or a widget can paint over the authored
 * form. These tests drive the real modules, in the order a boot drives them.
 */

const FIXTURE = `
  <article id="doc">
    <h1 id="title" editmode:contenteditable inert-contenteditable="plaintext-only">Authored title</h1>
    <p id="body" editmode:contenteditable inert-contenteditable="">Authored body</p>
    <input id="due" viewmode:disabled disabled="disabled" value="2026-10-25">
    <input id="ro" viewmode:readonly readonly="readonly" value="fixed">
    <span id="badge" clay="freeze">authored badge</span>
  </article>
  <template id="card">
    <span class="due" clay="freeze"></span>
    <p class="label" editmode:contenteditable inert-contenteditable="plaintext-only">Card</p>
  </template>
`;

let snapshot;
let preserve;
let editable;
let inputs;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = FIXTURE;
  // The always wave, evaluated first on a view boot: this is where the authored form
  // is recorded.
  preserve = await import("../../src/core/preserve-authored.js");
  snapshot = await import("../../src/core/snapshot.js");
  // The edit graph arrives later: at boot in edit mode, at the switch in view mode.
  await import("../../src/attrs/save-freeze.js");
  editable = await import("../../src/core/admin-contenteditable.js");
  inputs = await import("../../src/core/admin-inputs.js");
});

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  preserve.captureAll();
});

// What a boot does on the way in, and what live sync does to a node it activates a
// second time, then what leaving edit does.
function enterEdit() {
  editable.enableContentEditable();
  inputs.enableAdminInputs();
}

function leaveEdit() {
  editable.disableContentEditable();
  inputs.disableAdminInputs();
}

const served = () => document.body.innerHTML;

test("a clean view to edit to view cycle leaves the served bytes alone", () => {
  const before = served();
  const savedBefore = snapshot.captureForSave({ emitForSync: false });

  enterEdit();
  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(document.getElementById("title").hasAttribute("inert-contenteditable")).toBe(false);
  expect(document.getElementById("due").hasAttribute("disabled")).toBe(false);
  leaveEdit();

  expect(served()).toBe(before);
  expect(snapshot.captureForSave({ emitForSync: false })).toBe(savedBefore);
});

test("a second activation keeps the active value instead of downgrading it", () => {
  enterEdit();
  enterEdit();

  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");
  leaveEdit();

  expect(document.getElementById("title").getAttribute("inert-contenteditable")).toBe("plaintext-only");
});

test("a blueprint keeps its authored form; an inserted clone is activated and restored", () => {
  const blueprint = document.getElementById("card");
  const authored = blueprint.innerHTML;
  const label = blueprint.content.querySelector(".label");

  enterEdit();
  leaveEdit();

  expect(document.getElementById("card")).toBe(blueprint);
  expect(blueprint.innerHTML).toBe(authored);
  expect(label.getAttribute("inert-contenteditable")).toBe("plaintext-only");

  const clone = document.importNode(blueprint.content, true);
  document.getElementById("doc").append(clone);
  const inserted = document.querySelector("#doc .label");

  enterEdit();
  expect(inserted.getAttribute("contenteditable")).toBe("plaintext-only");
  leaveEdit();

  expect(inserted.getAttribute("inert-contenteditable")).toBe("plaintext-only");
  expect(inserted.hasAttribute("contenteditable")).toBe(false);
});

test("a newly synced control keeps the spelling its own bytes carried", () => {
  const holder = document.createElement("div");
  holder.innerHTML =
    '<input class="synced" viewmode:disabled disabled="disabled">' +
    '<div class="synced" editmode:contenteditable inert-contenteditable="plaintext-only">synced</div>';
  const before = holder.innerHTML;
  document.getElementById("doc").append(holder);
  preserve.captureAll();

  enterEdit();
  leaveEdit();

  expect(holder.innerHTML).toBe(before);
});

test("a frozen widget painted in view is still saved as authored", () => {
  const badge = document.getElementById("badge");
  badge.textContent = "runtime badge";
  // A later capture cannot overwrite what the first sight of the element recorded.
  preserve.captureAll();
  enterEdit();
  leaveEdit();

  const forSave = snapshot.captureForSave({ emitForSync: false });
  expect(forSave).toContain("authored badge");
  expect(forSave).not.toContain("runtime badge");
  expect(document.getElementById("badge").textContent).toBe("runtime badge");
});

test("the cycle subscribes to nothing and removes nothing", () => {
  const elementAdds = jest.spyOn(Element.prototype, "addEventListener");
  const elementRemoves = jest.spyOn(Element.prototype, "removeEventListener");
  const documentAdds = jest.spyOn(document, "addEventListener");
  const documentRemoves = jest.spyOn(document, "removeEventListener");

  enterEdit();
  leaveEdit();

  expect(elementAdds).not.toHaveBeenCalled();
  expect(elementRemoves).not.toHaveBeenCalled();
  expect(documentAdds).not.toHaveBeenCalled();
  expect(documentRemoves).not.toHaveBeenCalled();

  jest.restoreAllMocks();
});

test("a real text edit survives the cycle and is what the file keeps", () => {
  enterEdit();
  document.getElementById("title").textContent = "Typed title";
  leaveEdit();

  expect(document.getElementById("title").textContent).toBe("Typed title");
  expect(snapshot.captureForSave({ emitForSync: false })).toContain("Typed title");
  expect(document.getElementById("title").getAttribute("inert-contenteditable")).toBe("plaintext-only");
});
