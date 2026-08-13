var hypercms=(()=>{var wt=Object.defineProperty;var Nn=Object.getOwnPropertyDescriptor;var In=Object.getOwnPropertyNames;var jn=Object.prototype.hasOwnProperty;var _t=(e,t)=>{for(var r in t)wt(e,r,{get:t[r],enumerable:!0})},Ln=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of In(t))!jn.call(e,i)&&i!==r&&wt(e,i,{get:()=>t[i],enumerable:!(n=Nn(t,i))||n.enumerable});return e};var Fn=e=>Ln(wt({},"__esModule",{value:!0}),e);var us={};_t(us,{cms:()=>ds,default:()=>ms});var mr={includeClasses:!0,includeAttributes:["href","src","name","type","role","aria-label","alt","title"],excludeAttributePrefixes:["data-morph-","data-hyper-","data-im-"],textHintLength:64,excludeIds:!0,maxPathDepth:4,landmarks:["HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE"],weights:{signature:100,pathSegment:10,textMatch:20,textMismatch:25,uniqueCandidate:50,positionPenalty:1,maxDriftPenalty:19,slotMatch:30},minConfidence:101,maxScoredCandidates:16};function Dn(e){let t=5381;for(let r=0;r<e.length;r++)t=(t<<5)+t^e.charCodeAt(r);return Math.abs(t).toString(36)}function $n(e){if(e.classList&&e.classList.length>0)return Array.from(e.classList).sort().join(" ");let t=e.getAttribute?.("class");return t?t.split(/\s+/).filter(Boolean).sort().join(" "):""}function Bn(e,t){let r=[];for(let n of e.attributes||[]){let i=n.name;i==="id"||i==="class"||t.excludeAttributePrefixes.some(o=>i.startsWith(o))||t.includeAttributes.includes(i)&&r.push(`${i}=${n.value}`)}return r.sort().join("|")}function Pn(e,t){return(e.textContent||"").replace(/\s+/g," ").trim().slice(0,t.textHintLength)}function zn(e,t){let r=[e.tagName];return t.includeClasses&&r.push($n(e)),r.push(Bn(e,t)),Dn(r.join("|"))}function Un(e){let t=e.tagName,r=1,n=e.previousElementSibling;for(;n;)n.tagName===t&&r++,n=n.previousElementSibling;return r}function Hn(e,t){return e.getAttribute?.("id")||e.getAttribute?.("role")?!0:t.landmarks.includes(e.tagName)}function Vn(e){let t=e.getAttribute?.("id");if(t)return`#${t}`;let r=e.getAttribute?.("role");return r?`@${r}`:e.tagName}function Wn(e,t){let r=[],n=e;for(;n&&n.tagName&&r.length<t.maxPathDepth;){let i=`${n.tagName}:${Un(n)}`;if(r.unshift(i),n!==e&&Hn(n,t)){r.unshift(Vn(n));break}n=n.parentElement}return r}function Kn(e,t){let r=0,n=e.length-1,i=t.length-1;for(;n>=0&&i>=0&&e[n]===t[i];)r++,n--,i--;return r}function Y(e,t,r){if(r.has(e))return r.get(e);let n={signature:zn(e,t),path:Wn(e,t),textHint:Pn(e,t)};return r.set(e,n),n}function fr(e,t,r,n){if(n.has(e))return n.get(e);let i=new Map,o=e.querySelectorAll("*"),a=0;for(let s of o){let l=Y(s,t,r);l.domIndex=a++,!t.shouldIgnore?.(s)&&(i.has(l.signature)||i.set(l.signature,[]),i.get(l.signature).push(s))}return n.set(e,i),i}function Gn(e,t,r){r.delete(e),t.delete(e);let n=e.querySelectorAll("*");for(let i of n)t.delete(i)}function At(e,t,r,n,i){let o=Y(e,r,n),a=Y(t,r,n),s=r.weights,l={},c=0;if(o.signature!==a.signature)return{score:0,breakdown:{rejected:"signature mismatch"}};c+=s.signature,l.signature=s.signature;let p=Kn(o.path,a.path)*s.pathSegment;c+=p,l.path=p;let d=!0;if(o.textHint&&a.textHint?o.textHint===a.textHint?(c+=s.textMatch,l.text=s.textMatch):(c-=s.textMismatch,l.text=-s.textMismatch,d=!1):o.textHint!==a.textHint&&(c-=s.textMismatch,l.text=-s.textMismatch,d=!1),i.candidateCount===1&&d&&(c+=s.uniqueCandidate,l.unique=s.uniqueCandidate),typeof o.domIndex=="number"&&typeof a.domIndex=="number"){let f=Math.abs(o.domIndex-a.domIndex),k=Math.min(f*s.positionPenalty,s.maxDriftPenalty);c-=k,l.drift=-k}return{score:c,breakdown:l}}function ur(e,t,r,n,i){if(r.excludeIds&&e.getAttribute("id"))return null;let o=fr(t,r,n,i),a=Y(e,r,n);if(typeof a.domIndex!="number"){let d=0,f=e.previousElementSibling;for(;f;)d++,f=f.previousElementSibling;a.domIndex=d}let s=o.get(a.signature)||[],l=r.excludeIds?s.filter(d=>!d.getAttribute("id")):s;if(l.length===0)return null;let c=null,u=0,p=null;for(let d of l){let{score:f,breakdown:k}=At(e,d,r,n,{candidateCount:l.length});f>u&&(u=f,c=d,p=k)}return u<r.minConfidence?null:{element:c,confidence:u,breakdown:p}}function Jn(e,t,r,n){let i=[],o=r.weights.signature+r.weights.slotMatch,a={slot:o};function s(p){if(p.children)return p.children;let d=p.childNodes;if(!d)return[];let f=[];for(let k=0;k<d.length;k++)d[k].nodeType===1&&f.push(d[k]);return f}function l(p,d){let f=s(p),k=s(d);if(f.length===k.length)for(let T=0;T<f.length;T++){let M=f[T],F=k[T];if(r.shouldIgnore?.(M)||r.shouldIgnore?.(F)||r.excludeIds&&(M.getAttribute("id")||F.getAttribute("id"))||M.tagName!==F.tagName)continue;let G=Y(M,r,n).signature,q=Y(F,r,n).signature;G!==q&&i.push({newEl:M,oldEl:F,score:o,breakdown:a}),l(M,F)}}function c(p,d){for(;;){if(p.tagName===d.tagName)return[p,d];let f=s(p);if(!p.tagName&&f.length===1){p=f[0];continue}let k=s(d);if(k.length===1&&k[0].tagName===p.tagName){d=k[0];continue}return null}}let u=c(e,t);return u&&l(u[0],u[1]),i}function hr(e,t,r,n,i){let o=t.querySelectorAll("*"),a=fr(e,r,n,i),s=0;for(let f of o){let k=Y(f,r,n);k.domIndex=s++}let l=[],c=new Map;function u(f,k,T){let M=new Set;if(f.textHint){let j=c.get(f.signature);if(!j){j=new Map;for(let Q of k){let fe=Y(Q,r,n).textHint,ce=j.get(fe);ce||(ce=[],j.set(fe,ce)),ce.push(Q)}c.set(f.signature,j)}let V=j.get(f.textHint);if(V)for(let Q=0;Q<V.length&&Q<T;Q++)M.add(V[Q])}let F=0,G=k.length;for(;F<G;){let j=F+G>>1;Y(k[j],r,n).domIndex<f.domIndex?F=j+1:G=j}let q=Math.max(0,Math.min(F-(T>>1),k.length-T)),P=Math.min(q+T,k.length);for(let j=q;j<P;j++)M.add(k[j]);return[...M]}for(let f of o){if(r.shouldIgnore?.(f)||r.excludeIds&&f.getAttribute("id"))continue;let k=Y(f,r,n),T=a.get(k.signature)||[],M=r.excludeIds?T.filter(q=>!q.getAttribute("id")):T,F=r.maxScoredCandidates,G=F&&M.length>F?u(k,M,F):M;for(let q of G){let{score:P,breakdown:j}=At(f,q,r,n,{candidateCount:M.length});P>=r.minConfidence&&l.push({newEl:f,oldEl:q,score:P,breakdown:j})}}if(r.weights.slotMatch>0){let f=Jn(t,e,r,n);for(let k of f)l.push(k)}l.sort((f,k)=>k.score-f.score);let p=new Map,d=new Set;for(let{newEl:f,oldEl:k}of l)p.has(f)||d.has(k)||(p.set(f,k),d.add(k));return p}function pr(e,t,r,n){let i=Y(e,r,n),o=Y(t,r,n),{score:a,breakdown:s}=At(e,t,r,n,{candidateCount:1});return{matches:a>=r.minConfidence,score:a,breakdown:s,newMeta:{signature:i.signature,path:i.path,textHint:i.textHint},oldMeta:{signature:o.signature,path:o.path,textHint:o.textHint}}}function gr(e={}){let t={...mr,...e,weights:{...mr.weights,...e.weights}},r=new WeakMap,n=new WeakMap;return{findMatch:(i,o)=>ur(i,o,t,r,n),computeMatches:(i,o)=>hr(i,o,t,r,n),explain:(i,o)=>pr(i,o,t,r),invalidate:i=>Gn(i,r,n),session:()=>{let i=new WeakMap,o=new WeakMap;return{findMatch:(a,s)=>ur(a,s,t,i,o),computeMatches:(a,s)=>hr(a,s,t,i,o),explain:(a,s)=>pr(a,s,t,i)}},getConfig:()=>({...t})}}function St(e,t){for(;;){for(;t<e.length&&/\s/.test(e[t]);)t++;if(e[t]==="/"&&e[t+1]==="/"){for(;t<e.length&&e[t]!==`
`;)t++;continue}if(e[t]==="/"&&e[t+1]==="*"){let r=e.indexOf("*/",t+2);if(r===-1)return e.length;t=r+2;continue}return t}}function br(e){return e.replace(/\\'/g,"'").replace(/(\\*)"/g,(t,r)=>r.length%2===0?r+'\\"':t)}var Yn=/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/,Xn=/^[A-Za-z_$][A-Za-z0-9_$]*$/;function We(e){try{return JSON.parse(e)}catch{return JSON.parse(Zn(e))}}function Zn(e){let t="",r=0,n=(i,o)=>{throw new Error(`Invalid relaxed JSON: ${i} at position ${o}`)};for(;r<e.length&&(r=St(e,r),!(r>=e.length));){let i=e[r];if("{}[]:".includes(i)){t+=i,r++;continue}if(i===","){let s=St(e,r+1);if(e[s]==="}"||e[s]==="]"){r++;continue}t+=i,r++;continue}if(i==='"'||i==="'"){let s=r+1;for(;s<e.length&&e[s]!==i;)e[s]==="\\"&&s++,s++;s>=e.length&&n("unterminated string",r);let l=e.slice(r+1,s);i==="'"&&(l=br(l)),t+='"'+l+'"',r=s+1;continue}let o=r;for(;o<e.length&&/[A-Za-z0-9_$.+\-]/.test(e[o]);)o++;o===r&&n("unexpected character "+JSON.stringify(i),r);let a=e.slice(r,o);if(a==="true"||a==="false"||a==="null"||Yn.test(a)){t+=a,r=o;continue}if(Xn.test(a)){if(e[St(e,o)]===":"){t+='"'+a+'"',r=o;continue}n("unquoted value "+JSON.stringify(a),r)}n("invalid token "+JSON.stringify(a),r)}return t}function kr(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],a=0;for(;a<i.length;){let s=i[a];if(/\s/.test(s)){a++;continue}if("{}".includes(s)){o.push({type:s,value:s}),a++;continue}if(s==="["){let p=!1,d=a+1;for(;d<i.length&&/\s/.test(i[d]);)d++;if(d<i.length&&/[a-zA-Z_]/.test(i[d])&&(p=!0),!p){o.push({type:s,value:s}),a++;continue}}if(s==="]"){o.push({type:s,value:s}),a++;continue}if(s===":"){o.push({type:t.COLON,value:s}),a++;continue}if(s===","){o.push({type:t.COMMA,value:s}),a++;continue}if(s==='"'||s==="'"){let p=s,d=a+1;for(;d<i.length&&i[d]!==p;)i[d]==="\\"&&d++,d++;o.push({type:t.STRING,value:i.substring(a+1,d),quoted:!0,sourceQuote:p}),a=d+1;continue}let l=a,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let p=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],d=!1;for(let f of p){let k=f.substring(1);if(i.substring(l+1,l+1+k.length)===k){d=!0,l+=k.length;break}}if(!d)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let p=i[l];for(l++;l<i.length&&i[l]!==p;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(a,l);let u=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?u=t.NUMBER:c==="true"||c==="false"||c==="null"?u=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(u=t.SELECTOR),o.push({type:u,value:c,quoted:!1}),a=l}return o}function n(i){let o="";for(let a=0;a<i.length;a++){let s=i[a];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let l=i[a+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING){let l=s.value;s.sourceQuote==="'"&&(l=br(l)),o+=`"${l}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new Error("Invalid extraction rules syntax: "+i.message)}}var B=Symbol("hyper-morph-json-merge:missing"),yr=["id","_id","uuid","key","slug","code","name"];function be(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Me(e,t){return Object.prototype.hasOwnProperty.call(e,t)}function Qn(e,t,r){Object.defineProperty(e,t,{value:r,enumerable:!0,writable:!0,configurable:!0})}function se(e,t){if(e===t)return!0;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(let r=0;r<e.length;r++)if(!se(e[r],t[r]))return!1;return!0}if(be(e)&&be(t)){let r=Object.keys(e);if(r.length!==Object.keys(t).length)return!1;for(let n of r)if(!Me(t,n)||!se(e[n],t[n]))return!1;return!0}return!1}function vr(e,t,r,n){return se(t,r)?t:se(t,e)?r:se(r,e)?t:be(t)&&be(r)?ei(be(e)?e:{},t,r,n):Array.isArray(t)&&Array.isArray(r)?ii(Array.isArray(e)?e:[],t,r,n):r}function xr(e,t,r,n){return t===B&&r===B?B:t===B?e===B?r:se(r,e)?B:r:r===B?e===B?t:B:vr(e,t,r,n)}function ei(e,t,r,n){let i={},o=new Set([...Object.keys(e),...Object.keys(t),...Object.keys(r)]);for(let a of o){let s=xr(Me(e,a)?e[a]:B,Me(t,a)?t[a]:B,Me(r,a)?r[a]:B,n);s!==B&&Qn(i,a,s)}return i}function ti(e){return e===null||typeof e!="object"}function Ke(e){return typeof e+":"+String(e)}function ri(e,t){for(let r of t){let n=new Set;for(let i of r){if(!Me(i,e))return!1;let o=i[e];if(typeof o!="string"&&typeof o!="number")return!1;let a=Ke(o);if(n.has(a))return!1;n.add(a)}}return!0}function ni(e,t,r,n){let i=[e,t,r],o=!0;for(let a of i)for(let s of a)be(s)||(o=!1);if(o){for(let a of n.keyCandidates)if(ri(a,i))return{kind:"keyed",field:a};return null}for(let a of i){let s=new Set;for(let l of a){if(!ti(l))return null;let c=Ke(l);if(s.has(c))return null;s.add(c)}}return{kind:"self"}}function ii(e,t,r,n){let i=ni(e,t,r,n);if(!i)return r;let o=i.kind==="self"?Ke:f=>Ke(f[i.field]),a=f=>{let k=new Map;for(let T of f)k.set(o(T),T);return k},s=a(e),l=a(t),c=a(r),u=new Map,p=new Set([...s.keys(),...l.keys(),...c.keys()]);for(let f of p){let k=xr(s.has(f)?s.get(f):B,l.has(f)?l.get(f):B,c.has(f)?c.get(f):B,n);k!==B&&u.set(f,k)}let d=[];for(let f of r){let k=o(f);u.has(k)&&d.push(k)}for(let f=0;f<t.length;f++){let k=o(t[f]);if(!u.has(k)||d.includes(k))continue;let T=0;for(let M=f-1;M>=0;M--){let F=d.indexOf(o(t[M]));if(F!==-1){T=F+1;break}}d.splice(T,0,k)}return d.map(f=>u.get(f))}function Et(e,t,r,n={}){let i=n.keyCandidates?[...n.keyCandidates,...yr]:yr;return vr(e===void 0?B:e,t,r,{keyCandidates:i})}function Ct(e,t,r,n={}){let i=n.parse||We,o=[],a=(p,d)=>{if(typeof p!="string")return B;try{return i(p)}catch(f){return o.push(`${d} side is not valid JSON (${f.message})`),B}},s=a(t,"local"),l=a(r,"remote");if(s===B)return{text:r,warnings:o};if(l===B)return{text:t,warnings:o};let c=a(e,"base"),u=Et(c===B?void 0:c,s,l,n);return se(u,l)?{text:r,warnings:o}:se(u,s)?{text:t,warnings:o}:{text:JSON.stringify(u,null,2),warnings:o}}var Tt=(function(){"use strict";let e=()=>{},t='[save-ignore],[snapshot-remove],[no-snapshot],[no-save],[save-remove],[freeze],[save-freeze],[clay~="no-save"],[clay~="no-snapshot"],[clay~="freeze"]';function r(v){if(!(v instanceof Element))return!1;if(v.matches(t))return!0;if(v.tagName==="LINK"||v.tagName==="SCRIPT"){let E=v.getAttribute("src")||v.getAttribute("href")||"";if(E.startsWith("chrome-extension://")||E.startsWith("moz-extension://")||E.startsWith("safari-web-extension://"))return!0}return!1}function n(v){return v instanceof Element?v.closest(t)?!0:r(v):!1}let i=gr({shouldIgnore:n});function o(v,E,S){if(S){let N=S.identityOf(v);if(N&&!S.disabled.has(N.key))return"hm-merge:"+N.key}if(E!=="smart")return v.outerHTML;let O=v.getAttribute("src"),C=v.getAttribute("type")||"text/javascript";if(O)try{let N=new URL(O,window.location.href);return`ext:${C}:${N.origin}${N.pathname}${N.search}`}catch{return`ext:${C}:${O}`}else{let N=v.textContent.trim(),y=5381;for(let A=0;A<N.length;A++)y=(y<<5)+y^N.charCodeAt(A);return`inline:${C}:${Math.abs(y).toString(36)}`}}let a="http://www.w3.org/1999/xhtml";function s(v){return v instanceof Element&&v.tagName==="SCRIPT"&&v.namespaceURI===a}function l(v){let E=document.createElement("div");E.innerHTML="<script><\/script>";let S=E.firstChild;for(let O of v.attributes)S.setAttribute(O.name,O.value);return S.textContent=v.textContent,S}function c(v){if(s(v))return l(v);if(v instanceof Element)for(let E of v.querySelectorAll("script"))s(E)&&E.replaceWith(l(E));return v}function u(v){let E=(v.getAttribute("type")||"").split(";")[0].trim().toLowerCase();return E==="application/json"||E.endsWith("+json")}let p={match:v=>v.hasAttribute("merge"),identity:v=>v.getAttribute("merge")};function d(v,E,S){if(S.merge===!1)return null;let O=[p,...S.mergeTags||[]],C=new WeakMap,N=g=>{if(C.has(g))return C.get(g);let w=null;if(s(g)&&!g.getAttribute("src")&&!n(g)){let _=g;for(let R=0;R<O.length;R++)if(O[R].match(_)){if(!u(_))console.warn("[hyper-morph] merge ignored: script type is not JSON",_);else{let L=O[R].identity(_);L!=null&&L!==""&&(w={key:R+":"+L,raw:L,recognizer:O[R]})}break}}return C.set(g,w),w},y=new Set,A=g=>{let w=new Map,_=R=>{let L=N(R);L&&(w.has(L.key)?(y.add(L.key),console.warn(`[hyper-morph] merge disabled for duplicate identity "${L.raw}"`)):w.set(L.key,R))};s(g)&&_(g);for(let R of g.querySelectorAll("script"))_(R);return w},b=A(v),h=A(E.__hyperMorphRoot||E);if(b.size===0&&h.size===0)return null;let m=null;return{identityOf:N,disabled:y,oldByKey:b,newByKey:h,baseTexts:()=>{if(m)return m;m=new Map;let g=S.mergeBase;if(!g)return m;let w;typeof g=="string"?w=new DOMParser().parseFromString(g,"text/html").documentElement:g instanceof Document?w=g.documentElement:w=g;let _=R=>{let L=N(R);L&&!m.has(L.key)&&m.set(L.key,R.textContent)};s(w)&&_(w);for(let R of w.querySelectorAll("script"))_(R);return m}}}function f(v,E,S){let O=v.merge;if(!O)return!1;let C=O.identityOf(E);if(!C||O.disabled.has(C.key))return!1;let N=O.identityOf(S);if(!N||N.key!==C.key)return!1;let y=E,A=S,b=A.getAttribute("merge-key")||y.getAttribute("merge-key"),{text:h,warnings:m}=Ct(O.baseTexts().get(C.key),y.textContent,A.textContent,{parse:C.recognizer.parse,keyCandidates:b?b.split(/[\s,]+/).filter(Boolean):void 0});for(let x of m)console.warn(`[hyper-morph] merge "${C.raw}": ${x}`);return y.textContent!==h&&(y.textContent=h),!0}let k={morphStyle:"outerHTML",callbacks:{beforeNodeAdded:e,afterNodeAdded:e,beforeNodeMorphed:e,afterNodeMorphed:e,beforeNodeRemoved:e,afterNodeRemoved:e,beforeAttributeUpdated:e},head:{style:"merge",shouldPreserve:v=>v.getAttribute("im-preserve")==="true",shouldReAppend:v=>v.getAttribute("im-re-append")==="true",shouldRemove:e,afterHeadMorphed:e},scripts:{handle:!0,matchMode:"outerHTML",shouldPreserve:v=>v.getAttribute("im-preserve")==="true",shouldReAppend:v=>v.getAttribute("im-re-append")==="true",shouldRemove:e,afterScriptsHandled:e},restoreFocus:!0},T={computeMatches(v,E){let{computeMatches:S}=i.session();return S(v,E)}};function M(v,E,S={}){v=Mn(v);let O=sr(E),C=On(v,O,S),N=C.scripts.handle?new Set(Array.from(v.querySelectorAll("script")).map(h=>o(h,C.scripts.matchMode,C.merge))):null,y=q(C),A=Q(C,v,O,h=>h.morphStyle==="innerHTML"?(j(h,v,O),Array.from(v.childNodes)):G(h,v,O)),b=h=>{y&&P(C,y),F(C);let m=N?Rn(h,N,C):[];return m.length>0?Promise.all(m).then(()=>h):h};return A instanceof Promise?A.then(b):b(A)}function F(v){for(let E of Array.from(v.pantry.childNodes))v.callbacks.beforeNodeRemoved(E)!==!1&&v.callbacks.afterNodeRemoved(E);v.pantry.remove()}function G(v,E,S){let O=sr(E);return j(v,O,S,E,E.nextSibling),Array.from(O.childNodes)}function q(v){if(!v.config.restoreFocus)return null;let E=document.activeElement;if(!(E instanceof HTMLInputElement||E instanceof HTMLTextAreaElement))return null;let{id:S,selectionStart:O,selectionEnd:C}=E;return{element:E,id:S,selectionStart:O,selectionEnd:C}}function P(v,E){let S=E.element;if(E.id&&E.id!==document.activeElement?.getAttribute("id")&&(S=v.target.querySelector(`[id="${CSS.escape(E.id)}"]`),S?.focus()),S&&!S.selectionEnd&&E.selectionEnd!=null)try{S.setSelectionRange(E.selectionStart,E.selectionEnd)}catch{}}let j=(function(){function v(h,m,x,g=null,w=null){m instanceof HTMLTemplateElement&&x instanceof HTMLTemplateElement&&(m=m.content,x=x.content),g||=m.firstChild;for(let _ of x.childNodes){if(r(_))continue;if(g&&g!=w){let L=S(h,_,g,w);if(L){L!==g&&C(h,g,L),V(L,_,h),g=L.nextSibling;continue}}if(_ instanceof Element){let L=_.getAttribute("id");if(h.persistentIds.has(L)){let $=N(m,L,g,h);V($,_,h),g=$.nextSibling;continue}if(!h.idMap.has(_)){let $=h.hyperMatches.get(_);if($&&!h.idMap.has($)&&!b($,m)){A(m,$,g),V($,_,h),g=$.nextSibling;continue}}}let R=E(m,_,g,h);R&&(g=R.nextSibling)}for(;g&&g!=w;){let _=g;g=g.nextSibling,r(_)||O(h,_)}}function E(h,m,x,g){if(g.callbacks.beforeNodeAdded(m)===!1)return null;if(g.idMap.has(m)){let w=m,_=document.createElementNS(w.namespaceURI,w.localName);return h.insertBefore(_,x),V(_,m,g),g.callbacks.afterNodeAdded(_),_}else{let w=c(document.importNode(m,!0));return h.insertBefore(w,x),g.callbacks.afterNodeAdded(w),w}}let S=(function(){function h(g,w,_,R){let L=w instanceof Element&&!g.idMap.has(w)?g.hyperMatches.get(w):null,$=null,H=w.nextSibling,ee=0,D=_;for(;D&&D!=R;){if(r(D)){D=D.nextSibling;continue}if(x(D,w)){if(m(g,D,w)||D===L&&!g.idMap.has(D))return D;if($===null){let J=D instanceof Element&&g.hyperMatchedOldElements.has(D);!g.idMap.has(D)&&!J&&($=D)}}if($===null&&H&&x(D,H)&&(ee++,H=H.nextSibling,ee>=2&&($=void 0)),g.activeElementAndParents.includes(D))break;D=D.nextSibling}return $||null}function m(g,w,_){let R=g.idMap.get(w),L=g.idMap.get(_);if(!L||!R)return!1;for(let $ of R)if(L.has($))return!0;return!1}function x(g,w){let _=g,R=w;return _.nodeType===R.nodeType&&_.tagName===R.tagName&&(!_.getAttribute?.("id")||_.getAttribute?.("id")===R.getAttribute?.("id"))}return h})();function O(h,m){let x=m instanceof Element&&h.hyperMatchedOldElements.has(m)&&!h.idMap.has(m);if(h.idMap.has(m)||x)A(h.pantry,m,null);else{if(h.callbacks.beforeNodeRemoved(m)===!1)return;m.parentNode?.removeChild(m),h.callbacks.afterNodeRemoved(m)}}function C(h,m,x){let g=m;for(;g&&g!==x;){let w=g;g=g.nextSibling,r(w)||O(h,w)}return g}function N(h,m,x,g){let w=g.target.getAttribute?.("id")===m&&g.target||g.target.querySelector(`[id="${CSS.escape(m)}"]`)||g.pantry.querySelector(`[id="${CSS.escape(m)}"]`);return y(w,g),A(h,w,x),w}function y(h,m){let x=h.getAttribute("id");for(;h=h.parentNode;){let g=m.idMap.get(h);g&&(g.delete(x),g.size||m.idMap.delete(h))}}function A(h,m,x){if(h.moveBefore)try{h.moveBefore(m,x)}catch{h.insertBefore(m,x)}else h.insertBefore(m,x)}function b(h,m){let x=m instanceof Element?m:m.realParentNode;return!!x&&h.contains(x)}return v})(),V=(function(){function v(y,A,b){return b.ignoreActive&&y===document.activeElement?null:(b.callbacks.beforeNodeMorphed(y,A)===!1||(y instanceof HTMLHeadElement&&b.head.ignore||(y instanceof HTMLHeadElement&&b.head.style!=="morph"?ce(y,A,b):(E(y,A,b),f(b,y,A)||N(y,b)||j(b,y,A))),b.callbacks.afterNodeMorphed(y,A)),y)}function E(y,A,b){let h=A.nodeType;if(h===1){let m=y,x=A,g=m.attributes,w=x.attributes;for(let _ of w)C(_.name,m,"update",b)||m.getAttribute(_.name)!==_.value&&m.setAttribute(_.name,_.value);for(let _=g.length-1;0<=_;_--){let R=g[_];if(R&&!x.hasAttribute(R.name)){if(C(R.name,m,"remove",b))continue;m.removeAttribute(R.name)}}N(m,b)||S(m,x,b)}(h===8||h===3)&&y.nodeValue!==A.nodeValue&&(y.nodeValue=A.nodeValue)}function S(y,A,b){if(y instanceof HTMLInputElement&&A instanceof HTMLInputElement&&A.type!=="file"){let h=A.value,m=y.value;O(y,A,"checked",b),O(y,A,"disabled",b),b.formStateSync==="property"&&y.indeterminate!==A.indeterminate&&(y.indeterminate=A.indeterminate),b.formStateSync==="property"?m!==h&&(C("value",y,"update",b)||(y.value=h)):A.hasAttribute("value")?m!==h&&(C("value",y,"update",b)||(y.setAttribute("value",h),y.value=h)):C("value",y,"remove",b)||(y.value="",y.removeAttribute("value"))}else if(y instanceof HTMLOptionElement&&A instanceof HTMLOptionElement)O(y,A,"selected",b);else if(y instanceof HTMLTextAreaElement&&A instanceof HTMLTextAreaElement){let h=A.value,m=y.value;if(C("value",y,"update",b)||(h!==m&&(y.value=h),b.formStateSync==="property"))return;y.firstChild&&y.firstChild.nodeValue!==h&&(y.firstChild.nodeValue=h)}}function O(y,A,b,h){let m=A[b],x=y[b];if(m!==x){let g=C(b,y,"update",h);if(g||(y[b]=A[b]),h.formStateSync==="property")return;m?g||y.setAttribute(b,""):C(b,y,"remove",h)||y.removeAttribute(b)}}function C(y,A,b,h){return y==="value"&&h.ignoreActiveValue&&A===document.activeElement?!0:h.callbacks.beforeAttributeUpdated(y,A,b)===!1}function N(y,A){return!!A.ignoreActiveValue&&y===document.activeElement&&y!==document.body}return v})();function Q(v,E,S,O){if(v.head.block){let C=E.querySelector("head"),N=S.querySelector("head");if(C&&N){let y=ce(C,N,v);return Promise.all(y).then(()=>(v.head.block=!1,v.head.ignore=!0,O(v)))}}return O(v)}function fe(v){return v.tagName==="SCRIPT"?!!v.getAttribute("src"):v.tagName==="LINK"?(v.getAttribute("rel")||"").toLowerCase().split(/\s+/).includes("stylesheet")&&!!v.getAttribute("href"):!1}function ce(v,E,S){let O=[],C=[],N=[],y=[],A=S.scripts.matchMode,b=x=>{if(x.tagName==="SCRIPT")return o(x,A,S.merge);if(x.tagName==="LINK"&&A==="smart"){let g=x.getAttribute("href");if(g)try{let w=new URL(g,window.location.href);return`link:${x.getAttribute("rel")||""}:${w.origin}${w.pathname}${w.search}`}catch{}}return x.outerHTML},h=new Map;for(let x of E.children){if(r(x))continue;let g=b(x),w=h.get(g);w||(w=[],h.set(g,w)),w.push(x)}for(let x of v.children){let g=b(x),w=h.get(g),_=!!(w&&w.length),R=S.head.shouldReAppend(x),L=S.head.shouldPreserve(x);if(_||L)if(R)C.push(x);else{if(w&&w.length){let $=w.pop();w.length||h.delete(g),f(S,x,$)}N.push(x)}else S.head.style==="append"?R&&(C.push(x),y.push(x)):S.head.shouldRemove(x)!==!1&&!r(x)&&C.push(x)}for(let x of h.values())y.push(...x);let m=[];for(let x of y){let g=document.createRange().createContextualFragment(x.outerHTML).firstChild;if(S.callbacks.beforeNodeAdded(g)!==!1){if(g instanceof Element&&fe(g)){let w,_=new Promise(function(R){w=R});g.addEventListener("load",function(){w()}),g.addEventListener("error",function(){w()}),m.push(_)}v.appendChild(g),S.callbacks.afterNodeAdded(g),O.push(g)}}for(let x of C)S.callbacks.beforeNodeRemoved(x)!==!1&&(v.removeChild(x),S.callbacks.afterNodeRemoved(x));return S.head.afterHeadMorphed(v,{added:O,kept:N,removed:C}),m}function Rn(v,E,S){if(!S.scripts.handle)return[];let O=[],C=[],N=[],y=[],A=S.scripts.matchMode,b=[];for(let m of v)if(m instanceof Element){s(m)&&b.push(m);for(let x of m.querySelectorAll("script"))s(x)&&b.push(x)}for(let m of b){if(m.closest("head")||n(m))continue;let x=o(m,A,S.merge),g=E.has(x),w=S.scripts.shouldPreserve(m),_=S.scripts.shouldReAppend(m);g||w?_?(C.push(m),y.push(m)):N.push(m):y.push(m)}let h=[];for(let m of y){if(S.callbacks.beforeNodeAdded(m)===!1)continue;let x=document.createElement("script");for(let g of m.attributes)x.setAttribute(g.name,g.value);if(x.textContent=m.textContent,x.src){let g,w=new Promise(function(_){g=_});x.addEventListener("load",function(){g()}),x.addEventListener("error",function(){g()}),h.push(w)}m.replaceWith(x),S.callbacks.afterNodeAdded(x),O.push(x)}return S.scripts.afterScriptsHandled(S.target,{added:O,kept:N,removed:C}),h}let On=(function(){function v(b,h,m){let{persistentIds:x,idMap:g}=y(b,h),w=T.computeMatches(b,h);if(typeof m.key=="function"){let H=new Map,ee=new Set,D=z=>{let U=m.key(z);U!=null&&(H.has(U)?ee.add(U):H.set(U,z))};b instanceof Element&&D(b);for(let z of b.querySelectorAll("*"))D(z);for(let z of ee)H.delete(z);let J=new Map;for(let[z,U]of w)J.set(U,z);let de=h.__hyperMorphRoot||h,oe=new Map,ar=new Set,lr=z=>{let U=m.key(z);U!=null&&(oe.has(U)?ar.add(U):oe.set(U,z))};de instanceof Element&&lr(de);for(let z of de.querySelectorAll("*"))lr(z);for(let z of ar)oe.delete(z);for(let[z,U]of oe){let ge=H.get(z);if(!ge||ge.tagName!==U.tagName)continue;let vt=J.get(ge);vt&&vt!==U&&w.delete(vt);let xt=w.get(U);xt&&xt!==ge&&J.delete(xt),w.set(U,ge),J.set(ge,U)}}let _=E(m),R=d(b,h,_.scripts);if(R){let H=new Map;for(let[ee,D]of w)H.set(D,ee);for(let[ee,D]of R.newByKey){if(R.disabled.has(ee))continue;let J=R.oldByKey.get(ee);if(!J)continue;let de=H.get(J);de&&de!==D&&w.delete(de);let oe=w.get(D);oe&&oe!==J&&H.delete(oe),w.set(D,J),H.set(J,D)}}let L=new Set;for(let H of w.values())L.add(H);let $=_.morphStyle||"outerHTML";if(!["innerHTML","outerHTML"].includes($))throw new Error(`Do not understand how to morph style ${$}`);return{target:b,newContent:h,config:_,morphStyle:$,ignoreActive:_.ignoreActive,ignoreActiveValue:_.ignoreActiveValue,restoreFocus:_.restoreFocus,formStateSync:_.formStateSync||"attribute",idMap:g,persistentIds:x,hyperMatches:w,hyperMatchedOldElements:L,merge:R,pantry:S(),activeElementAndParents:O(b),callbacks:_.callbacks,head:_.head,scripts:_.scripts}}function E(b){let h=Object.assign({},k);return Object.assign(h,b),h.callbacks=Object.assign({},k.callbacks,b.callbacks),h.head=Object.assign({},k.head,b.head),h.scripts=Object.assign({},k.scripts,b.scripts),h}function S(){let b=document.createElement("div");return b.hidden=!0,document.body.insertAdjacentElement("afterend",b),b}function O(b){let h=[],m=document.activeElement;if(m?.tagName!=="BODY"&&b.contains(m))for(;m&&(h.push(m),m!==b);)m=m.parentElement;return h}function C(b){let h=Array.from(b.querySelectorAll("[id]"));return b.getAttribute?.("id")&&h.push(b),h}function N(b,h,m,x){for(let g of x){let w=g.getAttribute("id");if(h.has(w)){let _=g;for(;_;){let R=b.get(_);if(R==null&&(R=new Set,b.set(_,R)),R.add(w),_===m)break;_=_.parentElement}}}}function y(b,h){let m=C(b),x=C(h),g=A(m,x),w=new Map;N(w,g,b,m);let _=h.__hyperMorphRoot||h;return N(w,g,_,x),{persistentIds:g,idMap:w}}function A(b,h){let m=new Set,x=new Map;for(let w of b){let _=w.getAttribute("id");x.has(_)?m.add(_):x.set(_,w.tagName)}let g=new Set;for(let w of h){let _=w.getAttribute("id");g.has(_)?m.add(_):x.get(_)===w.tagName&&g.add(_)}for(let w of m)g.delete(w);return g}return v})(),{normalizeElement:Mn,normalizeParent:sr}=(function(){let v=new WeakSet;function E(y){return y instanceof Document?y.documentElement:y}function S(y){if(y==null)return document.createElement("div");if(typeof y=="string")return S(N(y));if(v.has(y))return y;if(y instanceof Node){if(y.parentNode)return new O(y);{let A=document.createElement("div");return A.append(y),A}}else{let A=document.createElement("div");for(let b of[...y])A.append(b);return A}}class O{constructor(A){this.originalNode=A,this.realParentNode=A.parentNode,this.previousSibling=A.previousSibling,this.nextSibling=A.nextSibling}get childNodes(){let A=[],b=this.previousSibling?this.previousSibling.nextSibling:this.realParentNode.firstChild;for(;b&&b!=this.nextSibling;)A.push(b),b=b.nextSibling;return A}querySelectorAll(A){return this.childNodes.reduce((b,h)=>{if(h instanceof Element){h.matches(A)&&b.push(h);let m=h.querySelectorAll(A);for(let x=0;x<m.length;x++)b.push(m[x])}return b},[])}insertBefore(A,b){return this.realParentNode.insertBefore(A,b)}moveBefore(A,b){return this.realParentNode.moveBefore(A,b)}get __hyperMorphRoot(){return this.originalNode}}function C(y){let A=x=>`<${x}(?:\\s(?:[^>"']|"[^"]*"|'[^']*')*)?>`,b=y.replace(/<!--[\s\S]*?-->/g,"");for(let x of["script","style","textarea","title"])b=b.replace(new RegExp(`${A(x)}[\\s\\S]*?</${x}\\s*>`,"gi"),"");let h=new RegExp(`${A("svg")}[\\s\\S]*?</svg\\s*>`,"gi"),m;do m=b,b=b.replace(h,"");while(b!==m);return b}function N(y){let A=new DOMParser,b=C(y);if(b.match(/<\/html>/)||b.match(/<\/head>/)||b.match(/<\/body>/)){let h=A.parseFromString(y,"text/html");if(b.match(/<\/html>/))return v.add(h),h;{let m=h.firstChild;return m&&v.add(m),m}}else{let m=A.parseFromString("<body><template>"+y+"</template></body>","text/html").body.querySelector("template").content;return v.add(m),m}}return{normalizeElement:E,normalizeParent:S}})();return{morph:M,defaults:k,mergeJson:Et,mergeScriptText:Ct,parseJsonRelaxed:We,parseRulesRelaxed:kr}})();var Ns=Tt.morph,Is=Tt.defaults;var Rt=Tt;var Ge=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],Ot=new Set(Ge),wr=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),_r=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var Je={};_t(Je,{EmptyListInsert:()=>Ie,MAX_RULE_DEPTH:()=>ve,MaxRuleDepthExceeded:()=>me,RuleTargetReadOnly:()=>je,RulesParseError:()=>ke,ShapeMismatch:()=>Ne,UnknownRulesVersion:()=>ye});var ke=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},ye=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},ve=20,me=class extends Error{constructor(t){super(`rule depth exceeded ${ve} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},Ne=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},Ie=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},je=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}};function ae(e,t,r,n={}){return Mt(e,t,r,{depth:0,path:[]},n)}function Mt(e,t,r,n,i){if(n.depth>ve)throw new me(n.path);if(typeof r=="string")return ci(e,t,r,i);if(Array.isArray(r)){let[o,a]=r;return e.find(t,o,i).map((l,c)=>Mt(e,l,a,{depth:n.depth+1,path:[...n.path,c]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[a,s]of Object.entries(r))o[a]=Mt(e,t,s,{depth:n.depth+1,path:[...n.path,a]},i);return o}return null}function ci(e,t,r,n){if(r.endsWith("[]")){let o=r.slice(0,-2);return e.find(t,o,n).map(a=>e.text(a))}if(r.startsWith("@"))return Ar(e,t,r.slice(1));if(r.includes("@")){let o=r.lastIndexOf("@"),a=r.slice(0,o),s=r.slice(o+1),l=a?e.find(t,a,n):[t];return l.length===0?null:Ar(e,l[0],s)}if(r===".")return e.text(t);let i=e.find(t,r,n);return i.length===0?null:e.text(i[0])}function Ar(e,t,r){if(Ot.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}function di(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function mi(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var ui={find(e,t,r={}){let n=mi(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(s=>!di(s)));let o=[];r.skip&&o.push(r.skip);let a=r.templateAttr===null?null:r.templateAttr||"cms-template";if(a&&o.push("["+a+"]"),o.length){let s=o.join(", ");i=i.filter(l=>!l.closest||!l.closest(s))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}},te=ui;function Nt(e){try{return JSON.parse(e)}catch(t){throw new ke(`Invalid strict JSON: ${t.message}`,t)}}function xe(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],a=0;for(;a<i.length;){let s=i[a];if(/\s/.test(s)){a++;continue}if("{}".includes(s)){o.push({type:s,value:s}),a++;continue}if(s==="["){let p=!1,d=a+1;for(;d<i.length&&/\s/.test(i[d]);)d++;if(d<i.length&&/[a-zA-Z_]/.test(i[d])&&(p=!0),!p){o.push({type:s,value:s}),a++;continue}}if(s==="]"){o.push({type:s,value:s}),a++;continue}if(s===":"){o.push({type:t.COLON,value:s}),a++;continue}if(s===","){o.push({type:t.COMMA,value:s}),a++;continue}if(s==='"'||s==="'"){let p=s,d=a+1;for(;d<i.length&&i[d]!==p;)i[d]==="\\"&&d++,d++;o.push({type:t.STRING,value:i.substring(a+1,d),quoted:!0,sourceQuote:p}),a=d+1;continue}let l=a,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let p=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],d=!1;for(let f of p){let k=f.substring(1);if(i.substring(l+1,l+1+k.length)===k){d=!0,l+=k.length;break}}if(!d)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let p=i[l];for(l++;l<i.length&&i[l]!==p;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(a,l);let u=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?u=t.NUMBER:c==="true"||c==="false"||c==="null"?u=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(u=t.SELECTOR),o.push({type:u,value:c,quoted:!1}),a=l}return o}function n(i){let o="";for(let a=0;a<i.length;a++){let s=i[a];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let l=i[a+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING&&s.quoted){let l=s.value;s.sourceQuote==="'"&&(l=l.replace(/\\'/g,"'"),l=l.replace(/(\\*)"/g,(c,u)=>u.length%2===0?u+'\\"':c)),o+=`"${l}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}if(s.type===t.SELECTOR||s.type===t.IDENTIFIER){o+=`"${s.value}"`;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new ke("Invalid extraction rules syntax: "+i.message,i)}}var Er="1",Sr=/^[a-zA-Z0-9_-]+$/;function Le(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!Sr.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${Sr})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],a=e.attr(o,"data-rules-version");if(a!==Er)throw new ye(a);return{rules:xe(e.text(o)),tagNode:o}}var ca=new Function("url","return import(url)");var pi=.5;function It(e,t,r,n,i,o,a,s={}){let l=e.find(t,r,s);if(i.length===0){l.forEach(q=>e.remove(q));return}let c=i.length>l.length,u=l[0]||null;if(c&&!u&&(u=yi(e,t,r,s),!u))throw new Ie(o.path);let p=l.map(q=>fi(e,q,n,s)),d=null;if(u){d=e.clone(u),s.templateAttr&&e.removeAttr(d,s.templateAttr);let q=e.stripIds(d);q>0&&console.warn(`[hyper-html-api] stripped ${q} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let f=gi(i,p,n),k=l[0]||u,T=e.parent(k),M=l.length>0?ki(e,T,k):0,F=new Set,G=i.map((q,P)=>{let j=f[P];if(j>=0)return F.add(j),l[j];let V=e.clone(d);return e.stripIds(V),V});l.forEach((q,P)=>{F.has(P)||e.remove(q)}),G.forEach((q,P)=>{let j=M+P;e.children(T).findIndex(fe=>e.sameNode(fe,q))!==j&&e.insertAt(T,q,j)}),G.forEach((q,P)=>{if(n===null){let j=i[P],V=j==null?"":String(j);e.text(q)!==V&&e.text(q,V)}else{let j=a(e,q,n,i[P],{depth:o.depth+1,path:[...o.path,P]},s);j&&j!==q&&(G[P]=j)}})}function fi(e,t,r,n){return r===null?e.text(t):ae(e,t,r,n)}function gi(e,t,r){let n=new Array(e.length).fill(-1),i=new Set;return e.forEach((o,a)=>{let s=-1,l=-1;t.forEach((c,u)=>{if(i.has(u))return;let p=bi(o,c,r),d=p===l&&s>=0?Math.abs(u-a)<Math.abs(s-a):!1;(p>l||d)&&(l=p,s=u)}),l>=pi&&(n[a]=s,i.add(s))}),n}function bi(e,t,r){if(r===null)return e===t?1:0;let n=Object.keys(r||{});if(n.length===0)return 0;let i=0;for(let o of n)JSON.stringify(e?.[o])===JSON.stringify(t?.[o])&&i++;return i/n.length}function ki(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function yi(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let a of o)if(e.attr(a,n.templateAttr)!=null)return a;i=e.parent(i)}return null}var Or=new Set(["checked","selected","disabled","readOnly","paused"]);function we(e,t,r,n,i={}){let o=[];if(jt(r,n,[],o),o.length)throw new Ne(o);Ye(e,t,r,n,{depth:0,path:[]},i)}function Ye(e,t,r,n,i,o={}){if(i.depth>ve)throw new me(i.path);if(n===void 0)return t;if(typeof r=="string")return vi(e,t,r,n,i,o);if(Array.isArray(r)){let[a,s]=r;return It(e,t,a,s,n,i,Ye,o),t}if(typeof r=="object"&&r!==null){for(let[a,s]of Object.entries(r)){let l=Ye(e,t,s,n==null?n:n[a],{depth:i.depth+1,path:[...i.path,a]},o);l&&l!==t&&(t=l)}return t}return t}function vi(e,t,r,n,i,o){if(r.endsWith("[]")){let s=r.slice(0,-2);return It(e,t,s,null,n,i,Ye,o),t}if(r.startsWith("@"))return Mr(e,t,r.slice(1),n);if(r.includes("@")){let s=r.lastIndexOf("@"),l=r.slice(0,s),c=r.slice(s+1),u=l?e.find(t,l,o):[t];return u.length===0||Mr(e,u[0],c,n),t}if(r===".")return e.text(t,n==null?"":String(n)),t;let a=e.find(t,r,o);return a.length===0||e.text(a[0],n==null?"":String(n)),t}function Mr(e,t,r,n){if(_r.has(r))throw new je(r);if(r==="outerHTML"){let i=n==null?"":String(n);return e.replaceWith(t,i)}return wr.has(r)?(e.prop(t,r,xi(r,n)),t):(e.attr(t,r,n==null?"":String(n)),t)}function xi(e,t){return t==null?Or.has(e)?!1:"":Or.has(e)?!!t:t}function jt(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:qe([...r,o]),expected:"scalar",got:Fe(i)})}):n.push({path:qe(r),expected:"array",got:Fe(t)});return}t!==null&&typeof t=="object"&&n.push({path:qe(r),expected:"scalar",got:Fe(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:qe(r),expected:"array",got:Fe(t)});return}let i=e[1];t.forEach((o,a)=>jt(i,o,[...r,a],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:qe(r),expected:"object",got:Fe(t)});return}for(let[i,o]of Object.entries(e))jt(o,t[i],[...r,i],n)}}}function Fe(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function qe(e){return e.join(".")}function Lt(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return Le(e,n,r)}return null}function Ir(e,t,r,n){let i=Lt(e,t,r);if(!i){let s=typeof r=="string"?`data-rules-name~="${r}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${s}`)}let{rules:o,tagNode:a}=i;return{rules:o,tagNode:a,get:()=>ae(e,t,o,n),set:s=>we(e,t,o,s,n)}}var K={extract:(e,t,r)=>ae(te,e,t,r),apply:(e,t,r,n)=>we(te,e,t,r,n),findRulesIn:(e,t)=>Le(te,e,t),findRules:(e,t)=>Lt(te,e,t),bind:(e,t,r)=>Ir(te,e,t,r),parseStrict:Nt,parseRelaxed:xe,errors:Je,DOM_PROPERTIES:Ge};var qt={};_t(qt,{fromString:()=>ne,getRuleAtPath:()=>ue,getValueAtPath:()=>Li,setAtPath:()=>Ft,toString:()=>ji});function ji(e){return e.map(String).join(".")}function ne(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function ue(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Li(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function Ft(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=Ft(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:Ft((e||{})[n],i,r)}}function De(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=De(n);return t}return""}function Xe(e,t,{ignoreActiveValue:r=!0}={}){Rt.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property"})}function Qe(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var Fi='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',Dt='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',Fr={"@scalar":`
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
      ${Fi}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${Dt}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${Dt}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${Dt}</button>
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
  `},qi=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function et(e){let t=e.head||e.documentElement;if(t)for(let r of qi)Br(e,t,r)}function $t(e,t){if(!Fr[t])return null;let r=e&&(e.head||e.documentElement);return r?Br(e,r,t):null}var jr={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},Ze={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},Di=new Set([...Object.values(Ze),"@chips","@chips-item"]);function $e(e,t,r){if(typeof e!="string")return"@scalar";let n=e.lastIndexOf("@"),i=nt(Be(e,n),t,"data-hcms-component");if(i&&Ze[i]){let o=Ze[i],a=Array.isArray(r)&&r.some(s=>s==="*"||typeof s=="number");return o==="@number"&&!Lr(e,n,t,a).every(Bi)||(o==="@checkbox"||o==="@toggle")&&(n<0||e.slice(n+1)!=="checked")&&!Lr(e,n,t,a).every(Pi)?"@scalar":o}if(n>=0){let o=e.slice(n+1);if(jr[o])return jr[o]}return"@scalar"}function qr(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@"),n=nt(Be(e,r),t,"data-hcms-component");return n&&Ze[n]||null}var $i=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Bi(e){return e==null||e===""?!0:$i.test(String(e))}function Pi(e){return e==null||e===""||e==="true"||e==="false"}function Lr(e,t,r,n){if(!r||!r.querySelectorAll)return[];let i=Be(e,t);if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let a=t>=0?e.slice(t+1):null,s=[];for(let l of o)if(!(l.closest&&l.closest("[cms-template], [data-hcms-shell]"))&&(a?a==="value"&&"value"in l?s.push(l.value):s.push(l.getAttribute?l.getAttribute(a):null):s.push((l.textContent||"").trim()),!n))break;return s}function tt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function _e(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&Z(r,n)||i&&i!==n&&Z(r,i)||Z(r,t)}function rt(e,t,r){let n=tt(e,r);if(!n)return null;let i=_e(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function Dr(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@"),n=nt(Be(e,r),t,"data-hcms-options");if(n==null)return null;let i=n.trim().split(/\s+/).filter(Boolean);return i.length?i:null}function $r(e,t){if(typeof e!="string")return null;let r=e.lastIndexOf("@");return nt(Be(e,r),t,"data-hcms-crop")}function Be(e,t){return t>=0?e.slice(0,t):e}function nt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function it(e,t){if(!e||t==null)return;r(t);function r(n){let i=he(n);if(i==="scalar"){let o=$e(n,e);Di.has(o)&&$t(e,o);return}if(i==="scalar-array"){let o=tt(n,e);o&&($t(e,o.array),$t(e,o.item));return}if(i==="object"){for(let o of Object.values(n))r(o);return}if(i==="object-array"){let o=n[1];if(o&&typeof o=="object"&&!Array.isArray(o))for(let a of Object.values(o))r(a);else r(o)}}}function Br(e,t,r){let n=Z(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=Fr[r].trim(),t.appendChild(i),i}function Z(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${zi(t)}"]`)}function zi(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function he(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Pe(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var Pr={IMG:"src",A:"href"};function ot(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":Pr[t]?Pr[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function zr(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=ot(e),a=`${Hr(r,n)}[data-hcms-field="${Ae(t)}"]`;return r==="INPUT"&&n==="radio"?`${a}:checked@value`:i?`${a}@${i}`:a}function Ui(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=ot(e),o=`${Hr(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function Hr(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Ae(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Ur=new Set(["__proto__","constructor","prototype"]);function st(e,t){return r(e,[]);function r(c,u){let p=he(c);if(p==="scalar")return n(c,u);if(p==="scalar-array")return i(c,u);if(p==="object-array")return o(c,u);if(p==="object"){let d=Object.create(null);for(let[f,k]of Object.entries(c)){if(Ur.has(f))throw new Error(`hypercms: rule key "${f}" is forbidden at "${u.join(".")||"<root>"}"`);d[f]=r(k,[...u,f])}return d}return null}function n(c,u){let p=u.length?u[u.length-1]:null,d=typeof p=="string"?p:"__value",f=l(u,d);if(f)return zr(f,d);let k=s($e(c,t,u),d);return k?zr(k,d):`input[data-hcms-field="${Ae(d)}"]@value`}function i(c,u){let p=rt(c,u,t),d=p&&s(p.item,null)||s("@scalar-array-item",null),f=d?Ui(d):"input[data-hcms-field]@value";return[a(u,"[data-hcms-array-item]"),f]}function o(c,u){let[,p]=c,d=[...u,"*"],f=a(u,"[data-hcms-card]");if(p&&typeof p=="object"&&!Array.isArray(p)){let k=Object.create(null);for(let[T,M]of Object.entries(p)){if(Ur.has(T))throw new Error(`hypercms: rule key "${T}" is forbidden at "${d.join(".")}"`);k[T]=r(M,[...d,T])}return[f,k]}return[f,r(p,[...d,0])]}function a(c,u){let p=c.length?c[c.length-1]:"",d=c.some(T=>T==="*"),f=c.join(".");return`${d?`[data-hcms-field="${Ae(p)}"]`:`[data-hcms-path="${Ae(f)}"]`} > .hcms-array-items > ${u}`}function s(c,u){if(!t)return null;let p=Z(t,c);if(!p)return null;let d=p.content||p;if(u){let f=d.querySelector(`[data-hcms-field="${Ae(u)}"]`);if(f)return f}return d.querySelector("[data-hcms-field]")}function l(c,u){if(!t)return null;let p=c.map(k=>typeof k=="number"?"*":k).join("."),f=[c.join("."),p];for(let k=c.length-1;k>=0;k--){let T=c.slice(0,k).map(M=>typeof M=="number"?"*":M);T.push("*"),f.push(T.join("."))}for(let k of f){if(!k)continue;let T=Z(t,k);if(!T||!Pe(T))continue;let M=T.content||T,F=M.querySelector(`[data-hcms-field="${Ae(u)}"]`)||M.querySelector("[data-hcms-field]");if(F)return F}return null}}function Bt(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function at({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=Pt(e,[],r,n);return o&&i.appendChild(o),i}function Wr({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o}){if(e==="object-array-item")return Gr(t,r,n,i);if(e==="scalar-array-item")return Jr(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function Pt(e,t,r,n){let i=he(e);return i==="scalar"?Hi(e,t,r,n):i==="object"?Gi(e,t,r,n):i==="object-array"?Ji(e,t,r,n):i==="scalar-array"?Yi(e,t,r,n):null}function Hi(e,t,r,n){let i=$e(e,n,t),o=_e(t,i,n);if(!o)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let a=qr(e,n);a==="@number"&&i==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(a==="@checkbox"||a==="@toggle")&&i==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${a}" but its value isn't true/false; rendering a text input so the value is preserved`),Kr(o,a===i?a:null,t);let s=Se(o,n);Ee(s,t);let l=o.getAttribute?.("data-hcms-tpl");if((i==="@select"||i==="@radio")&&l===i&&Vi(s,e,t,r,n,i),i==="@image"&&l==="@image"){let c=$r(e,n);c!=null&&!s.hasAttribute("data-hcms-crop")&&s.setAttribute("data-hcms-crop",c)}return Xi(s,ie(t)),lt(s,ie(t)),ct(s,ie(t)),en(s,r),i==="@file"&&Ki(s),s}function Kr(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function Vi(e,t,r,n,i,o){let a=Dr(t,i),s=a?[...a]:[],l=n==null?"":String(n);if(l!==""&&!s.includes(l)&&s.unshift(l),!a&&(Wi(e,"data-hcms-options required (space-separated values)"),s.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let p=e.querySelector("select[data-hcms-field]");if(!p)return;for(let d of s){let f=i.createElement("option");f.value=d,f.textContent=Qe(d),p.appendChild(f)}return}let c=e.querySelector(".mirk-radio");if(!c||!c.parentNode)return;let u=zt(r.join("."));for(let p of s){let d=c.cloneNode(!0),f=d.querySelector('input[type="radio"]');f&&(f.value=p,f.name=u);let k=d.querySelector(".mirk-radio__label");k&&(k.textContent=Qe(p)),c.parentNode.insertBefore(d,c)}c.remove()}function zt(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function Wi(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function Ki(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=Bt(t.getAttribute("href")))}function Gi(e,t,r,n){let i=_e(t,"@object",n);if(!i)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let o=Se(i,n);if(Ee(o,t),lt(o,ie(t)),ct(o,ie(t)),Pe(i))return rn(o,e,t),tn(o,e,r),o;let a=dt(o,".hcms-object-fields",i,t);for(let[s,l]of Object.entries(e)){let c=r==null?null:r[s],u=Pt(l,[...t,s],c,n);u&&a.appendChild(u)}return o}function Ji(e,t,r,n){let i=_e(t,"@object-array",n);if(!i)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let o=Se(i,n);Ee(o,t),lt(o,ie(t)),ct(o,ie(t)),Xr(o,i),Qr(o,i,t);let a=dt(o,".hcms-array-items",i,t),[,s]=e;return(Array.isArray(r)?r:[]).forEach((c,u)=>{let p=Gr(s,[...t,u],c,n);p&&a.appendChild(p)}),Zr(o),o}function Gr(e,t,r,n){let i=Yr(t,"object-array-item",n);if(!i)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let o=Se(i,n);if(o.setAttribute("data-hcms-card",""),o.classList.contains("hcms-card")||o.classList.add("hcms-card"),Ee(o,t),Pe(i))return e&&typeof e=="object"&&!Array.isArray(e)&&(rn(o,e,t),tn(o,e,r)),o;let a=dt(o,".hcms-card-fields",i,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[s,l]of Object.entries(e)){let c=r==null?null:r[s],u=Pt(l,[...t,s],c,n);u&&a.appendChild(u)}return o}function Yi(e,t,r,n){let i=tt(e,n),o=rt(e,t,n),a=i?i.array:"@scalar-array",s=_e(t,a,n);if(!s)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);Kr(s,i?i.array:null,t);let l=Se(s,n);Ee(l,t),lt(l,ie(t)),ct(l,ie(t)),Xr(l,s),Qr(l,s,t),o&&l.setAttribute("data-hcms-item-tpl",o.item);let c=dt(l,".hcms-array-items",s,t);return(Array.isArray(r)?r:[]).forEach((p,d)=>{let f=Jr([...t,d],p,n,o?o.item:null);f&&c.appendChild(f)}),Zr(l),l}function Jr(e,t,r,n){let i=Yr(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Se(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Ee(o,e),en(o,t),o}function Yr(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return Z(r,i)||n&&Z(r,n)||Z(r,"@"+t)}function Se(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Ee(e,t){e.setAttribute("data-hcms-path",t.join("."))}function Xi(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function lt(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function ct(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=Qe(String(t)))})}function Xr(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function Zr(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Vr(e,"data-hcms-max-items"),o=Vr(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector('[data-hcms-action="add"]');c&&(c.hidden=a||i!=null&&n>=i),r.forEach((u,p)=>{let d=u.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=s||o!=null&&n<=o);let f=u.querySelector('[data-hcms-action="move-up"]');f&&(f.hidden=l||p===0);let k=u.querySelector('[data-hcms-action="move-down"]');k&&(k.hidden=l||p===n-1)})}function Vr(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Qr(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function ie(e){return e.length?e[e.length-1]:null}function en(e,t){let r=Zi(e);if(r.length!==0)for(let n of r)nn(n,t)}function Zi(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&Qi(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function Qi(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function tn(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let a=r==null?null:r[o];nn(i,a)})}function rn(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let a=[...r,o].join(".");i.setAttribute("data-hcms-path",a)})}function dt(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function nn(e,t){let r=ot(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var on={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function sn(e,t,r,n={}){let{observerHandle:i,shellRoot:o,structural:a,structuralPath:s}=n;i?.pause?.();try{if(!a)try{return K.apply(e,t,r,on),{ok:!0}}catch(p){return{ok:!1,error:p}}let l=eo(e,t,s),c=l?ro(l):null,u=l?null:io(e,o);try{return K.apply(e,t,r,on),{ok:!0}}catch(p){return c?no(l,c):u&&oo(e,o,u),{ok:!1,error:p}}}finally{i?.resume?.()}}function eo(e,t,r){if(!r||!e)return null;let n=ne(r),i=[],o=t;for(let a of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&a in o){if(i.push(a),o=o[a],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:to(e,t,i)}function to(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let a=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let s=i[a];if(s==null)return null;if(o===r.length-1){if(Array.isArray(s)){let[l]=s;return n.querySelector?.(l)?.parentElement||null}if(typeof s=="string"&&s.endsWith("[]")){let l=s.slice(0,-2);return n.querySelector?.(l)?.parentElement||null}return null}i=s}return null}function ro(e){let t=[];for(let r of Array.from(e.childNodes))t.push(r.cloneNode(!0));return t}function no(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);for(let r of t)e.appendChild(r)}function io(e,t){let r=[];for(let n of Array.from(e.childNodes))n===t||t&&n.contains?.(t)||r.push(n.cloneNode(!0));return r}function oo(e,t,r){for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||e.removeChild(i);let n=so(e,t);for(let i of r)e.insertBefore(i,n||null)}function so(e,t){if(!t)return null;for(let r of Array.from(e.childNodes))if(r===t||r.contains?.(t))return r;return null}var ao={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,uploadFileBasic:(e,t)=>e?.uploadFileBasic??t?.uploadFileBasic};function W(e,t){let r=ao[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var an=["clay:mutation-ready","hyperclay:mutation-ready"],ln=["clay:sync-applied","hyperclay:livesync-applied"];function Ut(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}function mt(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||n.lastIndexOf("@")>=0)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,a]of Object.entries(n))i[o]=r(a);return i}return n}}function Ht(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function Ce(e,t){if(!e||!e.querySelectorAll)return;e.querySelectorAll("textarea[data-hcms-field]").forEach(Ht);let r=t&&t.defaultView||(typeof window<"u"?window:null),n=r&&r.richclay&&r.richclay.RichClay||W("RichClay",r)||(r&&typeof r.RichClay=="function"?r.RichClay:null);n&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(i=>{if(i.__hcmsRichclay)return;let o;try{o=new n(i,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(s){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",s);return}i.__hcmsRichclay=o;let a=o&&o.squire;a&&typeof a.addEventListener=="function"&&a.addEventListener("input",()=>{let s=r&&r.Event||Event;i.dispatchEvent(new s("input",{bubbles:!0}))})})}var Vt=new WeakSet;function Re(e,t){let r=W("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function pt(e){let t=W("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function mn(e){let{formRoot:t}=e;if(!t||Vt.has(t))return;Vt.add(t);let r=a=>{let s=a.target;!s||!s.closest||s.closest("[data-hcms-form-root]")&&s.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(s.tagName==="TEXTAREA"&&Ht(s),!s.matches('input[type="file"]')&&(!s.closest("[data-hcms-field]")&&!s.hasAttribute?.("data-hcms-field")||cn(s,e)))},n=a=>{let s=a.target;if(!(!s||!s.closest)&&s.closest("[data-hcms-form-root]")){if(s.matches('input[type="file"][data-hcms-upload]')){fo(s,e);return}s.matches('input[type="checkbox"], input[type="radio"], select')&&cn(s,e)}},i=a=>{let s=a.target;if(!s||!s.closest)return;let l=s.closest("[data-hcms-action]");if(!l)return;let c=l.getAttribute("data-hcms-action");if(c==="add"||c==="remove"||c==="move-up"||c==="move-down"||c==="clear-upload"){if(!l.closest("[data-hcms-form-root]"))return}else if(c==="close"&&!l.closest("[data-hcms-shell]"))return;if(c==="add"){let u=l.closest("[data-hcms-path]");if(!u)return;let p=u.getAttribute("data-hcms-path");Wt(p,e)}else if(c==="remove"){let u=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!u)return;xo(u,e)}else if(c==="move-up"||c==="move-down"){let u=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!u)return;yo(u,c==="move-up"?-1:1,e)}else c==="clear-upload"?go(l,e):c==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),Vt.delete(t)}}var lo=new Set(["value","checked"]);function co(e,t){if(!t)return null;let r=ne(t);if(r.some(l=>typeof l=="number"||l==="*"))return null;let n=ue(e.pageRules,r);if(typeof n!="string")return null;let i=n.lastIndexOf("@");if(i===-1)return null;let o=n.slice(i+1);if(!lo.has(o))return null;let a=n.slice(0,i),s=a?e.pageRoot.querySelector(a):e.pageRoot;return s?{el:s,prop:o,oldValue:s[o]}:null}function cn(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=co(t,n);if(re(X(t),{path:n,structural:!1},t),i){let o=W("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var mo={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function uo(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=W("quickcrop");if(typeof n!="function")return{file:e};try{let i=await n(e,{aspect:ho(r),...mo});return i===null?null:{file:po(i.blob,e.name),dataURL:i.dataURL}}catch(i){return ze(t,i&&i.message||"Crop failed"),null}}function ho(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function po(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}async function fo(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";ze(n,null);let o=await uo(r,n);if(!o||t.closed){pe(e);return}let a=o.file,s=o.dataURL||null,l=W("uploadFileBasic"),c=null;if(typeof l=="function")try{let u=await l(a);c=u&&u.uploads&&u.uploads[0]&&u.uploads[0].url}catch(u){if(t.closed){pe(e);return}ze(n,u&&u.message||"Upload failed"),t.dispatch?.("hcms:error",{error:u,path:i}),pe(e);return}if(t.closed){pe(e);return}if(c||(c=s||ko(a)),!c){pe(e);return}ze(n,null),un(n,c,a.name),re(X(t),{path:i,structural:!1},t),pe(e)}function go(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";un(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&pe(i),ze(r,null),re(X(t),{path:n,structural:!1},t)}function bo(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function un(e,t,r){let n=bo(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||Bt(t):"")}function pe(e){try{e.value=""}catch{}}function ko(e){let t=typeof URL<"u"&&URL.createObjectURL?URL:null;if(!t)return"";try{return t.createObjectURL(e)}catch{return""}}function ze(e,t){let r=e.querySelector?e.querySelector(":scope > .hcms-error"):null;r&&(t?(r.textContent=t,r.hidden=!1):(r.textContent="",r.hidden=!0))}function Wt(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${To(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let a=ne(e),s=So(n,a),l=Array.isArray(s),c=typeof s=="string"&&s.endsWith("[]");if(!l&&!c)throw new Error(`hypercms: path "${e}" is not an array`);let u=ht(i,"data-hcms-max-items"),p=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||u!=null&&p.length>=u)return;let d=p.length,f=l?s[1]:s.replace(/\[\]$/,""),k=De(l?f:"string"),T=Wr({shape:l?"object-array-item":"scalar-array-item",itemShape:f,pathArr:[...a,d],data:k,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null});return o.appendChild(T),Ce(T,t.doc),Gt(i),Re(`Add ${e}`,()=>re(X(t),{path:e,structural:!0},t))}function yo(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),a=o.indexOf(e);if(a<0)return;let s=a+t;if(s<0||s>=o.length)return;let l=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[s]):i.insertBefore(e,o[s].nextSibling),Yt(i),Gt(n),l&&typeof l.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),Re(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>re(X(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var ut="Delete this item?";function vo(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||ut;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||ut:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?ut:null}function xo(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=vo(r,t);if(n==null)return Te(e,t);let i=W("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>Te(e,t),()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&Te(e,t):Te(e,t)}function Te(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=ht(i,"data-hcms-min-items"),a=i.querySelector(".hcms-array-items"),s=a?a.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&s<=o)return}return e.remove(),n&&Yt(n),i&&Gt(i),Re(`Remove ${r}`,()=>re(X(t),{path:r,structural:!0},t))}}function re(e,t,r){let n=Ue(e);if(n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=sn(r.pageRoot,r.pageRules,e,{observerHandle:r.observerHandle,shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null});return i.ok?(r.lastFingerprint=n,r.lastData=e,dn(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(dn(r,Ao(i.error,t.path)),r.dispatch?.("hcms:error",{error:i.error,attemptedData:e}),r.onError?.(i.error)),i}function X(e){let t=K.extract(e.formRoot,e.formRules);return le(t,e.formRules)}function le(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>le(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=le(e[n],i);return r}return e}function dn(e,t){e.lastErrors=t&&t.length?t:null,Kt(e)}function Kt(e){if(wo(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=_o(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function wo(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function _o(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,a=>"\\"+a),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let a of o.children)if(a.classList&&a.classList.contains("hcms-error"))return a}r.pop()}return null}function Ao(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function So(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function ht(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function Gt(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=ht(e,"data-hcms-max-items"),o=ht(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');c&&(c.hidden=a||i!=null&&n>=i),r.forEach((u,p)=>{let d=u.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=s||o!=null&&n<=o);let f=u.querySelector('[data-hcms-action="move-up"]');f&&(f.hidden=l||p===0);let k=u.querySelector('[data-hcms-action="move-down"]');k&&(k.hidden=l||p===n-1)})}function Jt(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>Yt(t))}function Yt(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let a=o.join(".");a!==i&&Eo(n,i,a),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function Eo(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}Co(e)}function Co(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=zt(r.getAttribute("data-hcms-path")))}}function Ue(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function To(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Lo={},ft="hcms-shell-styles",Ro="hcms-bundled-styles-installed",Oo='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Oe=new WeakSet,Xt="";function pn(e){Xt=e}var Mo=0;function hn(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function fn({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:a=null,doc:s}){gn(s);let l=`hcms-shell-title-${++Mo}`,c=s.createElement("div");c.setAttribute("data-hcms-shell",""),c.setAttribute("save-remove",""),c.setAttribute("save-ignore",""),c.setAttribute("tabindex","-1"),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby",l);let u=a==="dark"?" dark":a==="light"?" light":"";c.className="hcms-shell pixel-quiet hcms-side-"+t+(r?" hcms-overlay":"")+u;let p=hn(i),d=hn(o);c.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${p}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${d}</div>
          <h2 class="hcms-shell-title" id="${l}">${p}</h2>
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
  `,(e||s.body).appendChild(c);let k=s.body;k.classList.add("hcms-open"),r&&k.classList.add("hcms-overlay"),t==="left"&&k.classList.add("hcms-side-left");let T=jo(c,s),M=Io(c);return{root:c,formRoot:c.querySelector("[data-hcms-form-root]"),noticeEl:c.querySelector(".hcms-shell-notice"),errorEl:c.querySelector(".hcms-shell-error"),saveButton:c.querySelector(".hcms-shell-save"),destroy(){T.detach(),M.detach(),c.remove(),k.classList.remove("hcms-open","hcms-overlay","hcms-side-left")},restoreChrome(){No(s),k.classList.add("hcms-open"),r&&k.classList.add("hcms-overlay"),t==="left"&&k.classList.add("hcms-side-left")}}}function No(e){e&&(e.getElementById(ft)||e.querySelector("style[data-hcms-bundled-styles]")||(Oe.delete(e),gn(e)))}function gn(e){if(e&&!Oe.has(e)){if(e[Ro]){Oe.add(e);return}if(e.getElementById(ft)||e.querySelector("style[data-hcms-bundled-styles]")){Oe.add(e);return}if(Xt){let t=e.createElement("style");t.id=ft,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=Xt,(e.head||e.documentElement).appendChild(t),Oe.add(e);return}try{let t=new URL("./theme.generated.css",Lo.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=ft,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Oe.add(e)}catch{console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")}}}function Io(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function jo(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Oo));if(i.length===0)return;let o=i[0],a=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),a.focus()):!n.shiftKey&&t.activeElement===a&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var Fo="[hypercms]",bn={skip:"[data-hcms-shell]",templateAttr:"cms-template"},kn={skip:"[data-hcms-shell]",templateAttr:null},Zt=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function bt(e,t){let r=[],n=[];return Qt(e,t,[],r,n),{missing:Bo(r),twins:Po(n)}}function Qt(e,t,r,n,i){if(typeof t=="string"){let o=qo(t);if(!o)return;let a=gt(e,o,bn,r);if(t.endsWith("[]")){a.length===0&&gt(e,o,kn,r).length===0&&n.push(He(r));return}a.length===0?n.push(He(r)):a.length>1&&i.push({path:He(r),count:a.length});return}if(Array.isArray(t)){let[o,a]=t;if(typeof o!="string"||!o)return;let s=gt(e,o,bn,r);if(s.length===0){gt(e,o,kn,r).length===0&&n.push(He(r));return}for(let l of s)Qt(l,a,[...r,"*"],n,i);return}if(t&&typeof t=="object")for(let[o,a]of Object.entries(t))Qt(e,a,[...r,o],n,i)}function gt(e,t,r,n){try{return te.find(e,t,r)}catch(i){throw new Zt(He(n),t,i)}}function qo(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=e.lastIndexOf("@");return(t===-1?e:e.slice(0,t))||null}function kt(e){Do(e),$o(e)}function Do(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[];if(r.length===0){t.textContent="",t.hidden=!0;return}let n=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;t.textContent=`${n}: ${r.join(", ")}`,t.hidden=!1}function $o(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${Fo} "${n}" matches ${i} elements; edits go to the first one.`)}}function Bo(e){return[...new Set(e)]}function Po(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function He(e){return e.length?e.join("."):"(whole page)"}var zo={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function yt(e,{ignoreActiveValue:t}={}){let r=K.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.richText?mt(r.rules,e.pageRoot):r.rules,e.rulesTagNode=r.tagNode),et(e.doc),it(e.doc,e.pageRules),e.formRules=st(e.pageRules,e.doc),e.unresolved=bt(e.pageRoot,e.pageRules);let n=le(K.extract(e.pageRoot,e.pageRules,zo),e.pageRules),i=at({pageRules:e.pageRules,formRules:e.formRules,data:n,doc:e.doc});Xe(e.formRoot,i,{ignoreActiveValue:t}),Ce(e.formRoot,e.doc),Kt(e),kt(e),e.updateFingerprint&&e.updateFingerprint()}function yn({debounce:e=100,onRefresh:t}){let r=W("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=0,i=r.onAnyChange({debounce:e},()=>{n>0||t()});return{unsubscribe:typeof i=="function"?i:()=>{},pause(){n++},resume(){n=Math.max(0,n-1)}}}var Uo="[hypercms]";function vn(e,t){if(!e||!e.querySelectorAll||!t)return;let r=Ho(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Uo} template "${o}" doesn't match any rule path; ignored`))})}function Ho(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),a=n.map(l=>typeof l=="number"?"*":l).join(".");o&&t.add(o),a&&t.add(a);let s=he(i);if(s==="object")for(let[l,c]of Object.entries(i))r([...n,l],c);else if(s==="object-array"||s==="scalar-array"){let l=[...n,"*"],c=l.map(u=>typeof u=="number"?"*":u).join(".");if(t.add(c),s==="object-array"){let u=i[1];if(u&&typeof u=="object"&&!Array.isArray(u))for(let[p,d]of Object.entries(u))r([...l,p],d)}}}}var xn="hcms-toggle",wn="hcms-toggle-style",Vo=`
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
`;function Wo({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),a=new URLSearchParams(o).get("editmode");return a?a==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}function Ko({open:e,close:t,isOpen:r},n=document){let i=n.getElementById(xn);if(i)return i;if(!n.getElementById(wn)){let a=n.createElement("style");a.id=wn,a.setAttribute("snapshot-remove",""),a.textContent=Vo,n.head.appendChild(a)}let o=n.createElement("button");return o.type="button",o.id=xn,o.setAttribute("no-save",""),o.setAttribute("snapshot-remove",""),o.setAttribute("save-ignore",""),o.setAttribute("aria-label","Toggle content editor"),o.innerHTML='<span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span>',o.addEventListener("click",async()=>{try{r()?t():await e()}catch(a){console.warn("hypercms: toggle failed to open the CMS",a)}}),n.body.appendChild(o),o}function _n(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Wo({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Ko(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function En(e){pn(e)}var I={isOpen:!1,ctx:null,shell:null,opts:null};function An(e,t){if(I.ctx!==e)return;let r=t==="livesync";t==="livesync"&&I.shell?.restoreChrome?.(),yt(e,{ignoreActiveValue:r})}var Sn=!1;function Go(){if(Sn)return;let e=W("onPrepareForSave");typeof e=="function"&&(e(t=>{let r=t&&t.querySelector&&t.querySelector("body");r&&r.classList.remove("hcms-open","hcms-overlay","hcms-side-left")}),Sn=!0)}function rr(e={}){if(I.isOpen){console.warn("cms.open() called while already open; ignoring");return}Go();let t=e.pageRoot||(typeof document<"u"?document.body:null);if(!t)throw new Error("hypercms: no pageRoot available");let r=t.ownerDocument||(typeof document<"u"?document:null);if(!r)throw new Error("hypercms: no document available");let n=e.rules!==void 0?e.rules:"cms",i=K.findRules(r,n);if(!i){let f=typeof n=="string"?`data-rules-name~="${n}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${f}`)}let o=e.richText!==!1,a=o?mt(i.rules,t):i.rules,s=i.tagNode;et(r),it(r,a),vn(r,a);let l=st(a,r),c=bt(t,a),u=le(K.extract(t,a,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),a),p=pt(()=>fn({mountTo:e.mountTo||r.body,side:e.side||"right",overlay:!!e.overlay,showSaveButton:!!e.showSaveButton,title:e.title,eyebrow:e.eyebrow,theme:e.theme,doc:r})),d={doc:r,pageRoot:t,pageRules:a,formRules:l,rulesTagNode:s,rulesSource:n,richText:o,formRoot:p.formRoot,shellRoot:p.root,errorEl:p.errorEl,noticeEl:p.noticeEl,unresolved:c,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:e.onChange,onError:e.onError,confirmRemove:e.confirmRemove,previouslyFocused:r.activeElement,dispatch(f,k){let T=r.defaultView&&r.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!T)return;let M=new T(f,{bubbles:!0,cancelable:f==="hcms:change",detail:k});p.root.dispatchEvent(M)},onCloseRequested(){nr()}};d.updateFingerprint=()=>{d.lastFingerprint=Ue(X(d))};try{let f=at({pageRules:a,formRules:l,data:u,doc:r});p.formRoot.appendChild(f),Ce(p.formRoot,r),kt(d),mn(d),d.updateFingerprint(),d.observerHandle=yn({onRefresh:()=>yt(d)});let k=W("undo");if(k&&typeof k.on=="function"){let M=()=>{if(I.ctx!==d)return;An(d,"undo");let F=le(K.extract(d.pageRoot,d.pageRules,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),d.pageRules);Ue(F)!==Ue(d.lastData)&&(d.lastData=F,d.onChange?.(F,{path:"",structural:!1}))};k.on("undo",M),k.on("redo",M),d.undoUnsub=()=>{k.off("undo",M),k.off("redo",M)}}let T=()=>An(d,"livesync");d.livesyncUnsub=Ut(r,ln,T),Ve.ctx=d,Yo(r),Jo(p.root),I.isOpen=!0,I.ctx=d,I.shell=p,I.opts=e,d.dispatch("hcms:open",{pageRoot:t})}catch(f){throw d.observerHandle?.unsubscribe?.(),d.undoUnsub?.(),d.livesyncUnsub?.(),d.detachEvents?.(),Ve.ctx===d&&(Ve.ctx=null),pt(()=>p.destroy()),I.isOpen=!1,I.ctx=null,I.shell=null,I.opts=null,f}}function Jo(e){let r=e.querySelector('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');r&&typeof r.focus=="function"&&r.focus()}var Ve={ctx:null};function Yo(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=Ve.ctx;if(i)return Jt(i.formRoot),Re("Reorder",()=>re(X(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var tr="cms";function Xo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(tr)!=="true"?t:(i.set(tr,"false"),"?"+i.toString())}function Zo(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(tr)==="true":!1}function Qo(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=Xo(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}function nr(){if(!I.isOpen)return;let{ctx:e,shell:t}=I;e.closed=!0;let r=e.previouslyFocused;if(e.dispatch("hcms:close",null),Qo(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),pt(()=>t.destroy()),I.isOpen=!1,I.ctx=null,I.shell=null,I.opts=null,Ve.ctx=null,r&&typeof r.focus=="function")try{r.focus()}catch{}}function Cn(){I.isOpen&&yt(I.ctx)}function es(){return I.isOpen}var ts={getData(){return I.isOpen?X(I.ctx):null},setValue(e,t){if(!I.isOpen)throw new Error("hypercms: cms is not open");let r=I.ctx,n=ne(e),i=ue(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=rs(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);ns(o,t,r.formRoot,e),re(X(r),{path:e,structural:!1},r)},addItem(e){if(!I.isOpen)throw new Error("hypercms: cms is not open");Wt(e,I.ctx)},removeItem(e){if(!I.isOpen)throw new Error("hypercms: cms is not open");let t=I.ctx,r=ne(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=ue(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let a=t.formRoot.querySelector(`[data-hcms-path="${or(e)}"]`);if(!a)throw new Error(`hypercms: no element at path "${e}"`);Te(a,t)},refresh:Cn,_commit(){if(!I.isOpen)return;let e=I.ctx;return Jt(e.formRoot),Re("Update",()=>re(X(e),{path:"",structural:!0},e))}};function rs(e,t){let r=or(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function ns(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let a=or(n),s=r.querySelectorAll(`[data-hcms-path="${a}"][data-hcms-field][type="radio"], [data-hcms-path="${a}"] [data-hcms-field][type="radio"]`);s.length?s.forEach(l=>{l.checked=String(l.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var is=250,os=1e4;function ss(){typeof window>"u"||typeof document>"u"||Zo(window.location?window.location.search:"")&&(I.isOpen||as(()=>{if(!I.isOpen)try{rr()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function er(){return!!document.body&&!!W("Mutation")}function as(e){if(er()){queueMicrotask(e);return}let t=Date.now()+os,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function a(){if(I.isOpen){o();return}er()&&(o(),e())}i=Ut(document,an,a),n=setInterval(()=>{if(I.isOpen){o();return}if(er()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},is)}ss();_n({open:rr,close:nr,isOpen:es,hasRules:e=>!!K.findRules(e,"cms")});var ir={open:rr,close:nr,refresh:Cn,api:ts,get isOpen(){return I.isOpen},path:qt,scaffold:De,morphForm:Xe};function or(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Tn=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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

/* ---------- UNRESOLVED-FIELDS NOTICE ---------- */
.hcms-shell-notice {
  font-size: 12px;
  line-height: 1.45;
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let a=n.files[0],s=document.createElement("a");if(s.className="mirk-file__name",s.dataset.filled="",s.href=URL.createObjectURL(a),s.target="_blank",s.rel="noopener",s.textContent=a.name,o.replaceWith(s),!i.querySelector(".mirk-file__remove")){let l=document.createElement("button");l.type="button",l.className="mirk-file__remove",l.setAttribute("aria-label","Remove file"),l.innerHTML=e,s.after(l)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let a=i.querySelector(".mirk-image__placeholder"),s=new FileReader;s.onload=l=>{o.src=l.target.result,o.removeAttribute("hidden"),a&&a.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},s.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),a=o?.querySelector(".mirk-file__input"),s=o?.querySelector(".mirk-file__name");if(a&&(a.value=""),s){let l=document.createElement("span");l.className="mirk-file__name",l.textContent="No file chosen",s.replaceWith(l)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),a=o?.querySelector(".mirk-image__input"),s=o?.querySelector(".mirk-image__preview");a&&(a.value=""),s&&(s.removeAttribute("src"),s.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let a=document.createElement("button");a.type="button",a.className="mirk-tags__remove",a.textContent="\xD7";let s=document.createElement("span");if(s.className="mirk-tags__chip",n){let l=document.createElement("span");l.className="mirk-tags__chip-inner",l.append(i,o,a),s.append(l)}else s.append(i,o,a);return s}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(l=>l.remove());let s=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(s).then(()=>{let l=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=l,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();En(Tn);var ds=ir,ms={cms:ir};return Fn(us);})();

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
