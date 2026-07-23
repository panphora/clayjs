// Per-fixture imperative setup: how to drive THIS client to the live state a
// fixture describes (live form values, JS properties, hook registration) before
// capture. Pure-serialization fixtures need no entry here; their input.html
// fully describes the DOM. Keyed by fixture name. Because clayjs and hyperclayjs
// share a byte-identical snapshot API, this file is identical in both repos.
//
// Fixtures that need form reflection declare `modules` in the manifest (which the
// harness imports into the iframe realm); the setup here only sets the live
// property values — the client's real persistence hook does the reflection.

export const setups = {
  // Step-7 ordering (the bug fixed in Step 1b), as a byte fixture. A registered
  // save-time hook must be able to SEE existing [no-save] nodes (the strip runs
  // after hooks), and a [no-save] node the hook itself injects must still be
  // stripped from the document.
  'no-save-in-hook'(doc, client) {
    client.onPrepareForSave((clone) => {
      const marker = clone.querySelector('#saw-existing');
      if (marker) {
        marker.setAttribute('data-saw', String(clone.querySelectorAll('[no-save]').length));
      }
      const body = clone.querySelector('body');
      if (body) {
        const injected = clone.ownerDocument.createElement('div');
        injected.setAttribute('no-save', '');
        injected.textContent = 'HOOK_INJECTED_NO_SAVE';
        body.appendChild(injected);
      }
    });
  },

  // Live form values that differ from the authored attributes, so the golden
  // proves the client reflected the LIVE state (step 3), not the source markup.
  'form-state'(doc) {
    doc.querySelector('#name').value = 'Ada Lovelace';
    doc.querySelector('#subscribe').checked = true;
    doc.querySelector('#plan-pro').checked = true; // radio: unchecks plan-basic
    doc.querySelector('#color').value = 'green';
    doc.querySelector('#bio').value = 'Line one\nLine two';
  },

  // The absolute rule: password and file inputs are never written into markup.
  // The live password value is a sentinel the invariant oracle asserts is absent.
  // (A file input's value cannot be set from script, so it is left untouched.)
  'form-secrets'(doc) {
    doc.querySelector('#username').value = 'ada';
    doc.querySelector('#password').value = 'S3CRET-sentinel-should-never-serialize';
  },

  // Step 4 and step 7 hooks and their order. Inline onbeforesnapshot / onbeforesave
  // live in the input; here we also register callback hooks. The snapshot runs only
  // the snapshot hooks; the document runs snapshot then save hooks.
  hooks(doc, client) {
    client.onSnapshot((clone) => {
      const el = clone.querySelector('#marks');
      if (el) el.setAttribute('data-reg-snapshot', '1');
    });
    client.onPrepareForSave((clone) => {
      const el = clone.querySelector('#marks');
      if (el) el.setAttribute('data-reg-save', '1');
    });
  },

  // Spec §2: state held in a JS property is absent from both artifacts; the same
  // value in an attribute is present in both. The live property must never
  // serialize; the sentinel is asserted absent by the invariant oracle.
  'properties-not-attributes'(doc) {
    // JS property — must not serialize (sentinel asserted absent by the oracle).
    doc.querySelector('#stateful').liveState = 'PROP_SENTINEL_never_serialized';
  },
};
