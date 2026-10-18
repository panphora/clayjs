// Link addresses the editor will store. #fragments, same-site paths, http(s),
// mailto and tel pass; a bare domain gets https:// and a bare address mailto:.
// Any other scheme (javascript:, data:, vbscript:, file:) is refused with null.
const SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

export function safeHref(raw) {
  const s = String(raw ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!s) return null;
  if (s.startsWith("#") || (s.startsWith("/") && !s.startsWith("//"))) return s;
  if (SAFE_SCHEME.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (/^(\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(s)) return `https://${s.replace(/^\/\//, "")}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  return null;
}

export const isUrlText = (text) => !/\s/.test(text.trim()) && safeHref(text) !== null && /[.:/]/.test(text);
