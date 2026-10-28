import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as Y from '../../../../src/vendor/yjs.vendor.js';
import { createRooms } from '../../../../src/server/rooms/index.js';
import { createStore } from '../../../../src/live/store.js';
import { createFastLane } from '../../../../src/live/fast-lane.js';
import { createYProvider, yValueOf, docFromValue, entriesOf } from '../../../../src/page/ybind/provider.js';
import { captureYValue } from '../../../../src/page/ybind/parts.js';
import { seedValue } from '../../../../src/page/ybind/seed.js';
import { blocksFromYValue } from '../../../../src/page/ybind/decode.js';
import { captureCheckpoint, renderCheckpoint } from '../../../../src/server/checkpoint/index.js';
import { Sim } from '../collab/room-double.js';

const clone = value => JSON.parse(JSON.stringify(value));
const html = stores => '<!doctype html><html><body><article data-page data-rev="fixture"><p data-id="p">base</p></article>' + Object.entries(stores).map(([name,value]) => `<script type="application/json" merge="${name}" clay="live">${JSON.stringify(value)}</script>`).join('') + '</body></html>';
// A refused render says which step refused: the page value's decode, the stores the capture
// holds, or the render itself.
const explain = (rendered, room, captured) => {
  if (rendered.kind === 'ok') return 'ok';
  let decode = 'decodes';
  try { blocksFromYValue(room.stores.get('page').value); } catch (error) { decode = `${error?.constructor?.name}: ${error?.code ?? ''} ${error?.message}`; }
  const value = room.stores.get('page').value;
  return { rendered, decode, stores: captured.stores?.map((store) => store.name), keys: Object.keys(value?.y ?? {}).length, entries: entriesOf(value?.y ?? {}).length };
};
const text = value => { const doc = docFromValue(value); const s = doc.getText('flow').toString(); doc.destroy(); return s; };
function setup(values, { bodyCap = 5 * 1024 * 1024, echo = true } = {}) {
  const sim = new Sim();
  let epoch = 0;
  let rooms = createRooms({ now: sim.now, newEpoch: () => `e${++epoch}` });
  let room = rooms.open('fixture', html(values));
  const handlers = new Map();
  const tabs = [];
  const posts = [];
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  const make = (id, page = false, compact) => {
    const entries = new Map(Object.entries(values).map(([name,value]) => [name, { store: createStore({name,value}) }]));
    const deliveries = [];
    for (const entry of entries.values()) entry.store.onDelivery(ev => deliveries.push(ev));
    const store = entries.get('page')?.store;
    const ydoc = page ? docFromValue(store.value) : null;
    if (ydoc) ydoc.clientID = 100 + tabs.length;
    const provider = page ? createYProvider({store, ydoc, compact, setTimer: sim.setTimer, clearTimer: sim.clearTimer}) : null;
    const transport = {
      start(h) { handlers.set(id,h); return () => handlers.delete(id); },
      async fetchState() { return clone(rooms.state(room, id, null)); },
      async send(client, frame) {
        const bytes = Buffer.byteLength(JSON.stringify(frame));
        const result = bytes > bodyCap ? {error:'body-cap'} : rooms.apply(room, client, frame);
        posts.push({name: frame.name, time:sim.t, bytes, count:frame.ops.length, n:frame.n, first:frame.ops[0].path.at(-1), error:result.error, seq:result.seq});
        if (result.error) return {status: result.error === 'too-large' || result.error === 'body-cap' ? 413 : 409, body: result.error === 'body-cap' ? {} : {code:result.error}};
        if (result.busy) return {status:503, body:{code:'busy'}};
        if (result.stale) return {status:200, body:result};
        if (!result.duplicate && echo) {
          const event = clone({...result, from:client, n:frame.n});
          for (const h of handlers.values()) sim.after(1, () => h.frame(clone(event)));
        }
        return {status:200, body:{seq:result.seq, epoch:result.epoch, receiptGeneration:result.receiptGeneration}};
      }
    };
    const lane = createFastLane({transport, entries, now:sim.now, setTimer:sim.setTimer, clearTimer:sim.clearTimer});
    for (const [name,{store}] of entries) store.onLocal(ops => lane.local(name,ops,store.mark));
    lane.start(); handlers.get(id).open({clientId:id,lane:'live'});
    const tab = {id,entries,store,ydoc,provider,lane,deliveries}; tabs.push(tab); return tab;
  };
  return {
    sim, make, posts, tabs, handlers, warnings,
    get room(){ return room; },
    restart(saved) { rooms = createRooms({now:sim.now,newEpoch:()=>`e${++epoch}`}); room = rooms.open('fixture',html(saved)); for (const [id,h] of handlers) h.state(clone(rooms.state(room,id,null))); },
    stop() { for(const t of tabs){t.provider?.dispose();t.lane.stop();t.ydoc?.destroy();} console.warn=warn; }
  };
}

async function advance(h, t) {
  for (let i=0;i<20;i++) await Promise.resolve();
  await h.sim.run(t);
  for (let i=0;i<20;i++) await Promise.resolve();
  await h.sim.run(t);
}

// A page update larger than the room's store cap is refused. The tab must not offer it again on
// every refusal, and the parts of it the room took must go, so the room's page stays whole.
test('a page update the room refuses as too large is not offered again and leaves the room whole', async () => {
  const source = docFromValue(seedValue([{ id: 'p', text: 's' }])); source.clientID = 1; source.getText('flow').insert(1, 's'.repeat(2_999_999));
  const initial = yValueOf(source); source.destroy();
  const h = setup({ page: initial, other: { count: 0 } });
  try {
    const a = h.make('a', true), b = h.make('b', true);
    const notices = [];
    a.entries.get('page').store.onDelivery((ev) => notices.push(ev));
    await advance(h, 100);
    a.ydoc.getText('flow').insert(3_000_000, 'x'.repeat(300_000));
    await advance(h, 900);
    a.entries.get('other').store.handle.set(['count'], 1);
    await advance(h, 4000);
    const refused = h.posts.filter((p) => p.error === 'too-large').length;
    expect(refused).toBeGreaterThan(0);
    expect(refused).toBeLessThan(6);
    expect(a.provider.stats.offered).toBe(0);
    expect(a.provider.stopped).toBe('too-large');
    expect(a.store.pending).toHaveLength(0);
    const value = h.room.stores.get('page').value;
    expect(entriesOf(value.y)).toHaveLength(Object.keys(value.y).length);
    expect(b.ydoc.getText('flow').toString().length).toBe(3_000_000);
    expect(h.room.stores.get('other').value.count).toBe(1);
    const captured = captureCheckpoint(h.room, { nodeId: null, roomKey: 'fixture' });
    const rendered = renderCheckpoint(html({ page: initial, other: { count: 0 } }), captured, { createDocument: () => new JSDOM('').window.document });
    expect(explain(rendered, h.room, captured)).toBe('ok');
  } finally { h.stop(); }
}, 60000);

// An update made right after the refused one is queued before the refusal arrives and fits on
// its own, but builds on the refused one: it is taken back too, so the room stays whole.
test('an update queued behind a refused one is taken back with it', async () => {
  const source = docFromValue(seedValue([{ id: 'p', text: 's' }])); source.clientID = 1; source.getText('flow').insert(1, 's'.repeat(2_999_999));
  const initial = yValueOf(source); source.destroy();
  const h = setup({ page: initial });
  try {
    const a = h.make('a', true);
    await advance(h, 100);
    a.ydoc.getText('flow').insert(3_000_000, 'x'.repeat(300_000));
    a.ydoc.getText('flow').insert(a.ydoc.getText('flow').length, 'FOLLOWUP');
    await advance(h, 4000);
    expect(a.provider.stopped).toBe('too-large');
    expect(a.store.pending).toHaveLength(0);
    const value = h.room.stores.get('page').value;
    expect(Object.keys(value.y)).toEqual(Object.keys(initial.y));
    const captured = captureCheckpoint(h.room, { nodeId: null, roomKey: 'fixture' });
    const rendered = renderCheckpoint(html({ page: initial }), captured, { createDocument: () => new JSDOM('').window.document });
    expect(explain(rendered, h.room, captured)).toBe('ok');
    expect(a.ydoc.getText('flow').toString()).toMatch(/FOLLOWUP$/);
  } finally { h.stop(); }
}, 60000);
