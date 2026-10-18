import { Sim, createRoom, LIMITS } from './room-double.js';
import { parseBy } from '../../../../src/live/provenance.js';
import { serializeLive, textHash } from '../../../../src/live/ops.js';

test('the room double retires saved receipts and advertises the new generation', async () => {
  const sim = new Sim();
  const room = createRoom(sim, { s: { n: 0 } });
  for (let i = 0; i < LIMITS.receipts; i++) {
    const value = { n: 0, i };
    room.fileWritten('s', value, { epoch: 'e1', seq: room.seq, hash: textHash(serializeLive(value)) }, parseBy(`v2|c${i}:2||save${i}:1`));
  }
  const transport = room.transport('fresh');
  transport.start({ open() {}, close() {}, frame() {}, state() {}, writer() {} });
  room.open('fresh');
  const post = async (id, generation, n = 1) => {
    const sender = room.transport(id);
    if (!room.clients.has(id)) {
      sender.start({ open() {}, close() {}, frame() {}, state() {}, writer() {} });
      room.open(id);
    }
    const promise = sender.send(id, { name: 's', n, epoch: 'e1', receiptGeneration: generation, ops: [{ op: 'add', path: ['n'], n: 1 }] });
    await sim.run(sim.t + 100);
    return promise;
  };
  expect((await post('fresh', 0)).status).toBe(200);
  expect(room.state('fresh').provenanceVersion).toBe(2);
  expect(room.state('fresh').receiptGeneration).toBe(1);
  expect((await post('c0', 0, 2)).body.code).toBe('receipt-expired');
  expect(room.stores.get('s').value.n).toBe(1);
  expect(room.lastN.size).toBe(LIMITS.receipts);
});
