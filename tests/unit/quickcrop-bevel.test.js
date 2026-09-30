import { jest } from "@jest/globals";
import { TOKENS } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

const vendor = jest.fn(async () => null);
jest.unstable_mockModule("../../src/vendor/quickcrop.vendor.js", () => ({ default: vendor, quickcrop: vendor }));

const { quickcrop, bevelCropAdapter } = await import("../../src/plugins/quickcrop.js");
const { default: themodal } = await import("../../src/ui/modal.js");

const file = new Blob(["x"], { type: "image/png" });

beforeEach(() => {
  vendor.mockClear();
  document.body.innerHTML = "";
});

test("framing: auto, an absent modal and a themodal-shaped object all get the Bevel frame", async () => {
  await quickcrop(file);
  await quickcrop(file, { modal: "auto" });
  await quickcrop(file, { modal: themodal });
  expect(vendor.mock.calls.map(([, opts]) => opts.modal)).toEqual([bevelCropAdapter, bevelCropAdapter, bevelCropAdapter]);
});

test("framing: 'builtin' and a caller's own adapter pass through, every other option untouched", async () => {
  const mine = { open: () => ({ close() {} }) };
  const cms = { aspect: 1, type: "image/webp", quality: 0.85, maxWidth: 2048, maxHeight: 2048, labels: { confirm: "Use" } };
  await quickcrop(file, { ...cms, modal: "builtin" });
  await quickcrop(file, { ...cms, modal: mine });
  await quickcrop(file, { ...cms, modal: themodal });
  const [a, b, c] = vendor.mock.calls.map(([f, opts]) => [f, opts]);
  expect(a).toEqual([file, { ...cms, modal: "builtin" }]);
  expect(b[1].modal).toBe(mine);
  expect(c[1]).toEqual({ ...cms, modal: bevelCropAdapter });
});

function openAdapter() {
  const stage = document.createElement("div");
  stage.className = "qc-stage";
  stage.setAttribute("style", "position: relative;");
  const calls = { confirm: 0, cancel: 0 };
  let host;
  const writes = capture(() => {
    host = bevelCropAdapter.open({
      content: stage,
      confirmLabel: "Crop",
      onConfirm: () => { calls.confirm++; },
      onCancel: () => { calls.cancel++; },
    });
  });
  const root = document.querySelector("[data-clay-modal]");
  return { stage, calls, host, root, writes };
}

test("frame: hostile-proof chrome, the stage appended as it came", () => {
  const { stage, root, writes, host } = openAdapter();
  expect(expectHostileProof(root, { skip: (el) => stage.contains(el) })).toBeGreaterThanOrEqual(8);
  expectCallsResolved(writes.filter((c) => c.style !== stage.style), root);
  expect(stage.getAttribute("class")).toBe("qc-stage");
  expect(stage.getAttribute("style")).toBe("position: relative;");
  expect(stage.hasAttribute("clay")).toBe(false);
  const panel = root.querySelector('[role="dialog"]');
  expect(last(writes, panel, "background")).toBe(TOKENS.surface);
  expect(panel.parentElement.style.zIndex).toBe("2147483001");
  host.close();
});

test("frame: confirm, close, Escape and the backdrop each report once", () => {
  let { calls, root, host } = openAdapter();
  const buttons = [...root.querySelectorAll("button")];
  const confirm = buttons.find((b) => b.textContent === "Crop");
  expect(document.activeElement).toBe(confirm);
  confirm.click();
  expect(calls).toEqual({ confirm: 1, cancel: 0 });
  host.close();
  expect(document.querySelector("[data-clay-modal]")).toBeNull();

  ({ calls, root, host } = openAdapter());
  root.querySelector('button[aria-label="Close modal"]').click();
  expect(calls).toEqual({ confirm: 0, cancel: 1 });
  host.close();

  ({ calls, root, host } = openAdapter());
  const below = jest.fn();
  document.addEventListener("keydown", below);
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(calls.cancel).toBe(1);
  expect(below).not.toHaveBeenCalled();
  host.close();
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(calls.cancel).toBe(1);
  document.removeEventListener("keydown", below);

  ({ calls, root, host } = openAdapter());
  const overlay = root.querySelector('[role="dialog"]').parentElement;
  root.querySelector('[role="dialog"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls.cancel).toBe(0);
  overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls.cancel).toBe(1);
  host.close();
});

test("fit: the stage fits the panel at phone and desktop widths", () => {
  const at = (w, h) => {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
    Object.defineProperty(document.documentElement, "clientWidth", { value: w, configurable: true });
    return bevelCropAdapter.fit();
  };
  expect(at(1440, 900)).toEqual({ width: 844 - 4 - 80, height: 680 });
  expect(at(375, 700)).toEqual({ width: 375 - 32 - 4 - 2 * 22.5, height: 480 });
});
