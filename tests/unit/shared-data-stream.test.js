import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { SyncStream } from '../../src/sync/stream.js';
import { streamOpened, streamClosed, currentStream, onStream } from '../../src/live/stream-bridge.js';

const transcript = JSON.parse(readFileSync(new URL('../fixtures/shared-data-stream.json', import.meta.url), 'utf8'));

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
  send(message) { this.port.onmessage?.({ data: { v: 2, ...message } }); }
}
class Source extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 0; this.close = jest.fn(); sources.push(this); }
}
const hidden = value => {
  Object.defineProperty(document, 'hidden', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
};
const make = (options = {}) => {
  const stream = new SyncStream('http://localhost/_/sync?client-id=editor_A&resume-id=resume_A', {
    shared: true, sharedData: true, documentURL: 'http://localhost/file.htmlclay',
    lane: 'live', clientId: 'editor_A', ...options,
  });
  streams.push(stream);
  return stream;
};
const hello = worker => worker.send({ type: 'hello', features: ['live-data', 'future'] });

beforeEach(() => {
  jest.useFakeTimers();
  workers = []; sources = []; streams = [];
  global.SharedWorker = Worker;
  global.EventSource = Source;
  hidden(false);
});
afterEach(() => {
  streams.forEach(stream => stream.close());
  streamClosed();
  delete global.SharedWorker;
  delete global.EventSource;
  delete document.hidden;
  jest.useRealTimers();
});

test('v2 uses its own worker and the live editor identity; saved viewers omit it', () => {
  make();
  make({ lane: 'saved' });
  expect(workers.map(({ url, name }) => [url, name])).toEqual([
    ['http://localhost/_/sync/data-worker.js', 'clay-sync-data'],
    ['http://localhost/_/sync/data-worker.js', 'clay-sync-data'],
  ]);
  expect(workers[0].sent[1]).toEqual({ v: 2, type: 'subscribe', document: 'http://localhost/file.htmlclay', lane: 'live', since: 0, clientId: 'editor_A' });
  expect(workers[1].sent[1]).toEqual({ v: 2, type: 'subscribe', document: 'http://localhost/file.htmlclay', lane: 'saved', since: 0 });
});

test('only a valid hello completes startup; readiness follows each open transition', () => {
  const stream = make();
  const opened = jest.fn(), errors = jest.fn();
  stream.addEventListener('open', opened);
  stream.addEventListener('error', errors);
  workers[0].send({ v: 1, type: 'status', state: 'open' });
  workers[0].send({ type: 'status', state: 'open' });
  workers[0].send({ type: 'pong' });
  expect(opened).not.toHaveBeenCalled();
  hello(workers[0]);
  workers[0].send({ type: 'pong' });
  expect(opened).not.toHaveBeenCalled();
  workers[0].send({ type: 'status', state: 'open' });
  hello(workers[0]);
  workers[0].send({ type: 'status', state: 'open' });
  expect(opened).toHaveBeenCalledTimes(1);
  workers[0].send({ type: 'status', state: 'connecting' });
  expect(errors).toHaveBeenCalledTimes(1);
  workers[0].send({ type: 'status', state: 'open' });
  expect(opened).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(5000);
  expect(sources).toHaveLength(0);
});

test('a greeted port stays shared while connecting if pongs keep it alive', () => {
  make();
  hello(workers[0]);
  workers[0].send({ type: 'status', state: 'connecting' });
  for (let i = 0; i < 5; i++) {
    jest.advanceTimersByTime(15000);
    workers[0].send({ type: 'pong' });
  }
  expect(workers).toHaveLength(1);
  expect(sources).toHaveLength(0);
});

test.each(['heartbeat', 'load error'])('%s closes the data bridge before its replacement opens', failure => {
  const stream = make();
  const closed = jest.fn(), opened = jest.fn();
  const off = onStream({ close: closed, open: opened });
  stream.addEventListener('open', () => streamOpened({ clientId: 'editor_A', lane: 'live' }));
  stream.addEventListener('error', streamClosed);
  try {
    hello(workers[0]);
    workers[0].send({ type: 'status', state: 'open' });
    expect(currentStream()).toEqual({ clientId: 'editor_A', lane: 'live' });
    if (failure === 'heartbeat') jest.advanceTimersByTime(60000);
    else workers[0].onerror();
    expect(stream.readyState).toBe(0);
    expect(currentStream()).toBeNull();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    if (failure === 'heartbeat') {
      hello(workers[1]);
      expect(currentStream()).toBeNull();
      workers[1].send({ type: 'status', state: 'open' });
    } else sources[0].onopen();
    expect(currentStream()).toEqual({ clientId: 'editor_A', lane: 'live' });
    expect(opened).toHaveBeenCalledTimes(2);
  } finally {
    off();
  }
});

test.each(transcript.ports)('replays the $role golden transcript and resumes its snapshot cursor', port => {
  const stream = make({ lane: port.subscribe.lane, clientId: port.subscribe.clientId, documentURL: port.subscribe.document });
  const received = [], frames = [], opened = jest.fn();
  for (const type of ['data', 'data-state', 'data-writer']) {
    stream.addEventListener(type, event => received.push({ event: type, data: JSON.parse(event.data) }));
  }
  stream.addEventListener('message', event => frames.push(event.data));
  stream.addEventListener('open', opened);
  expect(workers[0].sent[1]).toEqual(port.subscribe);
  for (const message of port.receive) workers[0].send(message);
  expect(received).toEqual(port.receive.filter(message => message.type === 'event').map(({ event, data }) => ({ event, data })));
  expect(frames).toEqual(port.receive.filter(message => message.type === 'frame').map(message => message.data));
  expect(opened).toHaveBeenCalledTimes(port.receive.filter(message => message.type === 'status' && message.state === 'open').length);
  jest.advanceTimersByTime(60000);
  expect(workers[1].sent[1]).toEqual(port.reconnectSubscribe);
});

test.each(['wrong feature', 'unsupported', 'timeout', 'load error', 'construction error', 'missing worker'])(
  '%s falls back once to the original direct URL', failure => {
    if (failure === 'construction error') global.SharedWorker = class { constructor() { throw new Error('load'); } };
    if (failure === 'missing worker') delete global.SharedWorker;
    const stream = make();
    if (failure === 'wrong feature') workers[0].send({ type: 'hello', features: ['snapshots'] });
    if (failure === 'unsupported') workers[0].send({ type: 'unsupported' });
    if (failure === 'timeout') {
      workers[0].send({ v: 1, type: 'pong' });
      workers[0].send({ type: 'status', state: 'open' });
      jest.advanceTimersByTime(5000);
    }
    if (failure === 'load error') workers[0].onerror();
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe(stream.url);
    expect(new URL(sources[0].url).searchParams.get('client-id')).toBe('editor_A');
    expect(new URL(sources[0].url).searchParams.get('resume-id')).toBe('resume_A');
    const event = jest.fn();
    stream.addEventListener('data', event);
    sources[0].dispatchEvent(new MessageEvent('data', { data: '{"seq":1}' }));
    expect(event).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10000);
    expect(sources).toHaveLength(1);
  }
);

test('named events preserve payloads and never advance snapshot since', () => {
  const stream = make();
  const received = [];
  for (const name of ['data', 'data-state', 'data-writer']) {
    stream.addEventListener(name, event => received.push([event.type, event.data]));
  }
  hello(workers[0]);
  workers[0].send({ type: 'cursor', seq: 12, resync: false });
  const payloads = [
    ['data', { seq: 900, op: { kind: 'set' } }],
    ['data-state', { seen: { editor_A: 7 }, saved: { editor_A: 5 }, pageTransition: 'stable' }],
    ['data-writer', { clientId: 'editor_A', conn: 'proof', writable: true }],
  ];
  for (const [event, data] of payloads) workers[0].send({ type: 'event', event, data });
  expect(received).toEqual(payloads.map(([name, data]) => [name, JSON.stringify(data)]));
  for (const message of [
    { type: 'event', event: 'unknown', data: {} },
    { type: 'event', event: 'data', data: null },
    { type: 'event', event: 'data', data: [] },
    { v: 1, type: 'event', event: 'data', data: {} },
    { type: 'event', event: 'data', data: { value: 1n } },
  ]) workers[0].send(message);
  expect(received).toHaveLength(3);
  workers[0].send({ type: 'status', state: 'open' });
  const queuedCallback = workers[0].port.onmessage;
  jest.advanceTimersByTime(60000);
  expect(workers).toHaveLength(2);
  expect(workers[1].sent[1].since).toBe(12);
  queuedCallback({ data: { v: 2, type: 'event', event: 'data', data: { seq: 901 } } });
  expect(received).toHaveLength(3);
  hello(workers[1]);
  workers[1].send({ type: 'event', event: 'data', data: { seq: 902 } });
  expect(received).toHaveLength(4);
});

test.each([false, true])('gone is terminal before or after hello (%s)', greeted => {
  const stream = make();
  const error = jest.fn();
  stream.addEventListener('error', error);
  if (greeted) hello(workers[0]);
  workers[0].send({ type: 'gone' });
  expect(stream.readyState).toBe(2);
  expect(error).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
  expect(workers[0].sent.at(-1)).toEqual({ v: 2, type: 'unsubscribe' });
  workers[0].send({ type: 'status', state: 'open' });
  jest.advanceTimersByTime(60000);
  expect(jest.getTimerCount()).toBe(0);
});

test('hidden live worker retains named events and pings, then exits and restores while hidden', () => {
  const stream = make({ keepAliveWhenHidden: true });
  const event = jest.fn(), error = jest.fn();
  stream.addEventListener('data', event);
  stream.addEventListener('error', error);
  hello(workers[0]);
  workers[0].send({ type: 'status', state: 'open' });
  hidden(true);
  for (let i = 0; i < 5; i++) {
    jest.advanceTimersByTime(15000);
    workers[0].send({ type: 'pong' });
  }
  workers[0].send({ type: 'event', event: 'data', data: { seq: 7 } });
  expect(event).toHaveBeenCalledTimes(1);
  expect(workers[0].port.close).not.toHaveBeenCalled();
  expect(workers[0].sent.some(message => message.type === 'ping')).toBe(true);
  hidden(false);
  expect(workers).toHaveLength(1);
  hidden(true);
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pagehide'));
  expect(error).toHaveBeenCalledTimes(1);
  expect(workers[0].port.close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('pageshow'));
  expect(workers).toHaveLength(2);
  workers[1].send({ type: 'status', state: 'open' });
  expect(stream.readyState).toBe(0);
  hello(workers[1]);
  workers[1].send({ type: 'status', state: 'open' });
  expect(stream.readyState).toBe(1);
  stream.close();
  window.dispatchEvent(new Event('pageshow'));
  expect(workers).toHaveLength(2);
});

test('hidden live direct fallback retains named events until pagehide', () => {
  const stream = make({ shared: false, keepAliveWhenHidden: true });
  const event = jest.fn(), error = jest.fn();
  stream.addEventListener('data-state', event);
  stream.addEventListener('error', error);
  hidden(true);
  jest.advanceTimersByTime(65000);
  expect(sources[0].close).not.toHaveBeenCalled();
  sources[0].dispatchEvent(new MessageEvent('data-state', { data: '{"seen":{"editor_A":7}}' }));
  expect(event).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('pagehide'));
  expect(error).toHaveBeenCalledTimes(1);
  expect(sources[0].close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('pageshow'));
  expect(sources).toHaveLength(2);
});
