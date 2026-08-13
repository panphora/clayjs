// cacheBust.js
// Cache-bust an element's href or src attribute by adding/updating a version query param

import { addRegionToken } from './region-policy.js';

function cacheBust(el) {
  const attr = el.hasAttribute('href') ? 'href' : 'src';
  const currentValue = el.getAttribute(attr);
  const url = new URL(currentValue, location.href);
  url.searchParams.set('v', Date.now());
  el.setAttribute(attr, url.href);

  // This runs from [onaftersave], i.e. after the save baseline was taken, so the
  // rewrite would otherwise read as a user edit and leave the page dirty forever.
  // Marking the element instead of re-reading the whole live DOM afterwards is what
  // lets the baseline stay equal to the bytes actually sent: a post-save re-read
  // cannot tell this rewrite apart from something the user typed mid-save, and used
  // to record the latter as saved without sending it.
  addRegionToken(el, 'no-trigger-autosave');
}

export default cacheBust;
