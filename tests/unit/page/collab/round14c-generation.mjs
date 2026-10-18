import assert from 'node:assert/strict';
const { createRooms } = await import(new URL('../../../../../hyperclay/server-lib/live-data-rooms.js', import.meta.url));
const { saveReceipt } = await import(new URL('../../../../../hyperclay/server-lib/live-provenance.js', import.meta.url));
const { createStore } = await import(new URL('../../../../src/live/store.js', import.meta.url));
const { createFastLane } = await import(new URL('../../../../src/live/fast-lane.js', import.meta.url));

const html = '<script type="application/json" merge="s" clay="live">{"n":0}</script>';
let epoch = 0;
const rooms = createRooms({ newEpoch: () => `e${++epoch}` });
let room = rooms.open('doc', html);
if (process.argv[2] !== 'zero') saveReceipt(room, 's\nold', [[1, 1]], 0, 1);
if (process.argv[2] !== 'zero') saveReceipt(room, 's\nnew', [[1, 1]], 0, 1);
assert.equal(room.receiptGeneration ?? 0, process.argv[2] === 'zero' ? 0 : 1);
const store = createStore({ name: 's', value: { n: 0 } });
const notices = [], posts = [];
let handlers, answer;
const state = () => structuredClone(rooms.state(room, 'a', null));
const resultOf = (frame) => {
  const body = rooms.apply(room, 'a', frame);
  return body.error ? { status: 409, body: { code: body.error } } : { status: 200, body };
};
const lane = createFastLane({ entries: new Map([['s', { store }]]), transport: {
  start(h) { handlers = h; return () => {}; },
  fetchState: async () => state(),
  send: async (_, frame) => {
    posts.push(structuredClone(frame));
    if (posts.length === 1) return new Promise((resolve) => { answer = () => resolve(resultOf(frame)); });
    return resultOf(frame);
  },
} });
store.onLocal((ops) => lane.local('s', ops, store.mark));
store.onDelivery((event) => { if (event.phase === 'refused') notices.push(event); });
lane.start();
handlers.open({ clientId: 'a' });
await new Promise((r) => setTimeout(r, 10));
store.handle.add('n', 7);
await new Promise((r) => setTimeout(r, 10));
assert.equal(posts.length, 1);
rooms.drop('doc');
room = rooms.open('doc', html);
handlers.state(state());
answer();
await new Promise((r) => setTimeout(r, 150));
console.log(JSON.stringify({ posts, value: store.value, room: room.stores.get('s').value, pending: store.pending, notices }));
lane.stop();
assert.equal(room.stores.get('s').value.n, 7);
