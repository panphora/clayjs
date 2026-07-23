import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { withFixture, capture, runFixture, reserialize } from './harness.js';
import { FIXTURES_DIR, supportsFixture } from './config.js';

const manifest = JSON.parse(await readFile({ path: `${FIXTURES_DIR}/manifest.json` }));

for (const fx of manifest.fixtures) {
  if (!supportsFixture(fx)) continue;
  describe(`properties: ${fx.name}`, () => {
    it('determinism — two captures in one session are byte-identical', async () => {
      await withFixture(fx.name, ({ client }) => {
        const a = capture(client);
        const b = capture(client);
        expect(a.snapshot).to.equal(b.snapshot);
        expect(a.document).to.equal(b.document);
      });
    });

    it('the live DOM is untouched by capture', async () => {
      await withFixture(fx.name, ({ win, client }) => {
        const before = win.document.documentElement.outerHTML;
        capture(client);
        const after = win.document.documentElement.outerHTML;
        expect(after).to.equal(before);
      });
    });

    if (!fx.skipDocument) {
      it('stability — reserializing the document is a fixed point', async () => {
        const { document } = await runFixture(fx.name);
        const again = await reserialize(document);
        expect(again).to.equal(document);
      });
    }
  });
}
