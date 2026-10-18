import { Sim, createRoom, LIMITS } from './room-double.js';

test('Astra 6 / Sonnet 7: the double charges the serialized response, including punctuation', () => {
  const names = Array.from({ length: 16 }, (_, i) => `s${i}`);
  const room = createRoom(new Sim(), Object.fromEntries(names.map((name) => [name, {}])));
  let seq = 0;
  for (const store of room.stores.values()) {
    for (let n = 1; n <= 4096; n++) {
      const ops = [{ op: 'del', path: ['x'] }];
      store.log.push({ seq: ++seq, ops, bytes: JSON.stringify(ops).length, from: 'a', n });
    }
    store.last = seq;
  }
  room.seq = seq;
  expect(seq).toBe(16 * 4096);
  const state = room.state('a', 0);
  expect(Object.values(state.moves).filter(Array.isArray).length).toBeGreaterThan(0);
  expect(Object.values(state.moves).filter((x) => x === null).length).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(state.moves)).length).toBeLessThanOrEqual(LIMITS.movesBytes);
  expect(Object.values(room.state('a', seq).moves)).toEqual(names.map(() => []));
});
