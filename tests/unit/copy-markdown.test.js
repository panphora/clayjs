import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../website/copy-markdown.js', import.meta.url), 'utf8');
const run = () => new Function(source)();

function page({ withLink = true } = {}) {
  document.head.innerHTML = withLink ? '<link rel="alternate" type="text/markdown" href="/docs.md">' : '';
  document.body.innerHTML = '<main><section><span class="eyebrow">Docs</span><h1>Reference</h1></section><section id="later"></section></main>';
}

afterEach(() => {
  delete window.ClipboardItem;
  delete navigator.clipboard;
});

test('puts the button and the .md link at the top of the first section', () => {
  page();
  run();
  const tools = document.querySelector('main section').firstElementChild;
  expect(tools.className).toBe('md-tools');
  expect(tools.querySelector('button').textContent).toBe('Copy as Markdown');
  expect(tools.querySelector('a').getAttribute('href')).toBe('/docs.md');
  expect(tools.querySelector('a').textContent).toBe('.md file');
  expect(tools.querySelector('a').className).toBe('btn ghost');
  expect(document.querySelectorAll('.md-tools')).toHaveLength(1);
});

test('a page without a Markdown twin gets no button', () => {
  page({ withLink: false });
  run();
  expect(document.querySelector('.md-tools')).toBeNull();
});

test('copies the fetched Markdown and says so', async () => {
  page();
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => '# Reference\n' }));
  const writeText = jest.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  run();
  const button = document.querySelector('.md-tools button');
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalledWith('/docs.md');
  expect(writeText).toHaveBeenCalledWith('# Reference\n');
  expect(button.textContent).toBe('Copied');
});

test('a failed fetch reports the failure and can retry', async () => {
  page();
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, text: async () => '' }));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn() } });
  run();
  const button = document.querySelector('.md-tools button');
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(button.textContent).toBe('Copy failed');
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('a page with its own data-copy-md buttons wires them and adds nothing', async () => {
  page();
  document.body.insertAdjacentHTML('beforeend', '<button data-copy-md="/guide.md">Copy as Markdown</button>');
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => '# Guide\n' }));
  const writeText = jest.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  run();
  expect(document.querySelector('.md-tools')).toBeNull();
  const button = document.querySelector('[data-copy-md]');
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalledWith('/guide.md');
  expect(writeText).toHaveBeenCalledWith('# Guide\n');
  expect(button.textContent).toBe('Copied');
});
