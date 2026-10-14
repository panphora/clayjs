import { TextEncoder, TextDecoder } from "node:util";

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;
