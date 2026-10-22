import { load } from 'cheerio';
import { inspectPage } from './page-admission.js';

const inert = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.name === 'template' || parent.name === 'noscript') return true;
  return false;
};

function locate(html) {
  const $ = load(html, { sourceCodeLocationInfo: true });
  const articles = $('article[data-page]').toArray().filter((node) => !inert(node));
  const tags = $('script[merge="page"]').toArray().filter((node) => !inert(node) &&
    ($(node).attr('clay') || '').split(/\s+/).includes('live'));
  return { articles, tags, rev: articles.length === 1 ? $(articles[0]).attr('data-rev') ?? null : null };
}

const lineStart = (html, at) => html.lastIndexOf('\n', at - 1) + 1;

// The stored file and the page tag it held, or the html unchanged with no state
// when it is not exactly one Yjs page tag beside exactly one revisioned article.
export function splitPage(html) {
  if (typeof html !== 'string' || inspectPage(html).kind !== 'yjs') return { file: html, state: null };
  const { articles, tags, rev } = locate(html);
  if (articles.length !== 1 || tags.length !== 1 || !rev) return { file: html, state: null };
  const article = articles[0].sourceCodeLocation;
  const loc = tags[0].sourceCodeLocation;
  if (!article || !loc || (loc.startOffset < article.endOffset && loc.endOffset > article.startOffset)) return { file: html, state: null };
  const tag = html.slice(loc.startOffset, loc.endOffset);
  let start = loc.startOffset;
  let end = loc.endOffset;
  const from = lineStart(html, start);
  const newline = html.indexOf('\n', end);
  const to = newline === -1 ? html.length : newline + 1;
  if (!/\S/.test(html.slice(from, start)) && !/\S/.test(html.slice(end, to))) { start = from; end = to; }
  return { file: html.slice(0, start) + html.slice(end), state: { v: 1, rev, tag } };
}

// The document an editor sees: the file with the stored page tag put back
// before its article, when the record still belongs to that article.
export function composePage(file, state) {
  if (typeof file !== 'string' || !state || state.v !== 1 || typeof state.tag !== 'string' || !state.rev) return file;
  if (inspectPage(file).kind !== 'none') return file;
  const { articles, rev } = locate(file);
  if (articles.length !== 1 || rev !== state.rev) return file;
  const at = articles[0].sourceCodeLocation.startOffset;
  const from = lineStart(file, at);
  const indent = file.slice(from, at);
  const insert = /\S/.test(indent) ? state.tag : `${state.tag}\n${indent}`;
  return file.slice(0, at) + insert + file.slice(at);
}
