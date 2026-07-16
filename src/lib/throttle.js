function throttle(callback, delay, executeFirst = true) {
  let lastCall = executeFirst ? 0 : Date.now();
  let timeoutId = null;
  let pendingResolvers = [];

  return function (...args) {
    const ctx = this;
    const now = Date.now();
    const remaining = delay - (now - lastCall);

    return new Promise((resolve) => {
      if (remaining <= 0) {
        clearTimeout(timeoutId);
        timeoutId = null;
        lastCall = now;

        const resolvers = pendingResolvers.concat(resolve);
        pendingResolvers = [];

        Promise.resolve(callback.apply(ctx, args))
          .then(value => { for (const r of resolvers) r(value); });
      } else {
        pendingResolvers.push(resolve);

        if (!timeoutId) {
          timeoutId = setTimeout(() => {
            lastCall = Date.now();
            timeoutId = null;
            const resolvers = pendingResolvers;
            pendingResolvers = [];

            Promise.resolve(callback.apply(ctx, args))
              .then(value => { for (const r of resolvers) r(value); });
          }, remaining);
        }
      }
    });
  };
}

export default throttle;
