import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * clay.sortable.move: the reorder a drag makes, without dragging.
 *
 * The facade is synchronous, loads no vendor and answers from the document as it is now:
 *
 *   - a move lands where the caller says, at the top, the middle, the end, or in another
 *     list of the same group, and reports the same item/from/to/oldIndex/newIndex a drag
 *     reports;
 *   - the whole request is validated before anything moves: mode and admission, connected
 *     nodes, a real item of a declared sortable, an equal nonempty group, a destination
 *     that takes the item, and an anchor that is still a child of that destination. A
 *     refusal names its reason and leaves the document alone;
 *   - a move that would not change the order is not an insertion, a `clay:sorted` or an
 *     `input`; a real one notifies exactly once, through the same path a drop takes, with
 *     the source container as the dispatch target.
 *
 * The module is the real one, in edit mode, with the session a page's boot creates.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FIXTURE = `
  <div id="board">
    <ul id="a" sortable="cards" onsorted="window.notified.push('onsorted')">
      <li id="a1">A1</li>
      <li id="a2">A2</li>
      <li id="a3">A3</li>
      <li id="a4" cms-template></li>
    </ul>
    <ul id="b" sortable="cards" onsorted="window.notified.push('onsorted')">
      <li id="b1">B1</li>
      <li id="b2">B2</li>
      <li id="b3">B3</li>
    </ul>
    <ul id="c" sortable="tiles">
      <li id="c1">C1</li>
    </ul>
    <ul id="d">
      <li id="d1">D1</li>
    </ul>
    <ul id="e" sortable="cards">
      <li id="e1">E1</li>
      <li id="e2" clay="editor-ui">E2</li>
    </ul>
    <div id="g" sortable="cards"><span id="g1">G1</span></div>
    <ul id="n" sortable="cards">
      <li id="n1">N1</li>
      <li id="n2"><ul id="n3" sortable="cards"><li id="n4">N4</li></ul></li>
    </ul>
  </div>`;

const el = (id) => document.getElementById(id);
const ids = (container) => [...container.children].map((child) => child.id);

let sortable;
let mode;
const seen = [];

beforeAll(async () => {
  // The real edit-mode decision, taken with the page open for editing, so the live
  // binding the facade reads is the one a boot in edit sets.
  window.clayEditMode = true;
  mode = await import("../../src/core/is-edit-mode.js");
  sortable = await import("../../src/plugins/sortable.js");
  document.addEventListener("clay:sorted", (event) => {
    seen.push({ type: "clay:sorted", target: event.target, detail: event.detail });
    window.notified.push("clay:sorted");
  });
  document.addEventListener("input", (event) => {
    seen.push({ type: "input", target: event.target });
    window.notified.push("input");
  });
});

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  window.notified = [];
  seen.length = 0;
});

// The page's one sortable session, created by the module's own init. A move needs its
// admission, not its vendor.
const ready = () => sortable.ready;

test("the facade is published with the module, not with the vendor", async () => {
  // Drag readiness is still the promise the loader awaits; the move facade is already
  // here, and is the same function the loader puts on clay.sortable.
  expect(sortable.ready).toBeInstanceOf(Promise);
  expect(typeof sortable.move).toBe("function");
  expect(sortable.sortable.move).toBe(sortable.move);
  expect(Object.isFrozen(sortable.sortable)).toBe(true);
});

test("a move lands at the top, the middle, the end and in another list", async () => {
  await ready();
  const a = el("a");
  const b = el("b");

  expect(sortable.move(el("a3"), a, el("a1"))).toMatchObject({ ok: true, moved: true });
  expect(ids(a)).toEqual(["a3", "a1", "a2", "a4"]);

  expect(sortable.move(el("a3"), a, el("a2"))).toMatchObject({ ok: true, moved: true });
  expect(ids(a)).toEqual(["a1", "a3", "a2", "a4"]);

  expect(sortable.move(el("a1"), a, null)).toMatchObject({ ok: true, moved: true });
  // The end is the container's end, which is where a trailing seed row sits: exactly
  // where a drag that lands past the last card puts the card.
  expect(ids(a)).toEqual(["a3", "a2", "a4", "a1"]);

  const result = sortable.move(el("a2"), b, el("b1"));
  expect(result).toMatchObject({ ok: true, moved: true, oldIndex: 1, newIndex: 0 });
  expect(result.item).toBe(el("a2"));
  expect(result.from).toBe(a);
  expect(result.to).toBe(b);
  expect(ids(a)).toEqual(["a3", "a4", "a1"]);
  expect(ids(b)).toEqual(["a2", "b1", "b2", "b3"]);
});

test("a move notifies once, on the source container, in the order a drop notifies", async () => {
  await ready();
  const a = el("a");
  const b = el("b");
  const onDestination = [];
  a.addEventListener("clay:sorted", (event) => onDestination.push(event));

  sortable.move(el("b2"), a, el("a1"));

  const events = seen.filter((entry) => entry.type === "clay:sorted");
  expect(events).toHaveLength(1);
  // Dispatched on the container the item left, and bubbling from there.
  expect(events[0].target).toBe(b);
  expect(onDestination).toHaveLength(0);
  expect(Object.keys(events[0].detail).sort()).toEqual(["from", "item", "newIndex", "oldIndex", "to"]);
  expect(events[0].detail.item).toBe(el("b2"));
  expect(events[0].detail.from).toBe(b);
  expect(events[0].detail.to).toBe(a);
  expect([events[0].detail.oldIndex, events[0].detail.newIndex]).toEqual([1, 0]);

  // One compatibility input, on the same container.
  const inputs = seen.filter((entry) => entry.type === "input");
  expect(inputs).toHaveLength(1);
  expect(inputs[0].target).toBe(b);

  // Author onsorted code runs first, then the event, then the compat input.
  expect(window.notified).toEqual(["onsorted", "clay:sorted", "input"]);
});

test("a move to the position the item already holds is not a move at all", async () => {
  await ready();
  const a = el("a");

  // Its next item, itself, and the end it already sits at.
  expect(sortable.move(el("a2"), a, el("a3"))).toEqual({ ok: true, moved: false });
  expect(sortable.move(el("a2"), a, el("a2"))).toEqual({ ok: true, moved: false });
  // The last card's end is past the trailing seed row, which is not a position.
  expect(sortable.move(el("a3"), a, null)).toEqual({ ok: true, moved: false });

  expect(ids(a)).toEqual(["a1", "a2", "a3", "a4"]);
  expect(seen).toEqual([]);
  expect(window.notified).toEqual([]);
});

test("the destination has to be a declared sortable that takes the item, in the same group", async () => {
  await ready();

  expect(sortable.move(el("a2"), el("d"), null)).toEqual({ ok: false, code: "item" });
  expect(sortable.move(el("a2"), el("c"), null)).toEqual({ ok: false, code: "group" });
  // A list holds its own rows, so a span from a container of element children is refused.
  expect(sortable.move(el("g1"), el("b"), null)).toEqual({ ok: false, code: "item" });

  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(window.notified).toEqual([]);
});

test("a seed row and editor furniture are never moved, landed on, or moved past", async () => {
  await ready();
  const a = el("a");
  const e = el("e");

  expect(sortable.move(el("a4"), a, null)).toEqual({ ok: false, code: "item" });
  expect(sortable.move(el("e2"), e, null)).toEqual({ ok: false, code: "item" });
  expect(sortable.move(el("a2"), a, el("a4"))).toEqual({ ok: false, code: "anchor" });
  expect(sortable.move(el("a2"), e, el("e2"))).toEqual({ ok: false, code: "anchor" });

  expect(ids(a)).toEqual(["a1", "a2", "a3", "a4"]);
  expect(ids(e)).toEqual(["e1", "e2"]);
  expect(window.notified).toEqual([]);
});

test("a node that left the document, or was replaced by a same-id node, is detached", async () => {
  await ready();
  const a = el("a");
  const stale = el("a2");
  const replacement = document.createElement("li");
  replacement.id = "a2";
  stale.replaceWith(replacement);

  expect(sortable.move(stale, a, null)).toEqual({ ok: false, code: "detached" });

  const destination = el("b");
  destination.remove();
  expect(sortable.move(replacement, destination, null)).toEqual({ ok: false, code: "detached" });

  expect(ids(a)).toEqual(["a1", "a2", "a3", "a4"]);
  expect(window.notified).toEqual([]);
});

test("a vanished anchor is refused, never re-targeted at a neighbour", async () => {
  await ready();
  const b = el("b");
  const anchor = el("b3");
  anchor.remove();

  expect(sortable.move(el("a2"), b, anchor)).toEqual({ ok: false, code: "anchor" });
  // An anchor that is not a child of this destination is refused the same way.
  expect(sortable.move(el("a2"), b, el("c1"))).toEqual({ ok: false, code: "anchor" });

  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(ids(b)).toEqual(["b1", "b2"]);
  expect(window.notified).toEqual([]);
});

test("a container cannot be moved into its own subtree", async () => {
  await ready();

  expect(sortable.move(el("n2"), el("n3"), null)).toEqual({ ok: false, code: "item" });
  expect(sortable.move(el("n2"), el("n3"), el("n4"))).toEqual({ ok: false, code: "item" });

  expect(ids(el("n3"))).toEqual(["n4"]);
  expect(ids(el("n"))).toEqual(["n1", "n2"]);
  expect(window.notified).toEqual([]);
});

test("a page in view refuses the move", async () => {
  await ready();
  mode.commitModeFacts({ mode: "view", isEditMode: false });
  try {
    expect(sortable.move(el("a2"), el("a"), el("a1"))).toEqual({ ok: false, code: "not-editable" });
    expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
    expect(window.notified).toEqual([]);
  } finally {
    mode.commitModeFacts({ mode: "edit", isEditMode: true });
  }
});

test("a move after the session quiesced is refused, and lands again after resume", async () => {
  const lease = await ready();

  lease.quiesce();
  expect(sortable.move(el("a2"), el("a"), el("a1"))).toEqual({ ok: false, code: "not-editable" });
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(window.notified).toEqual([]);

  lease.resume();
  expect(sortable.move(el("a2"), el("a"), el("a1"))).toMatchObject({ ok: true, moved: true });
  expect(ids(el("a"))).toEqual(["a2", "a1", "a3", "a4"]);
});

// attachPluginMember is not exported, so its source is lifted out of loader.js and the
// real function is called, the pattern loader-shape.test.js reads the loader's other
// branches with.
test("the loader attaches the facade to clay.sortable when the module loads", () => {
  const source = readFileSync(join(repoRoot, "src", "loader.js"), "utf8");
  const found = source.match(/^function attachPluginMember\(path, mod, [^)]*\) \{[\s\S]*?\n\}$/m);
  expect(found).not.toBeNull();
  const attachPluginMember = new Function(`${found[0]}\nreturn attachPluginMember;`)();

  window.clay = window.clay || {};
  attachPluginMember("plugins/sortable.js", sortable, {});

  expect(window.clay.sortable).toBe(sortable.sortable);
  expect(typeof window.clay.sortable.move).toBe("function");
});
