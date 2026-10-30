# Follow-ups

Findings with no user story yet: the trigger, the effect, and when to look again.

- `tests/unit/page/mode-entry-local-lane.test.js`, "a hand-edited article adopted at entry is what the first save writes": failed once on a test box inside the page colour full runs (tb-20261029-232659-30747) with `fastLane()` returning `null` at line 301, then passed 14 reruns (alone, its folder, a full suite with logging on each null-lane path in `src/plugins/live.js`). Revisit if it fails again in the end-of-project full suite: rerun that suite with the same logging to name the path (diagnosis: `~/hyper-lanes/box-flakes.md`).
