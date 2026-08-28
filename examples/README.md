# Examples

`notes.html` is a complete self-saving document. It is the file the
[tutorial](https://clayjs.com/get-started) builds, with two attributes doing the work:
`autosave` on `<html>` and `editable` on the parts you type into.

Nothing in it is example-only. There is no build step and no configuration: what you see
is what a real clayjs page looks like.

## Running it

clayjs is client-side. It turns the page into a document and posts the edited document
back, but something else has to write the bytes. Pick a host:

**[HTML Clay](https://htmlclay.com)**, the desktop app, is the shortest path. Rename
`notes.html` to `notes.htmlclay` and double-click it. The app serves it at
`http://127.0.0.1`, opens it in your browser, and writes every save back to the file on
disk. Nothing about the file depends on the app: rename it back to `.html` and any
browser still opens it.

**[hyperclay.com](https://hyperclay.com)** hosts the same file online, with version
history and a URL you can share.

**Your own server** needs one route. It accepts a POST of the whole document as text and
writes it to the file. See [the endpoint spec](https://clayjs.com/docs#endpoint); it is
about twenty lines of Express. Serving your own file also means arming edit mode
yourself, which is one line before the script tag.

**No network** works with any of the three. Download
[clay.standalone.js](https://clayjs.com/v1/clay.standalone.js), put it beside
`notes.html`, and change the script tag to `<script src="clay.standalone.js"></script>`.
The page then loads with no connection, and HTML Clay saves it with none either. See
[clayjs.com/offline](https://clayjs.com/offline).

## What to try once it is running

Type into the page, wait a moment for the status chip to say `Saved`, then open the file
in a text editor. Your words are in the HTML, in the element you typed them into. There
is no database and no JSON anywhere: the document is the app and the data.

Then reload the page. What comes back is what is on disk.
