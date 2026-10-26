import { editor, posOf, select } from './view-helpers.js';
const part=(view,cls)=>view.dom.parentElement.querySelector(cls);
const frame=()=>new Promise(resolve=>window.requestAnimationFrame(resolve));

test.each(['Table','Board'])('a plus beside B inserts %s at B even with the caret in A',async(label)=>{
  const view=editor([['a','paragraph','A'],['b','paragraph','B'],['c','paragraph','C']]);
  view.posAtCoords=()=>({pos:posOf(view,'b'),inside:posOf(view,'b')-1});
  view.coordsAtPos=()=>({left:40,right:48,top:100,bottom:120});
  select(view,posOf(view,'a'));
  view.dom.parentElement.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:300,clientY:32}));
  await frame();
  part(view,'.page-plus').click();
  const chrome=view.pluginViews.find(p=>p.menuEl);
  const anchorId=chrome.menu.anchorId;
  expect(anchorId).toBe('b');
  const row=[...chrome.menuEl.querySelectorAll('.page-menu-item')].find(r=>r.querySelector('.page-menu-label').textContent===label);
  row.click();
  const order=[]; view.state.doc.forEach(n=>order.push(n.attrs.id==='a'||n.attrs.id==='b'||n.attrs.id==='c'?n.attrs.id:n.type.name));
  expect(order.indexOf(label.toLowerCase())).toBeGreaterThan(order.indexOf('b'));
});
