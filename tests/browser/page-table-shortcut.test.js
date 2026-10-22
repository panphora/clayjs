import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { createPageEditor } from '../../src/page/editor.js';
import { state as pmState } from '../../src/vendor/prosemirror.vendor.js';

const { TextSelection } = pmState;
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
let view;
let mount;

afterEach(() => {
  view?.destroy();
  mount?.remove();
  view = mount = null;
});

for (const [name, typed] of [['a fresh line', '| a | b |'], ['after a typed space', '| Name | Owner | ']]) {
  it(`a Markdown table row typed with real keys becomes a table on Enter (${name})`, async () => {
    mount = document.body.appendChild(document.createElement('div'));
    view = createPageEditor(mount, { blocks: { p: { t: 'paragraph', pos: 'V', c: 'Intro' }, e: { t: 'paragraph', pos: 'W', c: '' } } });
    view.focus();
    const end = view.state.doc.content.size - 1;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    await sendKeys({ type: typed });
    await settle();
    await sendKeys({ press: 'Enter' });
    await settle();
    const kinds = [];
    view.state.doc.forEach((node) => kinds.push(node.type.name));
    expect(kinds, JSON.stringify(view.state.doc.lastChild.toJSON())).to.include('table');
  });
}
