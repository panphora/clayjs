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
  return { articles, tags, rev: articles.length === 1 ? $(articles[0]).attr('data-rev') || null : null };
}

export function pageRev(html) {
  if (typeof html !== 'string') return null;
  return locate(html).rev;
}

const lineStart = (html, at) => {
  for (let i = at - 1; i >= 0; i--) if (html[i] === '\n' || html[i] === '\r') return i + 1;
  return 0;
};

const lineEnd = (html, at) => {
  for (let i = at; i < html.length; i++) {
    if (html[i] === '\n') return i + 1;
    if (html[i] === '\r') return html[i + 1] === '\n' ? i + 2 : i + 1;
  }
  return html.length;
};

const newlineOf = (html, from) => {
  const before = html.slice(Math.max(0, from - 2), from);
  if (before.endsWith('\r\n')) return '\r\n';
  if (before.endsWith('\n')) return '\n';
  if (before.endsWith('\r')) return '\r';
  const first = /\r\n|\r|\n/.exec(html);
  return first ? first[0] : '\n';
};

const spanOf = (html, loc) => {
  let start = loc.startOffset;
  let end = loc.endOffset;
  const from = lineStart(html, start);
  const to = lineEnd(html, end);
  if (!/\S/.test(html.slice(from, start)) && !/\S/.test(html.slice(end, to))) { start = from; end = to; }
  return [start, end];
};

// The stored file and the page tag it held, or the html unchanged with no state
// when it is not exactly one Yjs page tag beside exactly one revisioned article.
// A tag with no revisioned article stays in the file: there it is the only copy
// of the page, and no record could hold it.
export function splitPage(html) {
  if (typeof html !== 'string' || inspectPage(html).kind !== 'yjs') return { file: html, state: null };
  const { articles, tags, rev } = locate(html);
  if (articles.length !== 1 || tags.length !== 1 || !rev) return { file: html, state: null };
  const article = articles[0].sourceCodeLocation;
  const loc = tags[0].sourceCodeLocation;
  if (!article || !loc || (loc.startOffset < article.endOffset && loc.endOffset > article.startOffset)) return { file: html, state: null };
  const [start, end] = spanOf(html, loc);
  return { file: html.slice(0, start) + html.slice(end), state: { v: 1, rev, tag: html.slice(loc.startOffset, loc.endOffset) } };
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
  const insert = /\S/.test(indent) ? state.tag : `${state.tag}${newlineOf(file, from)}${indent}`;
  return file.slice(0, at) + insert + file.slice(at);
}
