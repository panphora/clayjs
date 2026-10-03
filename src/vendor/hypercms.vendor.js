var Uo=Object.defineProperty;var Yt=(e,t)=>{for(var r in t)Uo(e,r,{get:t[r],enumerable:!0})};var Vr={};Yt(Vr,{cms:()=>Wt,default:()=>tc});function q(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function it(e){let t=q(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}import bc from"./hyper-morph.vendor.js";var ot=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],Xt=new Set(ot),nn=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),be=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var lt={};Yt(lt,{EmptyListInsert:()=>Pe,MAX_RULE_DEPTH:()=>ve,MaxRuleDepthExceeded:()=>de,NoRulesTag:()=>Jt,RuleTargetReadOnly:()=>$e,RulesParseError:()=>ke,ShapeMismatch:()=>qe,UnknownRulesVersion:()=>ye,WriteRefused:()=>st,WriteRejected:()=>Zt});var ke=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ye=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},ve=20,de=class extends Error{constructor(t){super(`rule depth exceeded ${ve} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},qe=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},Pe=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},$e=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}},st=class extends Error{constructor(t){super(`write refused: ${t.length} write(s) broke the content-only policy`),this.name="WriteRefused",this.refusals=t}},Jt=class extends Error{constructor(t){super(`no <script data-rules-name~="${t}"> rules tag in this document`),this.name="NoRulesTag",this.token=t}},Zt=class extends Error{constructor(t,r){super(`write rejected: ${t.length} unknown key(s), ${r.length} rule(s) with no matching element`),this.name="WriteRejected",this.unknownKeys=t,this.unmatched=r}};function ne(e,t,r,n={}){if(Object.prototype.hasOwnProperty.call(n,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");return Qt(e,t,r,{depth:0,path:[]},n)}function Qt(e,t,r,n,i){if(n.depth>ve)throw new de(n.path);if(typeof r=="string")return Go(e,t,r,n,i);if(Array.isArray(r)){let[o,l]=r,s=e.find(t,o,i);return sn(i,n,s),s.map((a,d)=>Qt(e,a,l,{depth:n.depth+1,path:[...n.path,d]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[l,s]of Object.entries(r))o[l]=Qt(e,t,s,{depth:n.depth+1,path:[...n.path,l]},i);return o}return null}function Go(e,t,r,n,i){if(r.endsWith("[]")){let s=r.slice(0,-2),a=e.find(t,s,i);return sn(i,n,a),a.map(d=>e.text(d))}if(r.startsWith("@"))return on(e,t,r.slice(1));let o=q(r);if(o!==-1){let s=r.slice(0,o),a=r.slice(o+1),d=s?e.find(t,s,i):[t];return d.length===0?null:on(e,d[0],a)}if(r===".")return e.text(t);let l=e.find(t,r,i);return l.length===0?null:e.text(l[0])}function sn(e,t,r){if(typeof e.onRowsRead=="function")try{e.onRowsRead(t.path.slice(),r)}catch(n){console.warn(`[hyper-html-api] onRowsRead threw at "${t.path.join(".")||"(root)"}"`,n)}}function on(e,t,r){if(Xt.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}var ln=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),Yo=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),an=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui"]);function er(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function Xo(e,t){if(er(e,t))return!0;for(let[r,n]of Object.entries(Yo))if(n.includes(t)&&er(e,r))return!0;return!1}function ze(e){let t=ln[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function Jo(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=ln[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>Xo(r,i))||n.bundles.some(i=>er(r,i)))return r;r=r.parentElement}return null}function cn(e,t){return!!Jo(e,t)}var Zo=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function dn(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();if("value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),e.tagName==="SELECT")for(let n=0;n<e.options.length;n++)t.options[n].selected=e.options[n].selected;"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function un(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function mn(e,t,r,n,i,o,l,s){if(e.nodeType===1&&((l?cn(e,r):un(e,n,o,!1))||i&&(l&&e!==o?e.matches(i):un(e,i,o,l))))return null;let a=t.importNode(e,!1);s.cloneToLive.set(a,e),s.liveToClone.set(e,a);let d=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,u=a.nodeType===1&&a.tagName==="TEMPLATE"?a.content:a;d!==e&&(s.cloneToLive.set(u,d),s.liveToClone.set(d,u));for(let f of d.childNodes||[]){let c=mn(f,t,r,n,i,o,l,s);c&&(u.appendChild(c),f.nodeType===1&&dn(f,c))}return e.nodeType===1&&dn(e,a),a}function Ue(e,{capability:t="data",exclude:r=null,inherit:n=!0}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let i=e.nodeType===9?e:e.ownerDocument;if(!i?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let o=i.implementation.createHTMLDocument(""),l=new WeakMap,s=new WeakMap,a=e.nodeType===9?e.documentElement:e;r&&o.documentElement.matches(r);let d=ze(t),u=mn(a,o,t,d,r,a,n,{cloneToLive:l,liveToClone:s});e.nodeType===9&&u&&(o.replaceChild(u,o.documentElement),s.set(e,o),l.set(o,e));let f=c=>{if(Zo.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:u,document:o,capability:t,selector:ze(t),cloneToLive:l,liveToClone:s,original(c){return l.get(c)||null},cloneOf(c){return s.get(c)||null},query(c,h=u){return f(c),Array.from(h.querySelectorAll(c),m=>l.get(m)||m)},text(c=u){return(c===u?u:s.get(c))?.textContent||""},html(c=u){return(c===u?u:s.get(c))?.innerHTML??""},clone(c=u){let h=c===u?u:s.get(c);return h?o.importNode(h,!0):null}}}function hn(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function Qo(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var $={semanticExclude:!0,find(e,t,r={}){let n=Qo(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(s=>!hn(s)));let o=[];r.skip&&o.push(r.skip);let l=r.templateAttr===null?null:r.templateAttr||"cms-template";if(l&&o.push("["+l+"]"),o.length){let s=o.join(", ");i=i.filter(a=>!a.closest||!a.closest(s))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}};function Q(e,t={}){if(t.exclude===null)return $;let r=[ze("data"),t.exclude].filter(Boolean).join(", "),n=e.nodeType===9?e:e.ownerDocument||e,i=e.nodeType===9?e.documentElement:e;if(!t._write&&!i?.matches?.(r)&&!i?.querySelector?.(r)&&!n?.querySelector?.(r))return $;let o=e.nodeType===9||!e.isConnected?e:e.ownerDocument,l=e.nodeType===9?e:e.ownerDocument,s=null,a=()=>s||(s=Ue(o,{capability:"data",exclude:t.exclude||null})),d=m=>{let p=a();return m===e?p.cloneOf(e):p.cloneOf(m)||m},u=m=>s?.original(m)||m,f=(m,p)=>{a().liveToClone.set(m,p),a().cloneToLive.set(p,m);let g=m.childNodes||[],b=p.childNodes||[];for(let y=0;y<Math.min(g.length,b.length);y++)f(g[y],b[y])},c=(m,p,g,b)=>{let y=Array.from(m.childNodes).filter(C=>s.cloneOf(C)),E=y[0];for(;E&&y.includes(E);)E=E.nextSibling;for(let C of y)C.remove();if(g==="innerHTML"){let C=l.createElement("template");C.innerHTML=b;for(let H of Array.from(C.content.childNodes))m.insertBefore(H,E||null)}else m.insertBefore(l.createTextNode(b),E||null);let x=Ue(m,{capability:"data",exclude:t.exclude||null});p.replaceChildren(...Array.from(x.root?.childNodes||[]));let T=C=>{let H=x.original(C);H&&(s.liveToClone.set(H,C),s.cloneToLive.set(C,H));for(let P of Array.from(C.childNodes||[]))T(P)};for(let C of Array.from(p.childNodes))T(C)},h={...$,find(m,p,g={}){let b=d(m);if(!b?.querySelectorAll)return[];let y=a().query(p,b);g.includeRulesTag||(y=y.filter(x=>!hn(x)));let w=[];g.skip&&w.push(g.skip);let E=g.templateAttr===null?null:g.templateAttr||"cms-template";if(E&&w.push(`[${E}]`),w.length){let x=w.join(", ");y=y.filter(T=>!T.closest?.(x))}return y},parent(m){let p=d(m)?.parentElement;return p?u(p):null},children(m){return Array.from(d(m)?.children||[],u)},text(m,p){if(p===void 0){let y=u(m);return!y?.matches?.(r)&&!y?.querySelector?.(r)?$.text(y):(d(m)?.textContent||"").trim()}let g=u(m);if(!g?.matches?.(r)&&!g?.querySelector?.(r)&&!s){$.text(g,p);return}let b=a().cloneOf(g);b?c(g,b,"textContent",p):$.text(g,p)},attr(m,p,g){let b=u(m);if(g===void 0)return $.attr(b,p);$.attr(b,p,g);let y=s?.cloneOf(b);y&&($.attr(y,p,g),Ue(b,{capability:"data",exclude:t.exclude||null}).root===null&&(y.remove(),s.liveToClone.delete(b),s.cloneToLive.delete(y)))},removeAttr(m,p){let g=u(m);$.removeAttr(g,p);let b=s?.cloneOf(g);b&&$.removeAttr(b,p)},prop(m,p,g){let b=u(m);if(g===void 0)return p==="innerHTML"||p==="outerHTML"||p==="textContent"||p==="innerText"?$.prop(d(b),p):$.prop(b,p);let y=p==="innerHTML"||p==="textContent"||p==="innerText",w=y?a().cloneOf(b):s?.cloneOf(b);w&&y?c(b,w,p,g):($.prop(b,p,g),w&&$.prop(w,p,g))},clone(m){let p=d(m);return p===m?$.clone(m):l.importNode(p,!0)},insertAt(m,p,g){let b=u(m),w=h.children(b)[g]||(()=>{for(let T=b.children.length-1;T>=0;T--){let C=b.children[T];if(a().cloneOf(C))return C.nextElementSibling}return b.firstElementChild})(),E=u(p);b.insertBefore(E,w||null);let x=a().cloneOf(b);if(x){let T=a().cloneOf(E);T||(T=l.importNode(E,!0),f(E,T));let C=Array.from(x.children);x.insertBefore(T,C[g]||null)}},remove(m){let p=u(m),g=a().cloneOf(p);$.remove(p),g&&$.remove(g)},replaceWith(m,p){let g=u(m),b=a().cloneOf(g),y=$.replaceWith(g,p);if(b){let w=Ue(y,{capability:"data",exclude:t.exclude||null});if(!w.root)b.remove();else{b.replaceWith(w.root);let E=x=>{let T=w.original(x);T&&(s.liveToClone.set(T,x),s.cloneToLive.set(x,T));for(let C of Array.from(x.childNodes||[]))E(C)};E(w.root)}}return y}};return h}var xe=$;function tr(e){try{return JSON.parse(e)}catch(t){throw new ke(`Invalid strict JSON: ${t.message}`,t)}}function we(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],l=0;for(;l<i.length;){let s=i[l];if(/\s/.test(s)){l++;continue}if("{}".includes(s)){o.push({type:s,value:s}),l++;continue}if(s==="["){let f=!1,c=l+1;for(;c<i.length&&/\s/.test(i[c]);)c++;if(c<i.length&&/[a-zA-Z_]/.test(i[c])&&(f=!0),!f){o.push({type:s,value:s}),l++;continue}}if(s==="]"){o.push({type:s,value:s}),l++;continue}if(s===":"){o.push({type:t.COLON,value:s}),l++;continue}if(s===","){o.push({type:t.COMMA,value:s}),l++;continue}if(s==='"'||s==="'"){let f=s,c=l+1;for(;c<i.length&&i[c]!==f;)i[c]==="\\"&&c++,c++;o.push({type:t.STRING,value:i.substring(l+1,c),quoted:!0,sourceQuote:f}),l=c+1;continue}let a=l,d;for(;a<i.length&&!/[{},]/.test(i[a]);)if(i[a]===":"){let f=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],c=!1;for(let h of f){let m=h.substring(1);if(i.substring(a+1,a+1+m.length)===m){c=!0,a+=m.length;break}}if(!c)break}else if(i[a]==="["){for(a++;a<i.length&&i[a]!=="]";){if(i[a]==='"'||i[a]==="'"){let f=i[a];for(a++;a<i.length&&i[a]!==f;)i[a]==="\\"&&a++,a++}a++}a<i.length&&i[a]==="]"&&a++}else a++;d=i.substring(l,a);let u=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(d)?u=t.NUMBER:d==="true"||d==="false"||d==="null"?u=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(d)&&(u=t.SELECTOR),o.push({type:u,value:d,quoted:!1}),l=a}return o}function n(i){let o="";for(let l=0;l<i.length;l++){let s=i[l];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let a=i[l+1];if(a&&(a.type==="}"||a.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING&&s.quoted){let a=s.value;s.sourceQuote==="'"&&(a=a.replace(/\\'/g,"'"),a=a.replace(/(\\*)"/g,(d,u)=>u.length%2===0?u+'\\"':d)),o+=`"${a}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}if(s.type===t.SELECTOR||s.type===t.IDENTIFIER){o+=`"${s.value}"`;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new ke("Invalid extraction rules syntax: "+i.message,i)}}var fn="1",pn=/^[a-zA-Z0-9_-]+$/;function Be(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!pn.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${pn})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],l=e.attr(o,"data-rules-version");if(l!==fn)throw new ye(l);return{rules:we(e.text(o)),tagNode:o}}var Jc=new Function("url","return import(url)");function xn(e,t,r,n){let i=e.length,o=t.length,l=new Array(i).fill(-1);if(n){let g=new Set;for(let b=0;b<i;b++){let y=n[b];!(y>=0&&y<o)||g.has(y)||(l[b]=y,g.add(y))}}if(i===0||o===0)return l;let s=e.map(g=>yn(g,r)),a=t.map(g=>yn(g,r)),d=new Array(o).fill(!1);for(let g of l)g>=0&&(d[g]=!0);let u=new Map;a.forEach((g,b)=>{d[b]||u.set(g,u.has(g)?-1:b)});let f=new Map;s.forEach((g,b)=>{l[b]>=0||f.set(g,(f.get(g)||0)+1)}),s.forEach((g,b)=>{if(l[b]>=0||f.get(g)!==1)return;let y=u.get(g);y===void 0||y===-1||d[y]||(l[b]=y,d[y]=!0)});let c=[];for(let g=0;g<i;g++)l[g]<0&&c.push(g);let h=[];for(let g=0;g<o;g++)d[g]||h.push(g);if(c.length===0||h.length===0)return l;let m=i*o+1,p=(g,b)=>ts(e[g],t[b],r)*m+Math.abs(g-b);for(let[g,b]of rs(c,h,p))l[g]=b;return l}var wn=e=>typeof e=="object"&&e!==null;function yn(e,t){if(!wn(t))return e==null?" null":String(e);let r=Object.keys(t);return JSON.stringify(r.map(n=>{let i=JSON.stringify(e?.[n]);return i===void 0?" undef":i}))}function ts(e,t,r){if(!wn(r))return e===t?0:1;let n=Object.keys(r);if(n.length===0)return 0;let i=0;for(let o of n){let l=JSON.stringify(e?.[o]),s=JSON.stringify(t?.[o]);l!==s&&i++}return i}function rs(e,t,r){return e.length<=t.length?vn(e,t,r,!1):vn(t,e,(n,i)=>r(i,n),!0)}function vn(e,t,r,n){let i=e.length,o=t.length,l=[];for(let f=0;f<=i;f++)l.push(new Float64Array(o+1).fill(1/0));let s=[];for(let f=0;f<=i;f++)s.push(new Uint8Array(o+1));for(let f=0;f<=o;f++)l[i][f]=0;for(let f=i-1;f>=0;f--)for(let c=o-1;c>=0;c--){let h=r(e[f],t[c])+l[f+1][c+1],m=l[f][c+1];h<=m?(l[f][c]=h,s[f][c]=1):l[f][c]=m}let a=[],d=0,u=0;for(;d<i&&u<o;)s[d][u]&&(a.push(n?[t[u],e[d]]:[e[d],t[u]]),d++),u++;return a}function nr(e,t,r,n,i,o,l,s={}){let a=e.find(t,r,s);if(i.length===0){a.forEach(x=>e.remove(x)),rr(s,"onRowsApplied",o.path,[]);return}let d=i.length>a.length,u=a[0]||null;if(d&&!u&&(u=ss(e,t,r,s),!u))throw new Pe(o.path);let f=a.map(x=>os(e,x,n,s)),c=null;if(d&&u){c=e.clone(u),s.templateAttr&&e.removeAttr(c,s.templateAttr);let x=e.stripIds(c);x>0&&console.warn(`[hyper-html-api] stripped ${x} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let h=xn(i,f,n,ns(e,a,i,o,s)),m=a[0]||u,p=e.parent(m),g=a.length>0?_n(e,p,m):0,b=ls(e,a),y=new Set,w=[],E=i.map((x,T)=>{let C=h[T];if(C>=0)return y.add(C),w.push(!1),a[C];w.push(!0);let H=e.clone(c);return e.stripIds(H),H});a.forEach((x,T)=>{y.has(T)||e.remove(x)}),b?E.forEach((x,T)=>{let C=g+T;e.children(p).findIndex(K=>e.sameNode(K,x))!==C&&e.insertAt(p,x,C)}):as(e,E,w,p,g),is(e,E,n,i,o,l,s),rr(s,"onRowsApplied",o.path,E)}function rr(e,t,r,n){if(typeof e[t]=="function")try{return e[t](r.slice(),n)}catch(i){console.warn(`[hyper-html-api] ${t} threw at "${r.join(".")||"(root)"}"`,i);return}}function ns(e,t,r,n,i){let o=rr(i,"identifyRows",n.path,r);if(!Array.isArray(o))return null;let l=new Array(r.length).fill(-1),s=new Set;for(let a=0;a<r.length;a++)if(o[a]){for(let d=0;d<t.length;d++)if(!(s.has(d)||!e.sameNode(t[d],o[a]))){l[a]=d,s.add(d);break}}return l}function is(e,t,r,n,i,o,l){t.forEach((s,a)=>{if(r===null){let d=n[a],u=d==null?"":String(d);e.text(s)!==u&&e.text(s,u)}else{let d=o(e,s,r,n[a],{depth:i.depth+1,path:[...i.path,a]},l);d&&d!==s&&(t[a]=d)}})}function os(e,t,r,n){return r===null?e.text(t):ne(e,t,r,n.onRowsRead?{...n,onRowsRead:void 0}:n)}function _n(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function ss(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let l of o)if(e.attr(l,n.templateAttr)!=null)return l;i=e.parent(i)}return null}function ls(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=e.children(r),i=[];for(let o of t){let l=n.findIndex(s=>e.sameNode(s,o));if(l===-1)return!1;i.push(l)}return i.sort((o,l)=>o-l),i[i.length-1]-i[0]===i.length-1}function as(e,t,r,n,i){let o=null,l=i;for(let s=0;s<t.length;s++){if(!r[s]){o=t[s];continue}let a=o?e.parent(o):n;if(!a)continue;let d=o?_n(e,a,o)+1:l++;e.insertAt(a,t[s],d),o=t[s]}}var An=new Set(["checked","selected","disabled","readOnly","paused"]);function _e(e,t,r,n,i={}){if(Object.prototype.hasOwnProperty.call(i,"exclude")&&e.semanticExclude===!1)throw new Error("This adapter does not support semantic exclude queries; omit exclude or use the DOM adapter.");let o=[];if(ir(r,n,[],o),o.length)throw new qe(o);at(e,t,r,n,{depth:0,path:[]},i)}function at(e,t,r,n,i,o={}){if(i.depth>ve)throw new de(i.path);if(n===void 0)return t;if(typeof r=="string")return cs(e,t,r,n,i,o);if(Array.isArray(r)){let[l,s]=r;return nr(e,t,l,s,n,i,at,o),t}if(typeof r=="object"&&r!==null){for(let[l,s]of Object.entries(r)){let a=at(e,t,s,n==null?n:n[l],{depth:i.depth+1,path:[...i.path,l]},o);a&&a!==t&&(t=a)}return t}return t}function cs(e,t,r,n,i,o){if(r.endsWith("[]")){let a=r.slice(0,-2);return nr(e,t,a,null,n,i,at,o),t}if(r.startsWith("@"))return Sn(e,t,r.slice(1),n);let l=q(r);if(l!==-1){let a=r.slice(0,l),d=r.slice(l+1),u=a?e.find(t,a,o):[t];return u.length===0||Sn(e,u[0],d,n),t}if(r===".")return En(e,t,n),t;let s=e.find(t,r,o);return s.length===0||En(e,s[0],n),t}function En(e,t,r){let n=r==null?"":String(r);e.text(t)!==n&&e.text(t,n)}function Sn(e,t,r,n){if(be.has(r)){let o=e.prop(t,r);if(o===n||o!=null&&n!=null&&String(o)===String(n))return t;throw new $e(r)}if(r==="outerHTML"){let o=n==null?"":String(n);return e.replaceWith(t,o)}if(nn.has(r)){let o=ds(r,n);return e.prop(t,r)!==o&&e.prop(t,r,o),t}let i=n==null?"":String(n);return e.attr(t,r)!==i&&e.attr(t,r,i),t}function ds(e,t){return t==null?An.has(e)?!1:"":An.has(e)?t==="false"?!1:!!t:t}function ir(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:Ve([...r,o]),expected:"scalar",got:He(i)})}):n.push({path:Ve(r),expected:"array",got:He(t)});return}t!==null&&typeof t=="object"&&n.push({path:Ve(r),expected:"scalar",got:He(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:Ve(r),expected:"array",got:He(t)});return}let i=e[1];t.forEach((o,l)=>ir(i,o,[...r,l],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:Ve(r),expected:"object",got:He(t)});return}for(let[i,o]of Object.entries(e))ir(o,t[i],[...r,i],n)}}}function He(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function Ve(e){return e.join(".")}var ws=Object.freeze({refusedRuleForms:["innerHTML","outerHTML"],refusedTargets:["script","style","template","noscript","iframe","object","embed","xmp","plaintext","noembed","noframes","meta","link","base","animate","set","animatemotion","animatetransform"],refusedAttributes:["style","srcdoc","is","http-equiv","sandbox","allow","nonce","integrity","charset","htmlclaytoken","htmlclayid","data-rules-name","data-rules-version","clay","contenteditable",...an],refusedAttributePrefixes:["on"],urlAttributes:["href","src","srcset","action","formaction","poster","cite","data","ping","background","longdesc","usemap","xlink:href","manifest","codebase","icon"],refusedSchemes:["javascript","vbscript","data"]});function or(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return Be(e,n,r)}return null}var V={extract:(e,t,r={})=>ne(Q(e,r),e,t,r),apply:(e,t,r,n={})=>_e(Q(e,{...n,_write:!0}),e,t,r,n),findRulesIn:(e,t)=>Be(xe,e,t),findRules:(e,t)=>or(xe,e,t),bind:(e,t,r={})=>{let n=or(xe,e,t);if(!n){let i=typeof t=="string"?`data-rules-name~="${t}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${i}`)}return{...n,get:()=>ne(Q(e,r),e,n.rules,r),set:i=>_e(Q(e,{...r,_write:!0}),e,n.rules,i,r)}},parseStrict:tr,parseRelaxed:we,ruleAttrIndex:q,splitRule:it,errors:lt,DOM_PROPERTIES:ot};var lr={};Yt(lr,{fromString:()=>ee,getRuleAtPath:()=>ue,getValueAtPath:()=>Ts,setAtPath:()=>sr,toString:()=>Ss});function Ss(e){return e.map(String).join(".")}function ee(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function ue(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Ts(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function sr(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=sr(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:sr((e||{})[n],i,r)}}function We(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=We(n);return t}return""}import Cs from"./hyper-morph.vendor.js";function ct(e,t,{ignoreActiveValue:r=!0}={}){Cs.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property",policy:"raw"})}import{morph as Mn}from"./hyper-morph.vendor.js";var Cn=new WeakMap,ar=e=>e.map(String).join(".");function Rs(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function Rn(e,t){if(!e||!e.querySelector)return null;let r=e.querySelector(`[data-hcms-path="${Rs(t)}"]`),n=r&&r.querySelector(".hcms-array-items");return n?Array.from(n.children).filter(i=>i.matches&&i.matches("[data-hcms-card], [data-hcms-array-item]")):null}function On(e,t,r){let n=Rn(e,t);!n||n.length!==r.length||n.forEach((i,o)=>{r[o]&&Cn.set(i,r[o])})}function dt(){let e=new Map;return{hooks:{onRowsRead(t,r){e.set(ar(t),r)}},seed(t){for(let[r,n]of e)On(t,r,n);e.clear()}}}function Ln(e){return{identifyRows(t,r){let n=Rn(e,ar(t));return!n||n.length!==r.length?null:n.map(i=>Cn.get(i)||null)},onRowsApplied(t,r){On(e,ar(t),r)}}}var Nn={skip:"[data-hcms-shell]",templateAttr:"cms-template"},cr="data-hcms-rollback-ui",Os=0;function jn(e,t,r,n={}){return Ls(e,t,r,n)}function Ls(e,t,r,n){let{shellRoot:i,structural:o,structuralPath:l,formRoot:s}=n,a=s?{...Nn,...Ln(s)}:Nn;if(!o)try{return V.apply(e,t,r,a),{ok:!0}}catch(c){return{ok:!1,error:c}}let d=Ns(e,t,l),u=d?js(d):null,f=d?null:Fs(e,i);try{return V.apply(e,t,r,a),{ok:!0}}catch(c){return u?Is(d,u):f&&Ds(e,i,f),{ok:!1,error:c}}}function Ns(e,t,r){if(!r||!e)return null;let n=ee(r),i=[],o=t;for(let l of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&l in o){if(i.push(l),o=o[l],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:Ms(e,t,i)}function Ms(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let l=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let s=i[l];if(s==null)return null;if(o===r.length-1){if(Array.isArray(s)){let[a]=s;return n.querySelector?.(a)?.parentElement||null}if(typeof s=="string"&&s.endsWith("[]")){let a=s.slice(0,-2);return n.querySelector?.(a)?.parentElement||null}return null}i=s}return null}function js(e){let t=[],r=[];for(let n of Array.from(e.childNodes))t.push(dr(n,r));return{nodes:t,retained:r}}function Is(e,t){let r=e.cloneNode(!1);for(let n of t.nodes)r.appendChild(n);Mn(e,Array.from(r.childNodes),Fn()),In(e,t.retained)}function Fs(e,t){let r=[],n=[];for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||r.push(dr(i,n));return{nodes:r,retained:n}}function Ds(e,t,r){let n=e.cloneNode(!1);for(let i of r.nodes)n.appendChild(i);Mn(e,Array.from(n.childNodes),Fn()),In(e,r.retained)}function dr(e,t){let r=e.cloneNode(!1);if(e.nodeType===1&&e.matches('[editor-ui],[clay~="editor-ui"]')){let o=String(++Os);r.setAttribute(cr,o),t.push({id:o,node:e})}let n=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,i=r.nodeType===1&&r.tagName==="TEMPLATE"?r.content:r;for(let o of Array.from(n.childNodes||[]))i.appendChild(dr(o,t));return r}function In(e,t){for(let{id:r,node:n}of t){let i=e.querySelector(`[${cr}="${r}"]`);i===n?n.removeAttribute(cr):n.isConnected?i?.remove():i?.replaceWith(n)}}function Fn(){return{morphStyle:"innerHTML",policy:"raw",restoreFocus:!1,scripts:{handle:!1,merge:!1}}}function mt(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var qs='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',ur='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',Pn={"@scalar":`
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
      ${qs}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${ur}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${ur}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${ur}</button>
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
  `},Ps=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function ht(e){let t=e.head||e.documentElement;if(t)for(let r of Ps)Bn(e,t,r)}function mr(e,t){if(!Pn[t])return null;let r=e&&(e.head||e.documentElement);return r?Bn(e,r,t):null}var Dn={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},ut={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},$s=new Set([...Object.values(ut),"@chips","@chips-item"]);function Ke(e,t,r,n){if(typeof e!="string")return"@scalar";let i=q(e),o=gt(e,i,r,n),l=bt(o,t,"data-hcms-component");if(l&&ut[l]){let s=ut[l],a=Array.isArray(r)&&r.some(d=>d==="*"||typeof d=="number");return s==="@number"&&!qn(e,i,t,a,o).every(Us)||(s==="@checkbox"||s==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!qn(e,i,t,a,o).every(Bs)?"@scalar":s}if(i>=0){let s=e.slice(i+1);if(Dn[s])return Dn[s]}return"@scalar"}function $n(e,t,r,n){if(typeof e!="string")return null;let i=q(e),o=bt(gt(e,i,r,n),t,"data-hcms-component");return o&&ut[o]||null}var zs=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Us(e){return e==null||e===""?!0:zs.test(String(e))}function Bs(e){return e==null||e===""||e==="true"||e==="false"}function qn(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let l=t>=0?e.slice(t+1):null,s=[];for(let a of o)if(!(a.closest&&a.closest("[cms-template], [data-hcms-shell]"))&&(l?l==="value"&&"value"in a?s.push(a.value):s.push(a.getAttribute?a.getAttribute(l):null):s.push((a.textContent||"").trim()),!n))break;return s}function pt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function Ae(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&J(r,n)||i&&i!==n&&J(r,i)||J(r,t)}function ft(e,t,r){let n=pt(e,r);if(!n)return null;let i=Ae(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function zn(e,t,r,n){if(typeof e!="string")return null;let i=q(e),o=bt(gt(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let l=o.trim().split(/\s+/).filter(Boolean);return l.length?l:null}function Un(e,t,r,n){if(typeof e!="string")return null;let i=q(e);return bt(gt(e,i,r,n),t,"data-hcms-crop")}function Hs(e,t){return t>=0?e.slice(0,t):e}function gt(e,t,r,n){let i=Hs(e,t);return i&&i!=="."?i:Vs(n,r)}function Vs(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function bt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function kt(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=me(n);if(o==="scalar"){let l=Ke(n,e,i,t);$s.has(l)&&mr(e,l);return}if(o==="scalar-array"){let l=pt(n,e);l&&(mr(e,l.array),mr(e,l.item));return}if(o==="object"){for(let[l,s]of Object.entries(n))r(s,[...i,l]);return}if(o==="object-array"){let l=n[1],s=[...i,"*"];if(l&&typeof l=="object"&&!Array.isArray(l))for(let[a,d]of Object.entries(l))r(d,[...s,a]);else r(l,s)}}}function Bn(e,t,r){let n=J(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=Pn[r].trim(),t.appendChild(i),i}function J(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${Ws(t)}"]`)}function Ws(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function me(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Ge(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var Hn={IMG:"src",A:"href"};function yt(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":Hn[t]?Hn[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function Vn(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=yt(e),l=`${Kn(r,n)}[data-hcms-field="${Ee(t)}"]`;return r==="INPUT"&&n==="radio"?`${l}:checked@value`:i?`${l}@${i}`:l}function Ks(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=yt(e),o=`${Kn(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function Kn(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Ee(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Wn=new Set(["__proto__","constructor","prototype"]);function vt(e,t){return r(e,[]);function r(d,u){let f=me(d);if(f==="scalar")return n(d,u);if(f==="scalar-array")return i(d,u);if(f==="object-array")return o(d,u);if(f==="object"){let c=Object.create(null);for(let[h,m]of Object.entries(d)){if(Wn.has(h))throw new Error(`hypercms: rule key "${h}" is forbidden at "${u.join(".")||"<root>"}"`);c[h]=r(m,[...u,h])}return c}return null}function n(d,u){let f=u.length?u[u.length-1]:null,c=typeof f=="string"?f:"__value",h=a(u,c);if(h)return Vn(h,c);let m=s(Ke(d,t,u,e),c);return m?Vn(m,c):`input[data-hcms-field="${Ee(c)}"]@value`}function i(d,u){let f=ft(d,u,t),c=f&&s(f.item,null)||s("@scalar-array-item",null),h=c?Ks(c):"input[data-hcms-field]@value";return[l(u,"[data-hcms-array-item]"),h]}function o(d,u){let[,f]=d,c=[...u,"*"],h=l(u,"[data-hcms-card]");if(f&&typeof f=="object"&&!Array.isArray(f)){let m=Object.create(null);for(let[p,g]of Object.entries(f)){if(Wn.has(p))throw new Error(`hypercms: rule key "${p}" is forbidden at "${c.join(".")}"`);m[p]=r(g,[...c,p])}return[h,m]}return[h,r(f,[...c,0])]}function l(d,u){let f=d.length?d[d.length-1]:"",c=d.some(p=>p==="*"),h=d.join(".");return`${c?`[data-hcms-field="${Ee(f)}"]`:`[data-hcms-path="${Ee(h)}"]`} > .hcms-array-items > ${u}`}function s(d,u){if(!t)return null;let f=J(t,d);if(!f)return null;let c=f.content||f;if(u){let h=c.querySelector(`[data-hcms-field="${Ee(u)}"]`);if(h)return h}return c.querySelector("[data-hcms-field]")}function a(d,u){if(!t)return null;let f=d.map(m=>typeof m=="number"?"*":m).join("."),h=[d.join("."),f];for(let m=d.length-1;m>=0;m--){let p=d.slice(0,m).map(g=>typeof g=="number"?"*":g);p.push("*"),h.push(p.join("."))}for(let m of h){if(!m)continue;let p=J(t,m);if(!p||!Ge(p))continue;let g=p.content||p,b=g.querySelector(`[data-hcms-field="${Ee(u)}"]`)||g.querySelector("[data-hcms-field]");if(b)return b}return null}}function hr(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function Se({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=pr(e,[],r,n,e);return o&&i.appendChild(o),i}function Yn({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:l}){if(e==="object-array-item")return Jn(t,r,n,i,l);if(e==="scalar-array-item")return Zn(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function pr(e,t,r,n,i){let o=me(e);return o==="scalar"?Gs(e,t,r,n,i):o==="object"?Zs(e,t,r,n,i):o==="object-array"?Qs(e,t,r,n,i):o==="scalar-array"?el(e,t,r,n):null}function Gs(e,t,r,n,i){let o=Ke(e,n,t,i),l=Ae(t,o,n);if(!l)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let s=$n(e,n,t,i);s==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(s==="@checkbox"||s==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${s}" but its value isn't true/false; rendering a text input so the value is preserved`),Xn(l,s===o?s:null,t);let a=Te(l,n);Ce(a,t);let d=l.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&d===o&&Ys(a,e,t,r,n,o,i),o==="@image"&&d==="@image"){let u=Un(e,n,t,i);u!=null&&!a.hasAttribute("data-hcms-crop")&&a.setAttribute("data-hcms-crop",u)}return tl(a,te(t)),xt(a,te(t)),wt(a,te(t)),ni(a,r),o==="@file"&&Js(a),a}function Xn(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function Ys(e,t,r,n,i,o,l){let s=zn(t,i,r,l),a=s?[...s]:[],d=n==null?"":String(n);if(d!==""&&!a.includes(d)&&a.unshift(d),!s&&(Xs(e,"data-hcms-options required (space-separated values)"),a.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let c=e.querySelector("select[data-hcms-field]");if(!c)return;for(let h of a){let m=i.createElement("option");m.value=h,m.textContent=mt(h),c.appendChild(m)}return}let u=e.querySelector(".mirk-radio");if(!u||!u.parentNode)return;let f=fr(r.join("."));for(let c of a){let h=u.cloneNode(!0),m=h.querySelector('input[type="radio"]');m&&(m.value=c,m.name=f);let p=h.querySelector(".mirk-radio__label");p&&(p.textContent=mt(c)),u.parentNode.insertBefore(h,u)}u.remove()}function fr(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function Xs(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function Js(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=hr(t.getAttribute("href")))}function Zs(e,t,r,n,i){let o=Ae(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let l=Te(o,n);if(Ce(l,t),xt(l,te(t)),wt(l,te(t)),Ge(o))return oi(l,e,t),ii(l,e,r),l;let s=_t(l,".hcms-object-fields",o,t);for(let[a,d]of Object.entries(e)){let u=r==null?null:r[a],f=pr(d,[...t,a],u,n,i);f&&s.appendChild(f)}return l}function Qs(e,t,r,n,i){let o=Ae(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let l=Te(o,n);Ce(l,t),xt(l,te(t)),wt(l,te(t)),ei(l,o),ri(l,o,t);let s=_t(l,".hcms-array-items",o,t),[,a]=e;return(Array.isArray(r)?r:[]).forEach((u,f)=>{let c=Jn(a,[...t,f],u,n,i);c&&s.appendChild(c)}),ti(l),l}function Jn(e,t,r,n,i){let o=Qn(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let l=Te(o,n);if(l.setAttribute("data-hcms-card",""),l.classList.contains("hcms-card")||l.classList.add("hcms-card"),Ce(l,t),Ge(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(oi(l,e,t),ii(l,e,r)),l;let s=_t(l,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[a,d]of Object.entries(e)){let u=r==null?null:r[a],f=pr(d,[...t,a],u,n,i);f&&s.appendChild(f)}return l}function el(e,t,r,n){let i=pt(e,n),o=ft(e,t,n),l=i?i.array:"@scalar-array",s=Ae(t,l,n);if(!s)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);Xn(s,i?i.array:null,t);let a=Te(s,n);Ce(a,t),xt(a,te(t)),wt(a,te(t)),ei(a,s),ri(a,s,t),o&&a.setAttribute("data-hcms-item-tpl",o.item);let d=_t(a,".hcms-array-items",s,t);return(Array.isArray(r)?r:[]).forEach((f,c)=>{let h=Zn([...t,c],f,n,o?o.item:null);h&&d.appendChild(h)}),ti(a),a}function Zn(e,t,r,n){let i=Qn(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Te(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Ce(o,e),ni(o,t),o}function Qn(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return J(r,i)||n&&J(r,n)||J(r,"@"+t)}function Te(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Ce(e,t){e.setAttribute("data-hcms-path",t.join("."))}function tl(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function xt(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function wt(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=mt(String(t)))})}function ei(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function ti(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Gn(e,"data-hcms-max-items"),o=Gn(e,"data-hcms-min-items"),l=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector('[data-hcms-action="add"]');d&&(d.hidden=l||i!=null&&n>=i),r.forEach((u,f)=>{let c=u.querySelector('[data-hcms-action="remove"]');c&&(c.hidden=s||o!=null&&n<=o);let h=u.querySelector('[data-hcms-action="move-up"]');h&&(h.hidden=a||f===0);let m=u.querySelector('[data-hcms-action="move-down"]');m&&(m.hidden=a||f===n-1)})}function Gn(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function ri(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function te(e){return e.length?e[e.length-1]:null}function ni(e,t){let r=rl(e);if(r.length!==0)for(let n of r)si(n,t)}function rl(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&nl(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function nl(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function ii(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let l=r==null?null:r[o];si(i,l)})}function oi(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let l=[...r,o].join(".");i.setAttribute("data-hcms-path",l)})}function _t(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function si(e,t){let r=yt(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var il={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,onSnapshot:(e,t)=>e?.onSnapshot??t?.onSnapshot,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,upload:(e,t)=>e?.upload??(t?.uploadFileBasic?sl(t.uploadFileBasic):null)},ol={402:"payment-required",413:"too-large",415:"unsupported-type",401:"unauthorized",403:"forbidden",404:"not-found"},gr=()=>({ok:!1,msg:"Upload cancelled",msgType:"skipped",code:"aborted",uploads:[]});function sl(e){return async function(r,{onProgress:n,signal:i}={}){if(i?.aborted)return gr();try{let o=await e(r,{onProgress:s=>{n?.({loaded:null,total:null,percent:s})}});if(i?.aborted)return gr();let l=o&&o.uploads||[];return typeof l[0]?.url!="string"?{ok:!1,msg:"The host accepted the file but did not say where it put it",msgType:"error",code:"bad-response",uploads:[]}:{ok:!0,msg:o.msg||"Uploaded",msgType:o.msgType||"success",code:o.code||null,uploads:l}}catch(o){if(i?.aborted)return gr();let l={};try{l=JSON.parse(o?.response||"{}")}catch{l={}}let s=l.code||ol[o?.status]||"error";return{ok:!1,msg:o&&o.message||"Upload failed",msgType:"error",code:s,uploads:[]}}}}function z(e,t){let r=il[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var li=["clay:mutation-ready","hyperclay:mutation-ready"],ai=["clay:sync-applied","hyperclay:livesync-applied"],ci=["clay:ready","hyperclay:ready"];function Re(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}var Z="data-hcms-bound",ie="data-hcms-bound-id",br=new Map;function di(e,t){br.set(e,t)}function ui(e){br.delete(e)}function mi(e){let t=e.getAttribute(ie);if(!t)return null;let r=br.get(t);return!r||!r.restorable()?null:r.originalHTML}var he="data-hcms-owns-richclay";function Oe(e){return e&&e.richclay&&e.richclay.RichClay||z("RichClay",e)||(e&&typeof e.RichClay=="function"?e.RichClay:null)}function hi(e,t,r){!e||typeof e.setAttribute!="function"||(e.setAttribute(Z,t?"rich":"plain"),r&&e.setAttribute(he,"true"))}function pi(e,t){if(!e||typeof e.querySelectorAll!="function")return;let r=e.querySelectorAll(`[${Z}]`);if(!r.length)return;let n=Oe(t);if(n&&typeof n.stripFromClone=="function")try{n.stripFromClone(e)}catch(i){console.warn("[hypercms] richclay strip failed; editor state may reach the save",i)}for(let i of r)i.getAttribute(he)==="true"&&i.removeAttribute("data-richclay"),i.removeAttribute(he),i.removeAttribute(Z)}function fi(e,t){if(!e||typeof e.removeAttribute!="function")return;let r=Oe(t);if(r&&typeof r.stripElement=="function")try{r.stripElement(e)}catch(n){console.warn("[hypercms] richclay element strip failed; the clone stays editable",n)}else e.removeAttribute("contenteditable"),e.removeAttribute("no-undo");e.getAttribute(he)==="true"&&e.removeAttribute("data-richclay"),e.removeAttribute(he),e.removeAttribute(Z),e.removeAttribute(ie)}function gi(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||q(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,l]of Object.entries(n))i[o]=r(l);return i}return n}}function bi(e,t){if(!t||e==null)return e;return r(e,[t]);function r(n,i){if(typeof n=="string")return n.endsWith("[]")||q(n)!==-1?n:i.some(o=>ll(o,n))?n+"@innerHTML":n;if(Array.isArray(n)){let[o,l]=n;if(typeof o!="string"||!o)return n;let s=al(t,o);return s.length?[o,r(l,s)]:n}if(n&&typeof n=="object"){let o=Object.create(null);for(let[l,s]of Object.entries(n))o[l]=r(s,i);return o}return n}}function ll(e,t){let r=null;try{r=e.querySelector(t)}catch{return!1}return r?r.hasAttribute(Z)?r.getAttribute(Z)==="rich":r.children.length>0:!1}function al(e,t){try{return[...e.querySelectorAll(t)]}catch{return[]}}function Le(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function oe(e,t,r=!0){if(!e||!e.querySelectorAll||(e.querySelectorAll("textarea[data-hcms-field]").forEach(Le),r===!1))return;let n=t&&t.defaultView||(typeof window<"u"?window:null),i=Oe(n);i&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(o=>{if(o.__hcmsRichclay)return;let l;try{l=new i(o,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(a){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",a);return}o.__hcmsRichclay=l;let s=l&&l.squire;s&&typeof s.addEventListener=="function"&&s.addEventListener("input",()=>{let a=n&&n.Event||Event;o.dispatchEvent(new a("input",{bubbles:!0}))})})}var kr=new WeakSet;function pe(e,t){let r=z("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function re(e){let t=z("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function St(e){let{formRoot:t}=e;if(!t||kr.has(t))return;kr.add(t);let r=l=>{let s=l.target;!s||!s.closest||s.closest("[data-hcms-form-root]")&&s.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(s.tagName==="TEXTAREA"&&Le(s),!s.matches('input[type="file"]')&&(!s.closest("[data-hcms-field]")&&!s.hasAttribute?.("data-hcms-field")||ki(s,e)))},n=l=>{let s=l.target;if(!(!s||!s.closest)&&s.closest("[data-hcms-form-root]")){if(s.matches('input[type="file"][data-hcms-upload]')){gl(s,e);return}s.matches('input[type="checkbox"], input[type="radio"], select')&&ki(s,e)}},i=l=>{let s=l.target;if(!s||!s.closest)return;let a=s.closest("[data-hcms-action]");if(!a)return;let d=a.getAttribute("data-hcms-action");if(d==="add"||d==="remove"||d==="move-up"||d==="move-down"||d==="clear-upload"){if(!a.closest("[data-hcms-form-root]"))return}else if(d==="close"&&!a.closest("[data-hcms-shell]"))return;if(d==="add"){let u=a.closest("[data-hcms-path]");if(!u)return;let f=u.getAttribute("data-hcms-path");Ye(f,e)}else if(d==="remove"){let u=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!u)return;xr(u,e)}else if(d==="move-up"||d==="move-down"){let u=a.closest("[data-hcms-card], [data-hcms-array-item]");if(!u)return;vr(u,d==="move-up"?-1:1,e)}else d==="clear-upload"?vl(a,e):d==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),kr.delete(t)}}var cl=new Set(["value","checked"]);function dl(e,t){if(!t)return null;let r=ee(t);if(r.some(a=>typeof a=="number"||a==="*"))return null;let n=ue(e.pageRules,r);if(typeof n!="string")return null;let i=V.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!cl.has(o))return null;let l=n.slice(0,i),s=l?e.pageRoot.querySelector(l):e.pageRoot;return s?{el:s,prop:o,oldValue:s[o]}:null}function ki(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=dl(t,n);if(G(W(t),{path:n,structural:!1},t),i){let o=z("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var ul={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function ml(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=z("quickcrop");if(typeof n!="function")return{file:e};try{let i=typeof window<"u"&&(window.clay?.modal??window.themodal)||"auto",o=await n(e,{aspect:hl(r),modal:i,...ul});return o===null?null:{file:pl(o.blob,e.name),dataURL:o.dataURL}}catch(i){return Me(t,i&&i.message||"Crop failed"),null}}function hl(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function pl(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}var fl=new Set(["unsupported","payment-required"]);async function gl(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";Me(n,null);let o=await ml(r,n);if(!o||t.closed){se(e);return}let l=o.file,s=o.dataURL||null,a=z("upload");if(typeof a!="function")return yr(e,n,t,i,await yi(l,s,n),l);_i(n,s),vi(n,0);let d=kl(t),u;try{u=await a(l,{signal:d?.signal,onProgress:({percent:c})=>vi(n,c)})}finally{yl(t,d),wl(n)}if(t.closed){se(e);return}if(u.code==="aborted"){se(e);return}if(u.ok)return yr(e,n,t,i,u.uploads[0].url,l);if(!fl.has(u.code)){Me(n,u.msg||"Upload failed"),t.dispatch?.("hcms:error",{error:new Error(u.msg||"Upload failed"),code:u.code,path:i}),se(e);return}let f=u.code==="payment-required"?"This file is stored in the page. Add a paid plan to upload files.":null;return yr(e,n,t,i,await yi(l,s,n),l,f)}function yr(e,t,r,n,i,o,l=null){if(r.closed){se(e);return}if(_i(t,null),Me(t,null),!i){se(e);return}wi(t,i,o.name),G(W(r),{path:n,structural:!1},r),l&&Me(t,l,"info"),se(e)}async function yi(e,t,r){return t||await bl(e,r)}function bl(e,t){let r=t?.ownerDocument?.defaultView?.FileReader||globalThis.FileReader;return r?new Promise(n=>{let i=new r;i.onload=()=>n(typeof i.result=="string"?i.result:""),i.onerror=()=>n("");try{i.readAsDataURL(e)}catch{n("")}}):Promise.resolve("")}function kl(e){if(typeof AbortController!="function")return null;let t=new AbortController;return(e.uploads||(e.uploads=new Set)).add(t),t}function yl(e,t){t&&e.uploads?.delete(t)}function vl(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";wi(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&se(i),Me(r,null),G(W(t),{path:n,structural:!1},t)}function xl(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function wi(e,t,r){let n=xl(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||hr(t):"")}function se(e){try{e.value=""}catch{}}function _i(e,t){let r=e.querySelector?e.querySelector(".mirk-image__frame"):null;r&&(t?r.style.backgroundImage=`url("${t.replace(/"/g,"%22")}")`:r.style.removeProperty("background-image"))}function vi(e,t){let r=Math.max(0,Math.min(100,Number(t)||0));e.setAttribute("data-hcms-uploading",""),e.style?.setProperty?.("--hcms-upload-progress",`${r}%`)}function wl(e){e.removeAttribute("data-hcms-uploading"),e.style?.removeProperty?.("--hcms-upload-progress")}function Me(e,t,r="error"){let n=e.querySelector?e.querySelector(":scope > .hcms-error"):null;n&&(n.classList.toggle("hcms-error--info",!!t&&r==="info"),t?(n.textContent=t,n.hidden=!1):(n.textContent="",n.hidden=!0))}function Ye(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${je(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let l=ee(e),s=Tl(n,l),a=Array.isArray(s),d=typeof s=="string"&&s.endsWith("[]");if(!a&&!d)throw new Error(`hypercms: path "${e}" is not an array`);let u=Et(i,"data-hcms-max-items"),f=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||u!=null&&f.length>=u)return;let c=f.length,h=a?s[1]:s.replace(/\[\]$/,""),m=We(a?h:"string"),p=Yn({shape:a?"object-array-item":"scalar-array-item",itemShape:h,pathArr:[...l,c],data:m,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(p),oe(p,t.doc,t.view?.enhanceFormRichText!==!1),_r(i),pe(`Add ${e}`,()=>G(W(t),{path:e,structural:!0},t))}function vr(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),l=o.indexOf(e);if(l<0)return;let s=l+t;if(s<0||s>=o.length)return;let a=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[s]):i.insertBefore(e,o[s].nextSibling),Ar(i),_r(n),a&&typeof a.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),pe(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>G(W(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var At="Delete this item?";function _l(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||At;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||At:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?At:null}function xr(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=_l(r,t);if(n==null)return Ne(e,t);let i=z("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>{t.closed||Ne(e,t)},()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&Ne(e,t):Ne(e,t)}function Ne(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=Et(i,"data-hcms-min-items"),l=i.querySelector(".hcms-array-items"),s=l?l.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&s<=o)return}return e.remove(),n&&Ar(n),i&&_r(i),pe(`Remove ${r}`,()=>G(W(t),{path:r,structural:!0},t))}}function G(e,t,r){if(r.closed)return{ok:!1,skipped:!0,closed:!0};let n=Xe(e);if(!t.structural&&n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=Object.hasOwn(r,"writeRules")?r.writeRules:r.pageRules,o=jn(r.pageRoot,i,e,{shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null,formRoot:r.formRoot});return o.ok?(r.lastFingerprint=n,r.lastData=e,xi(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(xi(r,Sl(o.error,t.path)),r.dispatch?.("hcms:error",{error:o.error,attemptedData:e}),r.onError?.(o.error)),o}function Tt(e,t){let r=je(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function Ct(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let l=je(n),s=r.querySelectorAll(`[data-hcms-path="${l}"][data-hcms-field][type="radio"], [data-hcms-path="${l}"] [data-hcms-field][type="radio"]`);s.length?s.forEach(a=>{a.checked=String(a.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}function W(e){let t=V.extract(e.formRoot,e.formRules,{exclude:null});return le(t,e.formRules)}function le(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>le(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=le(e[n],i);return r}return e}function xi(e,t){e.lastErrors=t&&t.length?t:null,wr(e)}function wr(e){if(Al(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=El(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function Al(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function El(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,l=>"\\"+l),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let l of o.children)if(l.classList&&l.classList.contains("hcms-error"))return l}r.pop()}return null}function Sl(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function Tl(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Et(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function _r(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Et(e,"data-hcms-max-items"),o=Et(e,"data-hcms-min-items"),l=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),a=e.hasAttribute("data-hcms-no-reorder"),d=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');d&&(d.hidden=l||i!=null&&n>=i),r.forEach((u,f)=>{let c=u.querySelector('[data-hcms-action="remove"]');c&&(c.hidden=s||o!=null&&n<=o);let h=u.querySelector('[data-hcms-action="move-up"]');h&&(h.hidden=a||f===0);let m=u.querySelector('[data-hcms-action="move-down"]');m&&(m.hidden=a||f===n-1)})}function Rt(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>Ar(t))}function Ar(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let l=o.join(".");l!==i&&Cl(n,i,l),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function Cl(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}Rl(e)}function Rl(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=fr(r.getAttribute("data-hcms-path")))}}function Xe(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function je(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Ot="hcms-shell-styles",Ol="hcms-bundled-styles-installed",Lt="hcms-session-open",Ll='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Ie=new WeakSet,Er="";function Ei(e){Er=e}function Je(e){e?.body?.classList.add(Lt)}function Sr(e){e?.body?.classList.remove(Lt)}var Nl=0;function Ai(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function Si({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:l=null,doc:s}){Ti(s);let a=`hcms-shell-title-${++Nl}`,d=s.createElement("div");d.setAttribute("data-hcms-shell",""),d.setAttribute("editor-ui",""),d.setAttribute("save-remove",""),d.setAttribute("save-ignore",""),d.setAttribute("tabindex","-1"),d.setAttribute("role","dialog"),d.setAttribute("aria-modal","true"),d.setAttribute("aria-labelledby",a);let u=l==="dark"?" dark":l==="light"?" light":"";d.className="hcms-shell pixel-quiet hcms-panel hcms-side-"+t+(r?" hcms-overlay":"")+u;let f=Ai(i),c=Ai(o);d.innerHTML=`
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
  `,(e||s.body).appendChild(d);let m=s.body;m.classList.add("hcms-open"),Je(s),r&&m.classList.add("hcms-overlay"),t==="left"&&m.classList.add("hcms-side-left");let p=jl(d,s),g=Ml(d);return{root:d,formRoot:d.querySelector("[data-hcms-form-root]"),noticeEl:d.querySelector(".hcms-shell-notice"),errorEl:d.querySelector(".hcms-shell-error"),saveButton:d.querySelector(".hcms-shell-save"),destroy(){p.detach(),g.detach(),d.remove(),m.classList.remove("hcms-open","hcms-overlay","hcms-side-left"),Sr(s)},restoreChrome(){ae(s),m.classList.add("hcms-open"),Je(s),r&&m.classList.add("hcms-overlay"),t==="left"&&m.classList.add("hcms-side-left")}}}function ae(e){e&&(e.getElementById(Ot)||e.querySelector("style[data-hcms-bundled-styles]")||(Ie.delete(e),Ti(e)))}function Ti(e){if(e&&!Ie.has(e)){if(e[Ol]){Ie.add(e);return}if(e.getElementById(Ot)||e.querySelector("style[data-hcms-bundled-styles]")){Ie.add(e);return}if(Er){let t=e.createElement("style");t.id=Ot,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=Er,(e.head||e.documentElement).appendChild(t),Ie.add(e);return}try{let t=new URL("./theme.generated.css",import.meta.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Ot,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Ie.add(e)}catch{let r=()=>{link.isConnected&&console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")};e.defaultView?.queueMicrotask?e.defaultView.queueMicrotask(r):r()}}}function Ml(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function jl(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Ll));if(i.length===0)return;let o=i[0],l=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),l.focus()):!n.shiftKey&&t.activeElement===l&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var Il="[hypercms]",Ci={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Ri={skip:"[data-hcms-shell]",templateAttr:null},Tr=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Mt(e,t){let r=[],n=[],i=[];return Rr(Q(e),e,t,[],r,n,i),{missing:Oi(r),twins:$l(n),readOnly:Oi(i)}}function jt(e){return Cr(e)}function Cr(e){if(typeof e=="string")return Li(e)?void 0:e;if(Array.isArray(e)){let[t,r]=e;return[t,Cr(r)]}if(e&&typeof e=="object"){let t={};for(let[r,n]of Object.entries(e)){let i=Cr(n);i!==void 0&&(t[r]=i)}return t}return e}function Rr(e,t,r,n,i,o,l){if(typeof r=="string"){let s=Fl(r),a=s?Nt(e,t,s,Ci,n):[];if(Li(r)){l.push(Fe(n));return}if(!s)return;if(r.endsWith("[]")){a.length===0&&Nt(e,t,s,Ri,n).length===0&&i.push(Fe(n));return}a.length===0?i.push(Fe(n)):a.length>1&&o.push({path:Fe(n),count:a.length});return}if(Array.isArray(r)){let[s,a]=r;if(typeof s!="string"||!s)return;let d=Nt(e,t,s,Ci,n);if(d.length===0){Nt(e,t,s,Ri,n).length===0&&i.push(Fe(n));return}for(let u of d)Rr(e,u,a,[...n,"*"],i,o,l);return}if(r&&typeof r=="object")for(let[s,a]of Object.entries(r))Rr(e,t,a,[...n,s],i,o,l)}function Nt(e,t,r,n,i){try{return e.find(t,r,n)}catch(o){throw new Tr(Fe(i),r,o)}}function Fl(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=q(e);return(t===-1?e:e.slice(0,t))||null}function Dl(e){if(e.endsWith("[]"))return null;let t=q(e);return t===-1?null:e.slice(t+1)||null}function Li(e){let t=Dl(e);return t!=null&&be.has(t)}function De(e){ql(e),Pl(e)}function ql(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[],n=e.unresolved&&e.unresolved.readOnly||[];if(r.length===0&&n.length===0){t.textContent="",t.hidden=!0;return}let i=[];if(r.length){let o=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;i.push(`${o}: ${r.join(", ")}`)}if(n.length){let o=n.length===1?"1 field reads a property the browser will not let anything write":`${n.length} fields read properties the browser will not let anything write`;i.push(`${o}: ${n.join(", ")}`)}t.textContent=i.join(`
`),t.hidden=!1}function Pl(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${Il} "${n}" matches ${i} elements; edits go to the first one.`)}}function Oi(e){return[...new Set(e)]}function $l(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function Fe(e){return e.length?e.join("."):"(whole page)"}var zl={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function ce(e,{ignoreActiveValue:t}={}){return Ul(e,{ignoreActiveValue:t})}function Ul(e,{ignoreActiveValue:t}){let r=V.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.view.prepareRules(r.rules),e.rulesTagNode=r.tagNode),ht(e.doc),kt(e.doc,e.pageRules),e.formRules=vt(e.pageRules,e.doc),e.writeRules=jt(e.pageRules),e.unresolved=Mt(e.pageRoot,e.pageRules);let n=dt(),i=le(V.extract(e.pageRoot,e.pageRules,{...zl,...n.hooks}),e.pageRules),o=Se({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});ct(e.formRoot,o,{ignoreActiveValue:t}),n.seed(e.formRoot),oe(e.formRoot,e.doc,e.view?.enhanceFormRichText!==!1),wr(e),De(e),e.updateFingerprint&&e.updateFingerprint()}function Ni({debounce:e=100,onRefresh:t}){let r=z("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=r.onAnyChange({debounce:e},i=>{t(i)});return{unsubscribe:typeof n=="function"?n:()=>{}}}var Bl='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';function Mi({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null;return{name:"sidebar",richText:n,enhanceFormRichText:!0,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,prepareRules(o){return n?gi(o,t):o},mount(o){let l=this.ctx;i=re(()=>Si({mountTo:r.mountTo||e.body,side:r.side||"right",overlay:!!r.overlay,showSaveButton:!!r.showSaveButton,title:r.title,eyebrow:r.eyebrow,theme:r.theme,doc:e})),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl;let s=Se({pageRules:l.pageRules,formRules:l.formRules,data:o,doc:e});i.formRoot.appendChild(s),l.seeder.seed(i.formRoot),oe(i.formRoot,e),De(l),St(l)},refresh(o){if(o==="livesync"){i?.restoreChrome?.(),ce(this.ctx,{ignoreActiveValue:!0});return}if(o==="undo"){ce(this.ctx,{ignoreActiveValue:!1});return}ce(this.ctx)},focusOnOpen(){let o=this.root&&this.root.querySelector(Bl);o&&typeof o.focus=="function"&&o.focus()},destroy(){i?.destroy(),i=null}}}var Hl="[cms-template], [data-hcms-shell]";function Ze(e){if(!e||typeof e.getBoundingClientRect!="function"||typeof e.closest=="function"&&e.closest(Hl))return!1;let t=e.getBoundingClientRect();return t.width>=8&&t.height>=8}var Vl={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Wl={skip:"[data-hcms-shell]",templateAttr:null},Kl="text",Gl="native",ji="handle",Yl=new Set(["INPUT","TEXTAREA","SELECT"]),Di=new Set(["IMG","INPUT","TEXTAREA","SELECT","OPTION","BR","HR","VIDEO","AUDIO","IFRAME","EMBED","OBJECT","CANVAS","SOURCE","TRACK","AREA","COL","PARAM","BUTTON"]);function Lr(e,t){return Xl(e,t)}function Xl(e,t){let r=[],n=[],i=Q(e);return Or(i,e,t,[],r,n),{targets:r,lists:n}}function Or(e,t,r,n,i,o){if(typeof r=="string"){if(r.endsWith("[]")){let u=r.slice(0,-2);if(!u)return;let f=It(e,t,u);f.forEach((c,h)=>{i.push(Fi([...n,h],c,r,null))}),o.push(Ii(e,t,n,u,f,!0));return}let l=q(r),s=l===-1?null:r.slice(l+1),a=l===-1?r:r.slice(0,l),d=!a||a==="."?t:It(e,t,a)[0];d&&i.push(Fi(n,d,r,s));return}if(Array.isArray(r)){let[l,s]=r;if(typeof l!="string"||!l)return;let a=It(e,t,l);a.forEach((d,u)=>Or(e,d,s,[...n,u],i,o)),o.push(Ii(e,t,n,l,a,typeof s=="string"));return}if(r&&typeof r=="object")for(let[l,s]of Object.entries(r))Or(e,t,s,[...n,l],i,o)}function Ii(e,t,r,n,i,o){let l=i[0]?i[0].parentElement:null;if(!l){let s=It(e,t,n,Wl)[0];l=s?s.parentElement:null}return{path:r,items:i,container:l,scalar:o}}function Fi(e,t,r,n){return{path:e,el:t,rule:r,attr:n,kind:Jl(t,n),icon:Ql(t,n)}}function Jl(e,t){let r=(e.tagName||"").toUpperCase();return!t||t==="innerHTML"?Di.has(r)?ji:Kl:t==="value"&&Yl.has(r)&&!e.readOnly&&!Zl(e)?Gl:ji}function Zl(e){return e.disabled?!0:typeof e.matches=="function"&&e.matches(":disabled")}function Ql(e,t){let r=(e.tagName||"").toUpperCase();return(!t||t==="innerHTML")&&!Di.has(r)?null:r==="IMG"||t==="srcset"?"camera":r==="A"&&t==="href"?"paperclip":"pencil"}function It(e,t,r,n=Vl){try{return e.find(t,r,n)}catch{return[]}}var qi=Object.freeze({data:Object.freeze({tokens:["no-data"],bundles:["editor-ui"]}),save:Object.freeze({tokens:["no-save"],bundles:["editor-ui"]}),snapshot:Object.freeze({tokens:["no-snapshot"],bundles:["editor-ui"]}),watch:Object.freeze({tokens:["no-watch"],bundles:["editor-ui"]}),undo:Object.freeze({tokens:["no-undo"],bundles:["editor-ui"]}),history:Object.freeze({tokens:[],bundles:["editor-ui"]})}),ea=Object.freeze({"editor-ui":Object.freeze(["no-data","no-save","no-snapshot","no-watch","no-undo"])}),um=Object.freeze(["no-save","no-snapshot","no-trigger-autosave","no-dirty","no-watch","no-undo","no-data","freeze","editor-ui"]);function Nr(e,t){if(!e||e.nodeType!==1)return!1;let r=e.getAttribute?.("clay");return!!(r&&r.split(/\s+/).includes(t)||e.hasAttribute?.(t))}function ta(e,t){if(Nr(e,t))return!0;for(let[r,n]of Object.entries(ea))if(n.includes(t)&&Nr(e,r))return!0;return!1}function Qe(e){let t=qi[e];if(!t)throw new Error(`Unknown region capability: ${e}`);return[...t.tokens,...t.bundles].flatMap(r=>[`[clay~="${r}"]`,`[${r}]`]).join(", ")}function ra(e,t){let r=e&&e.nodeType===1?e:e?.parentElement;for(;r&&r.nodeType===1;){let n=qi[t];if(!n)throw new Error(`Unknown region capability: ${t}`);if(n.tokens.some(i=>ta(r,i))||n.bundles.some(i=>Nr(r,i)))return r;r=r.parentElement}return null}function Pi(e,t){return!!ra(e,t)}var na=/:(?:focus(?:-within|-visible)?|hover|active|visited|defined)\b/i;function $i(e,t){if(!/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(e.tagName||""))return;let r=(e.getAttribute?.("type")||"").toLowerCase();if("value"in e&&"value"in t&&e.tagName!=="OPTION"&&r!=="checkbox"&&r!=="radio"&&r!=="file"&&(t.value=e.value),e.tagName==="INPUT"&&(r==="checkbox"||r==="radio")&&(t.checked=e.checked),e.tagName==="OPTION"&&(t.selected=e.selected),e.tagName==="SELECT")for(let n=0;n<e.options.length;n++)t.options[n].selected=e.options[n].selected;"indeterminate"in e&&"indeterminate"in t&&(t.indeterminate=e.indeterminate)}function zi(e,t,r,n){if(n)return!!e.closest?.(t);let i=e;for(;i?.nodeType===1;){if(i.matches(t))return!0;if(i===r)break;i=i.parentElement}return!1}function Ui(e,t,r,n,i,o,l,s){if(e.nodeType===1&&((l?Pi(e,r):zi(e,n,o,!1))||i&&(l&&e!==o?e.matches(i):zi(e,i,o,l))))return null;let a=t.importNode(e,!1);s.cloneToLive.set(a,e),s.liveToClone.set(e,a);let d=e.nodeType===1&&e.tagName==="TEMPLATE"?e.content:e,u=a.nodeType===1&&a.tagName==="TEMPLATE"?a.content:a;d!==e&&(s.cloneToLive.set(u,d),s.liveToClone.set(d,u));for(let f of d.childNodes||[]){let c=Ui(f,t,r,n,i,o,l,s);c&&(u.appendChild(c),f.nodeType===1&&$i(f,c))}return e.nodeType===1&&$i(e,a),a}function Mr(e,{capability:t="data",exclude:r=null,inherit:n=!0}={}){if(!e)throw new TypeError("createContentView requires a DOM context");let i=e.nodeType===9?e:e.ownerDocument;if(!i?.implementation?.createHTMLDocument)throw new TypeError("createContentView requires an HTML DOM implementation");let o=i.implementation.createHTMLDocument(""),l=new WeakMap,s=new WeakMap,a=e.nodeType===9?e.documentElement:e;r&&o.documentElement.matches(r);let d=Qe(t),u=Ui(a,o,t,d,r,a,n,{cloneToLive:l,liveToClone:s});e.nodeType===9&&u&&(o.replaceChild(u,o.documentElement),s.set(e,o),l.set(o,e));let f=c=>{if(na.test(c))throw new Error(`Filtered content queries do not support stateful selector: ${c}`)};return{root:u,document:o,capability:t,selector:Qe(t),cloneToLive:l,liveToClone:s,original(c){return l.get(c)||null},cloneOf(c){return s.get(c)||null},query(c,h=u){return f(c),Array.from(h.querySelectorAll(c),m=>l.get(m)||m)},text(c=u){return(c===u?u:s.get(c))?.textContent||""},html(c=u){return(c===u?u:s.get(c))?.innerHTML??""},clone(c=u){let h=c===u?u:s.get(c);return h?o.importNode(h,!0):null}}}import{morph as ma}from"./hyper-morph.vendor.js";var ia=[16,8,0],U=8,oa=4;function Bi({anchor:e,bar:t,rail:r=t,viewport:n,current:i=null}){let o=c=>i===c?oa:0;if(e.bottom<=0||e.top>=n.height||e.right<=0||e.left>=n.width)return{mode:"hidden",x:0,y:0};let l=c=>Math.max(U,Math.min(e.left,n.width-c-U)),s=e.top-16-t.height;if(s>=U-o("above"))return{mode:"above",x:l(t.width),y:s};let a=e.bottom+16;if(a+t.height<=n.height-U+o("below"))return{mode:"below",x:l(t.width),y:a};let d=n.width-e.right-U,u=e.left-U,f=d>=u?[["rail-right",d],["rail-left",u]]:[["rail-left",u],["rail-right",d]];for(let[c,h]of f)for(let m of ia){if(r.width+m>h+o(c))continue;let p=c==="rail-right"?Math.min(e.right+m,n.width-r.width-U):Math.max(e.left-m-r.width,U),g=Math.min(e.bottom,n.height-U)-r.height,b=Math.max(U,Math.min(Math.max(e.top,U),g));return{mode:c,x:p,y:b,gap:m}}return{mode:"pinned",x:l(t.width),y:U}}function jr({anchor:e,handle:t,viewport:r,inset:n=6,prefer:i="auto"}){let o=e.height>=t.height*1.5&&e.width>=t.width*2;if(i==="corner"||o){let c=Math.max(U,Math.min(e.right-t.width+n,r.width-t.width-U)),h=Math.max(U,Math.min(e.top-n,r.height-t.height-U));return{x:c,y:h,mode:"over"}}let l=4,s=e.right+l+t.width<=r.width-U,a=s?e.right+l:e.left-l-t.width,d=Math.max(U,a),u=e.top+e.height/2-t.height/2,f=Math.max(U,Math.min(u,r.height-t.height-U));return{x:d,y:f,mode:s?"beside-right":"beside-left"}}var Dt=!1;function Hi(){if(Dt)return;let e=z("onPrepareForSave");typeof e=="function"&&(e(t=>{Wi(t),Vi(t)}),Dt=!0)}function Vi(e){let t=e&&e.querySelector&&e.querySelector("body");t&&t.classList.remove("hcms-open","hcms-overlay","hcms-side-left",Lt)}function Wi(e){if(!(!e||typeof e.querySelectorAll!="function"))for(let t of e.querySelectorAll(`[${ie}]`)){let r=mi(t);r!==null&&(t.innerHTML=r),t.removeAttribute(ie)}}var qt=!1;function Pt(){if(qt)return;let e=z("onSnapshot");typeof e=="function"&&(e(t=>{Wi(t),pi(t,typeof window<"u"?window:null),Vi(t)}),qt=!0)}function Ki(){Hi(),Pt(),(!Dt||!qt)&&sa()}var Ft=null;function sa(){if(Ft||typeof document>"u")return;Ft=Re(document,ci,()=>{Hi(),Pt(),Dt&&qt&&(Ft?.(),Ft=null)})}var la={edit:"M8 10h2v6H8zm2 4h4v2h-4zm0-6h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-4 0h2v2h-2z","move-up":"M11 4h2v2h2v2h2v2h2v2h-4v-2h-2v10h-2V10H9v2H5v-2h2V8h2V6h2z","move-down":"M11 4h2v10h2v-2h4v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2h4v2h2z",remove:"M5 5h3v3h3v3h2V8h3V5h3v3h-3v3h-3v2h3v3h3v3h-3v-3h-3v-3h-2v3H8v3H5v-3h3v-3h3v-2H8V8H5z",add:"M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"};function fe(e){let t=e==="edit"?"6 0 18 18":"0 0 24 24",r=e==="settings"?'<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>':`<path d="${la[e]}"/>`;return`<svg class="hcms-inline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="${t}" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${r}</svg>`}var Gi="data-hcms-ghost",aa=Qe("history");function ca(e){let t=e.container,r=null;for(;t&&(t.namespaceURI!=="http://www.w3.org/1999/xhtml"||["SELECT","OPTGROUP","DATALIST"].includes(t.tagName));)r=t,t=t.parentElement;return{parent:t,anchor:r}}function Yi({doc:e,themeRoot:t,onAdd:r,onResize:n}){let i=e.defaultView,o=[],l=!1,s=null,a=new Map;function d(h,m,p){h.style[m]!==p&&(h.style[m]=p)}function u(){let h=new Set(o.map(m=>m.node.parentElement));for(let[m,p]of a)h.has(m)&&i?.Sortable?.get(m)===p.instance||(p.instance.option("draggable")===p.selector&&p.instance.option("draggable",p.original),a.delete(m));for(let m of h){let p=i?.Sortable?.get(m);if(!p)continue;let g=p.option("draggable");if(a.get(m)?.selector===g)continue;let b=g,w=`${b.trim().startsWith(">")?"> ":""}:is(${b.trim().replace(/^>\s*/,"")}):not(${aa})`;p.option("draggable",w),a.set(m,{instance:p,original:b,selector:w})}}function f(){for(let h of o){let{node:m,slot:p,list:g}=h,b=g.items.filter(y=>y.isConnected).map(y=>y.getBoundingClientRect()).filter(y=>y.width>0&&y.height>0);b.length&&(h.width=b.reduce((y,w)=>y+w.width,0)/b.length,h.height=b.reduce((y,w)=>y+w.height,0)/b.length),d(m,"width",h.width?`${Math.round(h.width)}px`:"100%"),d(p,"height",`${Math.max(48,Math.round(h.height||64))}px`),p!==m&&(p.colSpan=Math.max(1,...g.items.map(y=>[...y.children].reduce((w,E)=>w+(E.colSpan||1),0)))),m.hidden!==l&&(m.hidden=l)}u()}function c(h,m){let p=m.tagName,g=["TBODY","THEAD","TFOOT","TABLE"].includes(p),b=e.createElement(g?"tr":["UL","OL","MENU"].includes(p)?"li":"div");for(let x of[Gi,"data-hcms-shell","editor-ui","no-watch","no-save","save-remove","snapshot-remove"])b.setAttribute(x,"");b.setAttribute("draggable","false"),b.setAttribute("contenteditable","false"),b.className="hcms-shell pixel-quiet hcms-inline-ghost";for(let x of["light","dark"])b.classList.toggle(x,!!t?.classList.contains(x));let y=g?e.createElement("td"):b;y!==b&&(y.className="hcms-inline-ghost-cell",b.appendChild(y));let w=e.createElement("button");w.type="button",w.className="hcms-inline-list-button hcms-inline-list-add mirk-button mirk-button--small",w.setAttribute("data-hcms-list-action","add"),w.innerHTML=`<span class="mirk-button__label">${fe("add")}<span>Add</span></span>`,y.appendChild(w);let E={node:b,slot:y,button:w,list:h,width:0,height:0};w.addEventListener("click",x=>{x.preventDefault(),x.stopPropagation(),r(E.list)});for(let x of["pointerdown","mousedown","touchstart","click"])b.addEventListener(x,T=>T.stopPropagation());return b.addEventListener("dragstart",x=>{x.preventDefault(),x.stopPropagation()}),E}return{setLists(h){let m=new Set(o),p=[],g=new Set(o.map(y=>y.node)),b=new Set;for(let y of h||[]){if(!y.container||!y.container.isConnected)continue;let{parent:w,anchor:E}=ca(y);if(!w)continue;if(!b.has(w)){for(let C of w.querySelectorAll(`:scope > [${Gi}]`))g.has(C)||C.remove();b.add(w)}let x=o.find(C=>m.has(C)&&C.list.container===y.container&&C.list.path.join(".")===y.path.join("."))||c(y,w);m.delete(x),x.list=y,x.button.setAttribute("data-hcms-list",y.path.join(".")),x.button.setAttribute("aria-label",`Add to ${y.path.join(".")||"the list"}`);let T=E||y.items.filter(C=>C.parentElement===w).at(-1);T?T.nextSibling!==x.node&&T.after(x.node):x.node.parentElement!==w&&w.appendChild(x.node),p.push(x)}for(let y of m)y.node.remove();o=p,s?.disconnect(),!s&&typeof i?.ResizeObserver=="function"&&(s=new i.ResizeObserver(()=>{f(),n?.()}));for(let y of o)for(let w of y.list.items)s?.observe(w);f()},update:f,setHidden(h){l=!!h,f()},destroy(){s?.disconnect();for(let h of o)h.node.remove();o=[],u()}}}var Xi=[["move-up","Move up"],["move-down","Move down"]],da={prefer:"corner",inset:0};function ua(e,t){return t.width<=e.width&&t.height<=e.height}function Ji({doc:e,layerEl:t,onActivate:r,onListAction:n}){let i=e.defaultView,o=[],l=new Map,s=0,a=new Map,d=null,u=new Set,f=0,c=!1,h=null,m=null,p=null,g=null,b=new Map,y=!1,w=null,E=Yi({doc:e,themeRoot:t.closest("[data-hcms-shell]"),onResize:T,onAdd:k=>n?.({action:"add",list:k,index:k.items.length})}),x=e.createElement("div");x.className="hcms-inline-highlight",x.hidden=!0,x.setAttribute("aria-hidden","true"),t.appendChild(x);function T(){if(!(f||!i)){if(typeof i.requestAnimationFrame!="function")return H();f=i.requestAnimationFrame(()=>{f=0,H()})}}let C=()=>p||g;function H(){if(!i)return;E.update();let k={width:i.innerWidth,height:i.innerHeight},v=C();for(let _ of o){if(!_.visible){_.node.hidden=!0;continue}for(let M of _.members)M.node.hidden=y&&M.kind!=="handle";_.node.hidden=!1;let R=_.el.getBoundingClientRect(),S=_.node.getBoundingClientRect(),O=S.width,F=_.kind==="row"&&!ua(R,S);if(F&&_.el!==v){for(let M of _.members)M.kind==="row"&&(M.node.hidden=!0);S=_.node.getBoundingClientRect()}if(_.members.every(M=>M.node.hidden)){_.node.hidden=!0;continue}let D=_.kind==="handle"?null:da,{x:X,y:N}=jr({anchor:R,handle:S,viewport:k,...D}),B=_.members.find(M=>M.kind==="handle");if(F&&B){let M=B.node.getBoundingClientRect(),en=jr({anchor:R,handle:M,viewport:k}),$o=_.members.slice(_.members.indexOf(B)+1).filter(Gt=>!Gt.node.hidden).reduce((Gt,zo)=>Gt+zo.node.getBoundingClientRect().width+2,0);X=Math.max(8+O,Math.min(k.width-8,en.x+M.width+$o))-S.width,N=en.y}_.node.style.transform=`translate(${Math.round(X)}px, ${Math.round(N)}px)`}if(w)if(!w.node.isConnected||w.node.closest("[hidden]"))Y();else{let _=w.button.getBoundingClientRect(),R=w.menu.getBoundingClientRect();w.menu.style.left=`${Math.max(8,_.right-R.width)-_.left}px`,w.menu.style.right="auto",w.menu.style.top=_.bottom+6+R.height>k.height-8?"auto":"calc(100% + 6px)",w.menu.style.bottom=_.bottom+6+R.height>k.height-8?"calc(100% + 6px)":"auto"}j(),h?.()}function P(k){if(k?.closest?.("[data-hcms-ghost]"))return null;for(let v=k;v&&v.nodeType===1;v=v.parentElement){let _=b.get(v);if(_)return _}return null}function K(k){w&&!w.node.contains(k.target)&&Y();let v=C();g=P(k.target),g&&t.contains(k.target)&&(p=null),C()!==v&&T()}function A(k){if(k.relatedTarget||!g)return;let v=C();g=null,C()!==v&&T()}function j(){if(!m||x.hidden)return;let k=m.getBoundingClientRect();x.style.width=`${Math.round(k.width)}px`,x.style.height=`${Math.round(k.height)}px`,x.style.transform=`translate(${Math.round(k.left)}px, ${Math.round(k.top)}px)`}function ge(){if(!i||typeof i.IntersectionObserver!="function"){for(let v of o)v.visible=!0;return}d||(d=new i.IntersectionObserver(v=>{let _=!1;for(let R of v)for(let S of l.get(R.target)||[])S.visible!==R.isIntersecting&&(S.visible=R.isIntersecting,_=!0);_&&T()},{threshold:0}));let k=new Set(l.keys());for(let v of u)k.has(v)||d.unobserve(v);for(let v of k)u.has(v)||d.observe(v);u=k}function Ro(){c||!i||(i.addEventListener("scroll",T,{passive:!0,capture:!0}),i.addEventListener("resize",T,{passive:!0}),e.addEventListener("focusin",K),e.addEventListener("focusout",A),e.addEventListener("pointerdown",Jr,!0),e.addEventListener("keydown",Zr,!0),c=!0)}function Oo(){!c||!i||(i.removeEventListener("scroll",T,{capture:!0}),i.removeEventListener("resize",T),e.removeEventListener("focusin",K),e.removeEventListener("focusout",A),e.removeEventListener("pointerdown",Jr,!0),e.removeEventListener("keydown",Zr,!0),c=!1)}function Wr(k){return`${k.kind}\0${k.attr||""}`}function Kr(k,v){return k.container===v.container&&k.scalar===v.scalar}function Lo(k,v){return k.kind!==v.kind?!1:k.kind==="handle"?Wr(k.target)===Wr(v.target):k.kind==="row"?k.row===v.row&&Kr(k.list,v.list):Kr(k.list,v.list)}function Gr(k,v){k.target=v;let _=v.path.join(".");k.node.setAttribute("data-hcms-target",_),v.icon?k.node.setAttribute("data-hcms-icon",v.icon):k.node.removeAttribute("data-hcms-icon"),k.node.setAttribute("aria-label",`Edit ${_}`)}function No(k){let v=e.createElement("button");v.type="button",v.className="hcms-inline-handle mirk-button mirk-button--small",v.innerHTML=`<span class="mirk-button__label">${fe("edit")}</span>`;let _={node:v,kind:"handle",target:k};return Gr(_,k),v.addEventListener("click",R=>{R.preventDefault(),R.stopPropagation(),r?.(_.target,v)}),_}function Yr(k,v){let _=e.createElement("button");return _.type="button",_.className="hcms-inline-list-button mirk-button mirk-button--small",_.setAttribute("data-hcms-list-action",k),_.setAttribute("aria-label",v),_.innerHTML=`<span class="mirk-button__label">${fe(k)}${k==="add"?"<span>Add</span>":""}</span>`,_}function Xr(k,{list:v,row:_,rowIndex:R,count:S}){let O=v.path.join(".");k.list=v,k.row=_,k.index=R,k.count=S,k.node.setAttribute("data-hcms-list",O),k.node.setAttribute("data-hcms-row",String(R));for(let F of k.node.querySelectorAll("[data-hcms-list-action]")){let D=F.getAttribute("data-hcms-list-action"),X=Xi.find(([N])=>N===D)?.[1]||D;F.setAttribute("aria-label",`${X} ${O}.${R}`),F.disabled=D==="move-up"&&R===0||D==="move-down"&&R===S-1}}function Mo(k,v,_,R){let S=e.createElement("div");S.className="hcms-inline-row-controls";let O={node:S,kind:"row",list:k,row:v,index:_,count:R};for(let[F,D]of Xi){let X=Yr(F,D);X.addEventListener("click",N=>{N.preventDefault(),N.stopPropagation(),!X.disabled&&n?.({action:F,list:O.list,index:O.index,row:O.row})}),S.appendChild(X)}return Xr(O,{list:k,row:v,rowIndex:_,count:R}),O}function Y(k=!1){if(!w)return;let v=w;w=null,v.menu.hidden=!0,v.button.setAttribute("aria-expanded","false"),v.node.parentElement?.classList.remove("has-open-settings"),k&&v.button.isConnected&&v.button.focus({preventScroll:!0})}function Jr(k){w&&!w.node.contains(k.target)&&Y()}function Zr(k){w&&(k.key==="Escape"?(k.preventDefault(),k.stopPropagation(),Y(!0)):k.key==="Tab"?Y(!0):["ArrowDown","ArrowUp","Home","End"].includes(k.key)&&w.menu.contains(k.target)&&(k.preventDefault(),w.menu.querySelector('[role="menuitem"]').focus({preventScroll:!0})))}function Qr(k,{list:v,row:_,rowIndex:R}){Object.assign(k,{list:v,row:_,index:R}),k.node.setAttribute("data-hcms-list",v.path.join(".")),k.node.setAttribute("data-hcms-row",String(R)),k.button.setAttribute("aria-label",`Settings ${v.path.join(".")}.${R}`)}function jo(k){let v=e.createElement("div");v.className="hcms-inline-settings";let _=Yr("settings","Settings");_.setAttribute("aria-haspopup","menu"),_.setAttribute("aria-expanded","false");let R=e.createElement("div");R.className="hcms-inline-settings-menu",R.setAttribute("role","menu"),R.setAttribute("aria-label","Item settings"),R.hidden=!0;let S=e.createElement("button");S.type="button",S.setAttribute("role","menuitem"),S.setAttribute("data-hcms-list-action","remove"),S.textContent="Delete",R.appendChild(S),v.append(_,R);let O={node:v,button:_,menu:R,kind:"settings"};Qr(O,k);let F=()=>{Y(),w=O,R.hidden=!1,_.setAttribute("aria-expanded","true"),v.parentElement.classList.add("has-open-settings"),S.focus({preventScroll:!0}),T()};return _.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),w===O?Y(!0):F()}),_.addEventListener("keydown",D=>{(D.key==="ArrowDown"||D.key==="ArrowUp")&&(D.preventDefault(),F())}),S.addEventListener("click",D=>{D.preventDefault(),D.stopPropagation(),Y(!0),n?.({action:"remove",list:O.list,index:O.index,row:O.row})}),O}function Io(k,v){k.kind==="handle"?Gr(k,v.target):k.kind==="row"?Xr(k,v):k.kind==="settings"&&Qr(k,v)}function Kt(k,v,_,R,S){let O=v.get(_)?.find(F=>F.category===S);if(!O){O={el:_,category:S,members:[]},k.push(O);let F=v.get(_);F?F.push(O):v.set(_,[O])}O.members.push(R)}function Fo(k,v,_){let R=_.items||[];R.forEach((S,O)=>{Ze(S)&&(Kt(k,v,S,{kind:"row",list:_,row:S,rowIndex:O,count:R.length},"item"),Kt(k,v,S,{kind:"settings",list:_,row:S,rowIndex:O},"item"))})}function Do(k,v){let _=new Set(k.members),R=[];for(let S of v){let O=k.members.find(F=>_.has(F)&&Lo(F,S))||(S.kind==="handle"?No(S.target):S.kind==="row"?Mo(S.list,S.row,S.rowIndex,S.count):jo(S));_.delete(O),Io(O,S),y&&O.kind!=="handle"&&(O.node.hidden=!0),R.push(O)}for(let S of _)S===w&&Y(),S.node.remove();R.sort((S,O)=>["row","handle","settings"].indexOf(S.kind)-["row","handle","settings"].indexOf(O.kind)),R.forEach((S,O)=>{k.node.children[O]!==S.node&&k.node.insertBefore(S.node,k.node.children[O]||null)}),k.members=R}function qo(k,v){let _=[],R=new Map,S=new Map,O=0;for(let N of k||[])S.has(N.el)||S.set(N.el,N),!(N.kind!=="handle"||!Ze(N.el))&&(Kt(_,R,N.el,{kind:"handle",target:N},"item"),O++);for(let N of v||[])Fo(_,R,N);let F=new Set(o),D=new Map;for(let N of o)D.has(N.el)||D.set(N.el,N.visible);let X=[];for(let N of _){let B=o.find(M=>F.has(M)&&M.el===N.el&&M.category===N.category);if(!B){let M=e.createElement("div");M.className="hcms-inline-item-controls",M.setAttribute("role","group"),B={el:N.el,node:M,category:N.category,kind:N.category==="add"?"add":"handle",members:[],visible:D.get(N.el)??!1},t.appendChild(M)}F.delete(B),B.el=N.el,B.category=N.category,Do(B,N.members),B.kind=B.members.some(M=>M.kind==="row")?"row":B.members.some(M=>M.kind==="handle")?"handle":"add",B.node.setAttribute("aria-label",B.category==="add"?"List controls":"Item controls"),X.push(B)}for(let N of F)N.node.remove();o=X,l=new Map,b=new Map;for(let N of o){let B=l.get(N.el);B?B.push(N):l.set(N.el,[N]);for(let M of N.members)M.kind!=="row"&&M.kind!=="settings"||(b.set(M.row,M.row),b.set(M.node,M.row),b.set(N.node,M.row))}p&&!b.has(p)&&(p=null),g&&!b.has(g)&&(g=null),a=S,s=O}function Po(){Y(),d?.disconnect(),d=null,u=new Set;for(let k of o)k.node.remove();o=[],l=new Map,a=new Map,b=new Map,s=0}return{setTargets(k,v){qo(k,v),E.setLists(v),ge(),Ro(),T()},refresh:T,get count(){return s},get controlsHidden(){return y},setControlsHidden(k){if(y=!!k,E.setHidden(y),y){Y();for(let v of o){for(let _ of v.members)_.kind!=="handle"&&(_.node.hidden=!0);v.members.every(_=>_.node.hidden)&&(v.node.hidden=!0)}}T()},elementToTarget(k){if(k?.closest?.("[data-hcms-ghost]"))return null;for(let v=k;v&&v.nodeType===1;v=v.parentElement){let _=a.get(v);if(_)return _}return null},setHoveredRow(k){let v=C();p=k?P(k):null,C()!==v&&T()},showHighlight(k){k&&(m=k,x.hidden=!1,j())},hideHighlight(){m=null,x.hidden=!0},setFollower(k){h=typeof k=="function"?k:null},destroy(){E.destroy(),f&&i&&i.cancelAnimationFrame(f),f=0,h=null,m=null,p=null,g=null,x.remove(),Oo(),Po()}}}var ha="hypercms-inline",rt="is-hcms-inline-active",Ir="is-hcms-inline-onpath",Zi='input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',pa=["bold","italic","link","undo","redo"],fa=/^H[1-6]$/,ga=0;function to({doc:e,pageRoot:t,opts:r={}}){let n=r.richText!==!1,i=null,o=null,l=null,s=new Map,a=null,d=null,u=null;function f(c,h,m,p,g){let b=Oe(e.defaultView);if(typeof b!="function")return null;let y=g||{},w=y.originalHTML??Mr(h,{capability:"history"}).html(),E=y.richClayIsOurs??!h.hasAttribute("data-richclay"),x=y.adopted??h.getAttribute("data-richclay-active")==="true",T=et(h,p,"history"),C=ba(c,b,h,p,E);if(!C)return null;hi(h,p==="innerHTML",E);let H=String(++ga);h.setAttribute(ie,H),Pt();let P={el:h,editor:C,path:m,prop:p,boundId:H,originalHTML:w,oldValue:T,richClayIsOurs:E,adopted:x,dirty:!1,written:!1,restorable(){return!this.adopted&&!this.dirty&&!this.written},lastEdited:void 0};s.set(h,P),di(H,P);let K=C.squire;if(K&&typeof K.addEventListener=="function"){let j=()=>{P.dirty=!0,P.lastEdited=et(h,P.prop,"history"),ka(c,P)};K.addEventListener("input",j),P.detachInput=()=>K.removeEventListener?.("input",j)}let A=()=>ro(P);return h.addEventListener("blur",A),P.detachBlur=()=>h.removeEventListener("blur",A),P}return{name:"inline",richText:n,ctx:null,root:null,formRoot:null,errorEl:null,noticeEl:null,handoffEl:null,handoffCountEl:null,popEl:null,enhanceFormRichText:!1,prepareRules(c){return n?bi(c,t):c},bindText(c,h,m,p){return f(this.ctx,c,h,m,p)},mount(c){let h=this.ctx;i=_a(e,r.theme),this.root=i.root,this.formRoot=i.formRoot,this.errorEl=i.errorEl,this.noticeEl=i.noticeEl,this.handoffEl=i.handoffEl,this.handoffCountEl=i.handoffCountEl,this.popEl=i.popEl,re(()=>Je(e));let m=Se({pageRules:h.pageRules,formRules:h.formRules,data:c,doc:e});i.formRoot.appendChild(m),h.seeder.seed(i.formRoot),oe(i.formRoot,e,this.enhanceFormRichText),De(h),St(h),o=Ji({doc:e,layerEl:i.layerEl,onActivate:(p,g)=>this.activate(p,g),onListAction:p=>this.listAction(p)}),o.setFollower(()=>this.placePopover()),i.closeEl.addEventListener("click",()=>this.deactivate()),i.toggleEl.addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),this.toggleControls()}),i.handoffEl.querySelector("[data-hcms-open-view]").addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),h.onViewRequested?.("sidebar")}),this.bindPage(),this.syncTargets()},listAction({action:c,list:h,index:m,row:p}){let g=this.ctx,b=h.path.join("."),y=g.formRoot.querySelector(`[data-hcms-path="${je(b)}"]`);if(!y)return;if(c==="add"){Ye(b,g);return}let w=p?Ea(g,b,p):m;if(w===-1)return;let E=Aa(y,w);if(E){if(c==="remove"){xr(E,g),this.syncTargets();return}vr(E,c==="move-up"?-1:1,g),this.syncTargets()}},toggleControls(){if(!o||!i)return;let c=!o.controlsHidden;o.setControlsHidden(c),i.toggleEl.setAttribute("aria-pressed",String(c));let h=i.toggleEl.querySelector(".mirk-button__label");h&&(h.textContent=c?"Show controls":"Hide controls")},bindPage(){let c=this.ctx.pageRoot,h=i.root,m=E=>{let x=o&&o.elementToTarget(E.target);x?o.showHighlight(x.el):o?.hideHighlight(),o?.setHoveredRow(E.target)},p=()=>{o?.hideHighlight(),o?.setHoveredRow(null)},g=E=>{if(h.contains(E.target))return;let x=o&&o.elementToTarget(E.target);!x||x.kind!=="text"||s.has(x.el)||f(this.ctx,x.el,x.path.join("."),zt(x))},b=E=>{if(h.contains(E.target))return;let x=o&&o.elementToTarget(E.target);if(!x){this.deactivate();return}(typeof E.target.closest=="function"&&E.target.closest("a[href]")||x.kind!=="text")&&E.preventDefault(),this.activate(x)},y=E=>{E.key==="Escape"&&this.deactivate()},w=E=>{let x=E.detail;if(!(!x||x.pageRoot!==this.ctx.pageRoot||!x.path))for(let T of s.values())T.path===x.path&&(T.written=!0)};c.addEventListener("pointerover",m),c.addEventListener("pointerleave",p),c.addEventListener("pointerdown",g),c.addEventListener("click",b),h.addEventListener("keydown",y),e.addEventListener("hcms:change",w),l=()=>{c.removeEventListener("pointerover",m),c.removeEventListener("pointerleave",p),c.removeEventListener("pointerdown",g),c.removeEventListener("click",b),h.removeEventListener("keydown",y),e.removeEventListener("hcms:change",w)}},activate(c,h){if(!c||!i||c.kind==="text"&&this.activateText(c))return;let m=Qi(this,i,c.path.join("."));if(!m){this.deactivate();return}a=c,d=h||null,u=null,i.popEl.hidden=!1,i.formRoot.querySelectorAll(`.${rt}`).forEach(eo),this.placePopover(),wa(m)},activateText(c){let h=c.el,m=s.get(h);if(m)return $t(m),!0;let p=f(this.ctx,h,c.path.join("."),zt(c));return p?($t(p),!0):!1},placePopover(){if(!i||!a||i.popEl.hidden)return;let c=e.defaultView;if(!c)return;let h={width:c.innerWidth,height:c.innerHeight},m=a.el.getBoundingClientRect(),p=i.popEl.getBoundingClientRect(),{mode:g,x:b,y}=Bi({anchor:m,bar:p,viewport:h,current:u});u=g,i.popEl.style.transform=`translate(${Math.round(b)}px, ${Math.round(y)}px)`},deactivate(){if(!i||!a&&i.popEl.hidden)return;i.popEl.hidden=!0,io(i.root);let c=d;if(a=null,d=null,u=null,c&&e.contains(c)&&typeof c.focus=="function")try{c.focus({preventScroll:!0})}catch{c.focus()}},syncTargets(){if(!o)return;let c=this.ctx,{targets:h,lists:m}=Lr(c.pageRoot,c.pageRules);o.setTargets(h,m);let p=ya(this,s,h,e);if(a){let b=p.get(a.el)||[],y=b.find(w=>va(w,a))||b.find(w=>w.path.join(".")===a.path.join("."))||(b.length===1?b[0]:null);y?a=y:this.deactivate()}xa(this.ctx,s,e);let g=h.reduce((b,y)=>b+(Ze(y.el)?0:1),0);this.handoffEl&&(this.handoffCountEl.textContent=g===0?"":`${g} ${g===1?"field isn't":"fields aren't"} visible right now.`,this.handoffEl.hidden=g===0)},refresh(c,h){c==="livesync"?(ae(e),Je(e),ce(this.ctx,{ignoreActiveValue:!0})):c==="undo"?ce(this.ctx,{ignoreActiveValue:!1}):ce(this.ctx),this.syncTargets(),(c==="livesync"||c==="undo")&&this.rebindText(c),this.restoreActive()},rebindText(c){let h=c!=="undo";for(let[m,p]of[...s]){if(!e.contains(m)){tt(this.ctx,p,{restore:!1,record:h}),s.delete(m);continue}if(m.hasAttribute(Z)){let y=et(m,p.prop);y!==p.lastEdited&&(p.oldValue=y,p.lastEdited=void 0);continue}let g=e.activeElement===m;tt(this.ctx,p,{restore:!1,record:h}),s.delete(m);let b=f(this.ctx,m,p.path,p.prop,{richClayIsOurs:p.richClayIsOurs,adopted:p.adopted});b&&g&&$t(b)}},restoreActive(){if(!i||!a||i.popEl.hidden)return;if(!e.contains(a.el)){this.deactivate();return}if(!Qi(this,i,a.path.join("."))){this.deactivate();return}i.formRoot.querySelectorAll(`.${rt}`).forEach(eo),this.placePopover()},focusOnOpen(){if(this.root&&typeof this.root.focus=="function")try{this.root.focus({preventScroll:!0})}catch{this.root.focus()}},destroy(){d=null,this.deactivate();for(let c of s.values())tt(this.ctx,c);s.clear(),l?.(),l=null,o?.destroy(),o=null,i?.destroy(),i=null,Sr(e),this.popEl=null,this.handoffEl=null,this.handoffCountEl=null}}}function ba(e,t,r,n,i){return re(()=>{let o=null;try{o=new t(r,{inline:!0,hyperclay:!1,toolbar:n==="innerHTML"?pa:!1,...fa.test(r.tagName)?{singleLine:!0}:null})}catch(l){return console.warn("[hypercms] richclay activation failed; the field falls back to the popover",l),null}if(o.unsupported||!o.active){if(i)try{o.destroy()}catch{}return null}return typeof o.reattach=="function"&&o.reattach(),o})}function ka(e,{path:t,el:r,prop:n}){let i=Tt(e.formRoot,t);i&&(Ct(i,et(r,n),e.formRoot,t),G(W(e),{path:t,structural:!1},e))}function et(e,t,r="data"){let n=Mr(e,{capability:r});return t==="innerHTML"?n.html():n.text().trim()}function ro(e){let{el:t,prop:r,oldValue:n,lastEdited:i}=e,o=i;if(o===void 0||o===n)return;e.oldValue=o;let l=z("undo");if(!l||typeof l.recordValue!="function")return;let s={prop:r,oldValue:n,newValue:o,read:a=>et(a,r,"history"),write:(a,d)=>no(a,r,d)};l.isPaused?queueMicrotask(()=>{t.isConnected&&l.recordValue(t,s)}):l.recordValue(t,s)}function no(e,t,r){let n=e.cloneNode(!1);t==="innerHTML"?n.innerHTML=r:n.textContent=r,ma(e,Array.from(n.childNodes),{morphStyle:"innerHTML",policy:"history",restoreFocus:!1,scripts:{handle:!1,merge:!1}})}function tt(e,t,{restore:r=!0,record:n=!0}={}){n&&ro(t),t.detachInput?.(),t.detachBlur?.(),re(()=>{if(!t.adopted){try{t.editor.destroy()}catch(i){console.warn("[hypercms] richclay teardown failed; editor state may reach the save",i)}t.richClayIsOurs&&t.el.removeAttribute("data-richclay")}t.el.removeAttribute(Z),t.el.removeAttribute(he),t.el.removeAttribute(ie),ui(t.boundId),r&&t.restorable()&&no(t.el,"innerHTML",t.originalHTML)})}function $t(e){let{editor:t,el:r}=e;if(r.ownerDocument.activeElement!==r)try{typeof t.focus=="function"?t.focus():r.focus()}catch{}}function ya(e,t,r,n){let i=new Map;for(let o of r){let l=i.get(o.el);l?l.push(o):i.set(o.el,[o])}for(let[o,l]of[...t]){let s=i.get(o)||[],a=s.find(c=>zt(c)===l.prop)||s[0];if(!a){tt(e.ctx,l,{restore:!0}),t.delete(o);continue}l.path=a.path.join(".");let d=zt(a);if(d===l.prop)continue;let u=n.activeElement===o;tt(e.ctx,l,{restore:!1}),t.delete(o);let f=e.bindText(o,l.path,d,{richClayIsOurs:l.richClayIsOurs,adopted:l.adopted,originalHTML:l.originalHTML});f&&u&&$t(f)}return i}function va(e,t){return e.el===t.el&&e.kind===t.kind&&e.attr===t.attr}function zt(e){return e.attr==="innerHTML"?"innerHTML":"textContent"}function xa(e,t,r){for(let n of e.pageRoot.querySelectorAll(`[${Z}]`))t.has(n)||re(()=>fi(n,r.defaultView))}function Qi(e,t,r){let n=e.formRoot&&e.formRoot.querySelector(`[data-hcms-path="${je(r)}"]`);if(io(t.root),!n)return null;let i=n.closest("[data-hcms-card]"),o=i?[...i.querySelectorAll('[data-hcms-shape="scalar"][data-hcms-path]')].filter(l=>l.closest("[data-hcms-card]")===i&&l.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]')===i.parentElement.closest('[data-hcms-shape="object-array"]')):[n];o.includes(n)||o.push(n);for(let l of o){l.classList.add(rt),l.removeAttribute("draggable");for(let s=l.parentElement;s&&(s.classList.add(Ir),s.removeAttribute("draggable"),s!==e.formRoot);s=s.parentElement);}return n}function io(e){if(e)for(let t of e.querySelectorAll(`.${rt}, .${Ir}`))t.classList.remove(rt,Ir)}function eo(e){e.tagName==="TEXTAREA"&&Le(e),e.querySelectorAll?.("textarea").forEach(Le)}function wa(e){let t=e.matches?.(Zi)?e:e.querySelector?.(Zi);if(!(!t||typeof t.focus!="function"))try{t.focus({preventScroll:!0})}catch{t.focus()}}function _a(e,t){ae(e);let r=e.createElement(ha),n=t==="dark"?" dark":t==="light"?" light":"";return r.className="hcms-shell pixel-quiet hcms-inline"+n,r.setAttribute("data-hcms-shell",""),r.setAttribute("editor-ui",""),r.setAttribute("no-save",""),r.setAttribute("save-remove",""),r.setAttribute("snapshot-remove",""),r.setAttribute("no-watch",""),r.setAttribute("tabindex","-1"),r.innerHTML=`
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
  `,e.body.appendChild(r),{root:r,formRoot:r.querySelector("[data-hcms-form-root]"),noticeEl:r.querySelector(".hcms-inline-notice"),errorEl:r.querySelector(".hcms-inline-error"),handoffEl:r.querySelector(".hcms-inline-handoff"),handoffCountEl:r.querySelector(".hcms-inline-handoff-count"),layerEl:r.querySelector(".hcms-inline-layer"),popEl:r.querySelector(".hcms-inline-pop"),closeEl:r.querySelector(".hcms-inline-pop-close"),toggleEl:r.querySelector("[data-hcms-controls-toggle]"),destroy(){r.remove()}}}function Aa(e,t){let r=e.querySelector(".hcms-array-items");return r&&r.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")[t]||null}function Ea(e,t,r){let{lists:n}=Lr(e.pageRoot,e.pageRules),i=n.find(o=>o.path.join(".")===t);return i?i.items.indexOf(r):-1}var Sa="[hypercms]";function oo(e,t){if(!e||!e.querySelectorAll||!t)return;let r=Ta(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Sa} template "${o}" doesn't match any rule path; ignored`))})}function Ta(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),l=n.map(a=>typeof a=="number"?"*":a).join(".");o&&t.add(o),l&&t.add(l);let s=me(i);if(s==="object")for(let[a,d]of Object.entries(i))r([...n,a],d);else if(s==="object-array"||s==="scalar-array"){let a=[...n,"*"],d=a.map(u=>typeof u=="number"?"*":u).join(".");if(t.add(d),s==="object-array"){let u=i[1];if(u&&typeof u=="object"&&!Array.isArray(u))for(let[f,c]of Object.entries(u))r([...a,f],c)}}}}var lo={skip:"[data-hcms-shell]",templateAttr:"cms-template"},L={isOpen:!1,ctx:null,opts:null};function ao({view:e,doc:t,pageRoot:r,opts:n={},onCloseRequested:i,onViewRequested:o}){let l=n.rules!==void 0?n.rules:"cms",s=V.findRules(t,l);if(!s){let g=typeof l=="string"?`data-rules-name~="${l}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${g}`)}let a=e.prepareRules(s.rules),d=s.tagNode;ht(t),kt(t,a),oo(t,a);let u=vt(a,t),f=jt(a),c=Mt(r,a),h=dt(),m=le(V.extract(r,a,{...lo,...h.hooks}),a),p={doc:t,pageRoot:r,pageRules:a,writeRules:f,formRules:u,rulesTagNode:d,rulesSource:l,richText:e.richText,view:e,seeder:h,initialData:m,get formRoot(){return e.formRoot},get shellRoot(){return e.root},get errorEl(){return e.errorEl},get noticeEl(){return e.noticeEl},unresolved:c,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:n.onChange,onError:n.onError,confirmRemove:n.confirmRemove,previouslyFocused:t.activeElement,dispatch(g,b){let y=t.defaultView&&t.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!y)return;let w={...b||{},pageRoot:r,view:e.name},E=new y(g,{bubbles:!0,cancelable:g==="hcms:change",detail:w});(e.root&&e.root.isConnected!==!1?e.root:r).dispatchEvent(E)},onCloseRequested:i,onViewRequested:o};return p.updateFingerprint=()=>{p.lastFingerprint=Xe(W(p))},e.ctx=p,p}function co(e){e.updateFingerprint(),e.observerHandle=Ni({onRefresh:n=>e.view.refresh("observer",n)});let t=z("undo");if(t&&typeof t.on=="function"){let n=()=>{if(L.ctx!==e)return;so(e,"undo");let i=le(V.extract(e.pageRoot,e.pageRules,lo),e.pageRules);Xe(i)!==Xe(e.lastData)&&(e.lastData=i,e.onChange?.(i,{path:"",structural:!1}))};t.on("undo",n),t.on("redo",n),e.undoUnsub=()=>{t.off("undo",n),t.off("redo",n)}}let r=()=>so(e,"livesync");e.livesyncUnsub=Re(e.doc,ai,r),Dr.ctx=e,Ra(e.doc)}function so(e,t){L.ctx===e&&e.view.refresh(t)}function Ut(e,{dispatch:t=!0,restoreFocus:r=!0,updateUrl:n=!0,reason:i="close"}={}){if(!e||e.closed)return;e.closed=!0;for(let l of e.uploads||[])try{l.abort()}catch{}e.uploads?.clear();let o=e.previouslyFocused;if(t&&e.dispatch("hcms:close",{reason:i}),n&&Oa(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),re(()=>e.view.destroy()),Ca(),r&&typeof o?.focus=="function")try{o.focus()}catch{}}function Ca(){L.isOpen=!1,L.ctx=null,L.opts=null,Dr.ctx=null}var Dr={ctx:null};function Ra(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=Dr.ctx;if(i)return Rt(i.formRoot),pe("Reorder",()=>G(W(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var Fr="cms";function uo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(Fr)!=="true"?t:(i.set(Fr,"false"),"?"+i.toString())}function mo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(Fr)==="true":!1}function Oa(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=uo(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}var ho="hcms-toggle",I="data-hcms-toggle-host",po="hcms-toggle-style",fo="data-hcms-toggle-style",Bt="data-hcms-session",wo="data-hcms-split",_o="hcms.view",Ht=["sidebar","inline"],La={sidebar:"In the sidebar",inline:"On the page"},$r="var(--hcms-toggle-bg, var(--hcms-toggle-_surface))";function go(e){try{let t=e&&e.localStorage?e.localStorage.getItem(_o):null;return Ht.includes(t)?t:null}catch{return null}}function Na(e,t){if(Ht.includes(t))try{e?.localStorage?.setItem(_o,t)}catch{}}var Ma="#fafafa",ja="#0a0a0a",Ia=`
[${I}] {
  all: unset;
  box-sizing: border-box;
  display: var(--hcms-toggle-display, inline-flex);
  font-family: 'Departure Mono', ui-monospace, Menlo, monospace;
  --hcms-toggle-_surface: ${Ma};
}
[${I}][data-hcms-surface="dark"] {
  --hcms-toggle-_surface: ${ja};
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
[${I}][${Bt}="open"] .hcms-toggle__open { display: none; }
[${I}][${Bt}="open"] .hcms-toggle__close { display: inline; }
[${I}][${wo}] .hcms-toggle__main {
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
  background: ${$r};
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
`;function Fa({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),l=new URLSearchParams(o).get("editmode");return l?l==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}var qr=new WeakMap;function Ao(e,t){try{e.globalCompositeOperation="copy",e.fillStyle=t,e.fillRect(0,0,1,1);let r=e.getImageData(0,0,1,1).data;return{r:r[0],g:r[1],b:r[2],a:r[3]/255}}catch{return null}}function Da(e){if(qr.has(e))return qr.get(e);let t=null;try{let r=e.createElement("canvas");if(r.width=r.height=1,t=r.getContext?r.getContext("2d",{willReadFrequently:!0}):null,t){let n=Ao(t,"rgb(1, 2, 3)");(!n||n.r!==1||n.g!==2||n.b!==3||n.a!==1)&&(t=null)}}catch{t=null}return qr.set(e,t),t}function qa(e,t){let r=String(e??"").trim();if(!r)return null;let n=Pa(r);if(n)return n;let i=t&&t.defaultView;if(!i||!i.CSS||typeof i.CSS.supports!="function"||!i.CSS.supports("color",r))return null;let o=Da(t);return o?Ao(o,r):null}function Pa(e){let t=/rgba?\(([^)]+)\)/.exec(String(e??""));if(!t)return null;let r=t[1].split(/[\s,/]+/).filter(Boolean);if(r.length<3)return null;let n=r.slice(0,3).map(Number);if(n.some(Number.isNaN))return null;let i=r[3],o=i===void 0?1:i.endsWith("%")?Number(i.slice(0,-1))/100:Number(i);return{r:n[0],g:n[1],b:n[2],a:Number.isNaN(o)?1:o}}function bo({r:e,g:t,b:r}){let n=i=>{let o=i/255;return o<=.03928?o/12.92:((o+.055)/1.055)**2.4};return .2126*n(e)+.7152*n(t)+.0722*n(r)}function ko(e,t){let r=bo(e),n=bo(t);return(Math.max(r,n)+.05)/(Math.min(r,n)+.05)}var yo={r:10,g:10,b:10},vo={r:250,g:250,b:250};function xo(e,t){let r=e.a==null?1:e.a;return{r:e.r*r+t.r*(1-r),g:e.g*r+t.g*(1-r),b:e.b*r+t.b*(1-r)}}function $a(e){if(!e)return"light";let t=ko(xo(e,yo),yo),r=ko(xo(e,vo),vo);return t>r?"dark":"light"}function nt(e,t){for(let[r,n]of Object.entries(t))e.style.setProperty(r,n,"important")}function Pr(e){let t=e.ownerDocument&&e.ownerDocument.defaultView,r=e.querySelector(".hcms-toggle__main");if(!t||!r||typeof t.getComputedStyle!="function")return;let n=qa(t.getComputedStyle(r).color,e.ownerDocument);e.setAttribute("data-hcms-surface",$a(n))}function za(e){Pr(e);let t=e.ownerDocument,r=t&&t.defaultView;if(!r)return;let n=0,i=()=>{if(!n){if(typeof r.requestAnimationFrame!="function")return e.isConnected?Pr(e):s();n=r.requestAnimationFrame(()=>{if(n=0,!e.isConnected)return s();Pr(e)})}};typeof r.requestAnimationFrame=="function"&&i(),t.readyState!=="complete"&&r.addEventListener("load",i,{once:!0});let o=typeof r.MutationObserver=="function"?new r.MutationObserver(i):null;o&&(o.observe(t.documentElement,{attributes:!0}),t.body&&o.observe(t.body,{attributes:!0}));let l=typeof r.matchMedia=="function"?r.matchMedia("(prefers-color-scheme: dark)"):null;l&&typeof l.addEventListener=="function"&&l.addEventListener("change",i);function s(){o&&o.disconnect(),l&&typeof l.removeEventListener=="function"&&l.removeEventListener("change",i)}}function Ua({open:e,close:t,isOpen:r,getTheme:n=()=>null,views:i=Ht},o=document){let l=o.querySelector(`[${I}]`);if(l)return l;if(!o.querySelector(`[${fo}]`)){let A=o.createElement("style");A.setAttribute(fo,""),A.setAttribute("editor-ui",""),o.getElementById(po)||(A.id=po),A.setAttribute("no-save",""),A.setAttribute("snapshot-remove",""),A.setAttribute("save-ignore",""),A.textContent=Ia,o.head.insertBefore(A,o.head.firstChild)}let s=o.createElement("hypercms-toggle");s.className="hcms-shell pixel-quiet",o.getElementById(ho)||(s.id=ho),s.setAttribute(I,""),s.setAttribute("editor-ui",""),s.setAttribute("no-save",""),s.setAttribute("snapshot-remove",""),s.setAttribute("save-ignore",""),s.innerHTML='<button type="button" class="hcms-toggle__main mirk-button"><span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span></button>';let a=o.defaultView,d=s.querySelector(".hcms-toggle__main"),u=Ht.filter(A=>i.includes(A)),f=u.length>1,c=f?Ba(o):null,h=f?Ha(o,u):null;f&&(s.setAttribute(wo,""),s.appendChild(c),s.appendChild(h)),nt(s,{position:"fixed",right:"calc(var(--hcms-toggle-offset, 16px) + var(--hcms-toggle-shift, 0px))",bottom:"calc(var(--hcms-toggle-offset, 16px) + env(safe-area-inset-bottom, 0px))","z-index":"var(--hcms-toggle-z, 2147482900)"}),nt(d,{background:$r}),c&&nt(c,{background:$r}),h&&nt(h,{position:"absolute",right:"0",bottom:"calc(100% + 8px)","z-index":"var(--hcms-toggle-z, 2147482900)",display:"none"});let m=()=>h?[...h.querySelectorAll('[role="menuitemradio"]')]:[];function p(A){if(!(!A||typeof A.focus!="function"))try{A.focus({preventScroll:!0})}catch{A.focus()}}function g(A){let j=m();j.length&&p(j[(A+j.length)%j.length])}function b(){let A=go(a);for(let j of m())j.setAttribute("aria-checked",String(j.getAttribute("data-hcms-view")===A))}function y(A){s.contains(A.target)||x()}function w(A){h&&(h.hidden=!A,nt(h,{display:A?"block":"none"}),c.setAttribute("aria-expanded",String(A)),A?(b(),o.addEventListener("pointerdown",y,!0)):o.removeEventListener("pointerdown",y,!0))}function E(A=0){w(!0),g(A)}function x({focusArrow:A=!1}={}){!h||h.hidden||(w(!1),A&&p(c))}function T(){let A=go(a);return A&&u.includes(A)?A:null}async function C(A){await e({view:A}),Na(a,A)}async function H(){if(r()){t();return}let A=T();return A?e({view:A}):f?E():e(u[0]?{view:u[0]}:{})}async function P(A){try{await A()}catch(j){console.warn("hypercms: toggle failed to open the CMS",j)}}s.addEventListener("click",async A=>{c&&c.contains(A.target)||h&&h.contains(A.target)||await P(H)}),c&&(c.addEventListener("click",A=>{A.preventDefault(),h.hidden?E():x({focusArrow:!0})}),c.addEventListener("keydown",A=>{if(A.key==="ArrowUp"){A.preventDefault(),E(-1);return}(A.key==="ArrowDown"||A.key==="Enter"||A.key===" ")&&(A.preventDefault(),E(0))}),h.addEventListener("click",A=>{let j=A.target.closest?.('[role="menuitemradio"]');j&&(A.preventDefault(),x(),P(()=>C(j.getAttribute("data-hcms-view"))))}),h.addEventListener("keydown",A=>{let j=m(),ge=j.indexOf(o.activeElement);switch(A.key){case"ArrowDown":A.preventDefault(),g(ge+1);break;case"ArrowUp":A.preventDefault(),g(ge-1);break;case"Home":A.preventDefault(),g(0);break;case"End":A.preventDefault(),g(j.length-1);break;case"Enter":case" ":if(A.preventDefault(),ge===-1)break;x(),P(()=>C(j[ge].getAttribute("data-hcms-view")));break;case"Escape":A.preventDefault(),x({focusArrow:!0});break;case"Tab":x();break}}));let K=A=>{let j=n();s.classList.toggle("light",j==="light"),s.classList.toggle("dark",j==="dark"),A?s.setAttribute(Bt,"open"):s.removeAttribute(Bt)};return K(r()),o.addEventListener("hcms:open",()=>K(!0)),o.addEventListener("hcms:close",()=>K(!1)),o.body.appendChild(s),ae(o),za(s),s}function Ba(e){let t=e.createElement("button");return t.type="button",t.className="hcms-toggle__arrow mirk-button",t.setAttribute("aria-haspopup","menu"),t.setAttribute("aria-expanded","false"),t.setAttribute("aria-label","Choose where to edit"),t.textContent="\u25BE",t}function Ha(e,t){let r=e.createElement("div");r.className="hcms-toggle__menu",r.setAttribute("role","menu"),r.setAttribute("aria-label","Where to edit"),r.hidden=!0;for(let n of t){let i=e.createElement("button");i.type="button",i.className="hcms-toggle__item",i.setAttribute("role","menuitemradio"),i.setAttribute("aria-checked","false"),i.setAttribute("data-hcms-view",n),i.tabIndex=-1,i.textContent=La[n],r.appendChild(i)}return r}function Eo(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Fa({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Ua(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function So(e){if(Ei(e),typeof document<"u"){let t=document.getElementById("hcms-shell-styles");t?.tagName==="LINK"&&t.remove(),ae(document)}}var Ur={sidebar:Mi,inline:to};function Vt(e={}){let t=e.view||(L.isOpen?L.ctx.view.name:"sidebar"),r=Ur[t];if(!r)throw new Error(`hypercms: unknown view "${t}" (expected ${Object.keys(Ur).join(" or ")})`);let n=L.isOpen?{...L.opts,...e,view:t}:e,i=n.pageRoot||(typeof document<"u"?document.body:null);if(!i)throw new Error("hypercms: no pageRoot available");let o=i.ownerDocument||(typeof document<"u"?document:null);if(!o)throw new Error("hypercms: no document available");let l=null,s=null;if(L.isOpen){if(L.ctx.view.name===t)return;l=L.ctx.previouslyFocused,s=L.ctx.view.name,Ut(L.ctx,{restoreFocus:!1,updateUrl:!1,reason:"switch"})}Ki();let a=r({doc:o,pageRoot:i,opts:n}),d=ao({view:a,doc:o,pageRoot:i,opts:n,onCloseRequested:()=>Br(),onViewRequested:u=>Vt({view:u})});l&&(d.previouslyFocused=l);try{a.mount(d.initialData),co(d),a.focusOnOpen(),L.isOpen=!0,L.ctx=d,L.opts=n,d.dispatch("hcms:open",{pageRoot:i,previous:s})}catch(u){throw Ut(d,{dispatch:!1,restoreFocus:!!l,updateUrl:!1}),u}}function Br(){L.isOpen&&Ut(L.ctx)}function To(){L.isOpen&&L.ctx.view.refresh("api")}function Va(){return L.isOpen}function Wa(){return L.isOpen&&L.ctx?L.ctx.view.name:null}var Ka={getData(){return L.isOpen?W(L.ctx):null},setValue(e,t){if(!L.isOpen)throw new Error("hypercms: cms is not open");let r=L.ctx,n=ee(e),i=ue(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=Tt(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);Ct(o,t,r.formRoot,e),G(W(r),{path:e,structural:!1},r)},addItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");Ye(e,L.ctx)},removeItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");let t=L.ctx,r=ee(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=ue(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let l=t.formRoot.querySelector(`[data-hcms-path="${Za(e)}"]`);if(!l)throw new Error(`hypercms: no element at path "${e}"`);Ne(l,t)},refresh:To,_commit(){if(!L.isOpen)return;let e=L.ctx;return Rt(e.formRoot),pe("Update",()=>G(W(e),{path:"",structural:!0},e))}},Ga=250,Ya=1e4;function Xa(){typeof window>"u"||typeof document>"u"||mo(window.location?window.location.search:"")&&(L.isOpen||Ja(()=>{if(!L.isOpen)try{Vt()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function zr(){return!!document.body&&!!z("Mutation")}function Ja(e){if(zr()){queueMicrotask(e);return}let t=Date.now()+Ya,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function l(){if(L.isOpen){o();return}zr()&&(o(),e())}i=Re(document,li,l),n=setInterval(()=>{if(L.isOpen){o();return}if(zr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},Ga)}Xa();Eo({open:Vt,close:Br,isOpen:Va,getTheme:()=>L.opts?.theme,views:Object.keys(Ur),hasRules:e=>!!V.findRules(e,"cms")});var Hr={open:Vt,close:Br,refresh:To,api:Ka,get isOpen(){return L.isOpen},currentView:Wa,path:lr,scaffold:We,morphForm:ct};function Za(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Co=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let l=n.files[0],s=document.createElement("a");if(s.className="mirk-file__name",s.dataset.filled="",s.href=URL.createObjectURL(l),s.target="_blank",s.rel="noopener",s.textContent=l.name,o.replaceWith(s),!i.querySelector(".mirk-file__remove")){let a=document.createElement("button");a.type="button",a.className="mirk-file__remove",a.setAttribute("aria-label","Remove file"),a.innerHTML=e,s.after(a)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let l=i.querySelector(".mirk-image__placeholder"),s=new FileReader;s.onload=a=>{o.src=a.target.result,o.removeAttribute("hidden"),l&&l.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},s.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),l=o?.querySelector(".mirk-file__input"),s=o?.querySelector(".mirk-file__name");if(l&&(l.value=""),s){let a=document.createElement("span");a.className="mirk-file__name",a.textContent="No file chosen",s.replaceWith(a)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),l=o?.querySelector(".mirk-image__input"),s=o?.querySelector(".mirk-image__preview");l&&(l.value=""),s&&(s.removeAttribute("src"),s.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let l=document.createElement("button");l.type="button",l.className="mirk-tags__remove",l.textContent="\xD7";let s=document.createElement("span");if(s.className="mirk-tags__chip",n){let a=document.createElement("span");a.className="mirk-tags__chip-inner",a.append(i,o,l),s.append(a)}else s.append(i,o,l);return s}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(a=>a.remove());let s=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(s).then(()=>{let a=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=a,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();So(Co);var Wt=Hr,tc={cms:Hr};typeof window<"u"&&!window.__hyperclayNoAutoExport&&(window.hyperclay=window.hyperclay||{},window.hyperclay.hypercms=Wt,window.h=window.hyperclay);var wh=Wt,_h=Vr;export{wh as cms,_h as default};
