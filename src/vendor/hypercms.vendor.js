var hypercms=(()=>{var nt=Object.defineProperty;var Jr=Object.getOwnPropertyDescriptor;var Xr=Object.getOwnPropertyNames;var Zr=Object.prototype.hasOwnProperty;var ot=(e,t)=>{for(var r in t)nt(e,r,{get:t[r],enumerable:!0})},Qr=(e,t,r,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of Xr(t))!Zr.call(e,n)&&n!==r&&nt(e,n,{get:()=>t[n],enumerable:!(i=Jr(t,n))||i.enumerable});return e};var ei=e=>Qr(nt({},"__esModule",{value:!0}),e);var fo={};ot(fo,{cms:()=>uo,default:()=>po});var Re=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],st=new Set(Re),Ut=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),Wt=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var Me={};ot(Me,{EmptyListInsert:()=>fe,MAX_RULE_DEPTH:()=>ie,MaxRuleDepthExceeded:()=>G,RuleTargetReadOnly:()=>ge,RulesParseError:()=>re,ShapeMismatch:()=>pe,UnknownRulesVersion:()=>ue,UpgradeAlreadyRegistered:()=>Te});var re=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ue=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},ie=20,G=class extends Error{constructor(t){super(`rule depth exceeded ${ie} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},pe=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},fe=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},ge=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}},Te=class extends Error{constructor(){super("upgrade transform already registered; only one registration is allowed per page."),this.name="UpgradeAlreadyRegistered"}};function U(e,t,r,i={}){return at(e,t,r,{depth:0,path:[]},i)}function at(e,t,r,i,n){if(i.depth>ie)throw new G(i.path);if(typeof r=="string")return ti(e,t,r,n);if(Array.isArray(r)){let[o,a]=r;return e.find(t,o,n).map((l,c)=>at(e,l,a,{depth:i.depth+1,path:[...i.path,c]},n))}if(typeof r=="object"&&r!==null){let o={};for(let[a,s]of Object.entries(r))o[a]=at(e,t,s,{depth:i.depth+1,path:[...i.path,a]},n);return o}return null}function ti(e,t,r,i){if(r.endsWith("[]")){let o=r.slice(0,-2);return e.find(t,o,i).map(a=>e.text(a))}if(r.startsWith("@"))return Vt(e,t,r.slice(1));if(r.includes("@")){let o=r.lastIndexOf("@"),a=r.slice(0,o),s=r.slice(o+1),l=a?e.find(t,a,i):[t];return l.length===0?null:Vt(e,l[0],s)}if(r===".")return e.text(t);let n=e.find(t,r,i);return n.length===0?null:e.text(n[0])}function Vt(e,t,r){if(st.has(r)){let n=e.prop(t,r);return n==null?null:String(n)}let i=e.attr(t,r);return i||null}var ri=.5;function lt(e,t,r,i,n,o,a,s={}){let l=e.find(t,r,s);if(n.length===0){l.forEach(S=>e.remove(S));return}let c=n.length>l.length,m=l[0]||null;if(c&&!m&&(m=ai(e,t,r,s),!m))throw new fe(o.path);let d=l.map(S=>ii(e,S,i,s)),u=null;if(m){u=e.clone(m),s.templateAttr&&e.removeAttr(u,s.templateAttr);let S=e.stripIds(u);S>0&&console.warn(`[hyper-html-api] stripped ${S} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let y=ni(n,d,i),x=l[0]||m,M=e.parent(x),b=l.length>0?si(e,M,x):0,T=new Set,E=n.map((S,C)=>{let A=y[C];if(A>=0)return T.add(A),l[A];let g=e.clone(u);return e.stripIds(g),g});l.forEach((S,C)=>{T.has(C)||e.remove(S)}),E.forEach((S,C)=>{let A=b+C;e.children(M).findIndex(h=>e.sameNode(h,S))!==A&&e.insertAt(M,S,A)}),E.forEach((S,C)=>{if(i===null){let A=n[C],g=A==null?"":String(A);e.text(S)!==g&&e.text(S,g)}else{let A=a(e,S,i,n[C],{depth:o.depth+1,path:[...o.path,C]},s);A&&A!==S&&(E[C]=A)}})}function ii(e,t,r,i){return r===null?e.text(t):U(e,t,r,i)}function ni(e,t,r){let i=new Array(e.length).fill(-1),n=new Set;return e.forEach((o,a)=>{let s=-1,l=-1;t.forEach((c,m)=>{if(n.has(m))return;let d=oi(o,c,r),u=d===l&&s>=0?Math.abs(m-a)<Math.abs(s-a):!1;(d>l||u)&&(l=d,s=m)}),l>=ri&&(i[a]=s,n.add(s))}),i}function oi(e,t,r){if(r===null)return e===t?1:0;let i=Object.keys(r||{});if(i.length===0)return 0;let n=0;for(let o of i)JSON.stringify(e?.[o])===JSON.stringify(t?.[o])&&n++;return n/i.length}function si(e,t,r){let i=e.children(t);for(let n=0;n<i.length;n++)if(e.sameNode(i[n],r))return n;return-1}function ai(e,t,r,i){if(!i.templateAttr)return null;let n=t;for(;n;){let o=e.find(n,r,{includeRulesTag:!1});for(let a of o)if(e.attr(a,i.templateAttr)!=null)return a;n=e.parent(n)}return null}var Kt=new Set(["checked","selected","disabled","readOnly","paused"]);function Y(e,t,r,i,n={}){let o=[];if(ct(r,i,[],o),o.length)throw new pe(o);Oe(e,t,r,i,{depth:0,path:[]},n)}function Oe(e,t,r,i,n,o={}){if(n.depth>ie)throw new G(n.path);if(i===void 0)return t;if(typeof r=="string")return li(e,t,r,i,n,o);if(Array.isArray(r)){let[a,s]=r;return lt(e,t,a,s,i,n,Oe,o),t}if(typeof r=="object"&&r!==null){for(let[a,s]of Object.entries(r)){let l=Oe(e,t,s,i==null?i:i[a],{depth:n.depth+1,path:[...n.path,a]},o);l&&l!==t&&(t=l)}return t}return t}function li(e,t,r,i,n,o){if(r.endsWith("[]")){let s=r.slice(0,-2);return lt(e,t,s,null,i,n,Oe,o),t}if(r.startsWith("@"))return Gt(e,t,r.slice(1),i);if(r.includes("@")){let s=r.lastIndexOf("@"),l=r.slice(0,s),c=r.slice(s+1),m=l?e.find(t,l,o):[t];return m.length===0||Gt(e,m[0],c,i),t}if(r===".")return e.text(t,i==null?"":String(i)),t;let a=e.find(t,r,o);return a.length===0||e.text(a[0],i==null?"":String(i)),t}function Gt(e,t,r,i){if(Wt.has(r))throw new ge(r);if(r==="outerHTML"){let n=i==null?"":String(i);return e.replaceWith(t,n)}return Ut.has(r)?(e.prop(t,r,ci(r,i)),t):(e.attr(t,r,i==null?"":String(i)),t)}function ci(e,t){return t==null?Kt.has(e)?!1:"":Kt.has(e)?!!t:t}function ct(e,t,r,i){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((n,o)=>{typeof n=="object"&&n!==null&&i.push({path:ke([...r,o]),expected:"scalar",got:be(n)})}):i.push({path:ke(r),expected:"array",got:be(t)});return}t!==null&&typeof t=="object"&&i.push({path:ke(r),expected:"scalar",got:be(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){i.push({path:ke(r),expected:"array",got:be(t)});return}let n=e[1];t.forEach((o,a)=>ct(n,o,[...r,a],i));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){i.push({path:ke(r),expected:"object",got:be(t)});return}for(let[n,o]of Object.entries(e))ct(o,t[n],[...r,n],i)}}}function be(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function ke(e){return e.join(".")}function dt(e){try{return JSON.parse(e)}catch(t){throw new re(`Invalid strict JSON: ${t.message}`,t)}}function ye(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(n){let o=[],a=0;for(;a<n.length;){let s=n[a];if(/\s/.test(s)){a++;continue}if("{}".includes(s)){o.push({type:s,value:s}),a++;continue}if(s==="["){let d=!1,u=a+1;for(;u<n.length&&/\s/.test(n[u]);)u++;if(u<n.length&&/[a-zA-Z_]/.test(n[u])&&(d=!0),!d){o.push({type:s,value:s}),a++;continue}}if(s==="]"){o.push({type:s,value:s}),a++;continue}if(s===":"){o.push({type:t.COLON,value:s}),a++;continue}if(s===","){o.push({type:t.COMMA,value:s}),a++;continue}if(s==='"'||s==="'"){let d=s,u=a+1;for(;u<n.length&&n[u]!==d;)n[u]==="\\"&&u++,u++;o.push({type:t.STRING,value:n.substring(a+1,u),quoted:!0,sourceQuote:d}),a=u+1;continue}let l=a,c;for(;l<n.length&&!/[{},]/.test(n[l]);)if(n[l]===":"){let d=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],u=!1;for(let y of d){let x=y.substring(1);if(n.substring(l+1,l+1+x.length)===x){u=!0,l+=x.length;break}}if(!u)break}else if(n[l]==="["){for(l++;l<n.length&&n[l]!=="]";){if(n[l]==='"'||n[l]==="'"){let d=n[l];for(l++;l<n.length&&n[l]!==d;)n[l]==="\\"&&l++,l++}l++}l<n.length&&n[l]==="]"&&l++}else l++;c=n.substring(a,l);let m=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?m=t.NUMBER:c==="true"||c==="false"||c==="null"?m=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(m=t.SELECTOR),o.push({type:m,value:c,quoted:!1}),a=l}return o}function i(n){let o="";for(let a=0;a<n.length;a++){let s=n[a];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let l=n[a+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING&&s.quoted){let l=s.value;s.sourceQuote==="'"&&(l=l.replace(/\\'/g,"'"),l=l.replace(/(\\*)"/g,(c,m)=>m.length%2===0?m+'\\"':c)),o+=`"${l}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}if(s.type===t.SELECTOR||s.type===t.IDENTIFIER){o+=`"${s.value}"`;continue}o+=`"${s.value}"`}return o}try{let n=r(e),o=i(n);return JSON.parse(o)}catch(n){throw new re("Invalid extraction rules syntax: "+n.message,n)}}var di="1",Yt=/^[a-zA-Z0-9_-]+$/;function J(e,t,r){let i;if(r===void 0)i="script[data-rules-name]";else{if(typeof r!="string"||!Yt.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${Yt})`);i=`script[data-rules-name~="${r}"]`}let n=e.find(t,i,{includeRulesTag:!0});if(n.length===0)return null;r!==void 0&&n.length>1&&console.warn(`hyper-html-api: ${n.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=n[0],a=e.attr(o,"data-rules-version");if(a!==di)throw new ue(a);return{rules:ye(e.text(o)),tagNode:o}}function mt(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let i=t&&t.ownerDocument?t.ownerDocument:t;return J(e,i,r)}return null}function Jt(e,t,r,i){let n=mt(e,t,r);if(!n){let s=typeof r=="string"?`data-rules-name~="${r}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${s}`)}let{rules:o,tagNode:a}=n;return{rules:o,tagNode:a,get:()=>U(e,t,o,i),set:s=>Y(e,t,o,s,i)}}var Qt={includeClasses:!0,includeAttributes:["href","src","name","type","role","aria-label","alt","title"],excludeAttributePrefixes:["data-morph-","data-hyper-","data-im-"],textHintLength:64,excludeIds:!0,maxPathDepth:4,landmarks:["HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE"],weights:{signature:100,pathSegment:10,textMatch:20,textMismatch:25,uniqueCandidate:50,positionPenalty:1,slotMatch:30},minConfidence:101};function ui(e){let t=5381;for(let r=0;r<e.length;r++)t=(t<<5)+t^e.charCodeAt(r);return Math.abs(t).toString(36)}function pi(e){if(e.classList&&e.classList.length>0)return Array.from(e.classList).sort().join(" ");let t=e.getAttribute?.("class");return t?t.split(/\s+/).filter(Boolean).sort().join(" "):""}function fi(e,t){let r=[];for(let i of e.attributes||[]){let n=i.name;n==="id"||n==="class"||t.excludeAttributePrefixes.some(o=>n.startsWith(o))||t.includeAttributes.includes(n)&&r.push(`${n}=${i.value}`)}return r.sort().join("|")}function gi(e,t){return(e.textContent||"").replace(/\s+/g," ").trim().slice(0,t.textHintLength)}function bi(e,t){let r=[e.tagName];return t.includeClasses&&r.push(pi(e)),r.push(fi(e,t)),ui(r.join("|"))}function ki(e){let t=e.tagName,r=1,i=e.previousElementSibling;for(;i;)i.tagName===t&&r++,i=i.previousElementSibling;return r}function yi(e,t){return e.id||e.getAttribute?.("role")?!0:t.landmarks.includes(e.tagName)}function vi(e){if(e.id)return`#${e.id}`;let t=e.getAttribute?.("role");return t?`@${t}`:e.tagName}function xi(e,t){let r=[],i=e;for(;i&&i.tagName&&r.length<t.maxPathDepth;){let n=`${i.tagName}:${ki(i)}`;if(r.unshift(n),i!==e&&yi(i,t)){r.unshift(vi(i));break}i=i.parentElement}return r}function wi(e,t){let r=0,i=e.length-1,n=t.length-1;for(;i>=0&&n>=0&&e[i]===t[n];)r++,i--,n--;return r}function P(e,t,r){if(r.has(e))return r.get(e);let i={signature:bi(e,t),path:xi(e,t),textHint:gi(e,t)};return r.set(e,i),i}function ir(e,t,r,i){if(i.has(e))return i.get(e);let n=new Map,o=e.querySelectorAll("*"),a=0;for(let s of o){let l=P(s,t,r);l.domIndex=a++,n.has(l.signature)||n.set(l.signature,[]),n.get(l.signature).push(s)}return i.set(e,n),n}function _i(e,t,r){r.delete(e),t.delete(e);let i=e.querySelectorAll("*");for(let n of i)t.delete(n)}function ht(e,t,r,i,n){let o=P(e,r,i),a=P(t,r,i),s=r.weights,l={},c=0;if(o.signature!==a.signature)return{score:0,breakdown:{rejected:"signature mismatch"}};c+=s.signature,l.signature=s.signature;let d=wi(o.path,a.path)*s.pathSegment;c+=d,l.path=d;let u=!0;if(o.textHint&&a.textHint?o.textHint===a.textHint?(c+=s.textMatch,l.text=s.textMatch):(c-=s.textMismatch,l.text=-s.textMismatch,u=!1):o.textHint!==a.textHint&&(c-=s.textMismatch,l.text=-s.textMismatch,u=!1),n.candidateCount===1&&u&&(c+=s.uniqueCandidate,l.unique=s.uniqueCandidate),typeof o.domIndex=="number"&&typeof a.domIndex=="number"){let y=Math.abs(o.domIndex-a.domIndex),x=Math.min(y*s.positionPenalty,20);c-=x,l.drift=-x}return{score:c,breakdown:l}}function er(e,t,r,i,n){if(r.excludeIds&&e.id)return null;let o=ir(t,r,i,n),a=P(e,r,i);if(typeof a.domIndex!="number"){let u=0,y=e.previousElementSibling;for(;y;)u++,y=y.previousElementSibling;a.domIndex=u}let s=o.get(a.signature)||[],l=r.excludeIds?s.filter(u=>!u.id):s;if(l.length===0)return null;let c=null,m=0,d=null;for(let u of l){let{score:y,breakdown:x}=ht(e,u,r,i,{candidateCount:l.length});y>m&&(m=y,c=u,d=x)}return m<r.minConfidence?null:{element:c,confidence:m,breakdown:d}}function Ai(e,t,r,i){let n=[],o=r.weights.signature+r.weights.slotMatch,a={slot:o};function s(d){if(d.children)return d.children;let u=d.childNodes;if(!u)return[];let y=[];for(let x=0;x<u.length;x++)u[x].nodeType===1&&y.push(u[x]);return y}function l(d,u){let y=s(d),x=s(u);if(y.length===x.length)for(let M=0;M<y.length;M++){let b=y[M],T=x[M];if(r.excludeIds&&(b.id||T.id)||b.tagName!==T.tagName)continue;let E=P(b,r,i).signature,S=P(T,r,i).signature;E!==S&&n.push({newEl:b,oldEl:T,score:o,breakdown:a}),l(b,T)}}function c(d,u){for(;;){if(d.tagName===u.tagName)return[d,u];let y=s(d);if(!d.tagName&&y.length===1){d=y[0];continue}let x=s(u);if(x.length===1&&x[0].tagName===d.tagName){u=x[0];continue}return null}}let m=c(e,t);return m&&l(m[0],m[1]),n}function tr(e,t,r,i,n){let o=t.querySelectorAll("*"),a=ir(e,r,i,n),s=0;for(let d of o){let u=P(d,r,i);u.domIndex=s++}let l=[];for(let d of o){if(r.excludeIds&&d.id)continue;let u=P(d,r,i),y=a.get(u.signature)||[],x=r.excludeIds?y.filter(M=>!M.id):y;for(let M of x){let{score:b,breakdown:T}=ht(d,M,r,i,{candidateCount:x.length});b>=r.minConfidence&&l.push({newEl:d,oldEl:M,score:b,breakdown:T})}}if(r.weights.slotMatch>0){let d=Ai(t,e,r,i);for(let u of d)l.push(u)}l.sort((d,u)=>u.score-d.score);let c=new Map,m=new Set;for(let{newEl:d,oldEl:u}of l)c.has(d)||m.has(u)||(c.set(d,u),m.add(u));return c}function rr(e,t,r,i){let n=P(e,r,i),o=P(t,r,i),{score:a,breakdown:s}=ht(e,t,r,i,{candidateCount:1});return{matches:a>=r.minConfidence,score:a,breakdown:s,newMeta:{signature:n.signature,path:n.path,textHint:n.textHint},oldMeta:{signature:o.signature,path:o.path,textHint:o.textHint}}}function nr(e={}){let t={...Qt,...e,weights:{...Qt.weights,...e.weights}},r=new WeakMap,i=new WeakMap;return{findMatch:(n,o)=>er(n,o,t,r,i),computeMatches:(n,o)=>tr(n,o,t,r,i),explain:(n,o)=>rr(n,o,t,r),invalidate:n=>_i(n,r,i),session:()=>{let n=new WeakMap,o=new WeakMap;return{findMatch:(a,s)=>er(a,s,t,n,o),computeMatches:(a,s)=>tr(a,s,t,n,o),explain:(a,s)=>rr(a,s,t,n)}},getConfig:()=>({...t})}}var Si=nr(),ut=(function(){"use strict";let e=()=>{};function t(b){if(!(b instanceof Element))return!1;if(b.hasAttribute("save-ignore"))return!0;if(b.tagName==="LINK"||b.tagName==="SCRIPT"){let T=b.getAttribute("src")||b.getAttribute("href")||"";if(T.startsWith("chrome-extension://")||T.startsWith("moz-extension://")||T.startsWith("safari-web-extension://"))return!0}return!1}function r(b,T){if(T!=="smart")return b.outerHTML;let E=b.getAttribute("src"),S=b.getAttribute("type")||"text/javascript";if(E)try{let C=new URL(E,window.location.href);return`ext:${S}:${C.origin}${C.pathname}${C.search}`}catch{return`ext:${S}:${E}`}else{let C=b.textContent.trim(),A=5381;for(let g=0;g<C.length;g++)A=(A<<5)+A^C.charCodeAt(g);return`inline:${S}:${Math.abs(A).toString(36)}`}}let i={morphStyle:"outerHTML",callbacks:{beforeNodeAdded:e,afterNodeAdded:e,beforeNodeMorphed:e,afterNodeMorphed:e,beforeNodeRemoved:e,afterNodeRemoved:e,beforeAttributeUpdated:e},head:{style:"merge",shouldPreserve:b=>b.getAttribute("im-preserve")==="true",shouldReAppend:b=>b.getAttribute("im-re-append")==="true",shouldRemove:e,afterHeadMorphed:e},scripts:{handle:!1,matchMode:"outerHTML",shouldPreserve:b=>b.getAttribute("im-preserve")==="true",shouldReAppend:b=>b.getAttribute("im-re-append")==="true",shouldRemove:e,afterScriptsHandled:e},restoreFocus:!0},n={computeMatches(b,T){let{computeMatches:E}=Si.session();return E(b,T)}};function o(b,T,E={}){b=x(b);let S=M(T),C=y(b,S,E),A=C.scripts.matchMode,g=new Set(Array.from(b.querySelectorAll("script")).map(p=>r(p,A))),w=s(C,()=>m(C,b,S,p=>p.morphStyle==="innerHTML"?(l(p,b,S),Array.from(b.childNodes)):a(p,b,S)));C.pantry.remove();let h=u(b,g,C);return h.length>0?w instanceof Promise?w.then(p=>Promise.all(h).then(()=>p)):Promise.all(h).then(()=>w):w}function a(b,T,E){let S=M(T);return l(b,S,E,T,T.nextSibling),Array.from(S.childNodes)}function s(b,T){if(!b.config.restoreFocus)return T();let E=document.activeElement;if(!(E instanceof HTMLInputElement||E instanceof HTMLTextAreaElement))return T();let{id:S,selectionStart:C,selectionEnd:A}=E,g=T();return S&&S!==document.activeElement?.getAttribute("id")&&(E=b.target.querySelector(`[id="${S}"]`),E?.focus()),E&&!E.selectionEnd&&A!=null&&E.setSelectionRange(C,A),g}let l=(function(){function b(h,p,k,f=null,v=null){p instanceof HTMLTemplateElement&&k instanceof HTMLTemplateElement&&(p=p.content,k=k.content),f||=p.firstChild;for(let _ of k.childNodes){if(t(_))continue;if(f&&f!=v){let O=E(h,_,f,v);if(O){O!==f&&C(h,f,O),c(O,_,h),f=O.nextSibling;continue}}if(_ instanceof Element){let O=_.getAttribute("id");if(h.persistentIds.has(O)){let j=A(p,O,f,h);c(j,_,h),f=j.nextSibling;continue}if(!h.idMap.has(_)){let j=h.hyperMatches.get(_);if(j&&!h.idMap.has(j)){w(p,j,f),c(j,_,h),f=j.nextSibling;continue}}}let R=T(p,_,f,h);R&&(f=R.nextSibling)}for(;f&&f!=v;){let _=f;f=f.nextSibling,t(_)||S(h,_)}}function T(h,p,k,f){if(f.callbacks.beforeNodeAdded(p)===!1)return null;if(f.idMap.has(p)){let v=document.createElement(p.tagName);return h.insertBefore(v,k),c(v,p,f),f.callbacks.afterNodeAdded(v),v}else{let v=document.importNode(p,!0);return h.insertBefore(v,k),f.callbacks.afterNodeAdded(v),v}}let E=(function(){function h(f,v,_,R){let O=v instanceof Element&&!f.idMap.has(v)?f.hyperMatches.get(v):null,j=null,$=v.nextSibling,he=0,N=_;for(;N&&N!=R;){if(k(N,v)){if(p(f,N,v)||N===O&&!f.idMap.has(N))return N;if(j===null){let ee=N instanceof Element&&f.hyperMatchedOldElements.has(N);!f.idMap.has(N)&&!ee&&(j=N)}}if(j===null&&$&&k(N,$)&&(he++,$=$.nextSibling,he>=2&&(j=void 0)),f.activeElementAndParents.includes(N))break;N=N.nextSibling}return j||null}function p(f,v,_){let R=f.idMap.get(v),O=f.idMap.get(_);if(!O||!R)return!1;for(let j of R)if(O.has(j))return!0;return!1}function k(f,v){let _=f,R=v;return _.nodeType===R.nodeType&&_.tagName===R.tagName&&(!_.getAttribute?.("id")||_.getAttribute?.("id")===R.getAttribute?.("id"))}return h})();function S(h,p){let k=p instanceof Element&&h.hyperMatchedOldElements.has(p)&&!h.idMap.has(p);if(h.idMap.has(p)||k)w(h.pantry,p,null);else{if(h.callbacks.beforeNodeRemoved(p)===!1)return;p.parentNode?.removeChild(p),h.callbacks.afterNodeRemoved(p)}}function C(h,p,k){let f=p;for(;f&&f!==k;){let v=f;f=f.nextSibling,t(v)||S(h,v)}return f}function A(h,p,k,f){let v=f.target.getAttribute?.("id")===p&&f.target||f.target.querySelector(`[id="${p}"]`)||f.pantry.querySelector(`[id="${p}"]`);return g(v,f),w(h,v,k),v}function g(h,p){let k=h.getAttribute("id");for(;h=h.parentNode;){let f=p.idMap.get(h);f&&(f.delete(k),f.size||p.idMap.delete(h))}}function w(h,p,k){if(h.moveBefore)try{h.moveBefore(p,k)}catch{h.insertBefore(p,k)}else h.insertBefore(p,k)}return b})(),c=(function(){function b(g,w,h){return h.ignoreActive&&g===document.activeElement?null:(h.callbacks.beforeNodeMorphed(g,w)===!1||(g instanceof HTMLHeadElement&&h.head.ignore||(g instanceof HTMLHeadElement&&h.head.style!=="morph"?d(g,w,h):(T(g,w,h),A(g,h)||l(h,g,w))),h.callbacks.afterNodeMorphed(g,w)),g)}function T(g,w,h){let p=w.nodeType;if(p===1){let k=g,f=w,v=k.attributes,_=f.attributes;for(let R of _)C(R.name,k,"update",h)||k.getAttribute(R.name)!==R.value&&k.setAttribute(R.name,R.value);for(let R=v.length-1;0<=R;R--){let O=v[R];if(O&&!f.hasAttribute(O.name)){if(C(O.name,k,"remove",h))continue;k.removeAttribute(O.name)}}A(k,h)||E(k,f,h)}(p===8||p===3)&&g.nodeValue!==w.nodeValue&&(g.nodeValue=w.nodeValue)}function E(g,w,h){if(g instanceof HTMLInputElement&&w instanceof HTMLInputElement&&w.type!=="file"){let p=w.value,k=g.value;S(g,w,"checked",h),S(g,w,"disabled",h),h.formStateSync==="property"?k!==p&&(C("value",g,"update",h)||(g.value=p)):w.hasAttribute("value")?k!==p&&(C("value",g,"update",h)||(g.setAttribute("value",p),g.value=p)):C("value",g,"remove",h)||(g.value="",g.removeAttribute("value"))}else if(g instanceof HTMLOptionElement&&w instanceof HTMLOptionElement)S(g,w,"selected",h);else if(g instanceof HTMLTextAreaElement&&w instanceof HTMLTextAreaElement){let p=w.value,k=g.value;if(C("value",g,"update",h))return;p!==k&&(g.value=p),g.firstChild&&g.firstChild.nodeValue!==p&&(g.firstChild.nodeValue=p)}}function S(g,w,h,p){let k=w[h],f=g[h];if(k!==f){let v=C(h,g,"update",p);if(v||(g[h]=w[h]),p.formStateSync==="property")return;k?v||g.setAttribute(h,""):C(h,g,"remove",p)||g.removeAttribute(h)}}function C(g,w,h,p){return g==="value"&&p.ignoreActiveValue&&w===document.activeElement?!0:p.callbacks.beforeAttributeUpdated(g,w,h)===!1}function A(g,w){return!!w.ignoreActiveValue&&g===document.activeElement&&g!==document.body}return b})();function m(b,T,E,S){if(b.head.block){let C=T.querySelector("head"),A=E.querySelector("head");if(C&&A){let g=d(C,A,b);return Promise.all(g).then(()=>{let w=Object.assign(b,{head:{block:!1,ignore:!0}});return S(w)})}}return S(b)}function d(b,T,E){let S=[],C=[],A=[],g=[],w=E.scripts.matchMode,h=f=>{if(f.tagName==="SCRIPT")return r(f,w);if(f.tagName==="LINK"&&w==="smart"){let v=f.getAttribute("href");if(v)try{let _=new URL(v,window.location.href);return`link:${f.getAttribute("rel")||""}:${_.origin}${_.pathname}${_.search}`}catch{}}return f.outerHTML},p=new Map;for(let f of T.children)t(f)||p.set(h(f),f);for(let f of b.children){let v=h(f),_=p.has(v),R=E.head.shouldReAppend(f),O=E.head.shouldPreserve(f);_||O?R?C.push(f):(p.delete(v),A.push(f)):E.head.style==="append"?R&&(C.push(f),g.push(f)):E.head.shouldRemove(f)!==!1&&!t(f)&&C.push(f)}g.push(...p.values());let k=[];for(let f of g){let v=document.createRange().createContextualFragment(f.outerHTML).firstChild;if(E.callbacks.beforeNodeAdded(v)!==!1){if("href"in v&&v.href||"src"in v&&v.src){let _,R=new Promise(function(O){_=O});v.addEventListener("load",function(){_()}),k.push(R)}b.appendChild(v),E.callbacks.afterNodeAdded(v),S.push(v)}}for(let f of C)E.callbacks.beforeNodeRemoved(f)!==!1&&(b.removeChild(f),E.callbacks.afterNodeRemoved(f));return E.head.afterHeadMorphed(b,{added:S,kept:A,removed:C}),k}function u(b,T,E){if(!E.scripts.handle)return[];let S=[],C=[],A=[],g=[],w=E.scripts.matchMode,h=Array.from(b.querySelectorAll("script"));for(let k of h){let f=r(k,w),v=T.has(f),_=E.scripts.shouldPreserve(k),R=E.scripts.shouldReAppend(k);v||_?R?(C.push(k),g.push(k)):A.push(k):g.push(k)}for(let k of T){let f=h.some(v=>v.outerHTML===k)}let p=[];for(let k of g){if(E.callbacks.beforeNodeAdded(k)===!1)continue;let f=document.createRange().createContextualFragment(k.outerHTML).firstChild;if(f.src){let v,_=new Promise(function(R){v=R});f.addEventListener("load",function(){v()}),f.addEventListener("error",function(){v()}),p.push(_)}k.replaceWith(f),E.callbacks.afterNodeAdded(f),S.push(f)}return E.scripts.afterScriptsHandled(b,{added:S,kept:A,removed:C}),p}let y=(function(){function b(h,p,k){let{persistentIds:f,idMap:v}=g(h,p),_=n.computeMatches(h,p);if(typeof k.key=="function"){let $=new Map,he=new Set,N=F=>{let I=k.key(F);I!=null&&($.has(I)?he.add(I):$.set(I,F))};h instanceof Element&&N(h);for(let F of h.querySelectorAll("*"))N(F);for(let F of he)$.delete(F);let ee=new Map;for(let[F,I]of _)ee.set(I,F);let tt=p.__hyperMorphRoot||p,Ce=new Map,Ht=new Set,zt=F=>{let I=k.key(F);I!=null&&(Ce.has(I)?Ht.add(I):Ce.set(I,F))};tt instanceof Element&&zt(tt);for(let F of tt.querySelectorAll("*"))zt(F);for(let F of Ht)Ce.delete(F);for(let[F,I]of Ce){let te=$.get(F);if(!te||te.tagName!==I.tagName)continue;let rt=ee.get(te);rt&&rt!==I&&_.delete(rt);let it=_.get(I);it&&it!==te&&ee.delete(it),_.set(I,te),ee.set(te,I)}}let R=new Set;for(let $ of _.values())R.add($);let O=T(k),j=O.morphStyle||"outerHTML";if(!["innerHTML","outerHTML"].includes(j))throw`Do not understand how to morph style ${j}`;return{target:h,newContent:p,config:O,morphStyle:j,ignoreActive:O.ignoreActive,ignoreActiveValue:O.ignoreActiveValue,restoreFocus:O.restoreFocus,formStateSync:O.formStateSync||"attribute",idMap:v,persistentIds:f,hyperMatches:_,hyperMatchedOldElements:R,pantry:E(),activeElementAndParents:S(h),callbacks:O.callbacks,head:O.head,scripts:O.scripts}}function T(h){let p=Object.assign({},i);return Object.assign(p,h),p.callbacks=Object.assign({},i.callbacks,h.callbacks),p.head=Object.assign({},i.head,h.head),p.scripts=Object.assign({},i.scripts,h.scripts),p}function E(){let h=document.createElement("div");return h.hidden=!0,document.body.insertAdjacentElement("afterend",h),h}function S(h){let p=[],k=document.activeElement;if(k?.tagName!=="BODY"&&h.contains(k))for(;k&&(p.push(k),k!==h);)k=k.parentElement;return p}function C(h){let p=Array.from(h.querySelectorAll("[id]"));return h.getAttribute?.("id")&&p.push(h),p}function A(h,p,k,f){for(let v of f){let _=v.getAttribute("id");if(p.has(_)){let R=v;for(;R;){let O=h.get(R);if(O==null&&(O=new Set,h.set(R,O)),O.add(_),R===k)break;R=R.parentElement}}}}function g(h,p){let k=C(h),f=C(p),v=w(k,f),_=new Map;A(_,v,h,k);let R=p.__hyperMorphRoot||p;return A(_,v,R,f),{persistentIds:v,idMap:_}}function w(h,p){let k=new Set,f=new Map;for(let{id:_,tagName:R}of h)f.has(_)?k.add(_):f.set(_,R);let v=new Set;for(let{id:_,tagName:R}of p)v.has(_)?k.add(_):f.get(_)===R&&v.add(_);for(let _ of k)v.delete(_);return v}return b})(),{normalizeElement:x,normalizeParent:M}=(function(){let b=new WeakSet;function T(A){return A instanceof Document?A.documentElement:A}function E(A){if(A==null)return document.createElement("div");if(typeof A=="string")return E(C(A));if(b.has(A))return A;if(A instanceof Node){if(A.parentNode)return new S(A);{let g=document.createElement("div");return g.append(A),g}}else{let g=document.createElement("div");for(let w of[...A])g.append(w);return g}}class S{constructor(g){this.originalNode=g,this.realParentNode=g.parentNode,this.previousSibling=g.previousSibling,this.nextSibling=g.nextSibling}get childNodes(){let g=[],w=this.previousSibling?this.previousSibling.nextSibling:this.realParentNode.firstChild;for(;w&&w!=this.nextSibling;)g.push(w),w=w.nextSibling;return g}querySelectorAll(g){return this.childNodes.reduce((w,h)=>{if(h instanceof Element){h.matches(g)&&w.push(h);let p=h.querySelectorAll(g);for(let k=0;k<p.length;k++)w.push(p[k])}return w},[])}insertBefore(g,w){return this.realParentNode.insertBefore(g,w)}moveBefore(g,w){return this.realParentNode.moveBefore(g,w)}get __hyperMorphRoot(){return this.originalNode}}function C(A){let g=new DOMParser,w=A.replace(/<svg(\s[^>]*>|>)([\s\S]*?)<\/svg>/gim,"");if(w.match(/<\/html>/)||w.match(/<\/head>/)||w.match(/<\/body>/)){let h=g.parseFromString(A,"text/html");if(w.match(/<\/html>/))return b.add(h),h;{let p=h.firstChild;return p&&b.add(p),p}}else{let p=g.parseFromString("<body><template>"+A+"</template></body>","text/html").body.querySelector("template").content;return b.add(p),p}}return{normalizeElement:T,normalizeParent:E}})();return{morph:o,defaults:i}})();var es=ut.morph,ts=ut.defaults,pt=ut;var Mi=null;function Le(){return Mi}function Ne(e,t){let r={carriedOver:0,discarded:0,listItems:0},i=ft(t,e,r);return gt(t,e,r),{data:i,summary:r}}function ft(e,t,r){if(typeof e=="string")return e.endsWith("[]")?Array.isArray(t)?(r.listItems+=t.length,r.carriedOver+=t.length,t):void 0:t==null?void 0:(r.carriedOver++,t);if(Array.isArray(e)){let[,i]=e;return Array.isArray(t)?(r.listItems+=t.length,t.map(n=>ft(i,n,r))):void 0}if(typeof e=="object"&&e!==null){let i={};for(let[n,o]of Object.entries(e)){let a=ft(o,t?.[n],r);a!==void 0&&(i[n]=a)}return i}}function gt(e,t,r){if(t!=null){if(typeof e=="object"&&e!==null&&!Array.isArray(e)){if(typeof t!="object"||Array.isArray(t))return;let i=new Set(Object.keys(e));for(let n of Object.keys(t))i.has(n)?gt(e[n],t[n],r):r.discarded+=je(t[n]);return}if(Array.isArray(e)&&Array.isArray(t)){let i=e[1];t.forEach(n=>gt(i,n,r));return}typeof e=="string"&&!e.endsWith("[]")&&typeof t=="object"&&t!==null&&(r.discarded+=je(t))}}function je(e){return e==null?0:Array.isArray(e)?e.reduce((t,r)=>t+je(r),0):typeof e=="object"?Object.values(e).reduce((t,r)=>t+je(r),0):1}function Oi(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function Li(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var ji={find(e,t,r={}){let i=Li(e);if(!i||!i.querySelectorAll)return[];let n=Array.from(i.querySelectorAll(t));r.includeRulesTag||(n=n.filter(a=>!Oi(a)));let o=[];if(r.skip&&o.push(r.skip),r.templateAttr&&o.push("["+r.templateAttr+"]"),o.length){let a=o.join(", ");n=n.filter(s=>!s.closest||!s.closest(a))}return n},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let i=e?e[t]:void 0;return i!==void 0?i:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let i=e.children[r]||null;e.insertBefore(t,i)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let i=e.ownerDocument.createElement("template");i.innerHTML=t;let n=i.content.firstElementChild;if(!n)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(n,e),n},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(i=>{i.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}},H=ji;var Ni="_hyperHtmlApi",Fi="upgrade-helper",Ii="parentOrigin";function yt(e=typeof location<"u"?location:null){if(!e)return!1;try{return new URLSearchParams(e.search).get(Ni)===Fi}catch{return!1}}function or(e=typeof location<"u"?location:null){return e?new URLSearchParams(e.search).get(Ii):null}function vt({win:e,doc:t,parentOrigin:r}={}){if(e=e||(typeof window<"u"?window:null),t=t||(typeof document<"u"?document:null),!e||!t||(r=r||or(e.location),!r))return;let i=()=>qi({win:e,doc:t,parentOrigin:r});t.readyState==="loading"?t.addEventListener("DOMContentLoaded",i,{once:!0}):i()}function qi({win:e,doc:t,parentOrigin:r}){let i;try{i=J(H,t.body)}catch(l){return bt(e,r,l)}if(!i)return bt(e,r,new Error("helper-mode: no rules tag in v2 document"));let n=i.rules,o=$i(t,"hyper-version"),a=!!Le(),s=l=>{if(l.source!==e.parent||l.origin!==r)return;let c=l.data;if(!(!c||c.type!=="hha:upgrade-data")){e.removeEventListener("message",s);try{let m=Di({doc:t,rules:n,v1Data:c.v1Data});e.parent.postMessage({type:"hha:upgrade-result",html:m.html,summary:m.summary},r)}catch(m){bt(e,r,m)}}};e.addEventListener("message",s),e.parent.postMessage({type:"hha:upgrade-ready",rules:n,version:o,hasTransform:a},r)}function Di({doc:e,rules:t,v1Data:r}){let i=Le(),n=r,o=!1;i&&(n=i(r),o=!0);let{data:a,summary:s}=Ne(n,t);Y(H,e.body,t,a);let l=U(H,e.body,t);return{html:`<!DOCTYPE html>
`+e.documentElement.outerHTML,summary:{...s,transformApplied:o,appliedFieldCount:kt(l)}}}function bt(e,t,r){e.parent.postMessage({type:"hha:upgrade-error",name:r?.name||"Error",message:r?.message||String(r)},t)}function $i(e,t){let r=e.querySelector(`meta[name="${t}"]`);return r?r.getAttribute("content"):null}function kt(e){return e==null?0:Array.isArray(e)?e.reduce((t,r)=>t+kt(r),0):typeof e=="object"?Object.values(e).reduce((t,r)=>t+kt(r),0):1}var q={extract:(e,t,r)=>U(H,e,t,r),apply:(e,t,r,i)=>Y(H,e,t,r,i),findRulesIn:(e,t)=>J(H,e,t),findRules:(e,t)=>mt(H,e,t),bind:(e,t,r)=>Jt(H,e,t,r),parseStrict:dt,parseRelaxed:ye,errors:Me,DOM_PROPERTIES:Re};typeof window<"u"&&yt(window.location)&&vt({win:window,doc:document});var wt={};ot(wt,{fromString:()=>W,getRuleAtPath:()=>X,getValueAtPath:()=>Ui,setAtPath:()=>xt,toString:()=>zi});function zi(e){return e.map(String).join(".")}function W(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function X(e,t){let r=e;for(let i of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof i=="number"||i==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof i!="number"&&i!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof i=="number"||!(i in r))return;r=r[i];continue}return}return r}function Ui(e,t){let r=e;for(let i of t){if(r==null)return;r=r[i]}return r}function xt(e,t,r){if(t.length===0)return r;let[i,...n]=t;if(typeof i=="number"){let o=Array.isArray(e)?[...e]:[];return o[i]=xt(o[i],n,r),o}return{...e&&typeof e=="object"?e:{},[i]:xt((e||{})[i],n,r)}}function ve(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,i]of Object.entries(e))t[r]=ve(i);return t}return""}function Fe(e,t,{ignoreActiveValue:r=!0}={}){pt.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property"})}function qe(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var Wi='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',_t='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',lr={"@scalar":`
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
      ${Wi}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${_t}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${_t}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${_t}</button>
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
  `},Vi=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function De(e){let t=e.head||e.documentElement;if(t)for(let r of Vi)hr(e,t,r)}function At(e,t){if(!lr[t])return null;let r=e&&(e.head||e.documentElement);return r?hr(e,r,t):null}var sr={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},Ie={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},Ki=new Set([...Object.values(Ie),"@chips","@chips-item"]);function xe(e,t,r){if(typeof e!="string")return"@scalar";let i=e.lastIndexOf("@"),n=Pe(we(e,i),t,"data-hcms-component");if(n&&Ie[n]){let o=Ie[n],a=Array.isArray(r)&&r.some(s=>s==="*"||typeof s=="number");return o==="@number"&&!ar(e,i,t,a).every(Yi)||(o==="@checkbox"||o==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!ar(e,i,t,a).every(Ji)?"@scalar":o}if(i>=0){let o=e.slice(i+1);if(sr[o])return sr[o]}return"@scalar"}function cr(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@"),i=Pe(we(e,r),t,"data-hcms-component");return i&&Ie[i]||null}var Gi=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Yi(e){return e==null||e===""?!0:Gi.test(String(e))}function Ji(e){return e==null||e===""||e==="true"||e==="false"}function ar(e,t,r,i){if(!r||!r.querySelectorAll)return[];let n=we(e,t);if(!n||n===".")return[];let o=null;try{o=r.querySelectorAll(n)}catch{return[]}let a=t>=0?e.slice(t+1):null,s=[];for(let l of o)if(!(l.closest&&l.closest("[cms-template], [data-hcms-shell]"))&&(a?a==="value"&&"value"in l?s.push(l.value):s.push(l.getAttribute?l.getAttribute(a):null):s.push((l.textContent||"").trim()),!i))break;return s}function $e(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let i=null;try{i=t.querySelector(r)}catch{return null}let n=i&&i.closest?i.closest("[data-hcms-component]"):null;return(n&&n.getAttribute?n.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function ne(e,t,r){let i=e.join("."),n=e.map(o=>typeof o=="number"?"*":o).join(".");return i&&B(r,i)||n&&n!==i&&B(r,n)||B(r,t)}function Be(e,t,r){let i=$e(e,r);if(!i)return null;let n=ne(t,i.array,r);return n&&n.getAttribute("data-hcms-tpl")===i.array?i:null}function dr(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@"),i=Pe(we(e,r),t,"data-hcms-options");if(i==null)return null;let n=i.trim().split(/\s+/).filter(Boolean);return n.length?n:null}function mr(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@");return Pe(we(e,r),t,"data-hcms-crop")}function we(e,t){return t>=0?e.slice(0,t):e}function Pe(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let i=null;try{i=t.querySelector(e)}catch{return null}return i&&i.getAttribute?i.getAttribute(r):null}function He(e,t){if(!e||t==null)return;r(t);function r(i){let n=Z(i);if(n==="scalar"){let o=xe(i,e);Ki.has(o)&&At(e,o);return}if(n==="scalar-array"){let o=$e(i,e);o&&(At(e,o.array),At(e,o.item));return}if(n==="object"){for(let o of Object.values(i))r(o);return}if(n==="object-array"){let o=i[1];if(o&&typeof o=="object"&&!Array.isArray(o))for(let a of Object.values(o))r(a);else r(o)}}}function hr(e,t,r){let i=B(e,r);if(i)return i;let n=e.createElement("template");return n.setAttribute("data-hcms-tpl",r),n.setAttribute("save-remove",""),n.innerHTML=lr[r].trim(),t.appendChild(n),n}function B(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${Xi(t)}"]`)}function Xi(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function Z(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function _e(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var ur={IMG:"src",A:"href"};function ze(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":ur[t]?ur[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function pr(e,t){let r=(e.tagName||"").toUpperCase(),i=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=ze(e),a=`${gr(r,i)}[data-hcms-field="${oe(t)}"]`;return r==="INPUT"&&i==="radio"?`${a}:checked@value`:n?`${a}@${n}`:a}function Zi(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=ze(e),o=`${gr(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:i?`${o}@${i}`:o}function gr(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function oe(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var fr=new Set(["__proto__","constructor","prototype"]);function Ue(e,t){return r(e,[]);function r(c,m){let d=Z(c);if(d==="scalar")return i(c,m);if(d==="scalar-array")return n(c,m);if(d==="object-array")return o(c,m);if(d==="object"){let u=Object.create(null);for(let[y,x]of Object.entries(c)){if(fr.has(y))throw new Error(`hypercms: rule key "${y}" is forbidden at "${m.join(".")||"<root>"}"`);u[y]=r(x,[...m,y])}return u}return null}function i(c,m){let d=m.length?m[m.length-1]:null,u=typeof d=="string"?d:"__value",y=l(m,u);if(y)return pr(y,u);let x=s(xe(c,t,m),u);return x?pr(x,u):`input[data-hcms-field="${oe(u)}"]@value`}function n(c,m){let d=Be(c,m,t),u=d&&s(d.item,null)||s("@scalar-array-item",null),y=u?Zi(u):"input[data-hcms-field]@value";return[a(m,"[data-hcms-array-item]"),y]}function o(c,m){let[,d]=c,u=[...m,"*"],y=a(m,"[data-hcms-card]");if(d&&typeof d=="object"&&!Array.isArray(d)){let x=Object.create(null);for(let[M,b]of Object.entries(d)){if(fr.has(M))throw new Error(`hypercms: rule key "${M}" is forbidden at "${u.join(".")}"`);x[M]=r(b,[...u,M])}return[y,x]}return[y,r(d,[...u,0])]}function a(c,m){let d=c.length?c[c.length-1]:"",u=c.some(M=>M==="*"),y=c.join(".");return`${u?`[data-hcms-field="${oe(d)}"]`:`[data-hcms-path="${oe(y)}"]`} > .hcms-array-items > ${m}`}function s(c,m){if(!t)return null;let d=B(t,c);if(!d)return null;let u=d.content||d;if(m){let y=u.querySelector(`[data-hcms-field="${oe(m)}"]`);if(y)return y}return u.querySelector("[data-hcms-field]")}function l(c,m){if(!t)return null;let d=c.map(x=>typeof x=="number"?"*":x).join("."),y=[c.join("."),d];for(let x=c.length-1;x>=0;x--){let M=c.slice(0,x).map(b=>typeof b=="number"?"*":b);M.push("*"),y.push(M.join("."))}for(let x of y){if(!x)continue;let M=B(t,x);if(!M||!_e(M))continue;let b=M.content||M,T=b.querySelector(`[data-hcms-field="${oe(m)}"]`)||b.querySelector("[data-hcms-field]");if(T)return T}return null}}function St(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function We({pageRules:e,formRules:t,data:r,doc:i}){let n=i.createDocumentFragment(),o=Et(e,[],r,i);return o&&n.appendChild(o),n}function kr({shape:e,itemShape:t,pathArr:r,data:i,doc:n,itemKey:o}){if(e==="object-array-item")return vr(t,r,i,n);if(e==="scalar-array-item")return xr(r,i,n,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function Et(e,t,r,i){let n=Z(e);return n==="scalar"?Qi(e,t,r,i):n==="object"?nn(e,t,r,i):n==="object-array"?on(e,t,r,i):n==="scalar-array"?sn(e,t,r,i):null}function Qi(e,t,r,i){let n=xe(e,i,t),o=ne(t,n,i);if(!o)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let a=cr(e,i);a==="@number"&&n==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(a==="@checkbox"||a==="@toggle")&&n==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${a}" but its value isn't true/false; rendering a text input so the value is preserved`),yr(o,a===n?a:null,t);let s=se(o,i);ae(s,t);let l=o.getAttribute?.("data-hcms-tpl");if((n==="@select"||n==="@radio")&&l===n&&en(s,e,t,r,i,n),n==="@image"&&l==="@image"){let c=mr(e,i);c!=null&&!s.hasAttribute("data-hcms-crop")&&s.setAttribute("data-hcms-crop",c)}return an(s,V(t)),Ve(s,V(t)),Ke(s,V(t)),Er(s,r),n==="@file"&&rn(s),s}function yr(e,t,r){if(!t)return;let i=e.getAttribute?.("data-hcms-tpl");i&&i!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${i}" wins`)}function en(e,t,r,i,n,o){let a=dr(t,n),s=a?[...a]:[],l=i==null?"":String(i);if(l!==""&&!s.includes(l)&&s.unshift(l),!a&&(tn(e,"data-hcms-options required (space-separated values)"),s.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let d=e.querySelector("select[data-hcms-field]");if(!d)return;for(let u of s){let y=n.createElement("option");y.value=u,y.textContent=qe(u),d.appendChild(y)}return}let c=e.querySelector(".mirk-radio");if(!c||!c.parentNode)return;let m=Ct(r.join("."));for(let d of s){let u=c.cloneNode(!0),y=u.querySelector('input[type="radio"]');y&&(y.value=d,y.name=m);let x=u.querySelector(".mirk-radio__label");x&&(x.textContent=qe(d)),c.parentNode.insertBefore(u,c)}c.remove()}function Ct(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function tn(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function rn(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=St(t.getAttribute("href")))}function nn(e,t,r,i){let n=ne(t,"@object",i);if(!n)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let o=se(n,i);if(ae(o,t),Ve(o,V(t)),Ke(o,V(t)),_e(n))return Rr(o,e,t),Cr(o,e,r),o;let a=Ge(o,".hcms-object-fields",n,t);for(let[s,l]of Object.entries(e)){let c=r==null?null:r[s],m=Et(l,[...t,s],c,i);m&&a.appendChild(m)}return o}function on(e,t,r,i){let n=ne(t,"@object-array",i);if(!n)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let o=se(n,i);ae(o,t),Ve(o,V(t)),Ke(o,V(t)),_r(o,n),Sr(o,n,t);let a=Ge(o,".hcms-array-items",n,t),[,s]=e;return(Array.isArray(r)?r:[]).forEach((c,m)=>{let d=vr(s,[...t,m],c,i);d&&a.appendChild(d)}),Ar(o),o}function vr(e,t,r,i){let n=wr(t,"object-array-item",i);if(!n)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let o=se(n,i);if(o.setAttribute("data-hcms-card",""),o.classList.contains("hcms-card")||o.classList.add("hcms-card"),ae(o,t),_e(n))return e&&typeof e=="object"&&!Array.isArray(e)&&(Rr(o,e,t),Cr(o,e,r)),o;let a=Ge(o,".hcms-card-fields",n,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[s,l]of Object.entries(e)){let c=r==null?null:r[s],m=Et(l,[...t,s],c,i);m&&a.appendChild(m)}return o}function sn(e,t,r,i){let n=$e(e,i),o=Be(e,t,i),a=n?n.array:"@scalar-array",s=ne(t,a,i);if(!s)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);yr(s,n?n.array:null,t);let l=se(s,i);ae(l,t),Ve(l,V(t)),Ke(l,V(t)),_r(l,s),Sr(l,s,t),o&&l.setAttribute("data-hcms-item-tpl",o.item);let c=Ge(l,".hcms-array-items",s,t);return(Array.isArray(r)?r:[]).forEach((d,u)=>{let y=xr([...t,u],d,i,o?o.item:null);y&&c.appendChild(y)}),Ar(l),l}function xr(e,t,r,i){let n=wr(e,"scalar-array-item",r,i);if(!n)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=se(n,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),ae(o,e),Er(o,t),o}function wr(e,t,r,i){let n=e.map(o=>typeof o=="number"?"*":o).join(".");return B(r,n)||i&&B(r,i)||B(r,"@"+t)}function se(e,t){let r=e.content||e,i=t.createElement("div");return i.appendChild(r.cloneNode(!0)),i.firstElementChild||i}function ae(e,t){e.setAttribute("data-hcms-path",t.join("."))}function an(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(n=>{n.getAttribute("data-hcms-field")||n.setAttribute("data-hcms-field",r)})}function Ve(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function Ke(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(i=>{(i.textContent||"").trim()===""&&(i.textContent=qe(String(t)))})}function _r(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function Ar(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),i=r.length,n=br(e,"data-hcms-max-items"),o=br(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector('[data-hcms-action="add"]');c&&(c.hidden=a||n!=null&&i>=n),r.forEach((m,d)=>{let u=m.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=s||o!=null&&i<=o);let y=m.querySelector('[data-hcms-action="move-up"]');y&&(y.hidden=l||d===0);let x=m.querySelector('[data-hcms-action="move-down"]');x&&(x.hidden=l||d===i-1)})}function br(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Sr(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let i=e.querySelector(".hcms-array-items");if(!i)return;let n="hcms-"+r.join(".");i.setAttribute("sortable",n),i.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function V(e){return e.length?e[e.length-1]:null}function Er(e,t){let r=ln(e);if(r.length!==0)for(let i of r)Tr(i,t)}function ln(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&cn(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(i=>t.push(i)),t}function cn(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function Cr(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(n=>{let o=n.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let a=r==null?null:r[o];Tr(n,a)})}function Rr(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(n=>{let o=n.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let a=[...r,o].join(".");n.setAttribute("data-hcms-path",a)})}function Ge(e,t,r,i){if(!e.querySelector)return e;let n=e.querySelector(t);if(n)return n;let o=r?.getAttribute?.("data-hcms-tpl")||i.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function Tr(e,t){let r=ze(e),i=(e.tagName||"").toUpperCase(),n=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&n==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var Mr={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function Or(e,t,r,i={}){let{observerHandle:n,shellRoot:o,structural:a,structuralPath:s}=i;n?.pause?.();try{if(!a)try{return q.apply(e,t,r,Mr),{ok:!0}}catch(d){return{ok:!1,error:d}}let l=dn(e,t,s),c=l?hn(l):null,m=l?null:pn(e,o);try{return q.apply(e,t,r,Mr),{ok:!0}}catch(d){return c?un(l,c):m&&fn(e,o,m),{ok:!1,error:d}}}finally{n?.resume?.()}}function dn(e,t,r){if(!r||!e)return null;let i=W(r),n=[],o=t;for(let a of i){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&a in o){if(n.push(a),o=o[a],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:mn(e,t,n)}function mn(e,t,r){if(r.length===0)return null;let i=e,n=t;for(let o=0;o<r.length;o++){let a=r[o];if(!n||typeof n!="object"||Array.isArray(n))return null;let s=n[a];if(s==null)return null;if(o===r.length-1){if(Array.isArray(s)){let[l]=s;return i.querySelector?.(l)?.parentElement||null}if(typeof s=="string"&&s.endsWith("[]")){let l=s.slice(0,-2);return i.querySelector?.(l)?.parentElement||null}return null}n=s}return null}function hn(e){let t=[];for(let r of Array.from(e.childNodes))t.push(r.cloneNode(!0));return t}function un(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);for(let r of t)e.appendChild(r)}function pn(e,t){let r=[];for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||r.push(i.cloneNode(!0));return r}function fn(e,t,r){for(let n of Array.from(e.childNodes))n===t||t&&n.contains?.(t)||e.removeChild(n);let i=gn(e,t);for(let n of r)e.insertBefore(n,i||null)}function gn(e,t){if(!t)return null;for(let r of Array.from(e.childNodes))if(r===t||r.contains?.(t))return r;return null}function Ye(e,t){if(!t||e==null)return e;return r(e);function r(i){if(typeof i=="string"){if(i.endsWith("[]")||i.lastIndexOf("@")>=0)return i;let n=null;try{n=t.querySelector(i)}catch{return i}return n&&n.children.length>0?i+"@innerHTML":i}if(Array.isArray(i))return i;if(i&&typeof i=="object"){let n=Object.create(null);for(let[o,a]of Object.entries(i))n[o]=r(a);return n}return i}}function Rt(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function le(e,t){if(!e||!e.querySelectorAll)return;e.querySelectorAll("textarea[data-hcms-field]").forEach(Rt);let r=t&&t.defaultView||(typeof window<"u"?window:null),i=r&&r.richclay&&r.richclay.RichClay||r&&r.hyperclay&&r.hyperclay.RichClay||(r&&typeof r.RichClay=="function"?r.RichClay:null);i&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(n=>{if(n.__hcmsRichclay)return;let o;try{o=new i(n,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(s){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",s);return}n.__hcmsRichclay=o;let a=o&&o.squire;a&&typeof a.addEventListener=="function"&&a.addEventListener("input",()=>{let s=r&&r.Event||Event;n.dispatchEvent(new s("input",{bubbles:!0}))})})}var Tt=new WeakSet;function de(e,t){let r=typeof window<"u"&&window.hyperclay&&window.hyperclay.undo||null;if(!r)return t();r.pause();try{let i=t();return i&&i.ok?r.commitCaptured(e):r.discardCaptured(),i}finally{r.resume()}}function Ze(e){let t=typeof window<"u"&&window.hyperclay&&window.hyperclay.undo||null;if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Nr(e){let{formRoot:t}=e;if(!t||Tt.has(t))return;Tt.add(t);let r=a=>{let s=a.target;!s||!s.closest||s.closest("[data-hcms-form-root]")&&s.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(s.tagName==="TEXTAREA"&&Rt(s),!s.matches('input[type="file"]')&&(!s.closest("[data-hcms-field]")&&!s.hasAttribute?.("data-hcms-field")||Lr(s,e)))},i=a=>{let s=a.target;if(!(!s||!s.closest)&&s.closest("[data-hcms-form-root]")){if(s.matches('input[type="file"][data-hcms-upload]')){_n(s,e);return}s.matches('input[type="checkbox"], input[type="radio"], select')&&Lr(s,e)}},n=a=>{let s=a.target;if(!s||!s.closest)return;let l=s.closest("[data-hcms-action]");if(!l)return;let c=l.getAttribute("data-hcms-action");if(c==="add"||c==="remove"||c==="move-up"||c==="move-down"||c==="clear-upload"){if(!l.closest("[data-hcms-form-root]"))return}else if(c==="close"&&!l.closest("[data-hcms-shell]"))return;if(c==="add"){let m=l.closest("[data-hcms-path]");if(!m)return;let d=m.getAttribute("data-hcms-path");Mt(d,e)}else if(c==="remove"){let m=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;Tn(m,e)}else if(c==="move-up"||c==="move-down"){let m=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;Cn(m,c==="move-up"?-1:1,e)}else c==="clear-upload"?An(l,e):c==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",i,!0),o.addEventListener("click",n,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",i,!0),o.removeEventListener("click",n,!0),Tt.delete(t)}}var bn=new Set(["value","checked"]);function kn(e,t){if(!t)return null;let r=W(t);if(r.some(l=>typeof l=="number"||l==="*"))return null;let i=X(e.pageRules,r);if(typeof i!="string")return null;let n=i.lastIndexOf("@");if(n===-1)return null;let o=i.slice(n+1);if(!bn.has(o))return null;let a=i.slice(0,n),s=a?e.pageRoot.querySelector(a):e.pageRoot;return s?{el:s,prop:o,oldValue:s[o]}:null}function Lr(e,t){let i=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",n=kn(t,i);if(z(D(t),{path:i,structural:!1},t),n){let o=typeof window<"u"&&window.hyperclay&&window.hyperclay.undo||null;o&&typeof o.recordValue=="function"&&o.recordValue(n.el,{prop:n.prop,oldValue:n.oldValue,newValue:n.el[n.prop]})}}var yn={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function vn(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let i=typeof window<"u"&&window.hyperclay&&window.hyperclay.quickcrop||null;if(typeof i!="function")return{file:e};try{let n=await i(e,{aspect:xn(r),...yn});return n===null?null:{file:wn(n.blob,e.name),dataURL:n.dataURL}}catch(n){return Ae(t,n&&n.message||"Crop failed"),null}}function xn(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let i=parseFloat(r[1]),n=parseFloat(r[2]);return!i||!n?null:i/n}function wn(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",i=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],i+r,{type:e.type})}catch{return e}}async function _n(e,t){let r=e.files&&e.files[0];if(!r)return;let i=e.closest("[data-hcms-path]");if(!i)return;let n=i.getAttribute("data-hcms-path")||"";Ae(i,null);let o=await vn(r,i);if(!o||t.closed){Q(e);return}let a=o.file,s=o.dataURL||null,l=typeof window<"u"&&window.hyperclay&&window.hyperclay.uploadFileBasic||null,c=null;if(typeof l=="function")try{let m=await l(a);c=m&&m.uploads&&m.uploads[0]&&m.uploads[0].url}catch(m){if(t.closed){Q(e);return}Ae(i,m&&m.message||"Upload failed"),t.dispatch?.("hcms:error",{error:m,path:n}),Q(e);return}if(t.closed){Q(e);return}if(c||(c=s||En(a)),!c){Q(e);return}Ae(i,null),Fr(i,c,a.name),z(D(t),{path:n,structural:!1},t),Q(e)}function An(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let i=r.getAttribute("data-hcms-path")||"";Fr(r,"","");let n=r.querySelector('input[type="file"][data-hcms-upload]');n&&Q(n),Ae(r,null),z(D(t),{path:i,structural:!1},t)}function Sn(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function Fr(e,t,r){let i=Sn(e);if(!i)return;let n=(i.tagName||"").toUpperCase();n==="IMG"?i.src=t||"":n==="A"&&(i.href=t||"",i.textContent=t?r||St(t):"")}function Q(e){try{e.value=""}catch{}}function En(e){let t=typeof URL<"u"&&URL.createObjectURL?URL:null;if(!t)return"";try{return t.createObjectURL(e)}catch{return""}}function Ae(e,t){let r=e.querySelector?e.querySelector(":scope > .hcms-error"):null;r&&(t?(r.textContent=t,r.hidden=!1):(r.textContent="",r.hidden=!0))}function Mt(e,t){let{formRoot:r,pageRules:i}=t,n=r.querySelector(`[data-hcms-path="${In(e)}"]`);if(!n)throw new Error(`hypercms: no element at path "${e}"`);let o=n.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let a=W(e),s=jn(i,a),l=Array.isArray(s),c=typeof s=="string"&&s.endsWith("[]");if(!l&&!c)throw new Error(`hypercms: path "${e}" is not an array`);let m=Xe(n,"data-hcms-max-items"),d=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(n.hasAttribute("data-hcms-no-add")||m!=null&&d.length>=m)return;let u=d.length,y=l?s[1]:s.replace(/\[\]$/,""),x=ve(l?y:"string"),M=kr({shape:l?"object-array-item":"scalar-array-item",itemShape:y,pathArr:[...a,u],data:x,doc:t.doc,itemKey:n.getAttribute("data-hcms-item-tpl")||null});return o.appendChild(M),le(M,t.doc),Lt(n),de(`Add ${e}`,()=>z(D(t),{path:e,structural:!0},t))}function Cn(e,t,r){let i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i||i.hasAttribute("data-hcms-no-reorder"))return;let n=i.querySelector(".hcms-array-items");if(!n)return;let o=Array.from(n.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),a=o.indexOf(e);if(a<0)return;let s=a+t;if(s<0||s>=o.length)return;let l=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?n.insertBefore(e,o[s]):n.insertBefore(e,o[s].nextSibling),Nt(n),Lt(i),l&&typeof l.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),de(`Reorder ${i.getAttribute("data-hcms-path")||""}`,()=>z(D(r),{path:i.getAttribute("data-hcms-path")||"",structural:!0},r))}var Je="Delete this item?";function Rn(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||Je;let i=t&&t.confirmRemove;return i===!1?null:typeof i=="string"?i||Je:i===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?Je:null}function Tn(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),i=Rn(r,t);if(i==null)return ce(e,t);let n=typeof window<"u"&&(window.hyperclay?.consent||window.consent);typeof n=="function"?Promise.resolve(n(i)).then(()=>ce(e,t),()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(i)&&ce(e,t):ce(e,t)}function ce(e,t){let r=e.getAttribute("data-hcms-path")||"",i=e.parentElement,n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n?.hasAttribute("data-hcms-no-remove")){if(n){let o=Xe(n,"data-hcms-min-items"),a=n.querySelector(".hcms-array-items"),s=a?a.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&s<=o)return}return e.remove(),i&&Nt(i),n&&Lt(n),de(`Remove ${r}`,()=>z(D(t),{path:r,structural:!0},t))}}function z(e,t,r){let i=Se(e);if(i===r.lastFingerprint)return{ok:!0,skipped:!0};let n=Or(r.pageRoot,r.pageRules,e,{observerHandle:r.observerHandle,shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null});return n.ok?(r.lastFingerprint=i,r.lastData=e,jr(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(jr(r,Ln(n.error,t.path)),r.dispatch?.("hcms:error",{error:n.error,attemptedData:e}),r.onError?.(n.error)),n}function D(e){let t=q.extract(e.formRoot,e.formRules);return K(t,e.formRules)}function K(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(i=>K(i,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[i,n]of Object.entries(t))r[i]=K(e[i],n);return r}return e}function jr(e,t){e.lastErrors=t&&t.length?t:null,Ot(e)}function Ot(e){if(Mn(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:i}of e.lastErrors){if(i!=null&&i!==""){let n=On(e.formRoot,i);if(n){n.textContent=n.textContent?`${n.textContent}
${r}`:r,n.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function Mn(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function On(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let i=r.join("."),n=typeof CSS<"u"&&CSS.escape?CSS.escape(i):i.replace(/[^a-zA-Z0-9_\-.*]/g,a=>"\\"+a),o=e.querySelector(`[data-hcms-path="${n}"]`);if(o){for(let a of o.children)if(a.classList&&a.classList.contains("hcms-error"))return a}r.pop()}return null}function Ln(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function jn(e,t){let r=e;for(let i of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof i!="number"&&i!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof i=="number"||!(i in r))return;r=r[i];continue}return}return r}function Xe(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Lt(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),i=r.length,n=Xe(e,"data-hcms-max-items"),o=Xe(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');c&&(c.hidden=a||n!=null&&i>=n),r.forEach((m,d)=>{let u=m.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=s||o!=null&&i<=o);let y=m.querySelector('[data-hcms-action="move-up"]');y&&(y.hidden=l||d===0);let x=m.querySelector('[data-hcms-action="move-down"]');x&&(x.hidden=l||d===i-1)})}function jt(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>Nt(t))}function Nt(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),i=>[i,i.checked]):[],r=0;for(let i of e.children){if(!i.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let n=i.getAttribute("data-hcms-path");if(!n)continue;let o=n.split(".");o[o.length-1]=String(r);let a=o.join(".");a!==n&&Nn(i,n,a),r++}for(let[i,n]of t)i.checked!==n&&(i.checked=n)}function Nn(e,t,r){let i=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let n of i){let o=n.getAttribute("data-hcms-path");o===t?n.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&n.setAttribute("data-hcms-path",r+o.slice(t.length))}Fn(e)}function Fn(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=Ct(r.getAttribute("data-hcms-path")))}}function Se(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let i=Object.create(null);for(let n of Object.keys(r).sort())i[n]=r[n];return i}return r})}function In(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var zn={},Qe="hcms-shell-styles",qn="hcms-bundled-styles-installed",Dn='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',me=new WeakSet,Ft="";function qr(e){Ft=e}var $n=0;function Ir(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function Dr({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:i=!1,title:n="Page content",eyebrow:o="Edit",theme:a=null,doc:s}){$r(s);let l=`hcms-shell-title-${++$n}`,c=s.createElement("div");c.setAttribute("data-hcms-shell",""),c.setAttribute("save-remove",""),c.setAttribute("save-ignore",""),c.setAttribute("tabindex","-1"),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby",l);let m=a==="dark"?" dark":a==="light"?" light":"";c.className="hcms-shell pixel-quiet hcms-side-"+t+(r?" hcms-overlay":"")+m;let d=Ir(n),u=Ir(o);c.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${d}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${u}</div>
          <h2 class="hcms-shell-title" id="${l}">${d}</h2>
        </div>
        <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
          <span class="mirk-button__label">\xD7</span>
        </button>
      </header>
      <div class="hcms-shell-error" role="alert" hidden></div>
      <div data-hcms-form-root class="hcms-form"></div>
      <footer class="hcms-shell-footer"${i?"":" hidden"}>
        <button type="button" class="hcms-shell-save mirk-button" trigger-save>
          <span class="mirk-button__label">Save</span>
        </button>
      </footer>
    </div>
  `,(e||s.body).appendChild(c);let x=s.body;x.classList.add("hcms-open"),r&&x.classList.add("hcms-overlay"),t==="left"&&x.classList.add("hcms-side-left");let M=Hn(c,s),b=Pn(c);return{root:c,formRoot:c.querySelector("[data-hcms-form-root]"),errorEl:c.querySelector(".hcms-shell-error"),saveButton:c.querySelector(".hcms-shell-save"),destroy(){M.detach(),b.detach(),c.remove(),x.classList.remove("hcms-open","hcms-overlay","hcms-side-left")},restoreChrome(){Bn(s),x.classList.add("hcms-open"),r&&x.classList.add("hcms-overlay"),t==="left"&&x.classList.add("hcms-side-left")}}}function Bn(e){e&&(e.getElementById(Qe)||e.querySelector("style[data-hcms-bundled-styles]")||(me.delete(e),$r(e)))}function $r(e){if(e&&!me.has(e)){if(e[qn]){me.add(e);return}if(e.getElementById(Qe)||e.querySelector("style[data-hcms-bundled-styles]")){me.add(e);return}if(Ft){let t=e.createElement("style");t.id=Qe,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=Ft,(e.head||e.documentElement).appendChild(t),me.add(e);return}try{let t=new URL("./theme.generated.css",zn.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Qe,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),me.add(e)}catch{console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")}}}function Pn(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let i=()=>{let n=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>n)};return t.addEventListener("scroll",i,{passive:!0}),i(),{detach(){t.removeEventListener("scroll",i)}}}function Hn(e,t){function r(i){if(i.key!=="Tab"||!e.contains(t.activeElement))return;let n=Array.from(e.querySelectorAll(Dn));if(n.length===0)return;let o=n[0],a=n[n.length-1];i.shiftKey&&t.activeElement===o?(i.preventDefault(),a.focus()):!i.shiftKey&&t.activeElement===a&&(i.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var Un={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function et(e,{ignoreActiveValue:t}={}){let r=q.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.richText?Ye(r.rules,e.pageRoot):r.rules,e.rulesTagNode=r.tagNode),De(e.doc),He(e.doc,e.pageRules),e.formRules=Ue(e.pageRules,e.doc);let i=K(q.extract(e.pageRoot,e.pageRules,Un),e.pageRules),n=We({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});Fe(e.formRoot,n,{ignoreActiveValue:t}),le(e.formRoot,e.doc),Ot(e),e.updateFingerprint&&e.updateFingerprint()}function Br({debounce:e=100,onRefresh:t}){let r=typeof window<"u"&&window.hyperclay&&window.hyperclay.Mutation||null;if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: window.hyperclay.Mutation is required. Load hyperclayjs (or just the mutation utility) before initializing hypercms.");let i=0,n=r.onAnyChange({debounce:e},()=>{i>0||t()});return{unsubscribe:typeof n=="function"?n:()=>{},pause(){i++},resume(){i=Math.max(0,i-1)}}}var Wn="[hypercms]";function Pr(e,t){if(!e||!e.querySelectorAll||!t)return;let r=Vn(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(n=>{let o=n.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Wn} template "${o}" doesn't match any rule path; ignored`))})}function Vn(e){let t=new Set;return r([],e),t;function r(i,n){let o=i.join("."),a=i.map(l=>typeof l=="number"?"*":l).join(".");o&&t.add(o),a&&t.add(a);let s=Z(n);if(s==="object")for(let[l,c]of Object.entries(n))r([...i,l],c);else if(s==="object-array"||s==="scalar-array"){let l=[...i,"*"],c=l.map(m=>typeof m=="number"?"*":m).join(".");if(t.add(c),s==="object-array"){let m=n[1];if(m&&typeof m=="object"&&!Array.isArray(m))for(let[d,u]of Object.entries(m))r([...l,d],u)}}}}var Hr="hcms-toggle",zr="hcms-toggle-style",Kn=`
#hcms-toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147482900;
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px;
  border: 1px solid #3a3f58; background: #14161f; color: #f2f3f7;
  font: 500 13px/1 system-ui, sans-serif; border-radius: 999px; cursor: pointer;
  box-shadow: 0 10px 28px -12px rgba(0, 0, 0, .55);
}
#hcms-toggle:hover { background: #1d2030; }
#hcms-toggle .hcms-toggle__close { display: none; }
body.hcms-open #hcms-toggle .hcms-toggle__open { display: none; }
body.hcms-open #hcms-toggle .hcms-toggle__close { display: inline; }
body.hcms-open:not(.hcms-overlay):not(.hcms-side-left) #hcms-toggle { right: calc(380px + 16px); }
body.hcms-open.hcms-overlay #hcms-toggle { display: none; }
`;function Gn({search:e="",cookie:t="",forced:r=null}={}){let i=typeof e=="string"?e:"",n=i.indexOf("?"),o=n===-1?i:i.slice(n+1),a=new URLSearchParams(o).get("editmode");return a?a==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}function Yn({open:e,close:t,isOpen:r},i=document){let n=i.getElementById(Hr);if(n)return n;if(!i.getElementById(zr)){let a=i.createElement("style");a.id=zr,a.setAttribute("snapshot-remove",""),a.textContent=Kn,i.head.appendChild(a)}let o=i.createElement("button");return o.type="button",o.id=Hr,o.setAttribute("no-save",""),o.setAttribute("snapshot-remove",""),o.setAttribute("save-ignore",""),o.setAttribute("aria-label","Toggle content editor"),o.innerHTML='<span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span>',o.addEventListener("click",async()=>{try{r()?t():await e()}catch(a){console.warn("hypercms: toggle failed to open the CMS",a)}}),i.body.appendChild(o),o}function Ur(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Gn({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Yn(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function Kr(e){qr(e)}var L={isOpen:!1,ctx:null,shell:null,opts:null};function Wr(e,t){if(L.ctx!==e)return;let r=t==="livesync";t==="livesync"&&L.shell?.restoreChrome?.(),et(e,{ignoreActiveValue:r})}var Vr=!1;function Jn(){if(Vr)return;let e=typeof window<"u"&&window.hyperclay&&window.hyperclay.onPrepareForSave||null;typeof e=="function"&&(e(t=>{let r=t&&t.querySelector&&t.querySelector("body");r&&r.classList.remove("hcms-open","hcms-overlay","hcms-side-left")}),Vr=!0)}function Dt(e={}){if(L.isOpen){console.warn("cms.open() called while already open; ignoring");return}Jn();let t=e.pageRoot||(typeof document<"u"?document.body:null);if(!t)throw new Error("hypercms: no pageRoot available");let r=t.ownerDocument||(typeof document<"u"?document:null);if(!r)throw new Error("hypercms: no document available");let i=e.rules!==void 0?e.rules:"cms",n=q.findRules(r,i);if(!n){let u=typeof i=="string"?`data-rules-name~="${i}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${u}`)}let o=e.richText!==!1,a=o?Ye(n.rules,t):n.rules,s=n.tagNode;De(r),He(r,a),Pr(r,a);let l=Ue(a,r),c=K(q.extract(t,a,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),a),m=Ze(()=>Dr({mountTo:e.mountTo||r.body,side:e.side||"right",overlay:!!e.overlay,showSaveButton:!!e.showSaveButton,title:e.title,eyebrow:e.eyebrow,theme:e.theme,doc:r})),d={doc:r,pageRoot:t,pageRules:a,formRules:l,rulesTagNode:s,rulesSource:i,richText:o,formRoot:m.formRoot,shellRoot:m.root,errorEl:m.errorEl,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:e.onChange,onError:e.onError,confirmRemove:e.confirmRemove,previouslyFocused:r.activeElement,dispatch(u,y){let x=r.defaultView&&r.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!x)return;let M=new x(u,{bubbles:!0,cancelable:u==="hcms:change",detail:y});m.root.dispatchEvent(M)},onCloseRequested(){$t()}};d.updateFingerprint=()=>{d.lastFingerprint=Se(D(d))};try{let u=We({pageRules:a,formRules:l,data:c,doc:r});m.formRoot.appendChild(u),le(m.formRoot,r),Nr(d),d.updateFingerprint(),d.observerHandle=Br({onRefresh:()=>et(d)});let y=typeof window<"u"&&window.hyperclay&&window.hyperclay.undo||null;if(y&&typeof y.on=="function"){let M=()=>{if(L.ctx!==d)return;Wr(d,"undo");let b=K(q.extract(d.pageRoot,d.pageRules,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),d.pageRules);Se(b)!==Se(d.lastData)&&(d.lastData=b,d.onChange?.(b,{path:"",structural:!1}))};y.on("undo",M),y.on("redo",M),d.undoUnsub=()=>{y.off("undo",M),y.off("redo",M)}}let x=()=>Wr(d,"livesync");r.addEventListener("hyperclay:livesync-applied",x),d.livesyncUnsub=()=>r.removeEventListener("hyperclay:livesync-applied",x),Ee.ctx=d,Zn(r),Xn(m.root),L.isOpen=!0,L.ctx=d,L.shell=m,L.opts=e,d.dispatch("hcms:open",{pageRoot:t})}catch(u){throw d.observerHandle?.unsubscribe?.(),d.undoUnsub?.(),d.livesyncUnsub?.(),d.detachEvents?.(),Ee.ctx===d&&(Ee.ctx=null),Ze(()=>m.destroy()),L.isOpen=!1,L.ctx=null,L.shell=null,L.opts=null,u}}function Xn(e){let r=e.querySelector('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');r&&typeof r.focus=="function"&&r.focus()}var Ee={ctx:null};function Zn(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let n=Ee.ctx;if(n)return jt(n.formRoot),de("Reorder",()=>z(D(n),{path:"",structural:!0},n))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var qt="cms";function Qn(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),i=r===-1?t:t.slice(r+1);if(!i)return t;let n=new URLSearchParams(i);return n.get(qt)!=="true"?t:(n.set(qt,"false"),"?"+n.toString())}function eo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),i=r===-1?t:t.slice(r+1);return i?new URLSearchParams(i).get(qt)==="true":!1}function to(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=Qn(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}function $t(){if(!L.isOpen)return;let{ctx:e,shell:t}=L;e.closed=!0;let r=e.previouslyFocused;if(e.dispatch("hcms:close",null),to(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),Ze(()=>t.destroy()),L.isOpen=!1,L.ctx=null,L.shell=null,L.opts=null,Ee.ctx=null,r&&typeof r.focus=="function")try{r.focus()}catch{}}function Gr(){L.isOpen&&et(L.ctx)}function ro(){return L.isOpen}var io={getData(){return L.isOpen?D(L.ctx):null},setValue(e,t){if(!L.isOpen)throw new Error("hypercms: cms is not open");let r=L.ctx,i=W(e),n=X(r.pageRules,i);if(n===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof n!="string"||n.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=no(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);oo(o,t,r.formRoot,e),z(D(r),{path:e,structural:!1},r)},addItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");Mt(e,L.ctx)},removeItem(e){if(!L.isOpen)throw new Error("hypercms: cms is not open");let t=L.ctx,r=W(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let n=X(t.pageRules,r.slice(0,-1));if(!(Array.isArray(n)||typeof n=="string"&&n.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let a=t.formRoot.querySelector(`[data-hcms-path="${Pt(e)}"]`);if(!a)throw new Error(`hypercms: no element at path "${e}"`);ce(a,t)},refresh:Gr,_commit(){if(!L.isOpen)return;let e=L.ctx;return jt(e.formRoot),de("Update",()=>z(D(e),{path:"",structural:!0},e))}};function no(e,t){let r=Pt(t),i=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(i)}function oo(e,t,r,i){let n=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(n==="INPUT"&&o==="radio"){let a=Pt(i),s=r.querySelectorAll(`[data-hcms-path="${a}"][data-hcms-field][type="radio"], [data-hcms-path="${a}"] [data-hcms-field][type="radio"]`);s.length?s.forEach(l=>{l.checked=String(l.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(n==="IMG"){e.src=t==null?"":String(t);return}if(n==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var so=250,ao=1e4;function lo(){typeof window>"u"||typeof document>"u"||eo(window.location?window.location.search:"")&&(L.isOpen||co(()=>{if(!L.isOpen)try{Dt()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function It(){return!!document.body&&!!(window.hyperclay&&window.hyperclay.Mutation)}function co(e){if(It()){queueMicrotask(e);return}let t=Date.now()+ao,r=!1,i=null,n=()=>{r||(r=!0,i!==null&&clearInterval(i),document.removeEventListener("hyperclay:mutation-ready",o))};function o(){if(L.isOpen){n();return}It()&&(n(),e())}document.addEventListener("hyperclay:mutation-ready",o,{once:!0}),i=setInterval(()=>{if(L.isOpen){n();return}if(It()){n(),e();return}Date.now()>=t&&(n(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 window.hyperclay.Mutation never appeared. Load hyperclayjs (or the mutation utility) so the CMS can initialize."))},so)}lo();Ur({open:Dt,close:$t,isOpen:ro,hasRules:e=>!!q.findRules(e,"cms")});var Bt={open:Dt,close:$t,refresh:Gr,api:io,get isOpen(){return L.isOpen},path:wt,scaffold:ve,morphForm:Fe};function Pt(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Yr=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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

   Adapted from cms-sidebar/pixel-quiet/overrides.css. Two jobs:
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
.hcms-shell.pixel-quiet {
  box-sizing: border-box;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  max-width: 100vw;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  color: var(--mirk-fg);
  background: var(--mirk-bg);
  border-left: 1px solid var(--mirk-input-border);
  box-shadow: -16px 0 48px -28px rgba(43, 36, 27, 0.45);
}
.hcms-shell.pixel-quiet.dark {
  box-shadow: -16px 0 48px -28px rgba(0, 0, 0, 0.6);
}

.hcms-shell.pixel-quiet.hcms-side-left {
  right: auto;
  left: 0;
  border-left: 0;
  border-right: 1px solid var(--mirk-input-border);
  box-shadow: 16px 0 48px -28px rgba(43, 36, 27, 0.45);
}

/* Push the page over so docked content is never hidden underneath. */
body.hcms-open:not(.hcms-overlay) { padding-right: 380px; }
body.hcms-open.hcms-side-left:not(.hcms-overlay) { padding-right: 0; padding-left: 380px; }
body.hcms-open.hcms-overlay { overflow: hidden; }

@media (max-width: 799px) {
  .hcms-shell.pixel-quiet { width: 100vw; }
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let i=r.target.closest(".mirk-number__step");if(!i)return;let n=i.closest(".mirk-number").querySelector("input[type=number]");n&&(i.dataset.step==="up"?n.stepUp():n.stepDown(),n.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let i=r.target.closest(".mirk-slider__input");i&&i.closest(".mirk-slider").style.setProperty("--mirk-value",`${i.value}%`)}),document.addEventListener("change",r=>{let i=r.target.closest(".mirk-file__input");if(!i||!i.files.length)return;let n=i.closest(".mirk-file"),o=n.querySelector(".mirk-file__name");if(!o)return;let a=i.files[0],s=document.createElement("a");if(s.className="mirk-file__name",s.dataset.filled="",s.href=URL.createObjectURL(a),s.target="_blank",s.rel="noopener",s.textContent=a.name,o.replaceWith(s),!n.querySelector(".mirk-file__remove")){let l=document.createElement("button");l.type="button",l.className="mirk-file__remove",l.setAttribute("aria-label","Remove file"),l.innerHTML=e,s.after(l)}}),document.addEventListener("change",r=>{let i=r.target.closest(".mirk-image__input");if(!i||!i.files.length)return;let n=i.closest(".mirk-image"),o=n.querySelector(".mirk-image__preview");if(!o)return;let a=n.querySelector(".mirk-image__placeholder"),s=new FileReader;s.onload=l=>{o.src=l.target.result,o.removeAttribute("hidden"),a&&a.setAttribute("hidden",""),n.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),n.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},s.readAsDataURL(i.files[0])}),document.addEventListener("click",r=>{let i=r.target.closest(".mirk-file__remove");if(i){let o=i.closest(".mirk-file"),a=o?.querySelector(".mirk-file__input"),s=o?.querySelector(".mirk-file__name");if(a&&(a.value=""),s){let l=document.createElement("span");l.className="mirk-file__name",l.textContent="No file chosen",s.replaceWith(l)}i.remove();return}let n=r.target.closest(".mirk-image__remove");if(n){let o=n.closest(".mirk-image"),a=o?.querySelector(".mirk-image__input"),s=o?.querySelector(".mirk-image__preview");a&&(a.value=""),s&&(s.removeAttribute("src"),s.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,i){let n=document.createElement("span");n.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let a=document.createElement("button");a.type="button",a.className="mirk-tags__remove",a.textContent="\xD7";let s=document.createElement("span");if(s.className="mirk-tags__chip",i){let l=document.createElement("span");l.className="mirk-tags__chip-inner",l.append(n,o,a),s.append(l)}else s.append(n,o,a);return s}document.addEventListener("keydown",r=>{let i=r.target.closest(".mirk-tags__input");if(!i)return;let n=i.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=i.value.trim();if(!o)return;r.preventDefault(),i.before(t(o,n.classList.contains("mirk-tags--round"))),i.value=""}else if(r.key==="Backspace"&&!i.value){let o=n.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let i=r.target.closest(".mirk-tags__remove");if(i){i.closest(".mirk-tags__chip").remove();return}let n=r.target.closest(".mirk-tags");n&&r.target===n&&n.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let i=r.target.closest("[data-mirk-chip]");if(!i)return;let n=i.getAttribute("data-mirk-chip");if(n==="open")i.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(n==="collapse")i.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(n==="changes"){let o=i.closest(".mirk-chip__panel")?.classList.toggle("is-changes");i.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let i=r.target.closest("[data-copy-btn]");if(!i)return;let n=i.closest("[data-copy]");if(!n)return;let o=n.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(l=>l.remove());let s=n.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(s).then(()=>{let l=i.textContent;i.textContent="copied",i.dataset.copied="",setTimeout(()=>{i.textContent=l,delete i.dataset.copied},1200)}).catch(()=>{i.textContent="error",setTimeout(()=>{i.textContent="copy"},1200)})})})();Kr(Yr);var uo=Bt,po={cms:Bt};return ei(fo);})();

// Auto-export to window unless suppressed by loader.
// Per hypercms plan locked decision 3: flatten to hyperclay.hypercms.open(),
// not hyperclay.hypercms.cms.open().
if (!window.__hyperclayNoAutoExport) {
  window.hyperclay = window.hyperclay || {};
  window.hyperclay.hypercms = hypercms.cms;
  window.h = window.hyperclay;
}

export const cms = hypercms.cms;
export default hypercms;
