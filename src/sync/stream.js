const START_TIMEOUT = 5000;
const HIDDEN_DELAY = 5000;
const PING_INTERVAL = 15000;

export class SyncStream extends EventTarget {
  constructor(url, { shared = false, documentURL, lane } = {}) {
    super();
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this._shared = shared && typeof SharedWorker === 'function';
    this._documentURL = documentURL;
    this._lane = lane;
    this._since = 0;
    this._closed = false;
    this._suspended = false;
    this._repair = false;
    this._worker = null;
    this._source = null;
    this._visibility = () => {
      clearTimeout(this._hiddenTimer);
      if (document.hidden) {
        this._worker?.port.postMessage({ v: 1, type: 'hidden' });
        this._hiddenTimer = setTimeout(() => this._suspend(), HIDDEN_DELAY);
      } else {
        if (this._suspended) this._resume();
        else if (this._worker) {
          this._worker.port.postMessage({ v: 1, type: 'visible' });
        }
      }
    };
    this._pagehide = () => this._suspend();
    this._pageshow = () => { if (!document.hidden) this._resume(); };
    document.addEventListener('visibilitychange', this._visibility);
    window.addEventListener('pagehide', this._pagehide);
    window.addEventListener('pageshow', this._pageshow);
    this._open();
    if (document.hidden) this._visibility();
  }

  _emit(type, data) {
    if (this._closed) return;
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
    this.dispatchEvent(event);
    this[`on${type}`]?.(event);
  }

  _open() {
    if (this._closed || this._suspended) return;
    this.readyState = 0;
    if (!this._shared) return this._openDirect();
    try {
      const worker = new SharedWorker(new URL('/_/sync/worker.js', window.location.origin).href, 'clay-sync');
      this._worker = worker;
      let lastReply = Date.now();
      worker.onerror = () => {
        if (this._worker !== worker) return;
        this._shared = false;
        this._repair = true;
        this._reopen();
      };
      this._startTimer = setTimeout(worker.onerror, START_TIMEOUT);
      worker.port.onmessage = ({ data }) => {
        if (this._worker !== worker || data?.v !== 1) return;
        lastReply = Date.now();
        if (['status', 'pong', 'cursor', 'frame', 'gone'].includes(data.type)) clearTimeout(this._startTimer);
        if (data.type === 'status') {
          if (data.state === 'open') {
            this.readyState = 1;
            this._emit('open');
          } else if (data.state === 'connecting') {
            this.readyState = 0;
            this._emit('error');
          }
        } else if (data.type === 'cursor') {
          clearTimeout(this._startTimer);
          if (Number.isSafeInteger(data.seq)) this._since = Math.max(this._since, data.seq);
          this._emit('cursor', JSON.stringify({ ...data, resync: data.resync === true || this._repair }));
          this._repair = false;
        } else if (data.type === 'frame' && typeof data.data === 'string') {
          this._remember(data.data);
          this._emit('message', data.data);
        } else if (data.type === 'gone') {
          this.readyState = 2;
          this._emit('error');
          this.close();
        }
      };
      worker.port.start();
      worker.port.postMessage({ v: 1, type: document.hidden ? 'hidden' : 'visible' });
      worker.port.postMessage({ v: 1, type: 'subscribe', document: this._documentURL, lane: this._lane, since: this._since });
      this._pingTimer = setInterval(() => {
        if (this._worker !== worker) return;
        if (Date.now() - lastReply > PING_INTERVAL * 3) {
          this._repair = true;
          this._reopen();
        } else worker.port.postMessage({ v: 1, type: 'ping' });
      }, PING_INTERVAL);
    } catch {
      this._shared = false;
      this._reopen();
    }
  }

  _openDirect() {
    const source = new EventSource(this.url);
    this._source = source;
    source.onopen = () => {
      if (this._source !== source) return;
      this.readyState = 1;
      this._emit('open');
      if (this._repair) {
        this._repair = false;
        this._emit('cursor', JSON.stringify({ resync: true }));
      }
    };
    source.onerror = () => {
      if (this._source !== source) return;
      this.readyState = source.readyState;
      this._emit('error');
    };
    source.onmessage = event => {
      if (this._source !== source) return;
      this._remember(event.data);
      this._emit('message', event.data);
    };
    for (const type of ['cursor', 'presence']) {
      source.addEventListener(type, event => {
        if (this._source === source) this._emit(type, event.data);
      });
    }
  }

  _remember(data) {
    try {
      const { seq } = JSON.parse(data);
      if (Number.isSafeInteger(seq)) this._since = Math.max(this._since, seq);
    } catch {}
  }

  _disconnect() {
    clearTimeout(this._startTimer);
    clearInterval(this._pingTimer);
    if (this._worker) {
      const worker = this._worker;
      this._worker = null;
      worker.onerror = null;
      worker.port.onmessage = null;
      try { worker.port.postMessage({ v: 1, type: 'unsubscribe' }); } catch {}
      worker.port.close();
    }
    if (this._source) {
      this._source.close();
      this._source = null;
    }
  }

  _reopen() {
    this._disconnect();
    this._open();
  }

  _suspend() {
    clearTimeout(this._hiddenTimer);
    if (this._closed || this._suspended) return;
    this._suspended = true;
    this._repair = true;
    this.readyState = 0;
    this._disconnect();
  }

  _resume() {
    clearTimeout(this._hiddenTimer);
    if (this._closed || !this._suspended) return;
    this._suspended = false;
    this._open();
  }

  close() {
    this._closed = true;
    this.readyState = 2;
    clearTimeout(this._hiddenTimer);
    this._disconnect();
    document.removeEventListener('visibilitychange', this._visibility);
    window.removeEventListener('pagehide', this._pagehide);
    window.removeEventListener('pageshow', this._pageshow);
  }
}
