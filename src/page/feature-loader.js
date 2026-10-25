// Optional editor features load the first time a document needs them. One import per
// feature; a caller's abort stops only its own wait; dispose() makes late results inert.
export function createFeatureLoader({ load, install, reportError = (error) => console.error("clayjs: an editor feature failed to load", error) }) {
  const installed = new Map();
  const pending = new Map();
  let disposed = false;

  function ensure(id, { signal } = {}) {
    if (disposed) return Promise.reject(new Error(`page: feature loader disposed before ${id}`));
    if (installed.has(id)) return Promise.resolve(installed.get(id));
    let shared = pending.get(id);
    if (!shared) {
      shared = load(id).then((mod) => {
        if (disposed) return null;
        const feature = install(id, mod);
        installed.set(id, feature);
        return feature;
      });
      shared.catch((error) => { if (!disposed) reportError(error); }).finally(() => pending.delete(id));
      pending.set(id, shared);
    }
    if (!signal) return shared;
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      shared.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  return {
    ensure,
    has: (id) => installed.has(id),
    dispose() {
      disposed = true;
      for (const feature of installed.values()) feature?.dispose?.();
      installed.clear();
      pending.clear();
    },
  };
}
