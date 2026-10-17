import { restoreControls } from "../../src/plugins/undo.js";

const body = (html) => {
  document.body.innerHTML = html;
  return document.body;
};

test("a persist checkbox with its checked attribute removed becomes unchecked", () => {
  body('<input id="c" type="checkbox" persist checked>');
  const el = document.getElementById("c");
  el.removeAttribute("checked");
  el.checked = true;
  expect(el.checked).toBe(true);
  restoreControls();
  expect(el.checked).toBe(false);
});

test("a persist text input whose value differs takes the value attribute", () => {
  body('<input id="t" type="text" persist value="attr">');
  const el = document.getElementById("t");
  el.value = "live";
  restoreControls();
  expect(el.value).toBe("attr");
});

test("a persist textarea takes data-value", () => {
  body('<textarea id="a" persist data-value="dv">text</textarea>');
  const el = document.getElementById("a");
  el.value = "live";
  restoreControls();
  expect(el.value).toBe("dv");
});

test("a persist select follows its options' selected attributes", () => {
  body('<select id="s" persist><option id="o1" selected>a</option><option id="o2">b</option></select>');
  const sel = document.getElementById("s");
  const [o1, o2] = sel.options;
  o2.selected = true;
  expect(o1.selected).toBe(false);
  restoreControls();
  expect(o1.selected).toBe(true);
  expect(o2.selected).toBe(false);
});

test("a focused persist text input is restored with its selection clamped", () => {
  body('<input id="f" type="text" persist value="before">');
  const el = document.getElementById("f");
  el.value = "after";
  el.focus();
  el.setSelectionRange(5, 5);
  restoreControls();
  expect(el.value).toBe("before");
  expect(el.selectionStart).toBe(Math.min(5, "before".length));
  expect(el.selectionEnd).toBe(Math.min(5, "before".length));
});

test("a focused persist text input past the new length is clamped to it", () => {
  body('<input id="g" type="text" persist value="before">');
  const el = document.getElementById("g");
  el.value = "a much longer live value";
  el.focus();
  el.setSelectionRange(12, 20);
  restoreControls();
  expect(el.value).toBe("before");
  expect(el.selectionStart).toBe("before".length);
  expect(el.selectionEnd).toBe("before".length);
});

test("a persist password input is left alone", () => {
  body('<input id="pw" type="password" persist value="before">');
  const el = document.getElementById("pw");
  el.value = "after";
  restoreControls();
  expect(el.value).toBe("after");
});

test("a persist checkbox in a region undo does not record keeps its live state", () => {
  body('<div clay="editor-ui"><input id="in" type="checkbox" persist></div><input id="out" type="checkbox" persist>');
  window.clay = { region: { resolveRegionPolicy: (el) => ({ undoable: !el.closest('[clay="editor-ui"]') }) } };
  const inside = document.getElementById("in");
  const outside = document.getElementById("out");
  inside.checked = true;
  outside.checked = true;
  restoreControls();
  expect(inside.checked).toBe(true);
  expect(outside.checked).toBe(false);
  window.clay = undefined;
});

test("a control without persist is left alone", () => {
  body('<input id="p" type="text" value="attr">');
  const el = document.getElementById("p");
  el.value = "live";
  restoreControls();
  expect(el.value).toBe("live");
});
