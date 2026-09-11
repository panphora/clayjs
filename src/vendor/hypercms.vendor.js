var Do=Object.defineProperty;var Gt=(e,t)=>{for(var r in t)Do(e,r,{get:t[r],enumerable:!0})};var Ur={};Gt(Ur,{cms:()=>Vt,default:()=>Ga});function D(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function it(e){let t=D(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}import dc from"./hyper-morph.vendor.js";var ot=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],Yt=new Set(ot),en=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),qe=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var st={};Gt(st,{EmptyListInsert:()=>Pe,MAX_RULE_DEPTH:()=>ye,MaxRuleDepthExceeded:()=>de,RuleTargetReadOnly:()=>$e,RulesParseError:()=>be,ShapeMismatch:()=>De,UnknownRulesVersion:()=>ke});var be=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ke=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},ye=20,de=class extends Error{constructor(t){super(`rule depth exceeded ${ye} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},De=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},Pe=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},$e=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}};function ne(e,t,r,n={}){if(Object.prototype.hasOwnProperty.call(n,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");return Xt(e,t,r,{depth:0,path:[]},n)}function Xt(e,t,r,n,i){if(n.depth>ye)throw new de(n.path);if(typeof r=="string")return Ho(e,t,r,n,i);if(Array.isArray(r)){let[o,l]=r,s=e.find(t,o,i);return rn(i,n,s),s.map((a,d)=>Xt(e,a,l,{depth:n.depth+1,path:[...n.path,d]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[l,s]of Object.entries(r))o[l]=Xt(e,t,s,{depth:n.depth+1,path:[...n.path,l]},i);return o}return null}function Ho(e,t,r,n,i){if(r.endsWith("[]")){let s=r.slice(0,-2),a=e.find(t,s,i);return rn(i,n,a),a.map(d=>e.text(d))}if(r.startsWith("@"))return tn(e,t,r.slice(1));let o=D(r);if(o!==-1){let s=r.slice(0,o),a=r.slice(o+1),d=s?e.find(t,s,i):[t];return d.length===0?null:tn(e,d[0],a)}if(r===".")return e.text(t);let l=e.find(t,r,i);return l.length===0?null:e.text(l[0])}function rn(e,t,r){if(typeof e.onRowsRead=="function")try{e.onRowsRead(t.path.slice(),r)}catch(n){console.warn(`[hyper-html-api] onRowsRead threw at "${t.path.join(".")||"(root)"}"`,n)}}function tn(e,t,r){if(Yt.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}var nn=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),Vo=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),wc=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui"]);function Jt(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function Wo(e,t){if(Jt(e,t))return!0;for(let[r,n]of Object.entries(Vo))if(n.includes(t)&&Jt(e,r))return!0;return!1}function ze(e){let t=nn[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function Ko(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=nn[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>Wo(r,i))||n.bundles.some(i=>Jt(r,i)))return r;r=r.parentElement}return null}function on(e,t){return!!Ko(e,t)}var Go=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function sn(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();if("value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&(t.value=e.value),"checked"in e&&"checked"in t&&(t.checked=e.checked),"selected"in e&&"selected"in t&&(t.selected=e.selected),e.tagName==="SELECT")for(let n=0;n<e.options.length;n++)t.options[n].selected=e.options[n].selected;"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function ln(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function an(e,t,r,n,i,o,l,s){if(e.nodeType===1&&((l?on(e,r):ln(e,n,o,!1))||i&&ln(e,i,o,l)))return null;let a=t.importNode(e,!1);s.cloneToLive.set(a,e),s.liveToClone.set(e,a);let d=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,m=a.nodeType===1&&a.tagName==="TEMPLATE"?a.content:a;d!==e&&(s.cloneToLive.set(m,d),s.liveToClone.set(d,m));for(let f of d.childNodes||[]){let c=an(f,t,r,n,i,o,l,s);c&&(m.appendChild(c),f.nodeType===1&&sn(f,c))}return e.nodeType===1&&sn(e,a),a}function Ue(e,{capability:t="data",exclude:r=null,inherit:n=!0}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let i=e.nodeType===9?e:e.ownerDocument;if(!i?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let o=i.implementation.createHTMLDocument(""),l=new WeakMap,s=new WeakMap,a=e.nodeType===9?e.documentElement:e;r&&o.documentElement.matches(r);let d=ze(t),m=an(a,o,t,d,r,a,n,{cloneToLive:l,liveToClone:s});e.nodeType===9&&m&&(o.replaceChild(m,o.documentElement),s.set(e,o),l.set(o,e));let f=c=>{if(Go.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:m,document:o,capability:t,selector:ze(t),cloneToLive:l,liveToClone:s,original(c){return l.get(c)||null},cloneOf(c){return s.get(c)||null},query(c,h=m){return f(c),Array.from(h.querySelectorAll(c),u=>l.get(u)||u)},text(c=m){return(c===m?m:s.get(c))?.textContent||""},html(c=m){return(c===m?m:s.get(c))?.innerHTML??""},clone(c=m){let h=c===m?m:s.get(c);return h?o.importNode(h,!0):null}}}function cn(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function Yo(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var $={semanticExclude:!0,find(e,t,r={}){let n=Yo(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(s=>!cn(s)));let o=[];r.skip&&o.push(r.skip);let l=r.templateAttr===null?null:r.templateAttr||"cms-template";if(l&&o.push("["+l+"]"),o.length){let s=o.join(", ");i=i.filter(a=>!a.closest||!a.closest(s))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}};function Q(e,t={}){if(t.exclude===null)return $;let r=[ze("data"),t.exclude].filter(Boolean).join(", "),n=e.nodeType===9?e:e.ownerDocument||e,i=e.nodeType===9?e.documentElement:e;if(!t._write&&!i?.matches?.(r)&&!i?.querySelector?.(r)&&!n?.querySelector?.(r))return $;let o=e.nodeType===9||!e.isConnected?e:e.ownerDocument,l=e.nodeType===9?e:e.ownerDocument,s=null,a=()=>s||(s=Ue(o,{capability:"data",exclude:t.exclude||null})),d=u=>{let p=a();return u===e?p.cloneOf(e):p.cloneOf(u)||u},m=u=>s?.original(u)||u,f=(u,p)=>{a().liveToClone.set(u,p),a().cloneToLive.set(p,u);let g=u.childNodes||[],b=p.childNodes||[];for(let y=0;y<Math.min(g.length,b.length);y++)f(g[y],b[y])},c=(u,p,g,b)=>{let y=Array.from(u.childNodes).filter(C=>s.cloneOf(C)),E=y[0];for(;E&&y.includes(E);)E=E.nextSibling;for(let C of y)C.remove();if(g==="innerHTML"){let C=l.createElement("template");C.innerHTML=b;for(let H of Array.from(C.content.childNodes))u.insertBefore(H,E||null)}else u.insertBefore(l.createTextNode(b),E||null);let x=Ue(u,{capability:"data",exclude:t.exclude||null});p.replaceChildren(...Array.from(x.root?.childNodes||[]));let T=C=>{let H=x.original(C);H&&(s.liveToClone.set(H,C),s.cloneToLive.set(C,H));for(let P of Array.from(C.childNodes||[]))T(P)};for(let C of Array.from(p.childNodes))T(C)},h={...$,find(u,p,g={}){let b=d(u);if(!b?.querySelectorAll)return[];let y=a().query(p,b);g.includeRulesTag||(y=y.filter(x=>!cn(x)));let w=[];g.skip&&w.push(g.skip);let E=g.templateAttr===null?null:g.templateAttr||"cms-template";if(E&&w.push(`[${E}]`),w.length){let x=w.join(", ");y=y.filter(T=>!T.closest?.(x))}return y},parent(u){let p=d(u)?.parentElement;return p?m(p):null},children(u){return Array.from(d(u)?.children||[],m)},text(u,p){if(p===void 0){let y=m(u);return!y?.matches?.(r)&&!y?.querySelector?.(r)?$.text(y):(d(u)?.textContent||"").trim()}let g=m(u);if(!g?.matches?.(r)&&!g?.querySelector?.(r)&&!s){$.text(g,p);return}let b=a().cloneOf(g);b?c(g,b,"textContent",p):$.text(g,p)},attr(u,p,g){let b=m(u);if(g===void 0)return $.attr(b,p);$.attr(b,p,g);let y=s?.cloneOf(b);y&&($.attr(y,p,g),Ue(b,{capability:"data",exclude:t.exclude||null}).root===null&&(y.remove(),s.liveToClone.delete(b),s.cloneToLive.delete(y)))},removeAttr(u,p){let g=m(u);$.removeAttr(g,p);let b=s?.cloneOf(g);b&&$.removeAttr(b,p)},prop(u,p,g){let b=m(u);if(g===void 0)return p==="innerHTML"||p==="outerHTML"||p==="textContent"||p==="innerText"?$.prop(d(b),p):$.prop(b,p);let y=p==="innerHTML"||p==="textContent"||p==="innerText",w=y?a().cloneOf(b):s?.cloneOf(b);w&&y?c(b,w,p,g):($.prop(b,p,g),w&&$.prop(w,p,g))},clone(u){let p=d(u);return p===u?$.clone(u):l.importNode(p,!0)},insertAt(u,p,g){let b=m(u),w=h.children(b)[g]||(()=>{for(let T=b.children.length-1;T>=0;T--){let C=b.children[T];if(a().cloneOf(C))return C.nextElementSibling}return b.firstElementChild})(),E=m(p);b.insertBefore(E,w||null);let x=a().cloneOf(b);if(x){let T=a().cloneOf(E);T||(T=l.importNode(E,!0),f(E,T));let C=Array.from(x.children);x.insertBefore(T,C[g]||null)}},remove(u){let p=m(u),g=a().cloneOf(p);$.remove(p),g&&$.remove(g)},replaceWith(u,p){let g=m(u),b=a().cloneOf(g),y=$.replaceWith(g,p);if(b){let w=Ue(y,{capability:"data",exclude:t.exclude||null});if(!w.root)b.remove();else{b.replaceWith(w.root);let E=x=>{let T=w.original(x);T&&(s.liveToClone.set(T,x),s.cloneToLive.set(x,T));for(let C of Array.from(x.childNodes||[]))E(C)};E(w.root)}}return y}};return h}var ve=$;function Zt(e){try{return JSON.parse(e)}catch(t){throw new be(`Invalid strict JSON: ${t.message}`,t)}}function xe(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],l=0;for(;l<i.length;){let s=i[l];if(/\s/.test(s)){l++;continue}if("{}".includes(s)){o.push({type:s,value:s}),l++;continue}if(s==="["){let f=!1,c=l+1;for(;c<i.length&&/\s/.test(i[c]);)c++;if(c<i.length&&/[a-zA-Z_]/.test(i[c])&&(f=!0),!f){o.push({type:s,value:s}),l++;continue}}if(s==="]"){o.push({type:s,value:s}),l++;continue}if(s===":"){o.push({type:t.COLON,value:s}),l++;continue}if(s===","){o.push({type:t.COMMA,value:s}),l++;continue}if(s==='"'||s==="'"){let f=s,c=l+1;for(;c<i.length&&i[c]!==f;)i[c]==="\\"&&c++,c++;o.push({type:t.STRING,value:i.substring(l+1,c),quoted:!0,sourceQuote:f}),l=c+1;continue}let a=l,d;for(;a<i.length&&!/[{},]/.test(i[a]);)if(i[a]===":"){let f=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],c=!1;for(let h of f){let u=h.substring(1);if(i.substring(a+1,a+1+u.length)===u){c=!0,a+=u.length;break}}if(!c)break}else if(i[a]==="["){for(a++;a<i.length&&i[a]!=="]";){if(i[a]==='"'||i[a]==="'"){let f=i[a];for(a++;a<i.length&&i[a]!==f;)i[a]==="\\"&&a++,a++}a++}a<i.length&&i[a]==="]"&&a++}else a++;d=i.substring(l,a);let m=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(d)?m=t.NUMBER:d==="true"||d==="false"||d==="null"?m=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(d)&&(m=t.SELECTOR),o.push({type:m,value:d,quoted:!1}),l=a}return o}function n(i){let o="";for(let l=0;l<i.length;l++){let s=i[l];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let a=i[l+1];if(a&&(a.type==="}"||a.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING&&s.quoted){let a=s.value;s.sourceQuote==="'"&&(a=a.replace(/\\'/g,"'"),a=a.replace(/(\\*)"/g,(d,m)=>m.length%2===0?m+'\\"':d)),o+=`"${a}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}if(s.type===t.SELECTOR||s.type===t.IDENTIFIER){o+=`"${s.value}"`;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new be("Invalid extraction rules syntax: "+i.message,i)}}var mn="1",dn=/^[a-zA-Z0-9_-]+$/;function Be(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!dn.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${dn})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],l=e.attr(o,"data-rules-version");if(l!==mn)throw new ke(l);return{rules:xe(e.text(o)),tagNode:o}}var Vc=new Function("url","return import(url)");function bn(e,t,r,n){let i=e.length,o=t.length,l=new Array(i).fill(-1);if(n){let g=new Set;for(let b=0;b<i;b++){let y=n[b];!(y>=0&&y<o)||g.has(y)||(l[b]=y,g.add(y))}}if(i===0||o===0)return l;let s=e.map(g=>fn(g,r)),a=t.map(g=>fn(g,r)),d=new Array(o).fill(!1);for(let g of l)g>=0&&(d[g]=!0);let m=new Map;a.forEach((g,b)=>{d[b]||m.set(g,m.has(g)?-1:b)});let f=new Map;s.forEach((g,b)=>{l[b]>=0||f.set(g,(f.get(g)||0)+1)}),s.forEach((g,b)=>{if(l[b]>=0||f.get(g)!==1)return;let y=m.get(g);y===void 0||y===-1||d[y]||(l[b]=y,d[y]=!0)});let c=[];for(let g=0;g<i;g++)l[g]<0&&c.push(g);let h=[];for(let g=0;g<o;g++)d[g]||h.push(g);if(c.length===0||h.length===0)return l;let u=i*o+1,p=(g,b)=>Jo(e[g],t[b],r)*u+Math.abs(g-b);for(let[g,b]of Zo(c,h,p))l[g]=b;return l}var kn=e=>typeof e=="object"&&e!==null;function fn(e,t){if(!kn(t))return e==null?" null":String(e);let r=Object.keys(t);return JSON.stringify(r.map(n=>{let i=JSON.stringify(e?.[n]);return i===void 0?" undef":i}))}function Jo(e,t,r){if(!kn(r))return e===t?0:1;let n=Object.keys(r);if(n.length===0)return 0;let i=0;for(let o of n){let l=JSON.stringify(e?.[o]),s=JSON.stringify(t?.[o]);l!==s&&i++}return i}function Zo(e,t,r){return e.length<=t.length?gn(e,t,r,!1):gn(t,e,(n,i)=>r(i,n),!0)}function gn(e,t,r,n){let i=e.length,o=t.length,l=[];for(let f=0;f<=i;f++)l.push(new Float64Array(o+1).fill(1/0));let s=[];for(let f=0;f<=i;f++)s.push(new Uint8Array(o+1));for(let f=0;f<=o;f++)l[i][f]=0;for(let f=i-1;f>=0;f--)for(let c=o-1;c>=0;c--){let h=r(e[f],t[c])+l[f+1][c+1],u=l[f][c+1];h<=u?(l[f][c]=h,s[f][c]=1):l[f][c]=u}let a=[],d=0,m=0;for(;d<i&&m<o;)s[d][m]&&(a.push(n?[t[m],e[d]]:[e[d],t[m]]),d++),m++;return a}function er(e,t,r,n,i,o,l,s={}){let a=e.find(t,r,s);if(i.length===0){a.forEach(x=>e.remove(x)),Qt(s,"onRowsApplied",o.path,[]);return}let d=i.length>a.length,m=a[0]||null;if(d&&!m&&(m=rs(e,t,r,s),!m))throw new Pe(o.path);let f=a.map(x=>ts(e,x,n,s)),c=null;if(d&&m){c=e.clone(m),s.templateAttr&&e.removeAttr(c,s.templateAttr);let x=e.stripIds(c);x>0&&console.warn(`[hyper-html-api] stripped ${x} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let h=bn(i,f,n,Qo(e,a,i,o,s)),u=a[0]||m,p=e.parent(u),g=a.length>0?yn(e,p,u):0,b=ns(e,a),y=new Set,w=[],E=i.map((x,T)=>{let C=h[T];if(C>=0)return y.add(C),w.push(!1),a[C];w.push(!0);let H=e.clone(c);return e.stripIds(H),H});a.forEach((x,T)=>{y.has(T)||e.remove(x)}),b?E.forEach((x,T)=>{let C=g+T;e.children(p).findIndex(K=>e.sameNode(K,x))!==C&&e.insertAt(p,x,C)}):is(e,E,w,p,g),es(e,E,n,i,o,l,s),Qt(s,"onRowsApplied",o.path,E)}function Qt(e,t,r,n){if(typeof e[t]=="function")try{return e[t](r.slice(),n)}catch(i){console.warn(`[hyper-html-api] ${t} threw at "${r.join(".")||"(root)"}"`,i);return}}function Qo(e,t,r,n,i){let o=Qt(i,"identifyRows",n.path,r);if(!Array.isArray(o))return null;let l=new Array(r.length).fill(-1),s=new Set;for(let a=0;a<r.length;a++)if(o[a]){for(let d=0;d<t.length;d++)if(!(s.has(d)||!e.sameNode(t[d],o[a]))){l[a]=d,s.add(d);break}}return l}function es(e,t,r,n,i,o,l){t.forEach((s,a)=>{if(r===null){let d=n[a],m=d==null?"":String(d);e.text(s)!==m&&e.text(s,m)}else{let d=o(e,s,r,n[a],{depth:i.depth+1,path:[...i.path,a]},l);d&&d!==s&&(t[a]=d)}})}function ts(e,t,r,n){return r===null?e.text(t):ne(e,t,r,n.onRowsRead?{...n,onRowsRead:void 0}:n)}function yn(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function rs(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let l of o)if(e.attr(l,n.templateAttr)!=null)return l;i=e.parent(i)}return null}function ns(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=e.children(r),i=[];for(let o of t){let l=n.findIndex(s=>e.sameNode(s,o));if(l===-1)return!1;i.push(l)}return i.sort((o,l)=>o-l),i[i.length-1]-i[0]===i.length-1}function is(e,t,r,n,i){let o=null,l=i;for(let s=0;s<t.length;s++){if(!r[s]){o=t[s];continue}let a=o?e.parent(o):n;if(!a)continue;let d=o?yn(e,a,o)+1:l++;e.insertAt(a,t[s],d),o=t[s]}}var vn=new Set(["checked","selected","disabled","readOnly","paused"]);function we(e,t,r,n,i={}){if(Object.prototype.hasOwnProperty.call(i,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");let o=[];if(tr(r,n,[],o),o.length)throw new De(o);lt(e,t,r,n,{depth:0,path:[]},i)}function lt(e,t,r,n,i,o={}){if(i.depth>ye)throw new de(i.path);if(n===void 0)return t;if(typeof r=="string")return os(e,t,r,n,i,o);if(Array.isArray(r)){let[l,s]=r;return er(e,t,l,s,n,i,lt,o),t}if(typeof r=="object"&&r!==null){for(let[l,s]of Object.entries(r)){let a=lt(e,t,s,n==null?n:n[l],{depth:i.depth+1,path:[...i.path,l]},o);a&&a!==t&&(t=a)}return t}return t}function os(e,t,r,n,i,o){if(r.endsWith("[]")){let a=r.slice(0,-2);return er(e,t,a,null,n,i,lt,o),t}if(r.startsWith("@"))return wn(e,t,r.slice(1),n);let l=D(r);if(l!==-1){let a=r.slice(0,l),d=r.slice(l+1),m=a?e.find(t,a,o):[t];return m.length===0||wn(e,m[0],d,n),t}if(r===".")return xn(e,t,n),t;let s=e.find(t,r,o);return s.length===0||xn(e,s[0],n),t}function xn(e,t,r){let n=r==null?"":String(r);e.text(t)!==n&&e.text(t,n)}function wn(e,t,r,n){if(qe.has(r))throw new $e(r);if(r==="outerHTML"){let o=n==null?"":String(n);return e.replaceWith(t,o)}if(en.has(r)){let o=ss(r,n);return e.prop(t,r)!==o&&e.prop(t,r,o),t}let i=n==null?"":String(n);return e.attr(t,r)!==i&&e.attr(t,r,i),t}function ss(e,t){return t==null?vn.has(e)?!1:"":vn.has(e)?t==="false"?!1:!!t:t}function tr(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:Ve([...r,o]),expected:"scalar",got:He(i)})}):n.push({path:Ve(r),expected:"array",got:He(t)});return}t!==null&&typeof t=="object"&&n.push({path:Ve(r),expected:"scalar",got:He(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:Ve(r),expected:"array",got:He(t)});return}let i=e[1];t.forEach((o,l)=>tr(i,o,[...r,l],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:Ve(r),expected:"object",got:He(t)});return}for(let[i,o]of Object.entries(e))tr(o,t[i],[...r,i],n)}}}function He(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function Ve(e){return e.join(".")}function rr(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return Be(e,n,r)}return null}var V={extract:(e,t,r={})=>ne(Q(e,r),e,t,r),apply:(e,t,r,n={})=>we(Q(e,{...n,_write:!0}),e,t,r,n),findRulesIn:(e,t)=>Be(ve,e,t),findRules:(e,t)=>rr(ve,e,t),bind:(e,t,r={})=>{let n=rr(ve,e,t);if(!n){let i=typeof t=="string"?`data-rules-name~="${t}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${i}`)}return{...n,get:()=>ne(Q(e,r),e,n.rules,r),set:i=>we(Q(e,{...r,_write:!0}),e,n.rules,i,r)}},parseStrict:Zt,parseRelaxed:xe,ruleAttrIndex:D,splitRule:it,errors:st,DOM_PROPERTIES:ot};var ir={};Gt(ir,{fromString:()=>ee,getRuleAtPath:()=>me,getValueAtPath:()=>vs,setAtPath:()=>nr,toString:()=>ys});function ys(e){return e.map(String).join(".")}function ee(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function me(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function vs(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function nr(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=nr(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:nr((e||{})[n],i,r)}}function We(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=We(n);return t}return""}import xs from"./hyper-morph.vendor.js";function at(e,t,{ignoreActiveValue:r=!0}={}){xs.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property",policy:"raw"})}import{morph as Rn}from"./hyper-morph.vendor.js";var An=new WeakMap,or=e=>e.map(String).join(".");function ws(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function En(e,t){if(!e||!e.querySelector)return null;let r=e.querySelector(`[data-hcms-path="${ws(t)}"]`),n=r&&r.querySelector(".hcms-array-items");return n?Array.from(n.children).filter(i=>i.matches&&i.matches("[data-hcms-card], [data-hcms-array-item]")):null}function Sn(e,t,r){let n=En(e,t);!n||n.length!==r.length||n.forEach((i,o)=>{r[o]&&An.set(i,r[o])})}function ct(){let e=new Map;return{hooks:{onRowsRead(t,r){e.set(or(t),r)}},seed(t){for(let[r,n]of e)Sn(t,r,n);e.clear()}}}function Tn(e){return{identifyRows(t,r){let n=En(e,or(t));return!n||n.length!==r.length?null:n.map(i=>An.get(i)||null)},onRowsApplied(t,r){Sn(e,or(t),r)}}}var Cn={skip:"[data-hcms-shell]",templateAttr:"cms-template"},sr="data-hcms-rollback-ui",_s=0;function On(e,t,r,n={}){return As(e,t,r,n)}function As(e,t,r,n){let{shellRoot:i,structural:o,structuralPath:l,formRoot:s}=n,a=s?{...Cn,...Tn(s)}:Cn;if(!o)try{return V.apply(e,t,r,a),{ok:!0}}catch(c){return{ok:!1,error:c}}let d=Es(e,t,l),m=d?Ts(d):null,f=d?null:Rs(e,i);try{return V.apply(e,t,r,a),{ok:!0}}catch(c){return m?Cs(d,m):f&&Os(e,i,f),{ok:!1,error:c}}}function Es(e,t,r){if(!r||!e)return null;let n=ee(r),i=[],o=t;for(let l of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&l in o){if(i.push(l),o=o[l],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:Ss(e,t,i)}function Ss(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let l=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let s=i[l];if(s==null)return null;if(o===r.length-1){if(Array.isArray(s)){let[a]=s;return n.querySelector?.(a)?.parentElement||null}if(typeof s=="string"&&s.endsWith("[]")){let a=s.slice(0,-2);return n.querySelector?.(a)?.parentElement||null}return null}i=s}return null}function Ts(e){let t=[],r=[];for(let n of Array.from(e.childNodes))t.push(lr(n,r));return{nodes:t,retained:r}}function Cs(e,t){let r=e.cloneNode(!1);for(let n of t.nodes)r.appendChild(n);Rn(e,Array.from(r.childNodes),Nn()),Ln(e,t.retained)}function Rs(e,t){let r=[],n=[];for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||r.push(lr(i,n));return{nodes:r,retained:n}}function Os(e,t,r){let n=e.cloneNode(!1);for(let i of r.nodes)n.appendChild(i);Rn(e,Array.from(n.childNodes),Nn()),Ln(e,r.retained)}function lr(e,t){let r=e.cloneNode(!1);if(e.nodeType===1&&e.matches('[editor-ui],[clay~="editor-ui"]')){let o=String(++_s);r.setAttribute(sr,o),t.push({id:o,node:e})}let n=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,i=r.nodeType===1&&r.tagName==="TEMPLATE"?r.content:r;for(let o of Array.from(n.childNodes||[]))i.appendChild(lr(o,t));return r}function Ln(e,t){for(let{id:r,node:n}of t){let i=e.querySelector(`[${sr}="${r}"]`);i===n?n.removeAttribute(sr):n.isConnected?i?.remove():i?.replaceWith(n)}}function Nn(){return{morphStyle:"innerHTML",policy:"raw",restoreFocus:!1,scripts:{handle:!1,merge:!1}}}function mt(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var Ls='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',ar='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',Fn={"@scalar":`
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
      ${Ls}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${ar}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${ar}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${ar}</button>
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
  `},Ns=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function ut(e){let t=e.head||e.documentElement;if(t)for(let r of Ns)Pn(e,t,r)}function cr(e,t){if(!Fn[t])return null;let r=e&&(e.head||e.documentElement);return r?Pn(e,r,t):null}var Mn={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},dt={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},Ms=new Set([...Object.values(dt),"@chips","@chips-item"]);function Ke(e,t,r,n){if(typeof e!="string")return"@scalar";let i=D(e),o=ft(e,i,r,n),l=gt(o,t,"data-hcms-component");if(l&&dt[l]){let s=dt[l],a=Array.isArray(r)&&r.some(d=>d==="*"||typeof d=="number");return s==="@number"&&!jn(e,i,t,a,o).every(Fs)||(s==="@checkbox"||s==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!jn(e,i,t,a,o).every(Is)?"@scalar":s}if(i>=0){let s=e.slice(i+1);if(Mn[s])return Mn[s]}return"@scalar"}function In(e,t,r,n){if(typeof e!="string")return null;let i=D(e),o=gt(ft(e,i,r,n),t,"data-hcms-component");return o&&dt[o]||null}var js=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Fs(e){return e==null||e===""?!0:js.test(String(e))}function Is(e){return e==null||e===""||e==="true"||e==="false"}function jn(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let l=t>=0?e.slice(t+1):null,s=[];for(let a of o)if(!(a.closest&&a.closest("[cms-template], [data-hcms-shell]"))&&(l?l==="value"&&"value"in a?s.push(a.value):s.push(a.getAttribute?a.getAttribute(l):null):s.push((a.textContent||"").trim()),!n))break;return s}function ht(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function _e(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&J(r,n)||i&&i!==n&&J(r,i)||J(r,t)}function pt(e,t,r){let n=ht(e,r);if(!n)return null;let i=_e(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function qn(e,t,r,n){if(typeof e!="string")return null;let i=D(e),o=gt(ft(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let l=o.trim().split(/\s+/).filter(Boolean);return l.length?l:null}function Dn(e,t,r,n){if(typeof e!="string")return null;let i=D(e);return gt(ft(e,i,r,n),t,"data-hcms-crop")}function qs(e,t){return t>=0?e.slice(0,t):e}function ft(e,t,r,n){let i=qs(e,t);return i&&i!=="."?i:Ds(n,r)}function Ds(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function gt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function bt(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=ue(n);if(o==="scalar"){let l=Ke(n,e,i,t);Ms.has(l)&&cr(e,l);return}if(o==="scalar-array"){let l=ht(n,e);l&&(cr(e,l.array),cr(e,l.item));return}if(o==="object"){for(let[l,s]of Object.entries(n))r(s,[...i,l]);return}if(o==="object-array"){let l=n[1],s=[...i,"*"];if(l&&typeof l=="object"&&!Array.isArray(l))for(let[a,d]of Object.entries(l))r(d,[...s,a]);else r(l,s)}}}function Pn(e,t,r){let n=J(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=Fn[r].trim(),t.appendChild(i),i}function J(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${Ps(t)}"]`)}function Ps(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function ue(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Ge(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var $n={IMG:"src",A:"href"};function kt(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":$n[t]?$n[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function zn(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=kt(e),l=`${Bn(r,n)}[data-hcms-field="${Ae(t)}"]`;return r==="INPUT"&&n==="radio"?`${l}:checked@value`:i?`${l}@${i}`:l}function $s(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=kt(e),o=`${Bn(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function Bn(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Ae(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Un=new Set(["__proto__","constructor","prototype"]);function yt(e,t){return r(e,[]);function r(d,m){let f=ue(d);if(f==="scalar")return n(d,m);if(f==="scalar-array")return i(d,m);if(f==="object-array")return o(d,m);if(f==="object"){let c=Object.create(null);for(let[h,u]of Object.entries(d)){if(Un.has(h))throw new Error(`hypercms: rule key "${h}" is forbidden at "${m.join(".")||"<root>"}"`);c[h]=r(u,[...m,h])}return c}return null}function n(d,m){let f=m.length?m[m.length-1]:null,c=typeof f=="string"?f:"__value",h=a(m,c);if(h)return zn(h,c);let u=s(Ke(d,t,m,e),c);return u?zn(u,c):`input[data-hcms-field="${Ae(c)}"]@value`}function i(d,m){let f=pt(d,m,t),c=f&&s(f.item,null)||s("@scalar-array-item",null),h=c?$s(c):"input[data-hcms-field]@value";return[l(m,"[data-hcms-array-item]"),h]}function o(d,m){let[,f]=d,c=[...m,"*"],h=l(m,"[data-hcms-card]");if(f&&typeof f=="object"&&!Array.isArray(f)){let u=Object.create(null);for(let[p,g]of Object.entries(f)){if(Un.has(p))throw new Error(`hypercms: rule key "${p}" is forbidden at "${c.join(".")}"`);u[p]=r(g,[...c,p])}return[h,u]}return[h,r(f,[...c,0])]}function l(d,m){let f=d.length?d[d.length-1]:"",c=d.some(p=>p==="*"),h=d.join(".");return`${c?`[data-hcms-field="${Ae(f)}"]`:`[data-hcms-path="${Ae(h)}"]`} > .hcms-array-items > ${m}`}function s(d,m){if(!t)return null;let f=J(t,d);if(!f)return null;let c=f.content||f;if(m){let h=c.querySelector(`[data-hcms-field="${Ae(m)}"]`);if(h)return h}return c.querySelector("[data-hcms-field]")}function a(d,m){if(!t)return null;let f=d.map(u=>typeof u=="number"?"*":u).join("."),h=[d.join("."),f];for(let u=d.length-1;u>=0;u--){let p=d.slice(0,u).map(g=>typeof g=="number"?"*":g);p.push("*"),h.push(p.join("."))}for(let u of h){if(!u)continue;let p=J(t,u);if(!p||!Ge(p))continue;let g=p.content||p,b=g.querySelector(`[data-hcms-field="${Ae(m)}"]`)||g.querySelector("[data-hcms-field]");if(b)return b}return null}}function dr(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function Ee({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=mr(e,[],r,n,e);return o&&i.appendChild(o),i}function Vn({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:l}){if(e==="object-array-item")return Kn(t,r,n,i,l);if(e==="scalar-array-item")return Gn(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function mr(e,t,r,n,i){let o=ue(e);return o==="scalar"?zs(e,t,r,n,i):o==="object"?Vs(e,t,r,n,i):o==="object-array"?Ws(e,t,r,n,i):o==="scalar-array"?Ks(e,t,r,n):null}function zs(e,t,r,n,i){let o=Ke(e,n,t,i),l=_e(t,o,n);if(!l)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let s=In(e,n,t,i);s==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(s==="@checkbox"||s==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${s}" but its value isn't true/false; rendering a text input so the value is preserved`),Wn(l,s===o?s:null,t);let a=Se(l,n);Te(a,t);let d=l.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&d===o&&Us(a,e,t,r,n,o,i),o==="@image"&&d==="@image"){let m=Dn(e,n,t,i);m!=null&&!a.hasAttribute("data-hcms-crop")&&a.setAttribute("data-hcms-crop",m)}return Gs(a,te(t)),vt(a,te(t)),xt(a,te(t)),Qn(a,r),o==="@file"&&Hs(a),a}function Wn(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function Us(e,t,r,n,i,o,l){let s=qn(t,i,r,l),a=s?[...s]:[],d=n==null?"":String(n);if(d!==""&&!a.includes(d)&&a.unshift(d),!s&&(Bs(e,"data-hcms-options required (space-separated values)"),a.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let c=e.querySelector("select[data-hcms-field]");if(!c)return;for(let h of a){let u=i.createElement("option");u.value=h,u.textContent=mt(h),c.appendChild(u)}return}let m=e.querySelector(".mirk-radio");if(!m||!m.parentNode)return;let f=ur(r.join("."));for(let c of a){let h=m.cloneNode(!0),u=h.querySelector('input[type="radio"]');u&&(u.value=c,u.name=f);let p=h.querySelector(".mirk-radio__label");p&&(p.textContent=mt(c)),m.parentNode.insertBefore(h,m)}m.remove()}function ur(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function Bs(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function Hs(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=dr(t.getAttribute("href")))}function Vs(e,t,r,n,i){let o=_e(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let l=Se(o,n);if(Te(l,t),vt(l,te(t)),xt(l,te(t)),Ge(o))return ti(l,e,t),ei(l,e,r),l;let s=wt(l,".hcms-object-fields",o,t);for(let[a,d]of Object.entries(e)){let m=r==null?null:r[a],f=mr(d,[...t,a],m,n,i);f&&s.appendChild(f)}return l}function Ws(e,t,r,n,i){let o=_e(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let l=Se(o,n);Te(l,t),vt(l,te(t)),xt(l,te(t)),Xn(l,o),Zn(l,o,t);let s=wt(l,".hcms-array-items",o,t),[,a]=e;return(Array.isArray(r)?r:[]).forEach((m,f)=>{let c=Kn(a,[...t,f],m,n,i);c&&s.appendChild(c)}),Jn(l),l}function Kn(e,t,r,n,i){let o=Yn(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let l=Se(o,n);if(l.setAttribute("data-hcms-card",""),l.classList.contains("hcms-card")||l.classList.add("hcms-card"),Te(l,t),Ge(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(ti(l,e,t),ei(l,e,r)),l;let s=wt(l,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[a,d]of Object.entries(e)){let m=r==null?null:r[a],f=mr(d,[...t,a],m,n,i);f&&s.appendChild(f)}return l}function Ks(e,t,r,n){let i=ht(e,n),o=pt(e,t,n),l=i?i.array:"@scalar-array",s=_e(t,l,n);if(!s)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);Wn(s,i?i.array:null,t);let a=Se(s,n);Te(a,t),vt(a,te(t)),xt(a,te(t)),Xn(a,s),Zn(a,s,t),o&&a.setAttribute("data-hcms-item-tpl",o.item);let d=wt(a,".hcms-array-items",s,t);return(Array.isArray(r)?r:[]).forEach((f,c)=>{let h=Gn([...t,c],f,n,o?o.item:null);h&&d.appendChild(h)}),Jn(a),a}function Gn(e,t,r,n){let i=Yn(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Se(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Te(o,e),Qn(o,t),o}function Yn(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return J(r,i)||n&&J(r,n)||J(r,"@"+t)}function Se(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Te(e,t){e.setAttribute("data-hcms-path",t.join("."))}function Gs(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function vt(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function xt(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=mt(String(t)))})}function Xn(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function Jn(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Hn(e,"data-hcms-max-items"),o=Hn(e,"data-hcms-min-items"),l=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector('[data-hcms-action="add"]');d&&(d.hidden=l||i!=null&&n>=i),r.forEach((m,f)=>{let c=m.querySelector('[data-hcms-action="remove"]');c&&(c.hidden=s||o!=null&&n<=o);let h=m.querySelector('[data-hcms-action="move-up"]');h&&(h.hidden=a||f===0);let u=m.querySelector('[data-hcms-action="move-down"]');u&&(u.hidden=a||f===n-1)})}function Hn(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Zn(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function te(e){return e.length?e[e.length-1]:null}function Qn(e,t){let r=Ys(e);if(r.length!==0)for(let n of r)ri(n,t)}function Ys(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&Xs(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function Xs(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function ei(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let l=r==null?null:r[o];ri(i,l)})}function ti(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let l=[...r,o].join(".");i.setAttribute("data-hcms-path",l)})}function wt(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function ri(e,t){let r=kt(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var Js={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,onSnapshot:(e,t)=>e?.onSnapshot??t?.onSnapshot,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,upload:(e,t)=>e?.upload??(t?.uploadFileBasic?Qs(t.uploadFileBasic):null)},Zs={402:"payment-required",413:"too-large",415:"unsupported-type",401:"unauthorized",403:"forbidden",404:"not-found"},hr=()=>({ok:!1,msg:"Upload cancelled",msgType:"skipped",code:"aborted",uploads:[]});function Qs(e){return async function(r,{onProgress:n,signal:i}={}){if(i?.aborted)return hr();try{let o=await e(r,{onProgress:s=>{n?.({loaded:null,total:null,percent:s})}});if(i?.aborted)return hr();let l=o&&o.uploads||[];return typeof l[0]?.url!="string"?{ok:!1,msg:"The host accepted the file but did not say where it put it",msgType:"error",code:"bad-response",uploads:[]}:{ok:!0,msg:o.msg||"Uploaded",msgType:o.msgType||"success",code:o.code||null,uploads:l}}catch(o){if(i?.aborted)return hr();let l={};try{l=JSON.parse(o?.response||"{}")}catch{l={}}let s=l.code||Zs[o?.status]||"error";return{ok:!1,msg:o&&o.message||"Upload failed",msgType:"error",code:s,uploads:[]}}}}function z(e,t){let r=Js[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var ni=["clay:mutation-ready","hyperclay:mutation-ready"],ii=["clay:sync-applied","hyperclay:livesync-applied"],oi=["clay:ready","hyperclay:ready"];function Ce(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}var Z="data-hcms-bound",ie="data-hcms-bound-id",pr=new Map;function si(e,t){pr.set(e,t)}function li(e){pr.delete(e)}function ai(e){let t=e.getAttribute(ie);if(!t)return null;let r=pr.get(t);return!r||!r.restorable()?null:r.originalHTML}var he="data-hcms-owns-richclay";function Re(e){return e&&e.richclay&&e.richclay.RichClay||z("RichClay",e)||(e&&typeof e.RichClay=="function"?e.RichClay:null)}function ci(e,t,r){!e||typeof e.setAttribute!="function"||(e.setAttribute(Z,t?"rich":"plain"),r&&e.setAttribute(he,"true"))}function di(e,t){if(!e||typeof e.querySelectorAll!="function")return;let r=e.querySelectorAll(`[${Z}]`);if(!r.length)return;let n=Re(t);if(n&&typeof n.stripFromClone=="function")try{n.stripFromClone(e)}catch(i){console.warn("[hypercms] richclay strip failed; editor state may reach the save",i)}for(let i of r)i.getAttribute(he)==="true"&&i.removeAttribute("data-richclay"),i.removeAttribute(he),i.removeAttribute(Z)}function mi(e,t){if(!e||typeof e.removeAttribute!="function")return;let r=Re(t);if(r&&typeof r.stripElement=="function")try{r.stripElement(e)}catch(n){console.warn("[hypercms] richclay element strip failed; the clone stays editable",n)}else e.removeAttribute("contenteditable"),e.removeAttribute("no-undo");e.getAttribute(he)==="true"&&e.removeAttribute("data-richclay"),e.removeAttribute(he),e.removeAttribute(Z),e.removeAttribute(ie)}function ui(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||D(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,l]of Object.entries(n))i[o]=r(l);return i}return n}}function hi(e,t){if(!t||e==null)return e;return r(e,[t]);function r(n,i){if(typeof n=="string")return n.endsWith("[]")||D(n)!==-1?n:i.some(o=>el(o,n))?n+"@innerHTML":n;if(Array.isArray(n)){let[o,l]=n;if(typeof o!="string"||!o)return n;let s=tl(t,o);return s.length?[o,r(l,s)]:n}if(n&&typeof n=="object"){let o=Object.create(null);for(let[l,s]of Object.entries(n))o[l]=r(s,i);return o}return n}}function el(e,t){let r=null;try{r=e.querySelector(t)}catch{return!1}return r?r.hasAttribute(Z)?r.getAttribute(Z)==="rich":r.children.length>0:!1}function tl(e,t){try{return[...e.querySelectorAll(t)]}catch{return[]}}function Oe(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function oe(e,t,r=!0){if(!e||!e.querySelectorAll||(e.querySelectorAll("textarea[data-hcms-field]").forEach(Oe),r===!1))return;let n=t&&t.defaultView||(typeof window<"u"?window:null),i=Re(n);i&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(o=>{if(o.__hcmsRichclay)return;let l;try{l=new i(o,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(a){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",a);return}o.__hcmsRichclay=l;let s=l&&l.squire;s&&typeof s.addEventListener=="function"&&s.addEventListener("input",()=>{let a=n&&n.Event||Event;o.dispatchEvent(new a("input",{bubbles:!0}))})})}var fr=new WeakSet;function pe(e,t){let r=z("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function re(e){let t=z("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Et(e){let{formRoot:t}=e;if(!t||fr.has(t))return;fr.add(t);let r=l=>{let s=l.target;!s||!s.closest||s.closest("[data-hcms-form-root]")&&s.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(s.tagName==="TEXTAREA"&&Oe(s),!s.matches('input[type="file"]')&&(!s.closest("[data-hcms-field]")&&!s.hasAttribute?.("data-hcms-field")||pi(s,e)))},n=l=>{let s=l.target;if(!(!s||!s.closest)&&s.closest("[data-hcms-form-root]")){if(s.matches('input[type="file"][data-hcms-upload]')){cl(s,e);return}s.matches('input[type="checkbox"], input[type="radio"], select')&&pi(s,e)}},i=l=>{let s=l.target;if(!s||!s.closest)return;let a=s.closest("[data-hcms-action]");if(!a)return;let d=a.getAttribute("data-hcms-action");if(d==="add"||d==="remove"||d==="move-up"||d==="move-down"||d==="clear-upload"){if(!a.closest("[data-hcms-form-root]"))return}else if(d==="close"&&!a.closest("[data-hcms-shell]"))return;if(d==="add"){let m=a.closest("[data-hcms-path]");if(!m)return;let f=m.getAttribute("data-hcms-path");Ye(f,e)}else if(d==="remove"){let m=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;kr(m,e)}else if(d==="move-up"||d==="move-down"){let m=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;br(m,d==="move-up"?-1:1,e)}else d==="clear-upload"?hl(a,e):d==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),fr.delete(t)}}var rl=new Set(["value","checked"]);function nl(e,t){if(!t)return null;let r=ee(t);if(r.some(a=>typeof a=="number"||a==="*"))return null;let n=me(e.pageRules,r);if(typeof n!="string")return null;let i=V.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!rl.has(o))return null;let l=n.slice(0,i),s=l?e.pageRoot.querySelector(l):e.pageRoot;return s?{el:s,prop:o,oldValue:s[o]}:null}function pi(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=nl(t,n);if(G(W(t),{path:n,structural:!1},t),i){let o=z("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var il={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function ol(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=z("quickcrop");if(typeof n!="function")return{file:e};try{let i=typeof window<"u"&&(window.clay?.modal??window.themodal)||"auto",o=await n(e,{aspect:sl(r),modal:i,...il});return o===null?null:{file:ll(o.blob,e.name),dataURL:o.dataURL}}catch(i){return Ne(t,i&&i.message||"Crop failed"),null}}function sl(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function ll(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}var al=new Set(["unsupported","payment-required"]);async function cl(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";Ne(n,null);let o=await ol(r,n);if(!o||t.closed){se(e);return}let l=o.file,s=o.dataURL||null,a=z("upload");if(typeof a!="function")return gr(e,n,t,i,await fi(l,s,n),l);yi(n,s),gi(n,0);let d=ml(t),m;try{m=await a(l,{signal:d?.signal,onProgress:({percent:c})=>gi(n,c)})}finally{ul(t,d),fl(n)}if(t.closed){se(e);return}if(m.code==="aborted"){se(e);return}if(m.ok)return gr(e,n,t,i,m.uploads[0].url,l);if(!al.has(m.code)){Ne(n,m.msg||"Upload failed"),t.dispatch?.("hcms:error",{error:new Error(m.msg||"Upload failed"),code:m.code,path:i}),se(e);return}let f=m.code==="payment-required"?"This file is stored in the page. Add a paid plan to upload files.":null;return gr(e,n,t,i,await fi(l,s,n),l,f)}function gr(e,t,r,n,i,o,l=null){if(r.closed){se(e);return}if(yi(t,null),Ne(t,null),!i){se(e);return}ki(t,i,o.name),G(W(r),{path:n,structural:!1},r),l&&Ne(t,l,"info"),se(e)}async function fi(e,t,r){return t||await dl(e,r)}function dl(e,t){let r=t?.ownerDocument?.defaultView?.FileReader||globalThis.FileReader;return r?new Promise(n=>{let i=new r;i.onload=()=>n(typeof i.result=="string"?i.result:""),i.onerror=()=>n("");try{i.readAsDataURL(e)}catch{n("")}}):Promise.resolve("")}function ml(e){if(typeof AbortController!="function")return null;let t=new AbortController;return(e.uploads||(e.uploads=new Set)).add(t),t}function ul(e,t){t&&e.uploads?.delete(t)}function hl(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";ki(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&se(i),Ne(r,null),G(W(t),{path:n,structural:!1},t)}function pl(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function ki(e,t,r){let n=pl(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||dr(t):"")}function se(e){try{e.value=""}catch{}}function yi(e,t){let r=e.querySelector?e.querySelector(".mirk-image__frame"):null;r&&(t?r.style.backgroundImage=`url("${t.replace(/"/g,"%22")}")`:r.style.removeProperty("background-image"))}function gi(e,t){let r=Math.max(0,Math.min(100,Number(t)||0));e.setAttribute("data-hcms-uploading",""),e.style?.setProperty?.("--hcms-upload-progress",`${r}%`)}function fl(e){e.removeAttribute("data-hcms-uploading"),e.style?.removeProperty?.("--hcms-upload-progress")}function Ne(e,t,r="error"){let n=e.querySelector?e.querySelector(":scope > .hcms-error"):null;n&&(n.classList.toggle("hcms-error--info",!!t&&r==="info"),t?(n.textContent=t,n.hidden=!1):(n.textContent="",n.hidden=!0))}function Ye(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${Me(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let l=ee(e),s=vl(n,l),a=Array.isArray(s),d=typeof s=="string"&&s.endsWith("[]");if(!a&&!d)throw new Error(`hypercms: path "${e}" is not an array`);let m=At(i,"data-hcms-max-items"),f=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||m!=null&&f.length>=m)return;let c=f.length,h=a?s[1]:s.replace(/\[\]$/,""),u=We(a?h:"string"),p=Vn({shape:a?"object-array-item":"scalar-array-item",itemShape:h,pathArr:[...l,c],data:u,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(p),oe(p,t.doc,t.view?.enhanceFormRichText!==!1),vr(i),pe(`Add ${e}`,()=>G(W(t),{path:e,structural:!0},t))}function br(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),l=o.indexOf(e);if(l<0)return;let s=l+t;if(s<0||s>=o.length)return;let a=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[s]):i.insertBefore(e,o[s].nextSibling),xr(i),vr(n),a&&typeof a.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),pe(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>G(W(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var _t="Delete this item?";function gl(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||_t;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||_t:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?_t:null}function kr(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=gl(r,t);if(n==null)return Le(e,t);let i=z("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>{t.closed||Le(e,t)},()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&Le(e,t):Le(e,t)}function Le(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=At(i,"data-hcms-min-items"),l=i.querySelector(".hcms-array-items"),s=l?l.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&s<=o)return}return e.remove(),n&&xr(n),i&&vr(i),pe(`Remove ${r}`,()=>G(W(t),{path:r,structural:!0},t))}}function G(e,t,r){if(r.closed)return{ok:!1,skipped:!0,closed:!0};let n=Xe(e);if(!t.structural&&n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=Object.hasOwn(r,"writeRules")?r.writeRules:r.pageRules,o=On(r.pageRoot,i,e,{shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null,formRoot:r.formRoot});return o.ok?(r.lastFingerprint=n,r.lastData=e,bi(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(bi(r,yl(o.error,t.path)),r.dispatch?.("hcms:error",{error:o.error,attemptedData:e}),r.onError?.(o.error)),o}function St(e,t){let r=Me(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function Tt(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let l=Me(n),s=r.querySelectorAll(`[data-hcms-path="${l}"][data-hcms-field][type="radio"], [data-hcms-path="${l}"] [data-hcms-field][type="radio"]`);s.length?s.forEach(a=>{a.checked=String(a.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}function W(e){let t=V.extract(e.formRoot,e.formRules,{exclude:null});return le(t,e.formRules)}function le(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>le(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=le(e[n],i);return r}return e}function bi(e,t){e.lastErrors=t&&t.length?t:null,yr(e)}function yr(e){if(bl(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=kl(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function bl(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function kl(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,l=>"\\"+l),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let l of o.children)if(l.classList&&l.classList.contains("hcms-error"))return l}r.pop()}return null}function yl(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function vl(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function At(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function vr(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=At(e,"data-hcms-max-items"),o=At(e,"data-hcms-min-items"),l=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');d&&(d.hidden=l||i!=null&&n>=i),r.forEach((m,f)=>{let c=m.querySelector('[data-hcms-action="remove"]');c&&(c.hidden=s||o!=null&&n<=o);let h=m.querySelector('[data-hcms-action="move-up"]');h&&(h.hidden=a||f===0);let u=m.querySelector('[data-hcms-action="move-down"]');u&&(u.hidden=a||f===n-1)})}function Ct(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>xr(t))}function xr(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let l=o.join(".");l!==i&&xl(n,i,l),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function xl(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}wl(e)}function wl(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=ur(r.getAttribute("data-hcms-path")))}}function Xe(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function Me(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Rt="hcms-shell-styles",_l="hcms-bundled-styles-installed",Ot="hcms-session-open",Al='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',je=new WeakSet,wr="";function xi(e){wr=e}function Je(e){e?.body?.classList.add(Ot)}function _r(e){e?.body?.classList.remove(Ot)}var El=0;function vi(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function wi({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:l=null,doc:s}){_i(s);let a=`hcms-shell-title-${++El}`,d=s.createElement("div");d.setAttribute("data-hcms-shell",""),d.setAttribute("editor-ui",""),d.setAttribute("save-remove",""),d.setAttribute("save-ignore",""),d.setAttribute("tabindex","-1"),d.setAttribute("role","dialog"),d.setAttribute("aria-modal","true"),d.setAttribute("aria-labelledby",a);let m=l==="dark"?" dark":l==="light"?" light":"";d.className="hcms-shell pixel-quiet hcms-panel hcms-side-"+t+(r?" hcms-overlay":"")+m;let f=vi(i),c=vi(o);d.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${f}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${c}</div>
          <h2 class="hcms-shell-title" id="${a}">${f}</h2>
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
  `,(e||s.body).appendChild(d);let u=s.body;u.classList.add("hcms-open"),Je(s),r&&u.classList.add("hcms-overlay"),t==="left"&&u.classList.add("hcms-side-left");let p=Tl(d,s),g=Sl(d);return{root:d,formRoot:d.querySelector("[data-hcms-form-root]"),noticeEl:d.querySelector(".hcms-shell-notice"),errorEl:d.querySelector(".hcms-shell-error"),saveButton:d.querySelector(".hcms-shell-save"),destroy(){p.detach(),g.detach(),d.remove(),u.classList.remove("hcms-open","hcms-overlay","hcms-side-left"),_r(s)},restoreChrome(){ae(s),u.classList.add("hcms-open"),Je(s),r&&u.classList.add("hcms-overlay"),t==="left"&&u.classList.add("hcms-side-left")}}}function ae(e){e&&(e.getElementById(Rt)||e.querySelector("style[data-hcms-bundled-styles]")||(je.delete(e),_i(e)))}function _i(e){if(e&&!je.has(e)){if(e[_l]){je.add(e);return}if(e.getElementById(Rt)||e.querySelector("style[data-hcms-bundled-styles]")){je.add(e);return}if(wr){let t=e.createElement("style");t.id=Rt,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=wr,(e.head||e.documentElement).appendChild(t),je.add(e);return}try{let t=new URL("./theme.generated.css",import.meta.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Rt,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),je.add(e)}catch{let r=()=>{link.isConnected&&console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")};e.defaultView?.queueMicrotask?e.defaultView.queueMicrotask(r):r()}}}function Sl(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function Tl(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Al));if(i.length===0)return;let o=i[0],l=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),l.focus()):!n.shiftKey&&t.activeElement===l&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var Cl="[hypercms]",Ai={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Ei={skip:"[data-hcms-shell]",templateAttr:null},Ar=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Nt(e,t){let r=[],n=[],i=[];return Sr(Q(e),e,t,[],r,n,i),{missing:Si(r),twins:Ml(n),readOnly:Si(i)}}function Mt(e){return Er(e)}function Er(e){if(typeof e=="string")return Ti(e)?void 0:e;if(Array.isArray(e)){let[t,r]=e;return[t,Er(r)]}if(e&&typeof e=="object"){let t={};for(let[r,n]of Object.entries(e)){let i=Er(n);i!==void 0&&(t[r]=i)}return t}return e}function Sr(e,t,r,n,i,o,l){if(typeof r=="string"){let s=Rl(r),a=s?Lt(e,t,s,Ai,n):[];if(Ti(r)){l.push(Fe(n));return}if(!s)return;if(r.endsWith("[]")){a.length===0&&Lt(e,t,s,Ei,n).length===0&&i.push(Fe(n));return}a.length===0?i.push(Fe(n)):a.length>1&&o.push({path:Fe(n),count:a.length});return}if(Array.isArray(r)){let[s,a]=r;if(typeof s!="string"||!s)return;let d=Lt(e,t,s,Ai,n);if(d.length===0){Lt(e,t,s,Ei,n).length===0&&i.push(Fe(n));return}for(let m of d)Sr(e,m,a,[...n,"*"],i,o,l);return}if(r&&typeof r=="object")for(let[s,a]of Object.entries(r))Sr(e,t,a,[...n,s],i,o,l)}function Lt(e,t,r,n,i){try{return e.find(t,r,n)}catch(o){throw new Ar(Fe(i),r,o)}}function Rl(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=D(e);return(t===-1?e:e.slice(0,t))||null}function Ol(e){if(e.endsWith("[]"))return null;let t=D(e);return t===-1?null:e.slice(t+1)||null}function Ti(e){let t=Ol(e);return t!=null&&qe.has(t)}function Ie(e){Ll(e),Nl(e)}function Ll(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[],n=e.unresolved&&e.unresolved.readOnly||[];if(r.length===0&&n.length===0){t.textContent="",t.hidden=!0;return}let i=[];if(r.length){let o=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;i.push(`${o}: ${r.join(", ")}`)}if(n.length){let o=n.length===1?"1 field reads a property the browser will not let anything write":`${n.length} fields read properties the browser will not let anything write`;i.push(`${o}: ${n.join(", ")}`)}t.textContent=i.join(`
`),t.hidden=!1}function Nl(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${Cl} "${n}" matches ${i} elements; edits go to the first one.`)}}function Si(e){return[...new Set(e)]}function Ml(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function Fe(e){return e.length?e.join("."):"(whole page)"}var jl={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function ce(e,{ignoreActiveValue:t}={}){return Fl(e,{ignoreActiveValue:t})}function Fl(e,{ignoreActiveValue:t}){let r=V.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.view.prepareRules(r.rules),e.rulesTagNode=r.tagNode),ut(e.doc),bt(e.doc,e.pageRules),e.formRules=yt(e.pageRules,e.doc),e.writeRules=Mt(e.pageRules),e.unresolved=Nt(e.pageRoot,e.pageRules);let n=ct(),i=le(V.extract(e.pageRoot,e.pageRules,{...jl,...n.hooks}),e.pageRules),o=Ee({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});at(e.formRoot,o,{ignoreActiveValue:t}),n.seed(e.formRoot),oe(e.formRoot,e.doc,e.view?.enhanceFormRichText!==!1),yr(e),Ie(e),e.updateFingerprint&&e.updateFingerprint()}function Ci({debounce:e=100,onRefresh:t}){let r=z("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=r.onAnyChange({debounce:e},i=>{t(i)});return{unsubscribe:typeof n=="function"?n:()=>{}}}var Il='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';function Ri({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null;return{name:"sidebar",richText:n,enhanceFormRichText:!0,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,prepareRules(o){return n?ui(o,t):o},mount(o){let l=this.ctx;i=re(()=>wi({mountTo:r.mountTo||e.body,side:r.side||"right",overlay:!!r.overlay,showSaveButton:!!r.showSaveButton,title:r.title,eyebrow:r.eyebrow,theme:r.theme,doc:e})),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl;let s=Ee({pageRules:l.pageRules,formRules:l.formRules,data:o,doc:e});i.formRoot.appendChild(s),l.seeder.seed(i.formRoot),oe(i.formRoot,e),Ie(l),Et(l)},refresh(o){if(o==="livesync"){i?.restoreChrome?.(),ce(this.ctx,{ignoreActiveValue:!0});return}if(o==="undo"){ce(this.ctx,{ignoreActiveValue:!1});return}ce(this.ctx)},focusOnOpen(){let o=this.root&&this.root.querySelector(Il);o&&typeof o.focus=="function"&&o.focus()},destroy(){i?.destroy(),i=null}}}var ql="[cms-template], [data-hcms-shell]";function Ze(e){if(!e||typeof e.getBoundingClientRect!="function"||typeof e.closest=="function"&&e.closest(ql))return!1;let t=e.getBoundingClientRect();return t.width>=8&&t.height>=8}var Dl={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Pl={skip:"[data-hcms-shell]",templateAttr:null},$l="text",zl="native",Oi="handle",Ul=new Set(["INPUT","TEXTAREA","SELECT"]),Mi=new Set(["IMG","INPUT","TEXTAREA","SELECT","OPTION","BR","HR","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","CANVAS","SOURCE","TRACK","AREA","COL","PARAM","BUTTON"]);function Cr(e,t){return Bl(e,t)}function Bl(e,t){let r=[],n=[],i=Q(e);return Tr(i,e,t,[],r,n),{targets:r,lists:n}}function Tr(e,t,r,n,i,o){if(typeof r=="string"){if(r.endsWith("[]")){let m=r.slice(0,-2);if(!m)return;let f=jt(e,t,m);f.forEach((c,h)=>{i.push(Ni([...n,h],c,r,null))}),o.push(Li(e,t,n,m,f,!0));return}let l=D(r),s=l===-1?null:r.slice(l+1),a=l===-1?r:r.slice(0,l),d=!a||a==="."?t:jt(e,t,a)[0];d&&i.push(Ni(n,d,r,s));return}if(Array.isArray(r)){let[l,s]=r;if(typeof l!="string"||!l)return;let a=jt(e,t,l);a.forEach((d,m)=>Tr(e,d,s,[...n,m],i,o)),o.push(Li(e,t,n,l,a,typeof s=="string"));return}if(r&&typeof r=="object")for(let[l,s]of Object.entries(r))Tr(e,t,s,[...n,l],i,o)}function Li(e,t,r,n,i,o){let l=i[0]?i[0].parentElement:null;if(!l){let s=jt(e,t,n,Pl)[0];l=s?s.parentElement:null}return{path:r,items:i,container:l,scalar:o}}function Ni(e,t,r,n){return{path:e,el:t,rule:r,attr:n,kind:Hl(t,n),icon:Wl(t,n)}}function Hl(e,t){let r=(e.tagName||"").toUpperCase();return!t||t==="innerHTML"?Mi.has(r)?Oi:$l:t==="value"&&Ul.has(r)&&!e.readOnly&&!Vl(e)?zl:Oi}function Vl(e){return e.disabled?!0:typeof e.matches=="function"&&e.matches(":disabled")}function Wl(e,t){let r=(e.tagName||"").toUpperCase();return(!t||t==="innerHTML")&&!Mi.has(r)?null:r==="IMG"||t==="srcset"?"camera":r==="A"&&t==="href"?"paperclip":"pencil"}function jt(e,t,r,n=Dl){try{return e.find(t,r,n)}catch{return[]}}var ji=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),Kl=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),Wm=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui"]);function Rr(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function Gl(e,t){if(Rr(e,t))return!0;for(let[r,n]of Object.entries(Kl))if(n.includes(t)&&Rr(e,r))return!0;return!1}function Qe(e){let t=ji[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function Yl(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=ji[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>Gl(r,i))||n.bundles.some(i=>Rr(r,i)))return r;r=r.parentElement}return null}function Fi(e,t){return!!Yl(e,t)}var Xl=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function Ii(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();if("value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&(t.value=e.value),"checked"in e&&"checked"in t&&(t.checked=e.checked),"selected"in e&&"selected"in t&&(t.selected=e.selected),e.tagName==="SELECT")for(let n=0;n<e.options.length;n++)t.options[n].selected=e.options[n].selected;"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function qi(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function Di(e,t,r,n,i,o,l,s){if(e.nodeType===1&&((l?Fi(e,r):qi(e,n,o,!1))||i&&qi(e,i,o,l)))return null;let a=t.importNode(e,!1);s.cloneToLive.set(a,e),s.liveToClone.set(e,a);let d=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,m=a.nodeType===1&&a.tagName==="TEMPLATE"?a.content:a;d!==e&&(s.cloneToLive.set(m,d),s.liveToClone.set(d,m));for(let f of d.childNodes||[]){let c=Di(f,t,r,n,i,o,l,s);c&&(m.appendChild(c),f.nodeType===1&&Ii(f,c))}return e.nodeType===1&&Ii(e,a),a}function Or(e,{capability:t="data",exclude:r=null,inherit:n=!0}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let i=e.nodeType===9?e:e.ownerDocument;if(!i?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let o=i.implementation.createHTMLDocument(""),l=new WeakMap,s=new WeakMap,a=e.nodeType===9?e.documentElement:e;r&&o.documentElement.matches(r);let d=Qe(t),m=Di(a,o,t,d,r,a,n,{cloneToLive:l,liveToClone:s});e.nodeType===9&&m&&(o.replaceChild(m,o.documentElement),s.set(e,o),l.set(o,e));let f=c=>{if(Xl.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:m,document:o,capability:t,selector:Qe(t),cloneToLive:l,liveToClone:s,original(c){return l.get(c)||null},cloneOf(c){return s.get(c)||null},query(c,h=m){return f(c),Array.from(h.querySelectorAll(c),u=>l.get(u)||u)},text(c=m){return(c===m?m:s.get(c))?.textContent||""},html(c=m){return(c===m?m:s.get(c))?.innerHTML??""},clone(c=m){let h=c===m?m:s.get(c);return h?o.importNode(h,!0):null}}}import{morph as oa}from"./hyper-morph.vendor.js";var Jl=[16,8,0],U=8,Zl=4;function Pi({anchor:e,bar:t,rail:r=t,viewport:n,current:i=null}){let o=c=>i===c?Zl:0;if(e.bottom<=0||e.top>=n.height||e.right<=0||e.left>=n.width)return{mode:"hidden",x:0,y:0};let l=c=>Math.max(U,Math.min(e.left,n.width-c-U)),s=e.top-16-t.height;if(s>=U-o("above"))return{mode:"above",x:l(t.width),y:s};let a=e.bottom+16;if(a+t.height<=n.height-U+o("below"))return{mode:"below",x:l(t.width),y:a};let d=n.width-e.right-U,m=e.left-U,f=d>=m?[["rail-right",d],["rail-left",m]]:[["rail-left",m],["rail-right",d]];for(let[c,h]of f)for(let u of Jl){if(r.width+u>h+o(c))continue;let p=c==="rail-right"?Math.min(e.right+u,n.width-r.width-U):Math.max(e.left-u-r.width,U),g=Math.min(e.bottom,n.height-U)-r.height,b=Math.max(U,Math.min(Math.max(e.top,U),g));return{mode:c,x:p,y:b,gap:u}}return{mode:"pinned",x:l(t.width),y:U}}function Lr({anchor:e,handle:t,viewport:r,inset:n=6,prefer:i="auto"}){let o=e.height>=t.height*1.5&&e.width>=t.width*2;if(i==="corner"||o){let c=Math.max(U,Math.min(e.right-t.width+n,r.width-t.width-U)),h=Math.max(U,Math.min(e.top-n,r.height-t.height-U));return{x:c,y:h,mode:"over"}}let l=4,s=e.right+l+t.width<=r.width-U,a=s?e.right+l:e.left-l-t.width,d=Math.max(U,a),m=e.top+e.height/2-t.height/2,f=Math.max(U,Math.min(m,r.height-t.height-U));return{x:d,y:f,mode:s?"beside-right":"beside-left"}}var It=!1;function $i(){if(It)return;let e=z("onPrepareForSave");typeof e=="function"&&(e(t=>{Ui(t),zi(t)}),It=!0)}function zi(e){let t=e&&e.querySelector&&e.querySelector("body");t&&t.classList.remove("hcms-open","hcms-overlay","hcms-side-left",Ot)}function Ui(e){if(!(!e||typeof e.querySelectorAll!="function"))for(let t of e.querySelectorAll(`[${ie}]`)){let r=ai(t);r!==null&&(t.innerHTML=r),t.removeAttribute(ie)}}var qt=!1;function Dt(){if(qt)return;let e=z("onSnapshot");typeof e=="function"&&(e(t=>{Ui(t),di(t,typeof window<"u"?window:null),zi(t)}),qt=!0)}function Bi(){$i(),Dt(),(!It||!qt)&&Ql()}var Ft=null;function Ql(){if(Ft||typeof document>"u")return;Ft=Ce(document,oi,()=>{$i(),Dt(),It&&qt&&(Ft?.(),Ft=null)})}var ea={edit:"M8 10h2v6H8zm2 4h4v2h-4zm0-6h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-4 0h2v2h-2z","move-up":"M11 4h2v2h2v2h2v2h2v2h-4v-2h-2v10h-2V10H9v2H5v-2h2V8h2V6h2z","move-down":"M11 4h2v10h2v-2h4v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h4v2h2z",remove:"M5 5h3v3h3v3h2V8h3V5h3v3h-3v3h-3v2h3v3h3v3h-3v-3h-3v-3h-2v3H8v3H5v-3h3v-3h3v-2H8V8H5z",add:"M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"};function fe(e){let t=e==="edit"?"6 0 18 18":"0 0 24 24",r=e==="settings"?'<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>':`<path d="${ea[e]}"/>`;return`<svg class="hcms-inline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="${t}" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${r}</svg>`}var Hi="data-hcms-ghost",ta=Qe("history");function ra(e){let t=e.container,r=null;for(;t&&(t.namespaceURI!=="http://www.w3.org/1999/xhtml"||["SELECT","OPTGROUP","DATALIST"].includes(t.tagName));)r=t,t=t.parentElement;return{parent:t,anchor:r}}function Vi({doc:e,themeRoot:t,onAdd:r,onResize:n}){let i=e.defaultView,o=[],l=!1,s=null,a=new Map;function d(h,u,p){h.style[u]!==p&&(h.style[u]=p)}function m(){let h=new Set(o.map(u=>u.node.parentElement));for(let[u,p]of a)h.has(u)&&i?.Sortable?.get(u)===p.instance||(p.instance.option("draggable")===p.selector&&p.instance.option("draggable",p.original),a.delete(u));for(let u of h){let p=i?.Sortable?.get(u);if(!p)continue;let g=p.option("draggable");if(a.get(u)?.selector===g)continue;let b=g,w=`${b.trim().startsWith(">")?"> ":""}:is(${b.trim().replace(/^>\s*/,"")}):not(${ta})`;p.option("draggable",w),a.set(u,{instance:p,original:b,selector:w})}}function f(){for(let h of o){let{node:u,slot:p,list:g}=h,b=g.items.filter(y=>y.isConnected).map(y=>y.getBoundingClientRect()).filter(y=>y.width>0&&y.height>0);b.length&&(h.width=b.reduce((y,w)=>y+w.width,0)/b.length,h.height=b.reduce((y,w)=>y+w.height,0)/b.length),d(u,"width",h.width?`${Math.round(h.width)}px`:"100%"),d(p,"height",`${Math.max(48,Math.round(h.height||64))}px`),p!==u&&(p.colSpan=Math.max(1,...g.items.map(y=>[...y.children].reduce((w,E)=>w+(E.colSpan||1),0)))),u.hidden!==l&&(u.hidden=l)}m()}function c(h,u){let p=u.tagName,g=["TBODY","THEAD","TFOOT","TABLE"].includes(p),b=e.createElement(g?"tr":["UL","OL","MENU"].includes(p)?"li":"div");for(let x of[Hi,"data-hcms-shell","editor-ui","no-watch","no-save","save-remove","snapshot-remove"])b.setAttribute(x,"");b.setAttribute("draggable","false"),b.setAttribute("contenteditable","false"),b.className="hcms-shell pixel-quiet hcms-inline-ghost";for(let x of["light","dark"])b.classList.toggle(x,!!t?.classList.contains(x));let y=g?e.createElement("td"):b;y!==b&&(y.className="hcms-inline-ghost-cell",b.appendChild(y));let w=e.createElement("button");w.type="button",w.className="hcms-inline-list-button hcms-inline-list-add mirk-button mirk-button--small",w.setAttribute("data-hcms-list-action","add"),w.innerHTML=`<span class="mirk-button__label">${fe("add")}<span>Add</span></span>`,y.appendChild(w);let E={node:b,slot:y,button:w,list:h,width:0,height:0};w.addEventListener("click",x=>{x.preventDefault(),x.stopPropagation(),r(E.list)});for(let x of["pointerdown","mousedown","touchstart","click"])b.addEventListener(x,T=>T.stopPropagation());return b.addEventListener("dragstart",x=>{x.preventDefault(),x.stopPropagation()}),E}return{setLists(h){let u=new Set(o),p=[],g=new Set(o.map(y=>y.node)),b=new Set;for(let y of h||[]){if(!y.container||!y.container.isConnected)continue;let{parent:w,anchor:E}=ra(y);if(!w)continue;if(!b.has(w)){for(let C of w.querySelectorAll(`:scope > [${Hi}]`))g.has(C)||C.remove();b.add(w)}let x=o.find(C=>u.has(C)&&C.list.container===y.container&&C.list.path.join(".")===y.path.join("."))||c(y,w);u.delete(x),x.list=y,x.button.setAttribute("data-hcms-list",y.path.join(".")),x.button.setAttribute("aria-label",`Add to ${y.path.join(".")||"the list"}`);let T=E||y.items.filter(C=>C.parentElement===w).at(-1);T?T.nextSibling!==x.node&&T.after(x.node):x.node.parentElement!==w&&w.appendChild(x.node),p.push(x)}for(let y of u)y.node.remove();o=p,s?.disconnect(),!s&&typeof i?.ResizeObserver=="function"&&(s=new i.ResizeObserver(()=>{f(),n?.()}));for(let y of o)for(let w of y.list.items)s?.observe(w);f()},update:f,setHidden(h){l=!!h,f()},destroy(){s?.disconnect();for(let h of o)h.node.remove();o=[],m()}}}var Wi=[["move-up","Move up"],["move-down","Move down"]],na={prefer:"corner",inset:0};function ia(e,t){return t.width<=e.width&&t.height<=e.height}function Ki({doc:e,layerEl:t,onActivate:r,onListAction:n}){let i=e.defaultView,o=[],l=new Map,s=0,a=new Map,d=null,m=new Set,f=0,c=!1,h=null,u=null,p=null,g=null,b=new Map,y=!1,w=null,E=Vi({doc:e,themeRoot:t.closest("[data-hcms-shell]"),onResize:T,onAdd:k=>n?.({action:"add",list:k,index:k.items.length})}),x=e.createElement("div");x.className="hcms-inline-highlight",x.hidden=!0,x.setAttribute("aria-hidden","true"),t.appendChild(x);function T(){if(!(f||!i)){if(typeof i.requestAnimationFrame!="function")return H();f=i.requestAnimationFrame(()=>{f=0,H()})}}let C=()=>p||g;function H(){if(!i)return;E.update();let k={width:i.innerWidth,height:i.innerHeight},v=C();for(let _ of o){if(!_.visible){_.node.hidden=!0;continue}for(let M of _.members)M.node.hidden=y&&M.kind!=="handle";_.node.hidden=!1;let R=_.el.getBoundingClientRect(),S=_.node.getBoundingClientRect(),O=S.width,I=_.kind==="row"&&!ia(R,S);if(I&&_.el!==v){for(let M of _.members)M.kind==="row"&&(M.node.hidden=!0);S=_.node.getBoundingClientRect()}if(_.members.every(M=>M.node.hidden)){_.node.hidden=!0;continue}let q=_.kind==="handle"?null:na,{x:X,y:N}=Lr({anchor:R,handle:S,viewport:k,...q}),B=_.members.find(M=>M.kind==="handle");if(I&&B){let M=B.node.getBoundingClientRect(),Jr=Lr({anchor:R,handle:M,viewport:k}),Io=_.members.slice(_.members.indexOf(B)+1).filter(Kt=>!Kt.node.hidden).reduce((Kt,qo)=>Kt+qo.node.getBoundingClientRect().width+2,0);X=Math.max(8+O,Math.min(k.width-8,Jr.x+M.width+Io))-S.width,N=Jr.y}_.node.style.transform=`translate(${Math.round(X)}px, ${Math.round(N)}px)`}if(w)if(!w.node.isConnected||w.node.closest("[hidden]"))Y();else{let _=w.button.getBoundingClientRect(),R=w.menu.getBoundingClientRect();w.menu.style.left=`${Math.max(8,_.right-R.width)-_.left}px`,w.menu.style.right="auto",w.menu.style.top=_.bottom+6+R.height>k.height-8?"auto":"calc(100% + 6px)",w.menu.style.bottom=_.bottom+6+R.height>k.height-8?"calc(100% + 6px)":"auto"}j(),h?.()}function P(k){if(k?.closest?.("[data-hcms-ghost]"))return null;for(let v=k;v&&v.nodeType===1;v=v.parentElement){let _=b.get(v);if(_)return _}return null}function K(k){w&&!w.node.contains(k.target)&&Y();let v=C();g=P(k.target),g&&t.contains(k.target)&&(p=null),C()!==v&&T()}function A(k){if(k.relatedTarget||!g)return;let v=C();g=null,C()!==v&&T()}function j(){if(!u||x.hidden)return;let k=u.getBoundingClientRect();x.style.width=`${Math.round(k.width)}px`,x.style.height=`${Math.round(k.height)}px`,x.style.transform=`translate(${Math.round(k.left)}px, ${Math.round(k.top)}px)`}function ge(){if(!i||typeof i.IntersectionObserver!="function"){for(let v of o)v.visible=!0;return}d||(d=new i.IntersectionObserver(v=>{let _=!1;for(let R of v)for(let S of l.get(R.target)||[])S.visible!==R.isIntersecting&&(S.visible=R.isIntersecting,_=!0);_&&T()},{threshold:0}));let k=new Set(l.keys());for(let v of m)k.has(v)||d.unobserve(v);for(let v of k)m.has(v)||d.observe(v);m=k}function Eo(){c||!i||(i.addEventListener("scroll",T,{passive:!0,capture:!0}),i.addEventListener("resize",T,{passive:!0}),e.addEventListener("focusin",K),e.addEventListener("focusout",A),e.addEventListener("pointerdown",Gr,!0),e.addEventListener("keydown",Yr,!0),c=!0)}function So(){!c||!i||(i.removeEventListener("scroll",T,{capture:!0}),i.removeEventListener("resize",T),e.removeEventListener("focusin",K),e.removeEventListener("focusout",A),e.removeEventListener("pointerdown",Gr,!0),e.removeEventListener("keydown",Yr,!0),c=!1)}function Br(k){return`${k.kind}\0${k.attr||""}`}function Hr(k,v){return k.container===v.container&&k.scalar===v.scalar}function To(k,v){return k.kind!==v.kind?!1:k.kind==="handle"?Br(k.target)===Br(v.target):k.kind==="row"?k.row===v.row&&Hr(k.list,v.list):Hr(k.list,v.list)}function Vr(k,v){k.target=v;let _=v.path.join(".");k.node.setAttribute("data-hcms-target",_),v.icon?k.node.setAttribute("data-hcms-icon",v.icon):k.node.removeAttribute("data-hcms-icon"),k.node.setAttribute("aria-label",`Edit ${_}`)}function Co(k){let v=e.createElement("button");v.type="button",v.className="hcms-inline-handle mirk-button mirk-button--small",v.innerHTML=`<span class="mirk-button__label">${fe("edit")}</span>`;let _={node:v,kind:"handle",target:k};return Vr(_,k),v.addEventListener("click",R=>{R.preventDefault(),R.stopPropagation(),r?.(_.target,v)}),_}function Wr(k,v){let _=e.createElement("button");return _.type="button",_.className="hcms-inline-list-button mirk-button mirk-button--small",_.setAttribute("data-hcms-list-action",k),_.setAttribute("aria-label",v),_.innerHTML=`<span class="mirk-button__label">${fe(k)}${k==="add"?"<span>Add</span>":""}</span>`,_}function Kr(k,{list:v,row:_,rowIndex:R,count:S}){let O=v.path.join(".");k.list=v,k.row=_,k.index=R,k.count=S,k.node.setAttribute("data-hcms-list",O),k.node.setAttribute("data-hcms-row",String(R));for(let I of k.node.querySelectorAll("[data-hcms-list-action]")){let q=I.getAttribute("data-hcms-list-action"),X=Wi.find(([N])=>N===q)?.[1]||q;I.setAttribute("aria-label",`${X} ${O}.${R}`),I.disabled=q==="move-up"&&R===0||q==="move-down"&&R===S-1}}function Ro(k,v,_,R){let S=e.createElement("div");S.className="hcms-inline-row-controls";let O={node:S,kind:"row",list:k,row:v,index:_,count:R};for(let[I,q]of Wi){let X=Wr(I,q);X.addEventListener("click",N=>{N.preventDefault(),N.stopPropagation(),!X.disabled&&n?.({action:I,list:O.list,index:O.index,row:O.row})}),S.appendChild(X)}return Kr(O,{list:k,row:v,rowIndex:_,count:R}),O}function Y(k=!1){if(!w)return;let v=w;w=null,v.menu.hidden=!0,v.button.setAttribute("aria-expanded","false"),v.node.parentElement?.classList.remove("has-open-settings"),k&&v.button.isConnected&&v.button.focus({preventScroll:!0})}function Gr(k){w&&!w.node.contains(k.target)&&Y()}function Yr(k){w&&(k.key==="Escape"?(k.preventDefault(),k.stopPropagation(),Y(!0)):k.key==="Tab"?Y(!0):["ArrowDown","ArrowUp","Home","End"].includes(k.key)&&w.menu.contains(k.target)&&(k.preventDefault(),w.menu.querySelector('[role="menuitem"]').focus({preventScroll:!0})))}function Xr(k,{list:v,row:_,rowIndex:R}){Object.assign(k,{list:v,row:_,index:R}),k.node.setAttribute("data-hcms-list",v.path.join(".")),k.node.setAttribute("data-hcms-row",String(R)),k.button.setAttribute("aria-label",`Settings ${v.path.join(".")}.${R}`)}function Oo(k){let v=e.createElement("div");v.className="hcms-inline-settings";let _=Wr("settings","Settings");_.setAttribute("aria-haspopup","menu"),_.setAttribute("aria-expanded","false");let R=e.createElement("div");R.className="hcms-inline-settings-menu",R.setAttribute("role","menu"),R.setAttribute("aria-label","Item settings"),R.hidden=!0;let S=e.createElement("button");S.type="button",S.setAttribute("role","menuitem"),S.setAttribute("data-hcms-list-action","remove"),S.textContent="Delete",R.appendChild(S),v.append(_,R);let O={node:v,button:_,menu:R,kind:"settings"};Xr(O,k);let I=()=>{Y(),w=O,R.hidden=!1,_.setAttribute("aria-expanded","true"),v.parentElement.classList.add("has-open-settings"),S.focus({preventScroll:!0}),T()};return _.addEventListener("click",q=>{q.preventDefault(),q.stopPropagation(),w===O?Y(!0):I()}),_.addEventListener("keydown",q=>{(q.key==="ArrowDown"||q.key==="ArrowUp")&&(q.preventDefault(),I())}),S.addEventListener("click",q=>{q.preventDefault(),q.stopPropagation(),Y(!0),n?.({action:"remove",list:O.list,index:O.index,row:O.row})}),O}function Lo(k,v){k.kind==="handle"?Vr(k,v.target):k.kind==="row"?Kr(k,v):k.kind==="settings"&&Xr(k,v)}function Wt(k,v,_,R,S){let O=v.get(_)?.find(I=>I.category===S);if(!O){O={el:_,category:S,members:[]},k.push(O);let I=v.get(_);I?I.push(O):v.set(_,[O])}O.members.push(R)}function No(k,v,_){let R=_.items||[];R.forEach((S,O)=>{Ze(S)&&(Wt(k,v,S,{kind:"row",list:_,row:S,rowIndex:O,count:R.length},"item"),Wt(k,v,S,{kind:"settings",list:_,row:S,rowIndex:O},"item"))})}function Mo(k,v){let _=new Set(k.members),R=[];for(let S of v){let O=k.members.find(I=>_.has(I)&&To(I,S))||(S.kind==="handle"?Co(S.target):S.kind==="row"?Ro(S.list,S.row,S.rowIndex,S.count):Oo(S));_.delete(O),Lo(O,S),y&&O.kind!=="handle"&&(O.node.hidden=!0),R.push(O)}for(let S of _)S===w&&Y(),S.node.remove();R.sort((S,O)=>["row","handle","settings"].indexOf(S.kind)-["row","handle","settings"].indexOf(O.kind)),R.forEach((S,O)=>{k.node.children[O]!==S.node&&k.node.insertBefore(S.node,k.node.children[O]||null)}),k.members=R}function jo(k,v){let _=[],R=new Map,S=new Map,O=0;for(let N of k||[])S.has(N.el)||S.set(N.el,N),!(N.kind!=="handle"||!Ze(N.el))&&(Wt(_,R,N.el,{kind:"handle",target:N},"item"),O++);for(let N of v||[])No(_,R,N);let I=new Set(o),q=new Map;for(let N of o)q.has(N.el)||q.set(N.el,N.visible);let X=[];for(let N of _){let B=o.find(M=>I.has(M)&&M.el===N.el&&M.category===N.category);if(!B){let M=e.createElement("div");M.className="hcms-inline-item-controls",M.setAttribute("role","group"),B={el:N.el,node:M,category:N.category,kind:N.category==="add"?"add":"handle",members:[],visible:q.get(N.el)??!1},t.appendChild(M)}I.delete(B),B.el=N.el,B.category=N.category,Mo(B,N.members),B.kind=B.members.some(M=>M.kind==="row")?"row":B.members.some(M=>M.kind==="handle")?"handle":"add",B.node.setAttribute("aria-label",B.category==="add"?"List controls":"Item controls"),X.push(B)}for(let N of I)N.node.remove();o=X,l=new Map,b=new Map;for(let N of o){let B=l.get(N.el);B?B.push(N):l.set(N.el,[N]);for(let M of N.members)M.kind!=="row"&&M.kind!=="settings"||(b.set(M.row,M.row),b.set(M.node,M.row),b.set(N.node,M.row))}p&&!b.has(p)&&(p=null),g&&!b.has(g)&&(g=null),a=S,s=O}function Fo(){Y(),d?.disconnect(),d=null,m=new Set;for(let k of o)k.node.remove();o=[],l=new Map,a=new Map,b=new Map,s=0}return{setTargets(k,v){jo(k,v),E.setLists(v),ge(),Eo(),T()},refresh:T,get count(){return s},get controlsHidden(){return y},setControlsHidden(k){if(y=!!k,E.setHidden(y),y){Y();for(let v of o){for(let _ of v.members)_.kind!=="handle"&&(_.node.hidden=!0);v.members.every(_=>_.node.hidden)&&(v.node.hidden=!0)}}T()},elementToTarget(k){if(k?.closest?.("[data-hcms-ghost]"))return null;for(let v=k;v&&v.nodeType===1;v=v.parentElement){let _=a.get(v);if(_)return _}return null},setHoveredRow(k){let v=C();p=k?P(k):null,C()!==v&&T()},showHighlight(k){k&&(u=k,x.hidden=!1,j())},hideHighlight(){u=null,x.hidden=!0},setFollower(k){h=typeof k=="function"?k:null},destroy(){E.destroy(),f&&i&&i.cancelAnimationFrame(f),f=0,h=null,u=null,p=null,g=null,x.remove(),So(),Fo()}}}var sa="hypercms-inline",rt="is-hcms-inline-active",Nr="is-hcms-inline-onpath",Gi='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',la=["bold","italic","link","undo","redo"],aa=/^H[1-6]$/,ca=0;function Ji({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null,o=null,l=null,s=new Map,a=null,d=null,m=null;function f(c,h,u,p,g){let b=Re(e.defaultView);if(typeof b!="function")return null;let y=g||{},w=y.originalHTML??Or(h,{capability:"history"}).html(),E=y.richClayIsOurs??!h.hasAttribute("data-richclay"),x=y.adopted??h.getAttribute("data-richclay-active")==="true",T=et(h,p,"history"),C=da(c,b,h,p,E);if(!C)return null;ci(h,p==="innerHTML",E);let H=String(++ca);h.setAttribute(ie,H),Dt();let P={el:h,editor:C,path:u,prop:p,boundId:H,originalHTML:w,oldValue:T,richClayIsOurs:E,adopted:x,dirty:!1,written:!1,restorable(){return!this.adopted&&!this.dirty&&!this.written},lastEdited:void 0};s.set(h,P),si(H,P);let K=C.squire;if(K&&typeof K.addEventListener=="function"){let j=()=>{P.dirty=!0,P.lastEdited=et(h,P.prop,"history"),ma(c,P)};K.addEventListener("input",j),P.detachInput=()=>K.removeEventListener?.("input",j)}let A=()=>Zi(P);return h.addEventListener("blur",A),P.detachBlur=()=>h.removeEventListener("blur",A),P}return{name:"inline",richText:n,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,handoffEl:null,handoffCountEl:null,popEl:null,enhanceFormRichText:!1,prepareRules(c){return n?hi(c,t):c},bindText(c,h,u,p){return f(this.ctx,c,h,u,p)},mount(c){let h=this.ctx;i=ga(e,r.theme),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl,this.handoffEl=i.handoffEl,this.handoffCountEl=i.handoffCountEl,this.popEl=i.popEl,re(()=>Je(e));let u=Ee({pageRules:h.pageRules,formRules:h.formRules,data:c,doc:e});i.formRoot.appendChild(u),h.seeder.seed(i.formRoot),oe(i.formRoot,e,this.enhanceFormRichText),Ie(h),Et(h),o=Ki({doc:e,layerEl:i.layerEl,onActivate:(p,g)=>this.activate(p,g),onListAction:p=>this.listAction(p)}),o.setFollower(()=>this.placePopover()),i.closeEl.addEventListener("click",()=>this.deactivate()),i.toggleEl.addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),this.toggleControls()}),i.handoffEl.querySelector("[data-hcms-open-view]").addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),h.onViewRequested?.("sidebar")}),this.bindPage(),this.syncTargets()},listAction({action:c,list:h,index:u,row:p}){let g=this.ctx,b=h.path.join("."),y=g.formRoot.querySelector(`[data-hcms-path="${Me(b)}"]`);if(!y)return;if(c==="add"){Ye(b,g);return}let w=p?ka(g,b,p):u;if(w===-1)return;let E=ba(y,w);if(E){if(c==="remove"){kr(E,g),this.syncTargets();return}br(E,c==="move-up"?-1:1,g),this.syncTargets()}},toggleControls(){if(!o||!i)return;let c=!o.controlsHidden;o.setControlsHidden(c),i.toggleEl.setAttribute("aria-pressed",String(c));let h=i.toggleEl.querySelector(".mirk-button__label");h&&(h.textContent=c?"Show controls":"Hide controls")},bindPage(){let c=this.ctx.pageRoot,h=i.root,u=E=>{let x=o&&o.elementToTarget(E.target);x?o.showHighlight(x.el):o?.hideHighlight(),o?.setHoveredRow(E.target)},p=()=>{o?.hideHighlight(),o?.setHoveredRow(null)},g=E=>{if(h.contains(E.target))return;let x=o&&o.elementToTarget(E.target);!x||x.kind!=="text"||s.has(x.el)||f(this.ctx,x.el,x.path.join("."),$t(x))},b=E=>{if(h.contains(E.target))return;let x=o&&o.elementToTarget(E.target);if(!x){this.deactivate();return}(typeof E.target.closest=="function"&&E.target.closest("a[href]")||x.kind!=="text")&&E.preventDefault(),this.activate(x)},y=E=>{E.key==="Escape"&&this.deactivate()},w=E=>{let x=E.detail;if(!(!x||x.pageRoot!==this.ctx.pageRoot||!x.path))for(let T of s.values())T.path===x.path&&(T.written=!0)};c.addEventListener("pointerover",u),c.addEventListener("pointerleave",p),c.addEventListener("pointerdown",g),c.addEventListener("click",b),h.addEventListener("keydown",y),e.addEventListener("hcms:change",w),l=()=>{c.removeEventListener("pointerover",u),c.removeEventListener("pointerleave",p),c.removeEventListener("pointerdown",g),c.removeEventListener("click",b),h.removeEventListener("keydown",y),e.removeEventListener("hcms:change",w)}},activate(c,h){if(!c||!i||c.kind==="text"&&this.activateText(c))return;let u=Yi(this,i,c.path.join("."));if(!u){this.deactivate();return}a=c,d=h||null,m=null,i.popEl.hidden=!1,i.formRoot.querySelectorAll(`.${rt}`).forEach(Xi),this.placePopover(),fa(u)},activateText(c){let h=c.el,u=s.get(h);if(u)return Pt(u),!0;let p=f(this.ctx,h,c.path.join("."),$t(c));return p?(Pt(p),!0):!1},placePopover(){if(!i||!a||i.popEl.hidden)return;let c=e.defaultView;if(!c)return;let h={width:c.innerWidth,height:c.innerHeight},u=a.el.getBoundingClientRect(),p=i.popEl.getBoundingClientRect(),{mode:g,x:b,y}=Pi({anchor:u,bar:p,viewport:h,current:m});m=g,i.popEl.style.transform=`translate(${Math.round(b)}px, ${Math.round(y)}px)`},deactivate(){if(!i||!a&&i.popEl.hidden)return;i.popEl.hidden=!0,eo(i.root);let c=d;if(a=null,d=null,m=null,c&&e.contains(c)&&typeof c.focus=="function")try{c.focus({preventScroll:!0})}catch{c.focus()}},syncTargets(){if(!o)return;let c=this.ctx,{targets:h,lists:u}=Cr(c.pageRoot,c.pageRules);o.setTargets(h,u);let p=ua(this,s,h,e);if(a){let b=p.get(a.el)||[],y=b.find(w=>ha(w,a))||b.find(w=>w.path.join(".")===a.path.join("."))||(b.length===1?b[0]:null);y?a=y:this.deactivate()}pa(this.ctx,s,e);let g=h.reduce((b,y)=>b+(Ze(y.el)?0:1),0);this.handoffEl&&(this.handoffCountEl.textContent=g===0?"":`${g} ${g===1?"field isn't":"fields aren't"} visible right now.`,this.handoffEl.hidden=g===0)},refresh(c,h){c==="livesync"?(ae(e),Je(e),ce(this.ctx,{ignoreActiveValue:!0})):c==="undo"?ce(this.ctx,{ignoreActiveValue:!1}):ce(this.ctx),this.syncTargets(),(c==="livesync"||c==="undo")&&this.rebindText(c),this.restoreActive()},rebindText(c){let h=c!=="undo";for(let[u,p]of[...s]){if(!e.contains(u)){tt(this.ctx,p,{restore:!1,record:h}),s.delete(u);continue}if(u.hasAttribute(Z)){let y=et(u,p.prop);y!==p.lastEdited&&(p.oldValue=y,p.lastEdited=void 0);continue}let g=e.activeElement===u;tt(this.ctx,p,{restore:!1,record:h}),s.delete(u);let b=f(this.ctx,u,p.path,p.prop,{richClayIsOurs:p.richClayIsOurs,adopted:p.adopted});b&&g&&Pt(b)}},restoreActive(){if(!i||!a||i.popEl.hidden)return;if(!e.contains(a.el)){this.deactivate();return}if(!Yi(this,i,a.path.join("."))){this.deactivate();return}i.formRoot.querySelectorAll(`.${rt}`).forEach(Xi),this.placePopover()},focusOnOpen(){if(this.root&&typeof this.root.focus=="function")try{this.root.focus({preventScroll:!0})}catch{this.root.focus()}},destroy(){d=null,this.deactivate();for(let c of s.values())tt(this.ctx,c);s.clear(),l?.(),l=null,o?.destroy(),o=null,i?.destroy(),i=null,_r(e),this.popEl=null,this.handoffEl=null,this.handoffCountEl=null}}}function da(e,t,r,n,i){return re(()=>{let o=null;try{o=new t(r,{inline:!0,hyperclay:!1,toolbar:n==="innerHTML"?la:!1,...aa.test(r.tagName)?{singleLine:!0}:null})}catch(l){return console.warn("[hypercms] richclay activation failed; the field falls back to the popover",l),null}if(o.unsupported||!o.active){if(i)try{o.destroy()}catch{}return null}return typeof o.reattach=="function"&&o.reattach(),o})}function ma(e,{path:t,el:r,prop:n}){let i=St(e.formRoot,t);i&&(Tt(i,et(r,n),e.formRoot,t),G(W(e),{path:t,structural:!1},e))}function et(e,t,r="data"){let n=Or(e,{capability:r});return t==="innerHTML"?n.html():n.text().trim()}function Zi(e){let{el:t,prop:r,oldValue:n,lastEdited:i}=e,o=i;if(o===void 0||o===n)return;e.oldValue=o;let l=z("undo");if(!l||typeof l.recordValue!="function")return;let s={prop:r,oldValue:n,newValue:o,read:a=>et(a,r,"history"),write:(a,d)=>Qi(a,r,d)};l.isPaused?queueMicrotask(()=>{t.isConnected&&l.recordValue(t,s)}):l.recordValue(t,s)}function Qi(e,t,r){let n=e.cloneNode(!1);t==="innerHTML"?n.innerHTML=r:n.textContent=r,oa(e,Array.from(n.childNodes),{morphStyle:"innerHTML",policy:"history",restoreFocus:!1,scripts:{handle:!1,merge:!1}})}function tt(e,t,{restore:r=!0,record:n=!0}={}){n&&Zi(t),t.detachInput?.(),t.detachBlur?.(),re(()=>{if(!t.adopted){try{t.editor.destroy()}catch(i){console.warn("[hypercms] richclay teardown failed; editor state may reach the save",i)}t.richClayIsOurs&&t.el.removeAttribute("data-richclay")}t.el.removeAttribute(Z),t.el.removeAttribute(he),t.el.removeAttribute(ie),li(t.boundId),r&&t.restorable()&&Qi(t.el,"innerHTML",t.originalHTML)})}function Pt(e){let{editor:t,el:r}=e;if(r.ownerDocument.activeElement!==r)try{typeof t.focus=="function"?t.focus():r.focus()}catch{}}function ua(e,t,r,n){let i=new Map;for(let o of r){let l=i.get(o.el);l?l.push(o):i.set(o.el,[o])}for(let[o,l]of[...t]){let s=i.get(o)||[],a=s.find(c=>$t(c)===l.prop)||s[0];if(!a){tt(e.ctx,l,{restore:!0}),t.delete(o);continue}l.path=a.path.join(".");let d=$t(a);if(d===l.prop)continue;let m=n.activeElement===o;tt(e.ctx,l,{restore:!1}),t.delete(o);let f=e.bindText(o,l.path,d,{richClayIsOurs:l.richClayIsOurs,adopted:l.adopted,originalHTML:l.originalHTML});f&&m&&Pt(f)}return i}function ha(e,t){return e.el===t.el&&e.kind===t.kind&&e.attr===t.attr}function $t(e){return e.attr==="innerHTML"?"innerHTML":"textContent"}function pa(e,t,r){for(let n of e.pageRoot.querySelectorAll(`[${Z}]`))t.has(n)||re(()=>mi(n,r.defaultView))}function Yi(e,t,r){let n=e.formRoot&&e.formRoot.querySelector(`[data-hcms-path="${Me(r)}"]`);if(eo(t.root),!n)return null;let i=n.closest("[data-hcms-card]"),o=i?[...i.querySelectorAll('[data-hcms-shape="scalar"][data-hcms-path]')].filter(l=>l.closest("[data-hcms-card]")===i&&l.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]')===i.parentElement.closest('[data-hcms-shape="object-array"]')):[n];o.includes(n)||o.push(n);for(let l of o){l.classList.add(rt),l.removeAttribute("draggable");for(let s=l.parentElement;s&&(s.classList.add(Nr),s.removeAttribute("draggable"),s!==e.formRoot);s=s.parentElement);}return n}function eo(e){if(e)for(let t of e.querySelectorAll(`.${rt}, .${Nr}`))t.classList.remove(rt,Nr)}function Xi(e){e.tagName==="TEXTAREA"&&Oe(e),e.querySelectorAll?.("textarea").forEach(Oe)}function fa(e){let t=e.matches?.(Gi)?e:e.querySelector?.(Gi);if(!(!t||typeof t.focus!="function"))try{t.focus({preventScroll:!0})}catch{t.focus()}}function ga(e,t){ae(e);let r=e.createElement(sa),n=t==="dark"?" dark":t==="light"?" light":"";return r.className="hcms-shell pixel-quiet hcms-inline"+n,r.setAttribute("data-hcms-shell",""),r.setAttribute("editor-ui",""),r.setAttribute("no-save",""),r.setAttribute("save-remove",""),r.setAttribute("snapshot-remove",""),r.setAttribute("no-watch",""),r.setAttribute("tabindex","-1"),r.innerHTML=`
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
  `,e.body.appendChild(r),{root:r,formRoot:r.querySelector("[data-hcms-form-root]"),noticeEl:r.querySelector(".hcms-inline-notice"),errorEl:r.querySelector(".hcms-inline-error"),handoffEl:r.querySelector(".hcms-inline-handoff"),handoffCountEl:r.querySelector(".hcms-inline-handoff-count"),layerEl:r.querySelector(".hcms-inline-layer"),popEl:r.querySelector(".hcms-inline-pop"),closeEl:r.querySelector(".hcms-inline-pop-close"),toggleEl:r.querySelector("[data-hcms-controls-toggle]"),destroy(){r.remove()}}}function ba(e,t){let r=e.querySelector(".hcms-array-items");return r&&r.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")[t]||null}function ka(e,t,r){let{lists:n}=Cr(e.pageRoot,e.pageRules),i=n.find(o=>o.path.join(".")===t);return i?i.items.indexOf(r):-1}var ya="[hypercms]";function to(e,t){if(!e||!e.querySelectorAll||!t)return;let r=va(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${ya} template "${o}" doesn't match any rule path; ignored`))})}function va(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),l=n.map(a=>typeof a=="number"?"*":a).join(".");o&&t.add(o),l&&t.add(l);let s=ue(i);if(s==="object")for(let[a,d]of Object.entries(i))r([...n,a],d);else if(s==="object-array"||s==="scalar-array"){let a=[...n,"*"],d=a.map(m=>typeof m=="number"?"*":m).join(".");if(t.add(d),s==="object-array"){let m=i[1];if(m&&typeof m=="object"&&!Array.isArray(m))for(let[f,c]of Object.entries(m))r([...a,f],c)}}}}var no={skip:"[data-hcms-shell]",templateAttr:"cms-template"},L={isOpen:!1,ctx:null,opts:null};function io({view:e,doc:t,pageRoot:r,opts:n={},onCloseRequested:i,onViewRequested:o}){let l=n.rules!==void 0?n.rules:"cms",s=V.findRules(t,l);if(!s){let g=typeof l=="string"?`data-rules-name~="${l}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${g}`)}let a=e.prepareRules(s.rules),d=s.tagNode;ut(t),bt(t,a),to(t,a);let m=yt(a,t),f=Mt(a),c=Nt(r,a),h=ct(),u=le(V.extract(r,a,{...no,...h.hooks}),a),p={doc:t,pageRoot:r,pageRules:a,writeRules:f,formRules:m,rulesTagNode:d,rulesSource:l,richText:e.richText,view:e,seeder:h,initialData:u,get formRoot(){return e.formRoot},get shellRoot(){return e.root},get errorEl(){return e.errorEl},get noticeEl(){return e.noticeEl},unresolved:c,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:n.onChange,onError:n.onError,confirmRemove:n.confirmRemove,previouslyFocused:t.activeElement,dispatch(g,b){let y=t.defaultView&&t.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!y)return;let w={...b||{},pageRoot:r,view:e.name},E=new y(g,{bubbles:!0,cancelable:g==="hcms:change",detail:w});(e.root&&e.root.isConnected!==!1?e.root:r).dispatchEvent(E)},onCloseRequested:i,onViewRequested:o};return p.updateFingerprint=()=>{p.lastFingerprint=Xe(W(p))},e.ctx=p,p}function oo(e){e.updateFingerprint(),e.observerHandle=Ci({onRefresh:n=>e.view.refresh("observer",n)});let t=z("undo");if(t&&typeof t.on=="function"){let n=()=>{if(L.ctx!==e)return;ro(e,"undo");let i=le(V.extract(e.pageRoot,e.pageRules,no),e.pageRules);Xe(i)!==Xe(e.lastData)&&(e.lastData=i,e.onChange?.(i,{path:"",structural:!1}))};t.on("undo",n),t.on("redo",n),e.undoUnsub=()=>{t.off("undo",n),t.off("redo",n)}}let r=()=>ro(e,"livesync");e.livesyncUnsub=Ce(e.doc,ii,r),jr.ctx=e,wa(e.doc)}function ro(e,t){L.ctx===e&&e.view.refresh(t)}function zt(e,{dispatch:t=!0,restoreFocus:r=!0,updateUrl:n=!0,reason:i="close"}={}){if(!e||e.closed)return;e.closed=!0;for(let l of e.uploads||[])try{l.abort()}catch{}e.uploads?.clear();let o=e.previouslyFocused;if(t&&e.dispatch("hcms:close",{reason:i}),n&&_a(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),re(()=>e.view.destroy()),xa(),r&&typeof o?.focus=="function")try{o.focus()}catch{}}function xa(){L.isOpen=!1,L.ctx=null,L.opts=null,jr.ctx=null}var jr={ctx:null};function wa(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=jr.ctx;if(i)return Ct(i.formRoot),pe("Reorder",()=>G(W(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var Mr="cms";function so(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(Mr)!=="true"?t:(i.set(Mr,"false"),"?"+i.toString())}function lo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(Mr)==="true":!1}function _a(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=so(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}var ao="hcms-toggle",F="data-hcms-toggle-host",co="hcms-toggle-style",mo="data-hcms-toggle-style",Ut="data-hcms-session",ko="data-hcms-split",yo="hcms.view",Bt=["sidebar","inline"],Aa={sidebar:"In the sidebar",inline:"On the page"},qr="var(--hcms-toggle-bg, var(--hcms-toggle-_surface))";function uo(e){try{let t=e&&e.localStorage?e.localStorage.getItem(yo):null;return Bt.includes(t)?t:null}catch{return null}}function Ea(e,t){if(Bt.includes(t))try{e?.localStorage?.setItem(yo,t)}catch{}}var Sa="#fafafa",Ta="#0a0a0a",Ca=`
[${F}] {
  all: unset;
  box-sizing: border-box;
  display: var(--hcms-toggle-display, inline-flex);
  font-family: 'Departure Mono', ui-monospace, Menlo, monospace;
  --hcms-toggle-_surface: ${Sa};
}
[${F}][data-hcms-surface="dark"] {
  --hcms-toggle-_surface: ${Ta};
}
[${F}] .hcms-toggle__main,
[${F}] .hcms-toggle__arrow {
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
[${F}] .hcms-toggle__main:hover,
[${F}] .hcms-toggle__arrow:hover {
  border-color: var(--mirk-focus-color, #C7AE93);
  box-shadow: none;
}
[${F}] .hcms-toggle__main:active,
[${F}] .hcms-toggle__arrow:active {
  border-color: var(--mirk-bevel-br, #E2D4BF) var(--mirk-bevel-tl, #F0E7D8) var(--mirk-bevel-tl, #F0E7D8) var(--mirk-bevel-br, #E2D4BF);
}
[${F}] .hcms-toggle__main:focus-visible,
[${F}] .hcms-toggle__arrow:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -5px;
}
[${F}] .hcms-toggle__close { display: none; }
[${F}][${Ut}="open"] .hcms-toggle__open { display: none; }
[${F}][${Ut}="open"] .hcms-toggle__close { display: inline; }
[${F}][${ko}] .hcms-toggle__main {
  border-radius: 0;
  padding-right: 12px;
}
[${F}] .hcms-toggle__arrow {
  gap: 0;
  padding: 0 10px;
  border-radius: 0;
  border-left-width: 0;
}
[${F}] .hcms-toggle__menu {
  all: unset;
  box-sizing: border-box;
  min-width: 180px;
  padding: 4px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--hcms-toggle-color, currentColor);
  background: ${qr};
  border: 1px solid var(--mirk-input-border, #D8C8AF);
  border-radius: var(--mirk-radius, 5px);
  box-shadow: 0 14px 34px -14px rgba(0, 0, 0, .45);
}
[${F}] .hcms-toggle__item {
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 9px 10px;
  border-radius: 0;
  cursor: pointer;
}
[${F}] .hcms-toggle__item::before {
  content: "\u25CB";
  margin-right: 8px;
  opacity: .55;
}
[${F}] .hcms-toggle__item[aria-checked="true"]::before {
  content: "\u25CF";
  opacity: 1;
}
[${F}] .hcms-toggle__item:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}
[${F}] .hcms-toggle__item:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -3px;
}
@media (pointer: coarse) {
  [${F}] .hcms-toggle__main,
  [${F}] .hcms-toggle__arrow { min-height: 44px; }
}
`;function Ra({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),l=new URLSearchParams(o).get("editmode");return l?l==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}var Fr=new WeakMap;function vo(e,t){try{e.globalCompositeOperation="copy",e.fillStyle=t,e.fillRect(0,0,1,1);let r=e.getImageData(0,0,1,1).data;return{r:r[0],g:r[1],b:r[2],a:r[3]/255}}catch{return null}}function Oa(e){if(Fr.has(e))return Fr.get(e);let t=null;try{let r=e.createElement("canvas");if(r.width=r.height=1,t=r.getContext?r.getContext("2d",{willReadFrequently:!0}):null,t){let n=vo(t,"rgb(1, 2, 3)");(!n||n.r!==1||n.g!==2||n.b!==3||n.a!==1)&&(t=null)}}catch{t=null}return Fr.set(e,t),t}function La(e,t){let r=String(e??"").trim();if(!r)return null;let n=Na(r);if(n)return n;let i=t&&t.defaultView;if(!i||!i.CSS||typeof i.CSS.supports!="function"||!i.CSS.supports("color",r))return null;let o=Oa(t);return o?vo(o,r):null}function Na(e){let t=/rgba?\(([^)]+)\)/.exec(String(e??""));if(!t)return null;let r=t[1].split(/[\s,/]+/).filter(Boolean);if(r.length<3)return null;let n=r.slice(0,3).map(Number);if(n.some(Number.isNaN))return null;let i=r[3],o=i===void 0?1:i.endsWith("%")?Number(i.slice(0,-1))/100:Number(i);return{r:n[0],g:n[1],b:n[2],a:Number.isNaN(o)?1:o}}function ho({r:e,g:t,b:r}){let n=i=>{let o=i/255;return o<=.03928?o/12.92:((o+.055)/1.055)**2.4};return .2126*n(e)+.7152*n(t)+.0722*n(r)}function po(e,t){let r=ho(e),n=ho(t);return(Math.max(r,n)+.05)/(Math.min(r,n)+.05)}var fo={r:10,g:10,b:10},go={r:250,g:250,b:250};function bo(e,t){let r=e.a==null?1:e.a;return{r:e.r*r+t.r*(1-r),g:e.g*r+t.g*(1-r),b:e.b*r+t.b*(1-r)}}function Ma(e){if(!e)return"light";let t=po(bo(e,fo),fo),r=po(bo(e,go),go);return t>r?"dark":"light"}function nt(e,t){for(let[r,n]of Object.entries(t))e.style.setProperty(r,n,"important")}function Ir(e){let t=e.ownerDocument&&e.ownerDocument.defaultView,r=e.querySelector(".hcms-toggle__main");if(!t||!r||typeof t.getComputedStyle!="function")return;let n=La(t.getComputedStyle(r).color,e.ownerDocument);e.setAttribute("data-hcms-surface",Ma(n))}function ja(e){Ir(e);let t=e.ownerDocument,r=t&&t.defaultView;if(!r)return;let n=0,i=()=>{if(!n){if(typeof r.requestAnimationFrame!="function")return e.isConnected?Ir(e):s();n=r.requestAnimationFrame(()=>{if(n=0,!e.isConnected)return s();Ir(e)})}};typeof r.requestAnimationFrame=="function"&&i(),t.readyState!=="complete"&&r.addEventListener("load",i,{once:!0});let o=typeof r.MutationObserver=="function"?new r.MutationObserver(i):null;o&&(o.observe(t.documentElement,{attributes:!0}),t.body&&o.observe(t.body,{attributes:!0}));let l=typeof r.matchMedia=="function"?r.matchMedia("(prefers-color-scheme: dark)"):null;l&&typeof l.addEventListener=="function"&&l.addEventListener("change",i);function s(){o&&o.disconnect(),l&&typeof l.removeEventListener=="function"&&l.removeEventListener("change",i)}}function Fa({open:e,close:t,isOpen:r,getTheme:n=()=>null,views:i=Bt},o=document){let l=o.querySelector(`[${F}]`);if(l)return l;if(!o.querySelector(`[${mo}]`)){let A=o.createElement("style");A.setAttribute(mo,""),A.setAttribute("editor-ui",""),o.getElementById(co)||(A.id=co),A.setAttribute("no-save",""),A.setAttribute("snapshot-remove",""),A.setAttribute("save-ignore",""),A.textContent=Ca,o.head.insertBefore(A,o.head.firstChild)}let s=o.createElement("hypercms-toggle");s.className="hcms-shell pixel-quiet",o.getElementById(ao)||(s.id=ao),s.setAttribute(F,""),s.setAttribute("editor-ui",""),s.setAttribute("no-save",""),s.setAttribute("snapshot-remove",""),s.setAttribute("save-ignore",""),s.innerHTML='<button type="button" class="hcms-toggle__main mirk-button"><span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span></button>';let a=o.defaultView,d=s.querySelector(".hcms-toggle__main"),m=Bt.filter(A=>i.includes(A)),f=m.length>1,c=f?Ia(o):null,h=f?qa(o,m):null;f&&(s.setAttribute(ko,""),s.appendChild(c),s.appendChild(h)),nt(s,{position:"fixed",right:"calc(var(--hcms-toggle-offset, 16px) + var(--hcms-toggle-shift, 0px))",bottom:"calc(var(--hcms-toggle-offset, 16px) + env(safe-area-inset-bottom, 0px))","z-index":"var(--hcms-toggle-z, 2147482900)"}),nt(d,{background:qr}),c&&nt(c,{background:qr}),h&&nt(h,{position:"absolute",right:"0",bottom:"calc(100% + 8px)","z-index":"var(--hcms-toggle-z, 2147482900)",display:"none"});let u=()=>h?[...h.querySelectorAll('[role="menuitemradio"]')]:[];function p(A){if(!(!A||typeof A.focus!="function"))try{A.focus({preventScroll:!0})}catch{A.focus()}}function g(A){let j=u();j.length&&p(j[(A+j.length)%j.length])}function b(){let A=uo(a);for(let j of u())j.setAttribute("aria-checked",String(j.getAttribute("data-hcms-view")===A))}function y(A){s.contains(A.target)||x()}function w(A){h&&(h.hidden=!A,nt(h,{display:A?"block":"none"}),c.setAttribute("aria-expanded",String(A)),A?(b(),o.addEventListener("pointerdown",y,!0)):o.removeEventListener("pointerdown",y,!0))}function E(A=0){w(!0),g(A)}function x({focusArrow:A=!1}={}){!h||h.hidden||(w(!1),A&&p(c))}function T(){let A=uo(a);return A&&m.includes(A)?A:null}async function C(A){await e({view:A}),Ea(a,A)}async function H(){if(r()){t();return}let A=T();return A?e({view:A}):f?E():e(m[0]?{view:m[0]}:{})}async function P(A){try{await A()}catch(j){console.warn("hypercms: toggle failed to open the CMS",j)}}s.addEventListener("click",async A=>{c&&c.contains(A.target)||h&&h.contains(A.target)||await P(H)}),c&&(c.addEventListener("click",A=>{A.preventDefault(),h.hidden?E():x({focusArrow:!0})}),c.addEventListener("keydown",A=>{if(A.key==="ArrowUp"){A.preventDefault(),E(-1);return}(A.key==="ArrowDown"||A.key==="Enter"||A.key===" ")&&(A.preventDefault(),E(0))}),h.addEventListener("click",A=>{let j=A.target.closest?.('[role="menuitemradio"]');j&&(A.preventDefault(),x(),P(()=>C(j.getAttribute("data-hcms-view"))))}),h.addEventListener("keydown",A=>{let j=u(),ge=j.indexOf(o.activeElement);switch(A.key){case"ArrowDown":A.preventDefault(),g(ge+1);break;case"ArrowUp":A.preventDefault(),g(ge-1);break;case"Home":A.preventDefault(),g(0);break;case"End":A.preventDefault(),g(j.length-1);break;case"Enter":case" ":if(A.preventDefault(),ge===-1)break;x(),P(()=>C(j[ge].getAttribute("data-hcms-view")));break;case"Escape":A.preventDefault(),x({focusArrow:!0});break;case"Tab":x();break}}));let K=A=>{let j=n();s.classList.toggle("light",j==="light"),s.classList.toggle("dark",j==="dark"),A?s.setAttribute(Ut,"open"):s.removeAttribute(Ut)};return K(r()),o.addEventListener("hcms:open",()=>K(!0)),o.addEventListener("hcms:close",()=>K(!1)),o.body.appendChild(s),ae(o),ja(s),s}function Ia(e){let t=e.createElement("button");return t.type="button",t.className="hcms-toggle__arrow mirk-button",t.setAttribute("aria-haspopup","menu"),t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Choose where to edit"),t.textContent="\u25BE",t}function qa(e,t){let r=e.createElement("div");r.className="hcms-toggle__menu",r.setAttribute("role","menu"),r.setAttribute("aria-label","Where to edit"),r.hidden=!0;for(let n of t){let i=e.createElement("button");i.type="button",i.className="hcms-toggle__item",i.setAttribute("role","menuitemradio"),i.setAttribute("aria-checked","false"),i.setAttribute("data-hcms-view",n),i.tabIndex=-1,i.textContent=Aa[n],r.appendChild(i)}return r}function xo(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Ra({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Fa(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function wo(e){if(xi(e),typeof document<"u"){let t=document.getElementById("hcms-shell-styles");t?.tagName==="LINK"&&t.remove(),ae(document)}}var Pr={sidebar:Ri,inline:Ji};function Ht(e={}){let t=e.view||(L.isOpen?L.ctx.view.name:"sidebar"),r=Pr[t];if(!r)throw new Error(`hypercms: unknown view "${t}" (expected ${Object.keys(Pr).join(" or ")})`);let n=L.isOpen?{...L.opts,...e,view:t}:e,i=n.pageRoot||(typeof document<"u"?document.body:null);if(!i)throw new Error("hypercms: no pageRoot available");let o=i.ownerDocument||(typeof document<"u"?document:null);if(!o)throw new Error("hypercms: no document available");let l=null,s=null;if(L.isOpen){if(L.ctx.view.name===t)return;l=L.ctx.previouslyFocused,s=L.ctx.view.name,zt(L.ctx,{restoreFocus:!1,updateUrl:!1,reason:"switch"})}Bi();let a=r({doc:o,pageRoot:i,opts:n}),d=io({view:a,doc:o,pageRoot:i,opts:n,onCloseRequested:()=>$r(),onViewRequested:m=>Ht({view:m})});l&&(d.previouslyFocused=l);try{a.mount(d.initialData),oo(d),a.focusOnOpen(),L.isOpen=!0,L.ctx=d,L.opts=n,d.dispatch("hcms:open",{pageRoot:i,previous:s})}catch(m){throw zt(d,{dispatch:!1,restoreFocus:!!l,updateUrl:!1}),m}}function $r(){L.isOpen&&zt(L.ctx)}function _o(){L.isOpen&&L.ctx.view.refresh("api")}function Da(){return L.isOpen}function Pa(){return L.isOpen&&L.ctx?L.ctx.view.name:null}var $a={getData(){return L.isOpen?W(L.ctx):null},setValue(e,t){if(!L.isOpen)throw new Error("hypercms: cms is not open");let r=L.ctx,n=ee(e),i=me(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=St(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);Tt(o,t,r.formRoot,e),G(W(r),{path:e,structural:!1},r)},addItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");Ye(e,L.ctx)},removeItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");let t=L.ctx,r=ee(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=me(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let l=t.formRoot.querySelector(`[data-hcms-path="${Va(e)}"]`);if(!l)throw new Error(`hypercms: no element at path "${e}"`);Le(l,t)},refresh:_o,_commit(){if(!L.isOpen)return;let e=L.ctx;return Ct(e.formRoot),pe("Update",()=>G(W(e),{path:"",structural:!0},e))}},za=250,Ua=1e4;function Ba(){typeof window>"u"||typeof document>"u"||lo(window.location?window.location.search:"")&&(L.isOpen||Ha(()=>{if(!L.isOpen)try{Ht()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function Dr(){return!!document.body&&!!z("Mutation")}function Ha(e){if(Dr()){queueMicrotask(e);return}let t=Date.now()+Ua,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function l(){if(L.isOpen){o();return}Dr()&&(o(),e())}i=Ce(document,ni,l),n=setInterval(()=>{if(L.isOpen){o();return}if(Dr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},za)}Ba();xo({open:Ht,close:$r,isOpen:Da,getTheme:()=>L.opts?.theme,views:Object.keys(Pr),hasRules:e=>!!V.findRules(e,"cms")});var zr={open:Ht,close:$r,refresh:_o,api:$a,get isOpen(){return L.isOpen},currentView:Pa,path:ir,scaffold:We,morphForm:at};function Va(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Ao=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let l=n.files[0],s=document.createElement("a");if(s.className="mirk-file__name",s.dataset.filled="",s.href=URL.createObjectURL(l),s.target="_blank",s.rel="noopener",s.textContent=l.name,o.replaceWith(s),!i.querySelector(".mirk-file__remove")){let a=document.createElement("button");a.type="button",a.className="mirk-file__remove",a.setAttribute("aria-label","Remove file"),a.innerHTML=e,s.after(a)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let l=i.querySelector(".mirk-image__placeholder"),s=new FileReader;s.onload=a=>{o.src=a.target.result,o.removeAttribute("hidden"),l&&l.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},s.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),l=o?.querySelector(".mirk-file__input"),s=o?.querySelector(".mirk-file__name");if(l&&(l.value=""),s){let a=document.createElement("span");a.className="mirk-file__name",a.textContent="No file chosen",s.replaceWith(a)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),l=o?.querySelector(".mirk-image__input"),s=o?.querySelector(".mirk-image__preview");l&&(l.value=""),s&&(s.removeAttribute("src"),s.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let l=document.createElement("button");l.type="button",l.className="mirk-tags__remove",l.textContent="\xD7";let s=document.createElement("span");if(s.className="mirk-tags__chip",n){let a=document.createElement("span");a.className="mirk-tags__chip-inner",a.append(i,o,l),s.append(a)}else s.append(i,o,l);return s}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(a=>a.remove());let s=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(s).then(()=>{let a=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=a,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();wo(Ao);var Vt=zr,Ga={cms:zr};typeof window<"u"&&!window.__hyperclayNoAutoExport&&(window.hyperclay=window.hyperclay||{},window.hyperclay.hypercms=Vt,window.h=window.hyperclay);var nh=Vt,ih=Ur;export{nh as cms,ih as default};
