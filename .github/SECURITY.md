# Security policy

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting: go to the
[Security tab](https://github.com/panphora/clayjs/security) and choose "Report a
vulnerability". Please do not open a public issue for a security report.

Expect an acknowledgement within a few days. If a fix is warranted it ships in a patch
release, and the release notes credit you unless you would rather stay anonymous.

## Supported versions

The latest published version is the supported one. clayjs moves forward rather than
backporting, so fixes land in a new patch release rather than in older lines.

## What is in scope

clayjs runs in the browser, holds a per-document save credential, and serializes a whole
document for something else to write to disk. The interesting boundaries are:

- **Save tokens.** A host stamps `savetoken` onto `<html>` and clayjs posts to
  `/_/save/{token}` with no cookies, because the token is the credential. Anything that
  leaks a token into saved bytes, into another origin, or into a URL is in scope.
- **The snapshot boundary.** Regions marked `no-save`, `no-snapshot` and `freeze` are
  supposed to stay out of what gets written. A way to smuggle content past that boundary,
  or to strip content that should have been kept, is in scope.
- **Cross-origin module loading.** The bootstrap derives its own base URL from
  `document.currentScript.src` and imports modules relative to it. A way to make it load
  from an attacker-controlled base is in scope.
- **Live sync.** Incoming frames from peers morph the live DOM. A way to make a peer frame
  execute script or overwrite a protected region is in scope.

## What is not in scope

- **Authoring your own HTML.** clayjs saves the document you built. If you put a script
  tag in your page it runs, and that is the product working, not a vulnerability.
- **Host-side authorization.** Who is allowed to edit, and who is allowed to write to a
  file, is decided by the host (HTML Clay, hyperclay.com, or your own server). Report
  those to the host.
- **Anything requiring an already-compromised machine or browser extension.**
