import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';

// A spec asks for this with executeServerCommand('chunk-route', { block: true }):
// every request under /dist/m/ is answered 404 until it is asked again with
// { block: false }. Playwright's route is the only way to make one page load see
// a release that is not on the disk, which is the chunked bootstrap's fallback.
// The fallback reaches /src/ at the repository root, as it does in the npm package.
const CHUNKS = '**/dist/m/**';

const chunkRoutes = {
  name: 'chunk-route',
  async executeCommand({ command, payload, session }) {
    if (command !== 'chunk-route') return undefined;
    if (session.browser.type !== 'playwright') return { routed: false };
    const page = session.browser.getPage(session.id);
    await page.unroute(CHUNKS);
    if (payload?.block) {
      await page.route(CHUNKS, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
    }
    return { routed: true };
  },
};

// The single-file build in a real browser. The repository root is served, so the
// fixtures reach /dist/ (built first by `npm run test:standalone`) and /entries/.
// Same pinned Chromium as the conformance suite; the byte comparison between the
// two builds in standalone.test.js depends on both running in one browser.
export default {
  nodeResolve: true,
  files: 'tests/browser/**/*.test.js',
  browsers: [playwrightLauncher({ product: 'chromium' })],
  testFramework: { config: { timeout: '20000' } },
  plugins: [chunkRoutes],
  reporters: [summaryReporter(), defaultReporter()],
};
