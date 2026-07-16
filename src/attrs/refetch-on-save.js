function swapElement(el) {
  const attr = el.hasAttribute('href') ? 'href' : el.hasAttribute('src') ? 'src' : null;
  if (!attr) return;

  const oldValue = el.getAttribute(attr);
  const url = new URL(oldValue, location.href);
  url.searchParams.set('v', Date.now());
  const isSameOrigin = url.origin === location.origin;

  const newEl = document.createElement(el.tagName);
  for (const { name, value } of el.attributes) {
    newEl.setAttribute(name, value);
  }
  newEl.setAttribute(attr, isSameOrigin ? url.pathname + url.search : url.href);
  newEl.setAttribute("clay", "no-trigger-autosave no-undo");

  el.insertAdjacentElement('afterend', newEl);

  newEl.onload = () => el.remove();
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 2000);
}

function init() {
  document.addEventListener('clay:save-saved', () => {
    document.querySelectorAll('[refetch-on-save]').forEach(swapElement);
  });
}

init();

export default init;
