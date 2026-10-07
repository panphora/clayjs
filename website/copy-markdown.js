// Puts "Copy as Markdown" and a link to the page's Markdown twin at the top right
// of a doc page. The twin is the <link rel="alternate" type="text/markdown"> that
// build.js adds; a page without one gets no button.
(() => {
  const link = document.querySelector('link[rel="alternate"][type="text/markdown"]');
  const header = document.querySelector('main section');
  if (!link || !header) return;
  const href = link.getAttribute('href');

  const tools = document.createElement('div');
  tools.className = 'md-tools';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn ghost';
  button.textContent = 'Copy as Markdown';
  const view = document.createElement('a');
  view.href = href;
  view.textContent = '.md';
  view.title = 'View this page as Markdown';
  tools.append(button, view);
  header.prepend(tools);

  let text = null;
  const load = () => (text ??= fetch(href).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }));
  button.addEventListener('pointerenter', () => load().catch(() => { text = null; }), { once: true });

  let timer;
  const say = (label) => {
    button.textContent = label;
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = 'Copy as Markdown'; }, 1800);
  };

  // Safari only lets a clipboard write that starts inside the click, so the fetch is
  // handed to ClipboardItem as a promise instead of awaited first.
  button.addEventListener('click', async () => {
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': load().then((t) => new Blob([t], { type: 'text/plain' })) })]);
      } else {
        await navigator.clipboard.writeText(await load());
      }
      say('Copied');
    } catch {
      text = null;
      say('Copy failed');
    }
  });
})();
