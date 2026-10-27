// The toast stack is fetched the first time a toast shows, so the page editor does
// not download it to become ready. Calls made before it arrives run in order once it has.
let loading = null;
const load = () => (loading ??= import("./toast.js"));
const later = (name) => (...args) => { load().then((m) => (name ? m[name] : m.default)(...args)); };

export default later(null);
export const toastPersistent = later("toastPersistent");
export const dismissPersistent = later("dismissPersistent");
