/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The owner chip as a mode lease.
 *
 * The chip tells the owner they are editing the original, so it belongs to an edit
 * session and not to the page: the commit that enters edit mounts it, and the exit that
 * leaves takes it down again. A page that is not editing carries no chip, an exit leaves
 * neither the chip nor the room it published behind, and the explicit edit boot this
 * tab already armed is adopted rather than mounted twice.
 */

const RULES = '{"title":"#title","note":"#note@value"}';

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setPage({ slot, rules = true }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot) root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = rules
    ? `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`
    : "";
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">';
  localStorage.clear();
}

async function load({ url = "/notes.html", owner = true, slot = "owner-lease-1", rules = true } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", url);
  setPage({ slot, rules });
  window.clay = {};
  const mod = await import("../../src/plugins/visitor-drafts-owner.js");
  await mod.ready;
  return mod;
}

const chip = () => document.getElementById("clay-owner");
const room = () => document.getElementById("clay-owner-vars");

const until = async (predicate) => {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

afterEach(clearCookies);

test("a managed session mounts the chip at the commit and takes it down at the exit", async () => {
  const mod = await load({ url: "/notes.html?editmode=false" });
  // A view has no chip of an edit session that has not started.
  expect(chip()).toBeNull();

  const mode = await import("../../src/core/is-edit-mode.js");
  const lease = mod.draftsOwnerParticipant().prepare({ generation: 1, isCurrent: () => true });
  // Preparing builds the lease; nothing is on the page yet.
  expect(chip()).toBeNull();

  mode.commitModeFacts({ mode: "edit", isEditMode: true, generation: 1 });
  lease.enable();
  expect(await until(() => chip())).toBe(true);
  expect(document.querySelectorAll(".clay-owner")).toHaveLength(1);
  expect(room()).not.toBeNull();

  lease.dispose();
  expect(chip()).toBeNull();
  expect(room()).toBeNull();
});

test("adoption over the chip the import armed adds no second chip", async () => {
  const mod = await load({ url: "/notes.html?editmode=true" });
  // The explicit edit boot: the module's own import already armed the chip.
  expect(await until(() => chip())).toBe(true);
  const armed = chip();

  const lease = mod.draftsOwnerParticipant().prepare({ initial: true, generation: 1 });
  lease.enable();
  await new Promise((resolve) => setTimeout(resolve, 20));

  // The chip the boot armed, not a second one beside or in place of it.
  expect(document.querySelectorAll(".clay-owner")).toHaveLength(1);
  expect(chip()).toBe(armed);

  lease.dispose();
  expect(chip()).toBeNull();
  expect(room()).toBeNull();
});
