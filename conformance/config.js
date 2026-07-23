// The only per-repo knobs for the conformance harness. The clayjs mirror sets
// these to its own paths; everything else in conformance/ is identical across the
// two clients. Keeping them here is what makes the harness genuinely portable
// rather than "identical except for a hardcoded path buried in harness.js".

// Server-absolute path to the client's snapshot module, imported in the fixture
// iframe realm. Both clients happen to expose it at the same path today.
export const SNAPSHOT_MODULE = '/src/core/snapshot.js';

// Fixtures directory, relative to a conformance test file. The @web/test-runner
// file command resolves paths from the test file's directory.
export const FIXTURES_DIR = 'fixtures';

// Capabilities a fixture may require (the manifest's client-agnostic `requires`).
// Each maps to the client module the harness imports into the fixture realm to
// exercise it. This is the per-repo mapping: clayjs points `form-persist` at its
// own persistence module. A fixture whose `requires` names a capability absent
// here is skipped, not failed (fixtures.md: a client may skip a feature it lacks
// and still claim conformance on the rest).
export const CAPABILITY_MODULES = {
  'form-persist': '/src/core/persist.js',
};

const SUPPORTED = new Set(Object.keys(CAPABILITY_MODULES));

export function supportsFixture(entry) {
  return (entry.requires || []).every((cap) => SUPPORTED.has(cap));
}

export function modulesFor(entry) {
  return (entry.requires || []).map((cap) => CAPABILITY_MODULES[cap]).filter(Boolean);
}
