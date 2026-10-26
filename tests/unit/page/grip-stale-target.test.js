globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
import { editor, posOf, select } from './view-helpers.js';
import { REMOTE_META } from '../../../src/page/ybind/layout.js';

test('releasing a grip after a peer insertion opens actions for the original block',()=>{
  const view=editor([['a','paragraph','Alpha'],['b','paragraph','Bravo'],['c','paragraph','Charlie']]);
  const chrome=view.pluginViews.find(p=>p.menuEl);
  select(view,posOf(view,'b'));
  chrome.drag.start({button:0,pointerType:'mouse',pointerId:1,clientX:20,clientY:80,preventDefault(){}});
  const captured=chrome.drag.state.span;
  view.dispatch(view.state.tr.insert(0,view.state.schema.nodes.paragraph.create({id:'peer'},view.state.schema.text('Peer'))).setMeta(REMOTE_META,true));
  chrome.drag.end({type:'pointerup',pointerId:1});
  const actual=chrome.menu.ids;
  [...chrome.menuEl.querySelectorAll('.page-menu-item')].find(r=>r.querySelector('.page-menu-label').textContent==='Delete').click();
  const remaining=[];view.state.doc.forEach(n=>remaining.push(n.attrs.id));
  expect(captured.roots.map(r=>r.id)).toEqual(['b']);
  expect(actual).toEqual(['b']);
  expect(remaining).toEqual(['peer','a','c']);
});
