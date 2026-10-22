/**
 * @jest-environment jsdom
 */
import { createStore } from "../../../../src/live/store.js";
import { createFastLane } from "../../../../src/live/fast-lane.js";
import { createRooms } from "../../../../src/server/rooms/live-data-rooms.js";
import { seedPageFromArticle } from "../../../../src/page/ybind/migrate.js";
import { createYProvider, docFromValue } from "../../../../src/page/ybind/provider.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { renderBlocks } from "../../../../src/page/projection.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";

// A page whose article has no blocks seeds with no Yjs client, so client ids alone cannot tell
// its lineage: a tab that typed offline while another typed into the room is still the same page.
test("a tab on an empty page that typed offline is not taken for another page", async () => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const html = (value) => { const p = renderBlocks(blocksFromYValue(value)); return `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script><article data-page="1" data-rev="${p.rev}">${p.html}</article>`; };
  const pause = (ms = 80) => new Promise((r) => setTimeout(r, ms));
  const article = document.createElement('article'); article.setAttribute('data-page', '1');
    const empty = seedPageFromArticle(article);
  const rooms = createRooms();
  const room = rooms.open('fixture', html(empty), { nodeId: 1 });
  const tabs = [];
  function tab(id) {
    const store = createStore({ name: 'page', value: clone(empty) });
    const ydoc = docFromValue(store.value, { strict: true });
    const stops = [];
    let laneRef;
    const provider = createYProvider({ store, ydoc, onStopped: (r) => { stops.push(r); if (r === 'lineage') laneRef.abandon('page'); } });
    let h;
    const lane = createFastLane({ entries: new Map([['page', { store }]]), transport: {
      start(x) { h = x; return () => {}; },
      async fetchState(cid, since) { return clone(rooms.state(room, cid, since)); },
      async send(cid, frame) { const r = rooms.apply(room, cid, frame); if (r.seq) for (const t of tabs) t.h().frame({ ...clone(r), from: cid, n: frame.n }); return { status: r.error ? 422 : 200, body: r }; },
    } });
    laneRef = lane;
    store.onLocal((ops) => lane.local('page', ops, store.mark));
    lane.start();
    const t = { id, store, ydoc, provider, lane, stops, h: () => h }; tabs.push(t); h.open({ clientId: id, lane: 'live' }); return t;
  }
  const A = tab('tab-a'); await pause();
  const B = tab('tab-b'); await pause();
  A.h().close(); tabs.splice(tabs.indexOf(A), 1);
  const pa = createPageDoc(A.ydoc);
  A.ydoc.transact(() => { pa.flow.insertEmbed(0, { b: 'pa' }, {}); pa.flow.insert(1, 'A typed while offline', {}); });
  const pd = createPageDoc(B.ydoc);
  B.ydoc.transact(() => { pd.flow.insertEmbed(0, { b: 'p1' }, {}); pd.flow.insert(1, 'hello from B', {}); });
  await pause(300);
  tabs.push(A); A.h().open({ clientId: 'tab-a', lane: 'live' }); await pause(300); A.provider.settle(); await pause(300);
  try {
    expect(A.stops).toEqual([]);
    expect(B.stops).toEqual([]);
    expect(A.ydoc.getText("flow").toString()).toBe(B.ydoc.getText("flow").toString());
    expect(A.ydoc.getText("flow").toString()).toMatch(/A typed while offline/);
  } finally {
    for (const t of tabs) { t.lane.stop(); t.provider.dispose(); t.ydoc.destroy(); }
  }
});
