import { createStore } from '../../src/live/store.js';
import { createFastLane } from '../../src/live/fast-lane.js';
import { parseBy } from '../../src/live/provenance.js';
import { Sim } from './page/collab/room-double.js';

async function setup(send) {
  const sim = new Sim();
  const store = createStore({ name: 's', value: { n: 0, flag: false } });
  let handlers;
  const lane = createFastLane({
    entries: new Map([['s', { store }]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer,
    transport: {
      start(h) { handlers = h; return () => {}; },
      fetchState: async () => ({ epoch: 'e1', seq: 0, stores: { s: { value: { n: 0, flag: false }, seen: { a: 0 } } } }),
      send,
    },
  });
  store.onLocal((ops) => lane.local('s', ops, store.mark));
  lane.start();
  handlers.open({ clientId: 'a' });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return { sim, store, lane, handlers };
}

test('Astra 3: bad-op frame 2 is absent, but busy frame 3 remains in exact provenance', async () => {
  const x = await setup(async (_id, f) => f.n === 1 ? { status: 200, body: { seq: 1, epoch: 'e1' } } : f.n === 2 ? { status: 422, body: { code: 'bad-op' } } : { status: 503, body: { code: 'busy' } });
  x.store.handle.add('n', 1);
  await x.sim.run(100);
  x.store.handle.set('bad', true);
  await x.sim.run(200);
  x.store.handle.set('flag', true);
  await x.sim.run(300);
  expect(x.store.handle.status.mode).toBe('file');
  expect(x.lane.pendingFrames('s', { epoch: 'e1' })).toEqual({ frames: [['a', [[1, 1], [3, 3]]]], complete: true });
  expect(x.store.value).toEqual({ n: 1, flag: true });
  x.lane.stop();
});

test('Sonnet 9: an unknown earlier frame does not prevent exact removal of a later landed frame', async () => {
  const x = await setup(async (_id, f) => ({ status: 200, body: { epoch: 'e1', ...(f.n === 2 && { seq: 2 }) } }));
  x.store.handle.add('n', 1);
  await x.sim.run(100);
  x.store.handle.set('flag', true);
  await x.sim.run(200);
  const dropIds = x.lane.captured('s', { epoch: 'e1', seq: 2 }, null);
  expect(dropIds).toEqual([2]);
  x.store.rebase({ n: 0, flag: true }, { dropIds });
  expect(x.store.value).toEqual({ n: 1, flag: true });
  expect(x.store.pendingEntries().map((e) => e.id)).toEqual([1]);
  x.lane.stop();
});

test('a capture can settle the exact frame still on the wire without consuming earlier pending ops', async () => {
  let resolve;
  const x = await setup((_id, f) => f.n === 1 ? Promise.resolve({ status: 200, body: { epoch: 'e1' } }) : new Promise((r) => { resolve = r; }));
  x.store.handle.add('n', 1);
  await x.sim.run(100);
  x.store.handle.set('flag', true);
  await x.sim.run(200);
  const dropIds = x.lane.captured('s', { epoch: 'e1', seq: 0 }, parseBy('v2|a:2||save:1'));
  expect(dropIds).toEqual([2]);
  x.store.rebase({ n: 0, flag: true }, { dropIds });
  resolve({ status: 200, body: { epoch: 'e1', seq: 3 } });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(x.store.pendingEntries().map((e) => e.id)).toEqual([1]);
  x.lane.stop();
});

test('partial frames are not claimed as whole frames', async () => {
  const x = await setup(async () => ({ status: 200, body: { epoch: 'e1' } }));
  x.store.handle.update((d) => { d.n = 1; d.flag = true; });
  await x.sim.run(100);
  x.store.rebase(x.store.authoritative, { dropIds: [1] });
  expect(x.lane.pendingFrames('s', { epoch: 'e1' })).toEqual({ frames: [], complete: false });
  x.lane.stop();
});

test('a state exact save receipt removes frame 2 without treating it as a watermark', async () => {
  const x = await setup(async () => ({ status: 200, body: { epoch: 'e1' } }));
  x.store.handle.add('n', 1);
  await x.sim.run(100);
  x.store.handle.set('flag', true);
  await x.sim.run(200);
  x.handlers.state({ epoch: 'e1', seq: 2, stores: { s: { value: { n: 0, flag: true }, seen: { a: 0 }, saved: [[2, 2]] } } });
  expect(x.store.value).toEqual({ n: 1, flag: true });
  expect(x.store.pendingEntries().map((e) => e.id)).toEqual([1]);
  x.lane.stop();
});
