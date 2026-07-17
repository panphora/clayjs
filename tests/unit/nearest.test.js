import nearest from "../../src/dom/nearest.js";

beforeEach(() => {
  document.body.innerHTML = `
    <section>
      <div id="start"></div>
      <aside class="panel"></aside>
      <nav data-menu></nav>
    </section>
    <footer data-menu id="far"></footer>
  `;
});

test("finds a nearby sibling by class before a distant match", () => {
  const start = document.getElementById("start");
  expect(nearest(start, ".panel")).toBe(document.querySelector(".panel"));
});

test("finds the nearest [data-menu] (sibling nav, not the far footer)", () => {
  const start = document.getElementById("start");
  expect(nearest(start, "[data-menu]")).toBe(document.querySelector("nav[data-menu]"));
});

test("applies the transform callback to the found element", () => {
  const start = document.getElementById("start");
  expect(nearest(start, ".panel", (el) => el.className)).toBe("panel");
});

test("returns null when nothing matches", () => {
  const start = document.getElementById("start");
  expect(nearest(start, ".does-not-exist")).toBeNull();
});
