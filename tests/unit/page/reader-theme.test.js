import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PAGE_EDITOR_CSS } from '../../../src/page/editor.js';

const themeNames = ['light-1', 'light-2', 'light-3', 'light-4'];
const content = readFileSync(new URL('../../../src/page/themes/content.css', import.meta.url), 'utf8');
const theme = (name) => readFileSync(new URL(`../../../src/page/themes/${name === 'light-1' ? 'light-1.source' : name}.css`, import.meta.url), 'utf8');
const withoutImports = (css) => css.replace(/^@import .*;\s*$/gm, '');
const withoutLayer = (css) => css.replace(/^\s*@layer page \{\s*/, '').replace(/\}\s*$/, '');
const oldEditorCss = PAGE_EDITOR_CSS
  .replaceAll(':where(article[data-page], .page-editor)', '.page-editor')
  .replaceAll(':where(article[data-page], .page-shell)', ':where(.page-shell)')
  .replaceAll(':is(article[data-page], .page-shell)', '.page-shell');
const addCss = (doc, css) => {
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
};
const editorHtml = '<!doctype html><html><head></head><body><div class="page-shell"><div class="page-editor"><h1>Title</h1><h2>Section</h2><p>Text <code>code</code></p><div class="page-li" data-kind="check" data-checked="true">Task</div><aside class="page-callout">Note</aside><figure class="page-chart"><figcaption>Chart</figcaption></figure></div></div></body></html>';
const readerHtml = '<!doctype html><html><head><link rel="stylesheet" href="https://clayjs.com/v1/src/page/themes/light-1.css"></head><body><article class="page" clay="freeze" data-page="1" data-rev="saved"><h1 data-id="title">Title</h1><h2 data-id="section">Section</h2><p data-id="text">Text <code>code</code></p><ul><li data-id="task"><input type="checkbox" checked disabled>Task</li></ul><aside class="page-callout">Note</aside><pre><code>code</code></pre><table><tr><th>Label</th><td>Value</td></tr></table><figure data-type="chart"><svg></svg><figcaption>Chart</figcaption></figure><blockquote>Quote</blockquote></article></body></html>';

const editorStyles = (base, css) => {
  const dom = new JSDOM(editorHtml);
  const doc = dom.window.document;
  addCss(doc, withoutLayer(base) + '\n' + css);
  const shell = doc.querySelector('.page-shell');
  const h1 = doc.querySelector('h1');
  const h2 = doc.querySelector('h2');
  const li = doc.querySelector('.page-li');
  const code = doc.querySelector('code');
  const sample = {
    background: dom.window.getComputedStyle(shell).getPropertyValue('--page-bg'),
    font: dom.window.getComputedStyle(shell).getPropertyValue('--page-font'),
    headingSize: dom.window.getComputedStyle(h1).fontSize,
    headingMargin: dom.window.getComputedStyle(h1).marginBottom,
    sectionMargin: dom.window.getComputedStyle(h2).marginTop,
    sectionLine: dom.window.getComputedStyle(h2).lineHeight,
    listMargin: dom.window.getComputedStyle(li).marginTop,
    codeSize: dom.window.getComputedStyle(code).fontSize,
  };
  dom.window.close();
  return sample;
};

test.each(themeNames)('%s styles the saved article and preserves editor content styles', (name) => {
  const css = theme(name);
  expect(css).toContain('@import url("./content.css")');
  const dom = new JSDOM(readerHtml.replace('light-1.css', `${name}.css`));
  const doc = dom.window.document;
  addCss(doc, withoutLayer(content) + '\n' + withoutImports(css));
  const article = doc.querySelector('article[data-page]');
  expect(doc.querySelector('.page-shell')).toBeNull();
  expect(doc.querySelector(':where(article[data-page], .page-shell)')).toBe(article);
  expect(dom.window.getComputedStyle(article).getPropertyValue('--page-bg').trim()).not.toBe('');
  expect(dom.window.getComputedStyle(article).getPropertyValue('--page-font').trim()).not.toBe('');
  expect(dom.window.getComputedStyle(article).getPropertyValue('--page-check-size').trim()).not.toBe('');
  for (const selector of ['article[data-page] > h1', 'article[data-page] li > input[type="checkbox"]', 'article[data-page] .page-callout', 'article[data-page] pre code', 'article[data-page] table', 'article[data-page] figure[data-type="chart"]', 'article[data-page] blockquote']) {
    expect(doc.querySelector(selector)).not.toBeNull();
    expect(withoutLayer(content) + css).toContain(selector);
  }
  expect(dom.window.getComputedStyle(article.querySelector('h1')).fontSize).not.toBe('');
  expect(dom.window.getComputedStyle(article.querySelector('th')).padding).not.toBe('');
  dom.window.close();

  const oldSelectors = withoutImports(css)
    .replaceAll(':is(article[data-page], .page-shell .page-editor)', '.page-shell .page-editor')
    .replaceAll(':is(article[data-page], .page-shell) .page-li', '.page-shell .page-li')
    .replaceAll(':where(article[data-page], .page-shell)', '.page-shell');
  expect(editorStyles(oldEditorCss, oldSelectors)).toEqual(editorStyles(PAGE_EDITOR_CSS, withoutLayer(content) + '\n' + withoutImports(css)));
});
