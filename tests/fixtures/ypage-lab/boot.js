import { storeOf } from "/v1/src/plugins/live.js";
import { startLab } from "./lab.js";

await window.clay.ready;
window.clay.live("page");
window.__lab = startLab({ root: document.getElementById("lab-root"), store: storeOf("page") });
