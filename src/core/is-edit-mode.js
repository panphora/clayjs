import cookie from "../lib/cookie.js";
import query from "../lib/query.js";

// Edit-mode precedence: an explicit ?editmode=true|false URL param wins, then an
// opt-in window.clayEditMode global (with the legacy window.__hyperclayEditMode
// still honored as a fallback — htmlclay injects it today), then the platform's
// isAdminOfCurrentResource cookie. The global is for standalone uses (demos,
// htmlclay, any self-saving file) that are always editable and have no owner
// cookie; setting it before clayjs loads turns on the edit-only modules.
let forcedEditMode = null;
if (typeof window !== "undefined") {
  if (window.clayEditMode != null) {
    forcedEditMode = Boolean(window.clayEditMode);
  } else if (window.__hyperclayEditMode != null) {
    forcedEditMode = Boolean(window.__hyperclayEditMode);
  }
}

const isEditMode = query.editmode
  ? query.editmode === "true" // takes precedence over the global and cookie
  : forcedEditMode != null
    ? forcedEditMode
    : Boolean(cookie.get("isAdminOfCurrentResource"));

const isOwner = Boolean(cookie.get("isAdminOfCurrentResource"));

export {
  isEditMode,
  isOwner
}
