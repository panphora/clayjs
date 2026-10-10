// The Markdown face of clayjs.com, and the guide page.
//
// Every doc page gets a Markdown twin at the same path with .md (/docs -> /docs.md),
// advertised by <link rel="alternate" type="text/markdown"> and copied by the
// "Copy as Markdown" button that /copy-markdown.js puts on the page. The twins are
// generated from the built HTML, never written by hand, so an agent reading /docs.md
// reads what a person sees on /docs.
//
// The guide runs the other way: docs/guide.md is the source, served verbatim at
// /guide.md, and /complete-guide is rendered from it inside the docs page's own shell
// (head, nav, footer), so it cannot drift from the rest of the site. /guide itself is
// website/guide.html, which offers the complete guide and the visual guide.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { Marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const SITE = 'https://clayjs.com';

// Pages with a Markdown twin and the copy button. my-list is a live app, not a doc,
// and the examples are apps whose source is the point.
export const DOC_PAGES = ['index', 'get-started', 'advanced', 'plugins', 'docs', 'visual-guide',
  ...['script-tag', 'api', 'attributes', 'events', 'edit-mode', 'endpoint', 'offline', 'internals', 'examples'].map((part) => `docs/${part}`)];

const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function renderGuide(markdown, shellHtml) {
  const title = markdown.match(/^# (.+)\n/)?.[1];
  if (!title) throw new Error('docs/guide.md must start with a "# " title line');
  const body = markdown.slice(markdown.indexOf('\n') + 1);

  const toc = [];
  const used = new Set();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        let id = slug(html);
        while (used.has(id)) id += '-x';
        used.add(id);
        if (depth === 2) toc.push(`<li><a href="#${id}">${html.replace(/<[^>]+>/g, '')}</a></li>`);
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
    },
  });
  const content = marked.parse(body);

  const dom = new JSDOM(shellHtml);
  const doc = dom.window.document;
  const description = 'The complete guide to building malleable HTML apps with clayjs: inline editing, saving, live sync, components, architecture, recipes and traps.';
  doc.title = 'Complete guide · clayjs';
  const set = (selector, attr, value) => {
    const el = doc.querySelector(selector);
    if (!el) throw new Error(`guide shell has no ${selector}`);
    el.setAttribute(attr, value);
  };
  set('meta[name="description"]', 'content', description);
  set('link[rel="canonical"]', 'href', `${SITE}/complete-guide`);
  set('meta[property="og:title"]', 'content', 'Complete guide · clayjs');
  set('meta[property="og:description"]', 'content', description);
  set('meta[property="og:url"]', 'content', `${SITE}/complete-guide`);
  set('meta[name="twitter:title"]', 'content', 'Complete guide · clayjs');
  set('meta[name="twitter:description"]', 'content', description);

  doc.querySelector('.nav a[aria-current]')?.removeAttribute('aria-current');
  const navLink = doc.querySelector('.nav a[href="/guide"]');
  if (!navLink) throw new Error('the docs page nav has no /guide link');
  navLink.setAttribute('aria-current', 'page');

  const main = doc.querySelector('main');
  main.className = 'page guide';
  main.innerHTML = `
  <section style="border-top: none; padding-top: 56px;">
    <span class="eyebrow"><a href="/guide">Guide</a> · Complete</span>
    <h1 class="display" style="font-size: clamp(30px, 4.5vw, 42px);">${title}</h1>
    <details class="fold toc"><summary><span class="prob">Contents</span></summary><div class="fold-body"><ol>${toc.join('')}</ol></div></details>
  </section>
  <article class="prose">
${content}
  </article>
`;
  // The trap index's last column names sections ("5.3, 8.3"); make each a link.
  const sectionIds = new Map();
  for (const h of main.querySelectorAll('h3[id]')) {
    const number = h.textContent.match(/^(\d+\.\d+) /)?.[1];
    if (number) sectionIds.set(number, h.id);
  }
  for (const cell of main.querySelectorAll('td:last-child')) {
    const text = cell.textContent.trim();
    if (!/^\d+\.\d+(, \d+\.\d+)*$/.test(text)) continue;
    cell.innerHTML = text.split(', ').map((n) => (sectionIds.has(n) ? `<a href="#${sectionIds.get(n)}">${n}</a>` : n)).join(', ');
  }
  return dom.serialize();
}

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
export async function emitDocs({ website, publicDir, guideSource }) {
  const written = [];
  const write = async (rel, text) => {
    await mkdir(dirname(join(publicDir, rel)), { recursive: true });
    await writeFile(join(publicDir, rel), text);
    written.push(rel);
  };

  const guideMarkdown = await readFile(guideSource, 'utf8');
  const shell = await readFile(join(website, 'docs.html'), 'utf8');
  await write('guide.md', guideMarkdown);
  await write('complete-guide.html', addMarkdownHooks(renderGuide(guideMarkdown, shell), '/guide.md'));
  const chooser = join(publicDir, 'guide.html');
  await writeFile(chooser, addMarkdownHooks(await readFile(chooser, 'utf8'), '/guide.md'));

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
