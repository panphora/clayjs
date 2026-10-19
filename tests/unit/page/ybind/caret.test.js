import { createStore } from "../../../../src/live/store.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";
import { startLab } from "../../../fixtures/ypage-lab/lab.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";

const open = (text) => {
  const store = createStore({ name: "page", value: seedValue([{ id: "lab1", text }]) });
  const root = document.body.appendChild(document.createElement("div"));
  return startLab({ root, store, interval: 1000000 });
};

test("typing in the middle of a paragraph keeps the caret after each typed character", () => {
  const lab = open("ABCABC");
  const v = lab.view;
  v.dispatch(v.state.tr.setSelection(pmState.TextSelection.create(v.state.doc, 4)));
  for (const ch of "123") v.dispatch(v.state.tr.insertText(ch));
  expect(v.state.doc.textContent).toBe("ABC123ABC");
  expect(v.state.selection.from).toBe(7);
  lab.destroy();
});
