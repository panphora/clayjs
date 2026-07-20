// The optional UI module is the only place clayjs renders save feedback. It must
// read both the text and the severity off the public event, so a server warning
// on an otherwise-successful save shows as a warning toast rather than "Saved".

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/ui/index.js");
});

beforeEach(() => {
  document.body.innerHTML = "";
});

function fireSaved(detail) {
  document.dispatchEvent(new CustomEvent("clay:save-saved", { detail }));
}

function renderedToast() {
  return document.querySelector(".toast");
}

test("warning msgType renders a warning toast carrying the server's text", () => {
  fireSaved({ msg: "Saved, but the file changed on disk", msgType: "warning" });

  const el = renderedToast();
  expect(el).not.toBeNull();
  expect(el.classList.contains("warning")).toBe(true);
  expect(el.classList.contains("success")).toBe(false);
  expect(el.textContent).toContain("Saved, but the file changed on disk");
});

test("success msgType renders a success toast", () => {
  fireSaved({ msg: "Saved", msgType: "success" });

  const el = renderedToast();
  expect(el.classList.contains("success")).toBe(true);
  expect(el.classList.contains("warning")).toBe(false);
  expect(el.textContent).toContain("Saved");
});

test("absent msgType renders a success toast", () => {
  fireSaved({ msg: "Saved" });

  expect(renderedToast().classList.contains("success")).toBe(true);
});

// A stale-write warning names the file, and a filename is attacker-chosen on any
// OS that allows < and > in names. The toast builds its shell with innerHTML, so
// the message must never travel that path.
test("markup in the server's message is rendered as text, never as HTML", () => {
  fireSaved({
    msg: 'note<img src=x onerror="window.__pwned=1">.htmlclay changed on disk',
    msgType: "warning",
  });

  const el = renderedToast();
  expect(el.querySelector("img")).toBeNull();
  expect(window.__pwned).toBeUndefined();
  expect(el.textContent).toContain('note<img src=x onerror="window.__pwned=1">.htmlclay');
});

test("absent detail falls back to a Saved success toast", () => {
  fireSaved(undefined);

  const el = renderedToast();
  expect(el.classList.contains("success")).toBe(true);
  expect(el.textContent).toContain("Saved");
});
