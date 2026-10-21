/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import * as Y from '../../src/vendor/yjs.vendor.js';
import { createRooms, parseBy, serializeLive } from '../../src/server/rooms/index.js';
import { captureCheckpoint, isCheckpointCurrent, renderCheckpoint } from '../../src/server/checkpoint/index.js';
import { buildServerCheckpoint } from '../../scripts/build-server-checkpoint.mjs';
import { blocksFromYValue } from '../../src/page/ybind/decode.js';
import { boardKey } from '../../src/page/ybind/board.js';
import { createPageDoc } from '../../src/page/ybind/layout.js';
import { seedValue } from '../../src/page/ybind/seed.js';
import { docFromValue, enc, yValueOf } from '../../src/page/ybind/provider.js';

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
  expect(result.html).toContain('<head><title>Keep this title</title></head>');
  expect(result.html).toContain('<footer>Keep this footer</footer>');
  expect(result.html).toContain(tag('presence', { viewers: 1 }, true));
  expect(normalized(result.html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1])).toBe('<p data-id="p">aXc</p>');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
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

test('refuses unknown page content and table projection', () => {
  const unknown = seedValue([{ id: 'p', t: 'paragraph', text: 'text' }]);
  const doc = docFromValue(unknown, { strict: true });
  createPageDoc(doc).attrs.get('p').set('t', 'future_block');
  const bad = yValueOf(doc);
  doc.destroy();
  expect(roomOf(bad).render()).toEqual({ kind: 'refused', reason: 'unknown-page-content' });
  const table = seedValue([{ id: 't', t: 'table' }]);
  expect(roomOf(table).render()).toEqual({ kind: 'refused', reason: 'unsupported-projection' });
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

test('built CJS and ESM entries load in plain Node without DOM globals', async () => {
  await buildServerCheckpoint();
  const script = `
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    if (typeof window !== 'undefined' || typeof document !== 'undefined') throw Error('DOM globals present');
    const cjs = require('@panphora/clayjs/server/checkpoint');
    const esm = await import('@panphora/clayjs/server/checkpoint');
    console.log(JSON.stringify([Object.keys(cjs).sort(), ['captureCheckpoint', 'renderCheckpoint', 'isCheckpointCurrent'].every((name) => typeof esm[name] === 'function')]));
  `;
  const loaded = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8' }));
  expect(loaded[0]).toEqual(['captureCheckpoint', 'isCheckpointCurrent', 'renderCheckpoint']);
  expect(loaded[1]).toBe(true);
});
