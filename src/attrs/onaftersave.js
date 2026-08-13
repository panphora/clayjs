/**
 * [onaftersave] Custom Attribute
 *
 * Runs inline JavaScript after a successful save.
 * Only fires on 'clay:save-saved' events (not on error/offline).
 *
 * Usage:
 *   <span clay="no-trigger-autosave" onaftersave="this.innerText = event.detail.msg"></span>
 *   <link href="styles.css" onaftersave="cacheBust(this)">
 *
 * MARK WHAT YOU MUTATE `no-trigger-autosave`.
 * These handlers run after the save baseline has been taken, so anything they write
 * to the live DOM reads as a change the user made and leaves the page permanently
 * dirty: autosave loops, and the close-tab warning never clears. The token strips
 * the element from every comparison capture, which is what stops that.
 * `cacheBust()` marks its own target, so the second example needs nothing. A handler
 * that mutates some OTHER element has to mark that element itself.
 *
 * (The alternative — re-reading the whole live DOM after handlers run — is what
 * clayjs used to do, and it silently discarded anything typed during a save.)
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
