/**
 * [onaftersave] Custom Attribute
 *
 * Runs inline JavaScript after a successful save.
 * Only fires on 'clay:save-saved' events (not on error/offline).
 *
 * Usage:
 *   <span onaftersave="this.innerText = event.detail.msg"></span>
 *   <link href="styles.css" onaftersave="cacheBust(this)">
 *
 * The event.detail object contains:
 *   - status: 'saved'
 *   - msg: string (e.g., 'Saved')
 *   - timestamp: number (Date.now())
 */

function broadcast(e) {
  const status = e.type.replace('clay:save-', '');
  const detail = { ...e.detail, status };

  document.querySelectorAll('[onaftersave]').forEach(el => {
    try {
      const event = new CustomEvent('aftersave', { detail });
      const handler = new Function('event', el.getAttribute('onaftersave'));
      handler.call(el, event);
    } catch (err) {
      console.error('[onaftersave] Error in handler:', err);
    }
  });
}

function init() {
  document.addEventListener('clay:save-saved', broadcast);
}

init();

export default init;
