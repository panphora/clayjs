import { editor } from './view-helpers.js';

test.each(['content-box','border-box'])('a %s menu stays visible when keyboard dismissal releases its max-height',(sizing)=>{
  const originalMedia=window.matchMedia, originalViewport=window.visualViewport;
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  const viewport={offsetLeft:0,offsetTop:0,width:390,height:300,addEventListener(){},removeEventListener(){}};
  window.visualViewport=viewport;
  try {
    const view=editor([['p','paragraph','P']]);
    const chrome=view.pluginViews.find(p=>p.menuEl);
    chrome.more.click();
    const rows=chrome.menuEl.querySelectorAll('.page-menu-item').length;
    const natural=rows*44+14;
    // The last phone rule sets a 44 px minimum row height. Include the menu's
    // 12 px padding and 2 px border, with both possible host box-sizing rules.
    Object.defineProperty(chrome.menuEl,'offsetHeight',{get:()=>sizing==='border-box'
      ? Math.min(natural,parseFloat(chrome.menuEl.style.getPropertyValue('--page-pop-max'))||Infinity,844*0.7)
      : Math.min(natural-14,parseFloat(chrome.menuEl.style.getPropertyValue('--page-pop-max'))||Infinity,844*0.7)+14});
    Object.defineProperty(chrome.dock,'offsetHeight',{get:()=>62});
    Object.defineProperty(chrome.dock,'offsetWidth',{get:()=>204});
    chrome.paintLayout(chrome.measureLayout());
    viewport.height=844;
    chrome.paintLayout(chrome.measureLayout());
    const dismissed={top:parseFloat(chrome.menuEl.style.getPropertyValue('--page-pop-y')),height:chrome.menuEl.offsetHeight,visibleBottom:844};
    expect(dismissed.top+dismissed.height).toBeLessThanOrEqual(dismissed.visibleBottom);
  } finally {window.matchMedia=originalMedia;window.visualViewport=originalViewport;}
});
