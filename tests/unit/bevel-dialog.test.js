import { bevelCornerClose, bevelBox, RUNTIME_ONLY } from "../../src/ui/bevel-controls.js";
import { bevelDialog } from "../../src/ui/bevel-dialog.js";
import { TOKENS } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

test("corner close: a 68px diagonal corner, the X painted inline, class-free", () => {
  let b;
  const calls = capture(() => { b = bevelCornerClose({ label: "Close modal" }); });
  document.body.append(b);
  const [bg, x] = b.querySelector("svg").children;

  expect(b.getAttribute("aria-label")).toBe("Close modal");
  expect(b.style.getPropertyValue("width")).toBe("68px");
  expect(b.style.getPropertyValue("clip-path")).toContain("polygon");
  expect(expectHostileProof(b)).toBe(2);
  for (const el of [bg, x]) expect(el.getAttribute("class")).toBeNull();
  expect(last(calls, bg, "fill")).toBe(TOKENS.sunk);
  expect(last(calls, x, "fill")).toBe(TOKENS.ink);
  expect(x.style.getPropertyValue("fill-rule")).toBe("evenodd");
  b.remove();
});

test("corner close: hover lifts to the face, keyboard focus fills brass, both return", () => {
  const b = bevelCornerClose();
  document.body.append(b);
  const [bg, x] = b.querySelector("svg").children;

  const hover = capture(() => b.dispatchEvent(new MouseEvent("pointerenter")));
  expect(last(hover, bg, "fill")).toBe(TOKENS.face);
  const leave = capture(() => b.dispatchEvent(new MouseEvent("pointerleave")));
  expect(last(leave, bg, "fill")).toBe(TOKENS.sunk);

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
  const focus = capture(() => b.focus());
  expect(last(focus, bg, "fill")).toBe(TOKENS.brass);
  expect(last(focus, x, "fill")).toBe(TOKENS.face);
  expect(b.style.getPropertyValue("outline")).toBe("none");
  const blur = capture(() => b.blur());
  expect(last(blur, bg, "fill")).toBe(TOKENS.sunk);
  b.remove();
});

test("box: reset first, runtime-only, only the given rules after", () => {
  const box = bevelBox("div", ["display:flex"]);
  expect(box.style.item(0)).toBe("all");
  expect(box.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(box.style.getPropertyValue("display")).toBe("flex");
  expect(expectHostileProof(box)).toBe(1);
});

test("dialog: root, backdrop, form panel; hostile-proof and resolved; the page's scheme", () => {
  document.documentElement.style.colorScheme = "dark";
  let parts;
  const calls = capture(() => { parts = bevelDialog({ zIndex: "250", width: "600px", closable: true }); });
  const { root, overlay, panel, body, footer, close } = parts;
  document.body.append(root);

  expect(root.getAttribute("data-clay-modal")).toBe("");
  expect(root.getAttribute("aria-hidden")).toBe("true");
  expect(overlay.parentElement).toBe(root);
  expect(panel.parentElement).toBe(overlay);
  expect([panel.tagName, panel.getAttribute("role"), panel.getAttribute("aria-modal")]).toEqual(["FORM", "dialog", "true"]);
  expect(body.parentElement.parentElement).toBe(panel);
  expect(footer.previousElementSibling).toBe(body);
  expect(close.parentElement).toBe(panel);
  expect(expectHostileProof(root)).toBeGreaterThanOrEqual(7);
  expectCallsResolved(calls, root);
  expect(overlay.style.zIndex).toBe("250");
  expect(overlay.tabIndex).toBe(-1);
  expect(last(calls, panel, "width")).toBe("min(600px, 100%)");
  expect(last(calls, panel, "background")).toBe(TOKENS.surface);
  expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
  document.documentElement.style.colorScheme = "";
  root.remove();
});

test("dialog: no corner close unless asked for", () => {
  const { panel, close } = bevelDialog();
  expect(close).toBeNull();
  expect(panel.querySelector('button[aria-label="Close modal"]')).toBeNull();
});
