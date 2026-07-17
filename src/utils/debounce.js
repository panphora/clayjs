// debounce.js
function debounce(callback, delay) {
  let timeoutId;
  let pendingResolvers = [];

  return function (...args) {
    const ctx = this;
    clearTimeout(timeoutId);

    return new Promise((resolve) => {
      pendingResolvers.push(resolve);

      timeoutId = setTimeout(() => {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        Promise.resolve(callback.apply(ctx, args))
          .then(value => { for (const r of resolvers) r(value); });
      }, delay);
    });
  };
}

export default debounce;
