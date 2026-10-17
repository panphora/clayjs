var es=Object.defineProperty;var tr=(e,t)=>{for(var r in t)es(e,r,{get:t[r],enumerable:!0})};var Qr={};tr(Qr,{cms:()=>Zt,default:()=>_c});var at=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],qe=new Set(at),rr=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),ke=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]),un=new Set(["checked","selected","disabled","readOnly","paused"]);function nr(e,t){return t==null?un.has(e)?!1:"":un.has(e)?t==="false"?!1:!!t:t}function P(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function $e(e){let t=P(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}function ir(e){let t=0,r=null,n=-1,i=!1;for(let o=0;o<e.length;o++){let s=e[o];s==="\\"?o++:r?s===r&&(r=null):s==='"'||s==="'"?r=s:s==="["||s==="("?t++:s==="]"||s===")"?t>0&&t--:t===0&&s===">"?n=o:t===0&&s===","&&(i=!0)}return i||n===-1||!ts(e,n+1)?null:e.slice(0,n).trim()||null}function ts(e,t){let r=t,n=e.replace(/\s+$/,"").length;for(;r<n&&/\s/.test(e[r]);)r++;let i=0,o=null;for(;r<n;r++){let s=e[r];if(s==="\\")r++;else if(o)s===o&&(o=null);else if(s==='"'||s==="'")o=s;else if(s==="["||s==="(")i++;else if(s==="]"||s===")")i>0&&i--;else if(i===0&&(s==="+"||s==="~"||/\s/.test(s)))return!1}return!0}import Uc from"./hyper-morph.vendor.js";var ut={};tr(ut,{EmptyListInsert:()=>ne,MAX_RULE_DEPTH:()=>xe,MaxRuleDepthExceeded:()=>ue,NoRulesTag:()=>or,RuleTargetReadOnly:()=>Be,RulesParseError:()=>ye,ShapeMismatch:()=>ze,UnknownRulesVersion:()=>ve,WriteNotRoundTripped:()=>dt,WriteRefused:()=>ct,WriteRejected:()=>sr});var ye=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ve=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},xe=20,ue=class extends Error{constructor(t){super(`rule depth exceeded ${xe} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},ze=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},ne=class extends Error{constructor(t,r){super(r?`cannot add items to empty list at "${t.join(".")}" \u2014 ${r}`:`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},Be=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}},ct=class extends Error{constructor(t){super(`write refused: ${t.length} write(s) broke the content-only policy`),this.name="WriteRefused",this.refusals=t}};function ls(e){return e.reduce((r,n)=>typeof n=="number"?`${r}[${n}]`:r?`${r}.${n}`:String(n),"")||"(root)"}var dt=class extends Error{constructor(t){super(`write did not round-trip at "${ls(t)}"`),this.name="WriteNotRoundTripped",this.path=t}},or=class extends Error{constructor(t){super(`no <script data-rules-name~="${t}"> rules tag in this document`),this.name="NoRulesTag",this.token=t}},sr=class extends Error{constructor(t,r){super(`write rejected: ${t.length} unknown key(s), ${r.length} rule(s) with no matching element`),this.name="WriteRejected",this.unknownKeys=t,this.unmatched=r}};function ie(e,t,r,n={}){if(Object.prototype.hasOwnProperty.call(n,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");return lr(e,t,r,{depth:0,path:[]},n)}function lr(e,t,r,n,i){if(n.depth>xe)throw new ue(n.path);if(typeof r=="string")return as(e,t,r,n,i);if(Array.isArray(r)){let[o,s]=r,l=e.find(t,o,i);return fn(i,n,l),l.map((a,d)=>lr(e,a,s,{depth:n.depth+1,path:[...n.path,d]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[s,l]of Object.entries(r))o[s]=lr(e,t,l,{depth:n.depth+1,path:[...n.path,s]},i);return o}return null}function as(e,t,r,n,i){if(r.endsWith("[]")){let l=r.slice(0,-2),a=e.find(t,l,i);return fn(i,n,a),a.map(d=>e.text(d))}if(r.startsWith("@"))return hn(e,t,r.slice(1));let o=P(r);if(o!==-1){let l=r.slice(0,o),a=r.slice(o+1),d=l?e.find(t,l,i):[t];return d.length===0?null:hn(e,d[0],a)}if(r===".")return e.text(t);let s=e.find(t,r,i);return s.length===0?null:e.text(s[0])}function fn(e,t,r){if(typeof e.onRowsRead=="function")try{e.onRowsRead(t.path.slice(),r)}catch(n){console.warn(`[hyper-html-api] onRowsRead threw at "${t.path.join(".")||"(root)"}"`,n)}}function hn(e,t,r){if(qe.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n??null}var mt=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),cs=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),pn=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui","live"]);function Ue(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function ar(e,t){if(Ue(e,t))return!0;for(let[r,n]of Object.entries(cs))if(n.includes(t)&&Ue(e,r))return!0;return!1}function He(e){let t=mt[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function ds(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=mt[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>ar(r,i))||n.bundles.some(i=>Ue(r,i)))return r;r=r.parentElement}return null}function gn(e,t){return!!ds(e,t)}var us=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function ms(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();"value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function bn(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function kn(e,t,r,n,i,o){return(o?gn(e,t):bn(e,r,i,!1))||!!(n&&(o&&e!==i?e.matches(n):bn(e,n,i,o)))}function hs(e,t){let r=mt[t];return r.tokens.some(n=>ar(e,n))||r.bundles.some(n=>Ue(e,n))}var fs=new Set(["INPUT","TEXTAREA","SELECT","OPTION"]);function yn(e,t,r,n){if(e.nodeType===1&&n(e)){r.dropped.push(t);return}r.cloneToLive.set(t,e),r.liveToClone.set(e,t);let i=e,o=t;if(e.nodeType===1){if(fs.has(e.tagName)&&r.controls.push(e,t),e.tagName==="TEMPLATE"){for(;t.firstChild;)t.removeChild(t.firstChild);i=e.content,o=t.content,r.cloneToLive.set(o,i),r.liveToClone.set(i,o)}}else if(e.nodeType!==11)return;let s=o.firstChild;for(let l=i.firstChild;l&&s;l=l.nextSibling)yn(l,s,r,n),s=s.nextSibling}function Ve(e,{capability:t="data",exclude:r=null,inherit:n=!0,provenance:i=null}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let o=e.nodeType===9?e:e.ownerDocument;if(!o?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let s=o.implementation.createHTMLDocument(""),l=i||new WeakMap,a=new WeakMap,d=e.nodeType===9?e.documentElement:e;r&&s.documentElement.matches(r);let m=He(t),g=n?c=>hs(c,t)||!!(r&&c.matches(r)):c=>kn(c,t,m,r,d,!1),u=null;if(d.nodeType!==1||!kn(d,t,m,r,d,n)){u=s.importNode(d,!0);let c={cloneToLive:l,liveToClone:a,dropped:[],controls:[]};yn(d,u,c,g);for(let h of c.dropped)h.remove();for(let h=0;h<c.controls.length;h+=2)ms(c.controls[h],c.controls[h+1])}e.nodeType===9&&u&&(s.replaceChild(u,s.documentElement),a.set(e,s),l.set(s,e));let f=c=>{if(us.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:u,document:s,capability:t,selector:He(t),cloneToLive:l,liveToClone:a,original(c){return l.get(c)||null},cloneOf(c){return a.get(c)||null},query(c,h=u){return f(c),Array.from(h.querySelectorAll(c),k=>l.get(k)||k)},text(c=u){return(c===u?u:a.get(c))?.textContent||""},html(c=u){return(c===u?u:a.get(c))?.innerHTML??""},clone(c=u){let h=c===u?u:a.get(c);return h?s.importNode(h,!0):null}}}function xn(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function ps(e){return e?(e.nodeType===9||e.nodeType===11,e):null}function vn(e,t,r){!e||e.nodeType!==1||(t==="value"&&e.tagName==="INPUT"?e.value=r===null?"":r:t==="checked"&&e.tagName==="INPUT"?e.checked=r!==null:t==="selected"&&e.tagName==="OPTION"&&(e.selected=r!==null))}function wn(e,t){e&&e.tagName==="TEXTAREA"&&(e.value=t)}function An(e){if(!e||e.nodeType!==1)return;let t=[e,...e.querySelectorAll?e.querySelectorAll("textarea, input, option"):[]];for(let r of t)if(r.tagName==="TEXTAREA")r.value=r.defaultValue;else if(r.tagName==="INPUT"){let n=r.type;n!=="file"&&n!=="checkbox"&&n!=="radio"&&(r.value=r.defaultValue),r.checked=r.defaultChecked}else r.tagName==="OPTION"&&(r.selected=r.defaultSelected)}var q={semanticExclude:!0,find(e,t,r={}){let n=ps(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(l=>!xn(l)));let o=[];r.skip&&o.push(r.skip);let s=r.templateAttr===null?null:r.templateAttr||"cms-template";if(s&&o.push("["+s+"]"),o.length){let l=o.join(", ");i=i.filter(a=>!a.closest||!a.closest(l))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},matches(e,t){return!!(e&&e.matches)&&e.matches(t)},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t,wn(e,t)},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r),vn(e,t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t),vn(e,t,null)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){let t=e.cloneNode(!0);return An(t),t},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},insertBefore(e,t){e.parentNode.insertBefore(t,e)},insertAfter(e,t){e.parentNode.insertBefore(t,e.nextSibling)},identity(e){return e||null},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}};function Q(e,t={}){if(t.exclude===null)return q;let r=[He("data"),t.exclude].filter(Boolean).join(", "),n=e.nodeType===9?e:e.ownerDocument||e,i=e.nodeType===9?e.documentElement:e;if(!t._write&&!i?.matches?.(r)&&!i?.querySelector?.(r)&&!n?.querySelector?.(r))return q;let o=e.nodeType===9||!e.isConnected?e:e.ownerDocument,s=e.nodeType===9?e:e.ownerDocument,l=null,a=()=>l||(l=Ve(o,{capability:"data",exclude:t.exclude||null})),d=c=>{let h=a();return c===e?h.cloneOf(e):h.cloneOf(c)||c},m=c=>l?.original(c)||c,g=(c,h)=>{a().liveToClone.set(c,h),a().cloneToLive.set(h,c);let k=c.childNodes||[],p=h.childNodes||[];for(let b=0;b<Math.min(k.length,p.length);b++)g(k[b],p[b])},u=(c,h,k,p)=>{let b=Array.from(c.childNodes).filter(R=>l.cloneOf(R)),_=b[0];for(;_&&b.includes(_);)_=_.nextSibling;for(let R of b)R.remove();if(k==="innerHTML"){let R=s.createElement("template");R.innerHTML=p;for(let W of Array.from(R.content.childNodes))c.insertBefore(W,_||null)}else c.insertBefore(s.createTextNode(p),_||null),wn(c,p);let w=Ve(c,{capability:"data",exclude:t.exclude||null});h.replaceChildren(...Array.from(w.root?.childNodes||[]));let T=R=>{let W=w.original(R);W&&(l.liveToClone.set(W,R),l.cloneToLive.set(R,W));for(let B of Array.from(R.childNodes||[]))T(B)};for(let R of Array.from(h.childNodes))T(R)},f={...q,find(c,h,k={}){let p=d(c);if(!p?.querySelectorAll)return[];let b=a().query(h,p);k.includeRulesTag||(b=b.filter(w=>!xn(w)));let v=[];k.skip&&v.push(k.skip);let _=k.templateAttr===null?null:k.templateAttr||"cms-template";if(_&&v.push(`[${_}]`),v.length){let w=v.join(", ");b=b.filter(T=>!T.closest?.(w))}return b},parent(c){let h=d(c)?.parentElement;return h?m(h):null},children(c){return Array.from(d(c)?.children||[],m)},text(c,h){if(h===void 0){let b=m(c);return!b?.matches?.(r)&&!b?.querySelector?.(r)?q.text(b):(d(c)?.textContent||"").trim()}let k=m(c);if(!k?.matches?.(r)&&!k?.querySelector?.(r)&&!l){q.text(k,h);return}let p=a().cloneOf(k);p?u(k,p,"textContent",h):q.text(k,h)},attr(c,h,k){let p=m(c);if(k===void 0)return q.attr(p,h);q.attr(p,h,k);let b=l?.cloneOf(p);b&&(q.attr(b,h,k),Ve(p,{capability:"data",exclude:t.exclude||null}).root===null&&(b.remove(),l.liveToClone.delete(p),l.cloneToLive.delete(b)))},removeAttr(c,h){let k=m(c);q.removeAttr(k,h);let p=l?.cloneOf(k);p&&q.removeAttr(p,h)},prop(c,h,k){let p=m(c);if(k===void 0)return h==="innerHTML"||h==="outerHTML"||h==="textContent"||h==="innerText"?q.prop(d(p),h):q.prop(p,h);let b=h==="innerHTML"||h==="textContent"||h==="innerText",v=b?a().cloneOf(p):l?.cloneOf(p);v&&b?u(p,v,h,k):(q.prop(p,h,k),v&&q.prop(v,h,k))},clone(c){let h=d(c);if(h===c)return q.clone(c);let k=s.importNode(h,!0);return An(k),k},insertAt(c,h,k){let p=m(c),v=f.children(p)[k]||(()=>{for(let T=p.children.length-1;T>=0;T--){let R=p.children[T];if(a().cloneOf(R))return R.nextElementSibling}return p.firstElementChild})(),_=m(h);p.insertBefore(_,v||null);let w=a().cloneOf(p);if(w){let T=a().cloneOf(_);T||(T=s.importNode(_,!0),g(_,T));let R=Array.from(w.children);w.insertBefore(T,R[k]||null)}},insertBefore(c,h){let k=m(c),p=m(h);k.parentNode.insertBefore(p,k);let b=a().cloneOf(k.parentNode);if(b){let v=a().cloneOf(p);v||(v=s.importNode(p,!0),g(p,v));let _=a().cloneOf(k);_?_.before(v):b.appendChild(v)}},insertAfter(c,h){let k=m(c),p=m(h);k.parentNode.insertBefore(p,k.nextSibling);let b=a().cloneOf(k.parentNode);if(b){let v=a().cloneOf(p);v||(v=s.importNode(p,!0),g(p,v));let _=a().cloneOf(k);_?_.after(v):b.appendChild(v)}},identity(c){return m(c)||null},remove(c){let h=m(c),k=a().cloneOf(h);q.remove(h),k&&q.remove(k)},replaceWith(c,h){let k=m(c),p=a().cloneOf(k),b=q.replaceWith(k,h);if(p){let v=Ve(b,{capability:"data",exclude:t.exclude||null});if(!v.root)p.remove();else{p.replaceWith(v.root);let _=w=>{let T=v.original(w);T&&(l.liveToClone.set(T,w),l.cloneToLive.set(w,T));for(let R of Array.from(w.childNodes||[]))_(R)};_(v.root)}}return b}};return f}var we=q;function cr(e){try{return JSON.parse(e)}catch(t){throw new ye(`Invalid strict JSON: ${t.message}`,t)}}function Ae(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],s=0;for(;s<i.length;){let l=i[s];if(/\s/.test(l)){s++;continue}if("{}".includes(l)){o.push({type:l,value:l}),s++;continue}if(l==="["){let g=!1,u=s+1;for(;u<i.length&&/\s/.test(i[u]);)u++;if(u<i.length&&/[a-zA-Z_]/.test(i[u])&&(g=!0),!g){o.push({type:l,value:l}),s++;continue}}if(l==="]"){o.push({type:l,value:l}),s++;continue}if(l===":"){o.push({type:t.COLON,value:l}),s++;continue}if(l===","){o.push({type:t.COMMA,value:l}),s++;continue}if(l==='"'||l==="'"){let g=l,u=s+1;for(;u<i.length&&i[u]!==g;)i[u]==="\\"&&u++,u++;o.push({type:t.STRING,value:i.substring(s+1,u),quoted:!0,sourceQuote:g}),s=u+1;continue}let a=s,d;for(;a<i.length&&!/[{},]/.test(i[a]);)if(i[a]===":"){let g=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],u=!1;for(let f of g){let c=f.substring(1);if(i.substring(a+1,a+1+c.length)===c){u=!0,a+=c.length;break}}if(!u)break}else if(i[a]==="["){for(a++;a<i.length&&i[a]!=="]";){if(i[a]==='"'||i[a]==="'"){let g=i[a];for(a++;a<i.length&&i[a]!==g;)i[a]==="\\"&&a++,a++}a++}a<i.length&&i[a]==="]"&&a++}else a++;d=i.substring(s,a);let m=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(d)?m=t.NUMBER:d==="true"||d==="false"||d==="null"?m=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(d)&&(m=t.SELECTOR),o.push({type:m,value:d,quoted:!1}),s=a}return o}function n(i){let o="";for(let s=0;s<i.length;s++){let l=i[s];if("{}".includes(l.type)||"[]".includes(l.type)){o+=l.value;continue}if(l.type===t.COLON){o+=l.value;continue}if(l.type===t.COMMA){let a=i[s+1];if(a&&(a.type==="}"||a.type==="]"))continue;o+=l.value;continue}if(l.type===t.STRING&&l.quoted){let a=l.value;l.sourceQuote==="'"&&(a=a.replace(/\\'/g,"'"),a=a.replace(/(\\*)"/g,(d,m)=>m.length%2===0?m+'\\"':d)),o+=`"${a}"`;continue}if(l.type===t.NUMBER||l.type===t.BOOLEAN){o+=l.value;continue}if(l.type===t.SELECTOR||l.type===t.IDENTIFIER){o+=`"${l.value}"`;continue}o+=`"${l.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new ye("Invalid extraction rules syntax: "+i.message,i)}}var En="1",_n=/^[a-zA-Z0-9_-]+$/;function We(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!_n.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${_n})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],s=e.attr(o,"data-rules-version");if(s!==En)throw new ve(s);return{rules:Ae(e.text(o)),tagNode:o}}var wd=new Function("url","return import(url)");function Ln(e,t,r,n){let i=e.length,o=t.length,s=new Array(i).fill(-1);if(n){let p=new Set;for(let b=0;b<i;b++){let v=n[b];!(v>=0&&v<o)||p.has(v)||(s[b]=v,p.add(v))}}if(i===0||o===0)return s;let l=e.map(p=>Rn(p,r)),a=t.map(p=>Rn(p,r)),d=new Array(o).fill(!1);for(let p of s)p>=0&&(d[p]=!0);let m=new Map;a.forEach((p,b)=>{d[b]||m.set(p,m.has(p)?-1:b)});let g=new Map;l.forEach((p,b)=>{s[b]>=0||g.set(p,(g.get(p)||0)+1)}),l.forEach((p,b)=>{if(s[b]>=0||g.get(p)!==1)return;let v=m.get(p);v===void 0||v===-1||d[v]||(s[b]=v,d[v]=!0)});let u=[];for(let p=0;p<i;p++)s[p]<0&&u.push(p);let f=[];for(let p=0;p<o;p++)d[p]||f.push(p);if(u.length===0||f.length===0)return s;let c=i*o+1,h=bs(e,t,r),k=(p,b)=>h(p,b)*c+Math.abs(p-b);for(let[p,b]of ks(u,f,k))s[p]=b;return s}var Nn=e=>typeof e=="object"&&e!==null;function Rn(e,t){if(!Nn(t))return e==null?" null":String(e);let r=Object.keys(t);return JSON.stringify(r.map(n=>{let i=JSON.stringify(e?.[n]);return i===void 0?" undef":i}))}function bs(e,t,r){if(!Nn(r))return(l,a)=>e[l]===t[a]?0:1;let n=Object.keys(r),i=l=>n.map(a=>JSON.stringify(l?.[a])),o=e.map(i),s=t.map(i);return(l,a)=>{let d=o[l],m=s[a],g=0;for(let u=0;u<n.length;u++)d[u]!==m[u]&&g++;return g}}function ks(e,t,r){return e.length<=t.length?On(e,t,r,!1):On(t,e,(n,i)=>r(i,n),!0)}function On(e,t,r,n){let i=e.length,o=t.length,s=[];for(let g=0;g<=i;g++)s.push(new Float64Array(o+1).fill(1/0));let l=[];for(let g=0;g<=i;g++)l.push(new Uint8Array(o+1));for(let g=0;g<=o;g++)s[i][g]=0;for(let g=i-1;g>=0;g--)for(let u=o-1;u>=0;u--){let f=r(e[g],t[u])+s[g+1][u+1],c=s[g][u+1];f<=c?(s[g][u]=f,l[g][u]=1):s[g][u]=c}let a=[],d=0,m=0;for(;d<i&&m<o;)l[d][m]&&(a.push(n?[t[m],e[d]]:[e[d],t[m]]),d++),m++;return a}function ur(e,t,r,n,i,o,s,l={}){let a=e.find(t,r,l);if(i.length===0){a.forEach(_=>e.remove(_)),dr(l,"onRowsApplied",o.path,[]);return}let d=i.length>a.length,m=a[0]||null;if(d&&!m&&(m=ws(e,t,r,l),!m))throw new ne(o.path);let g=a.map(_=>xs(e,_,n,l)),u=null;if(d&&m){u=e.clone(m),l.templateAttr&&e.removeAttr(u,l.templateAttr);let _=e.stripIds(u);_>0&&console.warn(`[hyper-html-api] stripped ${_} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let f=Ln(i,g,n,ys(e,a,i,o,l)),c=a.length>0?e.parent(a[0]):Ss(e,t,r,m,o,l),h=a.length>0?Pn(e,c,a[0]):0,k=Rs(e,a),p=new Set,b=[],v=i.map((_,w)=>{let T=f[w];if(T>=0)return p.add(T),b.push(!1),a[T];b.push(!0);let R=e.clone(u);return e.stripIds(R),R});a.forEach((_,w)=>{p.has(w)||e.remove(_)}),k?Cs(e,c,h,v,b):Os(e,v,b,c,h),vs(e,v,n,i,o,s,l),dr(l,"onRowsApplied",o.path,v)}function dr(e,t,r,n){if(typeof e[t]=="function")try{return e[t](r.slice(),n)}catch(i){console.warn(`[hyper-html-api] ${t} threw at "${r.join(".")||"(root)"}"`,i);return}}function ys(e,t,r,n,i){let o=dr(i,"identifyRows",n.path,r);if(!Array.isArray(o))return null;let s=new Array(r.length).fill(-1),l=new Set,a=new Map(t.map((d,m)=>[e.identity(d),m]));for(let d=0;d<r.length;d++){if(!o[d])continue;let m=a.get(e.identity(o[d]));m===void 0||l.has(m)||(s[d]=m,l.add(m))}return s}function vs(e,t,r,n,i,o,s){t.forEach((l,a)=>{if(r===null){let d=n[a],m=d==null?"":String(d);e.text(l)!==m&&e.text(l,m)}else{let d=o(e,l,r,n[a],{depth:i.depth+1,path:[...i.path,a]},s);d&&d!==l&&(t[a]=d)}})}function xs(e,t,r,n){return r===null?e.text(t):ie(e,t,r,n.onRowsRead?{...n,onRowsRead:void 0}:n)}function Pn(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function ws(e,t,r,n){if(!n.templateAttr)return null;let i=/^\s*:scope\s*>\s*/.test(r),o=new RegExp(":not\\(\\["+n.templateAttr.replace(/[.*+?^${}()|[\]\\-]/g,"\\$&")+"\\]\\)","g"),s=r.replace(/^\s*:scope\s*>\s*/,"").replace(o,""),l=i?As(s):0,a=ir(s),d=t;for(;d;){let m=e.find(d,s,{includeRulesTag:!1,templateAttr:null});for(let g of m)if(e.attr(g,n.templateAttr)!=null&&!(i&&!Es(e,t,g,l))&&!(a&&!e.matches(e.parent(g),a)))return g;d=e.parent(d)}return null}function As(e){let t=0,r=null,n=1;for(let i=0;i<e.length;i++){let o=e[i];if(o==="\\")i++;else if(r)o===r&&(r=null);else if(o==='"'||o==="'")r=o;else if(o==="["||o==="(")t++;else if(o==="]"||o===")")t>0&&t--;else if(t===0&&o===">")n++;else{if(t===0&&(o==="+"||o==="~"))return null;if(t===0&&/\s/.test(o)){if(!_s(e,i))return null;for(;i+1<e.length&&/\s/.test(e[i+1]);)i++}}}return n}function _s(e,t){let r=t;for(;r<e.length&&/\s/.test(e[r]);)r++;let n=t>0?e[t-1]:"",i=r<e.length?e[r]:"";return Mn(n)||Mn(i)}function Mn(e){return e===">"||e==="+"||e==="~"}function Es(e,t,r,n){if(n===null)return!0;let i=r;for(let a=0;a<n;a++)if(i=e.parent(i),!i)return!1;let o=e.prop(t,"tagName");if(!o)return!0;let s=e.prop(i,"tagName");if(!s||String(s).toLowerCase()!==String(o).toLowerCase())return!1;let l=new Set(jn(e,i));return jn(e,t).every(a=>l.has(a))}function jn(e,t){let r=e.attr(t,"class");return r?String(r).split(/\s+/).filter(Boolean):[]}function Ss(e,t,r,n,i,o){let s=e.parent(n);if(s&&Ts(e,t,s)&&!Fn(e,s,o))return s;let l=ir(r);if(!l)throw new ne(i.path,`the list selector "${r}" names no container to hold the new rows \u2014 write it as "container > row" (for example "ol.comments > li") so the cloned row lands in the list`);let d=(l===":scope"?e.prop(t,"tagName")?[t]:[]:e.find(t,l,o)).filter(m=>!Fn(e,m,o));if(d.length===0)throw new ne(i.path,`no container matching "${l}" inside this context to hold the new rows`);if(d.length>1)throw new ne(i.path,`"${l}" matches ${d.length} containers inside this context, so the new rows have no single destination`);return d[0]}function Ts(e,t,r){let n=r;for(;n;){if(e.sameNode(n,t))return!0;n=e.parent(n)}return e.parent(t)?!1:e.find(t,"*",{includeRulesTag:!0,templateAttr:null}).some(i=>e.sameNode(i,r))}var In=["no-data","editor-ui"];function Fn(e,t,r){let n=t;for(;n;){if(r.templateAttr&&e.attr(n,r.templateAttr)!=null||In.some(o=>e.attr(n,o)!=null))return!0;let i=e.attr(n,"clay");if(i&&i.split(/\s+/).some(o=>In.includes(o)))return!0;n=e.parent(n)}return!1}function Cs(e,t,r,n,i){let o=e.children(t),s=o.map(a=>e.identity(a)),l=!1;n.forEach((a,d)=>{let m=e.identity(a),g=r+d;if(s[g]===m)return;if(!i[d]){let f=s.indexOf(m);f!==-1&&(s.splice(f,1),o.splice(f,1))}let u=Math.min(g,o.length);u<o.length?e.insertBefore(o[u],a):o.length?l?e.insertAfter(o[o.length-1],a):(e.insertAt(t,a,g),l=!0):e.insertAt(t,a,0),s.splice(u,0,m),o.splice(u,0,a)})}function Rs(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=new Map(e.children(r).map((o,s)=>[e.identity(o),s])),i=[];for(let o of t){let s=n.get(e.identity(o));if(s===void 0)return!1;i.push(s)}return i.sort((o,s)=>o-s),i[i.length-1]-i[0]===i.length-1}function Os(e,t,r,n,i){let o=null,s=i;for(let l=0;l<t.length;l++){if(!r[l]){o=t[l];continue}let a=o?e.parent(o):n;if(!a)continue;let d=o?Pn(e,a,o)+1:s++;e.insertAt(a,t[l],d),o=t[l]}}function _e(e,t,r,n,i={}){if(Object.prototype.hasOwnProperty.call(i,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");let o=[];if(mr(r,n,[],o),o.length)throw new ze(o);ht(e,t,r,n,{depth:0,path:[]},i)}function ht(e,t,r,n,i,o={}){if(i.depth>xe)throw new ue(i.path);if(n===void 0)return t;if(typeof r=="string")return Ls(e,t,r,n,i,o);if(Array.isArray(r)){let[s,l]=r;return ur(e,t,s,l,n,i,ht,o),t}if(typeof r=="object"&&r!==null){for(let[s,l]of Object.entries(r)){let a=ht(e,t,l,n==null?n:n[s],{depth:i.depth+1,path:[...i.path,s]},o);a&&a!==t&&(t=a)}return t}return t}function Ls(e,t,r,n,i,o){if(r.endsWith("[]")){let a=r.slice(0,-2);return ur(e,t,a,null,n,i,ht,o),t}if(r.startsWith("@"))return qn(e,t,r.slice(1),n);let s=P(r);if(s!==-1){let a=r.slice(0,s),d=r.slice(s+1),m=a?e.find(t,a,o):[t];return m.length===0||qn(e,m[0],d,n),t}if(r===".")return Dn(e,t,n),t;let l=e.find(t,r,o);return l.length===0||Dn(e,l[0],n),t}function Dn(e,t,r){let n=r==null?"":String(r);e.text(t)!==n&&e.text(t,n)}function qn(e,t,r,n){if(ke.has(r)){let i=e.prop(t,r);if(i===n||i!=null&&n!=null&&String(i)===String(n))return t;throw new Be(r)}if(r==="outerHTML"){let i=n==null?"":String(n);return e.replaceWith(t,i)}if(rr.has(r)){let i=nr(r,n);return e.prop(t,r)!==i&&e.prop(t,r,i),t}if(n==null)e.attr(t,r)!=null&&e.removeAttr(t,r);else{let i=String(n);e.attr(t,r)!==i&&e.attr(t,r,i)}return t}function mr(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:Ge([...r,o]),expected:"scalar",got:Ke(i)})}):n.push({path:Ge(r),expected:"array",got:Ke(t)});return}t!==null&&typeof t=="object"&&n.push({path:Ge(r),expected:"scalar",got:Ke(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:Ge(r),expected:"array",got:Ke(t)});return}let i=e[1];t.forEach((o,s)=>mr(i,o,[...r,s],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:Ge(r),expected:"object",got:Ke(t)});return}for(let[i,o]of Object.entries(e))mr(o,t[i],[...r,i],n)}}}function Ke(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function Ge(e){return e.join(".")}var Us=Object.freeze({refusedRuleForms:["innerHTML","outerHTML"],refusedTargets:["script","style","template","noscript","iframe","object","embed","xmp","plaintext","noembed","noframes","meta","link","base","animate","set","animatemotion","animatetransform"],refusedAttributes:["style","srcdoc","is","http-equiv","sandbox","allow","nonce","integrity","charset","htmlclaytoken","htmlclayid","data-rules-name","data-rules-version","clay","contenteditable",...pn],refusedAttributePrefixes:["on"],urlAttributes:["href","src","srcset","action","formaction","poster","cite","data","ping","background","longdesc","usemap","xlink:href","manifest","codebase","icon"],refusedSchemes:["javascript","vbscript","data"]});function hr(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return We(e,n,r)}return null}var H={extract:(e,t,r={})=>ie(Q(e,r),e,t,r),apply:(e,t,r,n={})=>_e(Q(e,{...n,_write:!0}),e,t,r,n),findRulesIn:(e,t)=>We(we,e,t),findRules:(e,t)=>hr(we,e,t),bind:(e,t,r={})=>{let n=hr(we,e,t);if(!n){let i=typeof t=="string"?`data-rules-name~="${t}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${i}`)}return{...n,get:()=>ie(Q(e,r),e,n.rules,r),set:i=>_e(Q(e,{...r,_write:!0}),e,n.rules,i,r)}},parseStrict:cr,parseRelaxed:Ae,ruleAttrIndex:P,splitRule:$e,errors:ut,DOM_PROPERTIES:at};var pr={};tr(pr,{fromString:()=>ee,getRuleAtPath:()=>me,getValueAtPath:()=>Gs,setAtPath:()=>fr,toString:()=>Ks});function Ks(e){return e.map(String).join(".")}function ee(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function me(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Gs(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function fr(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=fr(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:fr((e||{})[n],i,r)}}function Ye(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=Ye(n);return t}return""}import Ys from"./hyper-morph.vendor.js";function ft(e,t,{ignoreActiveValue:r=!0}={}){Ys.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property",policy:"raw"})}import{morph as Wn}from"./hyper-morph.vendor.js";var zn=new WeakMap,gr=e=>e.map(String).join(".");function Xs(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function Bn(e,t){if(!e||!e.querySelector)return null;let r=e.querySelector(`[data-hcms-path="${Xs(t)}"]`),n=r&&r.querySelector(".hcms-array-items");return n?Array.from(n.children).filter(i=>i.matches&&i.matches("[data-hcms-card], [data-hcms-array-item]")):null}function Un(e,t,r){let n=Bn(e,t);!n||n.length!==r.length||n.forEach((i,o)=>{r[o]&&zn.set(i,r[o])})}function pt(){let e=new Map;return{hooks:{onRowsRead(t,r){e.set(gr(t),r)}},seed(t){for(let[r,n]of e)Un(t,r,n);e.clear()}}}function Hn(e){return{identifyRows(t,r){let n=Bn(e,gr(t));return!n||n.length!==r.length?null:n.map(i=>zn.get(i)||null)},onRowsApplied(t,r){Un(e,gr(t),r)}}}var Vn={skip:"[data-hcms-shell]",templateAttr:"cms-template"},br="data-hcms-rollback-ui",Js=0;function Kn(e,t,r,n={}){return Zs(e,t,r,n)}function Zs(e,t,r,n){let{shellRoot:i,structural:o,structuralPath:s,formRoot:l}=n,a=l?{...Vn,...Hn(l)}:Vn;if(!o)try{return H.apply(e,t,r,a),{ok:!0}}catch(u){return{ok:!1,error:u}}let d=Qs(e,t,s),m=d?tl(d):null,g=d?null:nl(e,i);try{return H.apply(e,t,r,a),{ok:!0}}catch(u){return m?rl(d,m):g&&il(e,i,g),{ok:!1,error:u}}}function Qs(e,t,r){if(!r||!e)return null;let n=ee(r),i=[],o=t;for(let s of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&s in o){if(i.push(s),o=o[s],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:el(e,t,i)}function el(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let s=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let l=i[s];if(l==null)return null;if(o===r.length-1){if(Array.isArray(l)){let[a]=l;return n.querySelector?.(a)?.parentElement||null}if(typeof l=="string"&&l.endsWith("[]")){let a=l.slice(0,-2);return n.querySelector?.(a)?.parentElement||null}return null}i=l}return null}function tl(e){let t=[],r=[];for(let n of Array.from(e.childNodes))t.push(kr(n,r));return{nodes:t,retained:r}}function rl(e,t){let r=e.cloneNode(!1);for(let n of t.nodes)r.appendChild(n);Wn(e,Array.from(r.childNodes),Yn()),Gn(e,t.retained)}function nl(e,t){let r=[],n=[];for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||r.push(kr(i,n));return{nodes:r,retained:n}}function il(e,t,r){let n=e.cloneNode(!1);for(let i of r.nodes)n.appendChild(i);Wn(e,Array.from(n.childNodes),Yn()),Gn(e,r.retained)}function kr(e,t){let r=e.cloneNode(!1);if(e.nodeType===1&&e.matches('[editor-ui],[clay~="editor-ui"]')){let o=String(++Js);r.setAttribute(br,o),t.push({id:o,node:e})}let n=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,i=r.nodeType===1&&r.tagName==="TEMPLATE"?r.content:r;for(let o of Array.from(n.childNodes||[]))i.appendChild(kr(o,t));return r}function Gn(e,t){for(let{id:r,node:n}of t){let i=e.querySelector(`[${br}="${r}"]`);i===n?n.removeAttribute(br):n.isConnected?i?.remove():i?.replaceWith(n)}}function Yn(){return{morphStyle:"innerHTML",policy:"raw",restoreFocus:!1,scripts:{handle:!1,merge:!1}}}function bt(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var ol='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',yr='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',Zn={"@scalar":`
    <label class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <textarea class="mirk-textarea" rows="1" data-hcms-field></textarea>
      <div class="hcms-error" hidden></div>
    </label>
  `,"@object":`
    <section class="hcms-object" data-hcms-shape="object">
      <h3 class="hcms-object-title" data-hcms-label></h3>
      <div class="hcms-object-fields"></div>
      <div class="hcms-error" hidden></div>
    </section>
  `,"@scalar-array":`
    <section class="hcms-array hcms-scalar-array" data-hcms-shape="scalar-array">
      <header class="hcms-array-header">
        <h3 class="hcms-array-title" data-hcms-label></h3>
      </header>
      <ul class="hcms-array-items"></ul>
      <div class="hcms-error" hidden></div>
      <button type="button" class="hcms-add mirk-button mirk-button--small" data-hcms-action="add"><span class="mirk-button__label">+ Add</span></button>
    </section>
  `,"@scalar-array-item":`
    <li class="hcms-array-item" draggable="true">
      <input class="mirk-input" data-hcms-field />
      <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
      <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
      <button type="button" class="hcms-remove" data-hcms-action="remove" aria-label="Remove">\xD7</button>
      <div class="hcms-error" hidden></div>
    </li>
  `,"@object-array":`
    <section class="hcms-array hcms-object-array hcms-array--cards" data-hcms-shape="object-array">
      <header class="hcms-array-header">
        <h3 class="hcms-array-title" data-hcms-label></h3>
      </header>
      <div class="hcms-array-items"></div>
      <div class="hcms-error" hidden></div>
      <button type="button" class="hcms-add mirk-button mirk-button--small" data-hcms-action="add"><span class="mirk-button__label">+ Add</span></button>
    </section>
  `,"@object-array-item":`
    <article class="hcms-card mirk-sortable__item" draggable="true">
      ${ol}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${yr}</button>
        </div>
      </div>
      <div class="hcms-error" hidden></div>
    </article>
  `,"@file":`
    <div class="hcms-field hcms-upload hcms-upload--file" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <div class="mirk-file mirk-file--compact mirk-file--round">
        <label class="mirk-button mirk-button--round mirk-button--small">
          <input type="file" data-hcms-upload />
          <span class="mirk-button__label">Choose</span>
        </label>
        <a class="mirk-file__name" data-hcms-field></a>
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${yr}</button>
      </div>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@image":`
    <div class="hcms-field hcms-upload hcms-upload--image" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <div class="mirk-image mirk-image--compact mirk-image--rounded">
        <label class="mirk-button mirk-button--small mirk-image__upload">
          <input type="file" accept="image/*" data-hcms-upload />
          <span class="mirk-button__label">Upload image</span>
        </label>
        <figure class="mirk-image__thumb">
          <span class="mirk-image__frame"><img class="mirk-image__preview" data-hcms-field alt="" /></span>
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${yr}</button>
        </figure>
      </div>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@checkbox":`
    <div class="hcms-field hcms-field--row" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <label class="mirk-checkbox">
        <input type="checkbox" class="mirk-sr-only" data-hcms-field />
        <span class="mirk-checkbox__box"><span class="mirk-checkbox__mark"></span></span>
      </label>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@toggle":`
    <div class="hcms-field hcms-field--row" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <label class="mirk-toggle">
        <input type="checkbox" role="switch" class="mirk-sr-only" data-hcms-field />
        <span class="mirk-toggle__track"><span class="mirk-toggle__thumb"></span></span>
      </label>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@select":`
    <label class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <div class="mirk-select">
        <select class="mirk-select__field" data-hcms-field></select>
        <span aria-hidden="true" class="mirk-select__chevron">\u203A</span>
      </div>
      <div class="hcms-error" hidden></div>
    </label>
  `,"@radio":`
    <div class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <div class="hcms-radio-row">
        <label class="mirk-radio">
          <input type="radio" class="mirk-sr-only" data-hcms-field />
          <span class="mirk-radio__ring"><span class="mirk-radio__fill"></span><span class="mirk-radio__dot"></span></span>
          <span class="mirk-radio__label"></span>
        </label>
      </div>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@textarea":`
    <label class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <textarea class="mirk-textarea" rows="3" data-hcms-field></textarea>
      <div class="hcms-error" hidden></div>
    </label>
  `,"@richtext":`
    <div class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <div class="mirk-textarea hcms-richtext" contenteditable="true" data-hcms-field></div>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@number":`
    <label class="hcms-field" data-hcms-shape="scalar">
      <span class="hcms-label" data-hcms-label></span>
      <input class="mirk-input" type="number" data-hcms-field />
      <div class="hcms-error" hidden></div>
    </label>
  `,"@chips":`
    <div class="hcms-field hcms-chips" data-hcms-shape="scalar-array">
      <span class="hcms-label" data-hcms-label></span>
      <div class="mirk-tags hcms-array-items"></div>
      <button type="button" class="hcms-add mirk-button mirk-button--small" data-hcms-action="add"><span class="mirk-button__label">+ Add</span></button>
      <div class="hcms-error" hidden></div>
    </div>
  `,"@chips-item":`
    <span class="mirk-tags__chip" data-hcms-array-item>
      <input class="hcms-chip-field" data-hcms-field aria-label="Item" placeholder="\u2026" />
      <button type="button" class="hcms-remove" data-hcms-action="remove" aria-label="Remove">\xD7</button>
    </span>
  `},sl=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function kt(e){let t=e.head||e.documentElement;if(t)for(let r of sl)ri(e,t,r)}function vr(e,t){if(!Zn[t])return null;let r=e&&(e.head||e.documentElement);return r?ri(e,r,t):null}var Xn={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},gt={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},ll=new Set([...Object.values(gt),"@chips","@chips-item"]);function Xe(e,t,r,n){if(typeof e!="string")return"@scalar";let i=P(e),o=xt(e,i,r,n),s=wt(o,t,"data-hcms-component");if(s&&gt[s]){let l=gt[s],a=Array.isArray(r)&&r.some(d=>d==="*"||typeof d=="number");return l==="@number"&&!Jn(e,i,t,a,o).every(cl)||(l==="@checkbox"||l==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!Jn(e,i,t,a,o).every(dl)?"@scalar":l}if(i>=0){let l=e.slice(i+1);if(Xn[l])return Xn[l]}return"@scalar"}function Qn(e,t,r,n){if(typeof e!="string")return null;let i=P(e),o=wt(xt(e,i,r,n),t,"data-hcms-component");return o&&gt[o]||null}var al=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function cl(e){return e==null||e===""?!0:al.test(String(e))}function dl(e){return e==null||e===""||e==="true"||e==="false"}function Jn(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let s=t>=0?e.slice(t+1):null,l=[];for(let a of o)if(!(a.closest&&a.closest("[cms-template], [data-hcms-shell]"))&&(s?s==="value"&&"value"in a?l.push(a.value):l.push(a.getAttribute?a.getAttribute(s):null):l.push((a.textContent||"").trim()),!n))break;return l}function yt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function Ee(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&J(r,n)||i&&i!==n&&J(r,i)||J(r,t)}function vt(e,t,r){let n=yt(e,r);if(!n)return null;let i=Ee(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function ei(e,t,r,n){if(typeof e!="string")return null;let i=P(e),o=wt(xt(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let s=o.trim().split(/\s+/).filter(Boolean);return s.length?s:null}function ti(e,t,r,n){if(typeof e!="string")return null;let i=P(e);return wt(xt(e,i,r,n),t,"data-hcms-crop")}function ul(e,t){return t>=0?e.slice(0,t):e}function xt(e,t,r,n){let i=ul(e,t);return i&&i!=="."?i:ml(n,r)}function ml(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function wt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function At(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=he(n);if(o==="scalar"){let s=Xe(n,e,i,t);ll.has(s)&&vr(e,s);return}if(o==="scalar-array"){let s=yt(n,e);s&&(vr(e,s.array),vr(e,s.item));return}if(o==="object"){for(let[s,l]of Object.entries(n))r(l,[...i,s]);return}if(o==="object-array"){let s=n[1],l=[...i,"*"];if(s&&typeof s=="object"&&!Array.isArray(s))for(let[a,d]of Object.entries(s))r(d,[...l,a]);else r(s,l)}}}function ri(e,t,r){let n=J(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=Zn[r].trim(),t.appendChild(i),i}function J(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${hl(t)}"]`)}function hl(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function he(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Je(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var ni={IMG:"src",A:"href"};function _t(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":ni[t]?ni[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function ii(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=_t(e),s=`${si(r,n)}[data-hcms-field="${Se(t)}"]`;return r==="INPUT"&&n==="radio"?`${s}:checked@value`:i?`${s}@${i}`:s}function fl(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=_t(e),o=`${si(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function si(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Se(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var oi=new Set(["__proto__","constructor","prototype"]);function Et(e,t){return r(e,[]);function r(d,m){let g=he(d);if(g==="scalar")return n(d,m);if(g==="scalar-array")return i(d,m);if(g==="object-array")return o(d,m);if(g==="object"){let u=Object.create(null);for(let[f,c]of Object.entries(d)){if(oi.has(f))throw new Error(`hypercms: rule key "${f}" is forbidden at "${m.join(".")||"<root>"}"`);u[f]=r(c,[...m,f])}return u}return null}function n(d,m){let g=m.length?m[m.length-1]:null,u=typeof g=="string"?g:"__value",f=a(m,u);if(f)return ii(f,u);let c=l(Xe(d,t,m,e),u);return c?ii(c,u):`input[data-hcms-field="${Se(u)}"]@value`}function i(d,m){let g=vt(d,m,t),u=g&&l(g.item,null)||l("@scalar-array-item",null),f=u?fl(u):"input[data-hcms-field]@value";return[s(m,"[data-hcms-array-item]"),f]}function o(d,m){let[,g]=d,u=[...m,"*"],f=s(m,"[data-hcms-card]");if(g&&typeof g=="object"&&!Array.isArray(g)){let c=Object.create(null);for(let[h,k]of Object.entries(g)){if(oi.has(h))throw new Error(`hypercms: rule key "${h}" is forbidden at "${u.join(".")}"`);c[h]=r(k,[...u,h])}return[f,c]}return[f,r(g,[...u,0])]}function s(d,m){let g=d.length?d[d.length-1]:"",u=d.some(h=>h==="*"),f=d.join(".");return`${u?`[data-hcms-field="${Se(g)}"]`:`[data-hcms-path="${Se(f)}"]`} > .hcms-array-items > ${m}`}function l(d,m){if(!t)return null;let g=J(t,d);if(!g)return null;let u=g.content||g;if(m){let f=u.querySelector(`[data-hcms-field="${Se(m)}"]`);if(f)return f}return u.querySelector("[data-hcms-field]")}function a(d,m){if(!t)return null;let g=d.map(c=>typeof c=="number"?"*":c).join("."),f=[d.join("."),g];for(let c=d.length-1;c>=0;c--){let h=d.slice(0,c).map(k=>typeof k=="number"?"*":k);h.push("*"),f.push(h.join("."))}for(let c of f){if(!c)continue;let h=J(t,c);if(!h||!Je(h))continue;let k=h.content||h,p=k.querySelector(`[data-hcms-field="${Se(m)}"]`)||k.querySelector("[data-hcms-field]");if(p)return p}return null}}function xr(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function Te({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=wr(e,[],r,n,e);return o&&i.appendChild(o),i}function ai({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:s}){if(e==="object-array-item")return di(t,r,n,i,s);if(e==="scalar-array-item")return ui(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function wr(e,t,r,n,i){let o=he(e);return o==="scalar"?pl(e,t,r,n,i):o==="object"?yl(e,t,r,n,i):o==="object-array"?vl(e,t,r,n,i):o==="scalar-array"?xl(e,t,r,n):null}function pl(e,t,r,n,i){let o=Xe(e,n,t,i),s=Ee(t,o,n);if(!s)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let l=Qn(e,n,t,i);l==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(l==="@checkbox"||l==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${l}" but its value isn't true/false; rendering a text input so the value is preserved`),ci(s,l===o?l:null,t);let a=Ce(s,n);Re(a,t);let d=s.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&d===o&&gl(a,e,t,r,n,o,i),o==="@image"&&d==="@image"){let m=ti(e,n,t,i);m!=null&&!a.hasAttribute("data-hcms-crop")&&a.setAttribute("data-hcms-crop",m)}return wl(a,te(t)),St(a,te(t)),Tt(a,te(t)),gi(a,r),o==="@file"&&kl(a),a}function ci(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function gl(e,t,r,n,i,o,s){let l=ei(t,i,r,s),a=l?[...l]:[],d=n==null?"":String(n);if(d!==""&&!a.includes(d)&&a.unshift(d),!l&&(bl(e,"data-hcms-options required (space-separated values)"),a.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let u=e.querySelector("select[data-hcms-field]");if(!u)return;for(let f of a){let c=i.createElement("option");c.value=f,c.textContent=bt(f),u.appendChild(c)}return}let m=e.querySelector(".mirk-radio");if(!m||!m.parentNode)return;let g=Ar(r.join("."));for(let u of a){let f=m.cloneNode(!0),c=f.querySelector('input[type="radio"]');c&&(c.value=u,c.name=g);let h=f.querySelector(".mirk-radio__label");h&&(h.textContent=bt(u)),m.parentNode.insertBefore(f,m)}m.remove()}function Ar(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function bl(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function kl(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=xr(t.getAttribute("href")))}function yl(e,t,r,n,i){let o=Ee(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let s=Ce(o,n);if(Re(s,t),St(s,te(t)),Tt(s,te(t)),Je(o))return ki(s,e,t),bi(s,e,r),s;let l=Ct(s,".hcms-object-fields",o,t);for(let[a,d]of Object.entries(e)){let m=r==null?null:r[a],g=wr(d,[...t,a],m,n,i);g&&l.appendChild(g)}return s}function vl(e,t,r,n,i){let o=Ee(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let s=Ce(o,n);Re(s,t),St(s,te(t)),Tt(s,te(t)),hi(s,o),pi(s,o,t);let l=Ct(s,".hcms-array-items",o,t),[,a]=e;return(Array.isArray(r)?r:[]).forEach((m,g)=>{let u=di(a,[...t,g],m,n,i);u&&l.appendChild(u)}),fi(s),s}function di(e,t,r,n,i){let o=mi(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let s=Ce(o,n);if(s.setAttribute("data-hcms-card",""),s.classList.contains("hcms-card")||s.classList.add("hcms-card"),Re(s,t),Je(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(ki(s,e,t),bi(s,e,r)),s;let l=Ct(s,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[a,d]of Object.entries(e)){let m=r==null?null:r[a],g=wr(d,[...t,a],m,n,i);g&&l.appendChild(g)}return s}function xl(e,t,r,n){let i=yt(e,n),o=vt(e,t,n),s=i?i.array:"@scalar-array",l=Ee(t,s,n);if(!l)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);ci(l,i?i.array:null,t);let a=Ce(l,n);Re(a,t),St(a,te(t)),Tt(a,te(t)),hi(a,l),pi(a,l,t),o&&a.setAttribute("data-hcms-item-tpl",o.item);let d=Ct(a,".hcms-array-items",l,t);return(Array.isArray(r)?r:[]).forEach((g,u)=>{let f=ui([...t,u],g,n,o?o.item:null);f&&d.appendChild(f)}),fi(a),a}function ui(e,t,r,n){let i=mi(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Ce(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Re(o,e),gi(o,t),o}function mi(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return J(r,i)||n&&J(r,n)||J(r,"@"+t)}function Ce(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Re(e,t){e.setAttribute("data-hcms-path",t.join("."))}function wl(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function St(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function Tt(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=bt(String(t)))})}function hi(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function fi(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=li(e,"data-hcms-max-items"),o=li(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),l=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector('[data-hcms-action="add"]');d&&(d.hidden=s||i!=null&&n>=i),r.forEach((m,g)=>{let u=m.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=l||o!=null&&n<=o);let f=m.querySelector('[data-hcms-action="move-up"]');f&&(f.hidden=a||g===0);let c=m.querySelector('[data-hcms-action="move-down"]');c&&(c.hidden=a||g===n-1)})}function li(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function pi(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function te(e){return e.length?e[e.length-1]:null}function gi(e,t){let r=Al(e);if(r.length!==0)for(let n of r)yi(n,t)}function Al(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&_l(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function _l(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function bi(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let s=r==null?null:r[o];yi(i,s)})}function ki(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let s=[...r,o].join(".");i.setAttribute("data-hcms-path",s)})}function Ct(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function yi(e,t){let r=_t(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var El={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,onSnapshot:(e,t)=>e?.onSnapshot??t?.onSnapshot,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,upload:(e,t)=>e?.upload??(t?.uploadFileBasic?Tl(t.uploadFileBasic):null)},Sl={402:"payment-required",413:"too-large",415:"unsupported-type",401:"unauthorized",403:"forbidden",404:"not-found"},_r=()=>({ok:!1,msg:"Upload cancelled",msgType:"skipped",code:"aborted",uploads:[]});function Tl(e){return async function(r,{onProgress:n,signal:i}={}){if(i?.aborted)return _r();try{let o=await e(r,{onProgress:l=>{n?.({loaded:null,total:null,percent:l})}});if(i?.aborted)return _r();let s=o&&o.uploads||[];return typeof s[0]?.url!="string"?{ok:!1,msg:"The host accepted the file but did not say where it put it",msgType:"error",code:"bad-response",uploads:[]}:{ok:!0,msg:o.msg||"Uploaded",msgType:o.msgType||"success",code:o.code||null,uploads:s}}catch(o){if(i?.aborted)return _r();let s={};try{s=JSON.parse(o?.response||"{}")}catch{s={}}let l=s.code||Sl[o?.status]||"error";return{ok:!1,msg:o&&o.message||"Upload failed",msgType:"error",code:l,uploads:[]}}}}function $(e,t){let r=El[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var vi=["clay:mutation-ready","hyperclay:mutation-ready"],xi=["clay:sync-applied","hyperclay:livesync-applied"],wi=["clay:ready","hyperclay:ready"];function Oe(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}var Z="data-hcms-bound",oe="data-hcms-bound-id",Er=new Map;function Ai(e,t){Er.set(e,t)}function _i(e){Er.delete(e)}function Ei(e){let t=e.getAttribute(oe);if(!t)return null;let r=Er.get(t);return!r||!r.restorable()?null:r.originalHTML}var fe="data-hcms-owns-richclay";function Le(e){return e&&e.richclay&&e.richclay.RichClay||$("RichClay",e)||(e&&typeof e.RichClay=="function"?e.RichClay:null)}function Si(e,t,r){!e||typeof e.setAttribute!="function"||(e.setAttribute(Z,t?"rich":"plain"),r&&e.setAttribute(fe,"true"))}function Ti(e,t){if(!e||typeof e.querySelectorAll!="function")return;let r=e.querySelectorAll(`[${Z}]`);if(!r.length)return;let n=Le(t);if(n&&typeof n.stripFromClone=="function")try{n.stripFromClone(e)}catch(i){console.warn("[hypercms] richclay strip failed; editor state may reach the save",i)}for(let i of r)i.getAttribute(fe)==="true"&&i.removeAttribute("data-richclay"),i.removeAttribute(fe),i.removeAttribute(Z)}function Ci(e,t){if(!e||typeof e.removeAttribute!="function")return;let r=Le(t);if(r&&typeof r.stripElement=="function")try{r.stripElement(e)}catch(n){console.warn("[hypercms] richclay element strip failed; the clone stays editable",n)}else e.removeAttribute("contenteditable"),e.removeAttribute("no-undo");e.getAttribute(fe)==="true"&&e.removeAttribute("data-richclay"),e.removeAttribute(fe),e.removeAttribute(Z),e.removeAttribute(oe)}function Ri(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||P(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,s]of Object.entries(n))i[o]=r(s);return i}return n}}function Oi(e,t){if(!t||e==null)return e;return r(e,[t]);function r(n,i){if(typeof n=="string")return n.endsWith("[]")||P(n)!==-1?n:i.some(o=>Cl(o,n))?n+"@innerHTML":n;if(Array.isArray(n)){let[o,s]=n;if(typeof o!="string"||!o)return n;let l=Rl(t,o);return l.length?[o,r(s,l)]:n}if(n&&typeof n=="object"){let o=Object.create(null);for(let[s,l]of Object.entries(n))o[s]=r(l,i);return o}return n}}function Cl(e,t){let r=null;try{r=e.querySelector(t)}catch{return!1}return r?r.hasAttribute(Z)?r.getAttribute(Z)==="rich":r.children.length>0:!1}function Rl(e,t){try{return[...e.querySelectorAll(t)]}catch{return[]}}function Ne(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function se(e,t,r=!0){if(!e||!e.querySelectorAll||(e.querySelectorAll("textarea[data-hcms-field]").forEach(Ne),r===!1))return;let n=t&&t.defaultView||(typeof window<"u"?window:null),i=Le(n);i&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(o=>{if(o.__hcmsRichclay)return;let s;try{s=new i(o,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(a){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",a);return}o.__hcmsRichclay=s;let l=s&&s.squire;l&&typeof l.addEventListener=="function"&&l.addEventListener("input",()=>{let a=n&&n.Event||Event;o.dispatchEvent(new a("input",{bubbles:!0}))})})}var Sr=new WeakSet;function pe(e,t){let r=$("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function re(e){let t=$("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Lt(e){let{formRoot:t}=e;if(!t||Sr.has(t))return;Sr.add(t);let r=s=>{let l=s.target;!l||!l.closest||l.closest("[data-hcms-form-root]")&&l.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(l.tagName==="TEXTAREA"&&Ne(l),!l.matches('input[type="file"]')&&(!l.closest("[data-hcms-field]")&&!l.hasAttribute?.("data-hcms-field")||Li(l,e)))},n=s=>{let l=s.target;if(!(!l||!l.closest)&&l.closest("[data-hcms-form-root]")){if(l.matches('input[type="file"][data-hcms-upload]')){Pl(l,e);return}l.matches('input[type="checkbox"], input[type="radio"], select')&&Li(l,e)}},i=s=>{let l=s.target;if(!l||!l.closest)return;let a=l.closest("[data-hcms-action]");if(!a)return;let d=a.getAttribute("data-hcms-action");if(d==="add"||d==="remove"||d==="move-up"||d==="move-down"||d==="clear-upload"){if(!a.closest("[data-hcms-form-root]"))return}else if(d==="close"&&!a.closest("[data-hcms-shell]"))return;if(d==="add"){let m=a.closest("[data-hcms-path]");if(!m)return;let g=m.getAttribute("data-hcms-path");Ze(g,e)}else if(d==="remove"){let m=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;Rr(m,e)}else if(d==="move-up"||d==="move-down"){let m=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;Cr(m,d==="move-up"?-1:1,e)}else d==="clear-upload"?zl(a,e):d==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),Sr.delete(t)}}var Ol=new Set(["value","checked"]);function Ll(e,t){if(!t)return null;let r=ee(t);if(r.some(a=>typeof a=="number"||a==="*"))return null;let n=me(e.pageRules,r);if(typeof n!="string")return null;let i=H.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!Ol.has(o))return null;let s=n.slice(0,i),l=s?e.pageRoot.querySelector(s):e.pageRoot;return l?{el:l,prop:o,oldValue:l[o]}:null}function Li(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=Ll(t,n);if(K(V(t),{path:n,structural:!1},t),i){let o=$("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var Nl={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function Ml(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=$("quickcrop");if(typeof n!="function")return{file:e};try{let i=typeof window<"u"&&(window.clay?.modal??window.themodal)||"auto",o=await n(e,{aspect:jl(r),modal:i,...Nl});return o===null?null:{file:Il(o.blob,e.name),dataURL:o.dataURL}}catch(i){return je(t,i&&i.message||"Crop failed"),null}}function jl(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function Il(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}var Fl=new Set(["unsupported","payment-required"]);async function Pl(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";je(n,null);let o=await Ml(r,n);if(!o||t.closed){le(e);return}let s=o.file,l=o.dataURL||null,a=$("upload");if(typeof a!="function")return Tr(e,n,t,i,await Ni(s,l,n),s);Fi(n,l),Mi(n,0);let d=ql(t),m;try{m=await a(s,{signal:d?.signal,onProgress:({percent:u})=>Mi(n,u)})}finally{$l(t,d),Ul(n)}if(t.closed){le(e);return}if(m.code==="aborted"){le(e);return}if(m.ok)return Tr(e,n,t,i,m.uploads[0].url,s);if(!Fl.has(m.code)){je(n,m.msg||"Upload failed"),t.dispatch?.("hcms:error",{error:new Error(m.msg||"Upload failed"),code:m.code,path:i}),le(e);return}let g=m.code==="payment-required"?"This file is stored in the page. Add a paid plan to upload files.":null;return Tr(e,n,t,i,await Ni(s,l,n),s,g)}function Tr(e,t,r,n,i,o,s=null){if(r.closed){le(e);return}if(Fi(t,null),je(t,null),!i){le(e);return}Ii(t,i,o.name),K(V(r),{path:n,structural:!1},r),s&&je(t,s,"info"),le(e)}async function Ni(e,t,r){return t||await Dl(e,r)}function Dl(e,t){let r=t?.ownerDocument?.defaultView?.FileReader||globalThis.FileReader;return r?new Promise(n=>{let i=new r;i.onload=()=>n(typeof i.result=="string"?i.result:""),i.onerror=()=>n("");try{i.readAsDataURL(e)}catch{n("")}}):Promise.resolve("")}function ql(e){if(typeof AbortController!="function")return null;let t=new AbortController;return(e.uploads||(e.uploads=new Set)).add(t),t}function $l(e,t){t&&e.uploads?.delete(t)}function zl(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";Ii(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&le(i),je(r,null),K(V(t),{path:n,structural:!1},t)}function Bl(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function Ii(e,t,r){let n=Bl(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||xr(t):"")}function le(e){try{e.value=""}catch{}}function Fi(e,t){let r=e.querySelector?e.querySelector(".mirk-image__frame"):null;r&&(t?r.style.backgroundImage=`url("${t.replace(/"/g,"%22")}")`:r.style.removeProperty("background-image"))}function Mi(e,t){let r=Math.max(0,Math.min(100,Number(t)||0));e.setAttribute("data-hcms-uploading",""),e.style?.setProperty?.("--hcms-upload-progress",`${r}%`)}function Ul(e){e.removeAttribute("data-hcms-uploading"),e.style?.removeProperty?.("--hcms-upload-progress")}function je(e,t,r="error"){let n=e.querySelector?e.querySelector(":scope > .hcms-error"):null;n&&(n.classList.toggle("hcms-error--info",!!t&&r==="info"),t?(n.textContent=t,n.hidden=!1):(n.textContent="",n.hidden=!0))}function Ze(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${Ie(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let s=ee(e),l=Gl(n,s),a=Array.isArray(l),d=typeof l=="string"&&l.endsWith("[]");if(!a&&!d)throw new Error(`hypercms: path "${e}" is not an array`);let m=Ot(i,"data-hcms-max-items"),g=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||m!=null&&g.length>=m)return;let u=g.length,f=a?l[1]:l.replace(/\[\]$/,""),c=Ye(a?f:"string"),h=ai({shape:a?"object-array-item":"scalar-array-item",itemShape:f,pathArr:[...s,u],data:c,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(h),se(h,t.doc,t.view?.enhanceFormRichText!==!1),Lr(i),pe(`Add ${e}`,()=>K(V(t),{path:e,structural:!0},t))}function Cr(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),s=o.indexOf(e);if(s<0)return;let l=s+t;if(l<0||l>=o.length)return;let a=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[l]):i.insertBefore(e,o[l].nextSibling),Nr(i),Lr(n),a&&typeof a.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),pe(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>K(V(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var Rt="Delete this item?";function Hl(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||Rt;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||Rt:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?Rt:null}function Rr(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=Hl(r,t);if(n==null)return Me(e,t);let i=$("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>{t.closed||Me(e,t)},()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&Me(e,t):Me(e,t)}function Me(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=Ot(i,"data-hcms-min-items"),s=i.querySelector(".hcms-array-items"),l=s?s.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&l<=o)return}return e.remove(),n&&Nr(n),i&&Lr(i),pe(`Remove ${r}`,()=>K(V(t),{path:r,structural:!0},t))}}function K(e,t,r){if(r.closed)return{ok:!1,skipped:!0,closed:!0};let n=Qe(e);if(!t.structural&&n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=Object.hasOwn(r,"writeRules")?r.writeRules:r.pageRules,o=Kn(r.pageRoot,i,e,{shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null,formRoot:r.formRoot});return o.ok?(r.lastFingerprint=n,r.lastData=e,ji(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(ji(r,Kl(o.error,t.path)),r.dispatch?.("hcms:error",{error:o.error,attemptedData:e}),r.onError?.(o.error)),o}function Nt(e,t){let r=Ie(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function Mt(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let s=Ie(n),l=r.querySelectorAll(`[data-hcms-path="${s}"][data-hcms-field][type="radio"], [data-hcms-path="${s}"] [data-hcms-field][type="radio"]`);l.length?l.forEach(a=>{a.checked=String(a.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}function V(e){let t=H.extract(e.formRoot,e.formRules,{exclude:null});return ae(t,e.formRules)}function ae(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>ae(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=ae(e[n],i);return r}return e}function ji(e,t){e.lastErrors=t&&t.length?t:null,Or(e)}function Or(e){if(Vl(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=Wl(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function Vl(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function Wl(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,s=>"\\"+s),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let s of o.children)if(s.classList&&s.classList.contains("hcms-error"))return s}r.pop()}return null}function Kl(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function Gl(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Ot(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Lr(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Ot(e,"data-hcms-max-items"),o=Ot(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),l=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');d&&(d.hidden=s||i!=null&&n>=i),r.forEach((m,g)=>{let u=m.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=l||o!=null&&n<=o);let f=m.querySelector('[data-hcms-action="move-up"]');f&&(f.hidden=a||g===0);let c=m.querySelector('[data-hcms-action="move-down"]');c&&(c.hidden=a||g===n-1)})}function jt(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>Nr(t))}function Nr(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let s=o.join(".");s!==i&&Yl(n,i,s),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function Yl(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}Xl(e)}function Xl(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=Ar(r.getAttribute("data-hcms-path")))}}function Qe(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function Ie(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var It="hcms-shell-styles",Jl="hcms-bundled-styles-installed",Ft="hcms-session-open",Zl='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Fe=new WeakSet,Mr="";function Di(e){Mr=e}function et(e){e?.body?.classList.add(Ft)}function jr(e){e?.body?.classList.remove(Ft)}var Ql=0;function Pi(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function qi({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:s=null,doc:l}){$i(l);let a=`hcms-shell-title-${++Ql}`,d=l.createElement("div");d.setAttribute("data-hcms-shell",""),d.setAttribute("editor-ui",""),d.setAttribute("save-remove",""),d.setAttribute("save-ignore",""),d.setAttribute("tabindex","-1"),d.setAttribute("role","dialog"),d.setAttribute("aria-modal","true"),d.setAttribute("aria-labelledby",a);let m=s==="dark"?" dark":s==="light"?" light":"";d.className="hcms-shell pixel-quiet hcms-panel hcms-side-"+t+(r?" hcms-overlay":"")+m;let g=Pi(i),u=Pi(o);d.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${g}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${u}</div>
          <h2 class="hcms-shell-title" id="${a}">${g}</h2>
        </div>
        <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
          <span class="mirk-button__label">\xD7</span>
        </button>
      </header>
      <div class="hcms-shell-notice" role="status" hidden></div>
      <div class="hcms-shell-error" role="alert" hidden></div>
      <div data-hcms-form-root class="hcms-form"></div>
      <footer class="hcms-shell-footer"${n?"":" hidden"}>
        <button type="button" class="hcms-shell-save mirk-button" trigger-save>
          <span class="mirk-button__label">Save</span>
        </button>
      </footer>
    </div>
  `,(e||l.body).appendChild(d);let c=l.body;c.classList.add("hcms-open"),et(l),r&&c.classList.add("hcms-overlay"),t==="left"&&c.classList.add("hcms-side-left");let h=ta(d,l),k=ea(d);return{root:d,formRoot:d.querySelector("[data-hcms-form-root]"),noticeEl:d.querySelector(".hcms-shell-notice"),errorEl:d.querySelector(".hcms-shell-error"),saveButton:d.querySelector(".hcms-shell-save"),destroy(){h.detach(),k.detach(),d.remove(),c.classList.remove("hcms-open","hcms-overlay","hcms-side-left"),jr(l)},restoreChrome(){ce(l),c.classList.add("hcms-open"),et(l),r&&c.classList.add("hcms-overlay"),t==="left"&&c.classList.add("hcms-side-left")}}}function ce(e){e&&(e.getElementById(It)||e.querySelector("style[data-hcms-bundled-styles]")||(Fe.delete(e),$i(e)))}function $i(e){if(e&&!Fe.has(e)){if(e[Jl]){Fe.add(e);return}if(e.getElementById(It)||e.querySelector("style[data-hcms-bundled-styles]")){Fe.add(e);return}if(Mr){let t=e.createElement("style");t.id=It,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=Mr,(e.head||e.documentElement).appendChild(t),Fe.add(e);return}try{let t=new URL("./theme.generated.css",import.meta.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=It,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Fe.add(e)}catch{let r=()=>{link.isConnected&&console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")};e.defaultView?.queueMicrotask?e.defaultView.queueMicrotask(r):r()}}}function ea(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function ta(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Zl));if(i.length===0)return;let o=i[0],s=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),s.focus()):!n.shiftKey&&t.activeElement===s&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var ra="[hypercms]",zi={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Bi={skip:"[data-hcms-shell]",templateAttr:null},Ir=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Dt(e,t){let r=[],n=[],i=[];return Pr(Q(e),e,t,[],r,n,i),{missing:Ui(r),twins:la(n),readOnly:Ui(i)}}function qt(e){return Fr(e)}function Fr(e){if(typeof e=="string")return Hi(e)?void 0:e;if(Array.isArray(e)){let[t,r]=e;return[t,Fr(r)]}if(e&&typeof e=="object"){let t={};for(let[r,n]of Object.entries(e)){let i=Fr(n);i!==void 0&&(t[r]=i)}return t}return e}function Pr(e,t,r,n,i,o,s){if(typeof r=="string"){let l=na(r),a=l?Pt(e,t,l,zi,n):[];if(Hi(r)){s.push(Pe(n));return}if(!l)return;if(r.endsWith("[]")){a.length===0&&Pt(e,t,l,Bi,n).length===0&&i.push(Pe(n));return}a.length===0?i.push(Pe(n)):a.length>1&&o.push({path:Pe(n),count:a.length});return}if(Array.isArray(r)){let[l,a]=r;if(typeof l!="string"||!l)return;let d=Pt(e,t,l,zi,n);if(d.length===0){Pt(e,t,l,Bi,n).length===0&&i.push(Pe(n));return}for(let m of d)Pr(e,m,a,[...n,"*"],i,o,s);return}if(r&&typeof r=="object")for(let[l,a]of Object.entries(r))Pr(e,t,a,[...n,l],i,o,s)}function Pt(e,t,r,n,i){try{return e.find(t,r,n)}catch(o){throw new Ir(Pe(i),r,o)}}function na(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=P(e);return(t===-1?e:e.slice(0,t))||null}function ia(e){if(e.endsWith("[]"))return null;let t=P(e);return t===-1?null:e.slice(t+1)||null}function Hi(e){let t=ia(e);return t!=null&&ke.has(t)}function De(e){oa(e),sa(e)}function oa(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[],n=e.unresolved&&e.unresolved.readOnly||[];if(r.length===0&&n.length===0){t.textContent="",t.hidden=!0;return}let i=[];if(r.length){let o=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;i.push(`${o}: ${r.join(", ")}`)}if(n.length){let o=n.length===1?"1 field reads a property the browser will not let anything write":`${n.length} fields read properties the browser will not let anything write`;i.push(`${o}: ${n.join(", ")}`)}t.textContent=i.join(`
`),t.hidden=!1}function sa(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${ra} "${n}" matches ${i} elements; edits go to the first one.`)}}function Ui(e){return[...new Set(e)]}function la(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function Pe(e){return e.length?e.join("."):"(whole page)"}var aa={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function de(e,{ignoreActiveValue:t}={}){return ca(e,{ignoreActiveValue:t})}function ca(e,{ignoreActiveValue:t}){let r=H.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.view.prepareRules(r.rules),e.rulesTagNode=r.tagNode),kt(e.doc),At(e.doc,e.pageRules),e.formRules=Et(e.pageRules,e.doc),e.writeRules=qt(e.pageRules),e.unresolved=Dt(e.pageRoot,e.pageRules);let n=pt(),i=ae(H.extract(e.pageRoot,e.pageRules,{...aa,...n.hooks}),e.pageRules),o=Te({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});ft(e.formRoot,o,{ignoreActiveValue:t}),n.seed(e.formRoot),se(e.formRoot,e.doc,e.view?.enhanceFormRichText!==!1),Or(e),De(e),e.updateFingerprint&&e.updateFingerprint()}function Vi({debounce:e=100,onRefresh:t}){let r=$("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=r.onAnyChange({debounce:e},i=>{t(i)});return{unsubscribe:typeof n=="function"?n:()=>{}}}var da='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';function Wi({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null;return{name:"sidebar",richText:n,enhanceFormRichText:!0,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,prepareRules(o){return n?Ri(o,t):o},mount(o){let s=this.ctx;i=re(()=>qi({mountTo:r.mountTo||e.body,side:r.side||"right",overlay:!!r.overlay,showSaveButton:!!r.showSaveButton,title:r.title,eyebrow:r.eyebrow,theme:r.theme,doc:e})),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl;let l=Te({pageRules:s.pageRules,formRules:s.formRules,data:o,doc:e});i.formRoot.appendChild(l),s.seeder.seed(i.formRoot),se(i.formRoot,e),De(s),Lt(s)},refresh(o){if(o==="livesync"){i?.restoreChrome?.(),de(this.ctx,{ignoreActiveValue:!0});return}if(o==="undo"){de(this.ctx,{ignoreActiveValue:!1});return}de(this.ctx)},focusOnOpen(){let o=this.root&&this.root.querySelector(da);o&&typeof o.focus=="function"&&o.focus()},destroy(){i?.destroy(),i=null}}}var ua="[cms-template], [data-hcms-shell]";function tt(e){if(!e||typeof e.getBoundingClientRect!="function"||typeof e.closest=="function"&&e.closest(ua))return!1;let t=e.getBoundingClientRect();return t.width>=8&&t.height>=8}var ma={skip:"[data-hcms-shell]",templateAttr:"cms-template"},ha={skip:"[data-hcms-shell]",templateAttr:null},fa="text",pa="native",Ki="handle",ga=new Set(["INPUT","TEXTAREA","SELECT"]),Xi=new Set(["IMG","INPUT","TEXTAREA","SELECT","OPTION","BR","HR","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","CANVAS","SOURCE","TRACK","AREA","COL","PARAM","BUTTON"]);function qr(e,t){return ba(e,t)}function ba(e,t){let r=[],n=[],i=Q(e);return Dr(i,e,t,[],r,n),{targets:r,lists:n}}function Dr(e,t,r,n,i,o){if(typeof r=="string"){if(r.endsWith("[]")){let m=r.slice(0,-2);if(!m)return;let g=$t(e,t,m);g.forEach((u,f)=>{i.push(Yi([...n,f],u,r,null))}),o.push(Gi(e,t,n,m,g,!0));return}let s=P(r),l=s===-1?null:r.slice(s+1),a=s===-1?r:r.slice(0,s),d=!a||a==="."?t:$t(e,t,a)[0];d&&i.push(Yi(n,d,r,l));return}if(Array.isArray(r)){let[s,l]=r;if(typeof s!="string"||!s)return;let a=$t(e,t,s);a.forEach((d,m)=>Dr(e,d,l,[...n,m],i,o)),o.push(Gi(e,t,n,s,a,typeof l=="string"));return}if(r&&typeof r=="object")for(let[s,l]of Object.entries(r))Dr(e,t,l,[...n,s],i,o)}function Gi(e,t,r,n,i,o){let s=i[0]?i[0].parentElement:null;if(!s){let l=$t(e,t,n,ha)[0];s=l?l.parentElement:null}return{path:r,items:i,container:s,scalar:o}}function Yi(e,t,r,n){return{path:e,el:t,rule:r,attr:n,kind:ka(t,n),icon:va(t,n)}}function ka(e,t){let r=(e.tagName||"").toUpperCase();return!t||t==="innerHTML"?Xi.has(r)?Ki:fa:t==="value"&&ga.has(r)&&!e.readOnly&&!ya(e)?pa:Ki}function ya(e){return e.disabled?!0:typeof e.matches=="function"&&e.matches(":disabled")}function va(e,t){let r=(e.tagName||"").toUpperCase();return(!t||t==="innerHTML")&&!Xi.has(r)?null:r==="IMG"||t==="srcset"?"camera":r==="A"&&t==="href"?"paperclip":"pencil"}function $t(e,t,r,n=ma){try{return e.find(t,r,n)}catch{return[]}}var zt=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),xa=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),Um=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui","live"]);function rt(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function $r(e,t){if(rt(e,t))return!0;for(let[r,n]of Object.entries(xa))if(n.includes(t)&&rt(e,r))return!0;return!1}function nt(e){let t=zt[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function wa(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=zt[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>$r(r,i))||n.bundles.some(i=>rt(r,i)))return r;r=r.parentElement}return null}function Ji(e,t){return!!wa(e,t)}var Aa=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function _a(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();"value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function Zi(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function Qi(e,t,r,n,i,o){return(o?Ji(e,t):Zi(e,r,i,!1))||!!(n&&(o&&e!==i?e.matches(n):Zi(e,n,i,o)))}function Ea(e,t){let r=zt[t];return r.tokens.some(n=>$r(e,n))||r.bundles.some(n=>rt(e,n))}var Sa=new Set(["INPUT","TEXTAREA","SELECT","OPTION"]);function eo(e,t,r,n){if(e.nodeType===1&&n(e)){r.dropped.push(t);return}r.cloneToLive.set(t,e),r.liveToClone.set(e,t);let i=e,o=t;if(e.nodeType===1){if(Sa.has(e.tagName)&&r.controls.push(e,t),e.tagName==="TEMPLATE"){for(;t.firstChild;)t.removeChild(t.firstChild);i=e.content,o=t.content,r.cloneToLive.set(o,i),r.liveToClone.set(i,o)}}else if(e.nodeType!==11)return;let s=o.firstChild;for(let l=i.firstChild;l&&s;l=l.nextSibling)eo(l,s,r,n),s=s.nextSibling}function zr(e,{capability:t="data",exclude:r=null,inherit:n=!0,provenance:i=null}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let o=e.nodeType===9?e:e.ownerDocument;if(!o?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let s=o.implementation.createHTMLDocument(""),l=i||new WeakMap,a=new WeakMap,d=e.nodeType===9?e.documentElement:e;r&&s.documentElement.matches(r);let m=nt(t),g=n?c=>Ea(c,t)||!!(r&&c.matches(r)):c=>Qi(c,t,m,r,d,!1),u=null;if(d.nodeType!==1||!Qi(d,t,m,r,d,n)){u=s.importNode(d,!0);let c={cloneToLive:l,liveToClone:a,dropped:[],controls:[]};eo(d,u,c,g);for(let h of c.dropped)h.remove();for(let h=0;h<c.controls.length;h+=2)_a(c.controls[h],c.controls[h+1])}e.nodeType===9&&u&&(s.replaceChild(u,s.documentElement),a.set(e,s),l.set(s,e));let f=c=>{if(Aa.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:u,document:s,capability:t,selector:nt(t),cloneToLive:l,liveToClone:a,original(c){return l.get(c)||null},cloneOf(c){return a.get(c)||null},query(c,h=u){return f(c),Array.from(h.querySelectorAll(c),k=>l.get(k)||k)},text(c=u){return(c===u?u:a.get(c))?.textContent||""},html(c=u){return(c===u?u:a.get(c))?.innerHTML??""},clone(c=u){let h=c===u?u:a.get(c);return h?s.importNode(h,!0):null}}}import{morph as Ia}from"./hyper-morph.vendor.js";var Ta=[16,8,0],z=8,Ca=4;function to({anchor:e,bar:t,rail:r=t,viewport:n,current:i=null}){let o=u=>i===u?Ca:0;if(e.bottom<=0||e.top>=n.height||e.right<=0||e.left>=n.width)return{mode:"hidden",x:0,y:0};let s=u=>Math.max(z,Math.min(e.left,n.width-u-z)),l=e.top-16-t.height;if(l>=z-o("above"))return{mode:"above",x:s(t.width),y:l};let a=e.bottom+16;if(a+t.height<=n.height-z+o("below"))return{mode:"below",x:s(t.width),y:a};let d=n.width-e.right-z,m=e.left-z,g=d>=m?[["rail-right",d],["rail-left",m]]:[["rail-left",m],["rail-right",d]];for(let[u,f]of g)for(let c of Ta){if(r.width+c>f+o(u))continue;let h=u==="rail-right"?Math.min(e.right+c,n.width-r.width-z):Math.max(e.left-c-r.width,z),k=Math.min(e.bottom,n.height-z)-r.height,p=Math.max(z,Math.min(Math.max(e.top,z),k));return{mode:u,x:h,y:p,gap:c}}return{mode:"pinned",x:s(t.width),y:z}}function Br({anchor:e,handle:t,viewport:r,inset:n=6,prefer:i="auto"}){let o=e.height>=t.height*1.5&&e.width>=t.width*2;if(i==="corner"||o){let u=Math.max(z,Math.min(e.right-t.width+n,r.width-t.width-z)),f=Math.max(z,Math.min(e.top-n,r.height-t.height-z));return{x:u,y:f,mode:"over"}}let s=4,l=e.right+s+t.width<=r.width-z,a=l?e.right+s:e.left-s-t.width,d=Math.max(z,a),m=e.top+e.height/2-t.height/2,g=Math.max(z,Math.min(m,r.height-t.height-z));return{x:d,y:g,mode:l?"beside-right":"beside-left"}}var Ut=!1;function ro(){if(Ut)return;let e=$("onPrepareForSave");typeof e=="function"&&(e(t=>{io(t),no(t)}),Ut=!0)}function no(e){let t=e&&e.querySelector&&e.querySelector("body");t&&t.classList.remove("hcms-open","hcms-overlay","hcms-side-left",Ft)}function io(e){if(!(!e||typeof e.querySelectorAll!="function"))for(let t of e.querySelectorAll(`[${oe}]`)){let r=Ei(t);r!==null&&(t.innerHTML=r),t.removeAttribute(oe)}}var Ht=!1;function Vt(){if(Ht)return;let e=$("onSnapshot");typeof e=="function"&&(e(t=>{io(t),Ti(t,typeof window<"u"?window:null),no(t)}),Ht=!0)}function oo(){ro(),Vt(),(!Ut||!Ht)&&Ra()}var Bt=null;function Ra(){if(Bt||typeof document>"u")return;Bt=Oe(document,wi,()=>{ro(),Vt(),Ut&&Ht&&(Bt?.(),Bt=null)})}var Oa={edit:"M8 10h2v6H8zm2 4h4v2h-4zm0-6h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-4 0h2v2h-2z","move-up":"M11 4h2v2h2v2h2v2h2v2h-4v-2h-2v10h-2V10H9v2H5v-2h2V8h2V6h2z","move-down":"M11 4h2v10h2v-2h4v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h4v2h2z",remove:"M5 5h3v3h3v3h2V8h3V5h3v3h-3v3h-3v2h3v3h3v3h-3v-3h-3v-3h-2v3H8v3H5v-3h3v-3h3v-2H8V8H5z",add:"M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"};function ge(e){let t=e==="edit"?"6 0 18 18":"0 0 24 24",r=e==="settings"?'<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>':`<path d="${Oa[e]}"/>`;return`<svg class="hcms-inline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="${t}" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${r}</svg>`}var so="data-hcms-ghost",La=nt("history");function Na(e){let t=e.container,r=null;for(;t&&(t.namespaceURI!=="http://www.w3.org/1999/xhtml"||["SELECT","OPTGROUP","DATALIST"].includes(t.tagName));)r=t,t=t.parentElement;return{parent:t,anchor:r}}function lo({doc:e,themeRoot:t,onAdd:r,onResize:n}){let i=e.defaultView,o=[],s=!1,l=null,a=new Map;function d(f,c,h){f.style[c]!==h&&(f.style[c]=h)}function m(){let f=new Set(o.map(c=>c.node.parentElement));for(let[c,h]of a)f.has(c)&&i?.Sortable?.get(c)===h.instance||(h.instance.option("draggable")===h.selector&&h.instance.option("draggable",h.original),a.delete(c));for(let c of f){let h=i?.Sortable?.get(c);if(!h)continue;let k=h.option("draggable");if(a.get(c)?.selector===k)continue;let p=k,v=`${p.trim().startsWith(">")?"> ":""}:is(${p.trim().replace(/^>\s*/,"")}):not(${La})`;h.option("draggable",v),a.set(c,{instance:h,original:p,selector:v})}}function g(){for(let f of o){let{node:c,slot:h,list:k}=f,p=k.items.filter(b=>b.isConnected).map(b=>b.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0);p.length&&(f.width=p.reduce((b,v)=>b+v.width,0)/p.length,f.height=p.reduce((b,v)=>b+v.height,0)/p.length),d(c,"width",f.width?`${Math.round(f.width)}px`:"100%"),d(h,"height",`${Math.max(48,Math.round(f.height||64))}px`),h!==c&&(h.colSpan=Math.max(1,...k.items.map(b=>[...b.children].reduce((v,_)=>v+(_.colSpan||1),0)))),c.hidden!==s&&(c.hidden=s)}m()}function u(f,c){let h=c.tagName,k=["TBODY","THEAD","TFOOT","TABLE"].includes(h),p=e.createElement(k?"tr":["UL","OL","MENU"].includes(h)?"li":"div");for(let w of[so,"data-hcms-shell","editor-ui","no-watch","no-save","save-remove","snapshot-remove"])p.setAttribute(w,"");p.setAttribute("draggable","false"),p.setAttribute("contenteditable","false"),p.className="hcms-shell pixel-quiet hcms-inline-ghost";for(let w of["light","dark"])p.classList.toggle(w,!!t?.classList.contains(w));let b=k?e.createElement("td"):p;b!==p&&(b.className="hcms-inline-ghost-cell",p.appendChild(b));let v=e.createElement("button");v.type="button",v.className="hcms-inline-list-button hcms-inline-list-add mirk-button mirk-button--small",v.setAttribute("data-hcms-list-action","add"),v.innerHTML=`<span class="mirk-button__label">${ge("add")}<span>Add</span></span>`,b.appendChild(v);let _={node:p,slot:b,button:v,list:f,width:0,height:0};v.addEventListener("click",w=>{w.preventDefault(),w.stopPropagation(),r(_.list)});for(let w of["pointerdown","mousedown","touchstart","click"])p.addEventListener(w,T=>T.stopPropagation());return p.addEventListener("dragstart",w=>{w.preventDefault(),w.stopPropagation()}),_}return{setLists(f){let c=new Set(o),h=[],k=new Set(o.map(b=>b.node)),p=new Set;for(let b of f||[]){if(!b.container||!b.container.isConnected)continue;let{parent:v,anchor:_}=Na(b);if(!v)continue;if(!p.has(v)){for(let R of v.querySelectorAll(`:scope > [${so}]`))k.has(R)||R.remove();p.add(v)}let w=o.find(R=>c.has(R)&&R.list.container===b.container&&R.list.path.join(".")===b.path.join("."))||u(b,v);c.delete(w),w.list=b,w.button.setAttribute("data-hcms-list",b.path.join(".")),w.button.setAttribute("aria-label",`Add to ${b.path.join(".")||"the list"}`);let T=_||b.items.filter(R=>R.parentElement===v).at(-1);T?T.nextSibling!==w.node&&T.after(w.node):w.node.parentElement!==v&&v.appendChild(w.node),h.push(w)}for(let b of c)b.node.remove();o=h,l?.disconnect(),!l&&typeof i?.ResizeObserver=="function"&&(l=new i.ResizeObserver(()=>{g(),n?.()}));for(let b of o)for(let v of b.list.items)l?.observe(v);g()},update:g,setHidden(f){s=!!f,g()},destroy(){l?.disconnect();for(let f of o)f.node.remove();o=[],m()}}}var ao=[["move-up","Move up"],["move-down","Move down"]],Ma={prefer:"corner",inset:0};function ja(e,t){return t.width<=e.width&&t.height<=e.height}function co({doc:e,layerEl:t,onActivate:r,onListAction:n}){let i=e.defaultView,o=[],s=new Map,l=0,a=new Map,d=null,m=new Set,g=0,u=!1,f=null,c=null,h=null,k=null,p=new Map,b=!1,v=null,_=lo({doc:e,themeRoot:t.closest("[data-hcms-shell]"),onResize:T,onAdd:y=>n?.({action:"add",list:y,index:y.items.length})}),w=e.createElement("div");w.className="hcms-inline-highlight",w.hidden=!0,w.setAttribute("aria-hidden","true"),t.appendChild(w);function T(){if(!(g||!i)){if(typeof i.requestAnimationFrame!="function")return W();g=i.requestAnimationFrame(()=>{g=0,W()})}}let R=()=>h||k;function W(){if(!i)return;_.update();let y={width:i.innerWidth,height:i.innerHeight},x=R();for(let A of o){if(!A.visible){A.node.hidden=!0;continue}for(let M of A.members)M.node.hidden=b&&M.kind!=="handle";A.node.hidden=!1;let C=A.el.getBoundingClientRect(),S=A.node.getBoundingClientRect(),O=S.width,F=A.kind==="row"&&!ja(C,S);if(F&&A.el!==x){for(let M of A.members)M.kind==="row"&&(M.node.hidden=!0);S=A.node.getBoundingClientRect()}if(A.members.every(M=>M.node.hidden)){A.node.hidden=!0;continue}let D=A.kind==="handle"?null:Ma,{x:X,y:N}=Br({anchor:C,handle:S,viewport:y,...D}),U=A.members.find(M=>M.kind==="handle");if(F&&U){let M=U.node.getBoundingClientRect(),cn=Br({anchor:C,handle:M,viewport:y}),Zo=A.members.slice(A.members.indexOf(U)+1).filter(er=>!er.node.hidden).reduce((er,Qo)=>er+Qo.node.getBoundingClientRect().width+2,0);X=Math.max(8+O,Math.min(y.width-8,cn.x+M.width+Zo))-S.width,N=cn.y}A.node.style.transform=`translate(${Math.round(X)}px, ${Math.round(N)}px)`}if(v)if(!v.node.isConnected||v.node.closest("[hidden]"))Y();else{let A=v.button.getBoundingClientRect(),C=v.menu.getBoundingClientRect();v.menu.style.left=`${Math.max(8,A.right-C.width)-A.left}px`,v.menu.style.right="auto",v.menu.style.top=A.bottom+6+C.height>y.height-8?"auto":"calc(100% + 6px)",v.menu.style.bottom=A.bottom+6+C.height>y.height-8?"calc(100% + 6px)":"auto"}j(),f?.()}function B(y){if(y?.closest?.("[data-hcms-ghost]"))return null;for(let x=y;x&&x.nodeType===1;x=x.parentElement){let A=p.get(x);if(A)return A}return null}function G(y){v&&!v.node.contains(y.target)&&Y();let x=R();k=B(y.target),k&&t.contains(y.target)&&(h=null),R()!==x&&T()}function E(y){if(y.relatedTarget||!k)return;let x=R();k=null,R()!==x&&T()}function j(){if(!c||w.hidden)return;let y=c.getBoundingClientRect();w.style.width=`${Math.round(y.width)}px`,w.style.height=`${Math.round(y.height)}px`,w.style.transform=`translate(${Math.round(y.left)}px, ${Math.round(y.top)}px)`}function be(){if(!i||typeof i.IntersectionObserver!="function"){for(let x of o)x.visible=!0;return}d||(d=new i.IntersectionObserver(x=>{let A=!1;for(let C of x)for(let S of s.get(C.target)||[])S.visible!==C.isIntersecting&&(S.visible=C.isIntersecting,A=!0);A&&T()},{threshold:0}));let y=new Set(s.keys());for(let x of m)y.has(x)||d.unobserve(x);for(let x of y)m.has(x)||d.observe(x);m=y}function zo(){u||!i||(i.addEventListener("scroll",T,{passive:!0,capture:!0}),i.addEventListener("resize",T,{passive:!0}),e.addEventListener("focusin",G),e.addEventListener("focusout",E),e.addEventListener("pointerdown",sn,!0),e.addEventListener("keydown",ln,!0),u=!0)}function Bo(){!u||!i||(i.removeEventListener("scroll",T,{capture:!0}),i.removeEventListener("resize",T),e.removeEventListener("focusin",G),e.removeEventListener("focusout",E),e.removeEventListener("pointerdown",sn,!0),e.removeEventListener("keydown",ln,!0),u=!1)}function en(y){return`${y.kind}\0${y.attr||""}`}function tn(y,x){return y.container===x.container&&y.scalar===x.scalar}function Uo(y,x){return y.kind!==x.kind?!1:y.kind==="handle"?en(y.target)===en(x.target):y.kind==="row"?y.row===x.row&&tn(y.list,x.list):tn(y.list,x.list)}function rn(y,x){y.target=x;let A=x.path.join(".");y.node.setAttribute("data-hcms-target",A),x.icon?y.node.setAttribute("data-hcms-icon",x.icon):y.node.removeAttribute("data-hcms-icon"),y.node.setAttribute("aria-label",`Edit ${A}`)}function Ho(y){let x=e.createElement("button");x.type="button",x.className="hcms-inline-handle mirk-button mirk-button--small",x.innerHTML=`<span class="mirk-button__label">${ge("edit")}</span>`;let A={node:x,kind:"handle",target:y};return rn(A,y),x.addEventListener("click",C=>{C.preventDefault(),C.stopPropagation(),r?.(A.target,x)}),A}function nn(y,x){let A=e.createElement("button");return A.type="button",A.className="hcms-inline-list-button mirk-button mirk-button--small",A.setAttribute("data-hcms-list-action",y),A.setAttribute("aria-label",x),A.innerHTML=`<span class="mirk-button__label">${ge(y)}${y==="add"?"<span>Add</span>":""}</span>`,A}function on(y,{list:x,row:A,rowIndex:C,count:S}){let O=x.path.join(".");y.list=x,y.row=A,y.index=C,y.count=S,y.node.setAttribute("data-hcms-list",O),y.node.setAttribute("data-hcms-row",String(C));for(let F of y.node.querySelectorAll("[data-hcms-list-action]")){let D=F.getAttribute("data-hcms-list-action"),X=ao.find(([N])=>N===D)?.[1]||D;F.setAttribute("aria-label",`${X} ${O}.${C}`),F.disabled=D==="move-up"&&C===0||D==="move-down"&&C===S-1}}function Vo(y,x,A,C){let S=e.createElement("div");S.className="hcms-inline-row-controls";let O={node:S,kind:"row",list:y,row:x,index:A,count:C};for(let[F,D]of ao){let X=nn(F,D);X.addEventListener("click",N=>{N.preventDefault(),N.stopPropagation(),!X.disabled&&n?.({action:F,list:O.list,index:O.index,row:O.row})}),S.appendChild(X)}return on(O,{list:y,row:x,rowIndex:A,count:C}),O}function Y(y=!1){if(!v)return;let x=v;v=null,x.menu.hidden=!0,x.button.setAttribute("aria-expanded","false"),x.node.parentElement?.classList.remove("has-open-settings"),y&&x.button.isConnected&&x.button.focus({preventScroll:!0})}function sn(y){v&&!v.node.contains(y.target)&&Y()}function ln(y){v&&(y.key==="Escape"?(y.preventDefault(),y.stopPropagation(),Y(!0)):y.key==="Tab"?Y(!0):["ArrowDown","ArrowUp","Home","End"].includes(y.key)&&v.menu.contains(y.target)&&(y.preventDefault(),v.menu.querySelector('[role="menuitem"]').focus({preventScroll:!0})))}function an(y,{list:x,row:A,rowIndex:C}){Object.assign(y,{list:x,row:A,index:C}),y.node.setAttribute("data-hcms-list",x.path.join(".")),y.node.setAttribute("data-hcms-row",String(C)),y.button.setAttribute("aria-label",`Settings ${x.path.join(".")}.${C}`)}function Wo(y){let x=e.createElement("div");x.className="hcms-inline-settings";let A=nn("settings","Settings");A.setAttribute("aria-haspopup","menu"),A.setAttribute("aria-expanded","false");let C=e.createElement("div");C.className="hcms-inline-settings-menu",C.setAttribute("role","menu"),C.setAttribute("aria-label","Item settings"),C.hidden=!0;let S=e.createElement("button");S.type="button",S.setAttribute("role","menuitem"),S.setAttribute("data-hcms-list-action","remove"),S.textContent="Delete",C.appendChild(S),x.append(A,C);let O={node:x,button:A,menu:C,kind:"settings"};an(O,y);let F=()=>{Y(),v=O,C.hidden=!1,A.setAttribute("aria-expanded","true"),x.parentElement.classList.add("has-open-settings"),S.focus({preventScroll:!0}),T()};return A.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),v===O?Y(!0):F()}),A.addEventListener("keydown",D=>{(D.key==="ArrowDown"||D.key==="ArrowUp")&&(D.preventDefault(),F())}),S.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),Y(!0),n?.({action:"remove",list:O.list,index:O.index,row:O.row})}),O}function Ko(y,x){y.kind==="handle"?rn(y,x.target):y.kind==="row"?on(y,x):y.kind==="settings"&&an(y,x)}function Qt(y,x,A,C,S){let O=x.get(A)?.find(F=>F.category===S);if(!O){O={el:A,category:S,members:[]},y.push(O);let F=x.get(A);F?F.push(O):x.set(A,[O])}O.members.push(C)}function Go(y,x,A){let C=A.items||[];C.forEach((S,O)=>{tt(S)&&(Qt(y,x,S,{kind:"row",list:A,row:S,rowIndex:O,count:C.length},"item"),Qt(y,x,S,{kind:"settings",list:A,row:S,rowIndex:O},"item"))})}function Yo(y,x){let A=new Set(y.members),C=[];for(let S of x){let O=y.members.find(F=>A.has(F)&&Uo(F,S))||(S.kind==="handle"?Ho(S.target):S.kind==="row"?Vo(S.list,S.row,S.rowIndex,S.count):Wo(S));A.delete(O),Ko(O,S),b&&O.kind!=="handle"&&(O.node.hidden=!0),C.push(O)}for(let S of A)S===v&&Y(),S.node.remove();C.sort((S,O)=>["row","handle","settings"].indexOf(S.kind)-["row","handle","settings"].indexOf(O.kind)),C.forEach((S,O)=>{y.node.children[O]!==S.node&&y.node.insertBefore(S.node,y.node.children[O]||null)}),y.members=C}function Xo(y,x){let A=[],C=new Map,S=new Map,O=0;for(let N of y||[])S.has(N.el)||S.set(N.el,N),!(N.kind!=="handle"||!tt(N.el))&&(Qt(A,C,N.el,{kind:"handle",target:N},"item"),O++);for(let N of x||[])Go(A,C,N);let F=new Set(o),D=new Map;for(let N of o)D.has(N.el)||D.set(N.el,N.visible);let X=[];for(let N of A){let U=o.find(M=>F.has(M)&&M.el===N.el&&M.category===N.category);if(!U){let M=e.createElement("div");M.className="hcms-inline-item-controls",M.setAttribute("role","group"),U={el:N.el,node:M,category:N.category,kind:N.category==="add"?"add":"handle",members:[],visible:D.get(N.el)??!1},t.appendChild(M)}F.delete(U),U.el=N.el,U.category=N.category,Yo(U,N.members),U.kind=U.members.some(M=>M.kind==="row")?"row":U.members.some(M=>M.kind==="handle")?"handle":"add",U.node.setAttribute("aria-label",U.category==="add"?"List controls":"Item controls"),X.push(U)}for(let N of F)N.node.remove();o=X,s=new Map,p=new Map;for(let N of o){let U=s.get(N.el);U?U.push(N):s.set(N.el,[N]);for(let M of N.members)M.kind!=="row"&&M.kind!=="settings"||(p.set(M.row,M.row),p.set(M.node,M.row),p.set(N.node,M.row))}h&&!p.has(h)&&(h=null),k&&!p.has(k)&&(k=null),a=S,l=O}function Jo(){Y(),d?.disconnect(),d=null,m=new Set;for(let y of o)y.node.remove();o=[],s=new Map,a=new Map,p=new Map,l=0}return{setTargets(y,x){Xo(y,x),_.setLists(x),be(),zo(),T()},refresh:T,get count(){return l},get controlsHidden(){return b},setControlsHidden(y){if(b=!!y,_.setHidden(b),b){Y();for(let x of o){for(let A of x.members)A.kind!=="handle"&&(A.node.hidden=!0);x.members.every(A=>A.node.hidden)&&(x.node.hidden=!0)}}T()},elementToTarget(y){if(y?.closest?.("[data-hcms-ghost]"))return null;for(let x=y;x&&x.nodeType===1;x=x.parentElement){let A=a.get(x);if(A)return A}return null},setHoveredRow(y){let x=R();h=y?B(y):null,R()!==x&&T()},showHighlight(y){y&&(c=y,w.hidden=!1,j())},hideHighlight(){c=null,w.hidden=!0},setFollower(y){f=typeof y=="function"?y:null},destroy(){_.destroy(),g&&i&&i.cancelAnimationFrame(g),g=0,f=null,c=null,h=null,k=null,w.remove(),Bo(),Jo()}}}var Fa="hypercms-inline",st="is-hcms-inline-active",Ur="is-hcms-inline-onpath",uo='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',Pa=["bold","italic","link","undo","redo"],Da=/^H[1-6]$/,qa=0;function fo({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null,o=null,s=null,l=new Map,a=null,d=null,m=null;function g(u,f,c,h,k){let p=Le(e.defaultView);if(typeof p!="function")return null;let b=k||{},v=b.originalHTML??zr(f,{capability:"history"}).html(),_=b.richClayIsOurs??!f.hasAttribute("data-richclay"),w=b.adopted??f.getAttribute("data-richclay-active")==="true",T=it(f,h,"history"),R=$a(u,p,f,h,_);if(!R)return null;Si(f,h==="innerHTML",_);let W=String(++qa);f.setAttribute(oe,W),Vt();let B={el:f,editor:R,path:c,prop:h,boundId:W,originalHTML:v,oldValue:T,richClayIsOurs:_,adopted:w,dirty:!1,written:!1,restorable(){return!this.adopted&&!this.dirty&&!this.written},lastEdited:void 0};l.set(f,B),Ai(W,B);let G=R.squire;if(G&&typeof G.addEventListener=="function"){let j=()=>{B.dirty=!0,B.lastEdited=it(f,B.prop,"history"),za(u,B)};G.addEventListener("input",j),B.detachInput=()=>G.removeEventListener?.("input",j)}let E=()=>po(B);return f.addEventListener("blur",E),B.detachBlur=()=>f.removeEventListener("blur",E),B}return{name:"inline",richText:n,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,handoffEl:null,handoffCountEl:null,popEl:null,enhanceFormRichText:!1,prepareRules(u){return n?Oi(u,t):u},bindText(u,f,c,h){return g(this.ctx,u,f,c,h)},mount(u){let f=this.ctx;i=Wa(e,r.theme),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl,this.handoffEl=i.handoffEl,this.handoffCountEl=i.handoffCountEl,this.popEl=i.popEl,re(()=>et(e));let c=Te({pageRules:f.pageRules,formRules:f.formRules,data:u,doc:e});i.formRoot.appendChild(c),f.seeder.seed(i.formRoot),se(i.formRoot,e,this.enhanceFormRichText),De(f),Lt(f),o=co({doc:e,layerEl:i.layerEl,onActivate:(h,k)=>this.activate(h,k),onListAction:h=>this.listAction(h)}),o.setFollower(()=>this.placePopover()),i.closeEl.addEventListener("click",()=>this.deactivate()),i.toggleEl.addEventListener("click",h=>{h.preventDefault(),h.stopPropagation(),this.toggleControls()}),i.handoffEl.querySelector("[data-hcms-open-view]").addEventListener("click",h=>{h.preventDefault(),h.stopPropagation(),f.onViewRequested?.("sidebar")}),this.bindPage(),this.syncTargets()},listAction({action:u,list:f,index:c,row:h}){let k=this.ctx,p=f.path.join("."),b=k.formRoot.querySelector(`[data-hcms-path="${Ie(p)}"]`);if(!b)return;if(u==="add"){Ze(p,k);return}let v=h?Ga(k,p,h):c;if(v===-1)return;let _=Ka(b,v);if(_){if(u==="remove"){Rr(_,k),this.syncTargets();return}Cr(_,u==="move-up"?-1:1,k),this.syncTargets()}},toggleControls(){if(!o||!i)return;let u=!o.controlsHidden;o.setControlsHidden(u),i.toggleEl.setAttribute("aria-pressed",String(u));let f=i.toggleEl.querySelector(".mirk-button__label");f&&(f.textContent=u?"Show controls":"Hide controls")},bindPage(){let u=this.ctx.pageRoot,f=i.root,c=_=>{let w=o&&o.elementToTarget(_.target);w?o.showHighlight(w.el):o?.hideHighlight(),o?.setHoveredRow(_.target)},h=()=>{o?.hideHighlight(),o?.setHoveredRow(null)},k=_=>{if(f.contains(_.target))return;let w=o&&o.elementToTarget(_.target);!w||w.kind!=="text"||l.has(w.el)||g(this.ctx,w.el,w.path.join("."),Kt(w))},p=_=>{if(f.contains(_.target))return;let w=o&&o.elementToTarget(_.target);if(!w){this.deactivate();return}(typeof _.target.closest=="function"&&_.target.closest("a[href]")||w.kind!=="text")&&_.preventDefault(),this.activate(w)},b=_=>{_.key==="Escape"&&this.deactivate()},v=_=>{let w=_.detail;if(!(!w||w.pageRoot!==this.ctx.pageRoot||!w.path))for(let T of l.values())T.path===w.path&&(T.written=!0)};u.addEventListener("pointerover",c),u.addEventListener("pointerleave",h),u.addEventListener("pointerdown",k),u.addEventListener("click",p),f.addEventListener("keydown",b),e.addEventListener("hcms:change",v),s=()=>{u.removeEventListener("pointerover",c),u.removeEventListener("pointerleave",h),u.removeEventListener("pointerdown",k),u.removeEventListener("click",p),f.removeEventListener("keydown",b),e.removeEventListener("hcms:change",v)}},activate(u,f){if(!u||!i||u.kind==="text"&&this.activateText(u))return;let c=mo(this,i,u.path.join("."));if(!c){this.deactivate();return}a=u,d=f||null,m=null,i.popEl.hidden=!1,i.formRoot.querySelectorAll(`.${st}`).forEach(ho),this.placePopover(),Va(c)},activateText(u){let f=u.el,c=l.get(f);if(c)return Wt(c),!0;let h=g(this.ctx,f,u.path.join("."),Kt(u));return h?(Wt(h),!0):!1},placePopover(){if(!i||!a||i.popEl.hidden)return;let u=e.defaultView;if(!u)return;let f={width:u.innerWidth,height:u.innerHeight},c=a.el.getBoundingClientRect(),h=i.popEl.getBoundingClientRect(),{mode:k,x:p,y:b}=to({anchor:c,bar:h,viewport:f,current:m});m=k,i.popEl.style.transform=`translate(${Math.round(p)}px, ${Math.round(b)}px)`},deactivate(){if(!i||!a&&i.popEl.hidden)return;i.popEl.hidden=!0,bo(i.root);let u=d;if(a=null,d=null,m=null,u&&e.contains(u)&&typeof u.focus=="function")try{u.focus({preventScroll:!0})}catch{u.focus()}},syncTargets(){if(!o)return;let u=this.ctx,{targets:f,lists:c}=qr(u.pageRoot,u.pageRules);o.setTargets(f,c);let h=Ba(this,l,f,e);if(a){let p=h.get(a.el)||[],b=p.find(v=>Ua(v,a))||p.find(v=>v.path.join(".")===a.path.join("."))||(p.length===1?p[0]:null);b?a=b:this.deactivate()}Ha(this.ctx,l,e);let k=f.reduce((p,b)=>p+(tt(b.el)?0:1),0);this.handoffEl&&(this.handoffCountEl.textContent=k===0?"":`${k} ${k===1?"field isn't":"fields aren't"} visible right now.`,this.handoffEl.hidden=k===0)},refresh(u,f){u==="livesync"?(ce(e),et(e),de(this.ctx,{ignoreActiveValue:!0})):u==="undo"?de(this.ctx,{ignoreActiveValue:!1}):de(this.ctx),this.syncTargets(),(u==="livesync"||u==="undo")&&this.rebindText(u),this.restoreActive()},rebindText(u){let f=u!=="undo";for(let[c,h]of[...l]){if(!e.contains(c)){ot(this.ctx,h,{restore:!1,record:f}),l.delete(c);continue}if(c.hasAttribute(Z)){let b=it(c,h.prop);b!==h.lastEdited&&(h.oldValue=b,h.lastEdited=void 0);continue}let k=e.activeElement===c;ot(this.ctx,h,{restore:!1,record:f}),l.delete(c);let p=g(this.ctx,c,h.path,h.prop,{richClayIsOurs:h.richClayIsOurs,adopted:h.adopted});p&&k&&Wt(p)}},restoreActive(){if(!i||!a||i.popEl.hidden)return;if(!e.contains(a.el)){this.deactivate();return}if(!mo(this,i,a.path.join("."))){this.deactivate();return}i.formRoot.querySelectorAll(`.${st}`).forEach(ho),this.placePopover()},focusOnOpen(){if(this.root&&typeof this.root.focus=="function")try{this.root.focus({preventScroll:!0})}catch{this.root.focus()}},destroy(){d=null,this.deactivate();for(let u of l.values())ot(this.ctx,u);l.clear(),s?.(),s=null,o?.destroy(),o=null,i?.destroy(),i=null,jr(e),this.popEl=null,this.handoffEl=null,this.handoffCountEl=null}}}function $a(e,t,r,n,i){return re(()=>{let o=null;try{o=new t(r,{inline:!0,hyperclay:!1,toolbar:n==="innerHTML"?Pa:!1,...Da.test(r.tagName)?{singleLine:!0}:null})}catch(s){return console.warn("[hypercms] richclay activation failed; the field falls back to the popover",s),null}if(o.unsupported||!o.active){if(i)try{o.destroy()}catch{}return null}return typeof o.reattach=="function"&&o.reattach(),o})}function za(e,{path:t,el:r,prop:n}){let i=Nt(e.formRoot,t);i&&(Mt(i,it(r,n),e.formRoot,t),K(V(e),{path:t,structural:!1},e))}function it(e,t,r="data"){let n=zr(e,{capability:r});return t==="innerHTML"?n.html():n.text().trim()}function po(e){let{el:t,prop:r,oldValue:n,lastEdited:i}=e,o=i;if(o===void 0||o===n)return;e.oldValue=o;let s=$("undo");if(!s||typeof s.recordValue!="function")return;let l={prop:r,oldValue:n,newValue:o,read:a=>it(a,r,"history"),write:(a,d)=>go(a,r,d)};s.isPaused?queueMicrotask(()=>{t.isConnected&&s.recordValue(t,l)}):s.recordValue(t,l)}function go(e,t,r){let n=e.cloneNode(!1);t==="innerHTML"?n.innerHTML=r:n.textContent=r,Ia(e,Array.from(n.childNodes),{morphStyle:"innerHTML",policy:"history",restoreFocus:!1,scripts:{handle:!1,merge:!1}})}function ot(e,t,{restore:r=!0,record:n=!0}={}){n&&po(t),t.detachInput?.(),t.detachBlur?.(),re(()=>{if(!t.adopted){try{t.editor.destroy()}catch(i){console.warn("[hypercms] richclay teardown failed; editor state may reach the save",i)}t.richClayIsOurs&&t.el.removeAttribute("data-richclay")}t.el.removeAttribute(Z),t.el.removeAttribute(fe),t.el.removeAttribute(oe),_i(t.boundId),r&&t.restorable()&&go(t.el,"innerHTML",t.originalHTML)})}function Wt(e){let{editor:t,el:r}=e;if(r.ownerDocument.activeElement!==r)try{typeof t.focus=="function"?t.focus():r.focus()}catch{}}function Ba(e,t,r,n){let i=new Map;for(let o of r){let s=i.get(o.el);s?s.push(o):i.set(o.el,[o])}for(let[o,s]of[...t]){let l=i.get(o)||[],a=l.find(u=>Kt(u)===s.prop)||l[0];if(!a){ot(e.ctx,s,{restore:!0}),t.delete(o);continue}s.path=a.path.join(".");let d=Kt(a);if(d===s.prop)continue;let m=n.activeElement===o;ot(e.ctx,s,{restore:!1}),t.delete(o);let g=e.bindText(o,s.path,d,{richClayIsOurs:s.richClayIsOurs,adopted:s.adopted,originalHTML:s.originalHTML});g&&m&&Wt(g)}return i}function Ua(e,t){return e.el===t.el&&e.kind===t.kind&&e.attr===t.attr}function Kt(e){return e.attr==="innerHTML"?"innerHTML":"textContent"}function Ha(e,t,r){for(let n of e.pageRoot.querySelectorAll(`[${Z}]`))t.has(n)||re(()=>Ci(n,r.defaultView))}function mo(e,t,r){let n=e.formRoot&&e.formRoot.querySelector(`[data-hcms-path="${Ie(r)}"]`);if(bo(t.root),!n)return null;let i=n.closest("[data-hcms-card]"),o=i?[...i.querySelectorAll('[data-hcms-shape="scalar"][data-hcms-path]')].filter(s=>s.closest("[data-hcms-card]")===i&&s.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]')===i.parentElement.closest('[data-hcms-shape="object-array"]')):[n];o.includes(n)||o.push(n);for(let s of o){s.classList.add(st),s.removeAttribute("draggable");for(let l=s.parentElement;l&&(l.classList.add(Ur),l.removeAttribute("draggable"),l!==e.formRoot);l=l.parentElement);}return n}function bo(e){if(e)for(let t of e.querySelectorAll(`.${st}, .${Ur}`))t.classList.remove(st,Ur)}function ho(e){e.tagName==="TEXTAREA"&&Ne(e),e.querySelectorAll?.("textarea").forEach(Ne)}function Va(e){let t=e.matches?.(uo)?e:e.querySelector?.(uo);if(!(!t||typeof t.focus!="function"))try{t.focus({preventScroll:!0})}catch{t.focus()}}function Wa(e,t){ce(e);let r=e.createElement(Fa),n=t==="dark"?" dark":t==="light"?" light":"";return r.className="hcms-shell pixel-quiet hcms-inline"+n,r.setAttribute("data-hcms-shell",""),r.setAttribute("editor-ui",""),r.setAttribute("no-save",""),r.setAttribute("save-remove",""),r.setAttribute("snapshot-remove",""),r.setAttribute("no-watch",""),r.setAttribute("tabindex","-1"),r.innerHTML=`
    <div class="hcms-inline-bar">
      <div class="hcms-inline-handoff" hidden>
        <span class="hcms-inline-handoff-count"></span>
        <button type="button" class="hcms-inline-handoff-open mirk-button mirk-button--small" data-hcms-open-view="sidebar">
          <span class="mirk-button__label">Edit in the sidebar</span>
        </button>
      </div>
      <button type="button" class="hcms-inline-toggle mirk-button mirk-button--small" data-hcms-controls-toggle aria-pressed="false" hidden>
        <span class="mirk-button__label">Hide controls</span>
      </button>
      <div class="hcms-inline-notice" role="status" hidden></div>
      <div class="hcms-inline-error" role="alert" hidden></div>
    </div>
    <div class="hcms-inline-layer"></div>
    <div class="hcms-inline-pop" role="dialog" aria-label="Edit content" hidden>
      <div class="hcms-inline-pop-header">
        <span>Edit content</span>
        <button type="button" class="hcms-inline-pop-close mirk-button mirk-button--small" aria-label="Close field editor">
          <span class="mirk-button__label">${ge("remove")}</span>
        </button>
      </div>
      <div data-hcms-form-root class="hcms-form"></div>
    </div>
  `,e.body.appendChild(r),{root:r,formRoot:r.querySelector("[data-hcms-form-root]"),noticeEl:r.querySelector(".hcms-inline-notice"),errorEl:r.querySelector(".hcms-inline-error"),handoffEl:r.querySelector(".hcms-inline-handoff"),handoffCountEl:r.querySelector(".hcms-inline-handoff-count"),layerEl:r.querySelector(".hcms-inline-layer"),popEl:r.querySelector(".hcms-inline-pop"),closeEl:r.querySelector(".hcms-inline-pop-close"),toggleEl:r.querySelector("[data-hcms-controls-toggle]"),destroy(){r.remove()}}}function Ka(e,t){let r=e.querySelector(".hcms-array-items");return r&&r.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")[t]||null}function Ga(e,t,r){let{lists:n}=qr(e.pageRoot,e.pageRules),i=n.find(o=>o.path.join(".")===t);return i?i.items.indexOf(r):-1}var Ya="[hypercms]";function ko(e,t){if(!e||!e.querySelectorAll||!t)return;let r=Xa(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Ya} template "${o}" doesn't match any rule path; ignored`))})}function Xa(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),s=n.map(a=>typeof a=="number"?"*":a).join(".");o&&t.add(o),s&&t.add(s);let l=he(i);if(l==="object")for(let[a,d]of Object.entries(i))r([...n,a],d);else if(l==="object-array"||l==="scalar-array"){let a=[...n,"*"],d=a.map(m=>typeof m=="number"?"*":m).join(".");if(t.add(d),l==="object-array"){let m=i[1];if(m&&typeof m=="object"&&!Array.isArray(m))for(let[g,u]of Object.entries(m))r([...a,g],u)}}}}var vo={skip:"[data-hcms-shell]",templateAttr:"cms-template"},L={isOpen:!1,ctx:null,opts:null};function xo({view:e,doc:t,pageRoot:r,opts:n={},onCloseRequested:i,onViewRequested:o}){let s=n.rules!==void 0?n.rules:"cms",l=H.findRules(t,s);if(!l){let k=typeof s=="string"?`data-rules-name~="${s}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${k}`)}let a=e.prepareRules(l.rules),d=l.tagNode;kt(t),At(t,a),ko(t,a);let m=Et(a,t),g=qt(a),u=Dt(r,a),f=pt(),c=ae(H.extract(r,a,{...vo,...f.hooks}),a),h={doc:t,pageRoot:r,pageRules:a,writeRules:g,formRules:m,rulesTagNode:d,rulesSource:s,richText:e.richText,view:e,seeder:f,initialData:c,get formRoot(){return e.formRoot},get shellRoot(){return e.root},get errorEl(){return e.errorEl},get noticeEl(){return e.noticeEl},unresolved:u,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:n.onChange,onError:n.onError,confirmRemove:n.confirmRemove,previouslyFocused:t.activeElement,dispatch(k,p){let b=t.defaultView&&t.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!b)return;let v={...p||{},pageRoot:r,view:e.name},_=new b(k,{bubbles:!0,cancelable:k==="hcms:change",detail:v});(e.root&&e.root.isConnected!==!1?e.root:r).dispatchEvent(_)},onCloseRequested:i,onViewRequested:o};return h.updateFingerprint=()=>{h.lastFingerprint=Qe(V(h))},e.ctx=h,h}function wo(e){e.updateFingerprint(),e.observerHandle=Vi({onRefresh:n=>e.view.refresh("observer",n)});let t=$("undo");if(t&&typeof t.on=="function"){let n=()=>{if(L.ctx!==e)return;yo(e,"undo");let i=ae(H.extract(e.pageRoot,e.pageRules,vo),e.pageRules);Qe(i)!==Qe(e.lastData)&&(e.lastData=i,e.onChange?.(i,{path:"",structural:!1}))};t.on("undo",n),t.on("redo",n),e.undoUnsub=()=>{t.off("undo",n),t.off("redo",n)}}let r=()=>yo(e,"livesync");e.livesyncUnsub=Oe(e.doc,xi,r),Vr.ctx=e,Za(e.doc)}function yo(e,t){L.ctx===e&&e.view.refresh(t)}function Gt(e,{dispatch:t=!0,restoreFocus:r=!0,updateUrl:n=!0,reason:i="close"}={}){if(!e||e.closed)return;e.closed=!0;for(let s of e.uploads||[])try{s.abort()}catch{}e.uploads?.clear();let o=e.previouslyFocused;if(t&&e.dispatch("hcms:close",{reason:i}),n&&Qa(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),re(()=>e.view.destroy()),Ja(),r&&typeof o?.focus=="function")try{o.focus()}catch{}}function Ja(){L.isOpen=!1,L.ctx=null,L.opts=null,Vr.ctx=null}var Vr={ctx:null};function Za(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=Vr.ctx;if(i)return jt(i.formRoot),pe("Reorder",()=>K(V(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var Hr="cms";function Ao(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(Hr)!=="true"?t:(i.set(Hr,"false"),"?"+i.toString())}function _o(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(Hr)==="true":!1}function Qa(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=Ao(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}var Eo="hcms-toggle",I="data-hcms-toggle-host",So="hcms-toggle-style",To="data-hcms-toggle-style",Yt="data-hcms-session",jo="data-hcms-split",Io="hcms.view",Xt=["sidebar","inline"],ec={sidebar:"In the sidebar",inline:"On the page"},Gr="var(--hcms-toggle-bg, var(--hcms-toggle-_surface))";function Co(e){try{let t=e&&e.localStorage?e.localStorage.getItem(Io):null;return Xt.includes(t)?t:null}catch{return null}}function tc(e,t){if(Xt.includes(t))try{e?.localStorage?.setItem(Io,t)}catch{}}var rc="#fafafa",nc="#0a0a0a",ic=`
[${I}] {
  all: unset;
  box-sizing: border-box;
  display: var(--hcms-toggle-display, inline-flex);
  font-family: 'Departure Mono', ui-monospace, Menlo, monospace;
  --hcms-toggle-_surface: ${rc};
}
[${I}][data-hcms-surface="dark"] {
  --hcms-toggle-_surface: ${nc};
}
[${I}] .hcms-toggle__main,
[${I}] .hcms-toggle__arrow {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  min-height: 40px;
  font-family: inherit;
  font-weight: 400;
  line-height: 1.5;
  font-size: 14px;
  color: var(--hcms-toggle-color, currentColor);
  border: 2px solid;
  border-color: var(--mirk-bevel-tl, #F0E7D8) var(--mirk-bevel-br, #E2D4BF) var(--mirk-bevel-br, #E2D4BF) var(--mirk-bevel-tl, #F0E7D8);
  border-radius: 0;
  cursor: pointer;
  box-shadow: none;
}
[${I}] .hcms-toggle__main:hover,
[${I}] .hcms-toggle__arrow:hover {
  border-color: var(--mirk-focus-color, #C7AE93);
  box-shadow: none;
}
[${I}] .hcms-toggle__main:active,
[${I}] .hcms-toggle__arrow:active {
  border-color: var(--mirk-bevel-br, #E2D4BF) var(--mirk-bevel-tl, #F0E7D8) var(--mirk-bevel-tl, #F0E7D8) var(--mirk-bevel-br, #E2D4BF);
}
[${I}] .hcms-toggle__main:focus-visible,
[${I}] .hcms-toggle__arrow:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -5px;
}
[${I}] .hcms-toggle__close { display: none; }
[${I}][${Yt}="open"] .hcms-toggle__open { display: none; }
[${I}][${Yt}="open"] .hcms-toggle__close { display: inline; }
[${I}][${jo}] .hcms-toggle__main {
  border-radius: 0;
  padding-right: 12px;
}
[${I}] .hcms-toggle__arrow {
  gap: 0;
  padding: 0 10px;
  border-radius: 0;
  border-left-width: 0;
}
[${I}] .hcms-toggle__menu {
  all: unset;
  box-sizing: border-box;
  min-width: 180px;
  padding: 4px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--hcms-toggle-color, currentColor);
  background: ${Gr};
  border: 1px solid var(--mirk-input-border, #D8C8AF);
  border-radius: var(--mirk-radius, 5px);
  box-shadow: 0 14px 34px -14px rgba(0, 0, 0, .45);
}
[${I}] .hcms-toggle__item {
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 9px 10px;
  border-radius: 0;
  cursor: pointer;
}
[${I}] .hcms-toggle__item::before {
  content: "\u25CB";
  margin-right: 8px;
  opacity: .55;
}
[${I}] .hcms-toggle__item[aria-checked="true"]::before {
  content: "\u25CF";
  opacity: 1;
}
[${I}] .hcms-toggle__item:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}
[${I}] .hcms-toggle__item:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -3px;
}
@media (pointer: coarse) {
  [${I}] .hcms-toggle__main,
  [${I}] .hcms-toggle__arrow { min-height: 44px; }
}
`;function oc({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),s=new URLSearchParams(o).get("editmode");return s?s==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}var Wr=new WeakMap;function Fo(e,t){try{e.globalCompositeOperation="copy",e.fillStyle=t,e.fillRect(0,0,1,1);let r=e.getImageData(0,0,1,1).data;return{r:r[0],g:r[1],b:r[2],a:r[3]/255}}catch{return null}}function sc(e){if(Wr.has(e))return Wr.get(e);let t=null;try{let r=e.createElement("canvas");if(r.width=r.height=1,t=r.getContext?r.getContext("2d",{willReadFrequently:!0}):null,t){let n=Fo(t,"rgb(1, 2, 3)");(!n||n.r!==1||n.g!==2||n.b!==3||n.a!==1)&&(t=null)}}catch{t=null}return Wr.set(e,t),t}function lc(e,t){let r=String(e??"").trim();if(!r)return null;let n=ac(r);if(n)return n;let i=t&&t.defaultView;if(!i||!i.CSS||typeof i.CSS.supports!="function"||!i.CSS.supports("color",r))return null;let o=sc(t);return o?Fo(o,r):null}function ac(e){let t=/rgba?\(([^)]+)\)/.exec(String(e??""));if(!t)return null;let r=t[1].split(/[\s,/]+/).filter(Boolean);if(r.length<3)return null;let n=r.slice(0,3).map(Number);if(n.some(Number.isNaN))return null;let i=r[3],o=i===void 0?1:i.endsWith("%")?Number(i.slice(0,-1))/100:Number(i);return{r:n[0],g:n[1],b:n[2],a:Number.isNaN(o)?1:o}}function Ro({r:e,g:t,b:r}){let n=i=>{let o=i/255;return o<=.03928?o/12.92:((o+.055)/1.055)**2.4};return .2126*n(e)+.7152*n(t)+.0722*n(r)}function Oo(e,t){let r=Ro(e),n=Ro(t);return(Math.max(r,n)+.05)/(Math.min(r,n)+.05)}var Lo={r:10,g:10,b:10},No={r:250,g:250,b:250};function Mo(e,t){let r=e.a==null?1:e.a;return{r:e.r*r+t.r*(1-r),g:e.g*r+t.g*(1-r),b:e.b*r+t.b*(1-r)}}function cc(e){if(!e)return"light";let t=Oo(Mo(e,Lo),Lo),r=Oo(Mo(e,No),No);return t>r?"dark":"light"}function lt(e,t){for(let[r,n]of Object.entries(t))e.style.setProperty(r,n,"important")}function Kr(e){let t=e.ownerDocument&&e.ownerDocument.defaultView,r=e.querySelector(".hcms-toggle__main");if(!t||!r||typeof t.getComputedStyle!="function")return;let n=lc(t.getComputedStyle(r).color,e.ownerDocument);e.setAttribute("data-hcms-surface",cc(n))}function dc(e){Kr(e);let t=e.ownerDocument,r=t&&t.defaultView;if(!r)return;let n=0,i=()=>{if(!n){if(typeof r.requestAnimationFrame!="function")return e.isConnected?Kr(e):l();n=r.requestAnimationFrame(()=>{if(n=0,!e.isConnected)return l();Kr(e)})}};typeof r.requestAnimationFrame=="function"&&i(),t.readyState!=="complete"&&r.addEventListener("load",i,{once:!0});let o=typeof r.MutationObserver=="function"?new r.MutationObserver(i):null;o&&(o.observe(t.documentElement,{attributes:!0}),t.body&&o.observe(t.body,{attributes:!0}));let s=typeof r.matchMedia=="function"?r.matchMedia("(prefers-color-scheme: dark)"):null;s&&typeof s.addEventListener=="function"&&s.addEventListener("change",i);function l(){o&&o.disconnect(),s&&typeof s.removeEventListener=="function"&&s.removeEventListener("change",i)}}function uc({open:e,close:t,isOpen:r,getTheme:n=()=>null,views:i=Xt},o=document){let s=o.querySelector(`[${I}]`);if(s)return s;if(!o.querySelector(`[${To}]`)){let E=o.createElement("style");E.setAttribute(To,""),E.setAttribute("editor-ui",""),o.getElementById(So)||(E.id=So),E.setAttribute("no-save",""),E.setAttribute("snapshot-remove",""),E.setAttribute("save-ignore",""),E.textContent=ic,o.head.insertBefore(E,o.head.firstChild)}let l=o.createElement("hypercms-toggle");l.className="hcms-shell pixel-quiet",o.getElementById(Eo)||(l.id=Eo),l.setAttribute(I,""),l.setAttribute("editor-ui",""),l.setAttribute("no-save",""),l.setAttribute("snapshot-remove",""),l.setAttribute("save-ignore",""),l.innerHTML='<button type="button" class="hcms-toggle__main mirk-button"><span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span></button>';let a=o.defaultView,d=l.querySelector(".hcms-toggle__main"),m=Xt.filter(E=>i.includes(E)),g=m.length>1,u=g?mc(o):null,f=g?hc(o,m):null;g&&(l.setAttribute(jo,""),l.appendChild(u),l.appendChild(f)),lt(l,{position:"fixed",right:"calc(var(--hcms-toggle-offset, 16px) + var(--hcms-toggle-shift, 0px))",bottom:"calc(var(--hcms-toggle-offset, 16px) + env(safe-area-inset-bottom, 0px))","z-index":"var(--hcms-toggle-z, 2147482900)"}),lt(d,{background:Gr}),u&&lt(u,{background:Gr}),f&&lt(f,{position:"absolute",right:"0",bottom:"calc(100% + 8px)","z-index":"var(--hcms-toggle-z, 2147482900)",display:"none"});let c=()=>f?[...f.querySelectorAll('[role="menuitemradio"]')]:[];function h(E){if(!(!E||typeof E.focus!="function"))try{E.focus({preventScroll:!0})}catch{E.focus()}}function k(E){let j=c();j.length&&h(j[(E+j.length)%j.length])}function p(){let E=Co(a);for(let j of c())j.setAttribute("aria-checked",String(j.getAttribute("data-hcms-view")===E))}function b(E){l.contains(E.target)||w()}function v(E){f&&(f.hidden=!E,lt(f,{display:E?"block":"none"}),u.setAttribute("aria-expanded",String(E)),E?(p(),o.addEventListener("pointerdown",b,!0)):o.removeEventListener("pointerdown",b,!0))}function _(E=0){v(!0),k(E)}function w({focusArrow:E=!1}={}){!f||f.hidden||(v(!1),E&&h(u))}function T(){let E=Co(a);return E&&m.includes(E)?E:null}async function R(E){await e({view:E}),tc(a,E)}async function W(){if(r()){t();return}let E=T();return E?e({view:E}):g?_():e(m[0]?{view:m[0]}:{})}async function B(E){try{await E()}catch(j){console.warn("hypercms: toggle failed to open the CMS",j)}}l.addEventListener("click",async E=>{u&&u.contains(E.target)||f&&f.contains(E.target)||await B(W)}),u&&(u.addEventListener("click",E=>{E.preventDefault(),f.hidden?_():w({focusArrow:!0})}),u.addEventListener("keydown",E=>{if(E.key==="ArrowUp"){E.preventDefault(),_(-1);return}(E.key==="ArrowDown"||E.key==="Enter"||E.key===" ")&&(E.preventDefault(),_(0))}),f.addEventListener("click",E=>{let j=E.target.closest?.('[role="menuitemradio"]');j&&(E.preventDefault(),w(),B(()=>R(j.getAttribute("data-hcms-view"))))}),f.addEventListener("keydown",E=>{let j=c(),be=j.indexOf(o.activeElement);switch(E.key){case"ArrowDown":E.preventDefault(),k(be+1);break;case"ArrowUp":E.preventDefault(),k(be-1);break;case"Home":E.preventDefault(),k(0);break;case"End":E.preventDefault(),k(j.length-1);break;case"Enter":case" ":if(E.preventDefault(),be===-1)break;w(),B(()=>R(j[be].getAttribute("data-hcms-view")));break;case"Escape":E.preventDefault(),w({focusArrow:!0});break;case"Tab":w();break}}));let G=E=>{let j=n();l.classList.toggle("light",j==="light"),l.classList.toggle("dark",j==="dark"),E?l.setAttribute(Yt,"open"):l.removeAttribute(Yt)};return G(r()),o.addEventListener("hcms:open",()=>G(!0)),o.addEventListener("hcms:close",()=>G(!1)),o.body.appendChild(l),ce(o),dc(l),l}function mc(e){let t=e.createElement("button");return t.type="button",t.className="hcms-toggle__arrow mirk-button",t.setAttribute("aria-haspopup","menu"),t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Choose where to edit"),t.textContent="\u25BE",t}function hc(e,t){let r=e.createElement("div");r.className="hcms-toggle__menu",r.setAttribute("role","menu"),r.setAttribute("aria-label","Where to edit"),r.hidden=!0;for(let n of t){let i=e.createElement("button");i.type="button",i.className="hcms-toggle__item",i.setAttribute("role","menuitemradio"),i.setAttribute("aria-checked","false"),i.setAttribute("data-hcms-view",n),i.tabIndex=-1,i.textContent=ec[n],r.appendChild(i)}return r}function Po(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!oc({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&uc(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function Do(e){if(Di(e),typeof document<"u"){let t=document.getElementById("hcms-shell-styles");t?.tagName==="LINK"&&t.remove(),ce(document)}}var Xr={sidebar:Wi,inline:fo};function Jt(e={}){let t=e.view||(L.isOpen?L.ctx.view.name:"sidebar"),r=Xr[t];if(!r)throw new Error(`hypercms: unknown view "${t}" (expected ${Object.keys(Xr).join(" or ")})`);let n=L.isOpen?{...L.opts,...e,view:t}:e,i=n.pageRoot||(typeof document<"u"?document.body:null);if(!i)throw new Error("hypercms: no pageRoot available");let o=i.ownerDocument||(typeof document<"u"?document:null);if(!o)throw new Error("hypercms: no document available");let s=null,l=null;if(L.isOpen){if(L.ctx.view.name===t)return;s=L.ctx.previouslyFocused,l=L.ctx.view.name,Gt(L.ctx,{restoreFocus:!1,updateUrl:!1,reason:"switch"})}oo();let a=r({doc:o,pageRoot:i,opts:n}),d=xo({view:a,doc:o,pageRoot:i,opts:n,onCloseRequested:()=>Jr(),onViewRequested:m=>Jt({view:m})});s&&(d.previouslyFocused=s);try{a.mount(d.initialData),wo(d),a.focusOnOpen(),L.isOpen=!0,L.ctx=d,L.opts=n,d.dispatch("hcms:open",{pageRoot:i,previous:l})}catch(m){throw Gt(d,{dispatch:!1,restoreFocus:!!s,updateUrl:!1}),m}}function Jr(){L.isOpen&&Gt(L.ctx)}function qo(){L.isOpen&&L.ctx.view.refresh("api")}function fc(){return L.isOpen}function pc(){return L.isOpen&&L.ctx?L.ctx.view.name:null}var gc={getData(){return L.isOpen?V(L.ctx):null},setValue(e,t){if(!L.isOpen)throw new Error("hypercms: cms is not open");let r=L.ctx,n=ee(e),i=me(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=Nt(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);Mt(o,t,r.formRoot,e),K(V(r),{path:e,structural:!1},r)},addItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");Ze(e,L.ctx)},removeItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");let t=L.ctx,r=ee(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=me(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let s=t.formRoot.querySelector(`[data-hcms-path="${xc(e)}"]`);if(!s)throw new Error(`hypercms: no element at path "${e}"`);Me(s,t)},refresh:qo,_commit(){if(!L.isOpen)return;let e=L.ctx;return jt(e.formRoot),pe("Update",()=>K(V(e),{path:"",structural:!0},e))}},bc=250,kc=1e4;function yc(){typeof window>"u"||typeof document>"u"||_o(window.location?window.location.search:"")&&(L.isOpen||vc(()=>{if(!L.isOpen)try{Jt()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function Yr(){return!!document.body&&!!$("Mutation")}function vc(e){if(Yr()){queueMicrotask(e);return}let t=Date.now()+kc,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function s(){if(L.isOpen){o();return}Yr()&&(o(),e())}i=Oe(document,vi,s),n=setInterval(()=>{if(L.isOpen){o();return}if(Yr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},bc)}yc();Po({open:Jt,close:Jr,isOpen:fc,getTheme:()=>L.opts?.theme,views:Object.keys(Xr),hasRules:e=>!!H.findRules(e,"cms")});var Zr={open:Jt,close:Jr,refresh:qo,api:gc,get isOpen(){return L.isOpen},currentView:pc,path:pr,scaffold:Ye,morphForm:ft};function xc(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var $o=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
   Source of truth: mirk-interface/mirk.css + src/theme/pixel-quiet.overrides.css.
   Regenerate with: npm run build:theme */

/* ===== mirk-interface@2.2.0, scoped to .hcms-shell ===== */
/*
 * mirk.css \u2014 the mirk UI kit, v2.
 * Hand-written, no build. Fourteen form components as semantic BEM classes in
 * @layer components, so utilities (Tailwind or your own) always override them
 * with zero !important. Renders fully standalone; Tailwind is optional.
 *
 * Two hinges (see mirk-ui-guide.md):
 *   1. Components live in @layer components \u2192 utilities win.
 *   2. State serializes into the DOM (native attrs, :has(), inline --mirk-value)
 *      so document.documentElement.outerHTML round-trips every visible state.
 *
 * This @layer statement makes the file self-sufficient without Tailwind, and
 * merges into Tailwind's own order (@layer theme, base, components, utilities)
 * when present.
 */
@layer base, components;

@layer base {
  /* Components are authored border-box (a 2px bevel must not grow the box). */
  .hcms-shell *, .hcms-shell *::before, .hcms-shell *::after { box-sizing: border-box; }
  .hcms-shell button, .hcms-shell input, .hcms-shell optgroup, .hcms-shell select, .hcms-shell textarea { margin: 0; }

  @font-face {
    font-family: 'Departure Mono';
    src: url('https://cdn.jsdelivr.net/npm/mirk-interface@2.2.0/fonts/DepartureMono-1.500/DepartureMono-Regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: swap;
  }

  .hcms-shell { font-family: 'Departure Mono', ui-monospace, "Menlo", monospace; }
  /* Preflight sets these to ui-monospace; keep them in Departure Mono. */
  .hcms-shell pre, .hcms-shell code, .hcms-shell kbd, .hcms-shell samp { font-family: inherit; }

  /* 28 tokens, one value each. light-dark() picks the side from color-scheme.
     :root paints the DEFAULT theme \u2014 "Pixel Quiet" (see 0030): mirk's warm soul
     with the volume down. The louder original palette is the opt-in
     [data-theme="full-volume"] block below. */
  .hcms-shell {
    color-scheme: light dark;                 /* default: follow the OS */

    --mirk-canvas:        light-dark(#FDF8F0, #0B0C13);
    --mirk-bg:            light-dark(#FDF8F0, #11131E);
    --mirk-fg:            light-dark(#2B241B, #ECEAF2);
    --mirk-accent:        light-dark(#efefe5, #1D1F2F);
    --mirk-destructive:   light-dark(#C24A3A, #ff5566);
    --mirk-focus-color:   light-dark(#C7AE93, #4A506B);
    --mirk-bevel-bg:      light-dark(#FCF8F1, #1A1D2C);
    --mirk-bevel-fg:      light-dark(#2B241B, #ECEAF2);
    --mirk-bevel-tl:      light-dark(#F0E7D8, #2A2E42);
    --mirk-bevel-br:      light-dark(#E2D4BF, #14182A);
    --mirk-bevel-hover-bg: light-dark(#F4ECDF, #202436);
    --mirk-pill-inner-top: light-dark(#FBF6EE, #202436);
    --mirk-input-border:  light-dark(#D8C8AF, #353B52);
    --mirk-placeholder-color: light-dark(#A8987F, #6A7090);
    --mirk-ctrl-bg:       light-dark(#8C7660, #5F6582);
    --mirk-toggle-bg:     light-dark(#EFDBBD, #3E4660);
    --mirk-toggle-hi:     light-dark(#F4EADA, #4E567A);
    --mirk-toggle-lo:     light-dark(#C2A87E, #262B42);
    --mirk-mark-fg:       light-dark(#6B5942, #C9CDE0);
    --mirk-sortable-dot:  light-dark(#DDCBB0, #353B52);
    --mirk-sortable-shadow:    light-dark(#C9B493, #0E1120);
    --mirk-sortable-label:     light-dark(#8C7B62, #8A90AB);
    --mirk-sortable-placeholder: light-dark(#A8987F, #6A7090);
    --mirk-slider-fill:   light-dark(#F2E0BD, #2A2E42);
    --mirk-slider-nub-bg: light-dark(#EFDBBD, #3E4660);
    --mirk-slider-nub-hi: light-dark(#F4EADA, #4E567A);
    --mirk-slider-nub-lo: light-dark(#C2A87E, #262B42);

    /* Chip \u2014 the recovery/notification component reads from the kit's own tokens
       via 5 slim hooks, so it matches the kit by default and reskins by overriding
       a hook (not a rule). Each follows the theme (incl. the Full Volume variant)
       and OS light/dark with no per-theme repaint; the one exception is the primary
       fill, which the default (Pixel Quiet) leaves as the theme's fg ink while the
       Full Volume variant tints it a warm brown in light (see below). */
    --mirk-chip-surface:     var(--mirk-bg);            /* raised panel face */
    --mirk-chip-edge:        var(--mirk-input-border);  /* panel + recess outline */
    --mirk-chip-primary-bg:  var(--mirk-fg);            /* primary action fill \u2014 the theme's fg ink (Full Volume tints it warm brown in light) */
    --mirk-chip-primary-fg:  var(--mirk-bg);
    --mirk-chip-alert:       var(--mirk-destructive);   /* icon + struck "now" value */

    --mirk-radius: 5px;                        /* the "rounded" corner */
    --mirk-focus-offset: 2px;                  /* non-color \u2192 can't ride light-dark() */

    background: var(--mirk-canvas);
    color: var(--mirk-fg);
  }

  /* The one non-color token with a real light/dark split (was 2px / 3px). */
  @media (prefers-color-scheme: dark) { .hcms-shell { --mirk-focus-offset: 3px; } }

  /* Force a mode on any subtree with one attribute (class aliases for hosts that
     prefer class-based theming and Tailwind's dark-variant convention). Each also
     paints its own canvas so a wrapper visibly flips. */
  .hcms-shell[data-theme="light"], .hcms-shell.light {
    color-scheme: light; --mirk-focus-offset: 2px;
    background: var(--mirk-canvas); color: var(--mirk-fg);
  }
  .hcms-shell[data-theme="dark"], .hcms-shell.dark {
    color-scheme: dark; --mirk-focus-offset: 3px;
    background: var(--mirk-canvas); color: var(--mirk-fg);
  }

  /* Built-in brand variant \u2014 "Full Volume": mirk's original full-strength palette,
     the loud pole of the volume axis (Pixel Quiet, now the default, is the quiet
     end). Full-contrast bevel, warm cream / deep navy, crimson destructive.
     Authored with light-dark() like :root, so it follows the OS and still flips
     with .dark / .light. Opt in: data-theme="full-volume". Sits after :root
     (equal specificity, source order wins). --mirk-radius / --mirk-focus-offset /
     --mirk-ctrl-bg and the four shared --mirk-chip-* hooks inherit from :root
     unchanged; only the tokens that differ from the default are re-declared here. */
  .hcms-shell[data-theme="full-volume"] {
    --mirk-canvas:        light-dark(#F7F2EA, #0B0C13);
    --mirk-bg:            light-dark(#F7F2EA, #1D1F2F);
    --mirk-fg:            light-dark(#15120e, #F6F7F9);
    --mirk-accent:        light-dark(#efefe5, #232639);
    --mirk-destructive:   light-dark(#d4183d, #ff5566);
    --mirk-focus-color:   light-dark(#BBA288, #5A607F);
    --mirk-bevel-bg:      light-dark(#e9d3bd, #1D1F2F);
    --mirk-bevel-fg:      light-dark(#15120e, #F6F7F9);
    --mirk-bevel-tl:      light-dark(#f3ddc7, #474C65);
    --mirk-bevel-br:      light-dark(#c2ad95, #131725);
    --mirk-bevel-hover-bg: light-dark(#dfc9b3, #232639);
    --mirk-pill-inner-top: light-dark(#efdac7, #232639);
    --mirk-input-border:  light-dark(#957E65, #6E738E);
    --mirk-placeholder-color: light-dark(#7F7366, #545973);
    --mirk-toggle-bg:     light-dark(#DFC9AF, #656D95);
    --mirk-toggle-hi:     light-dark(#E9D6C3, #7F87AD);
    --mirk-toggle-lo:     light-dark(#C7A88A, #505677);
    --mirk-mark-fg:       light-dark(#3F3225, #E1E3EA);
    --mirk-sortable-dot:  light-dark(#e2c5a6, #393f5b);
    --mirk-sortable-shadow:    light-dark(#c7a47f, #111527);
    --mirk-sortable-label:     light-dark(#231e18, #edeef2);
    --mirk-sortable-placeholder: light-dark(#99826c, #6f7695);
    --mirk-slider-fill:   light-dark(#e9d3bd, #232639);
    --mirk-slider-nub-bg: light-dark(#DFC9AF, #656D95);
    --mirk-slider-nub-hi: light-dark(#E9D6C3, #7F87AD);
    --mirk-slider-nub-lo: light-dark(#C7A88A, #505677);
    /* :root (Pixel Quiet) leaves the chip primary as its own fg ink; the original
       default tinted it a warm brown in light \u2014 restore that here. */
    --mirk-chip-primary-bg: light-dark(#1C170E, var(--mirk-fg));
  }

  /* Roll your own the same way \u2014 an explicit [data-theme] block is the escape hatch:
     [data-theme="sunset"] { color-scheme: light; --mirk-accent: #f0a868; \u2026 } */
}

@layer components {
  /* Visually hidden, still focusable/announced. The hidden native input behind
     every custom control relies on it; Tailwind is optional now. */
  .hcms-shell .mirk-sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
  }

  /* ============================ BUTTON ============================ */
  .hcms-shell .mirk-button {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    font: inherit; line-height: 1.5; cursor: pointer; user-select: none;
    text-align: center;
    color: var(--mirk-bevel-fg);
    background: var(--mirk-bevel-bg);
    border: 2px solid;
    /* Raised bevel: light top+left, dark right+bottom. Shorthand is T R B L. */
    border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
    padding: 4px 14px 5px;                     /* medium */
    outline: none;
  }
  .hcms-shell .mirk-button__label { white-space: nowrap; user-select: none; display: inline-block; }

  /* States, written once, shared by every size and shape. */
  .hcms-shell .mirk-button:hover { background-color: var(--mirk-bevel-hover-bg); }
  .hcms-shell .mirk-button:active {
    border-color: var(--mirk-bevel-br) var(--mirk-bevel-tl) var(--mirk-bevel-tl) var(--mirk-bevel-br);
  }
  .hcms-shell .mirk-button:not(.mirk-button--round):active .mirk-button__label { translate: 1.5px 1.5px; }
  /* Direct focus (a real <button>) or a focus-visible descendant (a <label>
     wrapping a hidden input, as the file/image upload triggers do). */
  .hcms-shell .mirk-button:focus-visible, .hcms-shell .mirk-button:has(:focus-visible) {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-button:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Sizes set padding + font (rect); round re-homes padding to the label below. */
  .hcms-shell .mirk-button--small { padding: 3px 12px; font-size: 14px; }
  .hcms-shell .mirk-button--large { padding: 4px 17px 7px; font-size: 18px; border-width: 3px; }

  /* Round register: a gradient pill frame with the label as the inner fill. */
  .hcms-shell .mirk-button--round {
    border: none; padding: 2px; border-radius: 14px;
    background-color: var(--mirk-canvas);
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-br), var(--mirk-bevel-tl));
    opacity: 0.9; transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .hcms-shell .mirk-button--round:hover { opacity: 1; }
  .hcms-shell .mirk-button--round:active {
    background-image: linear-gradient(to bottom in oklab, var(--mirk-bevel-br), var(--mirk-bevel-tl));
  }
  .hcms-shell .mirk-button--round .mirk-button__label {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 4px 17px 6px; border-radius: 12px;
    color: var(--mirk-bevel-fg);
    background-color: var(--mirk-bevel-bg);
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-bg), var(--mirk-pill-inner-top));
  }
  .hcms-shell .mirk-button--round.mirk-button--small { border-radius: 12px; }
  .hcms-shell .mirk-button--round.mirk-button--small .mirk-button__label { padding: 2px 14px; border-radius: 10px; }
  .hcms-shell .mirk-button--round.mirk-button--large { border-radius: 16px; }
  .hcms-shell .mirk-button--round.mirk-button--large .mirk-button__label { padding: 7px 24px 9px; border-radius: 14px; }

  /* Quiet: a borderless text button (transparent border keeps the hit area + the
     baseline aligned with neighbouring bevel buttons). For tertiary actions. */
  .hcms-shell .mirk-button--quiet {
    background: none; background-image: none;
    border-color: transparent; color: var(--mirk-placeholder-color);
  }
  .hcms-shell .mirk-button--quiet:hover { background: none; color: var(--mirk-fg); }
  .hcms-shell .mirk-button--quiet:active { border-color: transparent; }

  /* ============================ TEXT INPUT ============================ */
  .hcms-shell .mirk-input {
    width: 100%;
    background: var(--mirk-bevel-bg); color: var(--mirk-bevel-fg);
    border: 1px solid var(--mirk-input-border);
    padding: 5px 14px 6px;                     /* medium */
    font: inherit; line-height: 1.5; border-radius: 0; outline: none;
  }
  .hcms-shell .mirk-input::placeholder { color: var(--mirk-placeholder-color); }
  .hcms-shell .mirk-input:focus-visible {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-input--small { padding: 4px 12px; font-size: 14px; }
  .hcms-shell .mirk-input--large { padding: 6px 17px 9px; font-size: 18px; }
  .hcms-shell .mirk-input--rounded { border-radius: var(--mirk-radius); }

  /* ============================ TEXTAREA ============================ */
  .hcms-shell .mirk-textarea {
    width: 100%;
    background: var(--mirk-bevel-bg); color: var(--mirk-bevel-fg);
    border: 1px solid var(--mirk-input-border);
    padding: 6px 17px 9px; font: inherit; font-size: 18px; line-height: 1.5;
    border-radius: 0; outline: none; resize: vertical;
  }
  .hcms-shell .mirk-textarea::placeholder { color: var(--mirk-placeholder-color); }
  .hcms-shell .mirk-textarea:focus-visible {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-textarea--rounded { border-radius: var(--mirk-radius); }

  /* ============================ NUMBER ============================ */
  .hcms-shell .mirk-number {
    display: flex; align-items: stretch; width: 100%;
    background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border); border-radius: 0;
  }
  .hcms-shell .mirk-number:has(:focus-visible) {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-number__input {
    flex: 1; min-width: 0; background: transparent; color: var(--mirk-bevel-fg);
    padding: 5px 10px 6px 14px;                /* medium */
    font: inherit; line-height: 1.5; outline: none;
    appearance: textfield; -webkit-appearance: textfield;
  }
  .hcms-shell .mirk-number__input::-webkit-outer-spin-button, .hcms-shell .mirk-number__input::-webkit-inner-spin-button { -webkit-appearance: none; appearance: none; }
  .hcms-shell .mirk-number__steps { display: flex; flex-direction: column; padding: 2px; gap: 2px; }
  .hcms-shell .mirk-number__step {
    flex: 1; cursor: pointer; line-height: 1; padding: 0 10px; font-size: 9px;  /* medium */
    display: flex; align-items: center; justify-content: center;
    background: var(--mirk-bevel-bg); outline: none;
    border: 2px solid;
    border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
  }
  .hcms-shell .mirk-number__step:hover { background: var(--mirk-bevel-hover-bg); }
  .hcms-shell .mirk-number__step:active {
    border-color: var(--mirk-bevel-br) var(--mirk-bevel-tl) var(--mirk-bevel-tl) var(--mirk-bevel-br);
  }
  .hcms-shell .mirk-number__step:focus-visible { outline: 1px solid var(--mirk-focus-color); outline-offset: 1px; }

  .hcms-shell .mirk-number--small .mirk-number__input { padding: 4px 8px 4px 12px; font-size: 14px; }
  .hcms-shell .mirk-number--small .mirk-number__step { padding: 0 8px; font-size: 8px; }
  .hcms-shell .mirk-number--large .mirk-number__input { padding: 6px 12px 9px 17px; font-size: 18px; }
  .hcms-shell .mirk-number--large .mirk-number__step { padding: 0 12px; font-size: 10px; }

  .hcms-shell .mirk-number--rounded { border-radius: var(--mirk-radius); }
  .hcms-shell .mirk-number--rounded .mirk-number__step { border-radius: 3px; }

  /* ============================ SELECT / DROPDOWN ============================ */
  /* Keeps appearance:none + a real chevron (renders identically everywhere today);
     base-select/::picker is a future enhancement. */
  .hcms-shell .mirk-select { position: relative; }
  .hcms-shell .mirk-select__field {
    width: 100%; appearance: none; -webkit-appearance: none;
    background: var(--mirk-bevel-bg); color: var(--mirk-bevel-fg);
    border: 2px solid;
    border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
    padding: 4px 40px 5px 14px;                /* medium */
    font: inherit; line-height: 1.5; border-radius: 0; outline: none;
  }
  .hcms-shell .mirk-select__field:focus-visible {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-select__chevron {
    pointer-events: none; position: absolute; top: 50%; right: 14px;  /* medium */
    translate: 0 -50%; rotate: 90deg; display: inline-block; line-height: 1; font-size: 20px;
  }
  .hcms-shell .mirk-select--small .mirk-select__field { padding: 3px 36px 3px 12px; font-size: 14px; }
  .hcms-shell .mirk-select--small .mirk-select__chevron { right: 12px; font-size: 18px; }
  .hcms-shell .mirk-select--large .mirk-select__field { padding: 4px 48px 7px 17px; font-size: 18px; border-width: 3px; }
  .hcms-shell .mirk-select--large .mirk-select__chevron { right: 16px; font-size: 24px; }

  /* Round: gradient pill frame around a borderless, pill-filled select. */
  .hcms-shell .mirk-select--round .mirk-select__frame {
    padding: 2px; border-radius: 14px;         /* medium */
    background-color: var(--mirk-canvas);
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-br), var(--mirk-bevel-tl));
  }
  .hcms-shell .mirk-select--round .mirk-select__frame:has(:focus-visible) {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-select--round .mirk-select__field {
    border: none; background-color: transparent;
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-bg), var(--mirk-pill-inner-top));
    border-radius: 12px; padding: 4px 40px 6px 17px;   /* medium */
  }
  .hcms-shell .mirk-select--round.mirk-select--small .mirk-select__frame { border-radius: 12px; }
  .hcms-shell .mirk-select--round.mirk-select--small .mirk-select__field { border-radius: 10px; padding: 2px 36px 2px 14px; }
  .hcms-shell .mirk-select--round.mirk-select--large .mirk-select__frame { border-radius: 16px; }
  .hcms-shell .mirk-select--round.mirk-select--large .mirk-select__field { border-radius: 14px; padding: 7px 48px 9px 24px; }
  .hcms-shell .mirk-select--round.mirk-select--large .mirk-select__chevron { right: 16px; font-size: 24px; }

  /* ============================ CHECKBOX ============================ */
  .hcms-shell .mirk-checkbox { display: inline-flex; align-items: center; gap: 0.75rem; cursor: pointer; width: fit-content; }
  .hcms-shell .mirk-checkbox__box {
    position: relative; flex-shrink: 0; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center; border-radius: 0;
    background: var(--mirk-bevel-bg);
    border: 2px solid;
    border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
  }
  .hcms-shell .mirk-checkbox__mark {
    opacity: 0; display: block; width: 6px; height: 12px;
    border-right: 2.5px solid var(--mirk-mark-fg); border-bottom: 2.5px solid var(--mirk-mark-fg);
    rotate: 45deg; translate: 0.5px -1.5px;
  }
  .hcms-shell .mirk-checkbox__label { font-size: 18px; line-height: 1.5; }

  .hcms-shell .mirk-checkbox:has(:checked) .mirk-checkbox__box { border-color: var(--mirk-input-border); }
  .hcms-shell .mirk-checkbox:has(:checked) .mirk-checkbox__mark { opacity: 1; }
  .hcms-shell .mirk-checkbox:has(:focus-visible) .mirk-checkbox__box {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }

  .hcms-shell .mirk-checkbox--small { gap: 0.5rem; }
  .hcms-shell .mirk-checkbox--small .mirk-checkbox__box { width: 18px; height: 18px; }
  .hcms-shell .mirk-checkbox--small .mirk-checkbox__mark {
    width: 5px; height: 10px;
    border-right-width: 2px; border-bottom-width: 2px; translate: 0.5px -1px;
  }
  .hcms-shell .mirk-checkbox--small .mirk-checkbox__label { font-size: 14px; }

  /* ============================ RADIO ============================ */
  .hcms-shell .mirk-radio { display: inline-flex; align-items: center; gap: 0.75rem; cursor: pointer; width: fit-content; }
  .hcms-shell .mirk-radio__ring {
    position: relative; flex-shrink: 0; width: 25px; height: 25px; border-radius: 9999px;
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-br), var(--mirk-bevel-tl));
  }
  .hcms-shell .mirk-radio__fill {
    display: block; position: absolute; inset: 2px; border-radius: 9999px;
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-bg), var(--mirk-pill-inner-top));
  }
  .hcms-shell .mirk-radio__dot {
    display: none; position: absolute; top: 50%; left: 50%; translate: -50% -50%;
    width: 9px; height: 9px; border-radius: 9999px; background: var(--mirk-mark-fg);
  }
  .hcms-shell .mirk-radio__label { font-size: 18px; line-height: 1.5; }

  .hcms-shell .mirk-radio:has(:checked) .mirk-radio__ring {
    background-image: none; background-color: var(--mirk-bevel-bg);
    border: 2px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-radio:has(:checked) .mirk-radio__fill { display: none; }
  .hcms-shell .mirk-radio:has(:checked) .mirk-radio__dot { display: block; }
  .hcms-shell .mirk-radio:has(:focus-visible) .mirk-radio__ring {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }

  .hcms-shell .mirk-radio--small { gap: 0.5rem; }
  .hcms-shell .mirk-radio--small .mirk-radio__ring { width: 20px; height: 20px; }
  .hcms-shell .mirk-radio--small .mirk-radio__dot { width: 7px; height: 7px; }
  .hcms-shell .mirk-radio--small .mirk-radio__label { font-size: 14px; }

  /* ============================ TOGGLE ============================ */
  .hcms-shell .mirk-toggle { display: inline-flex; align-items: center; gap: 0.75rem; cursor: pointer; width: fit-content; }
  .hcms-shell .mirk-toggle__track {
    position: relative; flex-shrink: 0; width: 49px; height: 27px; border-radius: 0;
    background: var(--mirk-canvas);            /* own recessed channel, like the slider track \u2014 never the host page (0033) */
    border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-toggle__thumb {
    position: absolute; top: 3px; left: 3px; width: 19px; height: 19px;
    background-color: var(--mirk-toggle-bg);
    border: 2px solid;
    border-color: var(--mirk-toggle-hi) var(--mirk-toggle-lo) var(--mirk-toggle-lo) var(--mirk-toggle-hi);
    transition-property: transform, translate, scale, rotate;
    transition-duration: 0.15s; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  .hcms-shell .mirk-toggle__label { font-size: 18px; line-height: 1.5; }

  .hcms-shell .mirk-toggle:has(:checked) .mirk-toggle__thumb { translate: 22px; }
  .hcms-shell .mirk-toggle:has(:focus-visible) .mirk-toggle__track {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }

  .hcms-shell .mirk-toggle--round .mirk-toggle__track { width: 50px; height: 29px; border-radius: 9999px; }
  .hcms-shell .mirk-toggle--round .mirk-toggle__thumb {
    width: 21px; height: 21px; border: none; border-radius: 9999px;
    background-color: transparent;
    background-image: linear-gradient(to top in oklab, var(--mirk-toggle-lo), var(--mirk-toggle-hi));
  }
  .hcms-shell .mirk-toggle--round .mirk-toggle__thumb::after {
    content: ""; position: absolute; inset: 2px; border-radius: 9999px; background: var(--mirk-toggle-bg);
  }
  .hcms-shell .mirk-toggle--round:has(:checked) .mirk-toggle__thumb { translate: 21px; }

  .hcms-shell .mirk-toggle--small { gap: 0.5rem; }
  .hcms-shell .mirk-toggle--small .mirk-toggle__track { width: 42px; height: 23px; }
  .hcms-shell .mirk-toggle--small .mirk-toggle__thumb { top: 2px; left: 2px; width: 17px; height: 17px; }
  .hcms-shell .mirk-toggle--small:has(:checked) .mirk-toggle__thumb { translate: 19px; }
  .hcms-shell .mirk-toggle--small .mirk-toggle__label { font-size: 14px; }
  .hcms-shell .mirk-toggle--round.mirk-toggle--small .mirk-toggle__track { width: 43px; height: 25px; }
  .hcms-shell .mirk-toggle--round.mirk-toggle--small .mirk-toggle__thumb { width: 19px; height: 19px; }
  .hcms-shell .mirk-toggle--round.mirk-toggle--small:has(:checked) .mirk-toggle__thumb { translate: 18px; }

  /* ============================ SLIDER ============================ */
  .hcms-shell .mirk-slider { position: relative; height: 32px; width: 100%; --mirk-value: 0%; }
  .hcms-shell .mirk-slider__input {
    position: absolute; inset: 0; width: 100%; height: 100%;
    opacity: 0; cursor: pointer; z-index: 10;
  }
  .hcms-shell .mirk-slider__track {
    position: absolute; left: 0; right: 0; top: 50%; translate: 0 -50%; height: 12px;
    background: var(--mirk-canvas); border: 1px solid var(--mirk-input-border); overflow: hidden;
  }
  .hcms-shell .mirk-slider__fill { height: 100%; width: var(--mirk-value); background: var(--mirk-slider-fill); }
  .hcms-shell .mirk-slider__nub {
    position: absolute; top: 50%; left: var(--mirk-value); translate: -50% -50%;
    width: 21px; height: 21px; pointer-events: none;
    background-color: var(--mirk-slider-nub-bg);
    border: 2px solid;
    border-color: var(--mirk-slider-nub-hi) var(--mirk-slider-nub-lo) var(--mirk-slider-nub-lo) var(--mirk-slider-nub-hi);
  }
  .hcms-shell .mirk-slider__input:focus-visible ~ .mirk-slider__nub {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }

  .hcms-shell .mirk-slider--round .mirk-slider__track { height: 10px; border-radius: 9999px; }
  .hcms-shell .mirk-slider--round .mirk-slider__nub {
    width: 24px; height: 24px; border: none; border-radius: 9999px;
    background-color: transparent;
    background-image: linear-gradient(to top in oklab, var(--mirk-slider-nub-lo), var(--mirk-slider-nub-hi));
  }
  .hcms-shell .mirk-slider--round .mirk-slider__nub::after {
    content: ""; position: absolute; inset: 2px; border-radius: 9999px; background: var(--mirk-slider-nub-bg);
  }

  .hcms-shell .mirk-slider--small { height: 24px; }
  .hcms-shell .mirk-slider--small .mirk-slider__track { height: 8px; }
  .hcms-shell .mirk-slider--small .mirk-slider__nub { width: 16px; height: 16px; }
  .hcms-shell .mirk-slider--round.mirk-slider--small .mirk-slider__track { height: 7px; }
  .hcms-shell .mirk-slider--round.mirk-slider--small .mirk-slider__nub { width: 18px; height: 18px; }

  /* ============================ DATE ============================ */
  .hcms-shell .mirk-date { position: relative; }
  .hcms-shell .mirk-date__field {
    width: 100%; background: var(--mirk-bevel-bg); color: var(--mirk-bevel-fg);
    border: 1px solid var(--mirk-input-border);
    padding: 6px 44px 9px 17px; font: inherit; font-size: 18px; line-height: 1.5;
    border-radius: 0; outline: none;
  }
  .hcms-shell .mirk-date__field:focus-visible {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-date__field::-webkit-calendar-picker-indicator {
    opacity: 0; position: absolute; right: 0; top: 0; bottom: 0; width: 44px; margin: 0; cursor: pointer;
  }
  .hcms-shell .mirk-date__field::-webkit-inner-spin-button { -webkit-appearance: none; appearance: none; }
  .hcms-shell .mirk-date__field::-webkit-clear-button { -webkit-appearance: none; appearance: none; }
  .hcms-shell .mirk-date__icon {
    pointer-events: none; position: absolute; right: 16px; top: 50%; translate: 0 -50%;
  }
  .hcms-shell .mirk-date--rounded .mirk-date__field { border-radius: var(--mirk-radius); }

  .hcms-shell .mirk-date--small .mirk-date__field { padding: 4px 36px 4px 12px; font-size: 14px; }
  .hcms-shell .mirk-date--small .mirk-date__field::-webkit-calendar-picker-indicator { width: 36px; }
  .hcms-shell .mirk-date--small .mirk-date__icon { right: 12px; }

  /* The native file/image inputs are visually hidden; their styled label drives
     them, and the focus ring rides :has(:focus-visible) on button or container. */
  .hcms-shell .mirk-file__input, .hcms-shell .mirk-image__input {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
  }

  /* ============================ FILE ============================ */
  .hcms-shell .mirk-file { display: flex; align-items: center; gap: 0.75rem; width: 100%; }
  .hcms-shell .mirk-file__name {
    color: var(--mirk-placeholder-color); font-size: 18px; line-height: 1.5;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .hcms-shell .mirk-file__name[data-filled] { color: var(--mirk-bevel-fg); }

  /* Compact: a shared bordered container holds a smaller button + the name. */
  .hcms-shell .mirk-file--compact {
    padding: 4px 8px; background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border); border-radius: 0;
  }
  .hcms-shell .mirk-file--compact:has(:focus-visible) {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  /* The upload trigger is a .mirk-button; nudge it onto the container's left
     border so the bevel sits flush (covers compact and round-compact). */
  .hcms-shell .mirk-file--compact .mirk-button { margin-left: -1px; }
  .hcms-shell .mirk-file--compact .mirk-file__name { font-size: 16px; }
  .hcms-shell .mirk-file--compact.mirk-file--round { border-radius: 15px; }

  /* Filled: the name slot becomes a link to the chosen file, beside a circular \xD7
     to clear it: a 1px ring over a bevel fill that turns destructive on hover.
     Empty keeps the placeholder span. */
  .hcms-shell a.mirk-file__name { text-decoration: underline; text-underline-offset: 2px; }
  .hcms-shell .mirk-file__remove {
    appearance: none; -webkit-appearance: none; flex-shrink: 0;
    width: 18px; height: 18px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    margin: 0; padding: 0; cursor: pointer; line-height: 0;
    color: var(--mirk-bevel-fg); background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-file__remove svg { display: block; width: 66%; height: 66%; }
  .hcms-shell .mirk-file__remove:hover { border-color: var(--mirk-destructive); color: var(--mirk-destructive); }

  /* Small: tighter name + gap + remove \xD7; pair the trigger with mirk-button--small.
     Composes with --compact (densest) and --round. */
  .hcms-shell .mirk-file--small { gap: 0.5rem; }
  .hcms-shell .mirk-file--small .mirk-file__name { font-size: 14px; }
  .hcms-shell .mirk-file--small .mirk-file__remove { width: 16px; height: 16px; }
  .hcms-shell .mirk-file--small.mirk-file--compact { padding: 3px 8px; }
  .hcms-shell .mirk-file--small.mirk-file--compact .mirk-file__name { font-size: 13px; }

  /* ============================ IMAGE ============================ */
  .hcms-shell .mirk-image { display: flex; flex-direction: column; gap: 0.5rem; }
  .hcms-shell .mirk-image__frame {
    position: relative; width: 120px; height: 120px; overflow: hidden; border-radius: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-input-border);
    color: var(--mirk-placeholder-color); font-size: 14px; line-height: 1.5;
  }
  .hcms-shell .mirk-image__preview { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .hcms-shell .mirk-image--rounded .mirk-image__frame { border-radius: var(--mirk-radius); }
  /* The upload trigger is a .mirk-button; keep it hugging its label instead of
     stretching to fill this column-flex container. */
  .hcms-shell .mirk-image .mirk-button { width: fit-content; }

  /* Compact: a focused 56px thumbnail upload. Empty shows a small upload button;
     once an image is chosen the button hides and a thumbnail + corner \xD7 takes its
     place. The frame clips the image (overflow hidden) while the thumb wrapper
     stays visible, so the \xD7 can sit just outside the corner without being cut. */
  .hcms-shell .mirk-image--compact { flex-direction: row; align-items: center; gap: 0; }
  .hcms-shell .mirk-image__thumb { position: relative; display: inline-block; width: fit-content; margin: 0; line-height: 0; }
  .hcms-shell .mirk-image--compact .mirk-image__frame {
    width: 56px; height: 56px; overflow: hidden; border-radius: 0;
    border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-image--compact.mirk-image--rounded .mirk-image__frame { border-radius: var(--mirk-radius); }
  .hcms-shell .mirk-image--compact .mirk-image__preview {
    position: static; inset: auto; width: 100%; height: 100%; display: block; object-fit: cover;
  }
  .hcms-shell .mirk-image__remove {
    position: absolute; top: -7px; right: -7px;
    width: 18px; height: 18px; border-radius: 50%; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    appearance: none; -webkit-appearance: none; cursor: pointer; line-height: 0;
    color: var(--mirk-bevel-fg); background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-image__remove svg { display: block; width: 10px; height: 10px; }
  .hcms-shell .mirk-image__remove:hover { color: var(--mirk-destructive); border-color: var(--mirk-destructive); }

  /* ============================ TAGS ============================ */
  .hcms-shell .mirk-tags {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-input-border);
    border-radius: 0; cursor: text;
  }
  .hcms-shell .mirk-tags:has(:focus-visible) {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-tags__chip {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 2px 8px 2px 12px; font-size: 14px; line-height: 1.5;
    color: var(--mirk-bevel-fg); background: var(--mirk-bevel-bg);
    border: 2px solid;
    border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
  }
  .hcms-shell .mirk-tags__remove {
    appearance: none; -webkit-appearance: none;
    margin: 0; padding: 0; border: 0; background: none; color: inherit;
    cursor: pointer; font-size: 14px; line-height: 1;
  }
  .hcms-shell .mirk-tags__remove:hover { color: var(--mirk-destructive); }
  .hcms-shell .mirk-tags__input {
    appearance: none; -webkit-appearance: none;
    border: 0; padding: 0;
    flex: 1; min-width: 120px; background: transparent; color: var(--mirk-bevel-fg);
    outline: none; font-size: 18px; line-height: 1.5;
  }
  .hcms-shell .mirk-tags__input::placeholder { color: var(--mirk-placeholder-color); }

  .hcms-shell .mirk-tags--round { border-radius: 15px; }
  .hcms-shell .mirk-tags--round .mirk-tags__chip {
    padding: 2px; border: none; border-radius: 12px;
    background-color: transparent;
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-br), var(--mirk-bevel-tl));
  }
  .hcms-shell .mirk-tags__chip-inner {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 1px 8px 1px 12px; border-radius: 10px;
    color: var(--mirk-bevel-fg); background-color: var(--mirk-bevel-bg);
    background-image: linear-gradient(to top in oklab, var(--mirk-bevel-bg), var(--mirk-pill-inner-top));
  }

  .hcms-shell .mirk-tags--small { gap: 0.375rem; padding: 0.375rem; }
  .hcms-shell .mirk-tags--small .mirk-tags__chip { padding: 1px 6px 1px 10px; font-size: 12px; }
  .hcms-shell .mirk-tags--small .mirk-tags__remove { font-size: 12px; }
  .hcms-shell .mirk-tags--small .mirk-tags__input { font-size: 14px; min-width: 90px; }
  .hcms-shell .mirk-tags--small.mirk-tags--round { border-radius: 12px; }
  .hcms-shell .mirk-tags--small.mirk-tags--round .mirk-tags__chip-inner { padding: 1px 6px 1px 10px; }

  /* ============================ SORTABLE ============================ */
  .hcms-shell .mirk-sortable { display: flex; flex-direction: column; gap: 0.5rem; }
  .hcms-shell .mirk-sortable__item {
    display: flex; flex-direction: row; width: 100%;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-sortable__grip {
    width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    cursor: grab; border-right: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-sortable__grip:active { cursor: grabbing; }
  .hcms-shell .mirk-sortable__dots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
  .hcms-shell .mirk-sortable__dot {
    display: block; width: 4px; height: 4px; background: var(--mirk-sortable-dot);
    box-shadow: 1px 0 0 0 var(--mirk-sortable-shadow), 0 1px 0 0 var(--mirk-sortable-shadow), 1px 1px 0 0 var(--mirk-sortable-shadow);
  }
  .hcms-shell .mirk-sortable__body { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .hcms-shell .mirk-sortable__row { padding: 8px 17px 9px; }
  .hcms-shell .mirk-sortable__row:not(:last-child) { border-bottom: 1px solid var(--mirk-input-border); }
  .hcms-shell .mirk-sortable__label {
    display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;
    margin-bottom: 2px; color: var(--mirk-sortable-label);
  }
  .hcms-shell .mirk-sortable__field {
    width: 100%; background: transparent; color: var(--mirk-bevel-fg);
    font-size: 18px; line-height: 1.5; outline: none;
  }
  .hcms-shell .mirk-sortable__field::placeholder { color: var(--mirk-sortable-placeholder); }
  .hcms-shell .mirk-sortable__field:focus-visible {
    outline: 1px solid var(--mirk-focus-color); outline-offset: var(--mirk-focus-offset);
  }
  .hcms-shell .mirk-sortable--small { gap: 0.375rem; }
  .hcms-shell .mirk-sortable--small .mirk-sortable__grip { width: 24px; }
  .hcms-shell .mirk-sortable--small .mirk-sortable__row { padding: 5px 13px 6px; }
  .hcms-shell .mirk-sortable--small .mirk-sortable__label { font-size: 10px; margin-bottom: 1px; }
  .hcms-shell .mirk-sortable--small .mirk-sortable__field { font-size: 14px; }

  /* ============================ CHIP ============================ */
  /* A collapsible recovery/notification: a round pill that expands into a RAISED
     panel \u2014 the kit's one elevated surface (a distinct --mirk-bg face, a hairline
     outline, and a soft drop shadow, the only shadow in the kit, reserved for this
     raised tier). State lives in classes (--open, is-changes) so it round-trips via
     outerHTML; mirk.js only flips them on click. Color reads from generic kit
     tokens through 5 slim --mirk-chip-* hooks, so it matches the kit and reskins by
     overriding a hook, not a rule. In a Hyperclay app, add \`save-remove\` to the
     block so a transient prompt never persists into the saved file. */
  .hcms-shell .mirk-chip { display: inline-flex; flex-direction: column; align-items: flex-start; }
  .hcms-shell .mirk-chip__panel { display: none; }
  .hcms-shell .mirk-chip--open .mirk-chip__trigger { display: none; }
  .hcms-shell .mirk-chip--open .mirk-chip__panel { display: flex; }

  /* Collapsed chip \u2014 a round mirk-button pill (mirk-button--round in the markup),
     the alert glyph seated in the label, so it reads as a distinct affordance, not
     a flat button. A soft, tight lift sets it above the page; deeper on a dark
     canvas (same media + forced-mode pattern as the panel shadow below). */
  .hcms-shell .mirk-chip__trigger .mirk-button__label { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
  .hcms-shell .mirk-chip__trigger { box-shadow: 0 6px 14px -8px rgba(43, 36, 27, 0.5), 0 2px 5px -3px rgba(43, 36, 27, 0.32); }
  @media (prefers-color-scheme: dark) { .hcms-shell .mirk-chip__trigger { box-shadow: 0 6px 14px -8px rgba(0, 0, 0, 0.6), 0 2px 6px -3px rgba(0, 0, 0, 0.5); } }
  .hcms-shell.light .mirk-chip__trigger, .hcms-shell[data-theme="light"] .mirk-chip__trigger { box-shadow: 0 6px 14px -8px rgba(43, 36, 27, 0.5), 0 2px 5px -3px rgba(43, 36, 27, 0.32); }
  .hcms-shell.dark .mirk-chip__trigger, .hcms-shell[data-theme="dark"] .mirk-chip__trigger { box-shadow: 0 6px 14px -8px rgba(0, 0, 0, 0.6), 0 2px 6px -3px rgba(0, 0, 0, 0.5); }
  /* Drive the warning fill from CSS, not an SVG fill="var(...)" presentation
     attribute (var() is not reliably honored there). */
  .hcms-shell .mirk-chip__warn { fill: var(--mirk-chip-alert); }
  .hcms-shell .mirk-chip__trigger .mirk-chip__warn { vertical-align: -2px; }

  /* The panel \u2014 the raised surface: a --mirk-bg face over the page, a hairline
     outline, a soft drop shadow. */
  .hcms-shell .mirk-chip__panel {
    width: 300px; max-width: calc(100vw - 44px);
    background: var(--mirk-chip-surface); color: var(--mirk-fg);
    border: 1px solid var(--mirk-chip-edge); border-radius: var(--mirk-radius);
    box-shadow: 0 20px 50px -30px rgba(43, 36, 27, 0.6);
    padding: 14px 15px 13px; flex-direction: column; gap: 12px;
  }
  /* The panel's larger drop (the collapsed pill above carries a tighter one); deepen
     both on a dark canvas. Mirrors the --focus-offset pattern: a media default for
     the OS, plus explicit forced-mode overrides. */
  @media (prefers-color-scheme: dark) { .hcms-shell .mirk-chip__panel { box-shadow: 0 20px 52px -26px rgba(0, 0, 0, 0.78); } }
  .hcms-shell.light .mirk-chip__panel, .hcms-shell[data-theme="light"] .mirk-chip__panel { box-shadow: 0 20px 50px -30px rgba(43, 36, 27, 0.6); }
  .hcms-shell.dark .mirk-chip__panel, .hcms-shell[data-theme="dark"] .mirk-chip__panel { box-shadow: 0 20px 52px -26px rgba(0, 0, 0, 0.78); }

  /* Head \u2014 icon, text, collapse glyph. */
  .hcms-shell .mirk-chip__head { display: flex; gap: 10px; align-items: flex-start; }
  .hcms-shell .mirk-chip__icon { flex-shrink: 0; line-height: 0; margin-top: 1px; }
  .hcms-shell .mirk-chip__headtext { min-width: 0; }
  .hcms-shell .mirk-chip__eyebrow {
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.2em;
    color: var(--mirk-placeholder-color); margin-bottom: 3px;
  }
  .hcms-shell .mirk-chip__title { margin: 0; font-size: 13px; font-weight: 400; line-height: 1.3; color: var(--mirk-fg); }
  .hcms-shell .mirk-chip__collapse {
    margin-left: auto; flex-shrink: 0; width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    background: none; border: 0; cursor: pointer; padding: 0;
    color: var(--mirk-placeholder-color);
  }
  .hcms-shell .mirk-chip__collapse:hover { color: var(--mirk-fg); }
  .hcms-shell .mirk-chip__collapse svg { display: block; }

  /* Meta line. */
  .hcms-shell .mirk-chip__meta { font-size: 11px; letter-spacing: 0.04em; color: var(--mirk-placeholder-color); }
  .hcms-shell .mirk-chip__changes-toggle {
    background: none; border: 0; cursor: pointer; font: inherit; font-size: 11px; padding: 0 0 0 4px;
    color: var(--mirk-placeholder-color); text-decoration: underline; text-underline-offset: 2px;
  }
  .hcms-shell .mirk-chip__changes-toggle:hover { color: var(--mirk-fg); }

  /* Before/after field table \u2014 a recessed stack, revealed by the changes toggle. */
  .hcms-shell .mirk-chip__preview {
    display: none; flex-direction: column; gap: 11px;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-chip-edge);
    padding: 10px 11px;
  }
  .hcms-shell .mirk-chip__panel.is-changes .mirk-chip__preview { display: flex; }
  .hcms-shell .mirk-chip__row { display: flex; flex-direction: column; gap: 2px; }
  .hcms-shell .mirk-chip__key {
    font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--mirk-placeholder-color);
  }
  .hcms-shell .mirk-chip__old, .hcms-shell .mirk-chip__new { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hcms-shell .mirk-chip__old { font-size: 11px; color: var(--mirk-chip-alert); text-decoration: line-through; opacity: 0.85; }
  .hcms-shell .mirk-chip__new { font-size: 12px; color: var(--mirk-fg); }

  /* Action stack \u2014 full-width buttons by weight: an embossed primary, a plain bevel
     revert, a quiet (--quiet) dismiss. */
  .hcms-shell .mirk-chip__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 1px; }
  .hcms-shell .mirk-chip__actions .mirk-button { width: 100%; }
  /* Primary action \u2014 a genuine kit bevel button whose bevel palette is derived from
     the chip's primary fill (lighter top-left, darker bottom-right), so it embosses
     on any color. The base .mirk-button rules then drive its border, hover, and the
     :active flip, identical to the kit's other buttons. */
  .hcms-shell .mirk-chip__actions .mirk-chip__action--primary {
    --mirk-bevel-bg:       var(--mirk-chip-primary-bg);
    --mirk-bevel-fg:       var(--mirk-chip-primary-fg);
    --mirk-bevel-tl:       color-mix(in srgb, var(--mirk-chip-primary-bg), white 24%);
    --mirk-bevel-br:       color-mix(in srgb, var(--mirk-chip-primary-bg), black 32%);
    --mirk-bevel-hover-bg: color-mix(in srgb, var(--mirk-chip-primary-bg), white 10%);
  }

  /* ============================ FIELD ============================ */
  /* Label + control + hint as one unit, so a form composes without utilities
     (and without needing the mirk-page rhythm). Any control drops in; the gap
     matches the page scaffold's label/hint hug. Consecutive fields space
     themselves. */
  .hcms-shell .mirk-field { display: flex; flex-direction: column; gap: 6px; }
  .hcms-shell .mirk-field__label { font-size: 16px; line-height: 1.5; }
  .hcms-shell .mirk-field + .mirk-field { margin-block-start: 18px; }
  .hcms-shell .mirk-field--small .mirk-field__label { font-size: 14px; }

  /* An alert hint inside a field stays hidden until a control in the field
     goes :user-invalid \u2014 a zero-JS native-validation message. Show one
     unconditionally (a server-side error) by placing it outside the field or
     overriding display. */
  .hcms-shell .mirk-field .mirk-hint--alert { display: none; }
  .hcms-shell .mirk-field:has(:user-invalid) .mirk-hint--alert { display: block; }

  /* ============================ INVALID ============================ */
  /* Native constraint validation, styled. :user-invalid fires only after the
     user interacts (unlike :invalid, which would paint required fields red on
     load). A flat destructive border is the 0012 stateful read; the focus ring
     stays the focus signal. Pair the message with mirk-hint--alert. */
  .hcms-shell .mirk-input:user-invalid, .hcms-shell .mirk-textarea:user-invalid, .hcms-shell .mirk-date__field:user-invalid, .hcms-shell .mirk-select__field:user-invalid, .hcms-shell .mirk-number:has(.mirk-number__input:user-invalid) {
    border-color: var(--mirk-destructive);
  }
  .hcms-shell .mirk-checkbox:has(:user-invalid) .mirk-checkbox__box, .hcms-shell .mirk-toggle:has(:user-invalid) .mirk-toggle__track {
    border-color: var(--mirk-destructive);
  }
  /* The unchecked ring is a borderless gradient pill; invalid swaps it for a
     flat destructive ring (the fill pill still seats inside). */
  .hcms-shell .mirk-radio:has(:user-invalid) .mirk-radio__ring {
    background-image: none;
    border: 2px solid var(--mirk-destructive);
  }

  /* ============================ PROGRESS ============================ */
  /* A native <progress> in the slider's clothes: the canvas channel, the
     slider-fill value bar. --blocks segments the fill into pixel blocks.
     Keep the -webkit and -moz rules separate \u2014 an unrecognized pseudo-element
     invalidates the whole selector list. */
  .hcms-shell .mirk-progress {
    appearance: none; -webkit-appearance: none;
    display: block; width: 100%; height: 12px;
    border: 1px solid var(--mirk-input-border);
    background: var(--mirk-canvas);
  }
  .hcms-shell .mirk-progress::-webkit-progress-bar { background: transparent; }
  .hcms-shell .mirk-progress::-webkit-progress-value { background: var(--mirk-slider-fill); }
  .hcms-shell .mirk-progress::-moz-progress-bar { background: var(--mirk-slider-fill); }
  .hcms-shell .mirk-progress--small { height: 8px; }
  .hcms-shell .mirk-progress--round { border-radius: 9999px; overflow: hidden; }
  .hcms-shell .mirk-progress--blocks::-webkit-progress-value {
    background: repeating-linear-gradient(to right,
      var(--mirk-slider-fill) 0 8px, transparent 8px 11px);
  }
  .hcms-shell .mirk-progress--blocks::-moz-progress-bar {
    background: repeating-linear-gradient(to right,
      var(--mirk-slider-fill) 0 8px, transparent 8px 11px);
  }

  /* ============================ NOTE ============================ */
  /* An informational callout. Flat on purpose: bevel means pressable in this
     kit (0012) and a note is content, so it gets the 1px content border over
     the recessed face, never the raised edge. The 4px left edge carries the
     status: neutral ink by default, destructive on --alert. */
  .hcms-shell .mirk-note {
    display: flex; flex-direction: column; gap: 4px;
    background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border);
    border-left: 4px solid var(--mirk-mark-fg);
    padding: 10px 14px 11px;
    font-size: 14px; line-height: 1.5;
  }
  .hcms-shell .mirk-note__title {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;
    color: var(--mirk-mark-fg);
  }
  .hcms-shell .mirk-note__body { color: var(--mirk-fg); }
  .hcms-shell .mirk-note--alert { border-left-color: var(--mirk-destructive); }
  .hcms-shell .mirk-note--alert .mirk-note__title { color: var(--mirk-destructive); }
  .hcms-shell .mirk-note--rounded { border-radius: var(--mirk-radius); }

  /* ============================ HINT ============================ */
  /* Small print under a field: neutral help text, or --alert validation text. */
  .hcms-shell .mirk-hint { margin: 0; font-size: 13px; line-height: 1.5; color: var(--mirk-placeholder-color); }
  .hcms-shell .mirk-hint--alert { color: var(--mirk-destructive); }

  /* ============================ LIST ============================ */
  /* Content bullets. <ul> gets a square pixel dot (the sortable dot's idiom,
     one step larger); a nested <ul> hollows it. <ol> gets zero-padded counters
     in the muted label ink. Styles the bare <li> by descent, like the platform. */
  .hcms-shell .mirk-list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 6px;
    font-size: 16px; line-height: 1.5;
  }
  .hcms-shell .mirk-list li { position: relative; padding-left: 22px; }
  .hcms-shell ul.mirk-list > li::before {
    content: ""; position: absolute; left: 2px; top: 0.55em;
    width: 6px; height: 6px; background: var(--mirk-mark-fg);
    box-shadow: 1px 1px 0 0 var(--mirk-sortable-shadow);
  }
  .hcms-shell ol.mirk-list { counter-reset: mirk-li; }
  .hcms-shell ol.mirk-list > li { counter-increment: mirk-li; padding-left: 38px; }
  .hcms-shell ol.mirk-list > li::before {
    content: counter(mirk-li, decimal-leading-zero) ".";
    position: absolute; left: 0; top: 0;
    color: var(--mirk-sortable-label);
  }

  /* One nested level: hollow square, same stack. */
  .hcms-shell .mirk-list ul {
    list-style: none; margin: 6px 0 0; padding: 0;
    display: flex; flex-direction: column; gap: 6px;
  }
  .hcms-shell .mirk-list ul > li::before {
    content: ""; position: absolute; left: 2px; top: 0.55em;
    width: 6px; height: 6px; background: transparent;
    border: 1.5px solid var(--mirk-mark-fg); box-shadow: none;
  }

  .hcms-shell .mirk-list--small { font-size: 14px; gap: 4px; }
  .hcms-shell .mirk-list--small li { padding-left: 18px; }
  .hcms-shell ul.mirk-list--small > li::before, .hcms-shell .mirk-list--small ul > li::before { width: 5px; height: 5px; }
  .hcms-shell ol.mirk-list--small > li { padding-left: 32px; }

  /* ============================ BADGE ============================ */
  /* A static tag label \u2014 the display counterpart to the mirk-tags input. Flat
     on purpose: bevel means pressable (0012), a badge is content. */
  .hcms-shell .mirk-badge {
    display: inline-flex; align-items: center; gap: 0.375rem;
    padding: 1px 8px 2px; font-size: 12px; line-height: 1.5;
    color: var(--mirk-fg); background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border);
    white-space: nowrap; vertical-align: middle;
  }
  .hcms-shell .mirk-badge--accent { background: var(--mirk-accent); }
  .hcms-shell .mirk-badge--round { border-radius: 9999px; padding: 1px 10px 2px; }
  .hcms-shell .mirk-badge--alert { color: var(--mirk-destructive); border-color: var(--mirk-destructive); }

  /* ============================ TABLE ============================ */
  /* A flat data surface: the content face in a 1px frame, header cells in the
     eyebrow register, hairline row dividers. Semantic <table> styled by
     descent \u2014 no per-cell classes. The header/stripe tints ride color-mix
     toward the ink so they stay visible in every palette (Pixel Quiet's
     canvas and face are nearly the same value). Wrap in an overflow-x:auto
     div when the table can outgrow its column. */
  .hcms-shell .mirk-table {
    width: 100%; border-collapse: collapse;
    background: var(--mirk-bevel-bg);
    border: 1px solid var(--mirk-input-border);
    font-size: 14px; line-height: 1.5;
  }
  .hcms-shell .mirk-table th {
    text-align: left; font-weight: 400;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;
    color: var(--mirk-placeholder-color);
    background: color-mix(in srgb, var(--mirk-bevel-bg), var(--mirk-fg) 4%);
    padding: 7px 14px;
    border-bottom: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-table td {
    padding: 8px 14px;
    border-bottom: 1px solid var(--mirk-input-border);
    vertical-align: top;
  }
  .hcms-shell .mirk-table tbody tr:last-child td { border-bottom: 0; }
  .hcms-shell .mirk-table--striped tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--mirk-bevel-bg), var(--mirk-fg) 3%);
  }
  .hcms-shell .mirk-table--small { font-size: 13px; }
  .hcms-shell .mirk-table--small th { padding: 5px 12px; font-size: 10px; }
  .hcms-shell .mirk-table--small td { padding: 5px 12px; }

  /* ============================ PAGE ============================ */
  /* The quickstart shell: mirk-page on <body> (or any wrapper) gives a centered
     column + typographic defaults, so two CDN tags and one class boot a full
     page. Every rule rides :where() (zero specificity): any utility, component
     class, or consumer rule beats it. Flow rhythm targets direct children only,
     so margins never leak inside component internals. */
  .hcms-shell .mirk-page { max-width: 640px; margin-inline: auto; padding: 48px 24px 96px; }
  .hcms-shell .mirk-page--wide { max-width: 960px; }

  /* Departure Mono ships one weight \u2014 hierarchy comes from size, never bold. */
  .hcms-shell .mirk-page :where(h1, h2, h3, h4) { margin: 0; font-weight: 400; line-height: 1.15; }
  .hcms-shell .mirk-page :where(h1) { font-size: 40px; }
  .hcms-shell .mirk-page :where(h2) { font-size: 26px; }
  .hcms-shell .mirk-page :where(h3) { font-size: 20px; }
  .hcms-shell .mirk-page :where(h4) { font-size: 16px; }
  .hcms-shell .mirk-page :where(p) { margin: 0; font-size: 16px; line-height: 1.6; }

  .hcms-shell .mirk-page :where(a) { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .hcms-shell .mirk-page :where(code, kbd) {
    font-size: 0.875em; padding: 1px 4px;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-page :where(pre) {
    margin: 0; padding: 12px 14px; font-size: 13px; line-height: 1.5; overflow-x: auto;
    background: var(--mirk-bevel-bg); border: 1px solid var(--mirk-input-border);
  }
  .hcms-shell .mirk-page :where(pre code) { padding: 0; border: 0; background: none; font-size: inherit; }
  .hcms-shell .mirk-page :where(hr) { border: 0; border-top: 1px solid var(--mirk-input-border); }

  /* Flow rhythm \u2014 direct children only; headings open sections, eyebrows and
     hints hug their neighbors. Equal specificity, so source order settles ties. */
  .hcms-shell .mirk-page > :where(* + *) { margin-block-start: 14px; }
  .hcms-shell .mirk-page > :where(h1, h2, h3, h4):where(* + *) { margin-block-start: 40px; }
  .hcms-shell .mirk-page > :where(.mirk-eyebrow + *), .hcms-shell .mirk-page > :where(* + .mirk-hint) { margin-block-start: 6px; }

  /* ============================ EYEBROW ============================ */
  /* The kit's signature section label, as a shippable class. Block so it works
     the same on <p>, <label>, or <div>, and flow margins always apply. */
  .hcms-shell .mirk-eyebrow {
    display: block; margin: 0;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.2em;
    color: var(--mirk-placeholder-color);
  }
}

/* Respect the machine \u2014 outside @layer components so it always wins. */
@media (prefers-reduced-motion: reduce) {
  .hcms-shell .mirk-button--round, .hcms-shell .mirk-toggle__thumb { transition: none; }
  .hcms-shell .mirk-button:active .mirk-button__label { translate: none; }
}
@media (forced-colors: active) {
  .hcms-shell .mirk-button, .hcms-shell .mirk-select__field, .hcms-shell .mirk-checkbox__box, .hcms-shell .mirk-toggle__track { border: 1px solid ButtonText; }
}

/* ===== pixel-quiet overrides (hypercms-owned) ===== */
/* =====================================================================
   Pixel Quiet \u2014 hypercms theme overrides (hypercms-owned).

   Adapted from ARCHIVE_PROJECTS/cms-sidebar/pixel-quiet/overrides.css. Two jobs:
     1. Retune --mirk-* tokens, scoped to .hcms-shell.pixel-quiet (never :root).
     2. Author the panel geometry + the functional chrome the static mockup
        doesn't have (error banner, add/remove/move controls, the engine's
        sortable cards, push / overlay / left-dock modes) on top of the
        .hcms-* structural hooks.

   This file is concatenated AFTER the scoped mirk base+components by
   scripts/build-theme.js, so plain rules here win over mirk's @layer
   components with zero !important. Loaded only inside .hcms-shell, so nothing
   here leaks onto the host page.
   ===================================================================== */

/* ============================================================
   TOKEN RETUNE \u2014 LIGHT (warm cream, gentle near-equal bevel)
   ============================================================ */
.hcms-shell.pixel-quiet {
  color-scheme: light;
  --mirk-canvas: #F7F2EA;
  --mirk-bg: #F7F2EA;
  --mirk-fg: #2B241B;
  --mirk-accent: #efefe5;
  --mirk-destructive: #C24A3A;
  --mirk-focus-color: #C7AE93;

  --mirk-bevel-bg: #FCF8F1;
  --mirk-bevel-fg: #2B241B;
  --mirk-bevel-tl: #F0E7D8;
  --mirk-bevel-br: #E2D4BF;
  --mirk-bevel-hover-bg: #F4ECDF;
  --mirk-pill-inner-top: #FBF6EE;
  --mirk-input-border: #D8C8AF;
  --mirk-placeholder-color: #A8987F;

  --mirk-mark-fg: #6B5942;
  --mirk-toggle-bg: #EFDBBD;
  --mirk-toggle-hi: #F4EADA;
  --mirk-toggle-lo: #C2A87E;
  --mirk-sortable-dot: #DDCBB0;
  --mirk-sortable-shadow: #C9B493;
  --mirk-sortable-label: #8C7B62;
  --mirk-sortable-placeholder: #A8987F;

  --mirk-radius: 5px;
  --mirk-focus-offset: 2px;
}

/* dark token deltas, shared by the explicit .dark opt-in and OS preference */
.hcms-shell.pixel-quiet.dark,
.hcms-shell.pixel-quiet[data-theme="dark"] {
  color-scheme: dark;
  --mirk-canvas: #0B0C13;
  --mirk-bg: #11131E;
  --mirk-fg: #ECEAF2;
  --mirk-accent: #1D1F2F;
  --mirk-focus-color: #4A506B;

  --mirk-bevel-bg: #1A1D2C;
  --mirk-bevel-fg: #ECEAF2;
  --mirk-bevel-tl: #2A2E42;
  --mirk-bevel-br: #14182A;
  --mirk-bevel-hover-bg: #202436;
  --mirk-pill-inner-top: #202436;
  --mirk-input-border: #353B52;
  --mirk-placeholder-color: #6A7090;

  --mirk-mark-fg: #C9CDE0;
  --mirk-toggle-bg: #3E4660;
  --mirk-toggle-hi: #4E567A;
  --mirk-toggle-lo: #262B42;
  --mirk-sortable-dot: #353B52;
  --mirk-sortable-shadow: #0E1120;
  --mirk-sortable-label: #8A90AB;
  --mirk-sortable-placeholder: #6A7090;
}

/* Auto-dark on OS preference, unless the shell pins light with .light */
@media (prefers-color-scheme: dark) {
  .hcms-shell.pixel-quiet:not(.light):not([data-theme="light"]) {
    color-scheme: dark;
    --mirk-canvas: #0B0C13;
    --mirk-bg: #11131E;
    --mirk-fg: #ECEAF2;
    --mirk-accent: #1D1F2F;
    --mirk-focus-color: #4A506B;

    --mirk-bevel-bg: #1A1D2C;
    --mirk-bevel-fg: #ECEAF2;
    --mirk-bevel-tl: #2A2E42;
    --mirk-bevel-br: #14182A;
    --mirk-bevel-hover-bg: #202436;
    --mirk-pill-inner-top: #202436;
    --mirk-input-border: #353B52;
    --mirk-placeholder-color: #6A7090;

    --mirk-mark-fg: #C9CDE0;
    --mirk-toggle-bg: #3E4660;
    --mirk-toggle-hi: #4E567A;
    --mirk-toggle-lo: #262B42;
    --mirk-sortable-dot: #353B52;
    --mirk-sortable-shadow: #0E1120;
    --mirk-sortable-label: #8A90AB;
    --mirk-sortable-placeholder: #6A7090;
  }
}

/* ============================================================
   SHELL GEOMETRY \u2014 fixed, docked panel, single column.
   position: fixed makes the shell a containing block so the absolute
   minibar anchors to it; flex column so the body owns the scroll.
   ============================================================ */
.hcms-shell.pixel-quiet.hcms-panel {
  box-sizing: border-box;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--hcms-shell-width, 380px);
  max-width: 100vw;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  color: var(--mirk-fg);
  background: var(--mirk-bg);
  border-left: 1px solid var(--mirk-input-border);
  box-shadow: -16px 0 48px -28px rgba(43, 36, 27, 0.45);
}
.hcms-shell.pixel-quiet.hcms-panel.dark {
  box-shadow: -16px 0 48px -28px rgba(0, 0, 0, 0.6);
}

.hcms-shell.pixel-quiet.hcms-side-left {
  right: auto;
  left: 0;
  border-left: 0;
  border-right: 1px solid var(--mirk-input-border);
  box-shadow: 16px 0 48px -28px rgba(43, 36, 27, 0.45);
}

/* Push the page over so docked content is never hidden underneath, and publish
   the geometry the floating toggle has to compose with. --hcms-toggle-shift is
   the distance the toggle moves left, which is the shell width only while the
   shell is docked on the right; docked left, as an overlay, or full-viewport it
   is zero. */
body.hcms-open { --hcms-shell-width: 380px; }
body.hcms-open:not(.hcms-overlay) { padding-right: var(--hcms-shell-width); }
body.hcms-open:not(.hcms-overlay):not(.hcms-side-left) { --hcms-toggle-shift: var(--hcms-shell-width); }
body.hcms-open.hcms-side-left:not(.hcms-overlay) { padding-right: 0; padding-left: var(--hcms-shell-width); }
body.hcms-open.hcms-overlay { overflow: hidden; --hcms-toggle-display: none; }

@media (max-width: 799px) {
  body.hcms-open { --hcms-shell-width: 100vw; }
  body.hcms-open:not(.hcms-overlay):not(.hcms-side-left) { --hcms-toggle-shift: 0px; }
  body.hcms-open:not(.hcms-overlay),
  body.hcms-open.hcms-side-left:not(.hcms-overlay) { padding-right: 0; padding-left: 0; }
  body.hcms-open { overflow: hidden; }
}

/* ---------- SCROLL REGION \u2014 holds the (scrollable) header + form + save ---------- */
.hcms-shell-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ---------- CONDENSED MINIBAR \u2014 appears once the full header scrolls away ---------- */
.hcms-shell-minibar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 24px 10px;
  background: var(--mirk-bg);
  border-bottom: 1px solid var(--mirk-input-border);
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
  transition: opacity 140ms ease, transform 160ms ease;
}
.hcms-shell.is-condensed .hcms-shell-minibar {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.hcms-shell-minibar-title {
  font-size: 14px;
  line-height: 1;
  color: var(--mirk-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- HEADER (no underline rule \u2014 whitespace separates the bands) ---------- */
.hcms-shell-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 24px 4px;
}
.hcms-shell-heading { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.hcms-shell-eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--mirk-placeholder-color);
}
.hcms-shell-title {
  margin: 0;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.2;
  color: var(--mirk-fg);
}
.hcms-shell-close.mirk-button {
  flex-shrink: 0;
  padding: 2px 9px 3px;
  line-height: 1;
}
.hcms-shell-close .mirk-button__label { font-size: 16px; }

/* ---------- FORM \u2014 generous, even vertical rhythm ---------- */
.hcms-form {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 12px 24px 28px;
}

/* one labeled scalar field */
.hcms-field { display: flex; flex-direction: column; gap: 9px; }
.hcms-field--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

/* themed field label */
.hcms-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--mirk-sortable-label);
}

/* comfortable control padding + readable size, in mirk's own mono */
.hcms-shell.pixel-quiet .mirk-input,
.hcms-shell.pixel-quiet .mirk-textarea {
  font-size: 15px;
  padding: 9px 14px 10px;
}
.hcms-shell.pixel-quiet textarea.mirk-input { min-height: 76px; resize: vertical; }

/* default scalar fields: one-row textareas that grow with their content.
   Browsers without field-sizing get a scrollHeight fallback (enhance.js). */
.hcms-shell.pixel-quiet .hcms-form textarea.mirk-textarea {
  field-sizing: content;
  resize: none;
  overflow: hidden;
  min-height: 0;
}

/* rich-text surface (@richtext): a contenteditable styled like a textarea */
.hcms-shell.pixel-quiet .hcms-richtext {
  min-height: 2.5em;
  cursor: text;
  overflow-wrap: break-word;
}
.hcms-shell.pixel-quiet .hcms-richtext a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hcms-shell.pixel-quiet .hcms-richtext:empty::before {
  content: attr(data-hcms-placeholder);
  color: var(--mirk-placeholder-color);
}
.hcms-shell.pixel-quiet .mirk-select__field {
  font-size: 15px;
  padding: 8px 40px 9px 14px;
}
.hcms-shell.pixel-quiet .mirk-radio__label,
.hcms-shell.pixel-quiet .mirk-toggle__label,
.hcms-shell.pixel-quiet .mirk-tags__input { font-size: 15px; }

/* inline radio row */
.hcms-radio-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }

/* chip-field (the @chips built-in): a borderless inline input that sizes to its
   text, so chips read like static chips but stay inline-editable. */
.hcms-shell .mirk-tags__chip { padding-right: 6px; }
.hcms-shell .hcms-chip-field {
  border: 0; background: transparent; color: inherit; font: inherit;
  outline: none; min-width: 2ch; field-sizing: content; padding: 0;
}
.hcms-shell .hcms-chips .hcms-add { margin-top: 4px; align-self: flex-start; }

/* ---------- OBJECT GROUP \u2014 a quiet framed band, not a heavy card ---------- */
.hcms-object {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hcms-object-title {
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--mirk-sortable-label);
}
.hcms-object-fields { display: flex; flex-direction: column; gap: 16px; }

/* ---------- SCALAR ARRAY \u2014 a calm list of mirk-input rows ---------- */
.hcms-array { display: flex; flex-direction: column; gap: 14px; }
.hcms-array-header { display: flex; align-items: baseline; justify-content: space-between; }
.hcms-array-title {
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--mirk-sortable-label);
}
/* The generic stacked-list layout is unlayered, so it would beat mirk's
   @layer-components rules on any slot that is also a mirk component. Exempt a
   mirk tags box so it keeps mirk's own row-wrap layout and inner padding. */
.hcms-array-items:not(.mirk-tags) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hcms-array-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hcms-array-item .mirk-input { flex: 1; min-width: 0; }

/* ---------- OBJECT ARRAY \u2014 mirk-sortable cards from the engine markup ---------- */
.hcms-array--cards .hcms-array-items { gap: 14px; }
.hcms-card.mirk-sortable__item { background: var(--mirk-bevel-bg); position: relative; }
.hcms-card .hcms-card-fields { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.hcms-card .hcms-field {
  gap: 2px;
  padding: 8px 14px 9px;
}
.hcms-card .hcms-field:not(:last-child) { border-bottom: 1px solid var(--mirk-input-border); }
.hcms-card .hcms-label { letter-spacing: 0.16em; }
/* fields inside a card read as quiet rows, not chunky boxed inputs */
.hcms-card .mirk-input,
.hcms-card .mirk-textarea {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 15px;
}
.hcms-card .mirk-input:focus-visible,
.hcms-card .mirk-textarea:focus-visible { outline: none; }
/* the remove \xD7 is pulled out to the card corner (below), so the controls row
   now only holds the sr-only move buttons \u2014 collapse it until one is focused. */
.hcms-card-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 0;
}

/* quiet \xD7 remove control, shared by scalar-array rows and object-array cards */
.hcms-remove {
  flex-shrink: 0;
  appearance: none;
  border: 0;
  background: none;
  color: var(--mirk-placeholder-color);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
}
.hcms-remove:hover { color: var(--mirk-destructive); }
.hcms-remove[hidden] { display: none; }

/* object-array card: the delete control is a square corner button pinned
   top-right, carrying the card's own 1px border + a crisp-line \xD7 icon. */
.hcms-remove--card {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 18px;
  height: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-bevel-bg);
  color: var(--mirk-placeholder-color);
}
.hcms-remove--card:hover { border-color: var(--mirk-destructive); }
.hcms-remove--card .hcms-x { width: 64%; height: 64%; display: block; }

/* "+ Add" \u2014 quiet, pinned left */
.hcms-add.mirk-button { align-self: flex-start; }

/* ---------- UPLOAD COMPONENTS (@file / @image) ----------
   Built on the kit's mirk-file / mirk-image--compact chrome. The native picker
   is visually hidden but focusable (the mirk-button label is the visible
   trigger and rings via :has(:focus-visible)); it is NOT .mirk-*__input, so the
   vendored mirk runtime never handles it. The empty/filled chrome is driven by
   the bound leaf's value attribute (src/href) in CSS \u2014 no JS state to desync. */
.hcms-upload input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* @image: show the upload button until the bound <img> carries a real src. */
.hcms-upload--image .mirk-image__thumb { display: none; }
.hcms-upload--image:has(.mirk-image__preview[src]:not([src=""])) .mirk-image__upload { display: none; }
.hcms-upload--image:has(.mirk-image__preview[src]:not([src=""])) .mirk-image__thumb { display: inline-block; }

/* @file: reveal the clear \xD7 and the filename only once the bound <a> has href. */
.hcms-upload--file .hcms-upload-clear { display: none; }
.hcms-upload--file:has(a.mirk-file__name[href]:not([href=""])) .hcms-upload-clear { display: inline-flex; }
/* A filled filename uses the bright foreground (the kit's [data-filled] look),
   driven by the bound href so there's no JS attribute to keep in sync \u2014 the
   vendored runtime that would otherwise stamp data-filled is inert here. */
.hcms-upload--file:has(a.mirk-file__name[href]:not([href=""])) a.mirk-file__name {
  color: var(--mirk-bevel-fg);
}
.hcms-upload--file a.mirk-file__name:empty {
  text-decoration: none;
  cursor: default;
}
.hcms-upload--file a.mirk-file__name:empty::after {
  content: "No file chosen";
  color: var(--mirk-placeholder-color);
}

/* ---------- UPLOADING (spec \xA79) ----------
   One attribute, [data-hcms-uploading], set on the field for as long as the host
   has the bytes, plus --hcms-upload-progress carrying the percent. No markup of
   its own: the templates keep their exact shape, so a half-finished upload cannot
   leave an orphan node behind in the form. The at-upload-time picture is painted
   on the frame as a background, never assigned to the bound <img>, because that
   img IS the field's value and a commit landing mid-upload would write a
   two-megabyte data URL straight into the live page. */
.hcms-upload[data-hcms-uploading] .mirk-image__frame {
  background-size: cover;
  background-position: center;
}
/* The empty state hides the thumb, so an upload into an empty field would have
   nowhere to show. Uploading reveals it, preview or not. */
.hcms-upload--image[data-hcms-uploading] .mirk-image__thumb { display: inline-block; }
.hcms-upload--image[data-hcms-uploading] .mirk-image__upload { display: none; }
/* No \xD7 mid-flight: clearing writes the leaf empty, which says nothing about the
   request still running and reads as a cancel that is not one. */
.hcms-upload[data-hcms-uploading] .hcms-upload-clear { display: none; }

.hcms-upload[data-hcms-uploading] .mirk-image__frame::after,
.hcms-upload--file[data-hcms-uploading] .mirk-file::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: var(--hcms-upload-progress, 0%);
  background: var(--mirk-bevel-fg);
  transition: width 120ms linear;
}
/* The @file row has no frame to hang the bar on, so it becomes the positioning
   context itself. */
.hcms-upload--file[data-hcms-uploading] .mirk-file { position: relative; }

/* clear-\xD7 (vendored-inert; data-hcms-action, never .mirk-*__remove). Bare \xD7 for
   @file, a pinned corner badge for @image \u2014 mirroring .hcms-remove / --card. */
.hcms-upload-clear {
  flex-shrink: 0;
  appearance: none;
  border: 0;
  background: none;
  color: var(--mirk-placeholder-color);
  cursor: pointer;
  line-height: 0;
  padding: 2px 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.hcms-upload-clear:hover { color: var(--mirk-destructive); }
.hcms-upload-clear .hcms-x { display: block; width: 14px; height: 14px; }

.hcms-upload-clear--badge {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-bevel-bg);
  color: var(--mirk-bevel-fg);
}
.hcms-upload-clear--badge:hover { color: var(--mirk-destructive); border-color: var(--mirk-destructive); }
.hcms-upload-clear--badge .hcms-x { width: 10px; height: 10px; }

/* ---------- UNRESOLVED-FIELDS NOTICE ---------- */
.hcms-shell-notice {
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-line;
  color: var(--mirk-mark-fg);
  background: var(--mirk-bevel-bg);
  border: 1px solid var(--mirk-input-border);
  padding: 8px 12px;
  margin: 0 24px 8px;
}
.hcms-shell-notice[hidden] { display: none; }

/* ---------- ERROR BANNER + inline errors ---------- */
.hcms-shell-error,
.hcms-error {
  font-size: 12px;
  line-height: 1.45;
  color: var(--mirk-destructive);
  background: var(--mirk-bevel-bg);
  border: 1px solid var(--mirk-destructive);
  padding: 8px 12px;
}
.hcms-shell-error { margin: 0 24px; }
.hcms-error { margin-top: 6px; }
.hcms-shell-error[hidden],
.hcms-error[hidden] { display: none; }

/* A note, not a refusal: the file WAS stored, in the page, and this says why it
   is not on the host. Same slot, so there is one place a field ever speaks. */
.hcms-error--info {
  color: var(--mirk-mark-fg);
  border-color: var(--mirk-input-border);
}

/* ---------- SAVE (sits at the end of the scrolling form, not pinned) ---------- */
.hcms-shell-footer {
  display: flex;
  justify-content: flex-end;
  padding: 4px 24px 28px;
}
.hcms-shell-footer[hidden] { display: none; }

/* ---------- sr-only move buttons: hidden, visible on keyboard focus ---------- */
.hcms-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.hcms-sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: 2px 6px;
  margin: 0 2px;
  overflow: visible;
  clip: auto;
  white-space: normal;
  background: var(--mirk-bevel-bg);
  border: 1px solid var(--mirk-input-border);
  color: var(--mirk-fg);
  font-size: 12px;
  cursor: pointer;
}
.hcms-sr-only[hidden] { display: none; }

/* ============================================================
   INLINE VIEW GEOMETRY \u2014 not a panel. A transparent full-viewport
   host whose children are the only interactive surfaces, so the page
   underneath stays fully usable while the editor is open.
   ============================================================ */
.hcms-shell.pixel-quiet.hcms-inline {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  /* The host must never intercept a click meant for the page. Each child
     re-enables pointer events for itself. */
  pointer-events: none;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--mirk-fg);
}
.hcms-inline > *,
.hcms-inline-layer > * { pointer-events: auto; }
.hcms-inline-layer { position: absolute; inset: 0; pointer-events: none; }

.hcms-inline-bar {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  max-width: min(560px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hcms-inline-notice,
.hcms-inline-error {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.4;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-bg);
  color: var(--mirk-fg);
  box-shadow: 0 12px 32px -20px rgba(43, 36, 27, 0.5);
}
.hcms-inline-notice { white-space: pre-line; }
.hcms-inline-error { border-color: var(--mirk-destructive); color: var(--mirk-destructive); }
.hcms-inline-notice[hidden],
.hcms-inline-error[hidden] { display: none; }

.hcms-inline-pop {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  width: min(340px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-bg);
  color: var(--mirk-fg);
  box-shadow: 0 16px 40px -22px rgba(43, 36, 27, 0.55);
  /* Above the handles. They are positioned with z-index: 1 while the popover
     sat at auto, so a handle painted over the very field it had just opened
     and covered the text in it. The popover is what someone is using; a handle
     is only an offer to open one. */
  z-index: 2;
}
.hcms-inline-pop[hidden] { display: none; }
.hcms-inline-pop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 14px;
}
.hcms-shell .hcms-inline-pop-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 4px;
}

.hcms-inline-item-controls {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  will-change: transform;
  display: flex;
  align-items: center;
  gap: 2px;
}
.hcms-inline-item-controls[hidden],
.hcms-inline-handle[hidden] { display: none; }
.hcms-inline-item-controls.has-open-settings { z-index: 3; }
.hcms-inline-settings { position: relative; display: flex; flex: none; }
.hcms-inline-settings[hidden],
.hcms-inline-settings-menu[hidden] { display: none; }
.hcms-inline-settings-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 120px;
  padding: 4px;
  border: 1px solid var(--mirk-input-border);
  border-radius: 5px;
  background: var(--mirk-bg);
  box-shadow: 0 8px 24px #0003;
}
.hcms-inline-settings-menu button {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: var(--mirk-destructive);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hcms-inline-settings-menu button:hover,
.hcms-inline-settings-menu button:focus-visible {
  background: var(--mirk-bevel-bg);
  outline: 1px solid var(--mirk-focus-color);
}

/* Buttons flow within the positioned item container. */
.hcms-inline-row-controls {
  display: flex;
  gap: 2px;
}
.hcms-inline-row-controls[hidden] { display: none; }

.hcms-inline-list-add[hidden] { display: none; }

.hcms-shell.hcms-inline-ghost {
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  max-width: 100%;
  min-width: 0;
  margin: 8px 0 0;
  padding: 0;
  border: 1px dashed color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, currentColor 3%, transparent);
  color: inherit;
  list-style: none;
}
.hcms-shell.hcms-inline-ghost[hidden] { display: none; }
tr.hcms-shell.hcms-inline-ghost { display: table-row; }
.hcms-inline-ghost-cell { padding: 0; text-align: center; vertical-align: middle; }

.hcms-shell .hcms-inline-handle,
.hcms-shell .hcms-inline-list-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 4px;
  line-height: 1;
}
.hcms-inline-handle .mirk-button__label,
.hcms-inline-list-button .mirk-button__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}
.hcms-inline-icon { display: block; width: 24px; height: 24px; flex: none; }
.hcms-inline-handle .hcms-inline-icon { width: 20.4px; height: 20.4px; transform: translateY(-1px); }
.hcms-inline-list-add .hcms-inline-icon { width: 16.8px; height: 16.8px; }
.hcms-shell .hcms-inline-list-add { padding-inline: 10px; }

.hcms-inline-list-button {
  flex: none;
}
.hcms-inline-list-button[hidden] { display: none; }
.hcms-shell .hcms-inline-list-button:disabled {
  opacity: 1;
  color: #626B96;
  background: var(--mirk-bevel-bg);
  border-color: var(--mirk-bevel-tl) var(--mirk-bevel-br) var(--mirk-bevel-br) var(--mirk-bevel-tl);
}
.hcms-shell .hcms-inline-list-button:disabled .mirk-button__label { translate: none; }

/* A finger is not a mouse pointer: on touch the same three controls get the
   44px target the platform guidelines ask for. */
@media (pointer: coarse) {
  .hcms-shell .hcms-inline-handle,
  .hcms-shell .hcms-inline-list-button {
    min-width: 44px;
    min-height: 44px;
  }
}

.hcms-inline-toggle { align-self: center; }
.hcms-inline-toggle[hidden] { display: none; }

/* Fields with no visible anchor can still be edited through the sidebar. */
.hcms-inline-handoff {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-bg);
  color: var(--mirk-fg);
  align-self: center;
}
.hcms-inline-handoff[hidden] { display: none; }

/* Selected fields only. Scoped to the inline host: [data-hcms-shell] is on BOTH
   hosts, so an unscoped rule hides the sidebar's whole form too. */
.hcms-inline .hcms-form [data-hcms-path] { display: none; }
.hcms-inline .hcms-form [data-hcms-path].is-hcms-inline-onpath,
.hcms-inline .hcms-form [data-hcms-path].is-hcms-inline-active { display: block; }

.hcms-inline .hcms-form .is-hcms-inline-onpath,
.hcms-inline .hcms-form {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  min-width: 0;
  min-height: 0;
  width: 100%;
}
.hcms-inline-pop .hcms-object-title,
.hcms-inline-pop .hcms-array-header,
.hcms-inline-pop .hcms-drag-handle,
.hcms-inline-pop [data-hcms-action="add"],
.hcms-inline-pop [data-hcms-action="remove"],
.hcms-inline-pop [data-hcms-action="move-up"],
.hcms-inline-pop [data-hcms-action="move-down"],
.hcms-inline-pop .hcms-card-controls { display: none; }
.hcms-inline .hcms-form .hcms-field.is-hcms-inline-active {
  display: flex;
  gap: 8px;
  padding: 0;
  margin: 0 0 16px;
  border: 0;
  min-width: min(260px, 100%);
}
.hcms-inline .hcms-form .hcms-field.is-hcms-inline-active:last-child { margin-bottom: 0; }
.hcms-shell.pixel-quiet .hcms-inline-pop .mirk-input,
.hcms-shell.pixel-quiet .hcms-inline-pop .mirk-textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: min(260px, 100%);
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--mirk-input-border);
  background: var(--mirk-input-bg);
}
.hcms-inline-pop .mirk-input:focus-visible,
.hcms-inline-pop .mirk-textarea:focus-visible {
  outline: 2px solid var(--mirk-focus-color);
  outline-offset: 2px;
}

.hcms-inline-highlight {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border: 2px solid var(--mirk-focus-color);
  border-radius: 4px;
  box-sizing: border-box;
  will-change: transform;
}
.hcms-inline-highlight[hidden] { display: none; }
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let s=n.files[0],l=document.createElement("a");if(l.className="mirk-file__name",l.dataset.filled="",l.href=URL.createObjectURL(s),l.target="_blank",l.rel="noopener",l.textContent=s.name,o.replaceWith(l),!i.querySelector(".mirk-file__remove")){let a=document.createElement("button");a.type="button",a.className="mirk-file__remove",a.setAttribute("aria-label","Remove file"),a.innerHTML=e,l.after(a)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let s=i.querySelector(".mirk-image__placeholder"),l=new FileReader;l.onload=a=>{o.src=a.target.result,o.removeAttribute("hidden"),s&&s.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},l.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),s=o?.querySelector(".mirk-file__input"),l=o?.querySelector(".mirk-file__name");if(s&&(s.value=""),l){let a=document.createElement("span");a.className="mirk-file__name",a.textContent="No file chosen",l.replaceWith(a)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),s=o?.querySelector(".mirk-image__input"),l=o?.querySelector(".mirk-image__preview");s&&(s.value=""),l&&(l.removeAttribute("src"),l.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let s=document.createElement("button");s.type="button",s.className="mirk-tags__remove",s.textContent="\xD7";let l=document.createElement("span");if(l.className="mirk-tags__chip",n){let a=document.createElement("span");a.className="mirk-tags__chip-inner",a.append(i,o,s),l.append(a)}else l.append(i,o,s);return l}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(a=>a.remove());let l=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(l).then(()=>{let a=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=a,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();Do($o);var Zt=Zr,_c={cms:Zr};typeof window<"u"&&!window.__hyperclayNoAutoExport&&(window.hyperclay=window.hyperclay||{},window.hyperclay.hypercms=Zt,window.h=window.hyperclay);var ef=Zt,tf=Qr;export{ef as cms,tf as default};
