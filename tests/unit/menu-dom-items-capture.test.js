import { jest } from "@jest/globals";

// Scenario: the x on a menu item removes a real element, and the save must carry that
// removal. The save capture is the page as it stands, except that a clay="freeze" region
// comes back from its authored content. So an element outside every freeze region stays
// gone in the bytes, and one inside a freeze region returns.

const BODY = `
  <div id="document-menu-items" hidden>
    <a id="durable" href="mailto:fixture@example.invalid">Appreciation</a>
  </div>
  <div clay="editor-ui"><a id="projection">Projection</a></div>
  <header clay="freeze"><a id="frozen" href="mailto:fixture@example.invalid">Control</a></header>
`;

beforeEach(() => {
  jest.resetModules();
  document.head.innerHTML = '<title>Fixture</title><script clay="no-copy" data-analytics>void 0</script>';
  document.body.innerHTML = BODY;
  window.clay = {};
});

async function captureSaveCloneOf(remove) {
  await import("../../src/attrs/save-freeze.js");
  const { captureSaveClone } = await import("../../src/core/snapshot.js");
  remove();
  return captureSaveClone({ flushUndo: false });
}

test("a removal outside a freeze region stays out of the captured save", async () => {
  const el = document.querySelector("#durable");
  expect(el.isConnected).toBe(true);

  const snapshot = await captureSaveCloneOf(() => el.remove());

  expect(el.isConnected).toBe(false);
  expect(snapshot.querySelector("#durable")).toBeNull();
});

test("a removal inside a freeze region comes back", async () => {
  const el = document.querySelector("#frozen");
  expect(el.isConnected).toBe(true);

  const snapshot = await captureSaveCloneOf(() => el.remove());

  expect(el.isConnected).toBe(false);
  expect(snapshot.querySelector("#frozen")).not.toBeNull();
});

test("editor UI stays out of the save and a copy drops only the no-copy marker", async () => {
  const { stripCopyContent } = await import("../../src/core/copy-content.js");

  const snapshot = await captureSaveCloneOf(() => {});

  expect(snapshot.querySelector("#projection")).toBeNull();
  expect(snapshot.querySelector("[data-analytics]")).not.toBeNull();
  expect(snapshot.querySelector("#durable")).not.toBeNull();

  const copied = new DOMParser().parseFromString(stripCopyContent(snapshot.outerHTML), "text/html");
  expect(copied.querySelector("#durable")).not.toBeNull();
  expect(copied.querySelector("[data-analytics]")).toBeNull();
});
