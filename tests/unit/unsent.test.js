import { jest } from "@jest/globals";
import { pendingIds } from "../../src/lib/unsaved-state.js";

/**
 * `clay.unsent`: text a person typed into chrome and has not sent yet, kept per
 * record and name in this tab, outside the file.
 *
 * The page boots through the real loader, because that is where the member is
 * attached and where the plugin is loaded. A detail view is rebuilt by the app
 * (Kanban's `openDetail` clears it and refills it in one task), so the restore has
 * to run after that synchronous code: it comes from a MutationObserver.
 */

const PAGE = `
  <div id="content">
    <article class="card" data-id="c1">
      <h3>Card one</h3>
      <div class="detail" clay="editor-ui"><input class="comment" unsent="comment"></div>
    </article>
    <article class="card" data-id="c2">
      <h3>Card two</h3>
      <div class="detail" clay="editor-ui"><textarea class="comment" unsent="comment"></textarea></div>
    </article>
  </div>
`;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const detailOf = (id) => document.querySelector(`[data-id="${id}"] .detail`);

// Rebuilds a record's detail the way a view does: empty it, then build a fresh
// control with the record's saved value.
function reopen(id, value = "") {
  const detail = detailOf(id);
  const tag = id === "c2" ? "textarea" : "input";
  detail.innerHTML = `<${tag} class="comment" unsent="comment">`;
  const el = detail.querySelector("[unsent]");
  el.value = value;
  return el;
}

function type(el, value) {
  el.dispatchEvent(new Event("beforeinput", { bubbles: true }));
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  window.fetch = async () => ({ ok: false, status: 404, statusText: "Not Found", text: async () => "" });
  document.body.innerHTML = PAGE;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("plugins=unsent&exclude=richclay,source"), resolve));
});

beforeEach(async () => {
  for (const draft of window.clay.unsent.list()) window.clay.unsent.drop(draft.record, draft.name);
  document.body.innerHTML = PAGE;
  await flush();
});

test("text typed into a record's comment box comes back when the detail is rebuilt", async () => {
  type(document.querySelector('[data-id="c1"] [unsent="comment"]'), "half a thought");
  expect(window.clay.unsent.size).toBe(1);

  detailOf("c1").innerHTML = "";
  await flush();

  const again = reopen("c1");
  await flush();
  expect(again.value).toBe("half a thought");
});

test("two records keep their own text", async () => {
  type(document.querySelector('[data-id="c1"] [unsent="comment"]'), "on the first card");
  type(document.querySelector('[data-id="c2"] [unsent="comment"]'), "on the second card");

  expect(window.clay.unsent.list()).toEqual([
    { record: "c1", name: "comment", base: "", text: "on the first card" },
    { record: "c2", name: "comment", base: "", text: "on the second card" },
  ]);

  detailOf("c1").innerHTML = "";
  detailOf("c2").innerHTML = "";
  await flush();

  const one = reopen("c1");
  const two = reopen("c2");
  await flush();
  expect(one.value).toBe("on the first card");
  expect(two.value).toBe("on the second card");
});

test("returning the text to its base drops it and lets the close warning go", () => {
  const input = reopen("c1", "the saved description");
  type(input, "the saved description, edited");
  expect(window.clay.unsent.size).toBe(1);
  expect(pendingIds()).toContain("unsent");

  type(input, "the saved description");
  expect(window.clay.unsent.size).toBe(0);
  expect(pendingIds()).not.toContain("unsent");
});

test("clear drops the draft, and the detail comes back empty", async () => {
  const input = document.querySelector('[data-id="c1"] [unsent="comment"]');
  type(input, "about to be sent");
  expect(pendingIds()).toContain("unsent");

  window.clay.unsent.clear(input);
  expect(window.clay.unsent.size).toBe(0);
  expect(pendingIds()).not.toContain("unsent");

  detailOf("c1").innerHTML = "";
  await flush();
  const again = reopen("c1");
  await flush();
  expect(again.value).toBe("");
});

test("a restored input whose saved value changed says the draft is stale", async () => {
  type(document.querySelector('[data-id="c1"] [unsent="comment"]'), "half a thought");
  detailOf("c1").innerHTML = "";
  await flush();

  const seen = [];
  document.addEventListener("clay:unsent-restored", (event) => seen.push(event.detail), { once: true });

  const again = reopen("c1", "the description a peer saved");
  await flush();
  expect(again.value).toBe("half a thought");
  expect(seen).toEqual([{ base: "", current: "the description a peer saved", stale: true }]);
});

test("no kept text ever reaches the file a save would send", () => {
  type(document.querySelector('[data-id="c1"] [unsent="comment"]'), "a sentence nobody sent");
  expect(window.clay.unsent.size).toBe(1);
  expect(window.clay.getHTML()).not.toContain("a sentence nobody sent");
});

test("a sessionStorage that throws keeps the text in memory and the warning on", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get() {
      throw new DOMException("access denied", "SecurityError");
    },
  });

  try {
    type(document.querySelector('[data-id="c2"] [unsent="comment"]'), "kept in this tab only");
    expect(window.clay.unsent.size).toBe(1);
    expect(pendingIds()).toContain("unsent");
  } finally {
    Object.defineProperty(window, "sessionStorage", descriptor);
  }
});

// Last, because a second load of the module registers its own checks and observers.
test("a fresh load with the same sessionStorage restores the text", async () => {
  type(document.querySelector('[data-id="c1"] [unsent="comment"]'), "kept across a reload");
  detailOf("c1").innerHTML = "";
  await flush();

  jest.resetModules();
  const fresh = await import("../../src/plugins/unsent.js");
  expect(fresh.unsent.list()).toEqual([
    { record: "c1", name: "comment", base: "", text: "kept across a reload" },
  ]);

  const again = reopen("c1");
  await flush();
  expect(again.value).toBe("kept across a reload");
});
