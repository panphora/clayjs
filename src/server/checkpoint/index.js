import { parse } from 'parse5';
import { parseJsonRelaxed } from 'hyper-morph/json-parse';
import { cloneJson, formatBy, serializeLive, stampOf, textHash, unionRanges } from '../rooms/index.js';
import { blocksFromYValue } from '../../page/ybind/decode.js';
import { YDecodeError } from '../../page/ybind/provider.js';
import { canon, fragmentCleaner, renderBlocks } from '../../page/projection.js';

const PAGE = /^page(\.[0-9]+)?$/;
const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const attr = (node, name) => node.attrs.find((item) => item.name === name)?.value;
const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function provenanceOf(room, store) {
  const frames = unionRanges(store.log.filter((entry) => entry.from && entry.seq <= room.seq)
    .map((entry) => [entry.from, [[entry.n, entry.n]]]));
  if (!frames.length || !Number.isSafeInteger(room.seq + 1)) return null;
  return formatBy({ v: 2, frames, ancestors: [], capture: [`checkpoint_${textHash(room.epoch)}`, room.seq + 1] });
}

export function captureCheckpoint(room, { nodeId, roomKey }) {
  if (!room || room.key !== roomKey || String(room.nodeId) !== String(nodeId)) throw new TypeError('The room identity changed');
  const { epoch, seq } = room;
  const generation = room.pageTransition?.id ?? null;
  const stores = [...room.stores].filter(([, store]) => !store.ephemeral).map(([name, store]) => {
    const text = serializeLive(store.value);
    return { name, value: cloneJson(store.value), text, liveAt: stampOf(epoch, seq, text), provenance: provenanceOf(room, store) };
  });
  return { roomKey, nodeId, epoch, generation, seq, stores };
}

function inspect(html) {
  const root = parse(html, { sourceCodeLocationInfo: true });
  const tags = new Map();
  const duplicates = new Set();
  const articles = [];
  function visit(node, inert = false) {
    if (!node.tagName) { for (const child of node.childNodes ?? []) visit(child, inert); return; }
    const blocked = inert || node.tagName === 'template' || node.tagName === 'noscript';
    if (!blocked && node.tagName === 'article' && attr(node, 'data-page') !== undefined) articles.push(node);
    if (!blocked && node.tagName === 'script' && attr(node, 'src') === undefined &&
      (attr(node, 'clay') ?? '').split(/\s+/).includes('live')) {
      const type = (attr(node, 'type') ?? '').split(';')[0].trim().toLowerCase();
      const name = attr(node, 'merge');
      if (name && NAME.test(name) && (type === 'application/json' || type.endsWith('+json'))) {
        if (tags.has(name)) duplicates.add(name);
        else tags.set(name, node);
      }
    }
    for (const child of node.childNodes ?? []) visit(child, blocked);
    if (node.content) visit(node.content, blocked);
  }
  visit(root);
  for (const name of duplicates) tags.delete(name);
  return { article: articles.length === 1 ? articles[0] : null, tags };
}

function startTag(html, node, store) {
  const loc = node.sourceCodeLocation.startTag;
  const removed = Object.entries(node.sourceCodeLocation.attrs ?? {})
    .filter(([name]) => name === 'live-at' || name === 'live-by')
    .map(([, range]) => range).sort((a, b) => b.startOffset - a.startOffset);
  let raw = html.slice(loc.startOffset, loc.endOffset);
  for (const range of removed) raw = raw.slice(0, range.startOffset - loc.startOffset) + raw.slice(range.endOffset - loc.startOffset);
  const insert = ` live-at="${escapeAttr(store.liveAt)}"${store.provenance ? ` live-by="${escapeAttr(store.provenance)}"` : ''}`;
  return raw.slice(0, -1) + insert + '>';
}

function projection(capture) {
  const page = capture.stores.find((store) => store.name === 'page');
  if (!page || capture.stores.some((store) => PAGE.test(store.name) && store.name !== 'page')) return { kind: 'refused', reason: 'invalid-document' };
  try {
    const blocks = blocksFromYValue(page.value);
    if (Object.values(blocks).some((block) => block.t === 'tool' || (block.t === 'table' && !Object.keys(block.cols ?? {}).length))) {
      return { kind: 'refused', reason: 'unsupported-projection' };
    }
    return { kind: 'ok', blocks };
  } catch (error) {
    if (error instanceof YDecodeError) {
      return { kind: 'refused', reason: error.code === 'incomplete-update' || error.code === 'unresolved-update' ? 'incomplete-page'
        : error.code === 'unsupported-content' ? 'unknown-page-content' : 'invalid-document' };
    }
    throw error;
  }
}

function placements(html, capture) {
  const { article, tags } = inspect(html);
  if (!article?.sourceCodeLocation?.startTag || !article.sourceCodeLocation.endTag ||
    capture.stores.some((store) => !tags.get(store.name)?.sourceCodeLocation?.endTag ||
      (attr(tags.get(store.name), 'clay') ?? '').split(/\s+/).includes('ephemeral'))) return null;
  const articleStart = article.sourceCodeLocation.startOffset;
  const articleEnd = article.sourceCodeLocation.endOffset;
  if (capture.stores.some((store) => {
    const tag = tags.get(store.name).sourceCodeLocation;
    return tag.startOffset < articleEnd && tag.endOffset > articleStart;
  })) return null;
  return { article, tags };
}

function replace(html, edits) {
  return edits.sort((a, b) => b.start - a.start).reduce((out, edit) =>
    out.slice(0, edit.start) + edit.text + out.slice(edit.end), html);
}

export function renderCheckpoint(currentHtml, capture, { createDocument }) {
  const placement = placements(currentHtml, capture);
  if (!placement || typeof createDocument !== 'function') return { kind: 'refused', reason: 'invalid-document' };
  const decoded = projection(capture);
  if (decoded.kind === 'refused') return decoded;
  const doc = createDocument();
  if (!doc?.createElement) return { kind: 'refused', reason: 'invalid-document' };
  let rendered;
  try { rendered = renderBlocks(decoded.blocks, { clean: fragmentCleaner(doc) }); }
  finally { doc.defaultView?.close?.(); }
  const edits = [];
  for (const store of capture.stores) {
    const loc = placement.tags.get(store.name).sourceCodeLocation;
    edits.push({ start: loc.startTag.startOffset, end: loc.startTag.endOffset, text: startTag(currentHtml, placement.tags.get(store.name), store) });
    edits.push({ start: loc.startTag.endOffset, end: loc.endTag.startOffset, text: store.text });
  }
  const articleLoc = placement.article.sourceCodeLocation;
  const articleOpen = currentHtml.slice(articleLoc.startTag.startOffset, articleLoc.startTag.endOffset);
  const rev = ` data-rev="${rendered.rev}"`;
  const revLoc = articleLoc.attrs?.['data-rev'];
  const articleStart = revLoc ? articleOpen.slice(0, revLoc.startOffset - articleLoc.startTag.startOffset) +
    articleOpen.slice(revLoc.endOffset - articleLoc.startTag.startOffset) : articleOpen;
  edits.push({ start: articleLoc.startTag.startOffset, end: articleLoc.startTag.endOffset, text: articleStart.slice(0, -1) + rev + '>' });
  edits.push({ start: articleLoc.startTag.endOffset, end: articleLoc.endTag.startOffset, text: rendered.html });
  return { kind: 'ok', html: replace(currentHtml, edits), revision: rendered.rev };
}

export function isCheckpointCurrent(currentHtml, capture) {
  const placement = placements(currentHtml, capture);
  if (!placement) return false;
  const decoded = projection(capture);
  if (decoded.kind === 'refused') return false;
  const rendered = renderBlocks(decoded.blocks);
  const articleLoc = placement.article.sourceCodeLocation;
  if (attr(placement.article, 'data-rev') !== rendered.rev ||
    currentHtml.slice(articleLoc.startTag.endOffset, articleLoc.endTag.startOffset) !== rendered.html) return false;
  return capture.stores.every((store) => {
    const node = placement.tags.get(store.name);
    const loc = node.sourceCodeLocation;
    try {
      return canon(parseJsonRelaxed(currentHtml.slice(loc.startTag.endOffset, loc.endTag.startOffset))) === canon(store.value);
    } catch { return false; }
  });
}
