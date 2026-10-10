// Copy-as-Markdown buttons. A button with data-copy-md="/path.md" copies that file.
// A doc page with no such button gets one at the top right of its first section,
// pointing at the page's <link rel="alternate" type="text/markdown"> (added by
// build.js), with a ".md file" button beside it that opens the file.
(() => {
  const label = 'Copy as Markdown';

  function wire(button, href) {
    let text = null;
    const load = () => (text ??= fetch(href).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }));
    button.addEventListener('pointerenter', () => load().catch(() => { text = null; }), { once: true });

    let timer;
    const say = (message) => {
      button.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(() => { button.textContent = label; }, 1800);
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
  }

  const marked = document.querySelectorAll('button[data-copy-md]');
  if (marked.length) {
    marked.forEach((button) => wire(button, button.dataset.copyMd));
    return;
  }

  const link = document.querySelector('link[rel="alternate"][type="text/markdown"]');
  const header = document.querySelector('main section');
  if (!link || !header) return;
  const href = link.getAttribute('href');

  const tools = document.createElement('div');
  tools.className = 'md-tools';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn ghost';
  button.textContent = label;
  const view = document.createElement('a');
  view.className = 'btn ghost';
  view.href = href;
  view.textContent = '.md file';
  tools.append(button, view);
  header.prepend(tools);
  wire(button, href);
})();
