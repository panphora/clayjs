export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const int = (n) => Math.floor(next() * n);
  const pick = (a) => a[int(a.length)];
  return { next, int, pick };
}
