// The CMS shell, toggle, inline layer and ghost rows, with their --mirk-* tokens pinned
// to Bevel and the Bevel system mono face. The CMS keeps its own stylesheet and its
// own light/dark switching.
import { installSkin } from "../ui/vendor-skin.js";
import { CSS } from "../ui/skins/cms.js";

export { cms, default } from "../vendor/hypercms.vendor.js";

installSkin("cms", CSS);
