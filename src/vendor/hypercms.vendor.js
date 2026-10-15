var Ho=Object.defineProperty;var Qt=(e,t)=>{for(var r in t)Ho(e,r,{get:t[r],enumerable:!0})};var Yr={};Qt(Yr,{cms:()=>Xt,default:()=>ac});function q(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function st(e){let t=q(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}import _c from"./hyper-morph.vendor.js";var lt=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],er=new Set(lt),an=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),be=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var ct={};Qt(ct,{EmptyListInsert:()=>Pe,MAX_RULE_DEPTH:()=>ve,MaxRuleDepthExceeded:()=>de,NoRulesTag:()=>tr,RuleTargetReadOnly:()=>$e,RulesParseError:()=>ke,ShapeMismatch:()=>qe,UnknownRulesVersion:()=>ye,WriteRefused:()=>at,WriteRejected:()=>rr});var ke=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ye=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},ve=20,de=class extends Error{constructor(t){super(`rule depth exceeded ${ve} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},qe=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},Pe=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},$e=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}},at=class extends Error{constructor(t){super(`write refused: ${t.length} write(s) broke the content-only policy`),this.name="WriteRefused",this.refusals=t}},tr=class extends Error{constructor(t){super(`no <script data-rules-name~="${t}"> rules tag in this document`),this.name="NoRulesTag",this.token=t}},rr=class extends Error{constructor(t,r){super(`write rejected: ${t.length} unknown key(s), ${r.length} rule(s) with no matching element`),this.name="WriteRejected",this.unknownKeys=t,this.unmatched=r}};function ne(e,t,r,n={}){if(Object.prototype.hasOwnProperty.call(n,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");return nr(e,t,r,{depth:0,path:[]},n)}function nr(e,t,r,n,i){if(n.depth>ve)throw new de(n.path);if(typeof r=="string")return Xo(e,t,r,n,i);if(Array.isArray(r)){let[o,s]=r,l=e.find(t,o,i);return dn(i,n,l),l.map((a,u)=>nr(e,a,s,{depth:n.depth+1,path:[...n.path,u]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[s,l]of Object.entries(r))o[s]=nr(e,t,l,{depth:n.depth+1,path:[...n.path,s]},i);return o}return null}function Xo(e,t,r,n,i){if(r.endsWith("[]")){let l=r.slice(0,-2),a=e.find(t,l,i);return dn(i,n,a),a.map(u=>e.text(u))}if(r.startsWith("@"))return cn(e,t,r.slice(1));let o=q(r);if(o!==-1){let l=r.slice(0,o),a=r.slice(o+1),u=l?e.find(t,l,i):[t];return u.length===0?null:cn(e,u[0],a)}if(r===".")return e.text(t);let s=e.find(t,r,i);return s.length===0?null:e.text(s[0])}function dn(e,t,r){if(typeof e.onRowsRead=="function")try{e.onRowsRead(t.path.slice(),r)}catch(n){console.warn(`[hyper-html-api] onRowsRead threw at "${t.path.join(".")||"(root)"}"`,n)}}function cn(e,t,r){if(er.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}var dt=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),Jo=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),un=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui","live"]);function ze(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function ir(e,t){if(ze(e,t))return!0;for(let[r,n]of Object.entries(Jo))if(n.includes(t)&&ze(e,r))return!0;return!1}function Be(e){let t=dt[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function Zo(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=dt[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>ir(r,i))||n.bundles.some(i=>ze(r,i)))return r;r=r.parentElement}return null}function mn(e,t){return!!Zo(e,t)}var Qo=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function es(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();"value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function hn(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function pn(e,t,r,n,i,o){return(o?mn(e,t):hn(e,r,i,!1))||!!(n&&(o&&e!==i?e.matches(n):hn(e,n,i,o)))}function ts(e,t){let r=dt[t];return r.tokens.some(n=>ir(e,n))||r.bundles.some(n=>ze(e,n))}var rs=new Set(["INPUT","TEXTAREA","SELECT","OPTION"]);function fn(e,t,r,n){if(e.nodeType===1&&n(e)){r.dropped.push(t);return}r.cloneToLive.set(t,e),r.liveToClone.set(e,t);let i=e,o=t;if(e.nodeType===1){if(rs.has(e.tagName)&&r.controls.push(e,t),e.tagName==="TEMPLATE"){for(;t.firstChild;)t.removeChild(t.firstChild);i=e.content,o=t.content,r.cloneToLive.set(o,i),r.liveToClone.set(i,o)}}else if(e.nodeType!==11)return;let s=o.firstChild;for(let l=i.firstChild;l&&s;l=l.nextSibling)fn(l,s,r,n),s=s.nextSibling}function Ue(e,{capability:t="data",exclude:r=null,inherit:n=!0,provenance:i=null}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let o=e.nodeType===9?e:e.ownerDocument;if(!o?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let s=o.implementation.createHTMLDocument(""),l=i||new WeakMap,a=new WeakMap,u=e.nodeType===9?e.documentElement:e;r&&s.documentElement.matches(r);let h=Be(t),g=n?c=>ts(c,t)||!!(r&&c.matches(r)):c=>pn(c,t,h,r,u,!1),d=null;if(u.nodeType!==1||!pn(u,t,h,r,u,n)){d=s.importNode(u,!0);let c={cloneToLive:l,liveToClone:a,dropped:[],controls:[]};fn(u,d,c,g);for(let m of c.dropped)m.remove();for(let m=0;m<c.controls.length;m+=2)es(c.controls[m],c.controls[m+1])}e.nodeType===9&&d&&(s.replaceChild(d,s.documentElement),a.set(e,s),l.set(s,e));let p=c=>{if(Qo.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:d,document:s,capability:t,selector:Be(t),cloneToLive:l,liveToClone:a,original(c){return l.get(c)||null},cloneOf(c){return a.get(c)||null},query(c,m=d){return p(c),Array.from(m.querySelectorAll(c),k=>l.get(k)||k)},text(c=d){return(c===d?d:a.get(c))?.textContent||""},html(c=d){return(c===d?d:a.get(c))?.innerHTML??""},clone(c=d){let m=c===d?d:a.get(c);return m?s.importNode(m,!0):null}}}function gn(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function ns(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var P={semanticExclude:!0,find(e,t,r={}){let n=ns(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(l=>!gn(l)));let o=[];r.skip&&o.push(r.skip);let s=r.templateAttr===null?null:r.templateAttr||"cms-template";if(s&&o.push("["+s+"]"),o.length){let l=o.join(", ");i=i.filter(a=>!a.closest||!a.closest(l))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},insertBefore(e,t){e.parentNode.insertBefore(t,e)},insertAfter(e,t){e.parentNode.insertBefore(t,e.nextSibling)},identity(e){return e||null},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}};function Q(e,t={}){if(t.exclude===null)return P;let r=[Be("data"),t.exclude].filter(Boolean).join(", "),n=e.nodeType===9?e:e.ownerDocument||e,i=e.nodeType===9?e.documentElement:e;if(!t._write&&!i?.matches?.(r)&&!i?.querySelector?.(r)&&!n?.querySelector?.(r))return P;let o=e.nodeType===9||!e.isConnected?e:e.ownerDocument,s=e.nodeType===9?e:e.ownerDocument,l=null,a=()=>l||(l=Ue(o,{capability:"data",exclude:t.exclude||null})),u=c=>{let m=a();return c===e?m.cloneOf(e):m.cloneOf(c)||c},h=c=>l?.original(c)||c,g=(c,m)=>{a().liveToClone.set(c,m),a().cloneToLive.set(m,c);let k=c.childNodes||[],f=m.childNodes||[];for(let b=0;b<Math.min(k.length,f.length);b++)g(k[b],f[b])},d=(c,m,k,f)=>{let b=Array.from(c.childNodes).filter(R=>l.cloneOf(R)),E=b[0];for(;E&&b.includes(E);)E=E.nextSibling;for(let R of b)R.remove();if(k==="innerHTML"){let R=s.createElement("template");R.innerHTML=f;for(let H of Array.from(R.content.childNodes))c.insertBefore(H,E||null)}else c.insertBefore(s.createTextNode(f),E||null);let w=Ue(c,{capability:"data",exclude:t.exclude||null});m.replaceChildren(...Array.from(w.root?.childNodes||[]));let T=R=>{let H=w.original(R);H&&(l.liveToClone.set(H,R),l.cloneToLive.set(R,H));for(let B of Array.from(R.childNodes||[]))T(B)};for(let R of Array.from(m.childNodes))T(R)},p={...P,find(c,m,k={}){let f=u(c);if(!f?.querySelectorAll)return[];let b=a().query(m,f);k.includeRulesTag||(b=b.filter(w=>!gn(w)));let v=[];k.skip&&v.push(k.skip);let E=k.templateAttr===null?null:k.templateAttr||"cms-template";if(E&&v.push(`[${E}]`),v.length){let w=v.join(", ");b=b.filter(T=>!T.closest?.(w))}return b},parent(c){let m=u(c)?.parentElement;return m?h(m):null},children(c){return Array.from(u(c)?.children||[],h)},text(c,m){if(m===void 0){let b=h(c);return!b?.matches?.(r)&&!b?.querySelector?.(r)?P.text(b):(u(c)?.textContent||"").trim()}let k=h(c);if(!k?.matches?.(r)&&!k?.querySelector?.(r)&&!l){P.text(k,m);return}let f=a().cloneOf(k);f?d(k,f,"textContent",m):P.text(k,m)},attr(c,m,k){let f=h(c);if(k===void 0)return P.attr(f,m);P.attr(f,m,k);let b=l?.cloneOf(f);b&&(P.attr(b,m,k),Ue(f,{capability:"data",exclude:t.exclude||null}).root===null&&(b.remove(),l.liveToClone.delete(f),l.cloneToLive.delete(b)))},removeAttr(c,m){let k=h(c);P.removeAttr(k,m);let f=l?.cloneOf(k);f&&P.removeAttr(f,m)},prop(c,m,k){let f=h(c);if(k===void 0)return m==="innerHTML"||m==="outerHTML"||m==="textContent"||m==="innerText"?P.prop(u(f),m):P.prop(f,m);let b=m==="innerHTML"||m==="textContent"||m==="innerText",v=b?a().cloneOf(f):l?.cloneOf(f);v&&b?d(f,v,m,k):(P.prop(f,m,k),v&&P.prop(v,m,k))},clone(c){let m=u(c);return m===c?P.clone(c):s.importNode(m,!0)},insertAt(c,m,k){let f=h(c),v=p.children(f)[k]||(()=>{for(let T=f.children.length-1;T>=0;T--){let R=f.children[T];if(a().cloneOf(R))return R.nextElementSibling}return f.firstElementChild})(),E=h(m);f.insertBefore(E,v||null);let w=a().cloneOf(f);if(w){let T=a().cloneOf(E);T||(T=s.importNode(E,!0),g(E,T));let R=Array.from(w.children);w.insertBefore(T,R[k]||null)}},insertBefore(c,m){let k=h(c),f=h(m);k.parentNode.insertBefore(f,k);let b=a().cloneOf(k.parentNode);if(b){let v=a().cloneOf(f);v||(v=s.importNode(f,!0),g(f,v));let E=a().cloneOf(k);E?E.before(v):b.appendChild(v)}},insertAfter(c,m){let k=h(c),f=h(m);k.parentNode.insertBefore(f,k.nextSibling);let b=a().cloneOf(k.parentNode);if(b){let v=a().cloneOf(f);v||(v=s.importNode(f,!0),g(f,v));let E=a().cloneOf(k);E?E.after(v):b.appendChild(v)}},identity(c){return h(c)||null},remove(c){let m=h(c),k=a().cloneOf(m);P.remove(m),k&&P.remove(k)},replaceWith(c,m){let k=h(c),f=a().cloneOf(k),b=P.replaceWith(k,m);if(f){let v=Ue(b,{capability:"data",exclude:t.exclude||null});if(!v.root)f.remove();else{f.replaceWith(v.root);let E=w=>{let T=v.original(w);T&&(l.liveToClone.set(T,w),l.cloneToLive.set(w,T));for(let R of Array.from(w.childNodes||[]))E(R)};E(v.root)}}return b}};return p}var xe=P;function or(e){try{return JSON.parse(e)}catch(t){throw new ke(`Invalid strict JSON: ${t.message}`,t)}}function we(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],s=0;for(;s<i.length;){let l=i[s];if(/\s/.test(l)){s++;continue}if("{}".includes(l)){o.push({type:l,value:l}),s++;continue}if(l==="["){let g=!1,d=s+1;for(;d<i.length&&/\s/.test(i[d]);)d++;if(d<i.length&&/[a-zA-Z_]/.test(i[d])&&(g=!0),!g){o.push({type:l,value:l}),s++;continue}}if(l==="]"){o.push({type:l,value:l}),s++;continue}if(l===":"){o.push({type:t.COLON,value:l}),s++;continue}if(l===","){o.push({type:t.COMMA,value:l}),s++;continue}if(l==='"'||l==="'"){let g=l,d=s+1;for(;d<i.length&&i[d]!==g;)i[d]==="\\"&&d++,d++;o.push({type:t.STRING,value:i.substring(s+1,d),quoted:!0,sourceQuote:g}),s=d+1;continue}let a=s,u;for(;a<i.length&&!/[{},]/.test(i[a]);)if(i[a]===":"){let g=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],d=!1;for(let p of g){let c=p.substring(1);if(i.substring(a+1,a+1+c.length)===c){d=!0,a+=c.length;break}}if(!d)break}else if(i[a]==="["){for(a++;a<i.length&&i[a]!=="]";){if(i[a]==='"'||i[a]==="'"){let g=i[a];for(a++;a<i.length&&i[a]!==g;)i[a]==="\\"&&a++,a++}a++}a<i.length&&i[a]==="]"&&a++}else a++;u=i.substring(s,a);let h=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(u)?h=t.NUMBER:u==="true"||u==="false"||u==="null"?h=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(u)&&(h=t.SELECTOR),o.push({type:h,value:u,quoted:!1}),s=a}return o}function n(i){let o="";for(let s=0;s<i.length;s++){let l=i[s];if("{}".includes(l.type)||"[]".includes(l.type)){o+=l.value;continue}if(l.type===t.COLON){o+=l.value;continue}if(l.type===t.COMMA){let a=i[s+1];if(a&&(a.type==="}"||a.type==="]"))continue;o+=l.value;continue}if(l.type===t.STRING&&l.quoted){let a=l.value;l.sourceQuote==="'"&&(a=a.replace(/\\'/g,"'"),a=a.replace(/(\\*)"/g,(u,h)=>h.length%2===0?h+'\\"':u)),o+=`"${a}"`;continue}if(l.type===t.NUMBER||l.type===t.BOOLEAN){o+=l.value;continue}if(l.type===t.SELECTOR||l.type===t.IDENTIFIER){o+=`"${l.value}"`;continue}o+=`"${l.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new ke("Invalid extraction rules syntax: "+i.message,i)}}var kn="1",bn=/^[a-zA-Z0-9_-]+$/;function He(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!bn.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${bn})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],s=e.attr(o,"data-rules-version");if(s!==kn)throw new ye(s);return{rules:we(e.text(o)),tagNode:o}}var id=new Function("url","return import(url)");function _n(e,t,r,n){let i=e.length,o=t.length,s=new Array(i).fill(-1);if(n){let f=new Set;for(let b=0;b<i;b++){let v=n[b];!(v>=0&&v<o)||f.has(v)||(s[b]=v,f.add(v))}}if(i===0||o===0)return s;let l=e.map(f=>wn(f,r)),a=t.map(f=>wn(f,r)),u=new Array(o).fill(!1);for(let f of s)f>=0&&(u[f]=!0);let h=new Map;a.forEach((f,b)=>{u[b]||h.set(f,h.has(f)?-1:b)});let g=new Map;l.forEach((f,b)=>{s[b]>=0||g.set(f,(g.get(f)||0)+1)}),l.forEach((f,b)=>{if(s[b]>=0||g.get(f)!==1)return;let v=h.get(f);v===void 0||v===-1||u[v]||(s[b]=v,u[v]=!0)});let d=[];for(let f=0;f<i;f++)s[f]<0&&d.push(f);let p=[];for(let f=0;f<o;f++)u[f]||p.push(f);if(d.length===0||p.length===0)return s;let c=i*o+1,m=os(e,t,r),k=(f,b)=>m(f,b)*c+Math.abs(f-b);for(let[f,b]of ss(d,p,k))s[f]=b;return s}var En=e=>typeof e=="object"&&e!==null;function wn(e,t){if(!En(t))return e==null?" null":String(e);let r=Object.keys(t);return JSON.stringify(r.map(n=>{let i=JSON.stringify(e?.[n]);return i===void 0?" undef":i}))}function os(e,t,r){if(!En(r))return(l,a)=>e[l]===t[a]?0:1;let n=Object.keys(r),i=l=>n.map(a=>JSON.stringify(l?.[a])),o=e.map(i),s=t.map(i);return(l,a)=>{let u=o[l],h=s[a],g=0;for(let d=0;d<n.length;d++)u[d]!==h[d]&&g++;return g}}function ss(e,t,r){return e.length<=t.length?An(e,t,r,!1):An(t,e,(n,i)=>r(i,n),!0)}function An(e,t,r,n){let i=e.length,o=t.length,s=[];for(let g=0;g<=i;g++)s.push(new Float64Array(o+1).fill(1/0));let l=[];for(let g=0;g<=i;g++)l.push(new Uint8Array(o+1));for(let g=0;g<=o;g++)s[i][g]=0;for(let g=i-1;g>=0;g--)for(let d=o-1;d>=0;d--){let p=r(e[g],t[d])+s[g+1][d+1],c=s[g][d+1];p<=c?(s[g][d]=p,l[g][d]=1):s[g][d]=c}let a=[],u=0,h=0;for(;u<i&&h<o;)l[u][h]&&(a.push(n?[t[h],e[u]]:[e[u],t[h]]),u++),h++;return a}function lr(e,t,r,n,i,o,s,l={}){let a=e.find(t,r,l);if(i.length===0){a.forEach(w=>e.remove(w)),sr(l,"onRowsApplied",o.path,[]);return}let u=i.length>a.length,h=a[0]||null;if(u&&!h&&(h=ds(e,t,r,l),!h))throw new Pe(o.path);let g=a.map(w=>cs(e,w,n,l)),d=null;if(u&&h){d=e.clone(h),l.templateAttr&&e.removeAttr(d,l.templateAttr);let w=e.stripIds(d);w>0&&console.warn(`[hyper-html-api] stripped ${w} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let p=_n(i,g,n,ls(e,a,i,o,l)),c=a[0]||h,m=e.parent(c),k=a.length>0?Sn(e,m,c):0,f=ms(e,a),b=new Set,v=[],E=i.map((w,T)=>{let R=p[T];if(R>=0)return b.add(R),v.push(!1),a[R];v.push(!0);let H=e.clone(d);return e.stripIds(H),H});a.forEach((w,T)=>{b.has(T)||e.remove(w)}),f?us(e,m,k,E,v):hs(e,E,v,m,k),as(e,E,n,i,o,s,l),sr(l,"onRowsApplied",o.path,E)}function sr(e,t,r,n){if(typeof e[t]=="function")try{return e[t](r.slice(),n)}catch(i){console.warn(`[hyper-html-api] ${t} threw at "${r.join(".")||"(root)"}"`,i);return}}function ls(e,t,r,n,i){let o=sr(i,"identifyRows",n.path,r);if(!Array.isArray(o))return null;let s=new Array(r.length).fill(-1),l=new Set,a=new Map(t.map((u,h)=>[e.identity(u),h]));for(let u=0;u<r.length;u++){if(!o[u])continue;let h=a.get(e.identity(o[u]));h===void 0||l.has(h)||(s[u]=h,l.add(h))}return s}function as(e,t,r,n,i,o,s){t.forEach((l,a)=>{if(r===null){let u=n[a],h=u==null?"":String(u);e.text(l)!==h&&e.text(l,h)}else{let u=o(e,l,r,n[a],{depth:i.depth+1,path:[...i.path,a]},s);u&&u!==l&&(t[a]=u)}})}function cs(e,t,r,n){return r===null?e.text(t):ne(e,t,r,n.onRowsRead?{...n,onRowsRead:void 0}:n)}function Sn(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function ds(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let s of o)if(e.attr(s,n.templateAttr)!=null)return s;i=e.parent(i)}return null}function us(e,t,r,n,i){let o=e.children(t),s=o.map(a=>e.identity(a)),l=!1;n.forEach((a,u)=>{let h=e.identity(a),g=r+u;if(s[g]===h)return;if(!i[u]){let p=s.indexOf(h);p!==-1&&(s.splice(p,1),o.splice(p,1))}let d=Math.min(g,o.length);d<o.length?e.insertBefore(o[d],a):o.length?l?e.insertAfter(o[o.length-1],a):(e.insertAt(t,a,g),l=!0):e.insertAt(t,a,0),s.splice(d,0,h),o.splice(d,0,a)})}function ms(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=new Map(e.children(r).map((o,s)=>[e.identity(o),s])),i=[];for(let o of t){let s=n.get(e.identity(o));if(s===void 0)return!1;i.push(s)}return i.sort((o,s)=>o-s),i[i.length-1]-i[0]===i.length-1}function hs(e,t,r,n,i){let o=null,s=i;for(let l=0;l<t.length;l++){if(!r[l]){o=t[l];continue}let a=o?e.parent(o):n;if(!a)continue;let u=o?Sn(e,a,o)+1:s++;e.insertAt(a,t[l],u),o=t[l]}}var Tn=new Set(["checked","selected","disabled","readOnly","paused"]);function Ae(e,t,r,n,i={}){if(Object.prototype.hasOwnProperty.call(i,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");let o=[];if(ar(r,n,[],o),o.length)throw new qe(o);ut(e,t,r,n,{depth:0,path:[]},i)}function ut(e,t,r,n,i,o={}){if(i.depth>ve)throw new de(i.path);if(n===void 0)return t;if(typeof r=="string")return ps(e,t,r,n,i,o);if(Array.isArray(r)){let[s,l]=r;return lr(e,t,s,l,n,i,ut,o),t}if(typeof r=="object"&&r!==null){for(let[s,l]of Object.entries(r)){let a=ut(e,t,l,n==null?n:n[s],{depth:i.depth+1,path:[...i.path,s]},o);a&&a!==t&&(t=a)}return t}return t}function ps(e,t,r,n,i,o){if(r.endsWith("[]")){let a=r.slice(0,-2);return lr(e,t,a,null,n,i,ut,o),t}if(r.startsWith("@"))return Rn(e,t,r.slice(1),n);let s=q(r);if(s!==-1){let a=r.slice(0,s),u=r.slice(s+1),h=a?e.find(t,a,o):[t];return h.length===0||Rn(e,h[0],u,n),t}if(r===".")return Cn(e,t,n),t;let l=e.find(t,r,o);return l.length===0||Cn(e,l[0],n),t}function Cn(e,t,r){let n=r==null?"":String(r);e.text(t)!==n&&e.text(t,n)}function Rn(e,t,r,n){if(be.has(r)){let o=e.prop(t,r);if(o===n||o!=null&&n!=null&&String(o)===String(n))return t;throw new $e(r)}if(r==="outerHTML"){let o=n==null?"":String(n);return e.replaceWith(t,o)}if(an.has(r)){let o=fs(r,n);return e.prop(t,r)!==o&&e.prop(t,r,o),t}let i=n==null?"":String(n);return e.attr(t,r)!==i&&e.attr(t,r,i),t}function fs(e,t){return t==null?Tn.has(e)?!1:"":Tn.has(e)?t==="false"?!1:!!t:t}function ar(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:We([...r,o]),expected:"scalar",got:Ve(i)})}):n.push({path:We(r),expected:"array",got:Ve(t)});return}t!==null&&typeof t=="object"&&n.push({path:We(r),expected:"scalar",got:Ve(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:We(r),expected:"array",got:Ve(t)});return}let i=e[1];t.forEach((o,s)=>ar(i,o,[...r,s],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:We(r),expected:"object",got:Ve(t)});return}for(let[i,o]of Object.entries(e))ar(o,t[i],[...r,i],n)}}}function Ve(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function We(e){return e.join(".")}var Ts=Object.freeze({refusedRuleForms:["innerHTML","outerHTML"],refusedTargets:["script","style","template","noscript","iframe","object","embed","xmp","plaintext","noembed","noframes","meta","link","base","animate","set","animatemotion","animatetransform"],refusedAttributes:["style","srcdoc","is","http-equiv","sandbox","allow","nonce","integrity","charset","htmlclaytoken","htmlclayid","data-rules-name","data-rules-version","clay","contenteditable",...un],refusedAttributePrefixes:["on"],urlAttributes:["href","src","srcset","action","formaction","poster","cite","data","ping","background","longdesc","usemap","xlink:href","manifest","codebase","icon"],refusedSchemes:["javascript","vbscript","data"]});function cr(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return He(e,n,r)}return null}var V={extract:(e,t,r={})=>ne(Q(e,r),e,t,r),apply:(e,t,r,n={})=>Ae(Q(e,{...n,_write:!0}),e,t,r,n),findRulesIn:(e,t)=>He(xe,e,t),findRules:(e,t)=>cr(xe,e,t),bind:(e,t,r={})=>{let n=cr(xe,e,t);if(!n){let i=typeof t=="string"?`data-rules-name~="${t}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${i}`)}return{...n,get:()=>ne(Q(e,r),e,n.rules,r),set:i=>Ae(Q(e,{...r,_write:!0}),e,n.rules,i,r)}},parseStrict:or,parseRelaxed:we,ruleAttrIndex:q,splitRule:st,errors:ct,DOM_PROPERTIES:lt};var ur={};Qt(ur,{fromString:()=>ee,getRuleAtPath:()=>ue,getValueAtPath:()=>Ns,setAtPath:()=>dr,toString:()=>Ls});function Ls(e){return e.map(String).join(".")}function ee(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function ue(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Ns(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function dr(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=dr(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:dr((e||{})[n],i,r)}}function Ke(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=Ke(n);return t}return""}import Ms from"./hyper-morph.vendor.js";function mt(e,t,{ignoreActiveValue:r=!0}={}){Ms.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property",policy:"raw"})}import{morph as Fn}from"./hyper-morph.vendor.js";var Ln=new WeakMap,mr=e=>e.map(String).join(".");function js(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function Nn(e,t){if(!e||!e.querySelector)return null;let r=e.querySelector(`[data-hcms-path="${js(t)}"]`),n=r&&r.querySelector(".hcms-array-items");return n?Array.from(n.children).filter(i=>i.matches&&i.matches("[data-hcms-card], [data-hcms-array-item]")):null}function Mn(e,t,r){let n=Nn(e,t);!n||n.length!==r.length||n.forEach((i,o)=>{r[o]&&Ln.set(i,r[o])})}function ht(){let e=new Map;return{hooks:{onRowsRead(t,r){e.set(mr(t),r)}},seed(t){for(let[r,n]of e)Mn(t,r,n);e.clear()}}}function jn(e){return{identifyRows(t,r){let n=Nn(e,mr(t));return!n||n.length!==r.length?null:n.map(i=>Ln.get(i)||null)},onRowsApplied(t,r){Mn(e,mr(t),r)}}}var In={skip:"[data-hcms-shell]",templateAttr:"cms-template"},hr="data-hcms-rollback-ui",Is=0;function Dn(e,t,r,n={}){return Fs(e,t,r,n)}function Fs(e,t,r,n){let{shellRoot:i,structural:o,structuralPath:s,formRoot:l}=n,a=l?{...In,...jn(l)}:In;if(!o)try{return V.apply(e,t,r,a),{ok:!0}}catch(d){return{ok:!1,error:d}}let u=Ds(e,t,s),h=u?Ps(u):null,g=u?null:zs(e,i);try{return V.apply(e,t,r,a),{ok:!0}}catch(d){return h?$s(u,h):g&&Bs(e,i,g),{ok:!1,error:d}}}function Ds(e,t,r){if(!r||!e)return null;let n=ee(r),i=[],o=t;for(let s of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&s in o){if(i.push(s),o=o[s],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:qs(e,t,i)}function qs(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let s=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let l=i[s];if(l==null)return null;if(o===r.length-1){if(Array.isArray(l)){let[a]=l;return n.querySelector?.(a)?.parentElement||null}if(typeof l=="string"&&l.endsWith("[]")){let a=l.slice(0,-2);return n.querySelector?.(a)?.parentElement||null}return null}i=l}return null}function Ps(e){let t=[],r=[];for(let n of Array.from(e.childNodes))t.push(pr(n,r));return{nodes:t,retained:r}}function $s(e,t){let r=e.cloneNode(!1);for(let n of t.nodes)r.appendChild(n);Fn(e,Array.from(r.childNodes),Pn()),qn(e,t.retained)}function zs(e,t){let r=[],n=[];for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||r.push(pr(i,n));return{nodes:r,retained:n}}function Bs(e,t,r){let n=e.cloneNode(!1);for(let i of r.nodes)n.appendChild(i);Fn(e,Array.from(n.childNodes),Pn()),qn(e,r.retained)}function pr(e,t){let r=e.cloneNode(!1);if(e.nodeType===1&&e.matches('[editor-ui],[clay~="editor-ui"]')){let o=String(++Is);r.setAttribute(hr,o),t.push({id:o,node:e})}let n=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,i=r.nodeType===1&&r.tagName==="TEMPLATE"?r.content:r;for(let o of Array.from(n.childNodes||[]))i.appendChild(pr(o,t));return r}function qn(e,t){for(let{id:r,node:n}of t){let i=e.querySelector(`[${hr}="${r}"]`);i===n?n.removeAttribute(hr):n.isConnected?i?.remove():i?.replaceWith(n)}}function Pn(){return{morphStyle:"innerHTML",policy:"raw",restoreFocus:!1,scripts:{handle:!1,merge:!1}}}function ft(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var Us='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',fr='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',Bn={"@scalar":`
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
      ${Us}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${fr}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${fr}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${fr}</button>
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
  `},Hs=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function gt(e){let t=e.head||e.documentElement;if(t)for(let r of Hs)Wn(e,t,r)}function gr(e,t){if(!Bn[t])return null;let r=e&&(e.head||e.documentElement);return r?Wn(e,r,t):null}var $n={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},pt={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},Vs=new Set([...Object.values(pt),"@chips","@chips-item"]);function Ge(e,t,r,n){if(typeof e!="string")return"@scalar";let i=q(e),o=yt(e,i,r,n),s=vt(o,t,"data-hcms-component");if(s&&pt[s]){let l=pt[s],a=Array.isArray(r)&&r.some(u=>u==="*"||typeof u=="number");return l==="@number"&&!zn(e,i,t,a,o).every(Ks)||(l==="@checkbox"||l==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!zn(e,i,t,a,o).every(Gs)?"@scalar":l}if(i>=0){let l=e.slice(i+1);if($n[l])return $n[l]}return"@scalar"}function Un(e,t,r,n){if(typeof e!="string")return null;let i=q(e),o=vt(yt(e,i,r,n),t,"data-hcms-component");return o&&pt[o]||null}var Ws=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Ks(e){return e==null||e===""?!0:Ws.test(String(e))}function Gs(e){return e==null||e===""||e==="true"||e==="false"}function zn(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let s=t>=0?e.slice(t+1):null,l=[];for(let a of o)if(!(a.closest&&a.closest("[cms-template], [data-hcms-shell]"))&&(s?s==="value"&&"value"in a?l.push(a.value):l.push(a.getAttribute?a.getAttribute(s):null):l.push((a.textContent||"").trim()),!n))break;return l}function bt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function _e(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&J(r,n)||i&&i!==n&&J(r,i)||J(r,t)}function kt(e,t,r){let n=bt(e,r);if(!n)return null;let i=_e(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function Hn(e,t,r,n){if(typeof e!="string")return null;let i=q(e),o=vt(yt(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let s=o.trim().split(/\s+/).filter(Boolean);return s.length?s:null}function Vn(e,t,r,n){if(typeof e!="string")return null;let i=q(e);return vt(yt(e,i,r,n),t,"data-hcms-crop")}function Ys(e,t){return t>=0?e.slice(0,t):e}function yt(e,t,r,n){let i=Ys(e,t);return i&&i!=="."?i:Xs(n,r)}function Xs(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function vt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function xt(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=me(n);if(o==="scalar"){let s=Ge(n,e,i,t);Vs.has(s)&&gr(e,s);return}if(o==="scalar-array"){let s=bt(n,e);s&&(gr(e,s.array),gr(e,s.item));return}if(o==="object"){for(let[s,l]of Object.entries(n))r(l,[...i,s]);return}if(o==="object-array"){let s=n[1],l=[...i,"*"];if(s&&typeof s=="object"&&!Array.isArray(s))for(let[a,u]of Object.entries(s))r(u,[...l,a]);else r(s,l)}}}function Wn(e,t,r){let n=J(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=Bn[r].trim(),t.appendChild(i),i}function J(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${Js(t)}"]`)}function Js(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function me(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Ye(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var Kn={IMG:"src",A:"href"};function wt(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":Kn[t]?Kn[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function Gn(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=wt(e),s=`${Xn(r,n)}[data-hcms-field="${Ee(t)}"]`;return r==="INPUT"&&n==="radio"?`${s}:checked@value`:i?`${s}@${i}`:s}function Zs(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=wt(e),o=`${Xn(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function Xn(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Ee(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Yn=new Set(["__proto__","constructor","prototype"]);function At(e,t){return r(e,[]);function r(u,h){let g=me(u);if(g==="scalar")return n(u,h);if(g==="scalar-array")return i(u,h);if(g==="object-array")return o(u,h);if(g==="object"){let d=Object.create(null);for(let[p,c]of Object.entries(u)){if(Yn.has(p))throw new Error(`hypercms: rule key "${p}" is forbidden at "${h.join(".")||"<root>"}"`);d[p]=r(c,[...h,p])}return d}return null}function n(u,h){let g=h.length?h[h.length-1]:null,d=typeof g=="string"?g:"__value",p=a(h,d);if(p)return Gn(p,d);let c=l(Ge(u,t,h,e),d);return c?Gn(c,d):`input[data-hcms-field="${Ee(d)}"]@value`}function i(u,h){let g=kt(u,h,t),d=g&&l(g.item,null)||l("@scalar-array-item",null),p=d?Zs(d):"input[data-hcms-field]@value";return[s(h,"[data-hcms-array-item]"),p]}function o(u,h){let[,g]=u,d=[...h,"*"],p=s(h,"[data-hcms-card]");if(g&&typeof g=="object"&&!Array.isArray(g)){let c=Object.create(null);for(let[m,k]of Object.entries(g)){if(Yn.has(m))throw new Error(`hypercms: rule key "${m}" is forbidden at "${d.join(".")}"`);c[m]=r(k,[...d,m])}return[p,c]}return[p,r(g,[...d,0])]}function s(u,h){let g=u.length?u[u.length-1]:"",d=u.some(m=>m==="*"),p=u.join(".");return`${d?`[data-hcms-field="${Ee(g)}"]`:`[data-hcms-path="${Ee(p)}"]`} > .hcms-array-items > ${h}`}function l(u,h){if(!t)return null;let g=J(t,u);if(!g)return null;let d=g.content||g;if(h){let p=d.querySelector(`[data-hcms-field="${Ee(h)}"]`);if(p)return p}return d.querySelector("[data-hcms-field]")}function a(u,h){if(!t)return null;let g=u.map(c=>typeof c=="number"?"*":c).join("."),p=[u.join("."),g];for(let c=u.length-1;c>=0;c--){let m=u.slice(0,c).map(k=>typeof k=="number"?"*":k);m.push("*"),p.push(m.join("."))}for(let c of p){if(!c)continue;let m=J(t,c);if(!m||!Ye(m))continue;let k=m.content||m,f=k.querySelector(`[data-hcms-field="${Ee(h)}"]`)||k.querySelector("[data-hcms-field]");if(f)return f}return null}}function br(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function Se({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=kr(e,[],r,n,e);return o&&i.appendChild(o),i}function Zn({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:s}){if(e==="object-array-item")return ei(t,r,n,i,s);if(e==="scalar-array-item")return ti(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function kr(e,t,r,n,i){let o=me(e);return o==="scalar"?Qs(e,t,r,n,i):o==="object"?nl(e,t,r,n,i):o==="object-array"?il(e,t,r,n,i):o==="scalar-array"?ol(e,t,r,n):null}function Qs(e,t,r,n,i){let o=Ge(e,n,t,i),s=_e(t,o,n);if(!s)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let l=Un(e,n,t,i);l==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(l==="@checkbox"||l==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${l}" but its value isn't true/false; rendering a text input so the value is preserved`),Qn(s,l===o?l:null,t);let a=Te(s,n);Ce(a,t);let u=s.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&u===o&&el(a,e,t,r,n,o,i),o==="@image"&&u==="@image"){let h=Vn(e,n,t,i);h!=null&&!a.hasAttribute("data-hcms-crop")&&a.setAttribute("data-hcms-crop",h)}return sl(a,te(t)),_t(a,te(t)),Et(a,te(t)),si(a,r),o==="@file"&&rl(a),a}function Qn(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function el(e,t,r,n,i,o,s){let l=Hn(t,i,r,s),a=l?[...l]:[],u=n==null?"":String(n);if(u!==""&&!a.includes(u)&&a.unshift(u),!l&&(tl(e,"data-hcms-options required (space-separated values)"),a.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let d=e.querySelector("select[data-hcms-field]");if(!d)return;for(let p of a){let c=i.createElement("option");c.value=p,c.textContent=ft(p),d.appendChild(c)}return}let h=e.querySelector(".mirk-radio");if(!h||!h.parentNode)return;let g=yr(r.join("."));for(let d of a){let p=h.cloneNode(!0),c=p.querySelector('input[type="radio"]');c&&(c.value=d,c.name=g);let m=p.querySelector(".mirk-radio__label");m&&(m.textContent=ft(d)),h.parentNode.insertBefore(p,h)}h.remove()}function yr(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function tl(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function rl(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=br(t.getAttribute("href")))}function nl(e,t,r,n,i){let o=_e(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let s=Te(o,n);if(Ce(s,t),_t(s,te(t)),Et(s,te(t)),Ye(o))return ai(s,e,t),li(s,e,r),s;let l=St(s,".hcms-object-fields",o,t);for(let[a,u]of Object.entries(e)){let h=r==null?null:r[a],g=kr(u,[...t,a],h,n,i);g&&l.appendChild(g)}return s}function il(e,t,r,n,i){let o=_e(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let s=Te(o,n);Ce(s,t),_t(s,te(t)),Et(s,te(t)),ni(s,o),oi(s,o,t);let l=St(s,".hcms-array-items",o,t),[,a]=e;return(Array.isArray(r)?r:[]).forEach((h,g)=>{let d=ei(a,[...t,g],h,n,i);d&&l.appendChild(d)}),ii(s),s}function ei(e,t,r,n,i){let o=ri(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let s=Te(o,n);if(s.setAttribute("data-hcms-card",""),s.classList.contains("hcms-card")||s.classList.add("hcms-card"),Ce(s,t),Ye(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(ai(s,e,t),li(s,e,r)),s;let l=St(s,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[a,u]of Object.entries(e)){let h=r==null?null:r[a],g=kr(u,[...t,a],h,n,i);g&&l.appendChild(g)}return s}function ol(e,t,r,n){let i=bt(e,n),o=kt(e,t,n),s=i?i.array:"@scalar-array",l=_e(t,s,n);if(!l)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);Qn(l,i?i.array:null,t);let a=Te(l,n);Ce(a,t),_t(a,te(t)),Et(a,te(t)),ni(a,l),oi(a,l,t),o&&a.setAttribute("data-hcms-item-tpl",o.item);let u=St(a,".hcms-array-items",l,t);return(Array.isArray(r)?r:[]).forEach((g,d)=>{let p=ti([...t,d],g,n,o?o.item:null);p&&u.appendChild(p)}),ii(a),a}function ti(e,t,r,n){let i=ri(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Te(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Ce(o,e),si(o,t),o}function ri(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return J(r,i)||n&&J(r,n)||J(r,"@"+t)}function Te(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Ce(e,t){e.setAttribute("data-hcms-path",t.join("."))}function sl(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function _t(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function Et(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=ft(String(t)))})}function ni(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function ii(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Jn(e,"data-hcms-max-items"),o=Jn(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),l=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),u=e.querySelector('[data-hcms-action="add"]');u&&(u.hidden=s||i!=null&&n>=i),r.forEach((h,g)=>{let d=h.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=l||o!=null&&n<=o);let p=h.querySelector('[data-hcms-action="move-up"]');p&&(p.hidden=a||g===0);let c=h.querySelector('[data-hcms-action="move-down"]');c&&(c.hidden=a||g===n-1)})}function Jn(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function oi(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function te(e){return e.length?e[e.length-1]:null}function si(e,t){let r=ll(e);if(r.length!==0)for(let n of r)ci(n,t)}function ll(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&al(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function al(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function li(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let s=r==null?null:r[o];ci(i,s)})}function ai(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let s=[...r,o].join(".");i.setAttribute("data-hcms-path",s)})}function St(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function ci(e,t){let r=wt(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var cl={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,onSnapshot:(e,t)=>e?.onSnapshot??t?.onSnapshot,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,upload:(e,t)=>e?.upload??(t?.uploadFileBasic?ul(t.uploadFileBasic):null)},dl={402:"payment-required",413:"too-large",415:"unsupported-type",401:"unauthorized",403:"forbidden",404:"not-found"},vr=()=>({ok:!1,msg:"Upload cancelled",msgType:"skipped",code:"aborted",uploads:[]});function ul(e){return async function(r,{onProgress:n,signal:i}={}){if(i?.aborted)return vr();try{let o=await e(r,{onProgress:l=>{n?.({loaded:null,total:null,percent:l})}});if(i?.aborted)return vr();let s=o&&o.uploads||[];return typeof s[0]?.url!="string"?{ok:!1,msg:"The host accepted the file but did not say where it put it",msgType:"error",code:"bad-response",uploads:[]}:{ok:!0,msg:o.msg||"Uploaded",msgType:o.msgType||"success",code:o.code||null,uploads:s}}catch(o){if(i?.aborted)return vr();let s={};try{s=JSON.parse(o?.response||"{}")}catch{s={}}let l=s.code||dl[o?.status]||"error";return{ok:!1,msg:o&&o.message||"Upload failed",msgType:"error",code:l,uploads:[]}}}}function $(e,t){let r=cl[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var di=["clay:mutation-ready","hyperclay:mutation-ready"],ui=["clay:sync-applied","hyperclay:livesync-applied"],mi=["clay:ready","hyperclay:ready"];function Re(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}var Z="data-hcms-bound",ie="data-hcms-bound-id",xr=new Map;function hi(e,t){xr.set(e,t)}function pi(e){xr.delete(e)}function fi(e){let t=e.getAttribute(ie);if(!t)return null;let r=xr.get(t);return!r||!r.restorable()?null:r.originalHTML}var he="data-hcms-owns-richclay";function Oe(e){return e&&e.richclay&&e.richclay.RichClay||$("RichClay",e)||(e&&typeof e.RichClay=="function"?e.RichClay:null)}function gi(e,t,r){!e||typeof e.setAttribute!="function"||(e.setAttribute(Z,t?"rich":"plain"),r&&e.setAttribute(he,"true"))}function bi(e,t){if(!e||typeof e.querySelectorAll!="function")return;let r=e.querySelectorAll(`[${Z}]`);if(!r.length)return;let n=Oe(t);if(n&&typeof n.stripFromClone=="function")try{n.stripFromClone(e)}catch(i){console.warn("[hypercms] richclay strip failed; editor state may reach the save",i)}for(let i of r)i.getAttribute(he)==="true"&&i.removeAttribute("data-richclay"),i.removeAttribute(he),i.removeAttribute(Z)}function ki(e,t){if(!e||typeof e.removeAttribute!="function")return;let r=Oe(t);if(r&&typeof r.stripElement=="function")try{r.stripElement(e)}catch(n){console.warn("[hypercms] richclay element strip failed; the clone stays editable",n)}else e.removeAttribute("contenteditable"),e.removeAttribute("no-undo");e.getAttribute(he)==="true"&&e.removeAttribute("data-richclay"),e.removeAttribute(he),e.removeAttribute(Z),e.removeAttribute(ie)}function yi(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||q(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,s]of Object.entries(n))i[o]=r(s);return i}return n}}function vi(e,t){if(!t||e==null)return e;return r(e,[t]);function r(n,i){if(typeof n=="string")return n.endsWith("[]")||q(n)!==-1?n:i.some(o=>ml(o,n))?n+"@innerHTML":n;if(Array.isArray(n)){let[o,s]=n;if(typeof o!="string"||!o)return n;let l=hl(t,o);return l.length?[o,r(s,l)]:n}if(n&&typeof n=="object"){let o=Object.create(null);for(let[s,l]of Object.entries(n))o[s]=r(l,i);return o}return n}}function ml(e,t){let r=null;try{r=e.querySelector(t)}catch{return!1}return r?r.hasAttribute(Z)?r.getAttribute(Z)==="rich":r.children.length>0:!1}function hl(e,t){try{return[...e.querySelectorAll(t)]}catch{return[]}}function Le(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function oe(e,t,r=!0){if(!e||!e.querySelectorAll||(e.querySelectorAll("textarea[data-hcms-field]").forEach(Le),r===!1))return;let n=t&&t.defaultView||(typeof window<"u"?window:null),i=Oe(n);i&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(o=>{if(o.__hcmsRichclay)return;let s;try{s=new i(o,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(a){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",a);return}o.__hcmsRichclay=s;let l=s&&s.squire;l&&typeof l.addEventListener=="function"&&l.addEventListener("input",()=>{let a=n&&n.Event||Event;o.dispatchEvent(new a("input",{bubbles:!0}))})})}var wr=new WeakSet;function pe(e,t){let r=$("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function re(e){let t=$("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Rt(e){let{formRoot:t}=e;if(!t||wr.has(t))return;wr.add(t);let r=s=>{let l=s.target;!l||!l.closest||l.closest("[data-hcms-form-root]")&&l.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(l.tagName==="TEXTAREA"&&Le(l),!l.matches('input[type="file"]')&&(!l.closest("[data-hcms-field]")&&!l.hasAttribute?.("data-hcms-field")||xi(l,e)))},n=s=>{let l=s.target;if(!(!l||!l.closest)&&l.closest("[data-hcms-form-root]")){if(l.matches('input[type="file"][data-hcms-upload]')){xl(l,e);return}l.matches('input[type="checkbox"], input[type="radio"], select')&&xi(l,e)}},i=s=>{let l=s.target;if(!l||!l.closest)return;let a=l.closest("[data-hcms-action]");if(!a)return;let u=a.getAttribute("data-hcms-action");if(u==="add"||u==="remove"||u==="move-up"||u==="move-down"||u==="clear-upload"){if(!a.closest("[data-hcms-form-root]"))return}else if(u==="close"&&!a.closest("[data-hcms-shell]"))return;if(u==="add"){let h=a.closest("[data-hcms-path]");if(!h)return;let g=h.getAttribute("data-hcms-path");Xe(g,e)}else if(u==="remove"){let h=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!h)return;Er(h,e)}else if(u==="move-up"||u==="move-down"){let h=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!h)return;_r(h,u==="move-up"?-1:1,e)}else u==="clear-upload"?El(a,e):u==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),wr.delete(t)}}var pl=new Set(["value","checked"]);function fl(e,t){if(!t)return null;let r=ee(t);if(r.some(a=>typeof a=="number"||a==="*"))return null;let n=ue(e.pageRules,r);if(typeof n!="string")return null;let i=V.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!pl.has(o))return null;let s=n.slice(0,i),l=s?e.pageRoot.querySelector(s):e.pageRoot;return l?{el:l,prop:o,oldValue:l[o]}:null}function xi(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=fl(t,n);if(K(W(t),{path:n,structural:!1},t),i){let o=$("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var gl={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function bl(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=$("quickcrop");if(typeof n!="function")return{file:e};try{let i=typeof window<"u"&&(window.clay?.modal??window.themodal)||"auto",o=await n(e,{aspect:kl(r),modal:i,...gl});return o===null?null:{file:yl(o.blob,e.name),dataURL:o.dataURL}}catch(i){return Me(t,i&&i.message||"Crop failed"),null}}function kl(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function yl(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}var vl=new Set(["unsupported","payment-required"]);async function xl(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";Me(n,null);let o=await bl(r,n);if(!o||t.closed){se(e);return}let s=o.file,l=o.dataURL||null,a=$("upload");if(typeof a!="function")return Ar(e,n,t,i,await wi(s,l,n),s);Si(n,l),Ai(n,0);let u=Al(t),h;try{h=await a(s,{signal:u?.signal,onProgress:({percent:d})=>Ai(n,d)})}finally{_l(t,u),Tl(n)}if(t.closed){se(e);return}if(h.code==="aborted"){se(e);return}if(h.ok)return Ar(e,n,t,i,h.uploads[0].url,s);if(!vl.has(h.code)){Me(n,h.msg||"Upload failed"),t.dispatch?.("hcms:error",{error:new Error(h.msg||"Upload failed"),code:h.code,path:i}),se(e);return}let g=h.code==="payment-required"?"This file is stored in the page. Add a paid plan to upload files.":null;return Ar(e,n,t,i,await wi(s,l,n),s,g)}function Ar(e,t,r,n,i,o,s=null){if(r.closed){se(e);return}if(Si(t,null),Me(t,null),!i){se(e);return}Ei(t,i,o.name),K(W(r),{path:n,structural:!1},r),s&&Me(t,s,"info"),se(e)}async function wi(e,t,r){return t||await wl(e,r)}function wl(e,t){let r=t?.ownerDocument?.defaultView?.FileReader||globalThis.FileReader;return r?new Promise(n=>{let i=new r;i.onload=()=>n(typeof i.result=="string"?i.result:""),i.onerror=()=>n("");try{i.readAsDataURL(e)}catch{n("")}}):Promise.resolve("")}function Al(e){if(typeof AbortController!="function")return null;let t=new AbortController;return(e.uploads||(e.uploads=new Set)).add(t),t}function _l(e,t){t&&e.uploads?.delete(t)}function El(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";Ei(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&se(i),Me(r,null),K(W(t),{path:n,structural:!1},t)}function Sl(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function Ei(e,t,r){let n=Sl(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||br(t):"")}function se(e){try{e.value=""}catch{}}function Si(e,t){let r=e.querySelector?e.querySelector(".mirk-image__frame"):null;r&&(t?r.style.backgroundImage=`url("${t.replace(/"/g,"%22")}")`:r.style.removeProperty("background-image"))}function Ai(e,t){let r=Math.max(0,Math.min(100,Number(t)||0));e.setAttribute("data-hcms-uploading",""),e.style?.setProperty?.("--hcms-upload-progress",`${r}%`)}function Tl(e){e.removeAttribute("data-hcms-uploading"),e.style?.removeProperty?.("--hcms-upload-progress")}function Me(e,t,r="error"){let n=e.querySelector?e.querySelector(":scope > .hcms-error"):null;n&&(n.classList.toggle("hcms-error--info",!!t&&r==="info"),t?(n.textContent=t,n.hidden=!1):(n.textContent="",n.hidden=!0))}function Xe(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${je(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let s=ee(e),l=Nl(n,s),a=Array.isArray(l),u=typeof l=="string"&&l.endsWith("[]");if(!a&&!u)throw new Error(`hypercms: path "${e}" is not an array`);let h=Ct(i,"data-hcms-max-items"),g=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||h!=null&&g.length>=h)return;let d=g.length,p=a?l[1]:l.replace(/\[\]$/,""),c=Ke(a?p:"string"),m=Zn({shape:a?"object-array-item":"scalar-array-item",itemShape:p,pathArr:[...s,d],data:c,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(m),oe(m,t.doc,t.view?.enhanceFormRichText!==!1),Tr(i),pe(`Add ${e}`,()=>K(W(t),{path:e,structural:!0},t))}function _r(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),s=o.indexOf(e);if(s<0)return;let l=s+t;if(l<0||l>=o.length)return;let a=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[l]):i.insertBefore(e,o[l].nextSibling),Cr(i),Tr(n),a&&typeof a.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),pe(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>K(W(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var Tt="Delete this item?";function Cl(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||Tt;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||Tt:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?Tt:null}function Er(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=Cl(r,t);if(n==null)return Ne(e,t);let i=$("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>{t.closed||Ne(e,t)},()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&Ne(e,t):Ne(e,t)}function Ne(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=Ct(i,"data-hcms-min-items"),s=i.querySelector(".hcms-array-items"),l=s?s.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&l<=o)return}return e.remove(),n&&Cr(n),i&&Tr(i),pe(`Remove ${r}`,()=>K(W(t),{path:r,structural:!0},t))}}function K(e,t,r){if(r.closed)return{ok:!1,skipped:!0,closed:!0};let n=Je(e);if(!t.structural&&n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=Object.hasOwn(r,"writeRules")?r.writeRules:r.pageRules,o=Dn(r.pageRoot,i,e,{shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null,formRoot:r.formRoot});return o.ok?(r.lastFingerprint=n,r.lastData=e,_i(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(_i(r,Ll(o.error,t.path)),r.dispatch?.("hcms:error",{error:o.error,attemptedData:e}),r.onError?.(o.error)),o}function Ot(e,t){let r=je(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function Lt(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let s=je(n),l=r.querySelectorAll(`[data-hcms-path="${s}"][data-hcms-field][type="radio"], [data-hcms-path="${s}"] [data-hcms-field][type="radio"]`);l.length?l.forEach(a=>{a.checked=String(a.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}function W(e){let t=V.extract(e.formRoot,e.formRules,{exclude:null});return le(t,e.formRules)}function le(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>le(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=le(e[n],i);return r}return e}function _i(e,t){e.lastErrors=t&&t.length?t:null,Sr(e)}function Sr(e){if(Rl(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=Ol(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function Rl(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function Ol(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,s=>"\\"+s),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let s of o.children)if(s.classList&&s.classList.contains("hcms-error"))return s}r.pop()}return null}function Ll(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function Nl(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Ct(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Tr(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Ct(e,"data-hcms-max-items"),o=Ct(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),l=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),u=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');u&&(u.hidden=s||i!=null&&n>=i),r.forEach((h,g)=>{let d=h.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=l||o!=null&&n<=o);let p=h.querySelector('[data-hcms-action="move-up"]');p&&(p.hidden=a||g===0);let c=h.querySelector('[data-hcms-action="move-down"]');c&&(c.hidden=a||g===n-1)})}function Nt(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>Cr(t))}function Cr(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let s=o.join(".");s!==i&&Ml(n,i,s),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function Ml(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}jl(e)}function jl(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=yr(r.getAttribute("data-hcms-path")))}}function Je(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function je(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Mt="hcms-shell-styles",Il="hcms-bundled-styles-installed",jt="hcms-session-open",Fl='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Ie=new WeakSet,Rr="";function Ci(e){Rr=e}function Ze(e){e?.body?.classList.add(jt)}function Or(e){e?.body?.classList.remove(jt)}var Dl=0;function Ti(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function Ri({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:s=null,doc:l}){Oi(l);let a=`hcms-shell-title-${++Dl}`,u=l.createElement("div");u.setAttribute("data-hcms-shell",""),u.setAttribute("editor-ui",""),u.setAttribute("save-remove",""),u.setAttribute("save-ignore",""),u.setAttribute("tabindex","-1"),u.setAttribute("role","dialog"),u.setAttribute("aria-modal","true"),u.setAttribute("aria-labelledby",a);let h=s==="dark"?" dark":s==="light"?" light":"";u.className="hcms-shell pixel-quiet hcms-panel hcms-side-"+t+(r?" hcms-overlay":"")+h;let g=Ti(i),d=Ti(o);u.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${g}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${d}</div>
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
  `,(e||l.body).appendChild(u);let c=l.body;c.classList.add("hcms-open"),Ze(l),r&&c.classList.add("hcms-overlay"),t==="left"&&c.classList.add("hcms-side-left");let m=Pl(u,l),k=ql(u);return{root:u,formRoot:u.querySelector("[data-hcms-form-root]"),noticeEl:u.querySelector(".hcms-shell-notice"),errorEl:u.querySelector(".hcms-shell-error"),saveButton:u.querySelector(".hcms-shell-save"),destroy(){m.detach(),k.detach(),u.remove(),c.classList.remove("hcms-open","hcms-overlay","hcms-side-left"),Or(l)},restoreChrome(){ae(l),c.classList.add("hcms-open"),Ze(l),r&&c.classList.add("hcms-overlay"),t==="left"&&c.classList.add("hcms-side-left")}}}function ae(e){e&&(e.getElementById(Mt)||e.querySelector("style[data-hcms-bundled-styles]")||(Ie.delete(e),Oi(e)))}function Oi(e){if(e&&!Ie.has(e)){if(e[Il]){Ie.add(e);return}if(e.getElementById(Mt)||e.querySelector("style[data-hcms-bundled-styles]")){Ie.add(e);return}if(Rr){let t=e.createElement("style");t.id=Mt,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=Rr,(e.head||e.documentElement).appendChild(t),Ie.add(e);return}try{let t=new URL("./theme.generated.css",import.meta.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Mt,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Ie.add(e)}catch{let r=()=>{link.isConnected&&console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")};e.defaultView?.queueMicrotask?e.defaultView.queueMicrotask(r):r()}}}function ql(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function Pl(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Fl));if(i.length===0)return;let o=i[0],s=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),s.focus()):!n.shiftKey&&t.activeElement===s&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var $l="[hypercms]",Li={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Ni={skip:"[data-hcms-shell]",templateAttr:null},Lr=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Ft(e,t){let r=[],n=[],i=[];return Mr(Q(e),e,t,[],r,n,i),{missing:Mi(r),twins:Vl(n),readOnly:Mi(i)}}function Dt(e){return Nr(e)}function Nr(e){if(typeof e=="string")return ji(e)?void 0:e;if(Array.isArray(e)){let[t,r]=e;return[t,Nr(r)]}if(e&&typeof e=="object"){let t={};for(let[r,n]of Object.entries(e)){let i=Nr(n);i!==void 0&&(t[r]=i)}return t}return e}function Mr(e,t,r,n,i,o,s){if(typeof r=="string"){let l=zl(r),a=l?It(e,t,l,Li,n):[];if(ji(r)){s.push(Fe(n));return}if(!l)return;if(r.endsWith("[]")){a.length===0&&It(e,t,l,Ni,n).length===0&&i.push(Fe(n));return}a.length===0?i.push(Fe(n)):a.length>1&&o.push({path:Fe(n),count:a.length});return}if(Array.isArray(r)){let[l,a]=r;if(typeof l!="string"||!l)return;let u=It(e,t,l,Li,n);if(u.length===0){It(e,t,l,Ni,n).length===0&&i.push(Fe(n));return}for(let h of u)Mr(e,h,a,[...n,"*"],i,o,s);return}if(r&&typeof r=="object")for(let[l,a]of Object.entries(r))Mr(e,t,a,[...n,l],i,o,s)}function It(e,t,r,n,i){try{return e.find(t,r,n)}catch(o){throw new Lr(Fe(i),r,o)}}function zl(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=q(e);return(t===-1?e:e.slice(0,t))||null}function Bl(e){if(e.endsWith("[]"))return null;let t=q(e);return t===-1?null:e.slice(t+1)||null}function ji(e){let t=Bl(e);return t!=null&&be.has(t)}function De(e){Ul(e),Hl(e)}function Ul(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[],n=e.unresolved&&e.unresolved.readOnly||[];if(r.length===0&&n.length===0){t.textContent="",t.hidden=!0;return}let i=[];if(r.length){let o=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;i.push(`${o}: ${r.join(", ")}`)}if(n.length){let o=n.length===1?"1 field reads a property the browser will not let anything write":`${n.length} fields read properties the browser will not let anything write`;i.push(`${o}: ${n.join(", ")}`)}t.textContent=i.join(`
`),t.hidden=!1}function Hl(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${$l} "${n}" matches ${i} elements; edits go to the first one.`)}}function Mi(e){return[...new Set(e)]}function Vl(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function Fe(e){return e.length?e.join("."):"(whole page)"}var Wl={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function ce(e,{ignoreActiveValue:t}={}){return Kl(e,{ignoreActiveValue:t})}function Kl(e,{ignoreActiveValue:t}){let r=V.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.view.prepareRules(r.rules),e.rulesTagNode=r.tagNode),gt(e.doc),xt(e.doc,e.pageRules),e.formRules=At(e.pageRules,e.doc),e.writeRules=Dt(e.pageRules),e.unresolved=Ft(e.pageRoot,e.pageRules);let n=ht(),i=le(V.extract(e.pageRoot,e.pageRules,{...Wl,...n.hooks}),e.pageRules),o=Se({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});mt(e.formRoot,o,{ignoreActiveValue:t}),n.seed(e.formRoot),oe(e.formRoot,e.doc,e.view?.enhanceFormRichText!==!1),Sr(e),De(e),e.updateFingerprint&&e.updateFingerprint()}function Ii({debounce:e=100,onRefresh:t}){let r=$("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=r.onAnyChange({debounce:e},i=>{t(i)});return{unsubscribe:typeof n=="function"?n:()=>{}}}var Gl='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';function Fi({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null;return{name:"sidebar",richText:n,enhanceFormRichText:!0,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,prepareRules(o){return n?yi(o,t):o},mount(o){let s=this.ctx;i=re(()=>Ri({mountTo:r.mountTo||e.body,side:r.side||"right",overlay:!!r.overlay,showSaveButton:!!r.showSaveButton,title:r.title,eyebrow:r.eyebrow,theme:r.theme,doc:e})),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl;let l=Se({pageRules:s.pageRules,formRules:s.formRules,data:o,doc:e});i.formRoot.appendChild(l),s.seeder.seed(i.formRoot),oe(i.formRoot,e),De(s),Rt(s)},refresh(o){if(o==="livesync"){i?.restoreChrome?.(),ce(this.ctx,{ignoreActiveValue:!0});return}if(o==="undo"){ce(this.ctx,{ignoreActiveValue:!1});return}ce(this.ctx)},focusOnOpen(){let o=this.root&&this.root.querySelector(Gl);o&&typeof o.focus=="function"&&o.focus()},destroy(){i?.destroy(),i=null}}}var Yl="[cms-template], [data-hcms-shell]";function Qe(e){if(!e||typeof e.getBoundingClientRect!="function"||typeof e.closest=="function"&&e.closest(Yl))return!1;let t=e.getBoundingClientRect();return t.width>=8&&t.height>=8}var Xl={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Jl={skip:"[data-hcms-shell]",templateAttr:null},Zl="text",Ql="native",Di="handle",ea=new Set(["INPUT","TEXTAREA","SELECT"]),$i=new Set(["IMG","INPUT","TEXTAREA","SELECT","OPTION","BR","HR","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","CANVAS","SOURCE","TRACK","AREA","COL","PARAM","BUTTON"]);function Ir(e,t){return ta(e,t)}function ta(e,t){let r=[],n=[],i=Q(e);return jr(i,e,t,[],r,n),{targets:r,lists:n}}function jr(e,t,r,n,i,o){if(typeof r=="string"){if(r.endsWith("[]")){let h=r.slice(0,-2);if(!h)return;let g=qt(e,t,h);g.forEach((d,p)=>{i.push(Pi([...n,p],d,r,null))}),o.push(qi(e,t,n,h,g,!0));return}let s=q(r),l=s===-1?null:r.slice(s+1),a=s===-1?r:r.slice(0,s),u=!a||a==="."?t:qt(e,t,a)[0];u&&i.push(Pi(n,u,r,l));return}if(Array.isArray(r)){let[s,l]=r;if(typeof s!="string"||!s)return;let a=qt(e,t,s);a.forEach((u,h)=>jr(e,u,l,[...n,h],i,o)),o.push(qi(e,t,n,s,a,typeof l=="string"));return}if(r&&typeof r=="object")for(let[s,l]of Object.entries(r))jr(e,t,l,[...n,s],i,o)}function qi(e,t,r,n,i,o){let s=i[0]?i[0].parentElement:null;if(!s){let l=qt(e,t,n,Jl)[0];s=l?l.parentElement:null}return{path:r,items:i,container:s,scalar:o}}function Pi(e,t,r,n){return{path:e,el:t,rule:r,attr:n,kind:ra(t,n),icon:ia(t,n)}}function ra(e,t){let r=(e.tagName||"").toUpperCase();return!t||t==="innerHTML"?$i.has(r)?Di:Zl:t==="value"&&ea.has(r)&&!e.readOnly&&!na(e)?Ql:Di}function na(e){return e.disabled?!0:typeof e.matches=="function"&&e.matches(":disabled")}function ia(e,t){let r=(e.tagName||"").toUpperCase();return(!t||t==="innerHTML")&&!$i.has(r)?null:r==="IMG"||t==="srcset"?"camera":r==="A"&&t==="href"?"paperclip":"pencil"}function qt(e,t,r,n=Xl){try{return e.find(t,r,n)}catch{return[]}}var Pt=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),oa=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),km=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui","live"]);function et(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function Fr(e,t){if(et(e,t))return!0;for(let[r,n]of Object.entries(oa))if(n.includes(t)&&et(e,r))return!0;return!1}function tt(e){let t=Pt[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function sa(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=Pt[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>Fr(r,i))||n.bundles.some(i=>et(r,i)))return r;r=r.parentElement}return null}function zi(e,t){return!!sa(e,t)}var la=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function aa(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();"value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function Bi(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function Ui(e,t,r,n,i,o){return(o?zi(e,t):Bi(e,r,i,!1))||!!(n&&(o&&e!==i?e.matches(n):Bi(e,n,i,o)))}function ca(e,t){let r=Pt[t];return r.tokens.some(n=>Fr(e,n))||r.bundles.some(n=>et(e,n))}var da=new Set(["INPUT","TEXTAREA","SELECT","OPTION"]);function Hi(e,t,r,n){if(e.nodeType===1&&n(e)){r.dropped.push(t);return}r.cloneToLive.set(t,e),r.liveToClone.set(e,t);let i=e,o=t;if(e.nodeType===1){if(da.has(e.tagName)&&r.controls.push(e,t),e.tagName==="TEMPLATE"){for(;t.firstChild;)t.removeChild(t.firstChild);i=e.content,o=t.content,r.cloneToLive.set(o,i),r.liveToClone.set(i,o)}}else if(e.nodeType!==11)return;let s=o.firstChild;for(let l=i.firstChild;l&&s;l=l.nextSibling)Hi(l,s,r,n),s=s.nextSibling}function Dr(e,{capability:t="data",exclude:r=null,inherit:n=!0,provenance:i=null}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let o=e.nodeType===9?e:e.ownerDocument;if(!o?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let s=o.implementation.createHTMLDocument(""),l=i||new WeakMap,a=new WeakMap,u=e.nodeType===9?e.documentElement:e;r&&s.documentElement.matches(r);let h=tt(t),g=n?c=>ca(c,t)||!!(r&&c.matches(r)):c=>Ui(c,t,h,r,u,!1),d=null;if(u.nodeType!==1||!Ui(u,t,h,r,u,n)){d=s.importNode(u,!0);let c={cloneToLive:l,liveToClone:a,dropped:[],controls:[]};Hi(u,d,c,g);for(let m of c.dropped)m.remove();for(let m=0;m<c.controls.length;m+=2)aa(c.controls[m],c.controls[m+1])}e.nodeType===9&&d&&(s.replaceChild(d,s.documentElement),a.set(e,s),l.set(s,e));let p=c=>{if(la.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:d,document:s,capability:t,selector:tt(t),cloneToLive:l,liveToClone:a,original(c){return l.get(c)||null},cloneOf(c){return a.get(c)||null},query(c,m=d){return p(c),Array.from(m.querySelectorAll(c),k=>l.get(k)||k)},text(c=d){return(c===d?d:a.get(c))?.textContent||""},html(c=d){return(c===d?d:a.get(c))?.innerHTML??""},clone(c=d){let m=c===d?d:a.get(c);return m?s.importNode(m,!0):null}}}import{morph as ya}from"./hyper-morph.vendor.js";var ua=[16,8,0],z=8,ma=4;function Vi({anchor:e,bar:t,rail:r=t,viewport:n,current:i=null}){let o=d=>i===d?ma:0;if(e.bottom<=0||e.top>=n.height||e.right<=0||e.left>=n.width)return{mode:"hidden",x:0,y:0};let s=d=>Math.max(z,Math.min(e.left,n.width-d-z)),l=e.top-16-t.height;if(l>=z-o("above"))return{mode:"above",x:s(t.width),y:l};let a=e.bottom+16;if(a+t.height<=n.height-z+o("below"))return{mode:"below",x:s(t.width),y:a};let u=n.width-e.right-z,h=e.left-z,g=u>=h?[["rail-right",u],["rail-left",h]]:[["rail-left",h],["rail-right",u]];for(let[d,p]of g)for(let c of ua){if(r.width+c>p+o(d))continue;let m=d==="rail-right"?Math.min(e.right+c,n.width-r.width-z):Math.max(e.left-c-r.width,z),k=Math.min(e.bottom,n.height-z)-r.height,f=Math.max(z,Math.min(Math.max(e.top,z),k));return{mode:d,x:m,y:f,gap:c}}return{mode:"pinned",x:s(t.width),y:z}}function qr({anchor:e,handle:t,viewport:r,inset:n=6,prefer:i="auto"}){let o=e.height>=t.height*1.5&&e.width>=t.width*2;if(i==="corner"||o){let d=Math.max(z,Math.min(e.right-t.width+n,r.width-t.width-z)),p=Math.max(z,Math.min(e.top-n,r.height-t.height-z));return{x:d,y:p,mode:"over"}}let s=4,l=e.right+s+t.width<=r.width-z,a=l?e.right+s:e.left-s-t.width,u=Math.max(z,a),h=e.top+e.height/2-t.height/2,g=Math.max(z,Math.min(h,r.height-t.height-z));return{x:u,y:g,mode:l?"beside-right":"beside-left"}}var zt=!1;function Wi(){if(zt)return;let e=$("onPrepareForSave");typeof e=="function"&&(e(t=>{Gi(t),Ki(t)}),zt=!0)}function Ki(e){let t=e&&e.querySelector&&e.querySelector("body");t&&t.classList.remove("hcms-open","hcms-overlay","hcms-side-left",jt)}function Gi(e){if(!(!e||typeof e.querySelectorAll!="function"))for(let t of e.querySelectorAll(`[${ie}]`)){let r=fi(t);r!==null&&(t.innerHTML=r),t.removeAttribute(ie)}}var Bt=!1;function Ut(){if(Bt)return;let e=$("onSnapshot");typeof e=="function"&&(e(t=>{Gi(t),bi(t,typeof window<"u"?window:null),Ki(t)}),Bt=!0)}function Yi(){Wi(),Ut(),(!zt||!Bt)&&ha()}var $t=null;function ha(){if($t||typeof document>"u")return;$t=Re(document,mi,()=>{Wi(),Ut(),zt&&Bt&&($t?.(),$t=null)})}var pa={edit:"M8 10h2v6H8zm2 4h4v2h-4zm0-6h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-4 0h2v2h-2z","move-up":"M11 4h2v2h2v2h2v2h2v2h-4v-2h-2v10h-2V10H9v2H5v-2h2V8h2V6h2z","move-down":"M11 4h2v10h2v-2h4v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h4v2h2z",remove:"M5 5h3v3h3v3h2V8h3V5h3v3h-3v3h-3v2h3v3h3v3h-3v-3h-3v-3h-2v3H8v3H5v-3h3v-3h3v-2H8V8H5z",add:"M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"};function fe(e){let t=e==="edit"?"6 0 18 18":"0 0 24 24",r=e==="settings"?'<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>':`<path d="${pa[e]}"/>`;return`<svg class="hcms-inline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="${t}" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${r}</svg>`}var Xi="data-hcms-ghost",fa=tt("history");function ga(e){let t=e.container,r=null;for(;t&&(t.namespaceURI!=="http://www.w3.org/1999/xhtml"||["SELECT","OPTGROUP","DATALIST"].includes(t.tagName));)r=t,t=t.parentElement;return{parent:t,anchor:r}}function Ji({doc:e,themeRoot:t,onAdd:r,onResize:n}){let i=e.defaultView,o=[],s=!1,l=null,a=new Map;function u(p,c,m){p.style[c]!==m&&(p.style[c]=m)}function h(){let p=new Set(o.map(c=>c.node.parentElement));for(let[c,m]of a)p.has(c)&&i?.Sortable?.get(c)===m.instance||(m.instance.option("draggable")===m.selector&&m.instance.option("draggable",m.original),a.delete(c));for(let c of p){let m=i?.Sortable?.get(c);if(!m)continue;let k=m.option("draggable");if(a.get(c)?.selector===k)continue;let f=k,v=`${f.trim().startsWith(">")?"> ":""}:is(${f.trim().replace(/^>\s*/,"")}):not(${fa})`;m.option("draggable",v),a.set(c,{instance:m,original:f,selector:v})}}function g(){for(let p of o){let{node:c,slot:m,list:k}=p,f=k.items.filter(b=>b.isConnected).map(b=>b.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0);f.length&&(p.width=f.reduce((b,v)=>b+v.width,0)/f.length,p.height=f.reduce((b,v)=>b+v.height,0)/f.length),u(c,"width",p.width?`${Math.round(p.width)}px`:"100%"),u(m,"height",`${Math.max(48,Math.round(p.height||64))}px`),m!==c&&(m.colSpan=Math.max(1,...k.items.map(b=>[...b.children].reduce((v,E)=>v+(E.colSpan||1),0)))),c.hidden!==s&&(c.hidden=s)}h()}function d(p,c){let m=c.tagName,k=["TBODY","THEAD","TFOOT","TABLE"].includes(m),f=e.createElement(k?"tr":["UL","OL","MENU"].includes(m)?"li":"div");for(let w of[Xi,"data-hcms-shell","editor-ui","no-watch","no-save","save-remove","snapshot-remove"])f.setAttribute(w,"");f.setAttribute("draggable","false"),f.setAttribute("contenteditable","false"),f.className="hcms-shell pixel-quiet hcms-inline-ghost";for(let w of["light","dark"])f.classList.toggle(w,!!t?.classList.contains(w));let b=k?e.createElement("td"):f;b!==f&&(b.className="hcms-inline-ghost-cell",f.appendChild(b));let v=e.createElement("button");v.type="button",v.className="hcms-inline-list-button hcms-inline-list-add mirk-button mirk-button--small",v.setAttribute("data-hcms-list-action","add"),v.innerHTML=`<span class="mirk-button__label">${fe("add")}<span>Add</span></span>`,b.appendChild(v);let E={node:f,slot:b,button:v,list:p,width:0,height:0};v.addEventListener("click",w=>{w.preventDefault(),w.stopPropagation(),r(E.list)});for(let w of["pointerdown","mousedown","touchstart","click"])f.addEventListener(w,T=>T.stopPropagation());return f.addEventListener("dragstart",w=>{w.preventDefault(),w.stopPropagation()}),E}return{setLists(p){let c=new Set(o),m=[],k=new Set(o.map(b=>b.node)),f=new Set;for(let b of p||[]){if(!b.container||!b.container.isConnected)continue;let{parent:v,anchor:E}=ga(b);if(!v)continue;if(!f.has(v)){for(let R of v.querySelectorAll(`:scope > [${Xi}]`))k.has(R)||R.remove();f.add(v)}let w=o.find(R=>c.has(R)&&R.list.container===b.container&&R.list.path.join(".")===b.path.join("."))||d(b,v);c.delete(w),w.list=b,w.button.setAttribute("data-hcms-list",b.path.join(".")),w.button.setAttribute("aria-label",`Add to ${b.path.join(".")||"the list"}`);let T=E||b.items.filter(R=>R.parentElement===v).at(-1);T?T.nextSibling!==w.node&&T.after(w.node):w.node.parentElement!==v&&v.appendChild(w.node),m.push(w)}for(let b of c)b.node.remove();o=m,l?.disconnect(),!l&&typeof i?.ResizeObserver=="function"&&(l=new i.ResizeObserver(()=>{g(),n?.()}));for(let b of o)for(let v of b.list.items)l?.observe(v);g()},update:g,setHidden(p){s=!!p,g()},destroy(){l?.disconnect();for(let p of o)p.node.remove();o=[],h()}}}var Zi=[["move-up","Move up"],["move-down","Move down"]],ba={prefer:"corner",inset:0};function ka(e,t){return t.width<=e.width&&t.height<=e.height}function Qi({doc:e,layerEl:t,onActivate:r,onListAction:n}){let i=e.defaultView,o=[],s=new Map,l=0,a=new Map,u=null,h=new Set,g=0,d=!1,p=null,c=null,m=null,k=null,f=new Map,b=!1,v=null,E=Ji({doc:e,themeRoot:t.closest("[data-hcms-shell]"),onResize:T,onAdd:y=>n?.({action:"add",list:y,index:y.items.length})}),w=e.createElement("div");w.className="hcms-inline-highlight",w.hidden=!0,w.setAttribute("aria-hidden","true"),t.appendChild(w);function T(){if(!(g||!i)){if(typeof i.requestAnimationFrame!="function")return H();g=i.requestAnimationFrame(()=>{g=0,H()})}}let R=()=>m||k;function H(){if(!i)return;E.update();let y={width:i.innerWidth,height:i.innerHeight},x=R();for(let A of o){if(!A.visible){A.node.hidden=!0;continue}for(let M of A.members)M.node.hidden=b&&M.kind!=="handle";A.node.hidden=!1;let C=A.el.getBoundingClientRect(),S=A.node.getBoundingClientRect(),O=S.width,F=A.kind==="row"&&!ka(C,S);if(F&&A.el!==x){for(let M of A.members)M.kind==="row"&&(M.node.hidden=!0);S=A.node.getBoundingClientRect()}if(A.members.every(M=>M.node.hidden)){A.node.hidden=!0;continue}let D=A.kind==="handle"?null:ba,{x:X,y:N}=qr({anchor:C,handle:S,viewport:y,...D}),U=A.members.find(M=>M.kind==="handle");if(F&&U){let M=U.node.getBoundingClientRect(),on=qr({anchor:C,handle:M,viewport:y}),Bo=A.members.slice(A.members.indexOf(U)+1).filter(Zt=>!Zt.node.hidden).reduce((Zt,Uo)=>Zt+Uo.node.getBoundingClientRect().width+2,0);X=Math.max(8+O,Math.min(y.width-8,on.x+M.width+Bo))-S.width,N=on.y}A.node.style.transform=`translate(${Math.round(X)}px, ${Math.round(N)}px)`}if(v)if(!v.node.isConnected||v.node.closest("[hidden]"))Y();else{let A=v.button.getBoundingClientRect(),C=v.menu.getBoundingClientRect();v.menu.style.left=`${Math.max(8,A.right-C.width)-A.left}px`,v.menu.style.right="auto",v.menu.style.top=A.bottom+6+C.height>y.height-8?"auto":"calc(100% + 6px)",v.menu.style.bottom=A.bottom+6+C.height>y.height-8?"calc(100% + 6px)":"auto"}j(),p?.()}function B(y){if(y?.closest?.("[data-hcms-ghost]"))return null;for(let x=y;x&&x.nodeType===1;x=x.parentElement){let A=f.get(x);if(A)return A}return null}function G(y){v&&!v.node.contains(y.target)&&Y();let x=R();k=B(y.target),k&&t.contains(y.target)&&(m=null),R()!==x&&T()}function _(y){if(y.relatedTarget||!k)return;let x=R();k=null,R()!==x&&T()}function j(){if(!c||w.hidden)return;let y=c.getBoundingClientRect();w.style.width=`${Math.round(y.width)}px`,w.style.height=`${Math.round(y.height)}px`,w.style.transform=`translate(${Math.round(y.left)}px, ${Math.round(y.top)}px)`}function ge(){if(!i||typeof i.IntersectionObserver!="function"){for(let x of o)x.visible=!0;return}u||(u=new i.IntersectionObserver(x=>{let A=!1;for(let C of x)for(let S of s.get(C.target)||[])S.visible!==C.isIntersecting&&(S.visible=C.isIntersecting,A=!0);A&&T()},{threshold:0}));let y=new Set(s.keys());for(let x of h)y.has(x)||u.unobserve(x);for(let x of y)h.has(x)||u.observe(x);h=y}function Lo(){d||!i||(i.addEventListener("scroll",T,{passive:!0,capture:!0}),i.addEventListener("resize",T,{passive:!0}),e.addEventListener("focusin",G),e.addEventListener("focusout",_),e.addEventListener("pointerdown",tn,!0),e.addEventListener("keydown",rn,!0),d=!0)}function No(){!d||!i||(i.removeEventListener("scroll",T,{capture:!0}),i.removeEventListener("resize",T),e.removeEventListener("focusin",G),e.removeEventListener("focusout",_),e.removeEventListener("pointerdown",tn,!0),e.removeEventListener("keydown",rn,!0),d=!1)}function Xr(y){return`${y.kind}\0${y.attr||""}`}function Jr(y,x){return y.container===x.container&&y.scalar===x.scalar}function Mo(y,x){return y.kind!==x.kind?!1:y.kind==="handle"?Xr(y.target)===Xr(x.target):y.kind==="row"?y.row===x.row&&Jr(y.list,x.list):Jr(y.list,x.list)}function Zr(y,x){y.target=x;let A=x.path.join(".");y.node.setAttribute("data-hcms-target",A),x.icon?y.node.setAttribute("data-hcms-icon",x.icon):y.node.removeAttribute("data-hcms-icon"),y.node.setAttribute("aria-label",`Edit ${A}`)}function jo(y){let x=e.createElement("button");x.type="button",x.className="hcms-inline-handle mirk-button mirk-button--small",x.innerHTML=`<span class="mirk-button__label">${fe("edit")}</span>`;let A={node:x,kind:"handle",target:y};return Zr(A,y),x.addEventListener("click",C=>{C.preventDefault(),C.stopPropagation(),r?.(A.target,x)}),A}function Qr(y,x){let A=e.createElement("button");return A.type="button",A.className="hcms-inline-list-button mirk-button mirk-button--small",A.setAttribute("data-hcms-list-action",y),A.setAttribute("aria-label",x),A.innerHTML=`<span class="mirk-button__label">${fe(y)}${y==="add"?"<span>Add</span>":""}</span>`,A}function en(y,{list:x,row:A,rowIndex:C,count:S}){let O=x.path.join(".");y.list=x,y.row=A,y.index=C,y.count=S,y.node.setAttribute("data-hcms-list",O),y.node.setAttribute("data-hcms-row",String(C));for(let F of y.node.querySelectorAll("[data-hcms-list-action]")){let D=F.getAttribute("data-hcms-list-action"),X=Zi.find(([N])=>N===D)?.[1]||D;F.setAttribute("aria-label",`${X} ${O}.${C}`),F.disabled=D==="move-up"&&C===0||D==="move-down"&&C===S-1}}function Io(y,x,A,C){let S=e.createElement("div");S.className="hcms-inline-row-controls";let O={node:S,kind:"row",list:y,row:x,index:A,count:C};for(let[F,D]of Zi){let X=Qr(F,D);X.addEventListener("click",N=>{N.preventDefault(),N.stopPropagation(),!X.disabled&&n?.({action:F,list:O.list,index:O.index,row:O.row})}),S.appendChild(X)}return en(O,{list:y,row:x,rowIndex:A,count:C}),O}function Y(y=!1){if(!v)return;let x=v;v=null,x.menu.hidden=!0,x.button.setAttribute("aria-expanded","false"),x.node.parentElement?.classList.remove("has-open-settings"),y&&x.button.isConnected&&x.button.focus({preventScroll:!0})}function tn(y){v&&!v.node.contains(y.target)&&Y()}function rn(y){v&&(y.key==="Escape"?(y.preventDefault(),y.stopPropagation(),Y(!0)):y.key==="Tab"?Y(!0):["ArrowDown","ArrowUp","Home","End"].includes(y.key)&&v.menu.contains(y.target)&&(y.preventDefault(),v.menu.querySelector('[role="menuitem"]').focus({preventScroll:!0})))}function nn(y,{list:x,row:A,rowIndex:C}){Object.assign(y,{list:x,row:A,index:C}),y.node.setAttribute("data-hcms-list",x.path.join(".")),y.node.setAttribute("data-hcms-row",String(C)),y.button.setAttribute("aria-label",`Settings ${x.path.join(".")}.${C}`)}function Fo(y){let x=e.createElement("div");x.className="hcms-inline-settings";let A=Qr("settings","Settings");A.setAttribute("aria-haspopup","menu"),A.setAttribute("aria-expanded","false");let C=e.createElement("div");C.className="hcms-inline-settings-menu",C.setAttribute("role","menu"),C.setAttribute("aria-label","Item settings"),C.hidden=!0;let S=e.createElement("button");S.type="button",S.setAttribute("role","menuitem"),S.setAttribute("data-hcms-list-action","remove"),S.textContent="Delete",C.appendChild(S),x.append(A,C);let O={node:x,button:A,menu:C,kind:"settings"};nn(O,y);let F=()=>{Y(),v=O,C.hidden=!1,A.setAttribute("aria-expanded","true"),x.parentElement.classList.add("has-open-settings"),S.focus({preventScroll:!0}),T()};return A.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),v===O?Y(!0):F()}),A.addEventListener("keydown",D=>{(D.key==="ArrowDown"||D.key==="ArrowUp")&&(D.preventDefault(),F())}),S.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),Y(!0),n?.({action:"remove",list:O.list,index:O.index,row:O.row})}),O}function Do(y,x){y.kind==="handle"?Zr(y,x.target):y.kind==="row"?en(y,x):y.kind==="settings"&&nn(y,x)}function Jt(y,x,A,C,S){let O=x.get(A)?.find(F=>F.category===S);if(!O){O={el:A,category:S,members:[]},y.push(O);let F=x.get(A);F?F.push(O):x.set(A,[O])}O.members.push(C)}function qo(y,x,A){let C=A.items||[];C.forEach((S,O)=>{Qe(S)&&(Jt(y,x,S,{kind:"row",list:A,row:S,rowIndex:O,count:C.length},"item"),Jt(y,x,S,{kind:"settings",list:A,row:S,rowIndex:O},"item"))})}function Po(y,x){let A=new Set(y.members),C=[];for(let S of x){let O=y.members.find(F=>A.has(F)&&Mo(F,S))||(S.kind==="handle"?jo(S.target):S.kind==="row"?Io(S.list,S.row,S.rowIndex,S.count):Fo(S));A.delete(O),Do(O,S),b&&O.kind!=="handle"&&(O.node.hidden=!0),C.push(O)}for(let S of A)S===v&&Y(),S.node.remove();C.sort((S,O)=>["row","handle","settings"].indexOf(S.kind)-["row","handle","settings"].indexOf(O.kind)),C.forEach((S,O)=>{y.node.children[O]!==S.node&&y.node.insertBefore(S.node,y.node.children[O]||null)}),y.members=C}function $o(y,x){let A=[],C=new Map,S=new Map,O=0;for(let N of y||[])S.has(N.el)||S.set(N.el,N),!(N.kind!=="handle"||!Qe(N.el))&&(Jt(A,C,N.el,{kind:"handle",target:N},"item"),O++);for(let N of x||[])qo(A,C,N);let F=new Set(o),D=new Map;for(let N of o)D.has(N.el)||D.set(N.el,N.visible);let X=[];for(let N of A){let U=o.find(M=>F.has(M)&&M.el===N.el&&M.category===N.category);if(!U){let M=e.createElement("div");M.className="hcms-inline-item-controls",M.setAttribute("role","group"),U={el:N.el,node:M,category:N.category,kind:N.category==="add"?"add":"handle",members:[],visible:D.get(N.el)??!1},t.appendChild(M)}F.delete(U),U.el=N.el,U.category=N.category,Po(U,N.members),U.kind=U.members.some(M=>M.kind==="row")?"row":U.members.some(M=>M.kind==="handle")?"handle":"add",U.node.setAttribute("aria-label",U.category==="add"?"List controls":"Item controls"),X.push(U)}for(let N of F)N.node.remove();o=X,s=new Map,f=new Map;for(let N of o){let U=s.get(N.el);U?U.push(N):s.set(N.el,[N]);for(let M of N.members)M.kind!=="row"&&M.kind!=="settings"||(f.set(M.row,M.row),f.set(M.node,M.row),f.set(N.node,M.row))}m&&!f.has(m)&&(m=null),k&&!f.has(k)&&(k=null),a=S,l=O}function zo(){Y(),u?.disconnect(),u=null,h=new Set;for(let y of o)y.node.remove();o=[],s=new Map,a=new Map,f=new Map,l=0}return{setTargets(y,x){$o(y,x),E.setLists(x),ge(),Lo(),T()},refresh:T,get count(){return l},get controlsHidden(){return b},setControlsHidden(y){if(b=!!y,E.setHidden(b),b){Y();for(let x of o){for(let A of x.members)A.kind!=="handle"&&(A.node.hidden=!0);x.members.every(A=>A.node.hidden)&&(x.node.hidden=!0)}}T()},elementToTarget(y){if(y?.closest?.("[data-hcms-ghost]"))return null;for(let x=y;x&&x.nodeType===1;x=x.parentElement){let A=a.get(x);if(A)return A}return null},setHoveredRow(y){let x=R();m=y?B(y):null,R()!==x&&T()},showHighlight(y){y&&(c=y,w.hidden=!1,j())},hideHighlight(){c=null,w.hidden=!0},setFollower(y){p=typeof y=="function"?y:null},destroy(){E.destroy(),g&&i&&i.cancelAnimationFrame(g),g=0,p=null,c=null,m=null,k=null,w.remove(),No(),zo()}}}var va="hypercms-inline",it="is-hcms-inline-active",Pr="is-hcms-inline-onpath",eo='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',xa=["bold","italic","link","undo","redo"],wa=/^H[1-6]$/,Aa=0;function no({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null,o=null,s=null,l=new Map,a=null,u=null,h=null;function g(d,p,c,m,k){let f=Oe(e.defaultView);if(typeof f!="function")return null;let b=k||{},v=b.originalHTML??Dr(p,{capability:"history"}).html(),E=b.richClayIsOurs??!p.hasAttribute("data-richclay"),w=b.adopted??p.getAttribute("data-richclay-active")==="true",T=rt(p,m,"history"),R=_a(d,f,p,m,E);if(!R)return null;gi(p,m==="innerHTML",E);let H=String(++Aa);p.setAttribute(ie,H),Ut();let B={el:p,editor:R,path:c,prop:m,boundId:H,originalHTML:v,oldValue:T,richClayIsOurs:E,adopted:w,dirty:!1,written:!1,restorable(){return!this.adopted&&!this.dirty&&!this.written},lastEdited:void 0};l.set(p,B),hi(H,B);let G=R.squire;if(G&&typeof G.addEventListener=="function"){let j=()=>{B.dirty=!0,B.lastEdited=rt(p,B.prop,"history"),Ea(d,B)};G.addEventListener("input",j),B.detachInput=()=>G.removeEventListener?.("input",j)}let _=()=>io(B);return p.addEventListener("blur",_),B.detachBlur=()=>p.removeEventListener("blur",_),B}return{name:"inline",richText:n,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,handoffEl:null,handoffCountEl:null,popEl:null,enhanceFormRichText:!1,prepareRules(d){return n?vi(d,t):d},bindText(d,p,c,m){return g(this.ctx,d,p,c,m)},mount(d){let p=this.ctx;i=Oa(e,r.theme),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl,this.handoffEl=i.handoffEl,this.handoffCountEl=i.handoffCountEl,this.popEl=i.popEl,re(()=>Ze(e));let c=Se({pageRules:p.pageRules,formRules:p.formRules,data:d,doc:e});i.formRoot.appendChild(c),p.seeder.seed(i.formRoot),oe(i.formRoot,e,this.enhanceFormRichText),De(p),Rt(p),o=Qi({doc:e,layerEl:i.layerEl,onActivate:(m,k)=>this.activate(m,k),onListAction:m=>this.listAction(m)}),o.setFollower(()=>this.placePopover()),i.closeEl.addEventListener("click",()=>this.deactivate()),i.toggleEl.addEventListener("click",m=>{m.preventDefault(),m.stopPropagation(),this.toggleControls()}),i.handoffEl.querySelector("[data-hcms-open-view]").addEventListener("click",m=>{m.preventDefault(),m.stopPropagation(),p.onViewRequested?.("sidebar")}),this.bindPage(),this.syncTargets()},listAction({action:d,list:p,index:c,row:m}){let k=this.ctx,f=p.path.join("."),b=k.formRoot.querySelector(`[data-hcms-path="${je(f)}"]`);if(!b)return;if(d==="add"){Xe(f,k);return}let v=m?Na(k,f,m):c;if(v===-1)return;let E=La(b,v);if(E){if(d==="remove"){Er(E,k),this.syncTargets();return}_r(E,d==="move-up"?-1:1,k),this.syncTargets()}},toggleControls(){if(!o||!i)return;let d=!o.controlsHidden;o.setControlsHidden(d),i.toggleEl.setAttribute("aria-pressed",String(d));let p=i.toggleEl.querySelector(".mirk-button__label");p&&(p.textContent=d?"Show controls":"Hide controls")},bindPage(){let d=this.ctx.pageRoot,p=i.root,c=E=>{let w=o&&o.elementToTarget(E.target);w?o.showHighlight(w.el):o?.hideHighlight(),o?.setHoveredRow(E.target)},m=()=>{o?.hideHighlight(),o?.setHoveredRow(null)},k=E=>{if(p.contains(E.target))return;let w=o&&o.elementToTarget(E.target);!w||w.kind!=="text"||l.has(w.el)||g(this.ctx,w.el,w.path.join("."),Vt(w))},f=E=>{if(p.contains(E.target))return;let w=o&&o.elementToTarget(E.target);if(!w){this.deactivate();return}(typeof E.target.closest=="function"&&E.target.closest("a[href]")||w.kind!=="text")&&E.preventDefault(),this.activate(w)},b=E=>{E.key==="Escape"&&this.deactivate()},v=E=>{let w=E.detail;if(!(!w||w.pageRoot!==this.ctx.pageRoot||!w.path))for(let T of l.values())T.path===w.path&&(T.written=!0)};d.addEventListener("pointerover",c),d.addEventListener("pointerleave",m),d.addEventListener("pointerdown",k),d.addEventListener("click",f),p.addEventListener("keydown",b),e.addEventListener("hcms:change",v),s=()=>{d.removeEventListener("pointerover",c),d.removeEventListener("pointerleave",m),d.removeEventListener("pointerdown",k),d.removeEventListener("click",f),p.removeEventListener("keydown",b),e.removeEventListener("hcms:change",v)}},activate(d,p){if(!d||!i||d.kind==="text"&&this.activateText(d))return;let c=to(this,i,d.path.join("."));if(!c){this.deactivate();return}a=d,u=p||null,h=null,i.popEl.hidden=!1,i.formRoot.querySelectorAll(`.${it}`).forEach(ro),this.placePopover(),Ra(c)},activateText(d){let p=d.el,c=l.get(p);if(c)return Ht(c),!0;let m=g(this.ctx,p,d.path.join("."),Vt(d));return m?(Ht(m),!0):!1},placePopover(){if(!i||!a||i.popEl.hidden)return;let d=e.defaultView;if(!d)return;let p={width:d.innerWidth,height:d.innerHeight},c=a.el.getBoundingClientRect(),m=i.popEl.getBoundingClientRect(),{mode:k,x:f,y:b}=Vi({anchor:c,bar:m,viewport:p,current:h});h=k,i.popEl.style.transform=`translate(${Math.round(f)}px, ${Math.round(b)}px)`},deactivate(){if(!i||!a&&i.popEl.hidden)return;i.popEl.hidden=!0,so(i.root);let d=u;if(a=null,u=null,h=null,d&&e.contains(d)&&typeof d.focus=="function")try{d.focus({preventScroll:!0})}catch{d.focus()}},syncTargets(){if(!o)return;let d=this.ctx,{targets:p,lists:c}=Ir(d.pageRoot,d.pageRules);o.setTargets(p,c);let m=Sa(this,l,p,e);if(a){let f=m.get(a.el)||[],b=f.find(v=>Ta(v,a))||f.find(v=>v.path.join(".")===a.path.join("."))||(f.length===1?f[0]:null);b?a=b:this.deactivate()}Ca(this.ctx,l,e);let k=p.reduce((f,b)=>f+(Qe(b.el)?0:1),0);this.handoffEl&&(this.handoffCountEl.textContent=k===0?"":`${k} ${k===1?"field isn't":"fields aren't"} visible right now.`,this.handoffEl.hidden=k===0)},refresh(d,p){d==="livesync"?(ae(e),Ze(e),ce(this.ctx,{ignoreActiveValue:!0})):d==="undo"?ce(this.ctx,{ignoreActiveValue:!1}):ce(this.ctx),this.syncTargets(),(d==="livesync"||d==="undo")&&this.rebindText(d),this.restoreActive()},rebindText(d){let p=d!=="undo";for(let[c,m]of[...l]){if(!e.contains(c)){nt(this.ctx,m,{restore:!1,record:p}),l.delete(c);continue}if(c.hasAttribute(Z)){let b=rt(c,m.prop);b!==m.lastEdited&&(m.oldValue=b,m.lastEdited=void 0);continue}let k=e.activeElement===c;nt(this.ctx,m,{restore:!1,record:p}),l.delete(c);let f=g(this.ctx,c,m.path,m.prop,{richClayIsOurs:m.richClayIsOurs,adopted:m.adopted});f&&k&&Ht(f)}},restoreActive(){if(!i||!a||i.popEl.hidden)return;if(!e.contains(a.el)){this.deactivate();return}if(!to(this,i,a.path.join("."))){this.deactivate();return}i.formRoot.querySelectorAll(`.${it}`).forEach(ro),this.placePopover()},focusOnOpen(){if(this.root&&typeof this.root.focus=="function")try{this.root.focus({preventScroll:!0})}catch{this.root.focus()}},destroy(){u=null,this.deactivate();for(let d of l.values())nt(this.ctx,d);l.clear(),s?.(),s=null,o?.destroy(),o=null,i?.destroy(),i=null,Or(e),this.popEl=null,this.handoffEl=null,this.handoffCountEl=null}}}function _a(e,t,r,n,i){return re(()=>{let o=null;try{o=new t(r,{inline:!0,hyperclay:!1,toolbar:n==="innerHTML"?xa:!1,...wa.test(r.tagName)?{singleLine:!0}:null})}catch(s){return console.warn("[hypercms] richclay activation failed; the field falls back to the popover",s),null}if(o.unsupported||!o.active){if(i)try{o.destroy()}catch{}return null}return typeof o.reattach=="function"&&o.reattach(),o})}function Ea(e,{path:t,el:r,prop:n}){let i=Ot(e.formRoot,t);i&&(Lt(i,rt(r,n),e.formRoot,t),K(W(e),{path:t,structural:!1},e))}function rt(e,t,r="data"){let n=Dr(e,{capability:r});return t==="innerHTML"?n.html():n.text().trim()}function io(e){let{el:t,prop:r,oldValue:n,lastEdited:i}=e,o=i;if(o===void 0||o===n)return;e.oldValue=o;let s=$("undo");if(!s||typeof s.recordValue!="function")return;let l={prop:r,oldValue:n,newValue:o,read:a=>rt(a,r,"history"),write:(a,u)=>oo(a,r,u)};s.isPaused?queueMicrotask(()=>{t.isConnected&&s.recordValue(t,l)}):s.recordValue(t,l)}function oo(e,t,r){let n=e.cloneNode(!1);t==="innerHTML"?n.innerHTML=r:n.textContent=r,ya(e,Array.from(n.childNodes),{morphStyle:"innerHTML",policy:"history",restoreFocus:!1,scripts:{handle:!1,merge:!1}})}function nt(e,t,{restore:r=!0,record:n=!0}={}){n&&io(t),t.detachInput?.(),t.detachBlur?.(),re(()=>{if(!t.adopted){try{t.editor.destroy()}catch(i){console.warn("[hypercms] richclay teardown failed; editor state may reach the save",i)}t.richClayIsOurs&&t.el.removeAttribute("data-richclay")}t.el.removeAttribute(Z),t.el.removeAttribute(he),t.el.removeAttribute(ie),pi(t.boundId),r&&t.restorable()&&oo(t.el,"innerHTML",t.originalHTML)})}function Ht(e){let{editor:t,el:r}=e;if(r.ownerDocument.activeElement!==r)try{typeof t.focus=="function"?t.focus():r.focus()}catch{}}function Sa(e,t,r,n){let i=new Map;for(let o of r){let s=i.get(o.el);s?s.push(o):i.set(o.el,[o])}for(let[o,s]of[...t]){let l=i.get(o)||[],a=l.find(d=>Vt(d)===s.prop)||l[0];if(!a){nt(e.ctx,s,{restore:!0}),t.delete(o);continue}s.path=a.path.join(".");let u=Vt(a);if(u===s.prop)continue;let h=n.activeElement===o;nt(e.ctx,s,{restore:!1}),t.delete(o);let g=e.bindText(o,s.path,u,{richClayIsOurs:s.richClayIsOurs,adopted:s.adopted,originalHTML:s.originalHTML});g&&h&&Ht(g)}return i}function Ta(e,t){return e.el===t.el&&e.kind===t.kind&&e.attr===t.attr}function Vt(e){return e.attr==="innerHTML"?"innerHTML":"textContent"}function Ca(e,t,r){for(let n of e.pageRoot.querySelectorAll(`[${Z}]`))t.has(n)||re(()=>ki(n,r.defaultView))}function to(e,t,r){let n=e.formRoot&&e.formRoot.querySelector(`[data-hcms-path="${je(r)}"]`);if(so(t.root),!n)return null;let i=n.closest("[data-hcms-card]"),o=i?[...i.querySelectorAll('[data-hcms-shape="scalar"][data-hcms-path]')].filter(s=>s.closest("[data-hcms-card]")===i&&s.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]')===i.parentElement.closest('[data-hcms-shape="object-array"]')):[n];o.includes(n)||o.push(n);for(let s of o){s.classList.add(it),s.removeAttribute("draggable");for(let l=s.parentElement;l&&(l.classList.add(Pr),l.removeAttribute("draggable"),l!==e.formRoot);l=l.parentElement);}return n}function so(e){if(e)for(let t of e.querySelectorAll(`.${it}, .${Pr}`))t.classList.remove(it,Pr)}function ro(e){e.tagName==="TEXTAREA"&&Le(e),e.querySelectorAll?.("textarea").forEach(Le)}function Ra(e){let t=e.matches?.(eo)?e:e.querySelector?.(eo);if(!(!t||typeof t.focus!="function"))try{t.focus({preventScroll:!0})}catch{t.focus()}}function Oa(e,t){ae(e);let r=e.createElement(va),n=t==="dark"?" dark":t==="light"?" light":"";return r.className="hcms-shell pixel-quiet hcms-inline"+n,r.setAttribute("data-hcms-shell",""),r.setAttribute("editor-ui",""),r.setAttribute("no-save",""),r.setAttribute("save-remove",""),r.setAttribute("snapshot-remove",""),r.setAttribute("no-watch",""),r.setAttribute("tabindex","-1"),r.innerHTML=`
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
          <span class="mirk-button__label">${fe("remove")}</span>
        </button>
      </div>
      <div data-hcms-form-root class="hcms-form"></div>
    </div>
  `,e.body.appendChild(r),{root:r,formRoot:r.querySelector("[data-hcms-form-root]"),noticeEl:r.querySelector(".hcms-inline-notice"),errorEl:r.querySelector(".hcms-inline-error"),handoffEl:r.querySelector(".hcms-inline-handoff"),handoffCountEl:r.querySelector(".hcms-inline-handoff-count"),layerEl:r.querySelector(".hcms-inline-layer"),popEl:r.querySelector(".hcms-inline-pop"),closeEl:r.querySelector(".hcms-inline-pop-close"),toggleEl:r.querySelector("[data-hcms-controls-toggle]"),destroy(){r.remove()}}}function La(e,t){let r=e.querySelector(".hcms-array-items");return r&&r.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")[t]||null}function Na(e,t,r){let{lists:n}=Ir(e.pageRoot,e.pageRules),i=n.find(o=>o.path.join(".")===t);return i?i.items.indexOf(r):-1}var Ma="[hypercms]";function lo(e,t){if(!e||!e.querySelectorAll||!t)return;let r=ja(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Ma} template "${o}" doesn't match any rule path; ignored`))})}function ja(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),s=n.map(a=>typeof a=="number"?"*":a).join(".");o&&t.add(o),s&&t.add(s);let l=me(i);if(l==="object")for(let[a,u]of Object.entries(i))r([...n,a],u);else if(l==="object-array"||l==="scalar-array"){let a=[...n,"*"],u=a.map(h=>typeof h=="number"?"*":h).join(".");if(t.add(u),l==="object-array"){let h=i[1];if(h&&typeof h=="object"&&!Array.isArray(h))for(let[g,d]of Object.entries(h))r([...a,g],d)}}}}var co={skip:"[data-hcms-shell]",templateAttr:"cms-template"},L={isOpen:!1,ctx:null,opts:null};function uo({view:e,doc:t,pageRoot:r,opts:n={},onCloseRequested:i,onViewRequested:o}){let s=n.rules!==void 0?n.rules:"cms",l=V.findRules(t,s);if(!l){let k=typeof s=="string"?`data-rules-name~="${s}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${k}`)}let a=e.prepareRules(l.rules),u=l.tagNode;gt(t),xt(t,a),lo(t,a);let h=At(a,t),g=Dt(a),d=Ft(r,a),p=ht(),c=le(V.extract(r,a,{...co,...p.hooks}),a),m={doc:t,pageRoot:r,pageRules:a,writeRules:g,formRules:h,rulesTagNode:u,rulesSource:s,richText:e.richText,view:e,seeder:p,initialData:c,get formRoot(){return e.formRoot},get shellRoot(){return e.root},get errorEl(){return e.errorEl},get noticeEl(){return e.noticeEl},unresolved:d,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:n.onChange,onError:n.onError,confirmRemove:n.confirmRemove,previouslyFocused:t.activeElement,dispatch(k,f){let b=t.defaultView&&t.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!b)return;let v={...f||{},pageRoot:r,view:e.name},E=new b(k,{bubbles:!0,cancelable:k==="hcms:change",detail:v});(e.root&&e.root.isConnected!==!1?e.root:r).dispatchEvent(E)},onCloseRequested:i,onViewRequested:o};return m.updateFingerprint=()=>{m.lastFingerprint=Je(W(m))},e.ctx=m,m}function mo(e){e.updateFingerprint(),e.observerHandle=Ii({onRefresh:n=>e.view.refresh("observer",n)});let t=$("undo");if(t&&typeof t.on=="function"){let n=()=>{if(L.ctx!==e)return;ao(e,"undo");let i=le(V.extract(e.pageRoot,e.pageRules,co),e.pageRules);Je(i)!==Je(e.lastData)&&(e.lastData=i,e.onChange?.(i,{path:"",structural:!1}))};t.on("undo",n),t.on("redo",n),e.undoUnsub=()=>{t.off("undo",n),t.off("redo",n)}}let r=()=>ao(e,"livesync");e.livesyncUnsub=Re(e.doc,ui,r),zr.ctx=e,Fa(e.doc)}function ao(e,t){L.ctx===e&&e.view.refresh(t)}function Wt(e,{dispatch:t=!0,restoreFocus:r=!0,updateUrl:n=!0,reason:i="close"}={}){if(!e||e.closed)return;e.closed=!0;for(let s of e.uploads||[])try{s.abort()}catch{}e.uploads?.clear();let o=e.previouslyFocused;if(t&&e.dispatch("hcms:close",{reason:i}),n&&Da(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),re(()=>e.view.destroy()),Ia(),r&&typeof o?.focus=="function")try{o.focus()}catch{}}function Ia(){L.isOpen=!1,L.ctx=null,L.opts=null,zr.ctx=null}var zr={ctx:null};function Fa(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=zr.ctx;if(i)return Nt(i.formRoot),pe("Reorder",()=>K(W(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var $r="cms";function ho(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get($r)!=="true"?t:(i.set($r,"false"),"?"+i.toString())}function po(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get($r)==="true":!1}function Da(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=ho(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}var fo="hcms-toggle",I="data-hcms-toggle-host",go="hcms-toggle-style",bo="data-hcms-toggle-style",Kt="data-hcms-session",_o="data-hcms-split",Eo="hcms.view",Gt=["sidebar","inline"],qa={sidebar:"In the sidebar",inline:"On the page"},Hr="var(--hcms-toggle-bg, var(--hcms-toggle-_surface))";function ko(e){try{let t=e&&e.localStorage?e.localStorage.getItem(Eo):null;return Gt.includes(t)?t:null}catch{return null}}function Pa(e,t){if(Gt.includes(t))try{e?.localStorage?.setItem(Eo,t)}catch{}}var $a="#fafafa",za="#0a0a0a",Ba=`
[${I}] {
  all: unset;
  box-sizing: border-box;
  display: var(--hcms-toggle-display, inline-flex);
  font-family: 'Departure Mono', ui-monospace, Menlo, monospace;
  --hcms-toggle-_surface: ${$a};
}
[${I}][data-hcms-surface="dark"] {
  --hcms-toggle-_surface: ${za};
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
[${I}][${Kt}="open"] .hcms-toggle__open { display: none; }
[${I}][${Kt}="open"] .hcms-toggle__close { display: inline; }
[${I}][${_o}] .hcms-toggle__main {
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
  background: ${Hr};
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
`;function Ua({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),s=new URLSearchParams(o).get("editmode");return s?s==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}var Br=new WeakMap;function So(e,t){try{e.globalCompositeOperation="copy",e.fillStyle=t,e.fillRect(0,0,1,1);let r=e.getImageData(0,0,1,1).data;return{r:r[0],g:r[1],b:r[2],a:r[3]/255}}catch{return null}}function Ha(e){if(Br.has(e))return Br.get(e);let t=null;try{let r=e.createElement("canvas");if(r.width=r.height=1,t=r.getContext?r.getContext("2d",{willReadFrequently:!0}):null,t){let n=So(t,"rgb(1, 2, 3)");(!n||n.r!==1||n.g!==2||n.b!==3||n.a!==1)&&(t=null)}}catch{t=null}return Br.set(e,t),t}function Va(e,t){let r=String(e??"").trim();if(!r)return null;let n=Wa(r);if(n)return n;let i=t&&t.defaultView;if(!i||!i.CSS||typeof i.CSS.supports!="function"||!i.CSS.supports("color",r))return null;let o=Ha(t);return o?So(o,r):null}function Wa(e){let t=/rgba?\(([^)]+)\)/.exec(String(e??""));if(!t)return null;let r=t[1].split(/[\s,/]+/).filter(Boolean);if(r.length<3)return null;let n=r.slice(0,3).map(Number);if(n.some(Number.isNaN))return null;let i=r[3],o=i===void 0?1:i.endsWith("%")?Number(i.slice(0,-1))/100:Number(i);return{r:n[0],g:n[1],b:n[2],a:Number.isNaN(o)?1:o}}function yo({r:e,g:t,b:r}){let n=i=>{let o=i/255;return o<=.03928?o/12.92:((o+.055)/1.055)**2.4};return .2126*n(e)+.7152*n(t)+.0722*n(r)}function vo(e,t){let r=yo(e),n=yo(t);return(Math.max(r,n)+.05)/(Math.min(r,n)+.05)}var xo={r:10,g:10,b:10},wo={r:250,g:250,b:250};function Ao(e,t){let r=e.a==null?1:e.a;return{r:e.r*r+t.r*(1-r),g:e.g*r+t.g*(1-r),b:e.b*r+t.b*(1-r)}}function Ka(e){if(!e)return"light";let t=vo(Ao(e,xo),xo),r=vo(Ao(e,wo),wo);return t>r?"dark":"light"}function ot(e,t){for(let[r,n]of Object.entries(t))e.style.setProperty(r,n,"important")}function Ur(e){let t=e.ownerDocument&&e.ownerDocument.defaultView,r=e.querySelector(".hcms-toggle__main");if(!t||!r||typeof t.getComputedStyle!="function")return;let n=Va(t.getComputedStyle(r).color,e.ownerDocument);e.setAttribute("data-hcms-surface",Ka(n))}function Ga(e){Ur(e);let t=e.ownerDocument,r=t&&t.defaultView;if(!r)return;let n=0,i=()=>{if(!n){if(typeof r.requestAnimationFrame!="function")return e.isConnected?Ur(e):l();n=r.requestAnimationFrame(()=>{if(n=0,!e.isConnected)return l();Ur(e)})}};typeof r.requestAnimationFrame=="function"&&i(),t.readyState!=="complete"&&r.addEventListener("load",i,{once:!0});let o=typeof r.MutationObserver=="function"?new r.MutationObserver(i):null;o&&(o.observe(t.documentElement,{attributes:!0}),t.body&&o.observe(t.body,{attributes:!0}));let s=typeof r.matchMedia=="function"?r.matchMedia("(prefers-color-scheme: dark)"):null;s&&typeof s.addEventListener=="function"&&s.addEventListener("change",i);function l(){o&&o.disconnect(),s&&typeof s.removeEventListener=="function"&&s.removeEventListener("change",i)}}function Ya({open:e,close:t,isOpen:r,getTheme:n=()=>null,views:i=Gt},o=document){let s=o.querySelector(`[${I}]`);if(s)return s;if(!o.querySelector(`[${bo}]`)){let _=o.createElement("style");_.setAttribute(bo,""),_.setAttribute("editor-ui",""),o.getElementById(go)||(_.id=go),_.setAttribute("no-save",""),_.setAttribute("snapshot-remove",""),_.setAttribute("save-ignore",""),_.textContent=Ba,o.head.insertBefore(_,o.head.firstChild)}let l=o.createElement("hypercms-toggle");l.className="hcms-shell pixel-quiet",o.getElementById(fo)||(l.id=fo),l.setAttribute(I,""),l.setAttribute("editor-ui",""),l.setAttribute("no-save",""),l.setAttribute("snapshot-remove",""),l.setAttribute("save-ignore",""),l.innerHTML='<button type="button" class="hcms-toggle__main mirk-button"><span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span></button>';let a=o.defaultView,u=l.querySelector(".hcms-toggle__main"),h=Gt.filter(_=>i.includes(_)),g=h.length>1,d=g?Xa(o):null,p=g?Ja(o,h):null;g&&(l.setAttribute(_o,""),l.appendChild(d),l.appendChild(p)),ot(l,{position:"fixed",right:"calc(var(--hcms-toggle-offset, 16px) + var(--hcms-toggle-shift, 0px))",bottom:"calc(var(--hcms-toggle-offset, 16px) + env(safe-area-inset-bottom, 0px))","z-index":"var(--hcms-toggle-z, 2147482900)"}),ot(u,{background:Hr}),d&&ot(d,{background:Hr}),p&&ot(p,{position:"absolute",right:"0",bottom:"calc(100% + 8px)","z-index":"var(--hcms-toggle-z, 2147482900)",display:"none"});let c=()=>p?[...p.querySelectorAll('[role="menuitemradio"]')]:[];function m(_){if(!(!_||typeof _.focus!="function"))try{_.focus({preventScroll:!0})}catch{_.focus()}}function k(_){let j=c();j.length&&m(j[(_+j.length)%j.length])}function f(){let _=ko(a);for(let j of c())j.setAttribute("aria-checked",String(j.getAttribute("data-hcms-view")===_))}function b(_){l.contains(_.target)||w()}function v(_){p&&(p.hidden=!_,ot(p,{display:_?"block":"none"}),d.setAttribute("aria-expanded",String(_)),_?(f(),o.addEventListener("pointerdown",b,!0)):o.removeEventListener("pointerdown",b,!0))}function E(_=0){v(!0),k(_)}function w({focusArrow:_=!1}={}){!p||p.hidden||(v(!1),_&&m(d))}function T(){let _=ko(a);return _&&h.includes(_)?_:null}async function R(_){await e({view:_}),Pa(a,_)}async function H(){if(r()){t();return}let _=T();return _?e({view:_}):g?E():e(h[0]?{view:h[0]}:{})}async function B(_){try{await _()}catch(j){console.warn("hypercms: toggle failed to open the CMS",j)}}l.addEventListener("click",async _=>{d&&d.contains(_.target)||p&&p.contains(_.target)||await B(H)}),d&&(d.addEventListener("click",_=>{_.preventDefault(),p.hidden?E():w({focusArrow:!0})}),d.addEventListener("keydown",_=>{if(_.key==="ArrowUp"){_.preventDefault(),E(-1);return}(_.key==="ArrowDown"||_.key==="Enter"||_.key===" ")&&(_.preventDefault(),E(0))}),p.addEventListener("click",_=>{let j=_.target.closest?.('[role="menuitemradio"]');j&&(_.preventDefault(),w(),B(()=>R(j.getAttribute("data-hcms-view"))))}),p.addEventListener("keydown",_=>{let j=c(),ge=j.indexOf(o.activeElement);switch(_.key){case"ArrowDown":_.preventDefault(),k(ge+1);break;case"ArrowUp":_.preventDefault(),k(ge-1);break;case"Home":_.preventDefault(),k(0);break;case"End":_.preventDefault(),k(j.length-1);break;case"Enter":case" ":if(_.preventDefault(),ge===-1)break;w(),B(()=>R(j[ge].getAttribute("data-hcms-view")));break;case"Escape":_.preventDefault(),w({focusArrow:!0});break;case"Tab":w();break}}));let G=_=>{let j=n();l.classList.toggle("light",j==="light"),l.classList.toggle("dark",j==="dark"),_?l.setAttribute(Kt,"open"):l.removeAttribute(Kt)};return G(r()),o.addEventListener("hcms:open",()=>G(!0)),o.addEventListener("hcms:close",()=>G(!1)),o.body.appendChild(l),ae(o),Ga(l),l}function Xa(e){let t=e.createElement("button");return t.type="button",t.className="hcms-toggle__arrow mirk-button",t.setAttribute("aria-haspopup","menu"),t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Choose where to edit"),t.textContent="\u25BE",t}function Ja(e,t){let r=e.createElement("div");r.className="hcms-toggle__menu",r.setAttribute("role","menu"),r.setAttribute("aria-label","Where to edit"),r.hidden=!0;for(let n of t){let i=e.createElement("button");i.type="button",i.className="hcms-toggle__item",i.setAttribute("role","menuitemradio"),i.setAttribute("aria-checked","false"),i.setAttribute("data-hcms-view",n),i.tabIndex=-1,i.textContent=qa[n],r.appendChild(i)}return r}function To(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Ua({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Ya(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function Co(e){if(Ci(e),typeof document<"u"){let t=document.getElementById("hcms-shell-styles");t?.tagName==="LINK"&&t.remove(),ae(document)}}var Wr={sidebar:Fi,inline:no};function Yt(e={}){let t=e.view||(L.isOpen?L.ctx.view.name:"sidebar"),r=Wr[t];if(!r)throw new Error(`hypercms: unknown view "${t}" (expected ${Object.keys(Wr).join(" or ")})`);let n=L.isOpen?{...L.opts,...e,view:t}:e,i=n.pageRoot||(typeof document<"u"?document.body:null);if(!i)throw new Error("hypercms: no pageRoot available");let o=i.ownerDocument||(typeof document<"u"?document:null);if(!o)throw new Error("hypercms: no document available");let s=null,l=null;if(L.isOpen){if(L.ctx.view.name===t)return;s=L.ctx.previouslyFocused,l=L.ctx.view.name,Wt(L.ctx,{restoreFocus:!1,updateUrl:!1,reason:"switch"})}Yi();let a=r({doc:o,pageRoot:i,opts:n}),u=uo({view:a,doc:o,pageRoot:i,opts:n,onCloseRequested:()=>Kr(),onViewRequested:h=>Yt({view:h})});s&&(u.previouslyFocused=s);try{a.mount(u.initialData),mo(u),a.focusOnOpen(),L.isOpen=!0,L.ctx=u,L.opts=n,u.dispatch("hcms:open",{pageRoot:i,previous:l})}catch(h){throw Wt(u,{dispatch:!1,restoreFocus:!!s,updateUrl:!1}),h}}function Kr(){L.isOpen&&Wt(L.ctx)}function Ro(){L.isOpen&&L.ctx.view.refresh("api")}function Za(){return L.isOpen}function Qa(){return L.isOpen&&L.ctx?L.ctx.view.name:null}var ec={getData(){return L.isOpen?W(L.ctx):null},setValue(e,t){if(!L.isOpen)throw new Error("hypercms: cms is not open");let r=L.ctx,n=ee(e),i=ue(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=Ot(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);Lt(o,t,r.formRoot,e),K(W(r),{path:e,structural:!1},r)},addItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");Xe(e,L.ctx)},removeItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");let t=L.ctx,r=ee(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=ue(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let s=t.formRoot.querySelector(`[data-hcms-path="${oc(e)}"]`);if(!s)throw new Error(`hypercms: no element at path "${e}"`);Ne(s,t)},refresh:Ro,_commit(){if(!L.isOpen)return;let e=L.ctx;return Nt(e.formRoot),pe("Update",()=>K(W(e),{path:"",structural:!0},e))}},tc=250,rc=1e4;function nc(){typeof window>"u"||typeof document>"u"||po(window.location?window.location.search:"")&&(L.isOpen||ic(()=>{if(!L.isOpen)try{Yt()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function Vr(){return!!document.body&&!!$("Mutation")}function ic(e){if(Vr()){queueMicrotask(e);return}let t=Date.now()+rc,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function s(){if(L.isOpen){o();return}Vr()&&(o(),e())}i=Re(document,di,s),n=setInterval(()=>{if(L.isOpen){o();return}if(Vr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},tc)}nc();To({open:Yt,close:Kr,isOpen:Za,getTheme:()=>L.opts?.theme,views:Object.keys(Wr),hasRules:e=>!!V.findRules(e,"cms")});var Gr={open:Yt,close:Kr,refresh:Ro,api:ec,get isOpen(){return L.isOpen},currentView:Qa,path:ur,scaffold:Ke,morphForm:mt};function oc(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Oo=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let s=n.files[0],l=document.createElement("a");if(l.className="mirk-file__name",l.dataset.filled="",l.href=URL.createObjectURL(s),l.target="_blank",l.rel="noopener",l.textContent=s.name,o.replaceWith(l),!i.querySelector(".mirk-file__remove")){let a=document.createElement("button");a.type="button",a.className="mirk-file__remove",a.setAttribute("aria-label","Remove file"),a.innerHTML=e,l.after(a)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let s=i.querySelector(".mirk-image__placeholder"),l=new FileReader;l.onload=a=>{o.src=a.target.result,o.removeAttribute("hidden"),s&&s.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},l.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),s=o?.querySelector(".mirk-file__input"),l=o?.querySelector(".mirk-file__name");if(s&&(s.value=""),l){let a=document.createElement("span");a.className="mirk-file__name",a.textContent="No file chosen",l.replaceWith(a)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),s=o?.querySelector(".mirk-image__input"),l=o?.querySelector(".mirk-image__preview");s&&(s.value=""),l&&(l.removeAttribute("src"),l.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let s=document.createElement("button");s.type="button",s.className="mirk-tags__remove",s.textContent="\xD7";let l=document.createElement("span");if(l.className="mirk-tags__chip",n){let a=document.createElement("span");a.className="mirk-tags__chip-inner",a.append(i,o,s),l.append(a)}else l.append(i,o,s);return l}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(a=>a.remove());let l=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(l).then(()=>{let a=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=a,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();Co(Oo);var Xt=Gr,ac={cms:Gr};typeof window<"u"&&!window.__hyperclayNoAutoExport&&(window.hyperclay=window.hyperclay||{},window.hyperclay.hypercms=Xt,window.h=window.hyperclay);var Rh=Xt,Oh=Yr;export{Rh as cms,Oh as default};
