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
