import { parseBy, formatBy, contains, frameSet, descendants, saveReceipt, receiptHas, postReceipt, replaceReceipt } from '../../src/live/provenance.js';

test('exact singleton frames and legacy watermarks are unambiguous', () => {
  const exact = parseBy('v2|a:5||save:1');
  expect(contains(frameSet(exact), 'a', 4)).toBe(false);
  expect(contains(frameSet(exact), 'a', 5)).toBe(true);
  expect(contains(frameSet(parseBy('a:5')), 'a', 4)).toBe(true);
  expect(formatBy(exact)).toBe('v2|a:5||save:1');
  expect(descendants(exact)).toEqual([['save', [[1, 1]]]]);
});

test('canonical sets merge adjacent ranges without expanding them', () => {
  const by = parseBy('v2|x:2;a:9,4-6,7-8||save:1');
  expect(formatBy(by)).toBe('v2|a:4-9;x:2||save:1');
  expect(parseBy('v2|a:1-9007199254740991||save:1')).not.toBeNull();
});

test.each(['v2|a:0||s:1', 'v2|a:5-2||s:1', 'v2|a:9007199254740992||s:1', 'v2|a:1|s:1|s:1', 'v2|a:1||s:0', 'a:9007199254740992'])('reject malformed provenance: %s', (text) => {
  expect(parseBy(text)).toBeNull();
});

test('the cap includes frame ranges, ancestry ranges and the capture identity', () => {
  const ranges = (n) => Array.from({ length: n }, (_, i) => 2 * i + 1).join(',');
  expect(parseBy(`v2|a:${ranges(255)}||s:1`)).not.toBeNull();
  expect(parseBy(`v2|a:${ranges(256)}||s:1`)).toBeNull();
});

test('a save receipt for 5 does not suppress 4, and a POST preserves future save receipts', () => {
  const room = { lastN: new Map() };
  saveReceipt(room, 's\na', [[5, 5]], 8, 4096);
  const last = room.lastN.get('s\na');
  expect(last.n).toBe(0);
  expect(receiptHas(last, 5)).toBe(true);
  expect(receiptHas(last, 4)).toBe(false);
  expect(receiptHas(postReceipt(last, 4, 9), 5)).toBe(true);
});

test('receipt exhaustion advances a generation barrier and keeps admission open', () => {
  const room = { lastN: new Map([['s\na', { n: 1, seq: 1 }]]) };
  saveReceipt(room, 's\nb', [[5, 5]], 2, 1);
  expect(room.lastN.size).toBe(1);
  expect(room.receiptGeneration).toBe(1);
  expect(room.receiptsBlocked).toBeUndefined();
  saveReceipt(room, 's\na', Array.from({ length: 257 }, (_, i) => [i * 2 + 3, i * 2 + 3]), 3, 1);
  expect(room.lastN.get('s\na').saved).toHaveLength(256);
  expect(room.receiptGeneration).toBe(3);
});

test('exact receipt ranges are charged and released with their record', () => {
  const room = { lastN: new Map() };
  saveReceipt(room, 's\na', [[5, 5]], 8, 4096);
  expect(room.receiptBytes).toBeGreaterThan(0);
  const before = room.receiptBytes;
  saveReceipt(room, 's\na', [[7, 7]], 9, 4096);
  expect(room.receiptBytes).toBeGreaterThan(before);
  replaceReceipt(room, 's\na', postReceipt(room.lastN.get('s\na'), 8, 10));
  expect(room.receiptBytes).toBe(0);
});
