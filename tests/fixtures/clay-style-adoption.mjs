import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const require = createRequire(`${repo}/package.json`);
const { JSDOM, VirtualConsole } = require('jsdom');
const scenario = process.argv[2];
const vc = new VirtualConsole();
let cssWarnings = 0;
vc.on('jsdomError', (e) => {
  if (e.type === 'css parsing') cssWarnings++;
  else throw e;
});
const legacy = scenario === 'editor';
const bootCase = scenario.startsWith('boot-');
const inline = '<style data-name="saved" clay="no-data">.item { color: red; }</style>';
const link = '<link rel="stylesheet" href="/app.css?v=1" clay="no-data">';
const editorStyles = '<style id="page-editor-style">.old { color: red; }</style>\n<style id="page-editor-style">.old { color: pink; }</style>';
const dom = new JSDOM(`<!DOCTYPE html><html autosave><head>${legacy ? editorStyles : inline + link}</head><body><p id="content">Original</p><div id="batch" clay="no-trigger-autosave">Batch original</div><div id="mount"></div><div id="ordinary">Normal policy</div><style data-name="saved">.duplicate { color: pink; }</style></body></html>`, {
  url: 'https://fixture.invalid/document.html', pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
}
for (const key of ['Event', 'EventTarget', 'CustomEvent', 'navigator']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
}
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.clayEditMode = scenario !== 'view';
window.clay = {};
const posts = [];
const reads = [];
let holdResponse = false;
let responseStatus = 200;
let release;
globalThis.fetch = window.fetch = async (url, options) => {
  if (options?.method === 'POST') {
    posts.push(String(options.body));
    if (holdResponse) await new Promise(resolve => { release = resolve; });
    return { ok: responseStatus === 200, status: responseStatus, text: async () => JSON.stringify({ msg: 'Fixture response', msgType: responseStatus === 200 ? 'success' : 'error' }) };
  }
  reads.push(String(url));
  return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error('fixture timed out');
};
const warn = () => {
  const e = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};
if (scenario === 'refresh-marked') {
  document.querySelector('body > style[data-name="saved"]').remove();
  document.querySelector('style[data-name="saved"]').setAttribute('clay', 'no-data no-dirty');
  document.querySelector('link').setAttribute('clay', 'no-data no-dirty');
}
const { boot } = await import(`${repo}/src/loader.js`);
await new Promise(resolve => boot(null, new URLSearchParams('plugins=undo&exclude=richclay,source'), resolve));
if (scenario === 'view') {
  assert.equal(window.clay.save, undefined);
  const tag = document.querySelector('style[data-name="saved"]');
  assert.equal(window.clay.style('saved', '.new { color: blue; }'), tag);
  assert.equal(tag.getAttribute('clay'), 'no-data no-dirty');
  assert.equal(posts.length, 0);
  console.log(JSON.stringify({ scenario, pass: true, synchronous: true, saveAbsent: true }));
  dom.window.close();
  process.exit(0);
}
const save = await import(`${repo}/src/core/save.js`);
const snap = await import(`${repo}/src/core/snapshot.js`);
const gate = await import(`${repo}/src/lib/dirty-gate.js`);
const Mutation = (await import(`${repo}/src/lib/mutation.js`)).default;
if (!bootCase) await until(() => save.baselineSettled());
assert.equal(warn(), false, 'fixture starts clean');
assert.equal(posts.length, 0);
window.clay.undo.clear();
const generation = gate.gateCaptureToken().gen;
const content = document.getElementById('content');
const batch = document.getElementById('batch');
const adopt = () => {
  const old = document.querySelector('style[data-name="saved"]');
  assert.equal(window.clay.style('saved', '.item { color: blue; }'), old);
  assert.equal(document.querySelectorAll('style[data-name="saved"]').length, 1);
  assert.equal(old.getAttribute('clay'), 'no-data no-dirty');
  const oldLink = document.querySelector('link');
  assert.equal(window.clay.style('/app.css?v=2#fresh'), oldLink);
  assert.equal(oldLink.getAttribute('href'), '/app.css?v=2#fresh');
};
const assertClean = () => {
  assert.equal(warn(), false);
  assert.equal(snap.captureForDirtyCheck(), save.getLastSavedDirty());
  assert.equal(snap.captureForComparison(), save.getLastSavedContents());
};
const assertCurrentSavedStyle = html => {
  assert.match(html, /color: blue/);
  assert.match(html, /app\.css\?v=2#fresh/);
};

if (scenario === 'refresh-marked') {
  adopt();
  window.clay.style('saved', '.item { color: purple; }');
  window.clay.style('/app.css?v=3');
  window.clay.undo.flush();
  assert.equal(window.clay.undo.canUndo, false);
  assertClean();
  await sleep(1800);
  assert.equal(posts.length, 0);
  assert.equal(gate.gateCaptureToken().gen, generation);
  const html = snap.captureForSaveAndComparison({ emitForSync: false }).forSave;
  assert.match(html, /color: purple/);
  assert.match(html, /app\.css\?v=3/);
} else if (scenario === 'late') {
  adopt();
  assertClean();
  window.clay.undo.flush();
  assert.equal(window.clay.undo.canUndo, false);
  await sleep(1800);
  assert.equal(posts.length, 0);
  assert.equal(gate.gateCaptureToken().gen, generation);
  assertCurrentSavedStyle(snap.captureForSaveAndComparison({ emitForSync: false }).forSave);
  content.textContent = 'A real edit';
  await until(() => posts.length === 1);
  await until(() => !warn());
  assertCurrentSavedStyle(posts[0]);
} else if (scenario === 'queued-edit') {
  content.textContent = 'Edit queued before style adoption';
  batch.textContent = 'Batch edit queued before style adoption';
  adopt();
  assert.equal(warn(), true);
  await until(() => posts.length === 1);
  await until(() => !warn());
  assert.match(posts[0], /Edit queued before style adoption/);
  assert.match(posts[0], /Batch edit queued before style adoption/);
  assertCurrentSavedStyle(posts[0]);
  await sleep(1800);
  assert.equal(posts.length, 1);
} else if (scenario === 'dirty') {
  save.suspendAutosave();
  Mutation.pause();
  document.querySelector('style').textContent = '.changed { color: green; }';
  document.querySelector('style').setAttribute('title', 'Live attributes differ from saved');
  Mutation.resume();
  content.textContent = 'Unsent ordinary edit';
  batch.textContent = 'Unsent batched edit';
  adopt();
  assert.equal(warn(), true);
  assert.match(save.getLastSavedDirty(), /Original/);
  assert.match(save.getLastSavedDirty(), /Batch original/);
  assert.doesNotMatch(save.getLastSavedDirty(), /Live attributes differ|color: red|color: green|color: pink/);
  await sleep(20);
  assert.equal(gate.pageMaybeDirty(), true, 'queued pre-pause user mutation survives');
  window.clay.undo.flush();
  assert.equal(window.clay.undo.canUndo, true);
  window.clay.undo.undo();
  assert.equal(content.textContent, 'Original');
  assert.equal(batch.textContent, 'Batch original');
  assertCurrentSavedStyle(snap.captureForSaveAndComparison({ emitForSync: false }).forSave);
  assertClean();
  assert.equal(posts.length, 0);
} else if (scenario.startsWith('flight-')) {
  save.suspendAutosave();
  content.textContent = 'Sent first edit';
  await sleep(20);
  holdResponse = true;
  const before = snap.captureForSaveAndComparison({ emitForSync: false }).forSave;
  const promise = scenario === 'flight-force' ? save.savePageForce() : save.savePage();
  await until(() => typeof release === 'function');
  assert.equal(posts.length, 1);
  assert.equal(posts[0], before);
  assert.match(posts[0], /color: red/);
  assert.match(posts[0], /app\.css\?v=1/);
  adopt();
  const later = scenario === 'flight-edit' || scenario === 'flight-failed';
  if (later) {
    content.textContent = 'Later unsent edit';
    batch.textContent = 'Later batch edit';
  }
  await sleep(20);
  if (scenario === 'flight-failed') responseStatus = 400;
  release();
  const result = await promise;
  assert.equal(result.ok, scenario !== 'flight-failed');
  if (scenario === 'flight-failed') {
    assert.equal(save.getLastSavedBytes(), null);
    assert.match(save.getLastSavedDirty(), /Original/);
    assert.equal(warn(), true);
  } else {
    assert.equal(save.getLastSavedBytes(), posts[0], 'disk bytes remain exactly the sent old CSS');
    assert.doesNotMatch(save.getLastSavedDirty(), /color: red|app\.css/);
    assert.match(save.getLastSavedDirty(), /Sent first edit/);
    assert.equal(warn(), later);
    if (later) {
      assert.equal(gate.pageMaybeDirty(), true);
      assert.doesNotMatch(save.getLastSavedDirty(), /Later unsent|Later batch/);
    } else assertClean();
  }
  holdResponse = false;
  if (!later) {
    save.resumeAutosave();
    await sleep(1800);
    assert.equal(posts.length, 1, 'no follow-up save caused by adoption');
    assertClean();
  }
} else if (scenario === 'editor') {
  const { createPageEditor, PAGE_EDITOR_CSS } = await import(`${repo}/src/page/editor.js`);
  const editor = createPageEditor(document.getElementById('mount'));
  const tags = document.querySelectorAll('style#page-editor-style');
  assert.equal(tags.length, 1);
  assert.equal(tags[0].textContent, PAGE_EDITOR_CSS);
  assert.equal(tags[0].dataset.name, 'page-editor-style');
  assert.equal(tags[0].getAttribute('clay'), 'no-dirty');
  assertClean();
  window.clay.undo.flush();
  assert.equal(window.clay.undo.canUndo, false);
  await sleep(1800);
  assert.equal(posts.length, 0);
  assert.equal(gate.gateCaptureToken().gen, generation);
  editor.destroy();
} else if (scenario === 'boot-adopt') {
  assert.equal(save.baselineSettled(), false);
  adopt();
  assertClean();
  content.textContent = 'Rendered during boot';
  await until(() => save.baselineSettled());
  assertClean();
  assert.match(save.getLastSavedDirty(), /Rendered during boot/);
  assert.equal(posts.length, 0);
} else if (scenario === 'boot-save-edit') {
  assert.equal(save.baselineSettled(), false);
  save.suspendAutosave();
  const promise = save.savePageForce();
  assert.equal((await promise).ok, true);
  adopt();
  batch.textContent = 'Batched edit after successful boot save';
  await until(() => save.baselineSettled());
  assert.equal(warn(), true, 'settle cannot absorb a later edit after a successful save');
  assert.doesNotMatch(save.getLastSavedDirty(), /Batched edit after/);
  assert.equal(posts.length, 1);
} else if (scenario === 'sync-install') {
  adopt();
  assertClean();
  Mutation.pause();
  document.querySelector('style').removeAttribute('clay');
  document.querySelector('style').textContent = '.disk { color: orange; }';
  document.querySelector('link').removeAttribute('clay');
  content.textContent = 'New disk content';
  Mutation.resume();
  const baseline = snap.captureForComparisonAndDirty({ flushUndo: false });
  save.setLastSavedBaselines(baseline.forComparison, baseline.forDirty);
  assertClean();
  content.textContent = 'Unsent after sync';
  window.clay.style('saved', '.disk { color: blue; }');
  window.clay.style('/app.css?v=3');
  assert.equal(warn(), true);
  assert.match(save.getLastSavedDirty(), /New disk content/);
  assert.doesNotMatch(save.getLastSavedDirty(), /Unsent after sync|color: orange/);
  Mutation.pause();
  content.textContent = 'New disk content';
  Mutation.resume();
  assertClean();
  Mutation.pause();
  batch.removeAttribute('clay');
  Mutation.resume();
  const val = snap.captureForDirtyCheck();
  save.setLastSavedContents(val);
  assertClean();
} else if (scenario === 'policy') {
  adopt();
  assertClean();
  document.getElementById('ordinary').setAttribute('clay', 'no-dirty');
  await sleep(20);
  assert.equal(warn(), true);
  assert.ok(gate.gateCaptureToken().gen > generation);
} else {
  throw new Error(`Unknown scenario: ${scenario}`);
}
console.log(JSON.stringify({ scenario, pass: true, posts: posts.length, warning: warn(), gateDirty: gate.pageMaybeDirty(), cssWarnings, fetchesStubbed: posts.length + reads.length }));
dom.window.close();
process.exit(0);
