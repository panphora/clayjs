import { jest } from "@jest/globals";
import { PERSON_COLORS, colorIndexOf, initialsOf, personColor } from "../../src/lib/person-face.js";

/**
 * One person, one face.
 *
 * The presence stack and `clay.people` are two surfaces that show the same
 * person, and the promise is that they agree: the same initials and the same
 * colour. They agree because both ask this module, so the assertions here are
 * about the one rule and about the two surfaces landing on it, not about either
 * surface's own arithmetic.
 *
 * The id vectors are the ones hyperclay's tests/dashboard/workspace/person-face
 * asserts (sub plan 06). The two lists are kept identical on purpose: the two
 * repos draw the same person, and a divergence here is a person changing colour
 * when they cross from one to the other.
 */

const VECTORS = [
  ["Vr72lD5Fp6BjojA9Mz_9YQ", 0],
  ["61qtu9mI5goi86W0l4Nd7Q", 1],
  ["Ibtc-Ocln_ly6CcAoDss6g", 2],
  ["9_N7i9gQGptfa9X1t9Akpw", 3],
  ["ekEa8YrO33F-mknIW9BlaA", 4],
  ["Sbxcxt80aoN5-ZtLWGmsPg", 5],
  ["L7p3EgH3qCqpvFyB1KLJvw", 6],
  ["FJvzjrP73gnWL26f170D4w", 7],
  ["84983c60f7daadc1", 4],
];

const KANBAN_COLORS = ["#6b4fa8", "#2f6a9e", "#9a6a1c", "#a8463d", "#2f7a69", "#4f6178", "#3f7d3a", "#a2457a"];

test("colorIndexOf is the people.js hash, on the eight-colour palette", () => {
  for (const [id, index] of VECTORS) {
    expect(colorIndexOf(id)).toBe(index);
    expect(personColor(id)).toBe(PERSON_COLORS[index]);
  }
  expect(PERSON_COLORS.length).toBe(8);
});

test("initialsOf is the first letter of the first two words", () => {
  expect(initialsOf("Ada Lovelace")).toBe("AL");
  expect(initialsOf("ada")).toBe("A");
  expect(initialsOf("Grace Brewster Hopper")).toBe("GB");
  expect(initialsOf("  maria  de la cruz ")).toBe("MD");
  expect(initialsOf("Guest 3")).toBe("G3");
  expect(initialsOf("\u{1F600} Smile")).toBe("\u{1F600}S");
  expect(initialsOf("\u03A9mega")).toBe("\u03A9");
  expect(initialsOf("\u00E9douard manet")).toBe("\u00C9M");
  expect(initialsOf("")).toBe("?");
});

test("the palette is Kanban's, in its order, and cannot be edited", () => {
  expect([...PERSON_COLORS]).toEqual(KANBAN_COLORS);
  expect(Object.isFrozen(PERSON_COLORS)).toBe(true);
});

// =============================================================================
// The two surfaces, one person
// =============================================================================

const ADA = { id: "Ibtc-Ocln_ly6CcAoDss6g", name: "Ada Chen" };
const GRACE = { id: "p_4d81e0075c", name: "Grace Hopper" };

const avatars = () => [...document.querySelectorAll("[data-clay-presence-avatar]")];

// One spelling for a colour, as presence-chrome.test.js: the engine normalizes
// `color` and `background-color` to rgb() and leaves `border-color` as authored,
// so two colours are only comparable after a round trip through a property that
// normalizes.
const asColor = (value) => {
  const probe = document.createElement("div");
  probe.style.color = value;
  return probe.style.getPropertyValue("color");
};

// The people plugin and the presence stack in one module registry, so both ask
// the same host answer: this is the page Kanban draws, a people host that also
// announced presence.
async function loadBoth() {
  jest.resetModules();
  document.body.innerHTML = "";
  window.localStorage.clear();
  window.clay = { isEditMode: true };
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      spec: 1,
      extensions: ["people", "presence"],
      document: { etag: "e", people: { me: null, members: [ADA, GRACE] } },
    }),
  }));
  const people = await import("../../src/plugins/people.js");
  await people.ready;
  const { presence } = await import("../../src/sync/presence.js");
  return { people, presence };
}

test("the stack paints a person the colour clay.people gives them", async () => {
  const { people, presence } = await loadBoth();
  const person = people.people.get(ADA.id);

  // A stack is drawn for two or more participants, so the count stands in for
  // the second one and the square under test is the only face on screen.
  await presence.update({
    people: [{ id: ADA.id, name: ADA.name, canEdit: true, you: false }],
    anonymous: 1,
  });

  const faces = avatars();
  expect(faces.length).toBe(1);
  expect(asColor(faces[0].style.getPropertyValue("color"))).toBe(asColor(PERSON_COLORS[person.color]));
  expect(faces[0].textContent).toBe(person.initials);
  expect(faces[0].textContent).toBe("AC");
});
