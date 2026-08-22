/**
 * The disk lane of scoped live sync: protectDiskDoc diffs a LOSS-domain capture
 * against the loss-domain baseline and splices SAVE-domain subtrees into the
 * incoming disk document; activateIncomingDoc flips the document's inert
 * attribute forms live, exactly as boot does on page load.
 *
 * Loss domain, not autosave domain: an unsaved edit in a no-trigger-autosave
 * region is real work, so the merge has to see it. Regions that genuinely churn
 * on their own declare it with no-dirty and leave both domains.
 */

let spliceMerge;
let save;
let snapshot;

beforeAll(async () => {
  window.clayEditMode = true;
  spliceMerge = await import("../../src/sync/splice-merge.js");
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
});

function setPage(bodyInner) {
  document.body.innerHTML = bodyInner;
  // The page as it stands IS the saved state: baseline by construction. Both
  // baselines, each from its own domain — the disk lane diffs in the loss
  // domain, and handing it an autosave-domain string would compare a clone that
  // keeps batching regions against a baseline that stripped them, reporting
  // every such region as dirty forever.
  save.setLastSavedBaselines(
    snapshot.captureForComparison(),
    snapshot.captureForDirtyCheck()
  );
}

function diskDoc(bodyInner) {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head>${document.head.innerHTML}</head><body>${bodyInner}</body></html>`,
    "text/html"
  );
}

test("clean page: no entries, nothing spliced", () => {
  setPage('<section data-id="b"><p>b0</p></section>');
  const newDoc = diskDoc('<section data-id="b"><p>b1-from-disk</p></section>');
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(true);
  expect(res.entries.length).toBe(0);
  expect(newDoc.querySelector("p").textContent).toBe("b1-from-disk");
});

test("a dirty section survives; the rest of the disk frame stays intact", () => {
  setPage(
    '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h0</p></section>'
  );
  document.querySelector('[data-id="b"] p').textContent = "b-local-edit";
  const newDoc = diskDoc(
    '<section data-id="b"><p>b0</p></section><section data-id="h"><p>h1-from-disk</p></section>'
  );
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(true);
  expect(res.entries.length).toBeGreaterThan(0);
  expect(newDoc.querySelector('[data-id="b"] p').textContent).toBe("b-local-edit");
  expect(newDoc.querySelector('[data-id="h"] p').textContent).toBe("h1-from-disk");
});

test("churn inside a no-dirty region never dirties the diff (library filterbar)", () => {
  setPage(
    '<div class="wrap"><div class="filterbar" clay="no-dirty no-undo"><p>all</p></div><section data-id="cards"><p>c0</p></section></div>'
  );
  // The filterbar renders itself from the cards and mutates constantly. no-dirty
  // is the author declaring that churn disposable, which strips it from both
  // sides of the loss diff, so it must NOT promote .wrap to a dirty root. An
  // unkeyed root here would promote to <body> and hold every frame forever.
  document.querySelector(".filterbar p").textContent = "filtered: builds";
  const newDoc = diskDoc(
    '<div class="wrap"><div class="filterbar" clay="no-dirty no-undo"><p>all</p></div><section data-id="cards"><p>c1-from-disk</p></section></div>'
  );
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(true);
  expect(res.entries.length).toBe(0);
  expect(newDoc.querySelector('[data-id="cards"] p').textContent).toBe("c1-from-disk");
});

test("a spliced dirty section keeps its no-trigger-autosave children (save domain)", () => {
  setPage(
    '<section data-id="b"><p>b0</p><div class="mini" clay="no-trigger-autosave"><span>state</span></div></section>'
  );
  document.querySelector('[data-id="b"] p').textContent = "b-local-edit";
  const newDoc = diskDoc(
    '<section data-id="b"><p>b0</p><div class="mini" clay="no-trigger-autosave"><span>state</span></div></section>'
  );
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(true);
  const spliced = newDoc.querySelector('[data-id="b"]');
  expect(spliced.querySelector("p").textContent).toBe("b-local-edit");
  expect(spliced.querySelector(".mini span").textContent).toBe("state");
});

test("an unsaved edit inside a batching region survives a disk frame", () => {
  // The bug this lane exists to close: no-trigger-autosave means "real work I
  // save by hand", so a disk frame must not silently overwrite it. Before the
  // loss-domain switch the compare clone stripped .editor on both sides, the
  // diff saw nothing, and the frame full-morphed the edit away.
  setPage(
    '<section data-id="b"><div class="editor" clay="no-trigger-autosave"><p>draft0</p></div></section>'
  );
  document.querySelector(".editor p").textContent = "draft-local-unsaved";
  const newDoc = diskDoc(
    '<section data-id="b"><div class="editor" clay="no-trigger-autosave"><p>draft-from-disk</p></div></section>'
  );
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(true);
  expect(res.entries.length).toBeGreaterThan(0);
  expect(newDoc.querySelector(".editor p").textContent).toBe("draft-local-unsaved");
});

test("a keyless dirty root holds the frame back", () => {
  setPage("<main><div><p>anon</p></div></main>");
  document.querySelector("main p").textContent = "local-edit";
  // Remote deleted the keyless div: nothing to replace, nothing to anchor on.
  const newDoc = diskDoc("<main></main>");
  const res = spliceMerge.protectDiskDoc({ newDoc });
  expect(res.ok).toBe(false);
});

test("activateIncomingDoc flips inert attribute forms live, like boot", () => {
  const newDoc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head>
       <style editmode:resource type="inert/">.admin{}</style>
     </head><body>
       <div editmode:contenteditable inert-contenteditable="true">text</div>
       <button editmode:onclick inert-onclick="go()">go</button>
       <input viewmode:disabled disabled>
     </body></html>`,
    "text/html"
  );
  spliceMerge.activateIncomingDoc(newDoc.documentElement);
  const editable = newDoc.querySelector("[editmode\\:contenteditable]");
  expect(editable.getAttribute("contenteditable")).toBe("true");
  expect(editable.hasAttribute("inert-contenteditable")).toBe(false);
  const button = newDoc.querySelector("[editmode\\:onclick]");
  expect(button.getAttribute("onclick")).toBe("go()");
  expect(button.hasAttribute("inert-onclick")).toBe(false);
  expect(newDoc.querySelector("input").hasAttribute("disabled")).toBe(false);
  expect(newDoc.querySelector("style").hasAttribute("type")).toBe(false);
});
