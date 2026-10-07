window.runLineageScenario = async (expect) => {
  window.clayEditMode = true;
  const originalFetch = window.fetch;
  const originalEventSource = window.EventSource;
  const streams = [];
  const savedBodies = [];
  const unexpected = [];
  const response = (body) => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
  window.fetch = (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = (options.method || 'GET').toUpperCase();
    if (url.origin === location.origin) {
      if (url.pathname === '/_/meta') {
        return response({ spec: 1, extensions: ['sync', 'conditional'], document: { etag: 'E0' } });
      }
      if (method === 'POST' && url.pathname === '/_/save') {
        savedBodies.push(String(options.body || ''));
        return response({ msg: 'Saved' });
      }
      if (method === 'POST' && url.pathname === '/_/sync') return response({ success: true });
    }
    unexpected.push(`${method} ${url.href}`);
    return Promise.reject(new Error(`Unexpected fixture request: ${method} ${url.href}`));
  };
  window.EventSource = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 0;
      streams.push(this);
    }
    close() { this.readyState = 2; }
  };
  let sync;
  let conflicts;
  let singleton;
  try {
    const live = await import('/src/sync/live-sync.js');
    ({ conflicts, liveSync: singleton } = live);
    singleton.stop();
    await import('/src/core/admin-attrs.js');
    await import('/src/core/admin-contenteditable.js');
    await import('/src/core/persist.js');
    await import('/src/core/unsaved-warning.js');
    const snapshot = await import('/src/core/snapshot.js');
    const gate = await import('/src/lib/dirty-gate.js');
    const save = await import('/src/core/save.js');
    const etag = await import('/src/core/etag.js');
    const { protectionOf } = await import('/src/sync/conflict-footprints.js');
    const { buildRecovery } = await import('/src/core/conflict-download.js');
    const { revertConflicts } = await import('/src/sync/conflict-revert.js');
    await etag.seedEtag();
    etag.recordEtag('E0');
    document.documentElement.removeAttribute('autosave');
    document.documentElement.setAttribute('savestatus', 'saved');
    const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
    sync = new live.LiveSync();
    sync.lane = 'live';
    sync._requestFrame = () => null;
    const base = '<p>One quick fox.</p><p>Two wild dogs.</p><p>Two brisk dogs.</p><aside>note</aside>';
    document.body.innerHTML = base;
    const { forComparison, forDirty } = snapshot.captureForComparisonAndDirty({ flushUndo: false });
    save.setLastSavedBaselines(forComparison, forDirty);
    save.setUnsavedChanges(false);
    await Promise.resolve();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    sync.lastHtml = captureFrame();
    document.body.innerHTML = base.replace('quick', 'slow');
    await Promise.resolve();
    const remote = base.replace('quick', 'fast');
    const first = sync.lastHtml.replace(`<body>${base}</body>`, `<body>${remote}</body>`);
    expect(first).not.to.equal(sync.lastHtml);
    await sync._doApplyUpdate(first, 5, null);
    expect(document.body.innerHTML).to.equal(remote);
    expect(conflicts.size).to.equal(1);
    const A = conflicts.list()[0].id;
    sync.lastHtml = captureFrame();
    const old = document.querySelector('aside').previousElementSibling;
    old.firstChild.data = 'Two lazy dogs.';
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gate.pageMaybeDirty(), 'native mutation feed delivered the local edit').to.equal(true);
    const secondRemote = sync.lastHtml.replace('Two brisk dogs.', 'Two wild dogs.');
    const parser = new DOMParser();
    const secondDocument = parser.parseFromString(secondRemote, 'text/html');
    const baseDocument = parser.parseFromString(sync.lastHtml, 'text/html');
    expect(secondDocument.head.innerHTML).to.equal(baseDocument.head.innerHTML);
    expect(secondDocument.querySelector('aside').previousElementSibling.textContent).to.equal('Two wild dogs.');
    await sync._doApplyUpdate(secondRemote, 6, null);
    expect(conflicts.size).to.equal(2);
    const B = conflicts.list().find((record) => record.id !== A).id;
    const record = conflicts.get(B);
    const recovery = record.recovery;
    const liveNodes = [...recovery.subject.live];
    const localRoot = conflicts.recoveryOf(B).root;
    const mine = localRoot.outerHTML;
    const normalize = (html) => html.replace(/"savedAt":"[^"]*"/, '"savedAt":""');
    window.clay = { ...window.clay, conflicts };
    const download = normalize(buildRecovery([record]).html);
    const retag = async (from, to, suffix = '') => {
      sync.lastHtml = captureFrame();
      const incoming = sync.lastHtml.replace(
        `<${from}>Two wild dogs.</${from}><aside>note</aside>`,
        `<${to}>Two wild dogs.</${to}><aside>note${suffix}</aside>`,
      );
      expect(incoming).not.to.equal(sync.lastHtml);
      await sync._doApplyUpdate(incoming, 7, null);
      return document.querySelector(to);
    };
    const h3 = await retag('p', 'h3');
    expect(old.isConnected).to.equal(false);
    expect(h3.isConnected).to.equal(true);
    expect(protectionOf(record).nodes).to.deep.equal([h3]);
    const h2 = await retag('h3', 'h2', '!');
    expect(h3.isConnected).to.equal(false);
    expect(h2.isConnected).to.equal(true);
    expect(protectionOf(record).nodes).to.deep.equal([h2]);
    expect(record.recovery).to.equal(recovery);
    expect(record.recovery.subject.live).to.deep.equal(liveNodes);
    expect(conflicts.recoveryOf(B).root).to.equal(localRoot);
    expect(localRoot.outerHTML).to.equal(mine);
    expect(normalize(buildRecovery([record]).html)).to.equal(download);
    expect(download).to.include('Two lazy dogs.');
    expect(download).not.to.include('<h2>Two wild dogs.</h2>');
    const reverted = await revertConflicts([A]);
    expect(reverted.revertedIds).to.deep.equal([A]);
    expect(reverted.saveResult.ok).to.equal(true);
    const expected = '<p>One slow fox.</p><p>Two wild dogs.</p><h2>Two wild dogs.</h2><aside>note!</aside>';
    expect(document.body.innerHTML).to.equal(expected);
    expect(savedBodies).to.have.length(1);
    expect(savedBodies[0]).to.include(expected);
    expect(conflicts.list().map((entry) => entry.id)).to.deep.equal([B]);
    expect(await revertConflicts([B])).to.deep.equal({ revertedIds: [], blockedIds: [B], saveResult: null });
    expect(document.querySelector('h2')).to.equal(h2);
    expect(savedBodies).to.have.length(1);
    conflicts.acknowledge([B], { reason: 'accepted' });
    expect(conflicts.size).to.equal(0);
    expect(document.querySelector('h2')).to.equal(h2);
    expect(unexpected).to.deep.equal([]);
  } finally {
    sync?.stop();
    singleton?.stop();
    if (conflicts) conflicts.acknowledge(conflicts.list().map((record) => record.id), { reason: 'accepted' });
    for (const stream of streams) stream.close();
    window.fetch = originalFetch;
    window.EventSource = originalEventSource;
  }
};
