beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = `
    <ul sortable>
      <li class="item">A<span class="saved" style="color: red;"></span><div clay="editor-ui"><span class="fill" style="--w: 0%;"></span></div></li>
    </ul>`;
  const sortable = await import("../../src/plugins/sortable.js");
  await sortable.ready;
}, 15000);

test("a press restores saved styles but leaves editor-ui furniture alone", async () => {
  const item = document.querySelector("ul[sortable] > li");
  const saved = item.querySelector(".saved");
  const fill = item.querySelector(".fill");
  item.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  saved.setAttribute("style", "color: blue;");
  fill.setAttribute("style", "--w: 25%;");
  document.dispatchEvent(new Event("pointerup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(saved.getAttribute("style")).toBe("color: red;");
  expect(fill.getAttribute("style")).toBe("--w: 25%;");
});
