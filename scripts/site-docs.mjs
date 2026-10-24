// The Markdown face of clayjs.com.
//
// Every doc page gets a Markdown twin at the same path with .md (/visual-guide -> /visual-guide.md),
// advertised by <link rel="alternate" type="text/markdown"> and copied by the
// "Copy as Markdown" button that /copy-markdown.js puts on the page. The twins are
// generated from the built HTML, never written by hand, so an agent reading /visual-guide.md
// reads what a person sees on /visual-guide.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const SITE = 'https://clayjs.com';

// Pages with a Markdown twin and the copy button. my-list is a live app, not a doc,
// and the examples are apps whose source is the point.
export const DOC_PAGES = ['index', 'visual-guide'];

export function pageToMarkdown(html, url) {
  const doc = new JSDOM(html).window.document;
  const main = doc.querySelector('main');
  if (!main) throw new Error(`${url} has no <main>`);
  main.querySelectorAll('script, style, template, noscript, button, input, select, textarea, .md-tools, [clay~="editor-ui"]').forEach((n) => n.remove());
  main.querySelectorAll('svg').forEach((svg) => {
    const label = (svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || '').trim();
    const note = doc.createElement('p');
    if (label) note.innerHTML = '<em></em>';
    note.firstChild?.append(`Diagram: ${label}`);
    svg.replaceWith(note);
  });
  // A Pele diagram keeps its Mermaid source in a hidden <pre>: give agents that
  // source as a fenced block. An animation is replaced by its label.
  main.querySelectorAll('figure:has(> pre.pele-src)').forEach((fig) => {
    const code = doc.createElement('code');
    code.className = 'language-mermaid';
    code.textContent = fig.querySelector('pre.pele-src').textContent;
    const pre = doc.createElement('pre');
    pre.append(code);
    fig.replaceWith(pre);
  });
  main.querySelectorAll('figure.vg-motion[aria-label]').forEach((fig) => {
    const note = doc.createElement('p');
    note.innerHTML = '<em></em>';
    note.firstChild.append(`Animation: ${fig.getAttribute('aria-label')}`);
    fig.replaceWith(note);
  });
  main.querySelectorAll('.pager').forEach((n) => n.remove());
  main.querySelectorAll('.doc-rows').forEach((rows) => {
    const list = doc.createElement('ul');
    for (const row of rows.querySelectorAll('a.doc-row')) {
      const item = doc.createElement('li');
      const link = doc.createElement('a');
      link.href = row.getAttribute('href');
      link.textContent = row.querySelector('.doc-name').textContent;
      const names = [...row.querySelectorAll('.doc-chips code')].map((c) => `<code>${c.innerHTML}</code>`).join(', ');
      item.append(link, `: ${row.querySelector('.doc-line').textContent} `);
      item.insertAdjacentHTML('beforeend', `Covers ${names}.`);
      list.append(item);
    }
    rows.replaceWith(list);
  });
  main.querySelectorAll('.legend').forEach((legend) => {
    legend.textContent = [...legend.children].map((c) => c.textContent.trim()).join(' · ');
  });
  main.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', new URL(a.getAttribute('href'), url).href));

  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '_' });
  turndown.use(gfm);
  const title = doc.querySelector('title')?.textContent.trim();
  const markdown = turndown.turndown(main.innerHTML).replace(/^```markup$/gm, '```html').replace(/^(#+ \d+)\\\./gm, '$1.').replace(/\n{3,}/g, '\n\n').trim();
  return `<!-- ${title} · ${url} · generated from the page; every page has one at its path plus .md -->\n\n${markdown}\n`;
}

function addMarkdownHooks(html, markdownPath) {
  if (html.split('</head>').length !== 2 || html.split('</body>').length !== 2) {
    throw new Error(`the page for ${markdownPath} needs exactly one </head> and one </body>`);
  }
  return html
    .replace('</head>', `<link rel="alternate" type="text/markdown" href="${markdownPath}">\n</head>`)
    .replace('</body>', '<script src="/copy-markdown.js" defer></script>\n</body>');
}

// Runs after website/ is copied into publicDir. Returns the paths it wrote, relative
// to publicDir, so the caller can give them cache rules.
export async function emitDocs({ website, publicDir }) {
  const written = [];
  const write = async (rel, text) => {
    await mkdir(dirname(join(publicDir, rel)), { recursive: true });
    await writeFile(join(publicDir, rel), text);
    written.push(rel);
  };

  for (const name of DOC_PAGES) {
    const path = join(publicDir, `${name}.html`);
    const html = await readFile(path, 'utf8');
    const markdown = pageToMarkdown(html, name === 'index' ? `${SITE}/` : `${SITE}/${name}`);
    // A converter that matched nothing would still write a file; a near-empty twin
    // is that failure, not a short page.
    if (markdown.length < 600) throw new Error(`${name}.md came out at ${markdown.length} characters; the page conversion found almost nothing`);
    await write(`${name}.md`, markdown);
    await writeFile(path, addMarkdownHooks(html, `/${name}.md`));
  }
  return written;
}
