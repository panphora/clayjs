import getDataFromForm from "../../src/dom/form-data.js";

test("reads text/checkbox/radio/select from a form into an object", () => {
  document.body.innerHTML = `
    <form>
      <input name="title" value="Hello">
      <input type="checkbox" name="tags" value="a" checked>
      <input type="checkbox" name="tags" value="b">
      <input type="radio" name="size" value="s">
      <input type="radio" name="size" value="m" checked>
    </form>`;
  const data = getDataFromForm(document.querySelector("form"));
  expect(data.title).toBe("Hello");
  expect(data.tags).toEqual(["a"]);
  expect(data.size).toBe("m");
});

test("skips unnamed and disabled fields", () => {
  document.body.innerHTML = `
    <form>
      <input value="no-name">
      <input name="off" value="x" disabled>
      <input name="on" value="y">
    </form>`;
  const data = getDataFromForm(document.querySelector("form"));
  expect(data).toEqual({ on: "y" });
});

test("works on a non-form container by querying [name] descendants", () => {
  document.body.innerHTML = `
    <div id="c">
      <input name="a" value="1">
      <input name="b" value="2">
    </div>`;
  const data = getDataFromForm(document.getElementById("c"));
  expect(data).toEqual({ a: "1", b: "2" });
});
