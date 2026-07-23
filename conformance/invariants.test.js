import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { runFixture } from './harness.js';
import { FIXTURES_DIR, supportsFixture } from './config.js';

// Independent oracle. These assert the algorithm's absolute rules directly on the
// live capture output, NOT against golden bytes. So a regenerated-but-wrong golden
// (the failure mode of golden testing: `conformance:update` blessing a regression)
// still trips here. Keep these rules universal — true for every conforming fixture.
const manifest = JSON.parse(await readFile({ path: `${FIXTURES_DIR}/manifest.json` }));

const NO_SAVE_ATTR = /\sno-save=/;
const NO_SNAPSHOT_ATTR = /\sno-snapshot=/;

for (const fx of manifest.fixtures) {
  if (!supportsFixture(fx)) continue;
  describe(`invariants: ${fx.name}`, () => {
    let out;
    before(async () => {
      out = await runFixture(fx.name);
    });

    it('both artifacts begin with the literal doctype (step 8)', () => {
      expect(out.snapshot.startsWith('<!DOCTYPE html>')).to.equal(true);
      expect(out.document.startsWith('<!DOCTYPE html>')).to.equal(true);
    });

    it('no test-rig / dev-server debris leaks into either artifact', () => {
      expect(out.snapshot.includes('__web-dev-server__')).to.equal(false);
      expect(out.document.includes('__web-dev-server__')).to.equal(false);
    });

    it('the document carries no [no-save] attribute (step 7 strips all)', () => {
      expect(NO_SAVE_ATTR.test(out.document)).to.equal(false);
    });

    it('neither artifact carries a [no-snapshot] attribute (step 5 strips both)', () => {
      expect(NO_SNAPSHOT_ATTR.test(out.snapshot)).to.equal(false);
      expect(NO_SNAPSHOT_ATTR.test(out.document)).to.equal(false);
    });

    it('declared secret sentinels never appear in either artifact', () => {
      for (const secret of fx.secrets || []) {
        expect(out.snapshot.includes(secret)).to.equal(false);
        expect(out.document.includes(secret)).to.equal(false);
      }
    });
  });
}
