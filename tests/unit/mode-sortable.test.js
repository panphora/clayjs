/**
 * @jest-environment jsdom
 */

/**
 * Sortable as a mode lease.
 *
 * A drag editor is only the edit session's while that session holds admission. So:
 *
 *   - the entry creates the page's instances and starts one subscription for containers
 *     that arrive later, and a second entry asks for what the page already has instead of
 *     adding a second editor in front of the same list;
 *   - a drop that lands after the exit closed admission reaches no author handler, no
 *     `clay:sorted` and no compat `input`, so a page leaving edit cannot be rewritten by
 *     the drag it authorized a moment earlier;
 *   - the vendor fetch can outlive the session that asked for it, so the generation is
 *     asked again once it lands and a stale answer starts nothing;
 *   - dispose destroys every instance, removes exactly the subscriptions this session
 *     added (target, type and capture option included), and clears the restores it
 *     scheduled, so the next entry begins from nothing.
 *
 * The modules are the real ones, driven in the order a boot and a switch drive them.
 */

const FIXTURE = `
  <ul id="list" sortable onsorting="window.sortingRan = (window.sortingRan || 0) + 1" onsorted="window.sortedRan = (window.sortedRan || 0) + 1">
    <li class="item">A<span class="saved" style="color: red;"></span></li>
    <li class="item">B</li>
  </ul>
`;

const additions = [];
const removals = [];

const forType = (log, type, target) => log.filter((entry) => entry.type === type && entry.target === target);
// Sortable listens for the press itself; the session's own recorder is the capturing one.
const captured = (log, type, target) => forType(log, type, target).filter((entry) => entry.options === true);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const listOf = () => document.getElementById("list");

// Every lease a case enters is disposed before the next one: the page has one sortable
// session, and a case has to leave it the way a committed exit does.
const leases = [];

const enter = async (context = {}) => {
  const lease = await sortable.sortableParticipant().prepare({ generation: 1, isCurrent: () => true, ...context });
  lease.enable();
  leases.push(lease);
  return lease;
};

let sortable;

const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;

beforeAll(async () => {
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    additions.push({ target: this, type, handler, options });
    return realAdd.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    removals.push({ target: this, type, handler, options });
    return realRemove.call(this, type, handler, options);
  };
  sortable = await import("../../src/plugins/sortable.js");
});

afterAll(() => {
  EventTarget.prototype.addEventListener = realAdd;
  EventTarget.prototype.removeEventListener = realRemove;
});

beforeEach(() => {
  additions.length = 0;
  removals.length = 0;
  delete window.sortedRan;
  delete window.sortingRan;
  document.body.innerHTML = FIXTURE;
});

afterEach(() => {
  while (leases.length) leases.pop().dispose();
});

test("the entry wires the page's containers once, and a second entry adds no second editor", async () => {
  const lease = await enter();
  const list = listOf();

  expect(window.Sortable.get(list)).toBeTruthy();
  // The press recorder has to see the press before Sortable's own handler does.
  const added = captured(additions, "pointerdown", list);
  expect(added).toHaveLength(1);

  const second = await sortable.sortableParticipant().prepare({ generation: 1, isCurrent: () => true });
  second.enable();
  expect(captured(additions, "pointerdown", list)).toHaveLength(1);

  second.quiesce();
  lease.dispose();

  expect(window.Sortable.get(list)).toBeNull();
  const removed = captured(removals, "pointerdown", list);
  expect(removed).toHaveLength(1);
  expect(removed[0].handler).toBe(added[0].handler);
  expect(removed[0].options).toBe(true);
});

test("a later entry starts one fresh instance and one fresh subscription", async () => {
  (await enter()).dispose();
  document.body.innerHTML = FIXTURE;

  await enter();

  expect(window.Sortable.get(listOf())).toBeTruthy();
  expect(captured(additions, "pointerdown", listOf())).toHaveLength(1);
});

test("a drop after quiesce reaches no author code and no reactive engine; after resume it does", async () => {
  const lease = await enter();
  const list = listOf();
  const instance = window.Sortable.get(list);
  const seen = [];
  list.addEventListener("clay:sorted", (event) => seen.push(event.detail));
  list.addEventListener("input", () => seen.push("input"));
  const drop = { item: list.children[0], from: list, to: list, oldIndex: 0, newIndex: 1 };

  lease.quiesce();
  instance.options.onEnd(drop);
  instance.options.onMove({});
  expect(seen).toEqual([]);
  expect(window.sortedRan).toBeUndefined();
  expect(window.sortingRan).toBeUndefined();

  lease.resume();
  instance.options.onEnd(drop);
  expect(window.sortedRan).toBe(1);
  expect(seen[0].item).toBe(drop.item);
  expect(seen[0].from).toBe(list);
  expect(seen[0].to).toBe(list);
  expect([seen[0].oldIndex, seen[0].newIndex]).toEqual([0, 1]);
  expect(seen[1]).toBe("input");
  instance.options.onMove({});
  expect(window.sortingRan).toBe(1);
});

test("a container that arrives mid-session is wired, and one that arrives while quiesced is not", async () => {
  const lease = await enter();
  const list = listOf();

  list.insertAdjacentHTML("beforeend", '<ul class="late" sortable><li>C</li></ul>');
  await wait(250);
  expect(window.Sortable.get(document.querySelector("ul.late"))).toBeTruthy();

  lease.quiesce();
  list.insertAdjacentHTML("beforeend", '<ul class="held" sortable><li>D</li></ul>');
  await wait(250);
  expect(window.Sortable.get(document.querySelector("ul.held"))).toBeUndefined();

  lease.resume();
  list.insertAdjacentHTML("beforeend", '<ul class="after" sortable><li>E</li></ul>');
  await wait(250);
  expect(window.Sortable.get(document.querySelector("ul.after"))).toBeTruthy();

  lease.dispose();
});

test("dispose removes the listeners a press started, and the restore it scheduled", async () => {
  const lease = await enter();
  const item = listOf().children[0];

  item.setAttribute("style", "color: red;");
  item.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(captured(additions, "pointerup", document)).toHaveLength(1);

  item.setAttribute("style", "color: blue;");
  item.dispatchEvent(new Event("pointerup", { bubbles: true }));
  const removed = captured(removals, "pointerup", document);
  expect(removed).toHaveLength(1);
  expect(removed[0].options).toBe(true);

  // The restore was scheduled, not run: the session's own timer is what puts the recorded
  // attribute back, and the exit clears it before it can.
  lease.dispose();
  await wait(20);
  expect(item.getAttribute("style")).toBe("color: blue;");
});

test("the vendor load is checked against the generation that asked for it", async () => {
  let current = true;
  const pending = sortable.sortableParticipant().prepare({ generation: 1, isCurrent: () => current });
  // The page leaves edit while the vendor fetch is still in flight.
  current = false;

  await expect(pending).rejects.toMatchObject({ code: "stale-document" });
  expect(window.Sortable.get(listOf())).toBeUndefined();
  expect(captured(additions, "pointerdown", listOf())).toHaveLength(0);

  await expect(
    sortable.sortableParticipant().prepare({ generation: 2, signal: { aborted: true }, isCurrent: () => true })
  ).rejects.toMatchObject({ code: "stale-document" });
});
