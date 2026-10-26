globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import { editor, posOf, select } from './view-helpers.js';
import { openLinkEditor } from '../../../src/page/link.js';
const part=(view,cls)=>view.dom.parentElement.querySelector(cls);
afterEach(()=>{document.body.innerHTML='';});
test('a composition Enter in a link address does not apply it',()=>{
  const view=editor([['p','paragraph','Text']]);
  view.coordsAtPos=()=>({left:20,right:30,top:100,bottom:120});
  select(view,posOf(view,'p'),posOf(view,'p',true));
  openLinkEditor(view);
  const input=part(view,'.page-link-input');
  input.value='https://example.test';
  const before=view.state.doc;
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,keyCode:229,bubbles:true,cancelable:true}));
  expect(view.state.doc.eq(before)).toBe(true);
  expect(document.activeElement).toBe(input);
  expect(view.state.doc.child(0).child(0).marks).toEqual([]);
});
