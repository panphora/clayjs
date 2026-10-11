import { jest } from "@jest/globals";

/**
 * Which block this tab reports, when, and how often.
 *
 * The host runs its full state chain for every one of these requests and most
 * editing is solo, so the sender is gated twice over: it says nothing at all
 * until the roster shows someone else named, and it then reports at most four
 * times a second. The `you` flag is what makes "someone else" answerable: every
 * recipient is itself one of the named people, so this tab's own entry must not
 * count as company.
 *
 * The thing the host cannot recover from on its own is a path it holds for a
 * block nobody is in, so `null` goes out the moment the person leaves the block,
 * the moment the last other person leaves, and the moment the workspace
 * backgrounds the frame. A reconnect is the other direction: the host keeps the
 * path on the connection, so a fresh stream starts from nothing and the current
 * block is sent again.
 */

const ME = { id: "p_me", name: "Grace Hopper", canEdit: true, you: true };
const OTHER = { id: "p_ada", name: "Ada Lovelace", canEdit: true, you: false };
const COMPANY = { people: [ME, OTHER], anonymous: 0 };

let EditingSender;
const started = [];

beforeAll(async () => {
  ({ EditingSender } = await import("../../src/sync/editing-sender.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  started.splice(0).forEach((sender) => sender.stop());
  jest.useRealTimers();
});

function make(send = jest.fn(async () => true)) {
  const sender = new EditingSender({ send });
  sender.start();
  started.push(sender);
  return { sender, send };
}

// Blocks as the person meets them: editable elements that are body's children,
// so the block's index IS its path.
function blocks(count) {
  document.body.innerHTML = Array.from(
    { length: count },
    (_, i) => `<div id="b${i}" contenteditable="true">block ${i}</div>`
  ).join("");
  return [...document.body.children];
}

const background = () => document.dispatchEvent(new CustomEvent("clay:workspace-background"));
const foreground = () => document.dispatchEvent(new CustomEvent("clay:workspace-foreground"));
const typed = () => document.dispatchEvent(new Event("selectionchange"));

test("a person editing alone sends nothing, ever", async () => {
  const els = blocks(3);
  const { sender, send } = make();

  els[1].focus();
  typed();
  sender.roster({ people: [ME], anonymous: 2 });
  await jest.runAllTimersAsync();

  expect(send).not.toHaveBeenCalled();
});

test("once someone else is named, the block under the caret is sent once", async () => {
  const els = blocks(3);
  const { sender, send } = make();

  els[1].focus();
  sender.roster(COMPANY);
  await jest.runAllTimersAsync();

  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith("1");

  // Nothing moved, so nothing is sent again.
  typed();
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(1);
});

test("twenty blocks in one second send at most four times, ending on the last", async () => {
  const els = blocks(20);
  const send = jest.fn(async () => true);
  const { sender } = make(send);
  const sentAt = [];
  send.mockImplementation(async () => {
    sentAt.push(Date.now());
    return true;
  });

  sender.roster(COMPANY);
  for (const el of els) {
    el.focus();
    await jest.advanceTimersByTimeAsync(50);
  }
  await jest.advanceTimersByTimeAsync(300);

  expect(send.mock.calls.at(-1)).toEqual(["19"]);
  expect(sentAt.length).toBeGreaterThanOrEqual(4);
  for (const start of sentAt) {
    expect(sentAt.filter((at) => at >= start && at < start + 1000).length).toBeLessThanOrEqual(4);
  }
});

test("leaving the editable for the page body reports null", async () => {
  const els = blocks(2);
  const { sender, send } = make();

  els[0].focus();
  sender.roster(COMPANY);
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenLastCalledWith("0");

  els[0].blur();
  expect(document.activeElement).toBe(document.body);
  await jest.runAllTimersAsync();

  expect(send.mock.calls.at(-1)).toEqual([null]);
});

test("a backgrounded workspace reports null, holds it, and reports the block again on foreground", async () => {
  const els = blocks(3);
  const { sender, send } = make();

  els[0].focus();
  sender.roster(COMPANY);
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenLastCalledWith("0");

  background();
  await jest.runAllTimersAsync();
  expect(send.mock.calls.at(-1)).toEqual([null]);

  const before = send.mock.calls.length;
  els[2].focus();
  typed();
  await jest.runAllTimersAsync();
  expect(send.mock.calls.length).toBe(before);

  foreground();
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenLastCalledWith("2");
});

test("the last other person leaving reports null once", async () => {
  const els = blocks(2);
  const { sender, send } = make();

  els[0].focus();
  sender.roster(COMPANY);
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(1);

  sender.roster({ people: [ME], anonymous: 0 });
  await jest.runAllTimersAsync();
  expect(send.mock.calls.at(-1)).toEqual([null]);
  expect(send).toHaveBeenCalledTimes(2);

  sender.roster({ people: [ME], anonymous: 0 });
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(2);
});

test("a stream opening again resends the block the host no longer holds", async () => {
  const els = blocks(3);
  const { sender, send } = make();

  els[2].focus();
  sender.roster(COMPANY);
  await jest.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(1);

  sender.reconnected();
  await jest.runAllTimersAsync();

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.at(-1)).toEqual(["2"]);
});

test("a refused send is free to be sent again", async () => {
  const els = blocks(2);
  const { sender, send } = make(jest.fn(async () => false));

  els[1].focus();
  sender.roster(COMPANY);
  await jest.advanceTimersByTimeAsync(300);
  expect(send).toHaveBeenCalledTimes(1);

  typed();
  await jest.advanceTimersByTimeAsync(300);

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.at(-1)).toEqual(["1"]);
});

test("stop drops every listener and silences the sender", async () => {
  const els = blocks(2);
  const { sender, send } = make();
  const remove = jest.spyOn(document, "removeEventListener");

  els[0].focus();
  sender.roster(COMPANY);
  sender.stop();

  expect(remove.mock.calls.map(([type]) => type)).toEqual([
    "focusin",
    "focusout",
    "selectionchange",
    "clay:sync-applied",
    "clay:workspace-background",
    "clay:workspace-foreground",
  ]);

  await jest.runAllTimersAsync();
  expect(send).not.toHaveBeenCalled();

  els[1].focus();
  background();
  await jest.runAllTimersAsync();
  expect(send).not.toHaveBeenCalled();

  remove.mockRestore();
});

test("a roster with nobody else named in it counts as alone", async () => {
  const els = blocks(2);
  const { sender, send } = make();

  for (const frame of [
    { people: [{ id: "p_me", name: "Grace Hopper", you: true }] },
    { people: [null] },
    { people: [] },
    { people: "everyone" },
    null,
    "nobody",
    undefined,
  ]) {
    sender.roster(frame);
  }

  els[0].focus();
  typed();
  await jest.runAllTimersAsync();

  expect(send).not.toHaveBeenCalled();
});

test("a request still in flight blocks the next one, and the value wanted during it follows", async () => {
  const els = blocks(2);
  const pending = [];
  const send = jest.fn((value) => new Promise((resolve) => pending.push({ value, resolve })));
  const { sender } = make(send);

  els[0].focus();
  sender.roster(COMPANY);
  await jest.advanceTimersByTimeAsync(300);
  expect(send.mock.calls).toEqual([["0"]]);

  // The person leaves the block while the host is still answering the first
  // request. Nothing may overlap it, and the clear may not be lost.
  els[0].blur();
  await jest.advanceTimersByTimeAsync(1000);
  expect(send.mock.calls).toEqual([["0"]]);

  pending[0].resolve(true);
  await jest.advanceTimersByTimeAsync(1000);

  expect(send.mock.calls).toEqual([["0"], [null]]);
});

test("a failed clear is retried on its own after two seconds", async () => {
  const els = blocks(2);
  const send = jest
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)
    .mockResolvedValue(true);
  const { sender } = make(send);

  els[0].focus();
  sender.roster(COMPANY);
  await jest.advanceTimersByTimeAsync(300);
  expect(send.mock.calls).toEqual([["0"]]);

  els[0].blur();
  await jest.advanceTimersByTimeAsync(300);
  expect(send.mock.calls).toEqual([["0"], [null]]);

  // No caret event, no roster change, no reconnect: the retry is the only thing
  // that can put the clear through.
  await jest.advanceTimersByTimeAsync(2000);
  expect(send.mock.calls).toEqual([["0"], [null], [null]]);
});

test("stop() cancels a pending retry", async () => {
  const els = blocks(2);
  const send = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
  const { sender } = make(send);

  els[0].focus();
  sender.roster(COMPANY);
  await jest.advanceTimersByTimeAsync(300);

  els[0].blur();
  await jest.advanceTimersByTimeAsync(300);
  expect(send.mock.calls).toEqual([["0"], [null]]);

  sender.stop();
  await jest.advanceTimersByTimeAsync(10_000);

  expect(send.mock.calls).toEqual([["0"], [null]]);
});

test("a sync that shifts the block under the caret reports the new path", async () => {
  const els = blocks(2);
  const { sender, send } = make();

  els[0].focus();
  sender.roster(COMPANY);
  await jest.advanceTimersByTimeAsync(300);
  expect(send.mock.calls).toEqual([["0"]]);

  // A peer's frame lands above the caret: the block keeps focus and the caret
  // does not move, so no focus or selection event fires.
  const focused = document.activeElement;
  const added = document.createElement("p");
  added.textContent = "peer inserted a block";
  document.body.prepend(added);
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));
  await jest.advanceTimersByTimeAsync(1000);

  expect(document.activeElement).toBe(focused);
  expect(send.mock.calls).toEqual([["0"], ["1"]]);
});
