// cacheBust.js
// Cache-bust an element's href or src attribute by adding/updating a version query param

function cacheBust(el) {
  const attr = el.hasAttribute('href') ? 'href' : 'src';
  const currentValue = el.getAttribute(attr);
  const url = new URL(currentValue, location.href);
  url.searchParams.set('v', Date.now());
  el.setAttribute(attr, url.href);
}

export default cacheBust;
