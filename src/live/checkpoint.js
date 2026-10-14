// Checkpoints for clay.live stores. A live change never marks the page unsaved
// (live tags are outside the comparison domains), so nothing else would ever save
// it. This does: at a fixed deadline CHECKPOINT_MS after the first unsaved change,
// so a steady stream of moves still saves on time, and once more, right away,
// when the tab is hidden or closed.

export const CHECKPOINT_MS = 8000;
export const RETRY_MS = 1000;

/**
 * @param {object} deps
 * @param {() => boolean} deps.needsSave - is there a live change no accepted save holds
 * @param {() => boolean} deps.blocked - must a save wait (settling, conflict, agent editing)
 * @param {() => Promise<object>} deps.save - the checkpoint save; resolves { ok, msgType }
 * @param {() => unknown} deps.saveNow - the hide/close save, sent with keepalive
 */
export function createCheckpoints({ needsSave, blocked, save, saveNow, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let deadline = null;
  let timer = null;
  let running = false;

  function arm(at) {
    deadline = at;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(run, Math.max(0, at - now()));
  }

  function disarm() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    deadline = null;
  }

  async function run() {
    timer = null;
    deadline = null;
    if (!needsSave()) return;
    if (blocked()) {
      arm(now() + RETRY_MS);
      return;
    }
    running = true;
    let result = null;
    try {
      result = await save();
    } catch {
      result = null;
    } finally {
      running = false;
    }
    if (!needsSave()) return;
    // A save skipped because another was on the wire is retried soon; anything
    // else waits a full interval, so a failing host is not asked every second.
    arm(now() + (result && !result.ok && result.msgType === "skipped" ? RETRY_MS : CHECKPOINT_MS));
  }

  return {
    // A live change happened. The first one after a save starts the clock; later
    // ones do not move it.
    changed() {
      if (deadline === null && !running) arm(now() + CHECKPOINT_MS);
    },
    // The tab is going away or out of sight: save now if anything is unsaved.
    flush() {
      if (running || !needsSave() || blocked()) return;
      disarm();
      saveNow();
    },
    get deadline() {
      return deadline;
    },
  };
}
