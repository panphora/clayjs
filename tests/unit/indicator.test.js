import { jest } from "@jest/globals";

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/plugins/indicator.js"); // onDomReady => init runs (jsdom is 'complete')
});

function fire(state) {
  document.dispatchEvent(new CustomEvent("clay:save-" + state));
}

test("shows the right label + clay markers on save events, hides after saved", () => {
  jest.useFakeTimers();

  fire("saving");
  let node = document.querySelector("[data-clay-indicator]");
  expect(node).not.toBeNull();
  expect(node.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  expect(node.getAttribute("role")).toBe("status");
  expect(node.textContent).toBe("Saving…");
  expect(node.style.opacity).toBe("1");

  fire("saved");
  expect(node.textContent).toBe("Saved");
  expect(node.style.opacity).toBe("1");

  jest.advanceTimersByTime(2200);
  expect(node.style.opacity).toBe("0");

  fire("error");
  expect(node.textContent).toBe("Couldn't save");
  expect(node.dataset.state).toBe("error");

  jest.useRealTimers();
});

// core/save-conflict-notice.js owns the conflict state now, and it ships in every
// document rather than only the ones that turned this chip on. Both listen to
// clay:save-conflict, so a label here put a chip in the corner saying the same
// thing as the bar, at the same moment.
test("says nothing on a conflict, leaving that to the core notice", () => {
  fire("saved");
  const node = document.querySelector("[data-clay-indicator]");
  const before = node.textContent;

  fire("conflict");

  expect(node.textContent).toBe(before);
  expect(node.dataset.state).not.toBe("conflict");
});
