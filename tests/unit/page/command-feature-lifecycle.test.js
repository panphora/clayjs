/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { jest } from "@jest/globals";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageEditor, runPageCommand, setEditorActive } from "../../../src/page/editor.js";
import { COMMAND_FEATURES, FEATURES } from "../../../src/page/features/registry.js";
import { CORE_WAVES, PLUGIN_PATHS, resolveModules } from "../../../src/loader-logic.js";
import { releaseFiles } from "../../../scripts/build-offline-manifest.mjs";

/**
 * The one lifecycle for optional commands, and the download contract behind it. A command
 * module is fetched on the first ask and once under concurrent asks, retried after a
 * failure, refused when the selection or the document revision moved before it arrived,
 * inert when it arrives after the edit left, disposed on the exit and installed once more
 * on the next entry. None of them is in the initial reader or editor download, and each is
 * its own chunk in the release an offline host holds.
 */

const run = promisify(execFile);
const COMMAND = "fakeCommand";
const BLOCKS = {
  a: { t: "paragraph", pos: "1", c: "First line" },
  z: { t: "paragraph", pos: "2", c: "Neighbour line" },
};

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  delete COMMAND_FEATURES[COMMAND];
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};
const deferred = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
};

// The fake command module: `createFeature` records the install, `run` records the call and
// `dispose` the exit. `load` is the test's own gate, so a module can arrive late, fail, or
// arrive after the edit has left.
const fakeModule = (calls) => ({
  createFeature(context) {
    calls.installs.push(context);
    return {
      async run(args) {
        calls.runs.push(args);
        return { ok: true, ran: args };
      },
      dispose() { calls.disposes.push(true); },
    };
  },
});

function serve(arrive = (mod) => Promise.resolve(mod)) {
  const calls = { loads: 0, installs: [], runs: [], disposes: [] };
  COMMAND_FEATURES[COMMAND] = {
    module: "page/features/fake-command.js",
    load: () => {
      calls.loads += 1;
      return Promise.resolve().then(() => arrive(fakeModule(calls)));
    },
  };
  return calls;
}

function open(blocks = BLOCKS) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks });
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
  });
  return view;
}

const select = (view, from, to = from) => {
  view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, from, to)));
};
const endOfNeighbour = (view) => {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (!found && node.attrs.id === "z") found = { node, pos }; });
  return found.pos + 1 + found.node.textContent.length;
};

test("a command asked for twice at once is fetched once, installed once, and runs for both asks", async () => {
  const calls = serve();
  const view = open();

  const answers = await Promise.all([runPageCommand(view, COMMAND, "first"), runPageCommand(view, COMMAND, "second")]);

  expect(calls.loads).toBe(1);
  expect(calls.installs).toHaveLength(1);
  expect(calls.installs[0].view).toBe(view);
  expect(calls.runs).toEqual(["first", "second"]);
  expect(answers).toEqual([{ ok: true, ran: "first" }, { ok: true, ran: "second" }]);
});

test("a failed fetch refuses the ask, and the next ask loads the module again", async () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  let attempt = 0;
  const calls = serve((mod) => {
    attempt += 1;
    return attempt === 1 ? Promise.reject(new Error("no network")) : Promise.resolve(mod);
  });
  const view = open();

  const refused = await runPageCommand(view, COMMAND, "first");
  expect(refused.ok).toBe(false);
  expect(refused.code).toBe("unavailable");
  expect(calls.installs).toHaveLength(0);
  expect(calls.runs).toEqual([]);

  const retried = await runPageCommand(view, COMMAND, "second");
  expect(retried).toEqual({ ok: true, ran: "second" });
  expect(calls.loads).toBe(2);
  expect(calls.installs).toHaveLength(1);
  errors.mockRestore();
});

test("a selection that moves before the module arrives cancels the command", async () => {
  const { gate, release } = deferred();
  const calls = serve((mod) => gate.then(() => mod));
  const view = open();

  const asked = runPageCommand(view, COMMAND, "first");
  await flush();
  select(view, endOfNeighbour(view));
  expect(await asked).toEqual({ ok: false, code: "stale-target" });

  release();
  expect(await waitFor(() => calls.installs.length === 1)).toBe(true);
  expect(calls.loads).toBe(1);
  expect(calls.runs).toEqual([]);
});

test("a document revision that moves before the module arrives cancels the command, and the next ask runs", async () => {
  const { gate, release } = deferred();
  const calls = serve((mod) => gate.then(() => mod));
  const view = open();

  const asked = runPageCommand(view, COMMAND, "first");
  await flush();
  view.dispatch(view.state.tr.insertText("!", endOfNeighbour(view)));
  expect(await asked).toEqual({ ok: false, code: "stale-target" });

  release();
  expect(await waitFor(() => calls.installs.length === 1)).toBe(true);
  expect(calls.runs).toEqual([]);

  const second = await runPageCommand(view, COMMAND, "second");
  expect(second).toEqual({ ok: true, ran: "second" });
  expect(calls.loads).toBe(1);
  expect(calls.installs).toHaveLength(1);
  expect(calls.disposes).toEqual([]);
});

test("a module that arrives after the edit left is never installed and the command is inert", async () => {
  const { gate, release } = deferred();
  const calls = serve((mod) => gate.then(() => mod));
  const view = open();

  const asked = runPageCommand(view, COMMAND, "first");
  await flush();
  expect(setEditorActive(view, false)).toBe(false);
  expect(await asked).toEqual({ ok: false, code: "not-editing" });

  release();
  await flush();
  await flush();
  expect(calls.loads).toBe(1);
  expect(calls.installs).toHaveLength(0);
  expect(calls.runs).toEqual([]);
  expect(calls.disposes).toEqual([]);
});

test("an exit disposes what the command installed, and the next entry installs once more", async () => {
  const calls = serve();
  const view = open();

  expect(await runPageCommand(view, COMMAND, "first")).toEqual({ ok: true, ran: "first" });
  expect(calls.installs).toHaveLength(1);

  setEditorActive(view, false);
  expect(calls.disposes).toHaveLength(1);
  expect(await runPageCommand(view, COMMAND, "while out")).toEqual({ ok: false, code: "not-editing" });

  setEditorActive(view, true);
  expect(await runPageCommand(view, COMMAND, "second")).toEqual({ ok: true, ran: "second" });
  expect(calls.installs).toHaveLength(2);
  expect(calls.loads).toBe(1);
  expect(calls.runs).toEqual(["first", "second"]);
  expect(calls.disposes).toHaveLength(1);
});

test("destroying the editor disposes the command and leaves a late ask inert", async () => {
  const calls = serve();
  const view = open();
  expect(await runPageCommand(view, COMMAND, "first")).toEqual({ ok: true, ran: "first" });

  view.destroy();
  expect(calls.disposes).toHaveLength(1);
  expect(await runPageCommand(view, COMMAND, "second")).toEqual({ ok: false, code: "not-editing" });
});

test("a command no row offers is refused rather than fetched", async () => {
  serve();
  const view = open();
  expect(await runPageCommand(view, "nothing", {})).toEqual({ ok: false, code: "unknown-command" });
});

// ---- the download contract -------------------------------------------------

const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const optionalModules = () => [...Object.values(FEATURES), ...Object.values(COMMAND_FEATURES)].map((row) => row.module);

// The chunk build in its own process: esbuild needs the realm it was loaded in, and this
// file's is jsdom's. It names each output and the source modules inlined into it, so one
// place holding a module is one download that carries it.
const BUILD_PROGRAM = `
import { basename } from "node:path";
import { emitChunks } from ${JSON.stringify(path.join(ROOT, "scripts/build-chunks.mjs"))};
const built = await emitChunks({ root: ${JSON.stringify(ROOT)}, outdir: process.argv[2] });
const outputs = {};
for (const [file, meta] of Object.entries(built.metafile.outputs)) outputs[basename(file)] = Object.keys(meta.inputs ?? {});
console.log(JSON.stringify({ entries: built.manifest.entries, files: built.manifest.files, outputs }));
`;

test("the command table is out of the block-type scan: no block type and no boot plan names a command", () => {
  for (const row of Object.values(COMMAND_FEATURES)) expect(row.types).toBeUndefined();

  const view = resolveModules(new URLSearchParams(""), false, { isDraftMode: false, hasSap: false, canEdit: true });
  const planned = [
    ...CORE_WAVES.always,
    ...CORE_WAVES.editOnly,
    ...Object.values(PLUGIN_PATHS).flatMap((spec) => [spec.path, spec.ownerPath]).filter(Boolean),
    ...view.core,
    ...view.plugins,
    ...(view.late ?? []),
  ];
  for (const module of optionalModules()) expect(planned).not.toContain(module);
});

test(
  "every optional module is one chunk of its own, in neither initial download, and in the release an offline host holds",
  async () => {
    const site = await mkdtemp(path.join(os.tmpdir(), "clay-command-chunks-"));
    try {
      const outdir = path.join(site, "dist/m");
      await mkdir(path.join(site, "entries"), { recursive: true });
      await mkdir(path.join(site, "src"), { recursive: true });
      const program = path.join(site, "build.mjs");
      await writeFile(program, BUILD_PROGRAM);
      const { stdout } = await run(process.execPath, [program, outdir]);
      const built = JSON.parse(stdout);

      const editor = built.entries["page/editor.js"];
      expect(editor).toBeTruthy();
      const holds = (module) =>
        Object.entries(built.outputs)
          .filter(([, inputs]) => inputs.includes(`src/${module}`))
          .map(([file]) => file);

      // What a download carries: the file and everything it imports statically. A dynamic
      // import is code a later ask fetches, so it is not part of that download.
      const downloaded = (from) => {
        const seen = new Set();
        const stack = [from];
        while (stack.length) {
          const file = stack.pop();
          if (!file || seen.has(file) || !built.files[file]) continue;
          seen.add(file);
          stack.push(...built.files[file].imports);
        }
        return seen;
      };
      const view = resolveModules(new URLSearchParams(""), false, { isDraftMode: false, hasSap: false, canEdit: true });
      const bootFiles = [editor, ...[...view.core, ...view.plugins, ...(view.late ?? [])].map((logical) => built.entries[logical])];
      const initial = new Set(bootFiles.flatMap((file) => [...downloaded(file)]));

      const modules = optionalModules();
      expect(modules.length).toBeGreaterThan(0);
      for (const module of modules) {
        // One output holds it: a module inlined in an initial download would be an input of
        // that download's own output and could not also be a chunk fetched later.
        const files = holds(module);
        expect({ module, files: files.length }).toEqual({ module, files: 1 });
        const [file] = files;
        expect(built.files[file]).toBeTruthy();
        expect(initial.has(file)).toBe(false);
        // And it is reachable on demand: one of the editor's own modules asks for it.
        expect([...initial].some((held) => built.files[held].dynamicImports.includes(file))).toBe(true);
      }

      // The offline manifest is the inventory of every file a release prefix serves, so a
      // chunk the build wrote is a file an offline host already holds.
      const inventory = await releaseFiles(site);
      for (const module of modules) expect(inventory.has(`m/${holds(module)[0]}`)).toBe(true);
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  },
  120000,
);
