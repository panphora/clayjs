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

test("dialog: root, backdrop, form panel, header and its heading; hostile-proof and resolved", () => {
  document.documentElement.style.colorScheme = "dark";
  let parts;
  const calls = capture(() => { parts = bevelDialog({ zIndex: "250", width: "600px", closable: true, titled: true }); });
  const { root, overlay, panel, header, heading, body, footer, close } = parts;
  document.body.append(root);

  expect(root.getAttribute("data-clay-modal")).toBe("");
  expect(root.getAttribute("aria-hidden")).toBe("true");
  expect(overlay.parentElement).toBe(root);
  expect(panel.parentElement).toBe(overlay);
  expect([panel.tagName, panel.getAttribute("role"), panel.getAttribute("aria-modal")]).toEqual(["FORM", "dialog", "true"]);
  expect(header.parentElement).toBe(panel);
  expect(heading.parentElement).toBe(header);
  expect([heading.getAttribute("role"), heading.getAttribute("aria-level")]).toEqual(["heading", "2"]);
  expect(body.parentElement).toBe(panel);
  expect(footer.previousElementSibling).toBe(body);
  expect(close.parentElement).toBe(header);
  expect(expectHostileProof(root)).toBeGreaterThanOrEqual(8);
  expectCallsResolved(calls, root);
  expect(overlay.style.zIndex).toBe("250");
  expect(overlay.tabIndex).toBe(-1);
  expect(last(calls, panel, "width")).toBe("min(600px, 100%)");
  expect(last(calls, panel, "background")).toBe(TOKENS.surface);
  expect(last(calls, panel, "border")).toBe(`1px solid ${TOKENS["line-2"]}`);
  expect(last(calls, panel, "box-shadow")).toBe(`6px 6px 0 color-mix(in srgb, ${TOKENS.ink} 10%, transparent)`);
  expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
  document.documentElement.style.colorScheme = "";
  root.remove();
});

test("close: a 62px column at the header's right edge, the X painted inline, class-free", () => {
  let parts;
  const calls = capture(() => { parts = bevelDialog({ closable: true, titled: true }); });
  const { header, close } = parts;
  document.body.append(header);
  const svg = close.querySelector("svg");
  const path = svg.querySelector("path");

  expect(header.contains(close)).toBe(true);
  expect(close.getAttribute("aria-label")).toBe("Close");
  expect(close.title).toBe("Close");
  expect(last(calls, close, "width")).toBe("62px");
  expect(last(calls, close, "height")).toBe("calc(100% + 1px)");
  expect(last(calls, close, "border-left")).toBe(`1px solid ${TOKENS["line-2"]}`);
  expect(expectHostileProof(header)).toBe(3);
  expect(svg.getAttribute("class")).toBeNull();
  expect(last(calls, svg, "color")).toBe("inherit");
  expect(path.style.getPropertyValue("stroke")).toBe("currentColor");
  expect(path.style.getPropertyPriority("stroke")).toBe("important");
  header.remove();
});

test("dialog: no corner close unless asked for", () => {
  const { panel, header, heading, close } = bevelDialog();
  expect(header).toBeNull();
  expect(heading).toBeNull();
  expect(close).toBeNull();
  expect(panel.querySelector('button[aria-label="Close"]')).toBeNull();
});
