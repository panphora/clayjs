import { jest } from '@jest/globals';
import { beginApply, completeApply, conflicts } from '../../src/sync/conflicts.js';
import { beginLineageCapture, protectionOf, protectionGeneration, captureFootprintWitnesses, footprintWitnessesValid } from '../../src/sync/conflict-footprints.js';

const frames = [];
const start = () => {
  const frame = beginLineageCapture(conflicts.list());
  frames.push(frame);
  return frame;
};
const raw = (node, key = 'word') => ({
  kind: 'text',
  recovery: { key, text: {}, subject: { live: [node], nodeType: 1, local: [] } },
});
const install = (reports, ticket = 1) => {
  const id = beginApply({ source: 'peer', domain: 'sync', root: document.documentElement.cloneNode(true) });
  return completeApply(id, reports, { ticket }).map((key) => conflicts.get(key));
};
const replace = (old, tag = 'h3') => {
  const fresh = document.createElement(tag);
  fresh.textContent = old.textContent;
  old.replaceWith(fresh);
  return fresh;
};
const entry = (from, to, kind = 'replaced') => ({ from, to: Array.isArray(to) ? to : [to], kind, complete: kind !== 'unknown' });
const deliver = (frame, entries, conflicts = [], status = 'complete') => {
  const lineage = { version: 1, root: document.documentElement, status, entries };
  const report = { conflicts, lineage };
  frame.lineage.onResult(lineage, report);
  frame.returned();
  return report;
};
const finish = (frame, report) => {
  frame.prepareComplete(report, conflicts.list());
  frame.finish(conflicts.list());
};

beforeEach(() => { document.body.innerHTML = '<section><p>same</p><p>same</p></section><aside>outside</aside>'; });
afterEach(() => {
  for (const frame of frames.splice(0)) frame.finish(conflicts.list());
  conflicts.acknowledge(conflicts.list().map((r) => r.id), { reason: 'accepted' });
});

test('exact identities compose across duplicate text and two retags with an unrelated edit', () => {
  const old = document.querySelector('p:last-child');
  const duplicate = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const recovery = rec.recovery;
  for (const tag of ['h3', 'h2']) {
    const before = document.querySelector('p:last-child, h3');
    const frame = start();
    expect(frame.lineage.elements).toContain(before);
    const fresh = replace(before, tag);
    document.querySelector('aside').textContent += '!';
    const report = deliver(frame, [entry(before, fresh)]);
    expect(protectionOf(rec).nodes).toEqual([fresh]);
    expect(protectionOf(rec).nodes[0]).not.toBe(duplicate);
    expect(rec.recovery).toBe(recovery);
    expect(rec.recovery.subject.live[0]).toBe(old);
    finish(frame, report);
  }
  expect(document.body.innerHTML).toBe('<section><p>same</p><h2>same</h2></section><aside>outside!!</aside>');
});

test.each(['removed', 'unknown', 'split', 'combined', 'missing'])('%s cannot certify the surviving leaf, but a complete ancestor protects its full region', (kind) => {
  const old = document.querySelector('p');
  const parent = old.parentElement;
  const [rec] = install([raw(old)]);
  const frame = start();
  const fresh = replace(old);
  const entries = [entry(parent, parent, 'retained')];
  if (kind !== 'missing') entries.push(entry(old, kind === 'removed' || kind === 'unknown' ? [] : [fresh], kind));
  const report = deliver(frame, entries);
  expect(protectionOf(rec).nodes).toEqual([parent]);
  expect(protectionOf(rec).status).toBe('unknown');
  expect(protectionOf(rec).nodes).not.toContain(fresh);
  finish(frame, report);
});

test('a split descendant under a surviving wrapper protects the proved outer ancestor', () => {
  document.body.innerHTML = '<main><section><b>alpha</b></section><aside></aside></main>';
  const old = document.querySelector('section');
  const ancestor = document.querySelector('main');
  const [rec] = install([raw(old)]);
  const frame = start();
  document.querySelector('aside').append(old.firstChild);
  const report = deliver(frame, [entry(old, [], 'unknown'), entry(ancestor, ancestor, 'retained')]);
  expect(old.isConnected).toBe(true);
  expect(protectionOf(rec).nodes).toEqual([ancestor]);
  finish(frame, report);
});

test.each(['incomplete', 'missing callback', 'foreign target', 'duplicate entry', 'no ancestor'])('%s uses document fallback', (kind) => {
  const old = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const frame = start();
  const fresh = replace(old);
  if (kind === 'missing callback') frame.returned();
  else {
    const entries = kind === 'foreign target' ? [entry(old, document.implementation.createHTMLDocument('').body)] :
      kind === 'duplicate entry' ? [entry(old, fresh), entry(old, fresh)] : [];
    deliver(frame, entries, [], kind === 'incomplete' ? 'incomplete' : 'complete');
  }
  expect(protectionOf(rec).nodes).toEqual([document.documentElement]);
  expect(protectionOf(rec).status).toBe('unknown');
});

test.each(['text', 'attribute', 'equal clone', 'descendant move', 'target removal'])('external %s invalidates a transferred witness before another apply', (kind) => {
  const old = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const frame = start();
  const fresh = replace(old);
  finish(frame, deliver(frame, [entry(old, fresh)]));
  if (kind === 'text') fresh.firstChild.data = 'changed';
  if (kind === 'attribute') fresh.title = 'changed';
  if (kind === 'equal clone') fresh.replaceChild(fresh.firstChild.cloneNode(), fresh.firstChild);
  if (kind === 'descendant move') document.querySelector('aside').append(fresh.firstChild);
  if (kind === 'target removal') fresh.remove();
  expect(protectionOf(rec).nodes).toEqual([document.documentElement]);
  const second = start();
  expect(second.lineage.elements).not.toContain(fresh);
});

test('a subsequent retained entry cannot restore a witness broken outside applies', () => {
  const old = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const frame = start();
  const fresh = replace(old);
  finish(frame, deliver(frame, [entry(old, fresh)]));
  fresh.firstChild.data = 'changed';
  const later = start();
  finish(later, deliver(later, [entry(fresh, fresh, 'retained')]));
  expect(protectionOf(rec).nodes).toEqual([document.documentElement]);
});

test('all provisional raws survive folding to a different representative', () => {
  const parent = document.querySelector('section');
  const child = parent.firstChild;
  const collision = (node, path, key) => ({ kind: 'structure', detail: 'insert-collision', recovery: {
    key, applied: true, subject: { live: [node], nodeType: 1, local: [path], merged: [path] },
    structure: { localAction: 'inserted', fragmentKind: 'element' },
  } });
  const childRaw = collision(child, [1, 0, 0], 'child');
  const parentRaw = collision(parent, [1, 0], 'parent');
  const first = start();
  const born = deliver(first, [], [childRaw, parentRaw]);
  const second = start();
  expect(second.lineage.elements).toEqual(expect.arrayContaining([parent, child]));
  const fresh = document.createElement('article');
  fresh.innerHTML = parent.innerHTML;
  parent.replaceWith(fresh);
  finish(second, deliver(second, [entry(parent, fresh), entry(child, fresh.firstChild)]));
  const [rec] = install(born.conflicts);
  expect(conflicts.size).toBe(1);
  expect(rec).toBe(parentRaw);
  expect(rec.rawReports).toEqual([parentRaw, childRaw]);
  finish(first, born);
  expect(protectionOf(rec).nodes).toEqual(expect.arrayContaining([fresh, fresh.firstChild]));
  expect(rec.recovery.subject.live[0]).toBe(parent);
  conflicts.acknowledge([rec.id], { reason: 'accepted' });
  expect(protectionOf(rec)).toBeNull();
  const third = start();
  expect(third.lineage.elements).toHaveLength(0);
});

test('a grouped record protects every raw target', () => {
  const olds = [...document.querySelectorAll('p')];
  const [rec] = install(olds.map((node) => raw(node, 'shared')));
  expect(rec.rawReports).toHaveLength(2);
  const frame = start();
  const fresh = olds.map((node) => replace(node));
  finish(frame, deliver(frame, olds.map((node, i) => entry(node, fresh[i]))));
  expect(protectionOf(rec).nodes).toEqual(fresh);
});

test('multiple original raw regions remain a union before any replacement', () => {
  const nodes = [...document.querySelectorAll('p')];
  const raws = nodes.map((node) => raw(node, 'shared'));
  const frame = start();
  const report = deliver(frame, [], raws);
  const [rec] = install(raws);
  finish(frame, report);
  expect(rec.rawReports).toHaveLength(2);
  expect(protectionOf(rec).nodes).toEqual(nodes);
});

test('a rejected earlier wait broadens later composed records and clears provisional references', () => {
  const old = document.querySelector('p');
  const bornRaw = raw(old);
  const first = start();
  deliver(first, [], [bornRaw]);
  const second = start();
  const fresh = replace(old);
  finish(second, deliver(second, [entry(old, fresh)]));
  first.invalidate(conflicts.list());
  expect(protectionOf(bornRaw).nodes).toEqual([document.documentElement]);
  first.finish(conflicts.list());
  expect(protectionOf(bornRaw)).toBeNull();
  const next = start();
  expect(next.lineage.elements).toHaveLength(0);
});

test('acknowledgement during a wait cannot resurrect the weak state on failure', () => {
  const [rec] = install([raw(document.querySelector('p'))]);
  const frame = start();
  conflicts.acknowledge([rec.id], { reason: 'accepted' });
  frame.invalidate(conflicts.list());
  frame.finish(conflicts.list());
  expect(protectionOf(rec)).toBeNull();
  expect(start().lineage.elements).toHaveLength(0);
});

test('nested synchronous applies refuse order instead of certifying the outer snapshot', () => {
  const old = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const outer = start();
  const inner = start();
  const fresh = replace(old);
  finish(inner, deliver(inner, [entry(old, fresh)]));
  finish(outer, deliver(outer, [entry(old, fresh)]));
  expect(protectionOf(rec).nodes).toEqual([document.documentElement]);
});

test('generation changes for a clean capture without ledger changes', () => {
  const [rec] = install([raw(document.querySelector('p'))]);
  const before = protectionGeneration();
  const frame = start();
  expect(protectionGeneration()).toBeGreaterThan(before);
  expect(conflicts.list()).toEqual([rec]);
  finish(frame, deliver(frame, [entry(rec.recovery.subject.live[0], rec.recovery.subject.live[0], 'retained')]));
});

test('witnesses are inert and include text identity, template descendants, and native field values', () => {
  let constructions = 0;
  if (!customElements.get('x-lineage-card')) customElements.define('x-lineage-card', class extends HTMLElement { constructor() { super(); constructions++; } });
  document.body.innerHTML = '<x-lineage-card><input value="one"><template><b>inside</b></template></x-lineage-card>';
  const card = document.querySelector('x-lineage-card');
  const before = constructions;
  const clone = jest.spyOn(card, 'cloneNode');
  const witnesses = captureFootprintWitnesses([card]);
  expect(footprintWitnessesValid(witnesses)).toBe(true);
  expect(constructions).toBe(before);
  expect(clone).not.toHaveBeenCalled();
  document.querySelector('input').value = 'two';
  expect(footprintWitnessesValid(witnesses)).toBe(false);
  const second = captureFootprintWitnesses([card]);
  card.querySelector('template').content.querySelector('b').firstChild.data = 'changed';
  expect(footprintWitnessesValid(second)).toBe(false);
  clone.mockRestore();
});

test.each(['truthy complete', 'null entry', 'fake target'])('malformed %s never narrows protection', (kind) => {
  const old = document.querySelector('p');
  const [rec] = install([raw(old)]);
  const frame = start();
  const fresh = replace(old);
  const entries = kind === 'null entry'
    ? [null]
    : kind === 'fake target'
      ? [{ from: old, to: [{ nodeType: 1, ownerDocument: document }], kind: 'replaced', complete: true }]
      : [{ from: old, to: [fresh], kind: 'replaced', complete: 'yes' }];
  let report;
  expect(() => { report = deliver(frame, entries); }).not.toThrow();
  expect(protectionOf(rec).nodes).toEqual([document.documentElement]);
  expect(protectionOf(rec).nodes).not.toContain(fresh);
  expect(rec.recovery.subject.live[0]).toBe(old);
  finish(frame, report);
});
