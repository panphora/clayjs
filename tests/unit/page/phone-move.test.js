globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import { editor, posOf, select, shape } from "./view-helpers.js";
import { moveBlock } from "../../../src/page/blocks.js";

const chromeOf = (view) => view.pluginViews.find((p) => p.menuEl);
const SPEC = [["a", "paragraph", "Alpha"], ["b", "paragraph", "Bravo"], ["c", "paragraph", "Charlie"]];

test("phone More → Move down moves the highlighted block range like the keyboard", () => {
  const keyboard = editor(SPEC);
  select(keyboard, posOf(keyboard, "a") + 1, posOf(keyboard, "b") + 2);
  moveBlock(1)(keyboard.state, keyboard.dispatch);
  const phone = editor(SPEC);
  select(phone, posOf(phone, "a") + 1, posOf(phone, "b") + 2);
  phone.dom.parentElement.querySelector(".page-tool-more").click();
  const captured = chromeOf(phone).menu.ids;
  const down = [...chromeOf(phone).menuEl.querySelectorAll("button")].find((b) => b.textContent.includes("Move down"));
  down.click();
  expect(captured).toEqual(["a", "b"]);
  expect(shape(phone)).toBe(shape(keyboard));
  expect(shape(phone)).toBe("Charlie | Alpha | Bravo");
});
