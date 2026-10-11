import { jest } from "@jest/globals";

let workers, sources, streams, SyncStream;
class Worker {
  constructor(url, name) {
    this.url = url;
    this.name = name;
    this.sent = [];
    this.port = {
      start: jest.fn(), close: jest.fn(),
      postMessage: message => this.sent.push(message),
    };
    workers.push(this);
  }
  send(message) { this.port.onmessage?.({ data: { v: 1, ...message } }); }
}
class Source extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 0; this.close = jest.fn(); sources.push(this); }
}
const hidden = value => {
  Object.defineProperty(document, "hidden", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
};
const workspace = type => document.dispatchEvent(new CustomEvent(`clay:workspace-${type}`));
const make = (shared = true, options = {}) => {
  const stream = new SyncStream("http://localhost/_/sync?document-url=test&resume-id=existing", {
    shared, documentURL: "http://localhost/file.htmlclay", lane: "live", ...options,
  });
  streams.push(stream);
  return stream;
};

beforeEach(async () => {
  jest.useFakeTimers();
  workers = []; sources = []; streams = [];
  global.SharedWorker = Worker;
  global.EventSource = Source;
  hidden(false);
  jest.resetModules();
  ({ SyncStream } = await import("../../src/sync/stream.js"));
});
afterEach(() => {
  streams.forEach(stream => stream.close());
  workspace("foreground");
  delete window.__clayWorkspaceBackground;
  delete global.SharedWorker;
  delete global.EventSource;
  delete document.hidden;
  jest.useRealTimers();
});

test("a backgrounded workspace suspends the direct stream after the hidden delay and repairs on foreground", () => {
  const stream = make(false);
  const repair = jest.fn();
  stream.addEventListener("cursor", repair);
  workspace("background");
  jest.advanceTimersByTime(4999);
  expect(sources[0].close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  workspace("foreground");
  expect(sources).toHaveLength(2);
  sources[1].onopen();
  expect(JSON.parse(repair.mock.calls[0][0].data)).toEqual({ resync: true, startup: false });
});

test("a brief background and foreground keeps the same source", () => {
  make(false);
  workspace("background");
  jest.advanceTimersByTime(300);
  workspace("foreground");
  expect(sources).toHaveLength(1);
  expect(sources[0].close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(5000);
  expect(sources).toHaveLength(1);
  expect(sources[0].close).not.toHaveBeenCalled();
});

test("the shell tab becoming visible does not resume a backgrounded workspace", () => {
  make(false);
  workspace("background");
  hidden(true);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  hidden(false);
  expect(sources).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  expect(sources).toHaveLength(1);
});

test("foreground while the tab is hidden waits for the tab to become visible", () => {
  make(false);
  hidden(true);
  workspace("background");
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  workspace("foreground");
  expect(sources).toHaveLength(1);
  hidden(false);
  expect(sources).toHaveLength(2);
});

test("a stream constructed while the workspace is backgrounded suspends on the hidden delay", () => {
  workspace("background");
  make(false);
  expect(sources).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
});

const lateStream = async () => {
  jest.resetModules();
  const { SyncStream: LateSyncStream } = await import("../../src/sync/stream.js");
  const stream = new LateSyncStream("http://localhost/_/sync?document-url=test&resume-id=existing", {
    shared: false, documentURL: "http://localhost/file.htmlclay", lane: "live",
  });
  streams.push(stream);
  return stream;
};

test("a workspace backgrounded before the module loads still suspends the direct stream", async () => {
  window.__clayWorkspaceBackground = true;
  workspace("background");
  await lateStream();
  expect(sources).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
});

test("the same ordering without the recorded window flag leaves the stream open", async () => {
  delete window.__clayWorkspaceBackground;
  workspace("background");
  await lateStream();
  expect(sources).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).not.toHaveBeenCalled();
});

test("pageshow does not resume a backgrounded workspace", () => {
  make(false);
  workspace("background");
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("pageshow"));
  expect(sources).toHaveLength(1);
});

test("a closed stream drops its workspace listeners and reacts to neither transition", () => {
  const stream = make(false);
  const remove = jest.spyOn(document, "removeEventListener");
  stream.close();
  expect(remove).toHaveBeenCalledWith("clay:workspace-background", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("clay:workspace-foreground", expect.any(Function));
  expect(() => { workspace("background"); workspace("foreground"); }).not.toThrow();
  expect(sources).toHaveLength(1);
  jest.advanceTimersByTime(5000);
  expect(sources).toHaveLength(1);
  remove.mockRestore();
});

test("the shared path reports a backgrounded workspace as hidden", () => {
  make();
  workspace("background");
  expect(workers[0].sent.at(-1)).toEqual({ v: 1, type: "hidden" });
  jest.advanceTimersByTime(5000);
  expect(workers[0].port.close).toHaveBeenCalledTimes(1);
  make();
  expect(workers[1].sent[0]).toEqual({ v: 1, type: "hidden" });
});

test("a plain hidden tab still suspends on the hidden delay", () => {
  make(false);
  hidden(true);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
});
