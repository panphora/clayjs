import { expect } from '@esm-bundle/chai';
import { readFile, writeFile } from '@web/test-runner-commands';
import { runFixture } from './harness.js';
import { FIXTURES_DIR, supportsFixture } from './config.js';

const UPDATE = window.__GOLDEN_UPDATE === true;
const manifest = JSON.parse(await readFile({ path: `${FIXTURES_DIR}/manifest.json` }));

async function goldenAssert(relPath, actual) {
  if (UPDATE) {
    await writeFile({ path: relPath, content: actual });
    return;
  }
  const golden = await readFile({ path: relPath });
  expect(
    typeof golden,
    `missing golden ${relPath} — run: npm run conformance:update`,
  ).to.equal('string');
  expect(actual).to.equal(golden);
}

for (const fx of manifest.fixtures) {
  if (!supportsFixture(fx)) {
    describe(`fixture: ${fx.name}`, () => {
      it(`skipped — unsupported capability: ${(fx.requires || []).join(', ')}`, function () {
        this.skip();
      });
    });
    continue;
  }
  describe(`fixture: ${fx.name}`, () => {
    let out;
    before(async () => {
      out = await runFixture(fx.name);
    });

    it('snapshot bytes match golden', async () => {
      await goldenAssert(`${FIXTURES_DIR}/${fx.name}/snapshot.html`, out.snapshot);
    });

    if (!fx.skipDocument) {
      it('document bytes match golden', async () => {
        await goldenAssert(`${FIXTURES_DIR}/${fx.name}/document.html`, out.document);
      });
    }
  });
}
