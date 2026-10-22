import { createStore } from '../../../../src/live/store.js';
import { createFastLane } from '../../../../src/live/fast-lane.js';
import { createRooms } from '../../../../src/server/rooms/live-data-rooms.js';
import { buildPageValue, seedClientId } from '../../../../src/page/ybind/migrate.js';
import { createYProvider, docFromValue } from '../../../../src/page/ybind/provider.js';
import { blocksFromYValue } from '../../../../src/page/ybind/decode.js';
import { renderBlocks } from '../../../../src/page/projection.js';

import { createPageDoc } from '../../../../src/page/ybind/layout.js';
import { reduceRecovery } from '../../../../src/page/ybind/recovery.js';


const expect_eq = (a, b) => expect(a).toBe(b);
const expect_no = (a, re) => expect(a).not.toMatch(re);
const expect_match = (a, re) => expect(a).toMatch(re);

// A tab that comes back after its page was rebuilt from a replacement article must not offer its
// old history to the room: the replacement stays, and the tab keeps its edits to itself.
async function run(control, { compactOriginal = false, compactReplacement = false } = {}) {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const seed = (c) => { const blocks = { p: { t: 'paragraph', pos: '00000001', c } }; return buildPageValue([{ blocks }], seedClientId(blocks)); };
  const html = (value) => { const p = renderBlocks(blocksFromYValue(value)); return `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script><article data-page="1" data-rev="${p.rev}">${p.html}</article>`; };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
  // A page whose history was folded into one merged update: no `seed` key is left to compare.
  const folded = (value) => {
    const store = createStore({ name: 'page', value });
    const doc = docFromValue(value);
    const provider = createYProvider({ store, ydoc: doc, compact: { keys: 0 }, setTimer: () => 1, clearTimer: () => {} });
    store.onLocal(() => store.rebase(clone(store.value), { source: 'state', through: store.mark }));
    provider.compact();
    provider.compact();
    const result = clone(store.value);
    expect('seed' in result.y).toBe(false);
    provider.dispose(); doc.destroy();
    return result;
  };
  const original = compactOriginal ? folded(seed('OLDER ARTICLE')) : seed('OLDER ARTICLE');
  const replacement = control ? original : compactReplacement ? folded(seed('NEW ARTICLE 1')) : seed('NEW ARTICLE 1');
  const rooms = createRooms();
  let room = rooms.open('fixture', html(original), { nodeId: 1 });
  const store = createStore({ name: 'page', value: original });
  const ydoc = docFromValue(original, { strict: true });
  let lost = 0;
  let laneRef;
  const provider = createYProvider({ store, ydoc, onStopped: (reason) => { lost++; expect(reason).toBe('lineage'); laneRef.abandon('page'); } });
  const notices = [];
  const posted = [];
  let handlers;
  const lane = createFastLane({ entries: new Map([['page', { store }]]), transport: {
    start(h) { handlers = h; return () => {}; },
    async fetchState(id, since) { return clone(rooms.state(room, id, since)); },
    async send(id, frame) {
      const result = rooms.apply(room, id, frame);
      posted.push({ generation: frame.pageGeneration, result: clone(result) });
      if (result.seq) handlers.frame({ ...clone(result), from: id, n: frame.n });
      return { status: result.error ? 422 : 200, body: result };
    },
  } });

  laneRef = lane;
  store.onDelivery((status) => notices.push(status));
  store.onLocal((ops) => lane.local('page', ops, store.mark));
  lane.start();
  try {
    handlers.open({ clientId: 'offline-tab', lane: 'live' });
    await pause();
    const oldTransition = room.pageTransition.id;
    handlers.close();
    ydoc.getText('flow').insert(ydoc.getText('flow').length, ' UNSAVED');
    room = rooms.reset('fixture', html(replacement));
    const newTransition = room.pageTransition.id;
    handlers.open({ clientId: 'offline-tab', lane: 'live' });
    await pause();
    provider.settle();
    await pause();
    const savedValue = room.stores.get('page').value;
    const serverDoc = docFromValue(savedValue, { strict: true });
    const serverText = serverDoc.getText('flow').toString();
    const output = { oldTransition, newTransition, serverText, tabText: ydoc.getText('flow').toString(), projectedBlocks: blocksFromYValue(savedValue), serverRecovery: reduceRecovery(createPageDoc(serverDoc)).list.map((entry) => ({ blockId: entry.blockId, text: entry.blocks.flatMap((block) => block.runs.map((run) => run.text ?? '')).join('') })), tabRecoveryCount: reduceRecovery(createPageDoc(ydoc)).list.length, posted: posted.map(({generation, result}) => ({ generation, seq: result.seq, error: result.error })), notices };
    
    if (!control) { expect_eq(lost, 1); expect_eq(blocksFromYValue(savedValue).p.c, 'NEW ARTICLE 1'); expect_no(serverText, /OLDER|UNSAVED/); expect_match(ydoc.getText('flow').toString(), /UNSAVED/); }
    else { expect_eq(lost, 0); expect_eq(serverText, 'OLDER ARTICLE UNSAVED'); }
    serverDoc.destroy();
  } finally { lane.stop(); provider.dispose(); ydoc.destroy(); }
}

test('a tab returning to a page rebuilt from another article leaves the replacement alone', () => run(false));
test('a tab returning to the same page after a room restart heals', () => run(true));
test('the replacement is left alone when the tab\'s page had been compacted', () => run(false, { compactOriginal: true }));
test('the replacement is left alone when the replacement room had been compacted', () => run(false, { compactReplacement: true }));
test('a compacted page heals across a room restart', () => run(true, { compactOriginal: true }));
