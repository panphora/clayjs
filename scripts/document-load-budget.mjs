// The Document load ceilings, in bytes as served over the wire (Brotli q4), in one
// module the meter and the tests import: a report and a gate cannot disagree about a
// number, and moving bytes from one load phase to another never moves a ceiling.
export const DOCUMENT_LOAD_BUDGET = Object.freeze({
  readerBrotli: 46_080,           // 45 KiB
  textEditorBrotli: 348_160,      // 340 KiB, David's wrap-up decision (2026-10-28); was 326,656
  textEditorStretchBrotli: 266_240, // 260 KiB, reported as reached or not
  maxBuiltDepth: 3,
});
