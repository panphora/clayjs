import All from "../../src/dom/all.js";

beforeEach(() => {
  document.body.innerHTML = `
    <ul>
      <li class="card" data-id="1">one</li>
      <li class="card" data-id="2">two</li>
      <li class="card" data-id="3">three</li>
    </ul>`;
});

test("wraps querySelectorAll with length + numeric indexing", () => {
  const cards = All(".card");
  expect(cards.length).toBe(3);
  expect(cards[0]).toBe(document.querySelector(".card"));
});

test("array methods (map/filter) work through the proxy", () => {
  const ids = All(".card").map((el) => el.dataset.id);
  expect(ids).toEqual(["1", "2", "3"]);
});

test("pluck reads an attribute across the set", () => {
  expect(All(".card").pluck("data-id")).toEqual(["1", "2", "3"]);
});

test("eq narrows to a single-element chainable set", () => {
  const second = All(".card").eq(1);
  expect(second.length).toBe(1);
  expect(second[0].textContent).toBe("two");
});

test("property write fans out to every element", () => {
  const cards = All(".card");
  cards.className = "card open";
  expect([...document.querySelectorAll(".card")].every((el) => el.classList.contains("open"))).toBe(true);
});

test("missing selector returns an empty, still-chainable set", () => {
  const none = All(".nope");
  expect(none.length).toBe(0);
  expect(() => none.classList.add("x")).not.toThrow();
});
