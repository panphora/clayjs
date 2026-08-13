/**
 * @jest-environment-options {"url": "https://editor.example.co.uk/"}
 */
import { jest } from "@jest/globals";
import debounce from "../../src/utils/debounce.js";
import throttle from "../../src/lib/throttle.js";
import All from "../../src/dom/all.js";
import getDataFromForm from "../../src/dom/form-data.js";
import cookie from "../../src/lib/cookie.js";
import { ask } from "../../src/ui/dialogs.js";
import { enableAdminResources, disableAdminResources } from "../../src/core/admin-resources.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// 1
test("debounce: a callback that throws synchronously rejects every queued caller", async () => {
  jest.useFakeTimers();
  const fn = debounce(() => { throw new Error("boom"); }, 100);

  const a = fn();
  const b = fn();
  const settled = Promise.all([
    expect(a).rejects.toThrow("boom"),
    expect(b).rejects.toThrow("boom"),
  ]);

  jest.advanceTimersByTime(100);
  await settled;
  jest.useRealTimers();
});

// 2
test("debounce: a callback returning a rejected promise rejects every queued caller", async () => {
  jest.useFakeTimers();
  const fn = debounce(() => Promise.reject(new Error("async boom")), 100);

  const a = fn();
  const b = fn();
  const settled = Promise.all([
    expect(a).rejects.toThrow("async boom"),
    expect(b).rejects.toThrow("async boom"),
  ]);

  jest.advanceTimersByTime(100);
  await settled;
  jest.useRealTimers();
});

// 3 — the save lane's shape: throttle(savePage, 1200) with the default leading edge,
// then callers piggybacking on the trailing edge.
test("throttle: a callback that throws synchronously rejects every caller on the trailing edge", async () => {
  jest.useFakeTimers();
  const fn = throttle(() => { throw new Error("boom"); }, 1200);

  const leading = fn();
  const a = fn();
  const b = fn();
  const settled = Promise.all([
    expect(leading).rejects.toThrow("boom"),
    expect(a).rejects.toThrow("boom"),
    expect(b).rejects.toThrow("boom"),
  ]);

  jest.advanceTimersByTime(1200);
  await settled;
  jest.useRealTimers();
});

// 3 (second half)
test("throttle: a callback returning a rejected promise rejects every caller on the trailing edge", async () => {
  jest.useFakeTimers();
  const fn = throttle(() => Promise.reject(new Error("async boom")), 1200);

  const leading = fn();
  const a = fn();
  const b = fn();
  const settled = Promise.all([
    expect(leading).rejects.toThrow("async boom"),
    expect(a).rejects.toThrow("async boom"),
    expect(b).rejects.toThrow("async boom"),
  ]);

  jest.advanceTimersByTime(1200);
  await settled;
  jest.useRealTimers();
});

// 4
test("debounce and throttle still resolve every queued caller, with timing unchanged", async () => {
  jest.useFakeTimers();

  const debounced = jest.fn(() => "ok");
  const d = debounce(debounced, 100);
  const d1 = d();
  const d2 = d();

  jest.advanceTimersByTime(99);
  expect(debounced).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(debounced).toHaveBeenCalledTimes(1);
  await expect(d1).resolves.toBe("ok");
  await expect(d2).resolves.toBe("ok");

  const throttled = jest.fn(() => "fine");
  const t = throttle(throttled, 1200);
  const leading = t();
  expect(throttled).toHaveBeenCalledTimes(1);

  const t1 = t();
  const t2 = t();
  jest.advanceTimersByTime(1199);
  expect(throttled).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  expect(throttled).toHaveBeenCalledTimes(2);

  await expect(leading).resolves.toBe("fine");
  await expect(t1).resolves.toBe("fine");
  await expect(t2).resolves.toBe("fine");

  jest.useRealTimers();
});

// 5
test("ask(): a default value cannot close the value attribute", async () => {
  ask("Name?", null, '" onfocus=x');

  const input = document.querySelector(".micromodal__input");
  expect(input).not.toBeNull();
  expect(input.hasAttribute("onfocus")).toBe(false);
  expect(input.getAttribute("value")).toBe('" onfocus=x');
  expect(document.querySelector(".micromodal-parent").innerHTML).toContain("&quot; onfocus=x");
});

// 6
test("admin resources round-trip their type, including its absence", () => {
  document.body.innerHTML = `
    <style editmode:resource>.a { color: red }</style>
    <style editmode:resource type="text/css">.b { color: blue }</style>
    <script editmode:resource></script>`;

  disableAdminResources();

  expect(document.querySelector("style:not([type])")).toBeNull();
  expect(document.querySelectorAll('[editmode\\:resource][type^="inert/"]').length).toBe(3);
  expect(document.querySelectorAll("style")[0].getAttribute("type")).toBe("inert/");
  expect(document.querySelectorAll("style")[1].getAttribute("type")).toBe("inert/text/css");
  expect(document.querySelector("script").getAttribute("type")).toBe("inert/");

  enableAdminResources();

  expect(document.querySelectorAll("style")[0].hasAttribute("type")).toBe(false);
  expect(document.querySelectorAll("style")[1].getAttribute("type")).toBe("text/css");
  expect(document.querySelector("script").hasAttribute("type")).toBe(false);
});

// 7
test("form-data: a cleared input reads as empty, not its authored value", () => {
  document.body.innerHTML = `<form><input name="title" value="Hello"></form>`;
  const form = document.querySelector("form");
  form.elements.title.value = "";

  expect(getDataFromForm(form).title).toBe("");
});

// 8
test("All(selector, document) searches the document instead of throwing", () => {
  document.body.innerHTML = `
    <ul>
      <li class="card">one</li>
      <li class="card">two</li>
    </ul>`;

  const cards = All(".card", document);
  expect(cards.length).toBe(2);
  expect(cards[0]).toBe(document.querySelector(".card"));
});

// 9
test("cookie.remove clears the real registrable domain, not a public suffix", () => {
  const writes = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: (value) => { writes.push(value); },
  });

  try {
    cookie.remove("isAdminOfCurrentResource");
  } finally {
    delete document.cookie;
  }

  const domains = new Set(
    writes
      .map(write => write.match(/domain=([^;]+)/))
      .filter(Boolean)
      .map(match => match[1])
  );

  expect(domains).toContain(".example.co.uk");
  expect(domains).toEqual(new Set([
    ".editor.example.co.uk",
    ".example.co.uk",
    ".co.uk",
    ".uk",
  ]));
  expect(writes.some(write => !write.includes("domain="))).toBe(true);
});
