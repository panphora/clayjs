import { editor } from "./view-helpers.js";
import { addViewHook, viewHooks } from "../../../src/page/view-hooks.js";
import { state } from "../../../src/vendor/prosemirror.vendor.js";

const fresh = () => editor([
  ["check", "list_item", "task one", { kind: "check" }],
  ["plain", "paragraph", "x"],
]);
const boxes = (view) => view.dom.querySelectorAll(".page-check-controls").length;

test("a reconfigure keeps the feature view hooks and their widgets", () => {
  const view = fresh();
  const hooks = viewHooks.get(view).size;
  const counted = boxes(view);
  expect(hooks).toBeGreaterThan(0);
  expect(counted).toBe(1);
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, new state.Plugin({})] }));
  view.dispatch(view.state.tr.insertText("!", 3));
  expect(viewHooks.get(view)?.size).toBe(hooks);
  expect(boxes(view)).toBe(counted);
});

test("destroying the editor view tears the hooks down once", async () => {
  const view = fresh();
  let destroyed = 0;
  addViewHook(view, { destroy: () => { destroyed += 1; } });
  view.destroy();
  await Promise.resolve();
  expect(destroyed).toBe(1);
  expect(viewHooks.get(view).size).toBe(0);
});
