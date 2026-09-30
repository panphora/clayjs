// richclay's toolbar, menus, floating toolbar and link dialog, raised above the host
// page by its skin. The vendor bundle is unchanged; the skin goes in first, so the
// editor never draws a frame of chrome the page can repaint.
import { installSkin } from "../ui/vendor-skin.js";
import { CSS, ROOTS } from "../ui/skins/richclay.js";
import { RichClay } from "../vendor/richclay.vendor.js";

installSkin("richclay", CSS, { roots: ROOTS });

export { RichClay };
export default RichClay;
