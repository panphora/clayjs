import cookie from "../lib/cookie.js";
import query from "../lib/query.js";
import { hasSaveToken } from "./host-attrs.js";

// Edit-mode precedence: an explicit ?editmode=true|false URL param wins, then an
// opt-in window.clayEditMode global (with the legacy window.__hyperclayEditMode
// still honored as a fallback — htmlclay injects it today), then a save token the
// host put on the root, then the platform's isAdminOfCurrentResource cookie. The
// global is for standalone uses (demos, htmlclay, any self-saving file) that are
// always editable and have no owner cookie; setting it before clayjs loads turns
// on the edit-only modules.
//
// The token sits above the cookie because it is the stronger claim and often the
// only one visible: the host minted it for this response and nothing else, while
// the cookie is ambient. A sandboxed document cannot read the cookie at all, so
// without this rung a host that sandboxes its own documents can hand one a save
// token and still watch it render read-only.
let forcedEditMode = null;
if (typeof window !== "undefined") {
  if (window.clayEditMode != null) {
    forcedEditMode = Boolean(window.clayEditMode);
  } else if (window.__hyperclayEditMode != null) {
    forcedEditMode = Boolean(window.__hyperclayEditMode);
  }
}

const isEditMode = query.editmode
  ? query.editmode === "true" // takes precedence over the global, token and cookie
  : forcedEditMode != null
    ? forcedEditMode
    : hasSaveToken() || Boolean(cookie.get("isAdminOfCurrentResource"));

const isOwner = Boolean(cookie.get("isAdminOfCurrentResource"));

export {
  isEditMode,
  isOwner
}
