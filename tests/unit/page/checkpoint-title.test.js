/**
 * @jest-environment node
 */
import { parse } from 'parse5';
import { JSDOM } from 'jsdom';
import * as Y from '../../../src/vendor/yjs.vendor.js';
import { createRooms, serializeLive } from '../../../src/server/rooms/index.js';
import { captureCheckpoint, isCheckpointCurrent, renderCheckpoint } from '../../../src/server/checkpoint/index.js';
import { seedValue } from '../../../src/page/ybind/seed.js';
import { docFromValue, enc } from '../../../src/page/ybind/provider.js';

// Scenario: the server checkpoint writes the same document title the editor derives
// — the first root H1, or Untitled — and compares that title when deciding whether a
// file is current. A file that owns its title through the SEO marker keeps it.

const tag = (name, value, ephemeral = false) =>
  `<script type="application/json" clay="live${ephemeral ? ' ephemeral' : ''}" merge="${name}">${serializeLive(value)}</script>`;
const page = (value, { head = '<title>Old title</title>', body = '' } = {}) =>
  `<!doctype html><html><head>${head}</head><body><article data-page data-rev="old">old article</article>${tag('page', value)}${tag('game', { score: 0 })}${body}</body></html>`;
const createDocument = () => new JSDOM('').window.document;
const head = (html) => html.slice(html.indexOf('<head>'), html.indexOf('</head>') + 7);
const bodyOf = (html) => html.slice(html.indexOf('<body>'), html.indexOf('</body>') + 7);
const titleOf = (html) => {
  const find = (node) => {
    if (node.tagName === 'title') return node;
    for (const child of node.childNodes ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const node = find(parse(html));
  return node ? node.childNodes.map((child) => child.value ?? '').join('') : null;
};
const marker = (content) => `<meta name="clay-seo-title-mode" content="${content}">`;
const heading = (text, attrs = { level: 1 }) => [{ id: 'h', t: 'heading', text, attrs }];

function roomOf(value, options) {
  const rooms = createRooms({ newEpoch: () => 'checkpoint-title' });
  const source = page(value, options);
  const room = rooms.open('/page.html', source, { nodeId: 'node-1' });
  const capture = () => captureCheckpoint(room, { nodeId: 'node-1', roomKey: '/page.html' });
  const render = (text = source, pinned = capture()) => renderCheckpoint(text, pinned, { createDocument });
  return { rooms, room, source, capture, render };
}

const editPage = (rooms, room, client, n, change) => {
  const doc = docFromValue(room.stores.get('page').value, { strict: true });
  doc.clientID = Number(client);
  change(doc.getText('flow'));
  const update = enc(Y.encodeStateAsUpdateV2(doc));
  doc.destroy();
  const result = rooms.apply(room, client, { name: 'page', n, ops: [{ op: 'set', path: ['y', `edit-${client}-${n}`], value: update }], epoch: room.epoch, pageGeneration: room.pageTransition?.id ?? null });
  expect(result.seq).toBeGreaterThan(0);
  return result;
};

test('a derived title reaches the file, and a corrupted title makes it non-current', () => {
  const { source, capture, render } = roomOf(seedValue(heading('New title')));
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<h1 data-id="h">New title</h1>');
  expect(titleOf(result.html)).toBe('New title');
  expect(head(result.html)).toBe('<head><title>New title</title></head>');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);

  const corrupted = result.html.replace('<title>New title</title>', '<title>An older name</title>');
  expect(corrupted).not.toBe(result.html);
  expect(isCheckpointCurrent(corrupted, pinned)).toBe(false);
  expect(titleOf(render(corrupted, pinned).html)).toBe('New title');
});

test('a custom title survives exactly, and currentness ignores the derivation', () => {
  const { source, capture, render } = roomOf(seedValue(heading('New title')), {
    head: `${marker('custom')}<title>The person's title</title>`,
  });
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<h1 data-id="h">New title</h1>');
  expect(titleOf(result.html)).toBe("The person's title");
  expect(head(result.html)).toBe(`<head>${marker('custom')}<title>The person's title</title></head>`);
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);

  const corrupted = result.html.replace("<title>The person's title</title>", '<title>Renamed by hand</title>');
  expect(isCheckpointCurrent(corrupted, pinned)).toBe(true);
});

test('a custom marker with duplicates keeps the file title, and an earlier derived marker does not cancel it', () => {
  const value = seedValue(heading('New title'));
  const derivedFirst = roomOf(value, { head: `${marker('derived')}<title>Mine</title>${marker('custom')}` });
  const kept = derivedFirst.render(derivedFirst.source, derivedFirst.capture());
  expect(kept.kind).toBe('ok');
  expect(titleOf(kept.html)).toBe('Mine');
  expect(isCheckpointCurrent(kept.html, derivedFirst.capture())).toBe(true);

  const customFirst = roomOf(value, { head: `${marker('custom')}<title>Mine</title>${marker('derived')}` });
  const also = customFirst.render(customFirst.source, customFirst.capture());
  expect(also.kind).toBe('ok');
  expect(titleOf(also.html)).toBe('Mine');
});

test('an empty custom title is preserved as written', () => {
  const { source, capture, render } = roomOf(seedValue(heading('New title')), { head: `${marker('custom')}<title></title>` });
  const result = render(source, capture());
  expect(result.kind).toBe('ok');
  expect(result.html).toContain(`${marker('custom')}<title></title>`);
  expect(isCheckpointCurrent(result.html, capture())).toBe(true);
});

test('the derived title is escaped in the source and reads back as the heading text', () => {
  const text = 'A & B < C > D "quoted"';
  const { source, capture, render } = roomOf(seedValue(heading(text)));
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<title>A &amp; B &lt; C &gt; D "quoted"</title>');
  expect(titleOf(result.html)).toBe(text);
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
});

test('a file with no title gets one after the head start tag', () => {
  const { source, capture, render } = roomOf(seedValue(heading('New title')), {
    head: '<meta name="description" content="Kept">',
  });
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<head><title>New title</title><meta name="description" content="Kept"></head>');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
});

test('an implicit head receives the title before the body starts', () => {
  const value = seedValue(heading('New title'));
  const source = `<!doctype html><html><body><article data-page data-rev="old">old article</article>${tag('page', value)}${tag('game', { score: 0 })}</body></html>`;
  const rooms = createRooms({ newEpoch: () => 'checkpoint-title' });
  const room = rooms.open('/page.html', source, { nodeId: 'node-1' });
  const pinned = captureCheckpoint(room, { nodeId: 'node-1', roomKey: '/page.html' });
  const result = renderCheckpoint(source, pinned, { createDocument });
  expect(result.kind).toBe('ok');
  expect(result.html).toContain('<title>New title</title><body>');
  expect(titleOf(result.html)).toBe('New title');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
});

test('a title and a marker inside a template or noscript decoy are ignored', () => {
  const decoy = `<template><title>Decoy title</title>${marker('custom')}</template><noscript><title>No script title</title></noscript>`;
  const { source, capture, render } = roomOf(seedValue(heading('New title')), {
    head: '<title>Old title</title>',
    body: decoy,
  });
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(head(result.html)).toBe('<head><title>New title</title></head>');
  expect(bodyOf(result.html)).toContain(decoy);
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
});

test('a room-only heading update changes the title of a file written before it', () => {
  const fixture = roomOf(seedValue(heading('New title')));
  const { rooms, room, capture, render } = fixture;
  const first = capture();
  const written = render(fixture.source, first);
  expect(titleOf(written.html)).toBe('New title');

  editPage(rooms, room, '100', 1, (flow) => flow.insert(flow.length, ' again'));
  const later = capture();
  expect(isCheckpointCurrent(written.html, later)).toBe(false);
  const repaired = render(written.html, later);
  expect(repaired.kind).toBe('ok');
  expect(repaired.html).toContain('<h1 data-id="h">New title again</h1>');
  expect(titleOf(repaired.html)).toBe('New title again');
  expect(isCheckpointCurrent(repaired.html, later)).toBe(true);
});

test('a document with no root H1 derives Untitled', () => {
  const { source, capture, render } = roomOf(seedValue([
    { id: 'h', t: 'heading', text: 'Sub head', attrs: { level: 2 } },
    { id: 'p', t: 'paragraph', text: 'text' },
  ]));
  const pinned = capture();
  const result = render(source, pinned);
  expect(result.kind).toBe('ok');
  expect(titleOf(result.html)).toBe('Untitled');
  expect(isCheckpointCurrent(result.html, pinned)).toBe(true);
});
