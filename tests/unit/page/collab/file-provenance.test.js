import { Sim, createRoom } from './room-double.js';
import { parseBy } from '../../../../src/live/provenance.js';
import { serializeLive, textHash } from '../../../../src/live/ops.js';

const stamp = (value, seq = 0) => ({ epoch: 'e1', seq, hash: textHash(serializeLive(value)) });
test('Sonnet 1: the double keeps an unconfirmed descendant leaf', () => {
  const room = createRoom(new Sim(), { s: { m: 0 } });
  room.fileWritten('s', { m: 1 }, stamp({ m: 1 }), parseBy('v2|||saveA:1'));
  room.fileWritten('s', { m: 5 }, stamp({ m: 5 }), parseBy('v2||saveA:1|saveA:2'));
  expect(room.stores.get('s').value).toEqual({ m: 5 });
});

test('the double replays an unrelated merge with an equal empty frame set', () => {
  const room = createRoom(new Sim(), { s: { left: 0, right: 0 } });
  const a = { left: 1, right: 0 }, b = { left: 0, right: 2 };
  room.fileWritten('s', a, stamp(a), parseBy('v2|||saveA:1'));
  room.fileWritten('s', b, stamp(b), parseBy('v2|||saveB:1'));
  expect(room.stores.get('s').value).toEqual({ left: 1, right: 2 });
});

test('the double rejects a listed late POST but accepts an unlisted earlier identity', async () => {
  const sim = new Sim();
  const room = createRoom(sim, { s: { n: 0 } });
  const transport = room.transport('a');
  transport.start({ open() {}, close() {}, frame() {}, state() {}, writer() {} });
  room.open('a');
  room.fileWritten('s', { n: 10 }, stamp({ n: 10 }), parseBy('v2|a:5||saveA:1'));
  const post = async (n, amount) => {
    const promise = transport.send('a', { name: 's', n, epoch: 'e1', ops: [{ op: 'add', path: ['n'], n: amount }] });
    await sim.run(sim.t + 100);
    return promise;
  };
  expect((await post(4, 1)).body.duplicate).toBeUndefined();
  expect((await post(5, 10)).body.duplicate).toBe(true);
  expect(room.stores.get('s').value).toEqual({ n: 11 });
});
