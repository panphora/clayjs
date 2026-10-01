import { bevelInput, paintInput, RUNTIME_ONLY } from "../../src/ui/bevel-controls.js";
import { RULES, TOKENS } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof } from "./helpers/injected-ui.js";

const value = (rules, prop) => rules.find((r) => r.startsWith(`${prop}:`)).slice(prop.length + 1).trim();

test("structure: a text input in the field material, runtime-only, every declaration !important", () => {
  let input;
  const calls = capture(() => { input = bevelInput(); });
  document.body.append(input);

  expect(input.tagName).toBe("INPUT");
  expect(input.type).toBe("text");
  expect(input.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(expectHostileProof(input)).toBe(1);
  expect(input.style.item(0)).toBe("all");
  expect(last(calls, input, "background")).toBe(TOKENS.ground);
  expect(last(calls, input, "border")).toBe(value(RULES.input, "border"));
  input.remove();
});

test("focus: brass outline and edge while focused, gone on blur", () => {
  const input = bevelInput();
  document.body.append(input);

  const focused = capture(() => input.dispatchEvent(new FocusEvent("focus")));
  expect(last(focused, input, "outline")).toBe(value(RULES.inputFocus, "outline"));
  expect(last(focused, input, "border-color")).toBe(TOKENS.brass);

  const blurred = capture(() => input.dispatchEvent(new FocusEvent("blur")));
  expect(last(blurred, input, "outline")).toBe("none");
  expect(blurred.some((c) => c.style === input.style && c.name === "border-color")).toBe(false);
  input.remove();
});

test("hover: the edge darkens to faint and returns", () => {
  const input = bevelInput();
  const over = capture(() => input.dispatchEvent(new MouseEvent("pointerenter")));
  expect(last(over, input, "border-color")).toBe(TOKENS.faint);
  const out = capture(() => input.dispatchEvent(new MouseEvent("pointerleave")));
  expect(out.some((c) => c.style === input.style && c.name === "border-color")).toBe(false);
});

test("textarea: a height the person dragged to survives a repaint", () => {
  const area = bevelInput("textarea", { rules: ["min-height:3.2em", "resize:vertical"] });
  expect(area.tagName).toBe("TEXTAREA");
  expect(area.style.getPropertyValue("resize")).toBe("vertical");
  area.style.height = "140px";
  area.dispatchEvent(new FocusEvent("focus"));
  expect(area.style.getPropertyValue("height")).toBe("140px");
  expect(area.style.getPropertyPriority("height")).toBe("important");
});

test("paintInput: an input a dialog already wrote keeps its value and attributes", () => {
  const host = document.createElement("div");
  host.innerHTML = '<input type="text" value="kept" required>';
  const input = paintInput(host.firstChild);
  expect(input.value).toBe("kept");
  expect(input.required).toBe(true);
  expect(input.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(input.style.getPropertyPriority("all")).toBe("important");
});
