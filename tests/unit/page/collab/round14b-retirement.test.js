import { jest } from '@jest/globals';
import { createStore } from '../../../../src/live/store.js';
import { createFastLane } from '../../../../src/live/fast-lane.js';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup() {
  const store = createStore({ name: 's', value: { n: 0 } });
  let generation = 0, value = 0, seq = 0, handlers, busy = true;
  const posts = [], notices = [];
  const state = () => ({ epoch: 'e1', seq, provenanceVersion: 2, receiptGeneration: generation,
    stores: { s: { value: { n: value }, last: seq, landed: seq, seen: {} } }, moves: { s: [] } });
  const lane = createFastLane({ entries: new Map([['s', { store }]]), transport: {
    start(h) { handlers = h; return () => {}; },
    fetchState: async () => state(),
    send: async (_, frame) => {
      posts.push(frame);
      if (busy) return { status: 503, body: { code: 'busy' }, retryAfter: 600 };
      value += frame.ops.reduce((n, op) => n + op.n, 0);
      seq++;
      handlers.frame({ epoch: 'e1', seq, name: 's', from: 'a', ...frame });
      return { status: 200, body: { epoch: 'e1', seq } };
    },
  } });
  store.onLocal((ops) => lane.local('s', ops, store.mark));
  store.onDelivery((event) => { if (event.code === 'receipt-expired') notices.push(event); });
  lane.start();
  handlers.open({ clientId: 'a' });
  return { store, lane, posts, notices, retire() { generation++; value = 2; seq++; busy = false; handlers.state(state()); } };
}

test('a state after retirement drops old identities with a notice and allows fresh edits', async () => {
  const test = setup();
  await jest.advanceTimersByTimeAsync(10);
  test.store.handle.add('n', 1);
  await jest.advanceTimersByTimeAsync(50);
  test.store.handle.add('n', 1);
  test.lane.pendingFrames('s', { epoch: 'e1', seq: 0 }, { reserve: true });
  expect(test.store.value.n).toBe(2);
  test.retire();
  await jest.advanceTimersByTimeAsync(100);
  expect(test.store.value.n).toBe(2);
  expect(test.store.pending).toEqual([]);
  expect(test.notices).toHaveLength(2);
  expect(test.notices.every((notice) => notice.ops[0].op === 'add')).toBe(true);
  expect(test.posts).toHaveLength(1);
  test.store.handle.add('n', 1);
  await jest.advanceTimersByTimeAsync(100);
  expect(test.posts.at(-1).receiptGeneration).toBe(1);
  expect(test.store.value.n).toBe(3);
  expect(test.store.pending).toEqual([]);
  test.lane.stop();
});
