// Browser storage for one document. Two documents on one origin (every file on a
// hyperclay.com subdomain) otherwise share every key an app writes.
function area(name) {
  const memory = new Map();
  const prefix = () => `clay:doc:${location.pathname}:`;
  const backend = () => { try { return window[name] || null; } catch { return null; } };
  return {
    get(key) {
      const k = prefix() + key;
      try { const raw = backend()?.getItem(k); if (raw != null) return JSON.parse(raw); } catch {}
      return memory.has(k) ? memory.get(k) : undefined;
    },
    set(key, value) {
      const k = prefix() + key;
      memory.set(k, value);
      try { backend().setItem(k, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) {
      const k = prefix() + key;
      memory.delete(k);
      try { backend()?.removeItem(k); } catch {}
    },
  };
}

export const storage = { local: area("localStorage"), session: area("sessionStorage") };
