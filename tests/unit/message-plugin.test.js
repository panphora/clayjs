import { jest } from "@jest/globals";

/**
 * The message plugin sends a visitor's form to /_/message with a one-time token
 * from /_/form-token, and never sends a form that is not a message form.
 */

let message;
let calls;
let tokenCount;
let messageResponse;

function respond(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

beforeAll(async () => {
  global.fetch = jest.fn((url, options = {}) => {
    calls.push({ url, options });
    if (url === "/_/form-token") return respond(200, { token: `t${++tokenCount}` });
    return messageResponse();
  });
  ({ message } = await import("../../src/plugins/message.js"));
});

beforeEach(() => {
  calls = [];
  tokenCount = 0;
  messageResponse = () => respond(200, { msg: "Sent!" });
  window.clay = { toast: jest.fn() };
  document.body.innerHTML = "";
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const messageCalls = () => calls.filter((c) => c.url === "/_/message");

function contactForm(attrs = 'message-form="Thanks!"') {
  document.body.innerHTML = `<form ${attrs}><input name="email"><textarea name="note">hi</textarea><button>Send</button></form>`;
  document.querySelector("input").value = "a@b.co";
  return document.querySelector("form");
}

test("a message form is posted as JSON with a token, the document URL and the signals", async () => {
  const form = contactForm();
  const sent = jest.fn();
  form.addEventListener("clay:message-sent", sent);
  form.requestSubmit();
  await flush(); await flush();

  const [post] = messageCalls();
  expect(post.options.method).toBe("POST");
  expect(post.options.credentials).toBe("omit");
  expect(post.options.headers["Document-URL"]).toBe(window.location.href);
  const body = JSON.parse(post.options.body);
  expect(body).toMatchObject({ email: "a@b.co", note: "hi", formToken: "t1" });
  expect(body.formSignals).toEqual({
    webdriver: false,
    trusted: { click: 0, keydown: 0, pointerdown: 0, touchstart: 0, input: 0, change: 0 },
  });
  expect(sent).toHaveBeenCalledTimes(1);
  expect(window.clay.toast).toHaveBeenCalledWith("Thanks!", "success");
  expect(form.querySelector("input").value).toBe("");
});

test("each token is used once", async () => {
  await message.send({ a: 1 });
  await message.send({ a: 2 });
  const tokens = messageCalls().map((c) => JSON.parse(c.options.body).formToken);
  expect(tokens).toEqual(["t1", "t2"]);
});

test("focusing a message form fetches the token before submit", async () => {
  const form = contactForm();
  form.querySelector("input").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await flush();
  expect(calls.map((c) => c.url)).toEqual(["/_/form-token"]);
  await message.send({});
  expect(calls.map((c) => c.url)).toEqual(["/_/form-token", "/_/message"]);
});

test("a form whose action is /_/message is taken over", async () => {
  contactForm('method="post" action="/_/message"').requestSubmit();
  await flush(); await flush();
  expect(messageCalls()).toHaveLength(1);
  expect(window.clay.toast).toHaveBeenCalledWith("Sent", "success");
});

test("other forms, and forms the page already handled, are left alone", async () => {
  const plain = contactForm('action="/elsewhere"');
  plain.addEventListener("submit", (e) => e.preventDefault());
  plain.requestSubmit();
  const handled = contactForm();
  handled.addEventListener("submit", (e) => e.preventDefault());
  handled.requestSubmit();
  await flush(); await flush();
  expect(calls).toEqual([]);
});

test("a refusal fires clay:message-failed with the host's error and keeps the fields", async () => {
  messageResponse = () => respond(400, { error: "This message couldn't be sent. Please try again." });
  const form = contactForm();
  const failed = jest.fn();
  form.addEventListener("clay:message-failed", failed);
  form.requestSubmit();
  await flush(); await flush();
  expect(failed.mock.calls[0][0].detail).toEqual({ ok: false, error: "This message couldn't be sent. Please try again." });
  expect(window.clay.toast).toHaveBeenCalledWith("This message couldn't be sent. Please try again.", "error");
  expect(form.querySelector("input").value).toBe("a@b.co");
});

test("a refused token is replaced once, silently", async () => {
  let refusals = 1;
  messageResponse = () => (refusals-- > 0
    ? respond(400, { msg: "This message couldn't be sent. Please try again.", code: "form-token" })
    : respond(200, { msg: "Sent!" }));
  await expect(message.send({ a: 1 })).resolves.toEqual({ ok: true, error: null });
  expect(messageCalls().map((c) => JSON.parse(c.options.body).formToken)).toEqual(["t1", "t2"]);

  refusals = 5;
  await expect(message.send({ a: 1 })).resolves.toMatchObject({ ok: false });
  expect(messageCalls()).toHaveLength(4);
});

test("cancelling the outcome event skips the toast", async () => {
  const form = contactForm();
  form.addEventListener("clay:message-sent", (e) => e.preventDefault());
  form.requestSubmit();
  await flush(); await flush();
  expect(window.clay.toast).not.toHaveBeenCalled();
});

test("send never rejects: a network failure resolves with an error", async () => {
  messageResponse = () => Promise.reject(new TypeError("offline"));
  await expect(message.send({})).resolves.toMatchObject({ ok: false });
});

test("a host answering with an HTML page at 200 is not a sent message", async () => {
  messageResponse = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("not json")) });
  await expect(message.send({ a: 1 })).resolves.toEqual({ ok: false, error: "This page can't send messages." });
});
