import assert from 'node:assert/strict';
window.clayEditMode = true;
for (const k of ['Event', 'CustomEvent', 'EventTarget']) globalThis[k] = window[k];
const C = new URL('../../../../src/', import.meta.url).pathname;
const H = new URL('../../../../../hyperclay/server-lib/', import.meta.url).pathname;
const { createRooms, liveTags } = await import(`${H}live-data-rooms.js`);
const { serializeLive, stampOf } = await import(`${H}live-data-ops.js`);
const variant = process.argv[2] ?? 'uncertain';
const uncertain = variant.startsWith('uncertain');
const proved = variant === 'uncertain-proved';
const tag = (name, value) => `<script type="application/json" merge="${name}" clay="live">${serializeLive(value)}</script>`;
const pads = variant === 'omitted' ? Array.from({ length: 15 }, (_, i) => tag(`pad${i}`, { n: 0 })).join('') : '';
document.body.innerHTML = `<p id="text">initial text</p>${tag('s', { n: 0 })}${pads}${tag('h', { n: 0 })}`;
let savedHtml = document.documentElement.outerHTML;
const rooms = createRooms({ newEpoch: (() => { let n = 0; return () => `e${++n}`; })() });
let room = rooms.open('doc', savedHtml);
let busy = false, finishSave, firstBody, saveCalls = 0, posts = 0, getCalls = 0, abortSave;
let blockState = false;
const waitingState = [];
const state = (cid, since = null) => JSON.parse(JSON.stringify(rooms.state(room, cid, since)));
const ok = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ msg: 'Saved', msgType: 'success' }) });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === '/_/meta') return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ['live-data', 'live-provenance', ...(variant === 'uncertain-timeout' ? ['conditional'] : [])], ...(variant === 'uncertain-timeout' ? { document: { etag: saveCalls ? '"v1"' : '"v0"' } } : {}) }) };
  if (u.pathname === '/_/save') {
    saveCalls++;
    if (variant === 'uncertain-timeout' && saveCalls === 2) return { ok: false, status: 422, text: async () => JSON.stringify({ msg: 'Retry refused' }) };
    savedHtml = init.body;
    rooms.fileWritten('doc', savedHtml);
    if (saveCalls === 1) {
      firstBody = savedHtml;
      return new Promise((resolve, reject) => {
        if (variant === 'uncertain-timeout') {
          init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
          finishSave = () => abortSave();
        } else if (variant === 'uncertain-network') finishSave = () => reject(new TypeError('Network connection lost'));
        else finishSave = () => resolve(uncertain ? { ok: false, status: 502, text: async () => JSON.stringify({ msg: 'Lost save answer' }) } : ok());
      });
    }
    return ok();
  }
  if (u.pathname === '/_/sync/data') {
    const cid = u.searchParams.get('client-id');
    if ((init.method || 'GET') === 'GET') {
      getCalls++;
      const raw = u.searchParams.get('since');
      const since = raw ? { epoch: raw.slice(0, raw.lastIndexOf(':')), seq: Number(raw.slice(raw.lastIndexOf(':') + 1)) } : null;
      if (blockState) return new Promise(resolve => waitingState.push(() => resolve({ ok: true, status: 200, json: async () => state(cid, since) })));
      return { ok: true, status: 200, json: async () => state(cid, since) };
    }
    posts++;
    const frame = JSON.parse(init.body);
    if (busy && frame.name === 's') return { ok: false, status: 503, json: async () => ({ code: 'busy' }), headers: { get: () => '600' } };
    const result = rooms.apply(room, cid, frame);
    return { ok: !result.error, status: result.error ? 404 : 200, json: async () => result, headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => {
  if (variant === 'uncertain-timeout' && ms === 12000) abortSave = fn;
  if (ms === 10000) return realSetTimeout(fn, 50, ...args);
  if (ms === 45000) return realSetTimeout(fn, 400, ...args);
  return ms >= 5000 ? 0 : realSetTimeout(fn, ms, ...args);
};
const notices = [];
document.addEventListener('clay:live-notice', event => notices.push(event.detail));
const plugin = await import(`${C}plugins/live.js`);
const bridge = await import(`${C}live/stream-bridge.js`);
const { savePageForce, baselineSettled } = await import(`${C}core/save.js`);
const { isSaveInProgress } = await import(`${C}core/save-core.js`);
const { hasUnsavedChanges } = await import(`${C}core/unsaved-warning.js`);
const tick = async (ms = 10) => { for (let i = 0; i < 30; i++) await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, ms)); };
const s = plugin.live('s'), h = plugin.live('h');
await tick();
bridge.streamOpened({ clientId: 'c', lane: 'live' });
await tick(3100);
assert.equal(baselineSettled(), true, 'baseline settled before user edits');
if (variant === 'omitted') assert.equal(room.stores.has('h'), false);
const r = rooms.apply(room, 'peer', { name: 's', n: 1, ops: [{ op: 'add', path: ['n'], n: 1 }] });
bridge.streamEvent('data', { ...r, from: 'peer', n: 1 });
await tick();
busy = true;
s.add('n', 1);
await tick(60);
s.add('n', 1);
await tick();
assert.equal(s.status.mode, 'file');
assert.equal(s.toJSON().n, 3);
if (variant === 'uncertain-timeout') await (await import(`${C}core/etag.js`)).seedEtag({ fresh: true });
const saving = savePageForce();
await tick();
assert.equal(isSaveInProgress(), true);
assert.equal(saveCalls, 1);
if (uncertain) {
  if (!proved) {
    rooms.drop('doc');
    room = rooms.open('doc', savedHtml);
  }
  bridge.streamEvent('data-state', { ...state('c'), moves: {} });
} else {
  blockState = true;
  const peerDoc = new DOMParser().parseFromString(firstBody, 'text/html');
  const ps = peerDoc.querySelector('[merge="s"]');
  ps.removeAttribute('live-by');
  ps.setAttribute('live-at', stampOf(room.epoch, room.seq, ps.textContent));
  peerDoc.querySelector('[merge="h"]').textContent = '{"n":9}';
  savedHtml = peerDoc.documentElement.outerHTML;
  rooms.fileWritten('doc', savedHtml);
  plugin.receiveFrame(savedHtml);
}
await tick();
finishSave();
const firstResult = await saving;
busy = false;
if (variant === 'omitted') {
  blockState = false;
  for (const finish of waitingState.splice(0)) finish();
  await tick(30);
  const secondResult = await savePageForce();
  assert.equal(secondResult.ok, true);
  assert.equal(liveTags(savedHtml).find(t => t.name === 'h').text, '{"n":9}');
  assert.deepEqual(notices, []);
  assert.deepEqual(h.toJSON(), { n: 9 }, 'peer file-only store survives the barrier');
} else if (variant === 'hang') {
  assert.equal(firstResult.ok, true);
  assert.equal(plugin.storeOf('s').pending.length, 0);
  const before = posts;
  h.add('n', 7);
  bridge.streamEvent('data-state', { ...state('c'), moves: {} });
  await tick(100);
  const secondResult = await savePageForce();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  assert.equal(secondResult.ok, true);
  assert.deepEqual(h.toJSON(), { n: 16 });
  assert.equal(room.stores.get('h').value.n, 16);
  const reads = getCalls;
  await tick(900);
  assert.ok(getCalls > reads, 'the read that never answered is made again');
  blockState = false;
  for (const finish of waitingState.splice(0)) finish();
  await tick(900);
  assert.equal(plugin.fastLane().status.synced, true);
  h.add('n', 1);
  await tick(100);
  assert.equal(room.stores.get('h').value.n, 17);
  assert.deepEqual(s.toJSON(), { n: 3 });
  assert.deepEqual(notices, []);
  assert.equal(unload.defaultPrevented, false);
  assert.equal(document.documentElement.getAttribute('savestatus'), 'saved');
} else {
  await tick();
  const before = posts;
  s.add('n', 10);
  h.add('n', 7);
  if (variant !== 'uncertain-only') document.querySelector('#text').textContent = 'text typed after failure';
  await tick(80);
  const secondResult = await savePageForce();
  await tick(600);
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  window.dispatchEvent(new Event('pagehide'));
  await tick(80);
  assert.equal(firstResult.ok, false);
  assert.equal(secondResult.ok, true);
  assert.equal(saveCalls, variant === 'uncertain-timeout' ? 3 : 2);
  assert.equal(posts - before, 2, 'both later edits reach the room');
  assert.deepEqual(s.toJSON(), { n: 13 });
  assert.deepEqual(h.toJSON(), { n: 7 });
  assert.deepEqual([...room.stores].map(([name, v]) => [name, v.value]), [['s', { n: 13 }], ['h', { n: 7 }]]);
  assert.equal(savedHtml.includes('text typed after failure'), variant !== 'uncertain-only');
  assert.equal(unload.defaultPrevented, false);
  assert.equal(hasUnsavedChanges(), false);
  assert.equal(document.documentElement.getAttribute('savestatus'), 'saved');
  if (proved) assert.deepEqual(notices, []);
  else {
    assert.equal(notices.length, 1);
    assert.equal(notices[0].code, 'save-uncertain');
    assert.equal(notices[0].name, 's');
    assert.match(notices[0].message, /n \+ 1; n \+ 1/);
    assert.deepEqual(notices[0].ops, [{ op: 'add', path: ['n'], n: 1 }, { op: 'add', path: ['n'], n: 1 }]);
  }
}
plugin.fastLane().stop();
process.exit(0);
