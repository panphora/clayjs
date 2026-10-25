/**
 * @jest-environment jsdom
 */

/**
 * RichClay as a mode lease.
 *
 * The vendor's own auto-watch belongs to nobody: in a managed page it defers, and the
 * adapter has to take it away anyway, or an entry could meet an editor it did not mount
 * and the exit could leave one behind. So:
 *
 *   - the entry mounts one editor per authored region, starts one watcher for the regions
 *     that arrive later and one `clay:sync-applied` subscription, and a second entry asks
 *     for what the page already has instead of drawing a second editor in front of it;
 *   - a region that arrives while the exit has closed admission is given no editor, and
 *     the same session's resume arms the next one;
 *   - a peer frame strips RichClay's runtime state, and the session's own listener puts it
 *     back; after the exit that frame reaches no editor at all;
 *   - prepare answers for a stale generation before it mounts anything;
 *   - dispose destroys every instance and removes exactly the subscription this session
 *     added, so a view holds no editor and the next entry begins from nothing.
 *
 * The modules are the real ones, driven in the order a boot and a switch drive them.
 */

const FIXTURE = `
  <main>
    <div id="host">
      <div class="block" editable><h2>Team plan</h2><p>$12 per seat.</p></div>
      <div class="block" data-richclay aria-label="Attached editor"><p>Business: $24 per seat.</p></div>
    </div>
  </main>
`;

const CHROME = "[data-richclay-toolbar], [data-richclay-menu], [data-richclay-dialog], [data-richclay-live], [data-richclay-float]";

const additions = [];
const removals = [];

const forType = (log, type, target) => log.filter((entry) => entry.type === type && entry.target === target);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const regions = () => [...document.querySelectorAll("[editable], [data-richclay]")].filter((el) => !el.closest(CHROME));
const mounted = () => regions().filter((el) => el.getAttribute("contenteditable") === "true");
const active = () => document.querySelectorAll(".richclay-active");

// What a peer frame does to a live editor: the snapshot carries none of the runtime state,
// and the merge removes the attributes the merged page lacks.
const strip = () => {
  for (const el of regions()) {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-richclay-active");
    el.classList.remove("richclay-active");
  }
};

const leases = [];

const enter = async (context = {}) => {
  const lease = await richclay.richclayParticipant().prepare({ generation: 1, isCurrent: () => true, ...context });
  lease.enable();
  leases.push(lease);
  return lease;
};

let richclay;

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
  // A managed page: clay.mode is a string, so the vendor defers to the adapter.
  window.clay = { mode: "view" };
  window.scrollTo = () => {};
  richclay = await import("../../src/plugins/richclay.js");
  await richclay.ready;
});

afterAll(() => {
  EventTarget.prototype.addEventListener = realAdd;
  EventTarget.prototype.removeEventListener = realRemove;
});

beforeEach(() => {
  additions.length = 0;
  removals.length = 0;
  document.body.innerHTML = FIXTURE;
});

afterEach(() => {
  while (leases.length) leases.pop().dispose();
});

test("the entry mounts one editor per authored region, and a second entry adds no second editor", async () => {
  const lease = await enter();

  expect(mounted()).toHaveLength(2);
  expect(active()).toHaveLength(2);
  expect(forType(additions, "clay:sync-applied", document)).toHaveLength(1);

  const second = await richclay.richclayParticipant().prepare({ generation: 1, isCurrent: () => true });
  second.enable();
  expect(mounted()).toHaveLength(2);
  expect(active()).toHaveLength(2);
  expect(forType(additions, "clay:sync-applied", document)).toHaveLength(1);

  second.quiesce();
  lease.dispose();
});

test("dispose destroys every editor and hands back the frame subscription", async () => {
  const lease = await enter();
  const added = forType(additions, "clay:sync-applied", document);
  expect(added).toHaveLength(1);
  expect(added[0].target).toBe(document);

  lease.dispose();

  expect(mounted()).toHaveLength(0);
  expect(active()).toHaveLength(0);
  const removed = forType(removals, "clay:sync-applied", document);
  expect(removed).toHaveLength(1);
  expect(removed[0].target).toBe(added[0].target);
  expect(removed[0].handler).toBe(added[0].handler);
});

test("a later entry starts fresh editors and one fresh subscription", async () => {
  (await enter()).dispose();
  expect(mounted()).toHaveLength(0);
  additions.length = 0;

  await enter();

  expect(mounted()).toHaveLength(2);
  expect(forType(additions, "clay:sync-applied", document)).toHaveLength(1);
});

test("a region that arrives while quiesced is given no editor; after resume it is", async () => {
  const lease = await enter();
  const host = document.getElementById("host");

  lease.quiesce();
  host.insertAdjacentHTML("beforeend", '<div id="held" editable><p>Held</p></div>');
  await wait(0);
  expect(document.getElementById("held").getAttribute("contenteditable")).toBeNull();

  lease.resume();
  host.insertAdjacentHTML("beforeend", '<div id="after" editable><p>After</p></div>');
  await wait(0);
  expect(document.getElementById("after").getAttribute("contenteditable")).toBe("true");

  lease.dispose();
});

test("the vendor's own watcher mounts nothing behind the session's back", async () => {
  document.getElementById("host").insertAdjacentHTML("beforeend", '<div id="unwatched" editable><p>Unwatched</p></div>');
  await wait(0);
  expect(document.getElementById("unwatched").getAttribute("contenteditable")).toBeNull();
  expect(active()).toHaveLength(0);
});

test("a peer frame reattaches the editors the merge stripped, and after the exit it reaches none", async () => {
  const lease = await enter();
  const [region] = regions();

  strip();
  expect(region.getAttribute("contenteditable")).toBeNull();
  document.dispatchEvent(new Event("clay:sync-applied"));
  expect(region.getAttribute("contenteditable")).toBe("true");
  expect(region.classList.contains("richclay-active")).toBe(true);

  lease.dispose();
  strip();
  document.dispatchEvent(new Event("clay:sync-applied"));
  expect(region.getAttribute("contenteditable")).toBeNull();
  expect(active()).toHaveLength(0);
});

test("prepare answers for a stale generation before it mounts anything", async () => {
  await expect(
    richclay.richclayParticipant().prepare({ generation: 1, signal: { aborted: true }, isCurrent: () => true })
  ).rejects.toMatchObject({ code: "stale-document" });

  await expect(
    richclay.richclayParticipant().prepare({ generation: 2, isCurrent: () => false })
  ).rejects.toMatchObject({ code: "stale-document" });

  expect(mounted()).toHaveLength(0);
  expect(forType(additions, "clay:sync-applied", document)).toHaveLength(0);
});
