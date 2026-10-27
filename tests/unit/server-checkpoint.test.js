/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import * as Y from '../../src/vendor/yjs.vendor.js';
import { createRooms, parseBy, serializeLive } from '../../src/server/rooms/index.js';
import { captureCheckpoint, isCheckpointCurrent, needsAdoption, renderCheckpoint } from '../../src/server/checkpoint/index.js';
import { buildServerCheckpoint } from '../../scripts/build-server-checkpoint.mjs';
import { buildServerRooms } from '../../scripts/build-server-rooms.mjs';
import { blocksFromYValue } from '../../src/page/ybind/decode.js';
import { boardKey } from '../../src/page/ybind/board.js';
import { createPageDoc } from '../../src/page/ybind/layout.js';
import { seedValue } from '../../src/page/ybind/seed.js';
import { classifyFile } from '../../src/page/adopt.js';
import { docFromValue, enc, yValueOf } from '../../src/page/ybind/provider.js';
import { chartModel, renderChartSvg } from '../../src/page/rich/chart.js';

const tag = (name, value, ephemeral = false) =>
  `<script type="application/json" clay="live${ephemeral ? ' ephemeral' : ''}" merge="${name}">${serializeLive(value)}</script>`;
const html = (value, other = '') =>
  `<!doctype html><html><head><title>Keep this title</title></head><body><article data-page data-rev="old">old article</article>${tag('page', value)}${tag('game', { score: 0 })}${tag('presence', { viewers: 1 }, true)}${other}<footer>Keep this footer</footer></body></html>`;
const createDocument = () => new JSDOM('').window.document;
const roomOf = (value) => {
  const rooms = createRooms({ newEpoch: () => 'checkpoint-test' });
  const source = html(value);
  const room = rooms.open('/test.html', source, { nodeId: 'node-1' });
  const capture = () => captureCheckpoint(room, { nodeId: 'node-1', roomKey: '/test.html' });
  const render = (text = source, pinned = capture()) => renderCheckpoint(text, pinned, { createDocument });
  return { rooms, room, source, capture, render };
};
const apply = (rooms, room, client, name, n, ops) => {
  const result = rooms.apply(room, client, { name, n, ops, epoch: room.epoch, pageGeneration: room.pageTransition?.id ?? null });
  expect(result.seq).toBeGreaterThan(0);
  return result;
};
const editPage = (rooms, room, client, n, change) => {
  const doc = docFromValue(room.stores.get('page').value, { strict: true });
  doc.clientID = Number(client);
  change(doc.getText('flow'));
  const update = enc(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  return apply(rooms, room, client, 'page', n, [{ op: 'set', path: ['y', `edit-${client}-${n}`], value: update }]);
};
const normalized = (text) => text.replace(/>\s+</g, '><').trim();

test('captures both editors, writes persistent tags and matching article, and survives a child-process read', () => {
  const fixture = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  const { rooms, room, source, capture, render } = fixture;
  editPage(rooms, room, '100', 1, (flow) => flow.delete(2, 1));
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  editPage(rooms, room, '200', 1, (flow) => flow.insert(2, 'X'));
  apply(rooms, room, '200', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  const pinned = capture();
  expect(pinned.seq).toBe(4);
  expect(pinned.stores.map((store) => store.name)).toEqual(['page', 'game']);
  expect(pinned.stores.every((store) => store.liveAt.startsWith('checkpoint-test:4:'))).toBe(true);
  for (const store of pinned.stores) {
    expect(parseBy(store.provenance).frames).toEqual([['100', [[1, 1]]], ['200', [[1, 1]]]]);
  }
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  // No root H1 behind it: the author's own title is kept, never replaced by Untitled.
  expect(result.html).toContain('<head><title>Keep this title</title></head>');
  expect(result.html).toContain('<footer>Keep this footer</footer>');
  expect(result.html).toContain(tag('presence', { viewers: 1 }, true));
  expect(normalized(result.html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1])).toBe('<p data-id="p">aXc</p>');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
  const custom = render(source.replace('<head>', '<head><meta name="clay-seo-title-mode" content="custom">'), pinned);
  expect(custom.kind).toBe('ok');
  expect(custom.html).toContain('<head><meta name="clay-seo-title-mode" content="custom"><title>Keep this title</title></head>');
  expect(isCheckpointCurrent(custom.html, pinned)).toBe(true);
  const folder = mkdtempSync(join(tmpdir(), 'clayjs-checkpoint-'));
  const file = join(folder, 'page.html');
  try {
    writeFileSync(file, result.html);
    const script = `
      const { readFileSync } = await import('node:fs');
      const { liveTags } = await import(${JSON.stringify(new URL('../../src/server/rooms/index.js', import.meta.url).href)});
      const { blocksFromYValue } = await import(${JSON.stringify(new URL('../../src/page/ybind/decode.js', import.meta.url).href)});
      if (typeof document !== 'undefined' || typeof window !== 'undefined') throw Error('DOM globals present');
      const html = readFileSync(process.argv[1], 'utf8');
      const tags = Object.fromEntries(liveTags(html).map((tag) => [tag.name, JSON.parse(tag.text)]));
      console.log(JSON.stringify({ text: blocksFromYValue(tags.page).p.c, score: tags.game.score, article: html.match(/<article[^>]*>([\\s\\S]*?)<\\/article>/)[1] }));
    `;
    const restarted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, file], { encoding: 'utf8' }));
    expect(restarted).toEqual({ text: 'aXc', score: 2, article: '<p data-id="p">aXc</p>' });
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('later frames remain dirty when the captured file is reconciled', () => {
  const { rooms, room, source, capture, render } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  editPage(rooms, room, '100', 1, (flow) => flow.delete(2, 1));
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  const pinned = capture();
  const written = render(source, pinned);
  expect(written.kind).toBe('ok');
  editPage(rooms, room, '200', 1, (flow) => flow.insert(2, 'X'));
  apply(rooms, room, '200', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  rooms.fileWritten(room.key, written.html);
  expect(blocksFromYValue(room.stores.get('page').value).p.c).toBe('aXc');
  expect(room.stores.get('game').value.score).toBe(2);
  expect(room.stores.get('page').landed).toBeLessThan(room.stores.get('page').last);
  expect(room.stores.get('game').landed).toBeLessThan(room.stores.get('game').last);
  expect(isCheckpointCurrent(written.html, capture())).toBe(false);
});

test('renders hand-written expected heading, marked paragraph, list and board HTML', () => {
  const value = seedValue([
    { id: 'h', t: 'heading', text: 'Title' },
    { id: 'p', t: 'paragraph', text: 'bold now' },
    { id: 'l', t: 'list_item', text: 'task' },
    { id: 'b', t: 'board' },
  ]);
  const doc = docFromValue(value, { strict: true });
  const pd = createPageDoc(doc);
  pd.flow.format(7, 4, { 'strong~test': true });
  pd.boardFields.set(boardKey('b', 'column', 'todo', 'name'), 'Todo');
  pd.boardFields.set(boardKey('b', 'column', 'todo', 'pos'), '1');
  pd.boardFields.set(boardKey('b', 'card', 'c', 'title'), 'Card');
  pd.boardFields.set(boardKey('b', 'card', 'c', 'placement'), { columnId: 'todo', pos: '1' });
  const rich = yValueOf(doc);
  doc.destroy();
  const fixture = roomOf(rich);
  const result = fixture.render();
  expect(result.kind).toBe('ok');
  const expected = `<h2 data-id="h">Title</h2>
<p data-id="p"><strong>bold</strong> now</p>
<ul><li data-id="l">task</li></ul>
<section data-id="b" data-type="board"><div data-col="todo"><h4>Todo</h4><ul><li data-id="c">Card</li></ul></div></section>`;
  expect(normalized(result.html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1])).toBe(normalized(expected));
  expect(result.html).toContain(`data-rev="${result.revision}"`);
});

test('refuses incomplete page parts until the missing frame arrives', () => {
  const { rooms, room, source, capture, render } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'text' }]));
  const doc = docFromValue(room.stores.get('page').value, { strict: true });
  doc.clientID = 300;
  doc.getText('flow').insert(2, '!');
  const update = enc(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  const middle = Math.ceil(update.length / 2);
  apply(rooms, room, '300', 'page', 1, [{ op: 'set', path: ['y', 'later.0.2'], value: update.slice(0, middle) }]);
  expect(render(source, capture())).toEqual({ kind: 'refused', reason: 'incomplete-page' });
  apply(rooms, room, '300', 'page', 2, [{ op: 'set', path: ['y', 'later.1.2'], value: update.slice(middle) }]);
  expect(render(source, capture()).kind).toBe('ok');
});

test('checkpoints unknown page content into its envelope and refuses table projection', () => {
  const unknown = seedValue([{ id: 'p', t: 'paragraph', text: 'text' }]);
  const doc = docFromValue(unknown, { strict: true });
  createPageDoc(doc).attrs.get('p').set('t', 'future_block');
  const bad = yValueOf(doc);
  doc.destroy();
  const kept = roomOf(bad).render();
  expect(kept.kind).toBe('ok');
  expect(kept.html).toContain('<div data-id="p" data-clay-page-opaque="1"');
  expect(kept.html).toContain('>text</div>');
  const table = seedValue([{ id: 't', t: 'table' }]);
  expect(roomOf(table).render()).toEqual({ kind: 'refused', reason: 'unsupported-projection' });
});

test('renders a table chart through the shared checkpoint projection', () => {
  const value = seedValue([
    { id: 'tbl', t: 'table', attrs: {
      cols: { c1: { pos: '1', name: 'Week' }, c2: { pos: '2', name: 'Count', kind: 'number' } },
      rows: { r1: { pos: '1', cells: { c1: 'First', c2: '2' } }, r2: { pos: '2', cells: { c1: 'Second', c2: '4' } } },
    } },
    { id: 'ch', t: 'chart', attrs: { source: 'tbl', x: 'c1', series: ['c2'], title: 'Counts' } },
  ]);
  const result = roomOf(value).render();
  expect(result.kind).toBe('ok');
  const model = chartModel({ id: 'ch', type: 'line', x: 'c1', series: ['c2'], title: 'Counts' }, {
    cols: [{ id: 'c1', name: 'Week' }, { id: 'c2', name: 'Count' }],
    rows: [{ id: 'r1', cells: { c1: 'First', c2: '2' } }, { id: 'r2', cells: { c1: 'Second', c2: '4' } }],
  });
  expect(result.html).toContain(renderChartSvg(model, { width: 640, height: 320 }));
  expect(result.html).toContain('<figcaption>Counts</figcaption>');
});

test('refuses a document missing its page article or a persistent tag', () => {
  const { source, capture, render } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'text' }]));
  expect(render(source.replace('article data-page', 'article'), capture()))
    .toEqual({ kind: 'refused', reason: 'invalid-document' });
  expect(render(source.replace('clay="live" merge="game"', 'clay="live ephemeral" merge="game"'), capture()))
    .toEqual({ kind: 'refused', reason: 'invalid-document' });
});

test('a later edit makes the previous file non-current', () => {
  const { rooms, room, source, capture, render } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  const first = capture();
  const result = render(source, first);
  expect(result.kind).toBe('ok');
  expect(isCheckpointCurrent(result.html, first)).toBe(true);
  const browserStamped = result.html.replace(/ live-at="[^"]*"/g, '').replace(/ live-by="[^"]*"/g, '');
  expect(isCheckpointCurrent(browserStamped, first)).toBe(true);
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  expect(isCheckpointCurrent(result.html, capture())).toBe(false);
});

test('a hand-edited article refuses a dirty checkpoint until adoption', () => {
  const { rooms, room, source, capture, render } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  const saved = render(source);
  expect(saved.kind).toBe('ok');
  const handEdited = saved.html.replace('<p data-id="p">abc</p>', '<p data-id="p">HAND EDIT</p>');
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  expect(isCheckpointCurrent(handEdited, capture())).toBe(false);
  expect(render(handEdited)).toEqual({ kind: 'refused', reason: 'needs-adoption' });
  const ordinary = render(saved.html);
  expect(ordinary.kind).toBe('ok');
  expect(ordinary.html).toContain('<p data-id="p">abc</p>');
  expect(ordinary.html).toContain('"score":1');
});

test('a room that already holds the hand edit checkpoints it', () => {
  const { rooms, room, source, capture } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  const saved = renderCheckpoint(source, capture(), { createDocument });
  expect(saved.kind).toBe('ok');
  const handEdited = saved.html.replace('<p data-id="p">abc</p>', '<p data-id="p">HAND EDIT</p>');
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  expect(renderCheckpoint(handEdited, capture(), { createDocument }))
    .toEqual({ kind: 'refused', reason: 'needs-adoption' });
  const second = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'HAND EDIT' }]));
  apply(second.rooms, second.room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  const result = renderCheckpoint(handEdited, second.capture(), { createDocument });
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<p data-id="p">HAND EDIT</p>');
  expect(result.html).toContain('"score":1');
});

test('needsAdoption tells a hand-edited page from an ordinary one', () => {
  const { rooms, room, source, capture } = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'abc' }]));
  const saved = renderCheckpoint(source, capture(), { createDocument });
  expect(saved.kind).toBe('ok');
  const handEdited = saved.html.replace('<p data-id="p">abc</p>', '<p data-id="p">HAND EDIT</p>');
  apply(rooms, room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  expect(needsAdoption(handEdited, { createDocument })).toBe(true);
  expect(needsAdoption(saved.html, { createDocument })).toBe(false);
  expect(needsAdoption('<!doctype html><p>x</p>', { createDocument })).toBe(false);
});

test('built CJS and ESM entries load in plain Node without DOM globals', async () => {
  await buildServerCheckpoint();
  const script = `
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    if (typeof window !== 'undefined' || typeof document !== 'undefined') throw Error('DOM globals present');
    const cjs = require('@panphora/clayjs/server/checkpoint');
    const esm = await import('@panphora/clayjs/server/checkpoint');
    console.log(JSON.stringify([Object.keys(cjs).sort(), ['captureCheckpoint', 'renderCheckpoint', 'isCheckpointCurrent', 'needsAdoption'].every((name) => typeof esm[name] === 'function')]));
  `;
  const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8' }));
  expect(loaded[0]).toEqual(['captureCheckpoint', 'isCheckpointCurrent', 'needsAdoption', 'renderCheckpoint']);
  expect(loaded[1]).toBe(true);
});

test('the built CJS and ESM entries derive and compare the same title the source does', async () => {
  await buildServerCheckpoint();
  const fixture = roomOf(seedValue([{ id: 'h', t: 'heading', text: 'Built & titled', attrs: { level: 1 } }]));
  const script = `
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { JSDOM } = require('jsdom');
    const createDocument = () => new JSDOM('').window.document;
    const render = (api, html, capture) => {
      const result = api.renderCheckpoint(html, capture, { createDocument });
      return [result.kind, result.html.match(/<title>([^<]*)<\\/title>/)[1], api.isCheckpointCurrent(result.html, capture)];
    };
    const cjs = require('@panphora/clayjs/server/checkpoint');
    const esm = await import('@panphora/clayjs/server/checkpoint');
    console.log(JSON.stringify([render(cjs, process.argv[1], JSON.parse(process.argv[2])), render(esm, process.argv[1], JSON.parse(process.argv[2]))]));
  `;
  const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, fixture.source, JSON.stringify(fixture.capture())], { encoding: 'utf8' }));
  expect(loaded).toEqual([['ok', 'Built &amp; titled', true], ['ok', 'Built &amp; titled', true]]);
});

test('the rooms and checkpoint entries share one Yjs, so loading both warns about nothing', async () => {
  await buildServerRooms();
  await buildServerCheckpoint();
  const script = `
    require('@panphora/clayjs/server/rooms');
    require('@panphora/clayjs/server/checkpoint');
    console.log(JSON.stringify(Object.keys(require.cache).filter((file) => file.includes('dist/server/')).map((file) => file.split('/').pop()).sort()));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: process.cwd(), encoding: 'utf8' });
  expect(run.status).toBe(0);
  expect(run.stderr).not.toMatch(/Yjs was already imported/);
  expect(JSON.parse(run.stdout)).toEqual(['checkpoint.cjs', 'core.cjs', 'rooms.cjs']);
});

test('a room whose writer merged an edit to the same words it changed checkpoints it once the frame says so', () => {
  const first = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'a b c d' }]));
  const saved = renderCheckpoint(first.source, first.capture(), { createDocument });
  expect(saved.kind).toBe('ok');
  const handEdited = saved.html.replace('<p data-id="p">a b c d</p>', '<p data-id="p">a b d</p>');
  expect(handEdited).not.toBe(saved.html);
  const fileDoc = createDocument();
  fileDoc.documentElement.innerHTML = handEdited.replace(/^<!doctype html>/i, '');
  const tags = [...fileDoc.querySelectorAll('script[merge="page"]')].map((tag) => JSON.parse(tag.textContent));
  const found = classifyFile(fileDoc.querySelector('article[data-page]'), tags);
  expect(found.kind).toBe('adopt');

  const r = roomOf(seedValue([{ id: 'p', t: 'paragraph', text: 'a q d' }]));
  apply(r.rooms, r.room, '100', 'game', 1, [{ op: 'add', path: ['score'], n: 1 }]);
  expect(renderCheckpoint(handEdited, r.capture(), { createDocument })).toEqual({ kind: 'refused', reason: 'needs-adoption' });
  const y = r.room.stores.get('page').value.y;
  const key = Object.keys(y)[0];
  const claim = (n, adopted) => r.rooms.apply(r.room, '100', { name: 'page', n, epoch: r.room.epoch, pageGeneration: r.room.pageTransition?.id ?? null, ops: [{ op: 'set', path: ['y', key], value: y[key] }], adopted });
  expect(claim(1, 'not-this-article').seq).toBeGreaterThan(0);
  expect(renderCheckpoint(handEdited, r.capture(), { createDocument })).toEqual({ kind: 'refused', reason: 'needs-adoption' });
  expect(claim(2, found.A).seq).toBeGreaterThan(0);
  const result = renderCheckpoint(handEdited, r.capture(), { createDocument });
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<p data-id="p">a q d</p>');
  r.rooms.fileWritten('/test.html', handEdited);
  expect(r.room.adopted).toBeNull();
  expect(renderCheckpoint(handEdited, r.capture(), { createDocument })).toEqual({ kind: 'refused', reason: 'needs-adoption' });
});
