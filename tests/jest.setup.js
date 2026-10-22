import { TextEncoder, TextDecoder } from "node:util";
import { TransformStream } from "node:stream/web";

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;
globalThis.TransformStream ??= TransformStream;
