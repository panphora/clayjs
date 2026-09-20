import { jest } from '@jest/globals';
import { SyncStream } from '../../src/sync/stream.js';

let workers, sources, streams;
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
  Object.defineProperty(document, 'hidden', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
};
const make = (shared = true) => {
  const stream = new SyncStream('http://localhost/_/sync?document-url=test&resume-id=existing', {
    shared, documentURL: 'http://localhost/file.htmlclay', lane: 'live',
  });
  streams.push(stream);
  return stream;
};

beforeEach(() => {
  jest.useFakeTimers();
  workers = []; sources = []; streams = [];
  global.SharedWorker = Worker;
  global.EventSource = Source;
  hidden(false);
});
afterEach(() => {
  streams.forEach(stream => stream.close());
  delete global.SharedWorker;
  delete global.EventSource;
  delete document.hidden;
  jest.useRealTimers();
});

test('eight clients address one same-origin named worker without opening direct streams', () => {
  for (let i = 0; i < 8; i++) make();
  expect(workers).toHaveLength(8);
  expect(new Set(workers.map(worker => `${worker.url} ${worker.name}`))).toEqual(new Set(['http://localhost/_/sync/worker.js clay-sync']));
  expect(sources).toHaveLength(0);
  expect(workers[0].sent).toContainEqual({ v: 1, type: 'subscribe', document: 'http://localhost/file.htmlclay', lane: 'live', since: 0 });
  streams.forEach(stream => stream.close());
  expect(workers.every(worker => worker.port.close.mock.calls.length === 1)).toBe(true);
  expect(workers.every(worker => worker.sent.at(-1).type === 'unsubscribe')).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('forwards frames and repair cursors, while shared reconnect stays shared', () => {
  const stream = make();
  stream.onopen = jest.fn(); stream.onmessage = jest.fn(); stream.onerror = jest.fn();
  const cursor = jest.fn();
  stream.addEventListener('cursor', cursor);
  workers[0].send({ type: 'status', state: 'open' });
  workers[0].send({ type: 'cursor', seq: 30, resync: true });
  workers[0].send({ type: 'frame', data: '{"seq":31,"html":"new","sender":"peer"}' });
  expect(stream.readyState).toBe(1);
  expect(stream.onopen).toHaveBeenCalledTimes(1);
  expect(JSON.parse(cursor.mock.calls[0][0].data).resync).toBe(true);
  expect(JSON.parse(stream.onmessage.mock.calls[0][0].data).html).toBe('new');
  workers[0].send({ type: 'status', state: 'connecting' });
  jest.advanceTimersByTime(5000);
  expect(stream.onerror).toHaveBeenCalledTimes(1);
  expect(stream.readyState).toBe(0);
  expect(sources).toHaveLength(0);
});

test('a refused subscription closes and never bypasses the refusal with a direct stream', () => {
  const stream = make();
  stream.onerror = jest.fn();
  workers[0].send({ type: 'gone' });
  expect(stream.readyState).toBe(2);
  expect(stream.onerror).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(10000);
  expect(sources).toHaveLength(0);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['absent', 'throws', 'load error', 'startup timeout'])('worker %s preserves the direct transport', failure => {
  if (failure === 'absent') delete global.SharedWorker;
  if (failure === 'throws') global.SharedWorker = class { constructor() { throw new Error('unsupported'); } };
  const stream = make();
  if (failure === 'load error') workers[0].onerror();
  if (failure === 'startup timeout') jest.advanceTimersByTime(5000);
  expect(sources).toHaveLength(1);
  expect(sources[0].url).toBe(stream.url);
  const presence = jest.fn();
  stream.addEventListener('presence', presence);
  sources[0].dispatchEvent(new MessageEvent('presence', { data: '{"people":[]}' }));
  expect(presence).toHaveBeenCalledTimes(1);
});

test('hidden tabs release their port, resume their cursor and request a document repair', () => {
  const stream = make();
  const cursors = [];
  stream.addEventListener('cursor', event => cursors.push(JSON.parse(event.data)));
  workers[0].send({ type: 'cursor', seq: 40, resync: false });
  workers[0].send({ type: 'frame', data: '{"seq":42,"html":"new"}' });
  hidden(true);
  expect(workers[0].sent.at(-1).type).toBe('hidden');
  jest.advanceTimersByTime(5000);
  expect(workers[0].port.close).toHaveBeenCalledTimes(1);
  hidden(false);
  expect(workers).toHaveLength(2);
  expect(workers[1].sent.at(-1).since).toBe(42);
  workers[1].send({ type: 'cursor', seq: 45, resync: false });
  expect(cursors.at(-1)).toMatchObject({ seq: 45, resync: true });
});

test('direct fallback releases hidden connections and repairs after bfcache restoration', () => {
  const stream = make(false);
  const repair = jest.fn();
  stream.addEventListener('cursor', repair);
  hidden(true);
  jest.advanceTimersByTime(5000);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  hidden(false);
  expect(sources).toHaveLength(2);
  sources[1].onopen();
  expect(JSON.parse(repair.mock.calls[0][0].data)).toEqual({ resync: true });
  window.dispatchEvent(new Event('pagehide'));
  expect(sources[1].close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('pageshow'));
  expect(sources).toHaveLength(3);
  stream.close();
  window.dispatchEvent(new Event('pageshow'));
  expect(sources).toHaveLength(3);
});

test('an unresponsive worker port is replaced with a repair, not a direct stream', () => {
  make();
  workers[0].send({ type: 'status', state: 'open' });
  workers[0].send({ type: 'cursor', seq: 0, resync: false });
  jest.advanceTimersByTime(60000);
  expect(workers).toHaveLength(2);
  expect(workers[0].port.close).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
});

test('a responsive worker stays shared while the host reconnects without a cursor', () => {
  make();
  workers[0].send({ type: 'status', state: 'connecting' });
  for (let i = 0; i < 4; i++) {
    jest.advanceTimersByTime(15000);
    workers[0].send({ type: 'pong' });
  }
  expect(workers).toHaveLength(1);
  expect(sources).toHaveLength(0);
});

test('a brief hide and show resumes the same shared subscription', () => {
  make();
  workers[0].send({ type: 'cursor', seq: 40, resync: false });
  hidden(true);
  jest.advanceTimersByTime(300);
  hidden(false);
  expect(workers).toHaveLength(1);
  expect(workers[0].sent.at(-1)).toEqual({ v: 1, type: 'visible' });
  expect(workers[0].port.close).not.toHaveBeenCalled();
  jest.advanceTimersByTime(5000);
  expect(workers[0].port.close).not.toHaveBeenCalled();
});

test.each([false, true])('restoring a page cancels its earlier hidden timer (shared=%s)', shared => {
  make(shared);
  if (shared) workers[0].send({ type: 'cursor', seq: 40, resync: false });
  hidden(true);
  jest.advanceTimersByTime(1000);
  window.dispatchEvent(new Event('pagehide'));
  jest.advanceTimersByTime(1000);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  window.dispatchEvent(new Event('pageshow'));
  if (shared) workers[1].send({ type: 'cursor', seq: 40, resync: false });
  jest.advanceTimersByTime(3000);
  const close = shared ? workers[1].port.close : sources[1].close;
  expect(close).not.toHaveBeenCalled();
});
