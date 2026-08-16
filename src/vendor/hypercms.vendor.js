var hypercms=(()=>{var Dt=Object.defineProperty;var ri=Object.getOwnPropertyDescriptor;var ni=Object.getOwnPropertyNames;var ii=Object.prototype.hasOwnProperty;var $t=(e,t)=>{for(var r in t)Dt(e,r,{get:t[r],enumerable:!0})},oi=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of ni(t))!ii.call(e,i)&&i!==r&&Dt(e,i,{get:()=>t[i],enumerable:!(n=ri(t,i))||n.enumerable});return e};var si=e=>oi(Dt({},"__esModule",{value:!0}),e);var $s={};$t($s,{cms:()=>qs,default:()=>Ds});function Z(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function it(e){let t=Z(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}var Nr={includeClasses:!0,includeAttributes:["href","src","name","type","role","aria-label","alt","title"],excludeAttributePrefixes:["data-morph-","data-hyper-","data-im-"],textHintLength:64,excludeIds:!0,maxPathDepth:4,landmarks:["HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE"],weights:{signature:100,pathSegment:10,textMatch:20,textMismatch:25,uniqueCandidate:50,positionPenalty:1,maxDriftPenalty:19,slotMatch:30},minConfidence:101,maxScoredCandidates:16};function li(e){let t=5381;for(let r=0;r<e.length;r++)t=(t<<5)+t^e.charCodeAt(r);return Math.abs(t).toString(36)}function ci(e){if(e.classList&&e.classList.length>0)return Array.from(e.classList).sort().join(" ");let t=e.getAttribute?.("class");return t?t.split(/\s+/).filter(Boolean).sort().join(" "):""}function ui(e,t){let r=[];for(let n of e.attributes||[]){let i=n.name;i==="id"||i==="class"||t.excludeAttributePrefixes.some(o=>i.startsWith(o))||t.includeAttributes.includes(i)&&r.push(`${i}=${n.value}`)}return r.sort().join("|")}function di(e,t){return(e.textContent||"").replace(/\s+/g," ").trim().slice(0,t.textHintLength)}function mi(e,t){let r=[e.tagName];return t.includeClasses&&r.push(ci(e)),r.push(ui(e,t)),li(r.join("|"))}function hi(e){let t=e.tagName,r=1,n=e.previousElementSibling;for(;n;)n.tagName===t&&r++,n=n.previousElementSibling;return r}function pi(e,t){return e.getAttribute?.("id")||e.getAttribute?.("role")?!0:t.landmarks.includes(e.tagName)}function fi(e){let t=e.getAttribute?.("id");if(t)return`#${t}`;let r=e.getAttribute?.("role");return r?`@${r}`:e.tagName}function gi(e,t){let r=[],n=e;for(;n&&n.tagName&&r.length<t.maxPathDepth;){let i=`${n.tagName}:${hi(n)}`;if(r.unshift(i),n!==e&&pi(n,t)){r.unshift(fi(n));break}n=n.parentElement}return r}function bi(e,t){let r=0,n=e.length-1,i=t.length-1;for(;n>=0&&i>=0&&e[n]===t[i];)r++,n--,i--;return r}function se(e,t,r){if(r.has(e))return r.get(e);let n={signature:mi(e,t),path:gi(e,t),textHint:di(e,t)};return r.set(e,n),n}function Fr(e,t,r,n){if(n.has(e))return n.get(e);let i=new Map,o=e.querySelectorAll("*"),a=0;for(let s of o){let l=se(s,t,r);l.domIndex=a++,!t.shouldIgnore?.(s)&&(i.has(l.signature)||i.set(l.signature,[]),i.get(l.signature).push(s))}return n.set(e,i),i}function ki(e,t,r){r.delete(e),t.delete(e);let n=e.querySelectorAll("*");for(let i of n)t.delete(i)}function Bt(e,t,r,n,i){let o=se(e,r,n),a=se(t,r,n),s=r.weights,l={},c=0;if(o.signature!==a.signature)return{score:0,breakdown:{rejected:"signature mismatch"}};c+=s.signature,l.signature=s.signature;let b=bi(o.path,a.path)*s.pathSegment;c+=b,l.path=b;let u=!0;if(o.textHint&&a.textHint?o.textHint===a.textHint?(c+=s.textMatch,l.text=s.textMatch):(c-=s.textMismatch,l.text=-s.textMismatch,u=!1):o.textHint!==a.textHint&&(c-=s.textMismatch,l.text=-s.textMismatch,u=!1),i.candidateCount===1&&u&&(c+=s.uniqueCandidate,l.unique=s.uniqueCandidate),typeof o.domIndex=="number"&&typeof a.domIndex=="number"){let k=Math.abs(o.domIndex-a.domIndex),y=Math.min(k*s.positionPenalty,s.maxDriftPenalty);c-=y,l.drift=-y}return{score:c,breakdown:l}}function Ir(e,t,r,n,i){if(r.excludeIds&&e.getAttribute("id"))return null;let o=Fr(t,r,n,i),a=se(e,r,n);if(typeof a.domIndex!="number"){let u=0,k=e.previousElementSibling;for(;k;)u++,k=k.previousElementSibling;a.domIndex=u}let s=o.get(a.signature)||[],l=r.excludeIds?s.filter(u=>!u.getAttribute("id")):s;if(l.length===0)return null;let c=null,d=0,b=null;for(let u of l){let{score:k,breakdown:y}=Bt(e,u,r,n,{candidateCount:l.length});k>d&&(d=k,c=u,b=y)}return d<r.minConfidence?null:{element:c,confidence:d,breakdown:b}}function yi(e,t,r,n){let i=[],o=r.weights.signature+r.weights.slotMatch,a={slot:o};function s(b){if(b.children)return b.children;let u=b.childNodes;if(!u)return[];let k=[];for(let y=0;y<u.length;y++)u[y].nodeType===1&&k.push(u[y]);return k}function l(b,u){let k=s(b),y=s(u);if(k.length===y.length)for(let N=0;N<k.length;N++){let q=k[N],H=y[N];if(r.shouldIgnore?.(q)||r.shouldIgnore?.(H)||r.excludeIds&&(q.getAttribute("id")||H.getAttribute("id"))||q.tagName!==H.tagName)continue;let oe=se(q,r,n).signature,ee=se(H,r,n).signature;oe!==ee&&i.push({newEl:q,oldEl:H,score:o,breakdown:a}),l(q,H)}}function c(b,u){for(;;){if(b.tagName===u.tagName)return[b,u];let k=s(b);if(!b.tagName&&k.length===1){b=k[0];continue}let y=s(u);if(y.length===1&&y[0].tagName===b.tagName){u=y[0];continue}return null}}let d=c(e,t);return d&&l(d[0],d[1]),i}function Lr(e,t,r,n,i){let o=t.querySelectorAll("*"),a=Fr(e,r,n,i),s=0;for(let k of o){let y=se(k,r,n);y.domIndex=s++}let l=[],c=new Map;function d(k,y,N){let q=new Set;if(k.textHint){let z=c.get(k.signature);if(!z){z=new Map;for(let Q of y){let pe=se(Q,r,n).textHint,fe=z.get(pe);fe||(fe=[],z.set(pe,fe)),fe.push(Q)}c.set(k.signature,z)}let ie=z.get(k.textHint);if(ie)for(let Q=0;Q<ie.length&&Q<N;Q++)q.add(ie[Q])}let H=0,oe=y.length;for(;H<oe;){let z=H+oe>>1;se(y[z],r,n).domIndex<k.domIndex?H=z+1:oe=z}let ee=Math.max(0,Math.min(H-(N>>1),y.length-N)),le=Math.min(ee+N,y.length);for(let z=ee;z<le;z++)q.add(y[z]);return[...q]}for(let k of o){if(r.shouldIgnore?.(k)||r.excludeIds&&k.getAttribute("id"))continue;let y=se(k,r,n),N=a.get(y.signature)||[],q=r.excludeIds?N.filter(ee=>!ee.getAttribute("id")):N,H=r.maxScoredCandidates,oe=H&&q.length>H?d(y,q,H):q;for(let ee of oe){let{score:le,breakdown:z}=Bt(k,ee,r,n,{candidateCount:q.length});le>=r.minConfidence&&l.push({newEl:k,oldEl:ee,score:le,breakdown:z})}}if(r.weights.slotMatch>0){let k=yi(t,e,r,n);for(let y of k)l.push(y)}l.sort((k,y)=>y.score-k.score);let b=new Map,u=new Set;for(let{newEl:k,oldEl:y}of l)b.has(k)||u.has(y)||(b.set(k,y),u.add(y));return b}function jr(e,t,r,n){let i=se(e,r,n),o=se(t,r,n),{score:a,breakdown:s}=Bt(e,t,r,n,{candidateCount:1});return{matches:a>=r.minConfidence,score:a,breakdown:s,newMeta:{signature:i.signature,path:i.path,textHint:i.textHint},oldMeta:{signature:o.signature,path:o.path,textHint:o.textHint}}}function qr(e={}){let t={...Nr,...e,weights:{...Nr.weights,...e.weights}},r=new WeakMap,n=new WeakMap;return{findMatch:(i,o)=>Ir(i,o,t,r,n),computeMatches:(i,o)=>Lr(i,o,t,r,n),explain:(i,o)=>jr(i,o,t,r),invalidate:i=>ki(i,r,n),session:()=>{let i=new WeakMap,o=new WeakMap;return{findMatch:(a,s)=>Ir(a,s,t,i,o),computeMatches:(a,s)=>Lr(a,s,t,i,o),explain:(a,s)=>jr(a,s,t,i)}},getConfig:()=>({...t})}}function Pt(e,t){for(;;){for(;t<e.length&&/\s/.test(e[t]);)t++;if(e[t]==="/"&&e[t+1]==="/"){for(;t<e.length&&e[t]!==`
`;)t++;continue}if(e[t]==="/"&&e[t+1]==="*"){let r=e.indexOf("*/",t+2);if(r===-1)return e.length;t=r+2;continue}return t}}function Dr(e){return e.replace(/\\'/g,"'").replace(/(\\*)"/g,(t,r)=>r.length%2===0?r+'\\"':t)}var vi=/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/,xi=/^[A-Za-z_$][A-Za-z0-9_$]*$/;function ot(e){try{return JSON.parse(e)}catch{return JSON.parse(wi(e))}}function wi(e){let t="",r=0,n=(i,o)=>{throw new Error(`Invalid relaxed JSON: ${i} at position ${o}`)};for(;r<e.length&&(r=Pt(e,r),!(r>=e.length));){let i=e[r];if("{}[]:".includes(i)){t+=i,r++;continue}if(i===","){let s=Pt(e,r+1);if(e[s]==="}"||e[s]==="]"){r++;continue}t+=i,r++;continue}if(i==='"'||i==="'"){let s=r+1;for(;s<e.length&&e[s]!==i;)e[s]==="\\"&&s++,s++;s>=e.length&&n("unterminated string",r);let l=e.slice(r+1,s);i==="'"&&(l=Dr(l)),t+='"'+l+'"',r=s+1;continue}let o=r;for(;o<e.length&&/[A-Za-z0-9_$.+\-]/.test(e[o]);)o++;o===r&&n("unexpected character "+JSON.stringify(i),r);let a=e.slice(r,o);if(a==="true"||a==="false"||a==="null"||vi.test(a)){t+=a,r=o;continue}if(xi.test(a)){if(e[Pt(e,o)]===":"){t+='"'+a+'"',r=o;continue}n("unquoted value "+JSON.stringify(a),r)}n("invalid token "+JSON.stringify(a),r)}return t}function $r(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],a=0;for(;a<i.length;){let s=i[a];if(/\s/.test(s)){a++;continue}if("{}".includes(s)){o.push({type:s,value:s}),a++;continue}if(s==="["){let b=!1,u=a+1;for(;u<i.length&&/\s/.test(i[u]);)u++;if(u<i.length&&/[a-zA-Z_]/.test(i[u])&&(b=!0),!b){o.push({type:s,value:s}),a++;continue}}if(s==="]"){o.push({type:s,value:s}),a++;continue}if(s===":"){o.push({type:t.COLON,value:s}),a++;continue}if(s===","){o.push({type:t.COMMA,value:s}),a++;continue}if(s==='"'||s==="'"){let b=s,u=a+1;for(;u<i.length&&i[u]!==b;)i[u]==="\\"&&u++,u++;o.push({type:t.STRING,value:i.substring(a+1,u),quoted:!0,sourceQuote:b}),a=u+1;continue}let l=a,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let b=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],u=!1;for(let k of b){let y=k.substring(1);if(i.substring(l+1,l+1+y.length)===y){u=!0,l+=y.length;break}}if(!u)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let b=i[l];for(l++;l<i.length&&i[l]!==b;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(a,l);let d=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?d=t.NUMBER:c==="true"||c==="false"||c==="null"?d=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(d=t.SELECTOR),o.push({type:d,value:c,quoted:!1}),a=l}return o}function n(i){let o="";for(let a=0;a<i.length;a++){let s=i[a];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let l=i[a+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING){let l=s.value;s.sourceQuote==="'"&&(l=Dr(l)),o+=`"${l}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new Error("Invalid extraction rules syntax: "+i.message)}}var J=Symbol("hyper-morph-json-merge:missing"),Br=["id","_id","uuid","key","slug","code","name"];function Ce(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function Ue(e,t){return Object.prototype.hasOwnProperty.call(e,t)}function _i(e,t,r){Object.defineProperty(e,t,{value:r,enumerable:!0,writable:!0,configurable:!0})}function be(e,t){if(e===t)return!0;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(let r=0;r<e.length;r++)if(!be(e[r],t[r]))return!1;return!0}if(Ce(e)&&Ce(t)){let r=Object.keys(e);if(r.length!==Object.keys(t).length)return!1;for(let n of r)if(!Ue(t,n)||!be(e[n],t[n]))return!1;return!0}return!1}function Pr(e,t,r,n){return be(t,r)?t:be(t,e)?r:be(r,e)?t:Ce(t)&&Ce(r)?Ai(Ce(e)?e:{},t,r,n):Array.isArray(t)&&Array.isArray(r)?Ti(Array.isArray(e)?e:[],t,r,n):r}function zr(e,t,r,n){return t===J&&r===J?J:t===J?e===J?r:be(r,e)?J:r:r===J?e===J?t:J:Pr(e,t,r,n)}function Ai(e,t,r,n){let i={},o=new Set([...Object.keys(e),...Object.keys(t),...Object.keys(r)]);for(let a of o){let s=zr(Ue(e,a)?e[a]:J,Ue(t,a)?t[a]:J,Ue(r,a)?r[a]:J,n);s!==J&&_i(i,a,s)}return i}function Si(e){return e===null||typeof e!="object"}function st(e){return typeof e+":"+String(e)}function Ei(e,t){for(let r of t){let n=new Set;for(let i of r){if(!Ue(i,e))return!1;let o=i[e];if(typeof o!="string"&&typeof o!="number")return!1;let a=st(o);if(n.has(a))return!1;n.add(a)}}return!0}function Ci(e,t,r,n){let i=[e,t,r],o=!0;for(let a of i)for(let s of a)Ce(s)||(o=!1);if(o){for(let a of n.keyCandidates)if(Ei(a,i))return{kind:"keyed",field:a};return null}for(let a of i){let s=new Set;for(let l of a){if(!Si(l))return null;let c=st(l);if(s.has(c))return null;s.add(c)}}return{kind:"self"}}function Ti(e,t,r,n){let i=Ci(e,t,r,n);if(!i)return r;let o=i.kind==="self"?st:k=>st(k[i.field]),a=k=>{let y=new Map;for(let N of k)y.set(o(N),N);return y},s=a(e),l=a(t),c=a(r),d=new Map,b=new Set([...s.keys(),...l.keys(),...c.keys()]);for(let k of b){let y=zr(s.has(k)?s.get(k):J,l.has(k)?l.get(k):J,c.has(k)?c.get(k):J,n);y!==J&&d.set(k,y)}let u=[];for(let k of r){let y=o(k);d.has(y)&&u.push(y)}for(let k=0;k<t.length;k++){let y=o(t[k]);if(!d.has(y)||u.includes(y))continue;let N=0;for(let q=k-1;q>=0;q--){let H=u.indexOf(o(t[q]));if(H!==-1){N=H+1;break}}u.splice(N,0,y)}return u.map(k=>d.get(k))}function zt(e,t,r,n={}){let i=n.keyCandidates?[...n.keyCandidates,...Br]:Br;return Pr(e===void 0?J:e,t,r,{keyCandidates:i})}function Ut(e,t,r,n={}){let i=n.parse||ot,o=[],a=(b,u)=>{if(typeof b!="string")return J;try{return i(b)}catch(k){return o.push(`${u} side is not valid JSON (${k.message})`),J}},s=a(t,"local"),l=a(r,"remote");if(s===J)return{text:r,warnings:o};if(l===J)return{text:t,warnings:o};let c=a(e,"base"),d=zt(c===J?void 0:c,s,l,n);return be(d,l)?{text:r,warnings:o}:be(d,s)?{text:t,warnings:o}:{text:JSON.stringify(d,null,2),warnings:o}}var He=(function(){"use strict";let e=()=>{},t='[save-ignore],[snapshot-remove],[no-snapshot],[no-save],[save-remove],[freeze],[save-freeze],[clay~="no-save"],[clay~="no-snapshot"],[clay~="freeze"]';function r(p){if(!(p instanceof Element))return!1;if(p.matches(t))return!0;if(p.tagName==="LINK"||p.tagName==="SCRIPT"){let T=p.getAttribute("src")||p.getAttribute("href")||"";if(T.startsWith("chrome-extension://")||T.startsWith("moz-extension://")||T.startsWith("safari-web-extension://"))return!0}return!1}function n(p){return p instanceof Element?p.closest(t)?!0:r(p):!1}let i=qr({shouldIgnore:n});function o(p,T,E){if(E){let O=E.identityOf(p);if(O&&!E.disabled.has(O.key))return"hm-merge:"+O.key}if(T!=="smart")return p.outerHTML;let R=p.getAttribute("src"),C=p.getAttribute("type")||"text/javascript";if(R)try{let O=new URL(R,window.location.href);return`ext:${C}:${O.origin}${O.pathname}${O.search}`}catch{return`ext:${C}:${R}`}else{let O=p.textContent.trim(),v=5381;for(let A=0;A<O.length;A++)v=(v<<5)+v^O.charCodeAt(A);return`inline:${C}:${Math.abs(v).toString(36)}`}}let a="http://www.w3.org/1999/xhtml";function s(p){return p instanceof Element&&p.tagName==="SCRIPT"&&p.namespaceURI===a}function l(p){let T=document.createElement("div");T.innerHTML="<script><\/script>";let E=T.firstChild;for(let R of p.attributes)E.setAttribute(R.name,R.value);return E.textContent=p.textContent,E}function c(p){if(s(p))return l(p);if(p instanceof Element)for(let T of p.querySelectorAll("script"))s(T)&&T.replaceWith(l(T));return p}function d(p){let T=(p.getAttribute("type")||"").split(";")[0].trim().toLowerCase();return T==="application/json"||T.endsWith("+json")}let b={match:p=>p.hasAttribute("merge"),identity:p=>p.getAttribute("merge")};function u(p,T,E){if(E.merge===!1)return null;let R=[b,...E.mergeTags||[]],C=new WeakMap,O=f=>{if(C.has(f))return C.get(f);let w=null;if(s(f)&&!f.getAttribute("src")&&!n(f)){let _=f;for(let I=0;I<R.length;I++)if(R[I].match(_)){if(!d(_))console.warn("[hyper-morph] merge ignored: script type is not JSON",_);else{let B=R[I].identity(_);B!=null&&B!==""&&(w={key:I+":"+B,raw:B,recognizer:R[I]})}break}}return C.set(f,w),w},v=new Set,A=f=>{let w=new Map,_=I=>{let B=O(I);B&&(w.has(B.key)?(v.add(B.key),console.warn(`[hyper-morph] merge disabled for duplicate identity "${B.raw}"`)):w.set(B.key,I))};s(f)&&_(f);for(let I of f.querySelectorAll("script"))_(I);return w},g=A(p),h=A(T.__hyperMorphRoot||T);if(g.size===0&&h.size===0)return null;let m=null;return{identityOf:O,disabled:v,oldByKey:g,newByKey:h,baseTexts:()=>{if(m)return m;m=new Map;let f=E.mergeBase;if(!f)return m;let w;typeof f=="string"?w=new DOMParser().parseFromString(f,"text/html").documentElement:f instanceof Document?w=f.documentElement:w=f;let _=I=>{let B=O(I);B&&!m.has(B.key)&&m.set(B.key,I.textContent)};s(w)&&_(w);for(let I of w.querySelectorAll("script"))_(I);return m}}}function k(p,T,E){let R=p.merge;if(!R)return!1;let C=R.identityOf(T);if(!C||R.disabled.has(C.key))return!1;let O=R.identityOf(E);if(!O||O.key!==C.key)return!1;let v=T,A=E,g=A.getAttribute("merge-key")||v.getAttribute("merge-key"),{text:h,warnings:m}=Ut(R.baseTexts().get(C.key),v.textContent,A.textContent,{parse:C.recognizer.parse,keyCandidates:g?g.split(/[\s,]+/).filter(Boolean):void 0});for(let x of m)console.warn(`[hyper-morph] merge "${C.raw}": ${x}`);return v.textContent!==h&&(v.textContent=h),!0}let y={morphStyle:"outerHTML",callbacks:{beforeNodeAdded:e,afterNodeAdded:e,beforeNodeMorphed:e,afterNodeMorphed:e,beforeNodeRemoved:e,afterNodeRemoved:e,beforeAttributeUpdated:e},head:{style:"merge",shouldPreserve:p=>p.getAttribute("im-preserve")==="true",shouldReAppend:p=>p.getAttribute("im-re-append")==="true",shouldRemove:e,afterHeadMorphed:e},scripts:{handle:!0,matchMode:"outerHTML",shouldPreserve:p=>p.getAttribute("im-preserve")==="true",shouldReAppend:p=>p.getAttribute("im-re-append")==="true",shouldRemove:e,afterScriptsHandled:e},restoreFocus:!0},N={computeMatches(p,T){let{computeMatches:E}=i.session();return E(p,T)}};function q(p,T,E={}){p=Qn(p);let R=xr(T),C=Zn(p,R,E),O=C.scripts.handle?new Set(Array.from(p.querySelectorAll("script")).map(h=>o(h,C.scripts.matchMode,C.merge))):null,v=ee(C),A=Q(C,p,R,h=>h.morphStyle==="innerHTML"?(z(h,p,R),Array.from(p.childNodes)):oe(h,p,R)),g=h=>{v&&le(C,v),H(C);let m=O?Lt(h,O,C):[];return m.length>0?Promise.all(m).then(()=>h):h};return A instanceof Promise?A.then(g):g(A)}function H(p){for(let T of Array.from(p.pantry.childNodes))p.callbacks.beforeNodeRemoved(T)!==!1&&p.callbacks.afterNodeRemoved(T);p.pantry.remove()}function oe(p,T,E){let R=xr(T);return z(p,R,E,T,T.nextSibling),Array.from(R.childNodes)}function ee(p){if(!p.config.restoreFocus)return null;let T=document.activeElement;if(!(T instanceof HTMLInputElement||T instanceof HTMLTextAreaElement))return null;let{id:E,selectionStart:R,selectionEnd:C}=T;return{element:T,id:E,selectionStart:R,selectionEnd:C}}function le(p,T){let E=T.element;if(T.id&&T.id!==document.activeElement?.getAttribute("id")&&(E=p.target.querySelector(`[id="${CSS.escape(T.id)}"]`),E?.focus()),E&&!E.selectionEnd&&T.selectionEnd!=null)try{E.setSelectionRange(T.selectionStart,T.selectionEnd)}catch{}}let z=(function(){function p(h,m,x,f=null,w=null){m instanceof HTMLTemplateElement&&x instanceof HTMLTemplateElement&&(m=m.content,x=x.content),f||=m.firstChild;for(let _ of x.childNodes){if(r(_))continue;if(f&&f!=w){let B=E(h,_,f,w);if(B){B!==f&&C(h,f,B),ie(B,_,h),f=B.nextSibling;continue}}if(_ instanceof Element){let B=_.getAttribute("id");if(h.persistentIds.has(B)){let S=O(m,B,f,h);ie(S,_,h),f=S.nextSibling;continue}if(!h.idMap.has(_)){let S=h.hyperMatches.get(_);if(S&&!h.idMap.has(S)&&!g(S,m)){A(m,S,f),ie(S,_,h),f=S.nextSibling;continue}}}let I=T(m,_,f,h);I&&(f=I.nextSibling)}for(;f&&f!=w;){let _=f;f=f.nextSibling,r(_)||R(h,_)}}function T(h,m,x,f){if(f.callbacks.beforeNodeAdded(m)===!1)return null;if(f.idMap.has(m)){let w=m,_=document.createElementNS(w.namespaceURI,w.localName);return h.insertBefore(_,x),ie(_,m,f),f.callbacks.afterNodeAdded(_),_}else{let w=c(document.importNode(m,!0));return h.insertBefore(w,x),f.callbacks.afterNodeAdded(w),w}}let E=(function(){function h(f,w,_,I){let B=w instanceof Element&&!f.idMap.has(w)?f.hyperMatches.get(w):null,S=null,M=w.nextSibling,V=0,D=_;for(;D&&D!=I;){if(r(D)){D=D.nextSibling;continue}if(x(D,w)){if(m(f,D,w)||D===B&&!f.idMap.has(D))return D;if(S===null){let W=D instanceof Element&&f.hyperMatchedOldElements.has(D);!f.idMap.has(D)&&!W&&(S=D)}}if(S===null&&M&&x(D,M)&&(V++,M=M.nextSibling,V>=2&&(S=void 0)),f.activeElementAndParents.includes(D))break;D=D.nextSibling}return S||null}function m(f,w,_){let I=f.idMap.get(w),B=f.idMap.get(_);if(!B||!I)return!1;for(let S of I)if(B.has(S))return!0;return!1}function x(f,w){let _=f,I=w;return _.nodeType===I.nodeType&&_.tagName===I.tagName&&(!_.getAttribute?.("id")||_.getAttribute?.("id")===I.getAttribute?.("id"))}return h})();function R(h,m){let x=m instanceof Element&&h.hyperMatchedOldElements.has(m)&&!h.idMap.has(m);if(h.idMap.has(m)||x)A(h.pantry,m,null);else{if(h.callbacks.beforeNodeRemoved(m)===!1)return;m.parentNode?.removeChild(m),h.callbacks.afterNodeRemoved(m)}}function C(h,m,x){let f=m;for(;f&&f!==x;){let w=f;f=f.nextSibling,r(w)||R(h,w)}return f}function O(h,m,x,f){let w=f.target.getAttribute?.("id")===m&&f.target||f.target.querySelector(`[id="${CSS.escape(m)}"]`)||f.pantry.querySelector(`[id="${CSS.escape(m)}"]`);return v(w,f),A(h,w,x),w}function v(h,m){let x=h.getAttribute("id");for(;h=h.parentNode;){let f=m.idMap.get(h);f&&(f.delete(x),f.size||m.idMap.delete(h))}}function A(h,m,x){if(h.moveBefore)try{h.moveBefore(m,x)}catch{h.insertBefore(m,x)}else h.insertBefore(m,x)}function g(h,m){let x=m instanceof Element?m:m.realParentNode;return!!x&&h.contains(x)}return p})(),ie=(function(){function p(v,A,g){return g.ignoreActive&&v===document.activeElement?null:(g.callbacks.beforeNodeMorphed(v,A)===!1||(v instanceof HTMLHeadElement&&g.head.ignore||(v instanceof HTMLHeadElement&&g.head.style!=="morph"?fe(v,A,g):(T(v,A,g),k(g,v,A)||O(v,g)||z(g,v,A))),g.callbacks.afterNodeMorphed(v,A)),v)}function T(v,A,g){let h=A.nodeType;if(h===1){let m=v,x=A,f=m.attributes,w=x.attributes;for(let _ of w)C(_.name,m,"update",g)||m.getAttribute(_.name)!==_.value&&m.setAttribute(_.name,_.value);for(let _=f.length-1;0<=_;_--){let I=f[_];if(I&&!x.hasAttribute(I.name)){if(C(I.name,m,"remove",g))continue;m.removeAttribute(I.name)}}O(m,g)||E(m,x,g)}(h===8||h===3)&&v.nodeValue!==A.nodeValue&&(v.nodeValue=A.nodeValue)}function E(v,A,g){if(v instanceof HTMLInputElement&&A instanceof HTMLInputElement&&A.type!=="file"){let h=A.value,m=v.value;R(v,A,"checked",g),R(v,A,"disabled",g),g.formStateSync==="property"&&v.indeterminate!==A.indeterminate&&(v.indeterminate=A.indeterminate),g.formStateSync==="property"?m!==h&&(C("value",v,"update",g)||(v.value=h)):A.hasAttribute("value")?m!==h&&(C("value",v,"update",g)||(v.setAttribute("value",h),v.value=h)):C("value",v,"remove",g)||(v.value="",v.removeAttribute("value"))}else if(v instanceof HTMLOptionElement&&A instanceof HTMLOptionElement)R(v,A,"selected",g);else if(v instanceof HTMLTextAreaElement&&A instanceof HTMLTextAreaElement){let h=A.value,m=v.value;if(C("value",v,"update",g)||(h!==m&&(v.value=h),g.formStateSync==="property"))return;v.firstChild&&v.firstChild.nodeValue!==h&&(v.firstChild.nodeValue=h)}}function R(v,A,g,h){let m=A[g],x=v[g];if(m!==x){let f=C(g,v,"update",h);if(f||(v[g]=A[g]),h.formStateSync==="property")return;m?f||v.setAttribute(g,""):C(g,v,"remove",h)||v.removeAttribute(g)}}function C(v,A,g,h){return v==="value"&&h.ignoreActiveValue&&A===document.activeElement?!0:h.callbacks.beforeAttributeUpdated(v,A,g)===!1}function O(v,A){return!!A.ignoreActiveValue&&v===document.activeElement&&v!==document.body}return p})();function Q(p,T,E,R){if(p.head.block){let C=T.querySelector("head"),O=E.querySelector("head");if(C&&O){let v=fe(C,O,p);return Promise.all(v).then(()=>(p.head.block=!1,p.head.ignore=!0,R(p)))}}return R(p)}function pe(p){return p.tagName==="SCRIPT"?!!p.getAttribute("src"):p.tagName==="LINK"?(p.getAttribute("rel")||"").toLowerCase().split(/\s+/).includes("stylesheet")&&!!p.getAttribute("href"):!1}function fe(p,T,E){let R=[],C=[],O=[],v=[],A=E.scripts.matchMode,g=x=>{if(x.tagName==="SCRIPT")return o(x,A,E.merge);if(x.tagName==="LINK"&&A==="smart"){let f=x.getAttribute("href");if(f)try{let w=new URL(f,window.location.href);return`link:${x.getAttribute("rel")||""}:${w.origin}${w.pathname}${w.search}`}catch{}}return x.outerHTML},h=new Map;for(let x of T.children){if(r(x))continue;let f=g(x),w=h.get(f);w||(w=[],h.set(f,w)),w.push(x)}for(let x of p.children){let f=g(x),w=h.get(f),_=!!(w&&w.length),I=E.head.shouldReAppend(x),B=E.head.shouldPreserve(x);if(_||B)if(I)C.push(x);else{if(w&&w.length){let S=w.pop();w.length||h.delete(f),k(E,x,S)}O.push(x)}else E.head.style==="append"?I&&(C.push(x),v.push(x)):E.head.shouldRemove(x)!==!1&&!r(x)&&C.push(x)}for(let x of h.values())v.push(...x);let m=[];for(let x of v){let f=document.createRange().createContextualFragment(x.outerHTML).firstChild;if(E.callbacks.beforeNodeAdded(f)!==!1){if(f instanceof Element&&pe(f)){let w,_=new Promise(function(I){w=I});f.addEventListener("load",function(){w()}),f.addEventListener("error",function(){w()}),m.push(_)}p.appendChild(f),E.callbacks.afterNodeAdded(f),R.push(f)}}for(let x of C)E.callbacks.beforeNodeRemoved(x)!==!1&&(p.removeChild(x),E.callbacks.afterNodeRemoved(x));return E.head.afterHeadMorphed(p,{added:R,kept:O,removed:C}),m}function Lt(p,T,E){if(!E.scripts.handle)return[];let R=[],C=[],O=[],v=[],A=E.scripts.matchMode,g=[];for(let m of p)if(m instanceof Element){s(m)&&g.push(m);for(let x of m.querySelectorAll("script"))s(x)&&g.push(x)}for(let m of g){if(m.closest("head")||n(m))continue;let x=o(m,A,E.merge),f=T.has(x),w=E.scripts.shouldPreserve(m),_=E.scripts.shouldReAppend(m);f||w?_?(C.push(m),v.push(m)):O.push(m):v.push(m)}let h=[];for(let m of v){if(E.callbacks.beforeNodeAdded(m)===!1)continue;let x=document.createElement("script");for(let f of m.attributes)x.setAttribute(f.name,f.value);if(x.textContent=m.textContent,x.src){let f,w=new Promise(function(_){f=_});x.addEventListener("load",function(){f()}),x.addEventListener("error",function(){f()}),h.push(w)}m.replaceWith(x),E.callbacks.afterNodeAdded(x),R.push(x)}return E.scripts.afterScriptsHandled(E.target,{added:R,kept:O,removed:C}),h}let Zn=(function(){function p(g,h,m){let{persistentIds:x,idMap:f}=v(g,h),w=N.computeMatches(g,h);if(typeof m.key=="function"){let M=new Map,V=new Set,D=F=>{let L=m.key(F);L!=null&&(M.has(L)?V.add(L):M.set(L,F))};g instanceof Element&&D(g);for(let F of g.querySelectorAll("*"))D(F);for(let F of V)M.delete(F);let W=new Map;for(let[F,L]of w)W.set(L,F);let te=h.__hyperMorphRoot||h,X=new Map,G=new Set,j=F=>{let L=m.key(F);L!=null&&(X.has(L)?G.add(L):X.set(L,F))};te instanceof Element&&j(te);for(let F of te.querySelectorAll("*"))j(F);for(let F of G)X.delete(F);for(let[F,L]of X){let U=M.get(F);if(!U||U.tagName!==L.tagName)continue;let K=W.get(U);K&&K!==L&&w.delete(K);let ve=w.get(L);ve&&ve!==U&&W.delete(ve),w.set(L,U),W.set(U,L)}}let _=T(m),I=u(g,h,_.scripts);if(I){let M=new Map;for(let[V,D]of w)M.set(D,V);for(let[V,D]of I.newByKey){if(I.disabled.has(V))continue;let W=I.oldByKey.get(V);if(!W)continue;let te=M.get(W);te&&te!==D&&w.delete(te);let X=w.get(D);X&&X!==W&&M.delete(X),w.set(D,W),M.set(W,D)}}let B=new Set;for(let M of w.values())B.add(M);let S=_.morphStyle||"outerHTML";if(!["innerHTML","outerHTML"].includes(S))throw new Error(`Do not understand how to morph style ${S}`);return{target:g,newContent:h,config:_,morphStyle:S,ignoreActive:_.ignoreActive,ignoreActiveValue:_.ignoreActiveValue,restoreFocus:_.restoreFocus,formStateSync:_.formStateSync||"attribute",idMap:f,persistentIds:x,hyperMatches:w,hyperMatchedOldElements:B,merge:I,pantry:E(),activeElementAndParents:R(g),callbacks:_.callbacks,head:_.head,scripts:_.scripts}}function T(g){let h=Object.assign({},y);return Object.assign(h,g),h.callbacks=Object.assign({},y.callbacks,g.callbacks),h.head=Object.assign({},y.head,g.head),h.scripts=Object.assign({},y.scripts,g.scripts),h}function E(){let g=document.createElement("div");return g.hidden=!0,document.body.insertAdjacentElement("afterend",g),g}function R(g){let h=[],m=document.activeElement;if(m?.tagName!=="BODY"&&g.contains(m))for(;m&&(h.push(m),m!==g);)m=m.parentElement;return h}function C(g){let h=Array.from(g.querySelectorAll("[id]"));return g.getAttribute?.("id")&&h.push(g),h}function O(g,h,m,x){for(let f of x){let w=f.getAttribute("id");if(h.has(w)){let _=f;for(;_;){let I=g.get(_);if(I==null&&(I=new Set,g.set(_,I)),I.add(w),_===m)break;_=_.parentElement}}}}function v(g,h){let m=C(g),x=C(h),f=A(m,x),w=new Map;O(w,f,g,m);let _=h.__hyperMorphRoot||h;return O(w,f,_,x),{persistentIds:f,idMap:w}}function A(g,h){let m=new Set,x=new Map;for(let w of g){let _=w.getAttribute("id");x.has(_)?m.add(_):x.set(_,w.tagName)}let f=new Set;for(let w of h){let _=w.getAttribute("id");f.has(_)?m.add(_):x.get(_)===w.tagName&&f.add(_)}for(let w of m)f.delete(w);return f}return p})(),{normalizeElement:Qn,normalizeParent:xr}=(function(){let p=new WeakSet;function T(v){return v instanceof Document?v.documentElement:v}function E(v){if(v==null)return document.createElement("div");if(typeof v=="string")return E(O(v));if(p.has(v))return v;if(v instanceof Node){if(v.parentNode)return new R(v);{let A=document.createElement("div");return A.append(v),A}}else{let A=document.createElement("div");for(let g of[...v])A.append(g);return A}}class R{constructor(A){this.originalNode=A,this.realParentNode=A.parentNode,this.previousSibling=A.previousSibling,this.nextSibling=A.nextSibling}get childNodes(){let A=[],g=this.previousSibling?this.previousSibling.nextSibling:this.realParentNode.firstChild;for(;g&&g!=this.nextSibling;)A.push(g),g=g.nextSibling;return A}querySelectorAll(A){return this.childNodes.reduce((g,h)=>{if(h instanceof Element){h.matches(A)&&g.push(h);let m=h.querySelectorAll(A);for(let x=0;x<m.length;x++)g.push(m[x])}return g},[])}insertBefore(A,g){return this.realParentNode.insertBefore(A,g)}moveBefore(A,g){return this.realParentNode.moveBefore(A,g)}get __hyperMorphRoot(){return this.originalNode}}function C(v){let A=x=>`<${x}(?:\\s(?:[^>"']|"[^"]*"|'[^']*')*)?>`,g=v.replace(/<!--[\s\S]*?-->/g,"");for(let x of["script","style","textarea","title"])g=g.replace(new RegExp(`${A(x)}[\\s\\S]*?</${x}\\s*>`,"gi"),"");let h=new RegExp(`${A("svg")}[\\s\\S]*?</svg\\s*>`,"gi"),m;do m=g,g=g.replace(h,"");while(g!==m);return g}function O(v){let A=new DOMParser,g=C(v);if(g.match(/<\/html>/)||g.match(/<\/head>/)||g.match(/<\/body>/)){let h=A.parseFromString(v,"text/html");if(g.match(/<\/html>/))return p.add(h),h;{let m=h.firstChild;return m&&p.add(m),m}}else{let m=A.parseFromString("<body><template>"+v+"</template></body>","text/html").body.querySelector("template").content;return p.add(m),m}}return{normalizeElement:T,normalizeParent:E}})(),wr=Symbol("hyper-morph-duplicate-key"),_r=[p=>p.getAttribute("data-id"),p=>p.getAttribute("id")];function Pe(p,T){return T.map(E=>{let R=new Map;for(let C of p){if(C.nodeType!==1)continue;let O=E(C);O==null||O===""||R.set(O,R.has(O)?wr:C)}return R})}function Ar(p,T,E,R){for(let C=0;C<R.length;C++){let O=R[C](p);if(O==null||O===""||T[C].get(O)!==p)continue;let v=E[C].get(O);if(!(!v||v===wr)&&v.tagName===p.tagName)return v}return null}function Se(p,T,E){for(let R=0;R<E.length;R++){let C=E[R](p);if(!(C==null||C==="")&&T[R].get(C)===p)return!0}return!1}function ei(p,T,E={}){let R=E.skip||(()=>!1),C=E.ignoreAttr||(()=>!1),O=E.tiers&&E.tiers.length?E.tiers:_r,v=null;function A(){return v||(v=Pe([p,...p.querySelectorAll("*")],O)),v}let g=null;function h(){return g||(g=Pe([T,...T.querySelectorAll("*")],O)),g}function m(j){return!j.parentElement||!j.parentElement.parentElement}function x(j,F,L){return m(j)||Se(j,A(),O)?(L.push({type:"subtree",el:j,base:F}),!1):!0}function f(j,F){let L=[];for(let U of j.attributes)C(j,U.name)||F.getAttribute(U.name)!==U.value&&L.push(U.name);for(let U of F.attributes)C(j,U.name)||j.hasAttribute(U.name)||L.push(U.name);return L}function w(j){let F=[],L=null,U=()=>{L!==null&&(F.push({nodeType:3,nodeValue:L}),L=null)};for(let K of j.childNodes){if(K.nodeType===3){L=(L===null?"":L)+K.nodeValue;continue}K.nodeType===1&&R(K)||(U(),(K.nodeType===1||K.nodeType===8)&&F.push(K))}return U(),F}function _(j,F){if(j.nodeType!==F.nodeType)return!1;if(j.nodeType!==1)return!0;if(j.tagName!==F.tagName)return!1;for(let L of O){let U=L(j),K=L(F);if(U!=null&&U!==""&&K!=null&&K!==""&&U!==K)return!1}return!0}function I(j){let F="";for(let L of j)L.nodeType===3&&L.nodeValue.trim()!==""?F+="\0"+L.nodeValue:L.nodeType===8&&(F+=""+L.nodeValue);return F}function B(j,F,L){let U=w(j),K=w(F);if(U.length===K.length){let $=!0;for(let Y=0;Y<U.length;Y++)if(!_(U[Y],K[Y])){$=!1;break}if($){for(let Y=0;Y<U.length;Y++){let Ee=U[Y];if(Ee.nodeType===1){if(S(Ee,K[Y],L))return!0}else if(Ee.nodeValue!==K[Y].nodeValue)return!0}return!1}}let ve=U.filter($=>$.nodeType===1),jt=K.filter($=>$.nodeType===1);if(I(U)!==I(K))return!0;let Sr=Pe(ve,O),Er=Pe(jt,O),Ft=[],qt=new Set,Cr=[];for(let $ of ve){let Y=Ar($,Sr,Er,O);Y&&!qt.has(Y)?(Ft.push([$,Y]),qt.add(Y)):Cr.push($)}let ge=[];for(let $ of Cr)Se($,Sr,O)?L.push({type:"subtree",el:$,base:null}):ge.push($);let ze=[];for(let $ of jt)qt.has($)||(Se($,Er,O)?L.push({type:"deletion",el:$}):ze.push($));if(ge.length!==ze.length)return!0;for(let $=0;$<ge.length;$++)if(!_(ge[$],ze[$]))return!0;let Tr=new Map(Ft);for(let $=0;$<ge.length;$++)Tr.set(ge[$],ze[$]);let Rr=-1;for(let $ of ve){let Y=Tr.get($);if(!Y)continue;let Ee=jt.indexOf(Y);if(Ee<Rr)return!0;Rr=Ee}for(let $=0;$<ge.length;$++)if(S(ge[$],ze[$],L))return!0;for(let[$,Y]of Ft)if(S($,Y,L))return!0;return!1}function S(j,F,L){if(j.tagName!==F.tagName)return x(j,F,L);let U=f(j,F),K=[];if(B(j,F,K))return x(j,F,L);if(U.length){if(!m(j)&&!Se(F,h(),O))return!0;L.push({type:"attrs",el:j,names:U,base:F})}return L.push(...K),!1}let M=[],V=f(p,T);V.length&&M.push({type:"attrs",el:p,names:V});let D=(j,F)=>Array.from(j.children).find(L=>L.tagName===F)||null,W=D(p,"HEAD"),te=D(T,"HEAD");if(W&&te){let j=[];S(W,te,j),j.length&&M.push({type:"head",el:W})}else(W||te)&&W&&M.push({type:"head",el:W});let X=D(p,"BODY"),G=D(T,"BODY");return X&&G?S(X,G,M):X&&M.push({type:"subtree",el:X,base:null}),{entries:M}}function ti(p,T,E={}){let R=E.tiers&&E.tiers.length?E.tiers:_r,C=p.documentElement,O=[],v=0,A=S=>({ok:!1,placed:O,held:S,skippedAttrs:v});if(!C)return A(null);function g(S){let M=[S,...S.querySelectorAll("*")];return Pe(M,R)}let h=g(C),m=new Map,x=S=>{let M=S.getRootNode(),V=m.get(M);if(!V){let D=M.nodeType===9?M.documentElement:M;V=g(D),m.set(M,V)}return V};function f(S){if(!S.parentElement&&S.tagName==="HTML")return C;if(S.parentElement&&!S.parentElement.parentElement&&S.parentElement.tagName==="HTML"){if(S.tagName==="BODY")return p.body||null;if(S.tagName==="HEAD")return p.head||null}return null}function w(S){let M=f(S);return M||Ar(S,x(S),h,R)}function _(S){if(!S)return null;let M=w(S);return M&&M.isConnected?M:null}function I(S){for(let M=0;M<R.length;M++){let V=R[M](S);V!=null&&V!==""&&h[M].set(V,S)}}for(let S of T){if(S.type!=="deletion")continue;let M=w(S.el);M&&M!==C&&M.remove()}let B=T.filter(S=>S.type!=="deletion").sort((S,M)=>S.el===M.el?0:S.el.compareDocumentPosition(M.el)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);for(let S of B){if(S.type==="head"){let G=p.importNode(S.el,!0);p.head?p.head.replaceWith(G):C.insertBefore(G,C.firstChild),O.push({entry:S,imported:G});continue}if(S.type==="attrs"){let G=_(S.el)||_(S.base);if(!G){v++;continue}for(let j of S.names)S.el.hasAttribute(j)?G.setAttribute(j,S.el.getAttribute(j)):G.removeAttribute(j);continue}let M=S.el;if(f(M))return A(S);let V=_(M)||_(S.base);if(V){let G=p.importNode(M,!0);V.replaceWith(G),I(G),O.push({entry:S,imported:G});continue}if(S.base!=null&&!Se(S.base,x(S.base),R)||!Se(M,x(M),R))return A(S);let D=M.parentElement;if(!D)return A(S);let W=_(D);if(!W)return A(S);let te=null;for(let G=M.previousElementSibling;G;G=G.previousElementSibling){let j=_(G);if(j&&j.parentNode===W){te=j;break}}let X=p.importNode(M,!0);if(te)W.insertBefore(X,te.nextSibling);else{let G=Array.prototype.indexOf.call(D.children,M);W.insertBefore(X,W.children[G]||null)}I(X),O.push({entry:S,imported:X})}return{ok:!0,placed:O,held:null,skippedAttrs:v}}return{morph:q,defaults:y,findChangedRoots:ei,spliceProtected:ti,mergeJson:zt,mergeScriptText:Ut,parseJsonRelaxed:ot,parseRulesRelaxed:$r}})();var aa=He.morph,la=He.defaults,ca=He.findChangedRoots,ua=He.spliceProtected;var Ht=He;var at=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],Vt=new Set(at),Ur=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),Hr=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var lt={};$t(lt,{EmptyListInsert:()=>We,MAX_RULE_DEPTH:()=>Oe,MaxRuleDepthExceeded:()=>xe,RuleTargetReadOnly:()=>Ke,RulesParseError:()=>Te,ShapeMismatch:()=>Ve,UnknownRulesVersion:()=>Re});var Te=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},Re=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},Oe=20,xe=class extends Error{constructor(t){super(`rule depth exceeded ${Oe} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},Ve=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},We=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},Ke=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}};function ke(e,t,r,n={}){return Wt(e,t,r,{depth:0,path:[]},n)}function Wt(e,t,r,n,i){if(n.depth>Oe)throw new xe(n.path);if(typeof r=="string")return Ii(e,t,r,i);if(Array.isArray(r)){let[o,a]=r;return e.find(t,o,i).map((l,c)=>Wt(e,l,a,{depth:n.depth+1,path:[...n.path,c]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[a,s]of Object.entries(r))o[a]=Wt(e,t,s,{depth:n.depth+1,path:[...n.path,a]},i);return o}return null}function Ii(e,t,r,n){if(r.endsWith("[]")){let a=r.slice(0,-2);return e.find(t,a,n).map(s=>e.text(s))}if(r.startsWith("@"))return Vr(e,t,r.slice(1));let i=Z(r);if(i!==-1){let a=r.slice(0,i),s=r.slice(i+1),l=a?e.find(t,a,n):[t];return l.length===0?null:Vr(e,l[0],s)}if(r===".")return e.text(t);let o=e.find(t,r,n);return o.length===0?null:e.text(o[0])}function Vr(e,t,r){if(Vt.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}function Li(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function ji(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var Fi={find(e,t,r={}){let n=ji(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(s=>!Li(s)));let o=[];r.skip&&o.push(r.skip);let a=r.templateAttr===null?null:r.templateAttr||"cms-template";if(a&&o.push("["+a+"]"),o.length){let s=o.join(", ");i=i.filter(l=>!l.closest||!l.closest(s))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}},ue=Fi;function Kt(e){try{return JSON.parse(e)}catch(t){throw new Te(`Invalid strict JSON: ${t.message}`,t)}}function Me(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],a=0;for(;a<i.length;){let s=i[a];if(/\s/.test(s)){a++;continue}if("{}".includes(s)){o.push({type:s,value:s}),a++;continue}if(s==="["){let b=!1,u=a+1;for(;u<i.length&&/\s/.test(i[u]);)u++;if(u<i.length&&/[a-zA-Z_]/.test(i[u])&&(b=!0),!b){o.push({type:s,value:s}),a++;continue}}if(s==="]"){o.push({type:s,value:s}),a++;continue}if(s===":"){o.push({type:t.COLON,value:s}),a++;continue}if(s===","){o.push({type:t.COMMA,value:s}),a++;continue}if(s==='"'||s==="'"){let b=s,u=a+1;for(;u<i.length&&i[u]!==b;)i[u]==="\\"&&u++,u++;o.push({type:t.STRING,value:i.substring(a+1,u),quoted:!0,sourceQuote:b}),a=u+1;continue}let l=a,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let b=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],u=!1;for(let k of b){let y=k.substring(1);if(i.substring(l+1,l+1+y.length)===y){u=!0,l+=y.length;break}}if(!u)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let b=i[l];for(l++;l<i.length&&i[l]!==b;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(a,l);let d=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?d=t.NUMBER:c==="true"||c==="false"||c==="null"?d=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(d=t.SELECTOR),o.push({type:d,value:c,quoted:!1}),a=l}return o}function n(i){let o="";for(let a=0;a<i.length;a++){let s=i[a];if("{}".includes(s.type)||"[]".includes(s.type)){o+=s.value;continue}if(s.type===t.COLON){o+=s.value;continue}if(s.type===t.COMMA){let l=i[a+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=s.value;continue}if(s.type===t.STRING&&s.quoted){let l=s.value;s.sourceQuote==="'"&&(l=l.replace(/\\'/g,"'"),l=l.replace(/(\\*)"/g,(c,d)=>d.length%2===0?d+'\\"':c)),o+=`"${l}"`;continue}if(s.type===t.NUMBER||s.type===t.BOOLEAN){o+=s.value;continue}if(s.type===t.SELECTOR||s.type===t.IDENTIFIER){o+=`"${s.value}"`;continue}o+=`"${s.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new Te("Invalid extraction rules syntax: "+i.message,i)}}var Kr="1",Wr=/^[a-zA-Z0-9_-]+$/;function Ge(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!Wr.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${Wr})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],a=e.attr(o,"data-rules-version");if(a!==Kr)throw new Re(a);return{rules:Me(e.text(o)),tagNode:o}}var Pa=new Function("url","return import(url)");var Di=.5;function Gt(e,t,r,n,i,o,a,s={}){let l=e.find(t,r,s);if(i.length===0){l.forEach(z=>e.remove(z));return}let c=i.length>l.length,d=l[0]||null;if(c&&!d&&(d=zi(e,t,r,s),!d))throw new We(o.path);let b=l.map(z=>$i(e,z,n,s)),u=null;if(d){u=e.clone(d),s.templateAttr&&e.removeAttr(u,s.templateAttr);let z=e.stripIds(u);z>0&&console.warn(`[hyper-html-api] stripped ${z} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let k=Bi(i,b,n),y=l[0]||d,N=e.parent(y),q=l.length>0?Zr(e,N,y):0,H=Ui(e,l),oe=new Set,ee=[],le=i.map((z,ie)=>{let Q=k[ie];if(Q>=0)return oe.add(Q),ee.push(!1),l[Q];ee.push(!0);let pe=e.clone(u);return e.stripIds(pe),pe});if(l.forEach((z,ie)=>{oe.has(ie)||e.remove(z)}),H){le.forEach((z,ie)=>{let Q=q+ie;e.children(N).findIndex(Lt=>e.sameNode(Lt,z))!==Q&&e.insertAt(N,z,Q)}),Xr(e,le,n,i,o,a,s);return}Hi(e,le,ee,N,q),Xr(e,le,n,i,o,a,s)}function Xr(e,t,r,n,i,o,a){t.forEach((s,l)=>{if(r===null){let c=n[l],d=c==null?"":String(c);e.text(s)!==d&&e.text(s,d)}else{let c=o(e,s,r,n[l],{depth:i.depth+1,path:[...i.path,l]},a);c&&c!==s&&(t[l]=c)}})}function $i(e,t,r,n){return r===null?e.text(t):ke(e,t,r,n)}function Bi(e,t,r){let n=new Array(e.length).fill(-1),i=new Set;return e.forEach((o,a)=>{let s=-1,l=-1;t.forEach((c,d)=>{if(i.has(d))return;let b=Pi(o,c,r),u=b===l&&s>=0?Math.abs(d-a)<Math.abs(s-a):!1;(b>l||u)&&(l=b,s=d)}),l>=Di&&(n[a]=s,i.add(s))}),n}function Pi(e,t,r){if(r===null)return e===t?1:0;let n=Object.keys(r||{});if(n.length===0)return 0;let i=0;for(let o of n)JSON.stringify(e?.[o])===JSON.stringify(t?.[o])&&i++;return i/n.length}function Zr(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function zi(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let a of o)if(e.attr(a,n.templateAttr)!=null)return a;i=e.parent(i)}return null}function Ui(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=e.children(r),i=[];for(let o of t){let a=n.findIndex(s=>e.sameNode(s,o));if(a===-1)return!1;i.push(a)}return i.sort((o,a)=>o-a),i[i.length-1]-i[0]===i.length-1}function Hi(e,t,r,n,i){let o=null,a=i;for(let s=0;s<t.length;s++){if(!r[s]){o=t[s];continue}let l=o?e.parent(o):n;if(!l)continue;let c=o?Zr(e,l,o)+1:a++;e.insertAt(l,t[s],c),o=t[s]}}var Qr=new Set(["checked","selected","disabled","readOnly","paused"]);function Ne(e,t,r,n,i={}){let o=[];if(Jt(r,n,[],o),o.length)throw new Ve(o);ct(e,t,r,n,{depth:0,path:[]},i)}function ct(e,t,r,n,i,o={}){if(i.depth>Oe)throw new xe(i.path);if(n===void 0)return t;if(typeof r=="string")return Vi(e,t,r,n,i,o);if(Array.isArray(r)){let[a,s]=r;return Gt(e,t,a,s,n,i,ct,o),t}if(typeof r=="object"&&r!==null){for(let[a,s]of Object.entries(r)){let l=ct(e,t,s,n==null?n:n[a],{depth:i.depth+1,path:[...i.path,a]},o);l&&l!==t&&(t=l)}return t}return t}function Vi(e,t,r,n,i,o){if(r.endsWith("[]")){let l=r.slice(0,-2);return Gt(e,t,l,null,n,i,ct,o),t}if(r.startsWith("@"))return en(e,t,r.slice(1),n);let a=Z(r);if(a!==-1){let l=r.slice(0,a),c=r.slice(a+1),d=l?e.find(t,l,o):[t];return d.length===0||en(e,d[0],c,n),t}if(r===".")return e.text(t,n==null?"":String(n)),t;let s=e.find(t,r,o);return s.length===0||e.text(s[0],n==null?"":String(n)),t}function en(e,t,r,n){if(Hr.has(r))throw new Ke(r);if(r==="outerHTML"){let i=n==null?"":String(n);return e.replaceWith(t,i)}return Ur.has(r)?(e.prop(t,r,Wi(r,n)),t):(e.attr(t,r,n==null?"":String(n)),t)}function Wi(e,t){return t==null?Qr.has(e)?!1:"":Qr.has(e)?t==="false"?!1:!!t:t}function Jt(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:Ye([...r,o]),expected:"scalar",got:Je(i)})}):n.push({path:Ye(r),expected:"array",got:Je(t)});return}t!==null&&typeof t=="object"&&n.push({path:Ye(r),expected:"scalar",got:Je(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:Ye(r),expected:"array",got:Je(t)});return}let i=e[1];t.forEach((o,a)=>Jt(i,o,[...r,a],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:Ye(r),expected:"object",got:Je(t)});return}for(let[i,o]of Object.entries(e))Jt(o,t[i],[...r,i],n)}}}function Je(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function Ye(e){return e.join(".")}function Yt(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return Ge(e,n,r)}return null}function rn(e,t,r,n){let i=Yt(e,t,r);if(!i){let s=typeof r=="string"?`data-rules-name~="${r}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${s}`)}let{rules:o,tagNode:a}=i;return{rules:o,tagNode:a,get:()=>ke(e,t,o,n),set:s=>Ne(e,t,o,s,n)}}var re={extract:(e,t,r)=>ke(ue,e,t,r),apply:(e,t,r,n)=>Ne(ue,e,t,r,n),findRulesIn:(e,t)=>Ge(ue,e,t),findRules:(e,t)=>Yt(ue,e,t),bind:(e,t,r)=>rn(ue,e,t,r),parseStrict:Kt,parseRelaxed:Me,ruleAttrIndex:Z,splitRule:it,errors:lt,DOM_PROPERTIES:at};var Zt={};$t(Zt,{fromString:()=>me,getRuleAtPath:()=>we,getValueAtPath:()=>so,setAtPath:()=>Xt,toString:()=>oo});function oo(e){return e.map(String).join(".")}function me(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function we(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function so(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function Xt(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=Xt(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:Xt((e||{})[n],i,r)}}function Xe(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=Xe(n);return t}return""}function ut(e,t,{ignoreActiveValue:r=!0}={}){Ht.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property"})}function mt(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var ao='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',Qt='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',sn={"@scalar":`
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
      ${ao}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${Qt}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${Qt}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${Qt}</button>
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
  `},lo=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function ht(e){let t=e.head||e.documentElement;if(t)for(let r of lo)un(e,t,r)}function er(e,t){if(!sn[t])return null;let r=e&&(e.head||e.documentElement);return r?un(e,r,t):null}var nn={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},dt={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},co=new Set([...Object.values(dt),"@chips","@chips-item"]);function Ze(e,t,r,n){if(typeof e!="string")return"@scalar";let i=Z(e),o=gt(e,i,r,n),a=bt(o,t,"data-hcms-component");if(a&&dt[a]){let s=dt[a],l=Array.isArray(r)&&r.some(c=>c==="*"||typeof c=="number");return s==="@number"&&!on(e,i,t,l,o).every(mo)||(s==="@checkbox"||s==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!on(e,i,t,l,o).every(ho)?"@scalar":s}if(i>=0){let s=e.slice(i+1);if(nn[s])return nn[s]}return"@scalar"}function an(e,t,r,n){if(typeof e!="string")return null;let i=Z(e),o=bt(gt(e,i,r,n),t,"data-hcms-component");return o&&dt[o]||null}var uo=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function mo(e){return e==null||e===""?!0:uo.test(String(e))}function ho(e){return e==null||e===""||e==="true"||e==="false"}function on(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let a=t>=0?e.slice(t+1):null,s=[];for(let l of o)if(!(l.closest&&l.closest("[cms-template], [data-hcms-shell]"))&&(a?a==="value"&&"value"in l?s.push(l.value):s.push(l.getAttribute?l.getAttribute(a):null):s.push((l.textContent||"").trim()),!n))break;return s}function pt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function Ie(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&ce(r,n)||i&&i!==n&&ce(r,i)||ce(r,t)}function ft(e,t,r){let n=pt(e,r);if(!n)return null;let i=Ie(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function ln(e,t,r,n){if(typeof e!="string")return null;let i=Z(e),o=bt(gt(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let a=o.trim().split(/\s+/).filter(Boolean);return a.length?a:null}function cn(e,t,r,n){if(typeof e!="string")return null;let i=Z(e);return bt(gt(e,i,r,n),t,"data-hcms-crop")}function po(e,t){return t>=0?e.slice(0,t):e}function gt(e,t,r,n){let i=po(e,t);return i&&i!=="."?i:fo(n,r)}function fo(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function bt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function kt(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=_e(n);if(o==="scalar"){let a=Ze(n,e,i,t);co.has(a)&&er(e,a);return}if(o==="scalar-array"){let a=pt(n,e);a&&(er(e,a.array),er(e,a.item));return}if(o==="object"){for(let[a,s]of Object.entries(n))r(s,[...i,a]);return}if(o==="object-array"){let a=n[1],s=[...i,"*"];if(a&&typeof a=="object"&&!Array.isArray(a))for(let[l,c]of Object.entries(a))r(c,[...s,l]);else r(a,s)}}}function un(e,t,r){let n=ce(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=sn[r].trim(),t.appendChild(i),i}function ce(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${go(t)}"]`)}function go(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function _e(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function Qe(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var dn={IMG:"src",A:"href"};function yt(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":dn[t]?dn[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function mn(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=yt(e),a=`${pn(r,n)}[data-hcms-field="${Le(t)}"]`;return r==="INPUT"&&n==="radio"?`${a}:checked@value`:i?`${a}@${i}`:a}function bo(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=yt(e),o=`${pn(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function pn(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function Le(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var hn=new Set(["__proto__","constructor","prototype"]);function vt(e,t){return r(e,[]);function r(c,d){let b=_e(c);if(b==="scalar")return n(c,d);if(b==="scalar-array")return i(c,d);if(b==="object-array")return o(c,d);if(b==="object"){let u=Object.create(null);for(let[k,y]of Object.entries(c)){if(hn.has(k))throw new Error(`hypercms: rule key "${k}" is forbidden at "${d.join(".")||"<root>"}"`);u[k]=r(y,[...d,k])}return u}return null}function n(c,d){let b=d.length?d[d.length-1]:null,u=typeof b=="string"?b:"__value",k=l(d,u);if(k)return mn(k,u);let y=s(Ze(c,t,d,e),u);return y?mn(y,u):`input[data-hcms-field="${Le(u)}"]@value`}function i(c,d){let b=ft(c,d,t),u=b&&s(b.item,null)||s("@scalar-array-item",null),k=u?bo(u):"input[data-hcms-field]@value";return[a(d,"[data-hcms-array-item]"),k]}function o(c,d){let[,b]=c,u=[...d,"*"],k=a(d,"[data-hcms-card]");if(b&&typeof b=="object"&&!Array.isArray(b)){let y=Object.create(null);for(let[N,q]of Object.entries(b)){if(hn.has(N))throw new Error(`hypercms: rule key "${N}" is forbidden at "${u.join(".")}"`);y[N]=r(q,[...u,N])}return[k,y]}return[k,r(b,[...u,0])]}function a(c,d){let b=c.length?c[c.length-1]:"",u=c.some(N=>N==="*"),k=c.join(".");return`${u?`[data-hcms-field="${Le(b)}"]`:`[data-hcms-path="${Le(k)}"]`} > .hcms-array-items > ${d}`}function s(c,d){if(!t)return null;let b=ce(t,c);if(!b)return null;let u=b.content||b;if(d){let k=u.querySelector(`[data-hcms-field="${Le(d)}"]`);if(k)return k}return u.querySelector("[data-hcms-field]")}function l(c,d){if(!t)return null;let b=c.map(y=>typeof y=="number"?"*":y).join("."),k=[c.join("."),b];for(let y=c.length-1;y>=0;y--){let N=c.slice(0,y).map(q=>typeof q=="number"?"*":q);N.push("*"),k.push(N.join("."))}for(let y of k){if(!y)continue;let N=ce(t,y);if(!N||!Qe(N))continue;let q=N.content||N,H=q.querySelector(`[data-hcms-field="${Le(d)}"]`)||q.querySelector("[data-hcms-field]");if(H)return H}return null}}function tr(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function xt({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=rr(e,[],r,n,e);return o&&i.appendChild(o),i}function gn({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:a}){if(e==="object-array-item")return kn(t,r,n,i,a);if(e==="scalar-array-item")return yn(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function rr(e,t,r,n,i){let o=_e(e);return o==="scalar"?ko(e,t,r,n,i):o==="object"?wo(e,t,r,n,i):o==="object-array"?_o(e,t,r,n,i):o==="scalar-array"?Ao(e,t,r,n):null}function ko(e,t,r,n,i){let o=Ze(e,n,t,i),a=Ie(t,o,n);if(!a)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let s=an(e,n,t,i);s==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(s==="@checkbox"||s==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${s}" but its value isn't true/false; rendering a text input so the value is preserved`),bn(a,s===o?s:null,t);let l=je(a,n);Fe(l,t);let c=a.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&c===o&&yo(l,e,t,r,n,o,i),o==="@image"&&c==="@image"){let d=cn(e,n,t,i);d!=null&&!l.hasAttribute("data-hcms-crop")&&l.setAttribute("data-hcms-crop",d)}return So(l,he(t)),wt(l,he(t)),_t(l,he(t)),An(l,r),o==="@file"&&xo(l),l}function bn(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function yo(e,t,r,n,i,o,a){let s=ln(t,i,r,a),l=s?[...s]:[],c=n==null?"":String(n);if(c!==""&&!l.includes(c)&&l.unshift(c),!s&&(vo(e,"data-hcms-options required (space-separated values)"),l.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let u=e.querySelector("select[data-hcms-field]");if(!u)return;for(let k of l){let y=i.createElement("option");y.value=k,y.textContent=mt(k),u.appendChild(y)}return}let d=e.querySelector(".mirk-radio");if(!d||!d.parentNode)return;let b=nr(r.join("."));for(let u of l){let k=d.cloneNode(!0),y=k.querySelector('input[type="radio"]');y&&(y.value=u,y.name=b);let N=k.querySelector(".mirk-radio__label");N&&(N.textContent=mt(u)),d.parentNode.insertBefore(k,d)}d.remove()}function nr(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function vo(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function xo(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=tr(t.getAttribute("href")))}function wo(e,t,r,n,i){let o=Ie(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let a=je(o,n);if(Fe(a,t),wt(a,he(t)),_t(a,he(t)),Qe(o))return En(a,e,t),Sn(a,e,r),a;let s=At(a,".hcms-object-fields",o,t);for(let[l,c]of Object.entries(e)){let d=r==null?null:r[l],b=rr(c,[...t,l],d,n,i);b&&s.appendChild(b)}return a}function _o(e,t,r,n,i){let o=Ie(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let a=je(o,n);Fe(a,t),wt(a,he(t)),_t(a,he(t)),xn(a,o),_n(a,o,t);let s=At(a,".hcms-array-items",o,t),[,l]=e;return(Array.isArray(r)?r:[]).forEach((d,b)=>{let u=kn(l,[...t,b],d,n,i);u&&s.appendChild(u)}),wn(a),a}function kn(e,t,r,n,i){let o=vn(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let a=je(o,n);if(a.setAttribute("data-hcms-card",""),a.classList.contains("hcms-card")||a.classList.add("hcms-card"),Fe(a,t),Qe(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(En(a,e,t),Sn(a,e,r)),a;let s=At(a,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[l,c]of Object.entries(e)){let d=r==null?null:r[l],b=rr(c,[...t,l],d,n,i);b&&s.appendChild(b)}return a}function Ao(e,t,r,n){let i=pt(e,n),o=ft(e,t,n),a=i?i.array:"@scalar-array",s=Ie(t,a,n);if(!s)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);bn(s,i?i.array:null,t);let l=je(s,n);Fe(l,t),wt(l,he(t)),_t(l,he(t)),xn(l,s),_n(l,s,t),o&&l.setAttribute("data-hcms-item-tpl",o.item);let c=At(l,".hcms-array-items",s,t);return(Array.isArray(r)?r:[]).forEach((b,u)=>{let k=yn([...t,u],b,n,o?o.item:null);k&&c.appendChild(k)}),wn(l),l}function yn(e,t,r,n){let i=vn(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=je(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Fe(o,e),An(o,t),o}function vn(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return ce(r,i)||n&&ce(r,n)||ce(r,"@"+t)}function je(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Fe(e,t){e.setAttribute("data-hcms-path",t.join("."))}function So(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function wt(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function _t(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=mt(String(t)))})}function xn(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function wn(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=fn(e,"data-hcms-max-items"),o=fn(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector('[data-hcms-action="add"]');c&&(c.hidden=a||i!=null&&n>=i),r.forEach((d,b)=>{let u=d.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=s||o!=null&&n<=o);let k=d.querySelector('[data-hcms-action="move-up"]');k&&(k.hidden=l||b===0);let y=d.querySelector('[data-hcms-action="move-down"]');y&&(y.hidden=l||b===n-1)})}function fn(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function _n(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function he(e){return e.length?e[e.length-1]:null}function An(e,t){let r=Eo(e);if(r.length!==0)for(let n of r)Cn(n,t)}function Eo(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&Co(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function Co(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function Sn(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let a=r==null?null:r[o];Cn(i,a)})}function En(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let a=[...r,o].join(".");i.setAttribute("data-hcms-path",a)})}function At(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function Cn(e,t){let r=yt(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var Tn={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function Rn(e,t,r,n={}){let{observerHandle:i,shellRoot:o,structural:a,structuralPath:s}=n;i?.pause?.();try{if(!a)try{return re.apply(e,t,r,Tn),{ok:!0}}catch(b){return{ok:!1,error:b}}let l=To(e,t,s),c=l?Oo(l):null,d=l?null:No(e,o);try{return re.apply(e,t,r,Tn),{ok:!0}}catch(b){return c?Mo(l,c):d&&Io(e,o,d),{ok:!1,error:b}}}finally{i?.resume?.()}}function To(e,t,r){if(!r||!e)return null;let n=me(r),i=[],o=t;for(let a of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&a in o){if(i.push(a),o=o[a],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:Ro(e,t,i)}function Ro(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let a=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let s=i[a];if(s==null)return null;if(o===r.length-1){if(Array.isArray(s)){let[l]=s;return n.querySelector?.(l)?.parentElement||null}if(typeof s=="string"&&s.endsWith("[]")){let l=s.slice(0,-2);return n.querySelector?.(l)?.parentElement||null}return null}i=s}return null}function Oo(e){let t=[];for(let r of Array.from(e.childNodes))t.push(r.cloneNode(!0));return t}function Mo(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);for(let r of t)e.appendChild(r)}function No(e,t){let r=[];for(let n of Array.from(e.childNodes))n===t||t&&n.contains?.(t)||r.push(n.cloneNode(!0));return r}function Io(e,t,r){for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||e.removeChild(i);let n=Lo(e,t);for(let i of r)e.insertBefore(i,n||null)}function Lo(e,t){if(!t)return null;for(let r of Array.from(e.childNodes))if(r===t||r.contains?.(t))return r;return null}var jo={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,uploadFileBasic:(e,t)=>e?.uploadFileBasic??t?.uploadFileBasic};function ne(e,t){let r=jo[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var On=["clay:mutation-ready","hyperclay:mutation-ready"],Mn=["clay:sync-applied","hyperclay:livesync-applied"];function ir(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}function St(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||Z(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,a]of Object.entries(n))i[o]=r(a);return i}return n}}function or(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function qe(e,t){if(!e||!e.querySelectorAll)return;e.querySelectorAll("textarea[data-hcms-field]").forEach(or);let r=t&&t.defaultView||(typeof window<"u"?window:null),n=r&&r.richclay&&r.richclay.RichClay||ne("RichClay",r)||(r&&typeof r.RichClay=="function"?r.RichClay:null);n&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(i=>{if(i.__hcmsRichclay)return;let o;try{o=new n(i,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(s){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",s);return}i.__hcmsRichclay=o;let a=o&&o.squire;a&&typeof a.addEventListener=="function"&&a.addEventListener("input",()=>{let s=r&&r.Event||Event;i.dispatchEvent(new s("input",{bubbles:!0}))})})}var sr=new WeakSet;function $e(e,t){let r=ne("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function Tt(e){let t=ne("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Ln(e){let{formRoot:t}=e;if(!t||sr.has(t))return;sr.add(t);let r=a=>{let s=a.target;!s||!s.closest||s.closest("[data-hcms-form-root]")&&s.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(s.tagName==="TEXTAREA"&&or(s),!s.matches('input[type="file"]')&&(!s.closest("[data-hcms-field]")&&!s.hasAttribute?.("data-hcms-field")||Nn(s,e)))},n=a=>{let s=a.target;if(!(!s||!s.closest)&&s.closest("[data-hcms-form-root]")){if(s.matches('input[type="file"][data-hcms-upload]')){zo(s,e);return}s.matches('input[type="checkbox"], input[type="radio"], select')&&Nn(s,e)}},i=a=>{let s=a.target;if(!s||!s.closest)return;let l=s.closest("[data-hcms-action]");if(!l)return;let c=l.getAttribute("data-hcms-action");if(c==="add"||c==="remove"||c==="move-up"||c==="move-down"||c==="clear-upload"){if(!l.closest("[data-hcms-form-root]"))return}else if(c==="close"&&!l.closest("[data-hcms-shell]"))return;if(c==="add"){let d=l.closest("[data-hcms-path]");if(!d)return;let b=d.getAttribute("data-hcms-path");ar(b,e)}else if(c==="remove"){let d=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!d)return;Go(d,e)}else if(c==="move-up"||c==="move-down"){let d=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!d)return;Wo(d,c==="move-up"?-1:1,e)}else c==="clear-upload"?Uo(l,e):c==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),sr.delete(t)}}var Fo=new Set(["value","checked"]);function qo(e,t){if(!t)return null;let r=me(t);if(r.some(l=>typeof l=="number"||l==="*"))return null;let n=we(e.pageRules,r);if(typeof n!="string")return null;let i=re.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!Fo.has(o))return null;let a=n.slice(0,i),s=a?e.pageRoot.querySelector(a):e.pageRoot;return s?{el:s,prop:o,oldValue:s[o]}:null}function Nn(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=qo(t,n);if(de(ae(t),{path:n,structural:!1},t),i){let o=ne("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var Do={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function $o(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=ne("quickcrop");if(typeof n!="function")return{file:e};try{let i=await n(e,{aspect:Bo(r),...Do});return i===null?null:{file:Po(i.blob,e.name),dataURL:i.dataURL}}catch(i){return et(t,i&&i.message||"Crop failed"),null}}function Bo(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function Po(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}async function zo(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";et(n,null);let o=await $o(r,n);if(!o||t.closed){Ae(e);return}let a=o.file,s=o.dataURL||null,l=ne("uploadFileBasic"),c=null;if(typeof l=="function")try{let d=await l(a);c=d&&d.uploads&&d.uploads[0]&&d.uploads[0].url}catch(d){if(t.closed){Ae(e);return}et(n,d&&d.message||"Upload failed"),t.dispatch?.("hcms:error",{error:d,path:i}),Ae(e);return}if(t.closed){Ae(e);return}if(c||(c=s||Vo(a)),!c){Ae(e);return}et(n,null),jn(n,c,a.name),de(ae(t),{path:i,structural:!1},t),Ae(e)}function Uo(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";jn(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&Ae(i),et(r,null),de(ae(t),{path:n,structural:!1},t)}function Ho(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function jn(e,t,r){let n=Ho(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||tr(t):"")}function Ae(e){try{e.value=""}catch{}}function Vo(e){let t=typeof URL<"u"&&URL.createObjectURL?URL:null;if(!t)return"";try{return t.createObjectURL(e)}catch{return""}}function et(e,t){let r=e.querySelector?e.querySelector(":scope > .hcms-error"):null;r&&(t?(r.textContent=t,r.hidden=!1):(r.textContent="",r.hidden=!0))}function ar(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${ts(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let a=me(e),s=Zo(n,a),l=Array.isArray(s),c=typeof s=="string"&&s.endsWith("[]");if(!l&&!c)throw new Error(`hypercms: path "${e}" is not an array`);let d=Ct(i,"data-hcms-max-items"),b=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||d!=null&&b.length>=d)return;let u=b.length,k=l?s[1]:s.replace(/\[\]$/,""),y=Xe(l?k:"string"),N=gn({shape:l?"object-array-item":"scalar-array-item",itemShape:k,pathArr:[...a,u],data:y,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(N),qe(N,t.doc),cr(i),$e(`Add ${e}`,()=>de(ae(t),{path:e,structural:!0},t))}function Wo(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),a=o.indexOf(e);if(a<0)return;let s=a+t;if(s<0||s>=o.length)return;let l=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[s]):i.insertBefore(e,o[s].nextSibling),dr(i),cr(n),l&&typeof l.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),$e(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>de(ae(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var Et="Delete this item?";function Ko(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||Et;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||Et:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?Et:null}function Go(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=Ko(r,t);if(n==null)return De(e,t);let i=ne("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>De(e,t),()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&De(e,t):De(e,t)}function De(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=Ct(i,"data-hcms-min-items"),a=i.querySelector(".hcms-array-items"),s=a?a.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&s<=o)return}return e.remove(),n&&dr(n),i&&cr(i),$e(`Remove ${r}`,()=>de(ae(t),{path:r,structural:!0},t))}}function de(e,t,r){let n=tt(e);if(n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=Rn(r.pageRoot,r.pageRules,e,{observerHandle:r.observerHandle,shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null});return i.ok?(r.lastFingerprint=n,r.lastData=e,In(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(In(r,Xo(i.error,t.path)),r.dispatch?.("hcms:error",{error:i.error,attemptedData:e}),r.onError?.(i.error)),i}function ae(e){let t=re.extract(e.formRoot,e.formRules);return ye(t,e.formRules)}function ye(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>ye(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=ye(e[n],i);return r}return e}function In(e,t){e.lastErrors=t&&t.length?t:null,lr(e)}function lr(e){if(Jo(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=Yo(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function Jo(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function Yo(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,a=>"\\"+a),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let a of o.children)if(a.classList&&a.classList.contains("hcms-error"))return a}r.pop()}return null}function Xo(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function Zo(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Ct(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function cr(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Ct(e,"data-hcms-max-items"),o=Ct(e,"data-hcms-min-items"),a=e.hasAttribute("data-hcms-no-add"),s=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');c&&(c.hidden=a||i!=null&&n>=i),r.forEach((d,b)=>{let u=d.querySelector('[data-hcms-action="remove"]');u&&(u.hidden=s||o!=null&&n<=o);let k=d.querySelector('[data-hcms-action="move-up"]');k&&(k.hidden=l||b===0);let y=d.querySelector('[data-hcms-action="move-down"]');y&&(y.hidden=l||b===n-1)})}function ur(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>dr(t))}function dr(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let a=o.join(".");a!==i&&Qo(n,i,a),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function Qo(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}es(e)}function es(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=nr(r.getAttribute("data-hcms-path")))}}function tt(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function ts(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var ls={},Rt="hcms-shell-styles",rs="hcms-bundled-styles-installed",ns='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Be=new WeakSet,mr="";function qn(e){mr=e}var is=0;function Fn(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function Dn({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:a=null,doc:s}){$n(s);let l=`hcms-shell-title-${++is}`,c=s.createElement("div");c.setAttribute("data-hcms-shell",""),c.setAttribute("save-remove",""),c.setAttribute("save-ignore",""),c.setAttribute("tabindex","-1"),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby",l);let d=a==="dark"?" dark":a==="light"?" light":"";c.className="hcms-shell pixel-quiet hcms-side-"+t+(r?" hcms-overlay":"")+d;let b=Fn(i),u=Fn(o);c.innerHTML=`
    <div class="hcms-shell-minibar" aria-hidden="true">
      <span class="hcms-shell-minibar-title">${b}</span>
      <button type="button" class="hcms-shell-close mirk-button mirk-button--small" data-hcms-action="close" aria-label="Close">
        <span class="mirk-button__label">\xD7</span>
      </button>
    </div>
    <div class="hcms-shell-body">
      <header class="hcms-shell-header">
        <div class="hcms-shell-heading">
          <div class="hcms-shell-eyebrow">${u}</div>
          <h2 class="hcms-shell-title" id="${l}">${b}</h2>
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
  `,(e||s.body).appendChild(c);let y=s.body;y.classList.add("hcms-open"),r&&y.classList.add("hcms-overlay"),t==="left"&&y.classList.add("hcms-side-left");let N=as(c,s),q=ss(c);return{root:c,formRoot:c.querySelector("[data-hcms-form-root]"),noticeEl:c.querySelector(".hcms-shell-notice"),errorEl:c.querySelector(".hcms-shell-error"),saveButton:c.querySelector(".hcms-shell-save"),destroy(){N.detach(),q.detach(),c.remove(),y.classList.remove("hcms-open","hcms-overlay","hcms-side-left")},restoreChrome(){os(s),y.classList.add("hcms-open"),r&&y.classList.add("hcms-overlay"),t==="left"&&y.classList.add("hcms-side-left")}}}function os(e){e&&(e.getElementById(Rt)||e.querySelector("style[data-hcms-bundled-styles]")||(Be.delete(e),$n(e)))}function $n(e){if(e&&!Be.has(e)){if(e[rs]){Be.add(e);return}if(e.getElementById(Rt)||e.querySelector("style[data-hcms-bundled-styles]")){Be.add(e);return}if(mr){let t=e.createElement("style");t.id=Rt,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=mr,(e.head||e.documentElement).appendChild(t),Be.add(e);return}try{let t=new URL("./theme.generated.css",ls.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Rt,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Be.add(e)}catch{console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")}}}function ss(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function as(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(ns));if(i.length===0)return;let o=i[0],a=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),a.focus()):!n.shiftKey&&t.activeElement===a&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var cs="[hypercms]",Bn={skip:"[data-hcms-shell]",templateAttr:"cms-template"},Pn={skip:"[data-hcms-shell]",templateAttr:null},hr=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Mt(e,t){let r=[],n=[];return pr(e,t,[],r,n),{missing:hs(r),twins:ps(n)}}function pr(e,t,r,n,i){if(typeof t=="string"){let o=us(t);if(!o)return;let a=Ot(e,o,Bn,r);if(t.endsWith("[]")){a.length===0&&Ot(e,o,Pn,r).length===0&&n.push(rt(r));return}a.length===0?n.push(rt(r)):a.length>1&&i.push({path:rt(r),count:a.length});return}if(Array.isArray(t)){let[o,a]=t;if(typeof o!="string"||!o)return;let s=Ot(e,o,Bn,r);if(s.length===0){Ot(e,o,Pn,r).length===0&&n.push(rt(r));return}for(let l of s)pr(l,a,[...r,"*"],n,i);return}if(t&&typeof t=="object")for(let[o,a]of Object.entries(t))pr(e,a,[...r,o],n,i)}function Ot(e,t,r,n){try{return ue.find(e,t,r)}catch(i){throw new hr(rt(n),t,i)}}function us(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=Z(e);return(t===-1?e:e.slice(0,t))||null}function Nt(e){ds(e),ms(e)}function ds(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[];if(r.length===0){t.textContent="",t.hidden=!0;return}let n=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;t.textContent=`${n}: ${r.join(", ")}`,t.hidden=!1}function ms(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${cs} "${n}" matches ${i} elements; edits go to the first one.`)}}function hs(e){return[...new Set(e)]}function ps(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function rt(e){return e.length?e.join("."):"(whole page)"}var fs={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function It(e,{ignoreActiveValue:t}={}){let r=re.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.richText?St(r.rules,e.pageRoot):r.rules,e.rulesTagNode=r.tagNode),ht(e.doc),kt(e.doc,e.pageRules),e.formRules=vt(e.pageRules,e.doc),e.unresolved=Mt(e.pageRoot,e.pageRules);let n=ye(re.extract(e.pageRoot,e.pageRules,fs),e.pageRules),i=xt({pageRules:e.pageRules,formRules:e.formRules,data:n,doc:e.doc});ut(e.formRoot,i,{ignoreActiveValue:t}),qe(e.formRoot,e.doc),lr(e),Nt(e),e.updateFingerprint&&e.updateFingerprint()}function zn({debounce:e=100,onRefresh:t}){let r=ne("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=0,i=r.onAnyChange({debounce:e},()=>{n>0||t()});return{unsubscribe:typeof i=="function"?i:()=>{},pause(){n++},resume(){n=Math.max(0,n-1)}}}var gs="[hypercms]";function Un(e,t){if(!e||!e.querySelectorAll||!t)return;let r=bs(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${gs} template "${o}" doesn't match any rule path; ignored`))})}function bs(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),a=n.map(l=>typeof l=="number"?"*":l).join(".");o&&t.add(o),a&&t.add(a);let s=_e(i);if(s==="object")for(let[l,c]of Object.entries(i))r([...n,l],c);else if(s==="object-array"||s==="scalar-array"){let l=[...n,"*"],c=l.map(d=>typeof d=="number"?"*":d).join(".");if(t.add(c),s==="object-array"){let d=i[1];if(d&&typeof d=="object"&&!Array.isArray(d))for(let[b,u]of Object.entries(d))r([...l,b],u)}}}}var Hn="hcms-toggle",Vn="hcms-toggle-style",ks=`
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
`;function ys({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),a=new URLSearchParams(o).get("editmode");return a?a==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}function vs({open:e,close:t,isOpen:r},n=document){let i=n.getElementById(Hn);if(i)return i;if(!n.getElementById(Vn)){let a=n.createElement("style");a.id=Vn,a.setAttribute("snapshot-remove",""),a.textContent=ks,n.head.appendChild(a)}let o=n.createElement("button");return o.type="button",o.id=Hn,o.setAttribute("no-save",""),o.setAttribute("snapshot-remove",""),o.setAttribute("save-ignore",""),o.setAttribute("aria-label","Toggle content editor"),o.innerHTML='<span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span>',o.addEventListener("click",async()=>{try{r()?t():await e()}catch(a){console.warn("hypercms: toggle failed to open the CMS",a)}}),n.body.appendChild(o),o}function Wn(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!ys({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&vs(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function Jn(e){qn(e)}var P={isOpen:!1,ctx:null,shell:null,opts:null};function Kn(e,t){if(P.ctx!==e)return;let r=t==="livesync";t==="livesync"&&P.shell?.restoreChrome?.(),It(e,{ignoreActiveValue:r})}var Gn=!1;function xs(){if(Gn)return;let e=ne("onPrepareForSave");typeof e=="function"&&(e(t=>{let r=t&&t.querySelector&&t.querySelector("body");r&&r.classList.remove("hcms-open","hcms-overlay","hcms-side-left")}),Gn=!0)}function br(e={}){if(P.isOpen){console.warn("cms.open() called while already open; ignoring");return}xs();let t=e.pageRoot||(typeof document<"u"?document.body:null);if(!t)throw new Error("hypercms: no pageRoot available");let r=t.ownerDocument||(typeof document<"u"?document:null);if(!r)throw new Error("hypercms: no document available");let n=e.rules!==void 0?e.rules:"cms",i=re.findRules(r,n);if(!i){let k=typeof n=="string"?`data-rules-name~="${n}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${k}`)}let o=e.richText!==!1,a=o?St(i.rules,t):i.rules,s=i.tagNode;ht(r),kt(r,a),Un(r,a);let l=vt(a,r),c=Mt(t,a),d=ye(re.extract(t,a,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),a),b=Tt(()=>Dn({mountTo:e.mountTo||r.body,side:e.side||"right",overlay:!!e.overlay,showSaveButton:!!e.showSaveButton,title:e.title,eyebrow:e.eyebrow,theme:e.theme,doc:r})),u={doc:r,pageRoot:t,pageRules:a,formRules:l,rulesTagNode:s,rulesSource:n,richText:o,formRoot:b.formRoot,shellRoot:b.root,errorEl:b.errorEl,noticeEl:b.noticeEl,unresolved:c,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:e.onChange,onError:e.onError,confirmRemove:e.confirmRemove,previouslyFocused:r.activeElement,dispatch(k,y){let N=r.defaultView&&r.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!N)return;let q=new N(k,{bubbles:!0,cancelable:k==="hcms:change",detail:y});b.root.dispatchEvent(q)},onCloseRequested(){kr()}};u.updateFingerprint=()=>{u.lastFingerprint=tt(ae(u))};try{let k=xt({pageRules:a,formRules:l,data:d,doc:r});b.formRoot.appendChild(k),qe(b.formRoot,r),Nt(u),Ln(u),u.updateFingerprint(),u.observerHandle=zn({onRefresh:()=>It(u)});let y=ne("undo");if(y&&typeof y.on=="function"){let q=()=>{if(P.ctx!==u)return;Kn(u,"undo");let H=ye(re.extract(u.pageRoot,u.pageRules,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),u.pageRules);tt(H)!==tt(u.lastData)&&(u.lastData=H,u.onChange?.(H,{path:"",structural:!1}))};y.on("undo",q),y.on("redo",q),u.undoUnsub=()=>{y.off("undo",q),y.off("redo",q)}}let N=()=>Kn(u,"livesync");u.livesyncUnsub=ir(r,Mn,N),nt.ctx=u,_s(r),ws(b.root),P.isOpen=!0,P.ctx=u,P.shell=b,P.opts=e,u.dispatch("hcms:open",{pageRoot:t})}catch(k){throw u.observerHandle?.unsubscribe?.(),u.undoUnsub?.(),u.livesyncUnsub?.(),u.detachEvents?.(),nt.ctx===u&&(nt.ctx=null),Tt(()=>b.destroy()),P.isOpen=!1,P.ctx=null,P.shell=null,P.opts=null,k}}function ws(e){let r=e.querySelector('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');r&&typeof r.focus=="function"&&r.focus()}var nt={ctx:null};function _s(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=nt.ctx;if(i)return ur(i.formRoot),$e("Reorder",()=>de(ae(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var gr="cms";function As(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(gr)!=="true"?t:(i.set(gr,"false"),"?"+i.toString())}function Ss(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(gr)==="true":!1}function Es(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=As(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}function kr(){if(!P.isOpen)return;let{ctx:e,shell:t}=P;e.closed=!0;let r=e.previouslyFocused;if(e.dispatch("hcms:close",null),Es(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),Tt(()=>t.destroy()),P.isOpen=!1,P.ctx=null,P.shell=null,P.opts=null,nt.ctx=null,r&&typeof r.focus=="function")try{r.focus()}catch{}}function Yn(){P.isOpen&&It(P.ctx)}function Cs(){return P.isOpen}var Ts={getData(){return P.isOpen?ae(P.ctx):null},setValue(e,t){if(!P.isOpen)throw new Error("hypercms: cms is not open");let r=P.ctx,n=me(e),i=we(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=Rs(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);Os(o,t,r.formRoot,e),de(ae(r),{path:e,structural:!1},r)},addItem(e){if(!P.isOpen)throw new Error("hypercms: cms is not open");ar(e,P.ctx)},removeItem(e){if(!P.isOpen)throw new Error("hypercms: cms is not open");let t=P.ctx,r=me(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=we(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let a=t.formRoot.querySelector(`[data-hcms-path="${vr(e)}"]`);if(!a)throw new Error(`hypercms: no element at path "${e}"`);De(a,t)},refresh:Yn,_commit(){if(!P.isOpen)return;let e=P.ctx;return ur(e.formRoot),$e("Update",()=>de(ae(e),{path:"",structural:!0},e))}};function Rs(e,t){let r=vr(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function Os(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let a=vr(n),s=r.querySelectorAll(`[data-hcms-path="${a}"][data-hcms-field][type="radio"], [data-hcms-path="${a}"] [data-hcms-field][type="radio"]`);s.length?s.forEach(l=>{l.checked=String(l.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var Ms=250,Ns=1e4;function Is(){typeof window>"u"||typeof document>"u"||Ss(window.location?window.location.search:"")&&(P.isOpen||Ls(()=>{if(!P.isOpen)try{br()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function fr(){return!!document.body&&!!ne("Mutation")}function Ls(e){if(fr()){queueMicrotask(e);return}let t=Date.now()+Ns,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function a(){if(P.isOpen){o();return}fr()&&(o(),e())}i=ir(document,On,a),n=setInterval(()=>{if(P.isOpen){o();return}if(fr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},Ms)}Is();Wn({open:br,close:kr,isOpen:Cs,hasRules:e=>!!re.findRules(e,"cms")});var yr={open:br,close:kr,refresh:Yn,api:Ts,get isOpen(){return P.isOpen},path:Zt,scaffold:Xe,morphForm:ut};function vr(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Xn=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let a=n.files[0],s=document.createElement("a");if(s.className="mirk-file__name",s.dataset.filled="",s.href=URL.createObjectURL(a),s.target="_blank",s.rel="noopener",s.textContent=a.name,o.replaceWith(s),!i.querySelector(".mirk-file__remove")){let l=document.createElement("button");l.type="button",l.className="mirk-file__remove",l.setAttribute("aria-label","Remove file"),l.innerHTML=e,s.after(l)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let a=i.querySelector(".mirk-image__placeholder"),s=new FileReader;s.onload=l=>{o.src=l.target.result,o.removeAttribute("hidden"),a&&a.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},s.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),a=o?.querySelector(".mirk-file__input"),s=o?.querySelector(".mirk-file__name");if(a&&(a.value=""),s){let l=document.createElement("span");l.className="mirk-file__name",l.textContent="No file chosen",s.replaceWith(l)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),a=o?.querySelector(".mirk-image__input"),s=o?.querySelector(".mirk-image__preview");a&&(a.value=""),s&&(s.removeAttribute("src"),s.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let a=document.createElement("button");a.type="button",a.className="mirk-tags__remove",a.textContent="\xD7";let s=document.createElement("span");if(s.className="mirk-tags__chip",n){let l=document.createElement("span");l.className="mirk-tags__chip-inner",l.append(i,o,a),s.append(l)}else s.append(i,o,a);return s}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(l=>l.remove());let s=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(s).then(()=>{let l=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=l,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();Jn(Xn);var qs=yr,Ds={cms:yr};return si($s);})();

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
