import { defaultReporter, summaryReporter } from '@web/test-runner';
import { playwrightLauncher } from '@web/test-runner-playwright';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { cp, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A spec asks for this with executeServerCommand('chunk-route', { block: true }):
// every request under /dist/m/ is answered 404 until it is asked again with
// { block: false }. Playwright's route is the only way to make one page load see
// a release that is not on the disk, which is the chunked bootstrap's fallback.
// The fallback reaches /src/ at the repository root, as it does in the npm package.
// { blockFile: path } 404s that one URL instead, which is how a page is made to see
// exactly one missing file of a release: the runtime manifest.
const CHUNKS = '**/dist/m/**';

const notFound = (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
// One page, one live set of blocked patterns: asking again replaces the last set
// instead of stacking routes whose names the next call cannot know.
const blocked = new Map();

const chunkRoutes = {
  name: 'chunk-route',
  async executeCommand({ command, payload, session }) {
    if (command !== 'chunk-route') return undefined;
    if (session.browser.type !== 'playwright') return { routed: false };
    const page = session.browser.getPage(session.id);
    for (const pattern of blocked.get(session.id) ?? []) await page.unroute(pattern);
    const patterns = [];
    if (payload?.block) patterns.push(CHUNKS);
    if (payload?.blockFile) patterns.push(`**${payload.blockFile}`);
    for (const pattern of patterns) await page.route(pattern, notFound);
    blocked.set(session.id, patterns);
    return { routed: true };
  },
};

// A mixed page: clay.js from one release and a satellite from another, both built
// on demand into scratch directories and served under these two paths. Nothing is
// written inside the repository, so the two builds never disturb dist/.
const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const BUILD = fileURLToPath(new URL('../../scripts/build-chunks.mjs', import.meta.url));
const MOUNTS = { 'mixed-a': 'a', 'mixed-b': 'b' };
const mixed = { a: null, b: null, scratch: null };

// esbuild writes metafile paths relative to the working directory, so the build
// runs in a child process whose cwd is the release's own root.
function buildRelease(root, outdir) {
  const script = `const { emitChunks, emitBootstraps } = await import(${JSON.stringify(pathToFileURL(BUILD).href)});
const chunks = await emitChunks({ root: ${JSON.stringify(root)}, outdir: ${JSON.stringify(path.join(outdir, 'm'))} });
await emitBootstraps({ root: ${JSON.stringify(root)}, outdir: ${JSON.stringify(outdir)}, manifest: chunks.manifest, satellites: chunks.satellites });`;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], { cwd: root, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

// The second release is the same source with one line added, so its chunk names
// differ from the first release's: two releases, not one release served twice.
async function buildSecondRelease() {
  const root = path.join(mixed.scratch, 'root');
  await cp(path.join(ROOT, 'src'), path.join(root, 'src'), { recursive: true });
  await cp(path.join(ROOT, 'entries'), path.join(root, 'entries'), { recursive: true });
  await cp(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
  await symlink(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'));
  const internals = path.join(root, 'src/internals/index.js');
  await writeFile(internals, `${await readFile(internals, 'utf8')}\nwindow.__mixedRelease = 'b';\n`);
  return root;
}

const mixedReleases = {
  name: 'mixed-release',
  async executeCommand({ command }) {
    if (command !== 'mixed-release') return undefined;
    if (!mixed.a) {
      mixed.scratch = await mkdtemp(path.join(os.tmpdir(), 'clay-mixed-'));
      mixed.a = path.join(mixed.scratch, 'a');
      mixed.b = path.join(mixed.scratch, 'b');
      await buildRelease(ROOT, mixed.a);
      await buildRelease(await buildSecondRelease(), mixed.b);
    }
    return { a: '/mixed-a/', b: '/mixed-b/' };
  },
  serverStop() {
    if (mixed.scratch) rmSync(mixed.scratch, { recursive: true, force: true });
  },
};

const mixedFiles = {
  name: 'mixed-files',
  serve(context) {
    const match = /^\/(mixed-[ab])\/(.+)$/.exec(context.path);
    if (!match) return undefined;
    const dir = mixed[MOUNTS[match[1]]];
    if (!dir) return undefined;
    const file = path.join(dir, decodeURIComponent(match[2]));
    if (!file.startsWith(dir) || !existsSync(file)) return undefined;
    return { body: readFileSync(file, 'utf8'), type: file.endsWith('.js') ? 'js' : 'json' };
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
  plugins: [chunkRoutes, mixedReleases, mixedFiles],
  reporters: [summaryReporter(), defaultReporter()],
};
