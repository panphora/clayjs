var hypercms=(()=>{var $t=Object.defineProperty;var yi=Object.getOwnPropertyDescriptor;var vi=Object.getOwnPropertyNames;var xi=Object.prototype.hasOwnProperty;var Pt=(e,t)=>{for(var r in t)$t(e,r,{get:t[r],enumerable:!0})},wi=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of vi(t))!xi.call(e,i)&&i!==r&&$t(e,i,{get:()=>t[i],enumerable:!(n=yi(t,i))||n.enumerable});return e};var _i=e=>wi($t({},"__esModule",{value:!0}),e);var ua={};Pt(ua,{cms:()=>la,default:()=>ca});function Q(e){let t=0,r=null,n=-1;for(let i=0;i<e.length;i++){let o=e[i];o==="\\"?i++:r?o===r&&(r=null):o==='"'||o==="'"?r=o:o==="["||o==="("?t++:o==="]"||o===")"?t>0&&t--:o==="@"&&t===0&&(n=i)}return n}function it(e){let t=Q(e);return t===-1?{selector:e,prop:null}:{selector:e.slice(0,t),prop:e.slice(t+1)||null}}var qr={includeClasses:!0,includeAttributes:["href","src","name","type","role","aria-label","alt","title"],excludeAttributePrefixes:["data-morph-","data-hyper-","data-im-"],textHintLength:64,excludeIds:!0,maxPathDepth:4,landmarks:["HEADER","NAV","MAIN","ASIDE","FOOTER","SECTION","ARTICLE"],weights:{signature:100,pathSegment:10,textMatch:20,textMismatch:25,uniqueCandidate:50,positionPenalty:1,maxDriftPenalty:19,slotMatch:30},minConfidence:101,maxScoredCandidates:16};function Si(e){let t=5381;for(let r=0;r<e.length;r++)t=(t<<5)+t^e.charCodeAt(r);return Math.abs(t).toString(36)}function Ei(e){if(e.classList&&e.classList.length>0)return Array.from(e.classList).sort().join(" ");let t=e.getAttribute?.("class");return t?t.split(/\s+/).filter(Boolean).sort().join(" "):""}function Ci(e,t){let r=[];for(let n of e.attributes||[]){let i=n.name;i==="id"||i==="class"||t.excludeAttributePrefixes.some(o=>i.startsWith(o))||t.includeAttributes.includes(i)&&r.push(`${i}=${n.value}`)}return r.sort().join("|")}function Ti(e,t){return(e.textContent||"").replace(/\s+/g," ").trim().slice(0,t.textHintLength)}function Ri(e,t){let r=[e.tagName];return t.includeClasses&&r.push(Ei(e)),r.push(Ci(e,t)),Si(r.join("|"))}function Oi(e){let t=e.tagName,r=1,n=e.previousElementSibling;for(;n;)n.tagName===t&&r++,n=n.previousElementSibling;return r}function Mi(e,t){return e.getAttribute?.("id")||e.getAttribute?.("role")?!0:t.landmarks.includes(e.tagName)}function Ni(e){let t=e.getAttribute?.("id");if(t)return`#${t}`;let r=e.getAttribute?.("role");return r?`@${r}`:e.tagName}function Ii(e,t){let r=[],n=e;for(;n&&n.tagName&&r.length<t.maxPathDepth;){let i=`${n.tagName}:${Oi(n)}`;if(r.unshift(i),n!==e&&Mi(n,t)){r.unshift(Ni(n));break}n=n.parentElement}return r}function ji(e,t){let r=0,n=e.length-1,i=t.length-1;for(;n>=0&&i>=0&&e[n]===t[i];)r++,n--,i--;return r}function se(e,t,r){if(r.has(e))return r.get(e);let n={signature:Ri(e,t),path:Ii(e,t),textHint:Ti(e,t)};return r.set(e,n),n}function Br(e,t,r,n){if(n.has(e))return n.get(e);let i=new Map,o=e.querySelectorAll("*"),s=0;for(let a of o){let l=se(a,t,r);l.domIndex=s++,!t.shouldIgnore?.(a)&&(i.has(l.signature)||i.set(l.signature,[]),i.get(l.signature).push(a))}return n.set(e,i),i}function Li(e,t,r){r.delete(e),t.delete(e);let n=e.querySelectorAll("*");for(let i of n)t.delete(i)}function Bt(e,t,r,n,i){let o=se(e,r,n),s=se(t,r,n),a=r.weights,l={},c=0;if(o.signature!==s.signature)return{score:0,breakdown:{rejected:"signature mismatch"}};c+=a.signature,l.signature=a.signature;let p=ji(o.path,s.path)*a.pathSegment;c+=p,l.path=p;let d=!0;if(o.textHint&&s.textHint?o.textHint===s.textHint?(c+=a.textMatch,l.text=a.textMatch):(c-=a.textMismatch,l.text=-a.textMismatch,d=!1):o.textHint!==s.textHint&&(c-=a.textMismatch,l.text=-a.textMismatch,d=!1),i.candidateCount===1&&d&&(c+=a.uniqueCandidate,l.unique=a.uniqueCandidate),typeof o.domIndex=="number"&&typeof s.domIndex=="number"){let u=Math.abs(o.domIndex-s.domIndex),y=Math.min(u*a.positionPenalty,a.maxDriftPenalty);c-=y,l.drift=-y}return{score:c,breakdown:l}}function Dr(e,t,r,n,i){if(r.excludeIds&&e.getAttribute("id"))return null;let o=Br(t,r,n,i),s=se(e,r,n);if(typeof s.domIndex!="number"){let d=0,u=e.previousElementSibling;for(;u;)d++,u=u.previousElementSibling;s.domIndex=d}let a=o.get(s.signature)||[],l=r.excludeIds?a.filter(d=>!d.getAttribute("id")):a;if(l.length===0)return null;let c=null,m=0,p=null;for(let d of l){let{score:u,breakdown:y}=Bt(e,d,r,n,{candidateCount:l.length});u>m&&(m=u,c=d,p=y)}return m<r.minConfidence?null:{element:c,confidence:m,breakdown:p}}function Fi(e,t,r,n){let i=[],o=r.weights.signature+r.weights.slotMatch,s={slot:o};function a(p){if(p.children)return p.children;let d=p.childNodes;if(!d)return[];let u=[];for(let y=0;y<d.length;y++)d[y].nodeType===1&&u.push(d[y]);return u}function l(p,d){let u=a(p),y=a(d);if(u.length===y.length)for(let N=0;N<u.length;N++){let R=u[N],F=y[N];if(r.shouldIgnore?.(R)||r.shouldIgnore?.(F)||r.excludeIds&&(R.getAttribute("id")||F.getAttribute("id"))||R.tagName!==F.tagName)continue;let V=se(R,r,n).signature,te=se(F,r,n).signature;V!==te&&i.push({newEl:R,oldEl:F,score:o,breakdown:s}),l(R,F)}}function c(p,d){for(;;){if(p.tagName===d.tagName)return[p,d];let u=a(p);if(!p.tagName&&u.length===1){p=u[0];continue}let y=a(d);if(y.length===1&&y[0].tagName===p.tagName){d=y[0];continue}return null}}let m=c(e,t);return m&&l(m[0],m[1]),i}function $r(e,t,r,n,i){let o=t.querySelectorAll("*"),s=Br(e,r,n,i),a=0;for(let u of o){let y=se(u,r,n);y.domIndex=a++}let l=[],c=new Map;function m(u,y,N){let R=new Set;if(u.textHint){let z=c.get(u.signature);if(!z){z=new Map;for(let ee of y){let pe=se(ee,r,n).textHint,fe=z.get(pe);fe||(fe=[],z.set(pe,fe)),fe.push(ee)}c.set(u.signature,z)}let oe=z.get(u.textHint);if(oe)for(let ee=0;ee<oe.length&&ee<N;ee++)R.add(oe[ee])}let F=0,V=y.length;for(;F<V;){let z=F+V>>1;se(y[z],r,n).domIndex<u.domIndex?F=z+1:V=z}let te=Math.max(0,Math.min(F-(N>>1),y.length-N)),le=Math.min(te+N,y.length);for(let z=te;z<le;z++)R.add(y[z]);return[...R]}for(let u of o){if(r.shouldIgnore?.(u)||r.excludeIds&&u.getAttribute("id"))continue;let y=se(u,r,n),N=s.get(y.signature)||[],R=r.excludeIds?N.filter(te=>!te.getAttribute("id")):N,F=r.maxScoredCandidates,V=F&&R.length>F?m(y,R,F):R;for(let te of V){let{score:le,breakdown:z}=Bt(u,te,r,n,{candidateCount:R.length});le>=r.minConfidence&&l.push({newEl:u,oldEl:te,score:le,breakdown:z})}}if(r.weights.slotMatch>0){let u=Fi(t,e,r,n);for(let y of u)l.push(y)}l.sort((u,y)=>y.score-u.score);let p=new Map,d=new Set;for(let{newEl:u,oldEl:y}of l)p.has(u)||d.has(y)||(p.set(u,y),d.add(y));return p}function Pr(e,t,r,n){let i=se(e,r,n),o=se(t,r,n),{score:s,breakdown:a}=Bt(e,t,r,n,{candidateCount:1});return{matches:s>=r.minConfidence,score:s,breakdown:a,newMeta:{signature:i.signature,path:i.path,textHint:i.textHint},oldMeta:{signature:o.signature,path:o.path,textHint:o.textHint}}}function Ur(e={}){let t={...qr,...e,weights:{...qr.weights,...e.weights}},r=new WeakMap,n=new WeakMap;return{findMatch:(i,o)=>Dr(i,o,t,r,n),computeMatches:(i,o)=>$r(i,o,t,r,n),explain:(i,o)=>Pr(i,o,t,r),invalidate:i=>Li(i,r,n),session:()=>{let i=new WeakMap,o=new WeakMap;return{findMatch:(s,a)=>Dr(s,a,t,i,o),computeMatches:(s,a)=>$r(s,a,t,i,o),explain:(s,a)=>Pr(s,a,t,i)}},getConfig:()=>({...t})}}function Ut(e,t){for(;;){for(;t<e.length&&/\s/.test(e[t]);)t++;if(e[t]==="/"&&e[t+1]==="/"){for(;t<e.length&&e[t]!==`
`;)t++;continue}if(e[t]==="/"&&e[t+1]==="*"){let r=e.indexOf("*/",t+2);if(r===-1)return e.length;t=r+2;continue}return t}}function zr(e){return e.replace(/\\'/g,"'").replace(/(\\*)"/g,(t,r)=>r.length%2===0?r+'\\"':t)}var qi=/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/,Di=/^[A-Za-z_$][A-Za-z0-9_$]*$/;function ot(e){try{return JSON.parse(e)}catch{return JSON.parse($i(e))}}function $i(e){let t="",r=0,n=(i,o)=>{throw new Error(`Invalid relaxed JSON: ${i} at position ${o}`)};for(;r<e.length&&(r=Ut(e,r),!(r>=e.length));){let i=e[r];if("{}[]:".includes(i)){t+=i,r++;continue}if(i===","){let a=Ut(e,r+1);if(e[a]==="}"||e[a]==="]"){r++;continue}t+=i,r++;continue}if(i==='"'||i==="'"){let a=r+1;for(;a<e.length&&e[a]!==i;)e[a]==="\\"&&a++,a++;a>=e.length&&n("unterminated string",r);let l=e.slice(r+1,a);i==="'"&&(l=zr(l)),t+='"'+l+'"',r=a+1;continue}let o=r;for(;o<e.length&&/[A-Za-z0-9_$.+\-]/.test(e[o]);)o++;o===r&&n("unexpected character "+JSON.stringify(i),r);let s=e.slice(r,o);if(s==="true"||s==="false"||s==="null"||qi.test(s)){t+=s,r=o;continue}if(Di.test(s)){if(e[Ut(e,o)]===":"){t+='"'+s+'"',r=o;continue}n("unquoted value "+JSON.stringify(s),r)}n("invalid token "+JSON.stringify(s),r)}return t}function Hr(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],s=0;for(;s<i.length;){let a=i[s];if(/\s/.test(a)){s++;continue}if("{}".includes(a)){o.push({type:a,value:a}),s++;continue}if(a==="["){let p=!1,d=s+1;for(;d<i.length&&/\s/.test(i[d]);)d++;if(d<i.length&&/[a-zA-Z_]/.test(i[d])&&(p=!0),!p){o.push({type:a,value:a}),s++;continue}}if(a==="]"){o.push({type:a,value:a}),s++;continue}if(a===":"){o.push({type:t.COLON,value:a}),s++;continue}if(a===","){o.push({type:t.COMMA,value:a}),s++;continue}if(a==='"'||a==="'"){let p=a,d=s+1;for(;d<i.length&&i[d]!==p;)i[d]==="\\"&&d++,d++;o.push({type:t.STRING,value:i.substring(s+1,d),quoted:!0,sourceQuote:p}),s=d+1;continue}let l=s,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let p=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],d=!1;for(let u of p){let y=u.substring(1);if(i.substring(l+1,l+1+y.length)===y){d=!0,l+=y.length;break}}if(!d)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let p=i[l];for(l++;l<i.length&&i[l]!==p;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(s,l);let m=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?m=t.NUMBER:c==="true"||c==="false"||c==="null"?m=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(m=t.SELECTOR),o.push({type:m,value:c,quoted:!1}),s=l}return o}function n(i){let o="";for(let s=0;s<i.length;s++){let a=i[s];if("{}".includes(a.type)||"[]".includes(a.type)){o+=a.value;continue}if(a.type===t.COLON){o+=a.value;continue}if(a.type===t.COMMA){let l=i[s+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=a.value;continue}if(a.type===t.STRING){let l=a.value;a.sourceQuote==="'"&&(l=zr(l)),o+=`"${l}"`;continue}if(a.type===t.NUMBER||a.type===t.BOOLEAN){o+=a.value;continue}o+=`"${a.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new Error("Invalid extraction rules syntax: "+i.message)}}var Y=Symbol("hyper-morph-json-merge:missing"),Vr=["id","_id","uuid","key","slug","code","name"];function Ce(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function He(e,t){return Object.prototype.hasOwnProperty.call(e,t)}function Pi(e,t,r){Object.defineProperty(e,t,{value:r,enumerable:!0,writable:!0,configurable:!0})}function be(e,t){if(e===t)return!0;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(let r=0;r<e.length;r++)if(!be(e[r],t[r]))return!1;return!0}if(Ce(e)&&Ce(t)){let r=Object.keys(e);if(r.length!==Object.keys(t).length)return!1;for(let n of r)if(!He(t,n)||!be(e[n],t[n]))return!1;return!0}return!1}function Wr(e,t,r,n){return be(t,r)?t:be(t,e)?r:be(r,e)?t:Ce(t)&&Ce(r)?Bi(Ce(e)?e:{},t,r,n):Array.isArray(t)&&Array.isArray(r)?Vi(Array.isArray(e)?e:[],t,r,n):r}function Kr(e,t,r,n){return t===Y&&r===Y?Y:t===Y?e===Y?r:be(r,e)?Y:r:r===Y?e===Y?t:Y:Wr(e,t,r,n)}function Bi(e,t,r,n){let i={},o=new Set([...Object.keys(e),...Object.keys(t),...Object.keys(r)]);for(let s of o){let a=Kr(He(e,s)?e[s]:Y,He(t,s)?t[s]:Y,He(r,s)?r[s]:Y,n);a!==Y&&Pi(i,s,a)}return i}function Ui(e){return e===null||typeof e!="object"}function st(e){return typeof e+":"+String(e)}function zi(e,t){for(let r of t){let n=new Set;for(let i of r){if(!He(i,e))return!1;let o=i[e];if(typeof o!="string"&&typeof o!="number")return!1;let s=st(o);if(n.has(s))return!1;n.add(s)}}return!0}function Hi(e,t,r,n){let i=[e,t,r],o=!0;for(let s of i)for(let a of s)Ce(a)||(o=!1);if(o){for(let s of n.keyCandidates)if(zi(s,i))return{kind:"keyed",field:s};return null}for(let s of i){let a=new Set;for(let l of s){if(!Ui(l))return null;let c=st(l);if(a.has(c))return null;a.add(c)}}return{kind:"self"}}function Vi(e,t,r,n){let i=Hi(e,t,r,n);if(!i)return r;let o=i.kind==="self"?st:u=>st(u[i.field]),s=u=>{let y=new Map;for(let N of u)y.set(o(N),N);return y},a=s(e),l=s(t),c=s(r),m=new Map,p=new Set([...a.keys(),...l.keys(),...c.keys()]);for(let u of p){let y=Kr(a.has(u)?a.get(u):Y,l.has(u)?l.get(u):Y,c.has(u)?c.get(u):Y,n);y!==Y&&m.set(u,y)}let d=[];for(let u of r){let y=o(u);m.has(y)&&d.push(y)}for(let u=0;u<t.length;u++){let y=o(t[u]);if(!m.has(y)||d.includes(y))continue;let N=0;for(let R=u-1;R>=0;R--){let F=d.indexOf(o(t[R]));if(F!==-1){N=F+1;break}}d.splice(N,0,y)}return d.map(u=>m.get(u))}function zt(e,t,r,n={}){let i=n.keyCandidates?[...n.keyCandidates,...Vr]:Vr;return Wr(e===void 0?Y:e,t,r,{keyCandidates:i})}function Ht(e,t,r,n={}){let i=n.parse||ot,o=[],s=(p,d)=>{if(typeof p!="string")return Y;try{return i(p)}catch(u){return o.push(`${d} side is not valid JSON (${u.message})`),Y}},a=s(t,"local"),l=s(r,"remote");if(a===Y)return{text:r,warnings:o};if(l===Y)return{text:t,warnings:o};let c=s(e,"base"),m=zt(c===Y?void 0:c,a,l,n);return be(m,l)?{text:r,warnings:o}:be(m,a)?{text:t,warnings:o}:{text:JSON.stringify(m,null,2),warnings:o}}var Ve=(function(){"use strict";let e=()=>{},t='[save-ignore],[snapshot-remove],[no-snapshot],[no-save],[save-remove],[freeze],[save-freeze],[clay~="no-save"],[clay~="no-snapshot"],[clay~="freeze"]';function r(g){if(!(g instanceof Element))return!1;if(g.matches(t))return!0;if(g.tagName==="LINK"||g.tagName==="SCRIPT"){let T=g.getAttribute("src")||g.getAttribute("href")||"";if(T.startsWith("chrome-extension://")||T.startsWith("moz-extension://")||T.startsWith("safari-web-extension://"))return!0}return!1}function n(g){return g instanceof Element?g.closest(t)?!0:r(g):!1}let i=Ur({shouldIgnore:n});function o(g,T,E){if(E){let M=E.identityOf(g);if(M&&!E.disabled.has(M.key))return"hm-merge:"+M.key}if(T!=="smart")return g.outerHTML;let O=g.getAttribute("src"),C=g.getAttribute("type")||"text/javascript";if(O)try{let M=new URL(O,window.location.href);return`ext:${C}:${M.origin}${M.pathname}${M.search}`}catch{return`ext:${C}:${O}`}else{let M=g.textContent.trim(),v=5381;for(let A=0;A<M.length;A++)v=(v<<5)+v^M.charCodeAt(A);return`inline:${C}:${Math.abs(v).toString(36)}`}}let s="http://www.w3.org/1999/xhtml";function a(g){return g instanceof Element&&g.tagName==="SCRIPT"&&g.namespaceURI===s}function l(g){let T=document.createElement("div");T.innerHTML="<script><\/script>";let E=T.firstChild;for(let O of g.attributes)E.setAttribute(O.name,O.value);return E.textContent=g.textContent,E}function c(g){if(a(g))return l(g);if(g instanceof Element)for(let T of g.querySelectorAll("script"))a(T)&&T.replaceWith(l(T));return g}function m(g){let T=(g.getAttribute("type")||"").split(";")[0].trim().toLowerCase();return T==="application/json"||T.endsWith("+json")}let p={match:g=>g.hasAttribute("merge"),identity:g=>g.getAttribute("merge")};function d(g,T,E){if(E.merge===!1)return null;let O=[p,...E.mergeTags||[]],C=new WeakMap,M=b=>{if(C.has(b))return C.get(b);let w=null;if(a(b)&&!b.getAttribute("src")&&!n(b)){let _=b;for(let j=0;j<O.length;j++)if(O[j].match(_)){if(!m(_))console.warn("[hyper-morph] merge ignored: script type is not JSON",_);else{let B=O[j].identity(_);B!=null&&B!==""&&(w={key:j+":"+B,raw:B,recognizer:O[j]})}break}}return C.set(b,w),w},v=new Set,A=b=>{let w=new Map,_=j=>{let B=M(j);B&&(w.has(B.key)?(v.add(B.key),console.warn(`[hyper-morph] merge disabled for duplicate identity "${B.raw}"`)):w.set(B.key,j))};a(b)&&_(b);for(let j of b.querySelectorAll("script"))_(j);return w},k=A(g),f=A(T.__hyperMorphRoot||T);if(k.size===0&&f.size===0)return null;let h=null;return{identityOf:M,disabled:v,oldByKey:k,newByKey:f,baseTexts:()=>{if(h)return h;h=new Map;let b=E.mergeBase;if(!b)return h;let w;typeof b=="string"?w=new DOMParser().parseFromString(b,"text/html").documentElement:b instanceof Document?w=b.documentElement:w=b;let _=j=>{let B=M(j);B&&!h.has(B.key)&&h.set(B.key,j.textContent)};a(w)&&_(w);for(let j of w.querySelectorAll("script"))_(j);return h}}}function u(g,T,E){let O=g.merge;if(!O)return!1;let C=O.identityOf(T);if(!C||O.disabled.has(C.key))return!1;let M=O.identityOf(E);if(!M||M.key!==C.key)return!1;let v=T,A=E,k=A.getAttribute("merge-key")||v.getAttribute("merge-key"),{text:f,warnings:h}=Ht(O.baseTexts().get(C.key),v.textContent,A.textContent,{parse:C.recognizer.parse,keyCandidates:k?k.split(/[\s,]+/).filter(Boolean):void 0});for(let x of h)console.warn(`[hyper-morph] merge "${C.raw}": ${x}`);return v.textContent!==f&&(v.textContent=f),!0}let y={morphStyle:"outerHTML",callbacks:{beforeNodeAdded:e,afterNodeAdded:e,beforeNodeMorphed:e,afterNodeMorphed:e,beforeNodeRemoved:e,afterNodeRemoved:e,beforeAttributeUpdated:e},head:{style:"merge",shouldPreserve:g=>g.getAttribute("im-preserve")==="true",shouldReAppend:g=>g.getAttribute("im-re-append")==="true",shouldRemove:e,afterHeadMorphed:e},scripts:{handle:!0,matchMode:"outerHTML",shouldPreserve:g=>g.getAttribute("im-preserve")==="true",shouldReAppend:g=>g.getAttribute("im-re-append")==="true",shouldRemove:e,afterScriptsHandled:e},restoreFocus:!0},N={computeMatches(g,T){let{computeMatches:E}=i.session();return E(g,T)}};function R(g,T,E={}){g=gi(g);let O=Er(T),C=fi(g,O,E),M=C.scripts.handle?new Set(Array.from(g.querySelectorAll("script")).map(f=>o(f,C.scripts.matchMode,C.merge))):null,v=te(C),A=ee(C,g,O,f=>f.morphStyle==="innerHTML"?(z(f,g,O),Array.from(g.childNodes)):V(f,g,O)),k=f=>{v&&le(C,v),F(C);let h=M?Lt(f,M,C):[];return h.length>0?Promise.all(h).then(()=>f):f};return A instanceof Promise?A.then(k):k(A)}function F(g){for(let T of Array.from(g.pantry.childNodes))g.callbacks.beforeNodeRemoved(T)!==!1&&g.callbacks.afterNodeRemoved(T);g.pantry.remove()}function V(g,T,E){let O=Er(T);return z(g,O,E,T,T.nextSibling),Array.from(O.childNodes)}function te(g){if(!g.config.restoreFocus)return null;let T=document.activeElement;if(!(T instanceof HTMLInputElement||T instanceof HTMLTextAreaElement))return null;let{id:E,selectionStart:O,selectionEnd:C}=T;return{element:T,id:E,selectionStart:O,selectionEnd:C}}function le(g,T){let E=T.element;if(T.id&&T.id!==document.activeElement?.getAttribute("id")&&(E=g.target.querySelector(`[id="${CSS.escape(T.id)}"]`),E?.focus()),E&&!E.selectionEnd&&T.selectionEnd!=null)try{E.setSelectionRange(T.selectionStart,T.selectionEnd)}catch{}}let z=(function(){function g(f,h,x,b=null,w=null){h instanceof HTMLTemplateElement&&x instanceof HTMLTemplateElement&&(h=h.content,x=x.content),b||=h.firstChild;for(let _ of x.childNodes){if(r(_))continue;if(b&&b!=w){let B=E(f,_,b,w);if(B){B!==b&&C(f,b,B),oe(B,_,f),b=B.nextSibling;continue}}if(_ instanceof Element){let B=_.getAttribute("id");if(f.persistentIds.has(B)){let S=M(h,B,b,f);oe(S,_,f),b=S.nextSibling;continue}if(!f.idMap.has(_)){let S=f.hyperMatches.get(_);if(S&&!f.idMap.has(S)&&!k(S,h)){A(h,S,b),oe(S,_,f),b=S.nextSibling;continue}}}let j=T(h,_,b,f);j&&(b=j.nextSibling)}for(;b&&b!=w;){let _=b;b=b.nextSibling,r(_)||O(f,_)}}function T(f,h,x,b){if(b.callbacks.beforeNodeAdded(h)===!1)return null;if(b.idMap.has(h)){let w=h,_=document.createElementNS(w.namespaceURI,w.localName);return f.insertBefore(_,x),oe(_,h,b),b.callbacks.afterNodeAdded(_),_}else{let w=c(document.importNode(h,!0));return f.insertBefore(w,x),b.callbacks.afterNodeAdded(w),w}}let E=(function(){function f(b,w,_,j){let B=w instanceof Element&&!b.idMap.has(w)?b.hyperMatches.get(w):null,S=null,I=w.nextSibling,W=0,$=_;for(;$&&$!=j;){if(r($)){$=$.nextSibling;continue}if(x($,w)){if(h(b,$,w)||$===B&&!b.idMap.has($))return $;if(S===null){let K=$ instanceof Element&&b.hyperMatchedOldElements.has($);!b.idMap.has($)&&!K&&(S=$)}}if(S===null&&I&&x($,I)&&(W++,I=I.nextSibling,W>=2&&(S=void 0)),b.activeElementAndParents.includes($))break;$=$.nextSibling}return S||null}function h(b,w,_){let j=b.idMap.get(w),B=b.idMap.get(_);if(!B||!j)return!1;for(let S of j)if(B.has(S))return!0;return!1}function x(b,w){let _=b,j=w;return _.nodeType===j.nodeType&&_.tagName===j.tagName&&(!_.getAttribute?.("id")||_.getAttribute?.("id")===j.getAttribute?.("id"))}return f})();function O(f,h){let x=h instanceof Element&&f.hyperMatchedOldElements.has(h)&&!f.idMap.has(h);if(f.idMap.has(h)||x)A(f.pantry,h,null);else{if(f.callbacks.beforeNodeRemoved(h)===!1)return;h.parentNode?.removeChild(h),f.callbacks.afterNodeRemoved(h)}}function C(f,h,x){let b=h;for(;b&&b!==x;){let w=b;b=b.nextSibling,r(w)||O(f,w)}return b}function M(f,h,x,b){let w=b.target.getAttribute?.("id")===h&&b.target||b.target.querySelector(`[id="${CSS.escape(h)}"]`)||b.pantry.querySelector(`[id="${CSS.escape(h)}"]`);return v(w,b),A(f,w,x),w}function v(f,h){let x=f.getAttribute("id");for(;f=f.parentNode;){let b=h.idMap.get(f);b&&(b.delete(x),b.size||h.idMap.delete(f))}}function A(f,h,x){if(f.moveBefore)try{f.moveBefore(h,x)}catch{f.insertBefore(h,x)}else f.insertBefore(h,x)}function k(f,h){let x=h instanceof Element?h:h.realParentNode;return!!x&&f.contains(x)}return g})(),oe=(function(){function g(v,A,k){return k.ignoreActive&&v===document.activeElement?null:(k.callbacks.beforeNodeMorphed(v,A)===!1||(v instanceof HTMLHeadElement&&k.head.ignore||(v instanceof HTMLHeadElement&&k.head.style!=="morph"?fe(v,A,k):(T(v,A,k),u(k,v,A)||M(v,k)||z(k,v,A))),k.callbacks.afterNodeMorphed(v,A)),v)}function T(v,A,k){let f=A.nodeType;if(f===1){let h=v,x=A,b=h.attributes,w=x.attributes;for(let _ of w)C(_.name,h,"update",k)||h.getAttribute(_.name)!==_.value&&h.setAttribute(_.name,_.value);for(let _=b.length-1;0<=_;_--){let j=b[_];if(j&&!x.hasAttribute(j.name)){if(C(j.name,h,"remove",k))continue;h.removeAttribute(j.name)}}M(h,k)||E(h,x,k)}(f===8||f===3)&&v.nodeValue!==A.nodeValue&&(v.nodeValue=A.nodeValue)}function E(v,A,k){if(v instanceof HTMLInputElement&&A instanceof HTMLInputElement&&A.type!=="file"){let f=A.value,h=v.value;O(v,A,"checked",k),O(v,A,"disabled",k),k.formStateSync==="property"&&v.indeterminate!==A.indeterminate&&(v.indeterminate=A.indeterminate),k.formStateSync==="property"?h!==f&&(C("value",v,"update",k)||(v.value=f)):A.hasAttribute("value")?h!==f&&(C("value",v,"update",k)||(v.setAttribute("value",f),v.value=f)):C("value",v,"remove",k)||(v.value="",v.removeAttribute("value"))}else if(v instanceof HTMLOptionElement&&A instanceof HTMLOptionElement)O(v,A,"selected",k);else if(v instanceof HTMLTextAreaElement&&A instanceof HTMLTextAreaElement){let f=A.value,h=v.value;if(C("value",v,"update",k)||(f!==h&&(v.value=f),k.formStateSync==="property"))return;v.firstChild&&v.firstChild.nodeValue!==f&&(v.firstChild.nodeValue=f)}}function O(v,A,k,f){let h=A[k],x=v[k];if(h!==x){let b=C(k,v,"update",f);if(b||(v[k]=A[k]),f.formStateSync==="property")return;h?b||v.setAttribute(k,""):C(k,v,"remove",f)||v.removeAttribute(k)}}function C(v,A,k,f){return v==="value"&&f.ignoreActiveValue&&A===document.activeElement?!0:f.callbacks.beforeAttributeUpdated(v,A,k)===!1}function M(v,A){return!!A.ignoreActiveValue&&v===document.activeElement&&v!==document.body}return g})();function ee(g,T,E,O){if(g.head.block){let C=T.querySelector("head"),M=E.querySelector("head");if(C&&M){let v=fe(C,M,g);return Promise.all(v).then(()=>(g.head.block=!1,g.head.ignore=!0,O(g)))}}return O(g)}function pe(g){return g.tagName==="SCRIPT"?!!g.getAttribute("src"):g.tagName==="LINK"?(g.getAttribute("rel")||"").toLowerCase().split(/\s+/).includes("stylesheet")&&!!g.getAttribute("href"):!1}function fe(g,T,E){let O=[],C=[],M=[],v=[],A=E.scripts.matchMode,k=x=>{if(x.tagName==="SCRIPT")return o(x,A,E.merge);if(x.tagName==="LINK"&&A==="smart"){let b=x.getAttribute("href");if(b)try{let w=new URL(b,window.location.href);return`link:${x.getAttribute("rel")||""}:${w.origin}${w.pathname}${w.search}`}catch{}}return x.outerHTML},f=new Map;for(let x of T.children){if(r(x))continue;let b=k(x),w=f.get(b);w||(w=[],f.set(b,w)),w.push(x)}for(let x of g.children){let b=k(x),w=f.get(b),_=!!(w&&w.length),j=E.head.shouldReAppend(x),B=E.head.shouldPreserve(x);if(_||B)if(j)C.push(x);else{if(w&&w.length){let S=w.pop();w.length||f.delete(b),u(E,x,S)}M.push(x)}else E.head.style==="append"?j&&(C.push(x),v.push(x)):E.head.shouldRemove(x)!==!1&&!r(x)&&C.push(x)}for(let x of f.values())v.push(...x);let h=[];for(let x of v){let b=document.createRange().createContextualFragment(x.outerHTML).firstChild;if(E.callbacks.beforeNodeAdded(b)!==!1){if(b instanceof Element&&pe(b)){let w,_=new Promise(function(j){w=j});b.addEventListener("load",function(){w()}),b.addEventListener("error",function(){w()}),h.push(_)}g.appendChild(b),E.callbacks.afterNodeAdded(b),O.push(b)}}for(let x of C)E.callbacks.beforeNodeRemoved(x)!==!1&&(g.removeChild(x),E.callbacks.afterNodeRemoved(x));return E.head.afterHeadMorphed(g,{added:O,kept:M,removed:C}),h}function Lt(g,T,E){if(!E.scripts.handle)return[];let O=[],C=[],M=[],v=[],A=E.scripts.matchMode,k=[];for(let h of g)if(h instanceof Element){a(h)&&k.push(h);for(let x of h.querySelectorAll("script"))a(x)&&k.push(x)}for(let h of k){if(h.closest("head")||n(h))continue;let x=o(h,A,E.merge),b=T.has(x),w=E.scripts.shouldPreserve(h),_=E.scripts.shouldReAppend(h);b||w?_?(C.push(h),v.push(h)):M.push(h):v.push(h)}let f=[];for(let h of v){if(E.callbacks.beforeNodeAdded(h)===!1)continue;let x=document.createElement("script");for(let b of h.attributes)x.setAttribute(b.name,b.value);if(x.textContent=h.textContent,x.src){let b,w=new Promise(function(_){b=_});x.addEventListener("load",function(){b()}),x.addEventListener("error",function(){b()}),f.push(w)}h.replaceWith(x),E.callbacks.afterNodeAdded(x),O.push(x)}return E.scripts.afterScriptsHandled(E.target,{added:O,kept:M,removed:C}),f}let fi=(function(){function g(k,f,h){let{persistentIds:x,idMap:b}=v(k,f),w=N.computeMatches(k,f);if(typeof h.key=="function"){let I=new Map,W=new Set,$=D=>{let L=h.key(D);L!=null&&(I.has(L)?W.add(L):I.set(L,D))};k instanceof Element&&$(k);for(let D of k.querySelectorAll("*"))$(D);for(let D of W)I.delete(D);let K=new Map;for(let[D,L]of w)K.set(L,D);let re=f.__hyperMorphRoot||f,X=new Map,J=new Set,q=D=>{let L=h.key(D);L!=null&&(X.has(L)?J.add(L):X.set(L,D))};re instanceof Element&&q(re);for(let D of re.querySelectorAll("*"))q(D);for(let D of J)X.delete(D);for(let[D,L]of X){let H=I.get(D);if(!H||H.tagName!==L.tagName)continue;let G=K.get(H);G&&G!==L&&w.delete(G);let xe=w.get(L);xe&&xe!==H&&K.delete(xe),w.set(L,H),K.set(H,L)}}let _=T(h),j=d(k,f,_.scripts);if(j){let I=new Map;for(let[W,$]of w)I.set($,W);for(let[W,$]of j.newByKey){if(j.disabled.has(W))continue;let K=j.oldByKey.get(W);if(!K)continue;let re=I.get(K);re&&re!==$&&w.delete(re);let X=w.get($);X&&X!==K&&I.delete(X),w.set($,K),I.set(K,$)}}let B=new Set;for(let I of w.values())B.add(I);let S=_.morphStyle||"outerHTML";if(!["innerHTML","outerHTML"].includes(S))throw new Error(`Do not understand how to morph style ${S}`);return{target:k,newContent:f,config:_,morphStyle:S,ignoreActive:_.ignoreActive,ignoreActiveValue:_.ignoreActiveValue,restoreFocus:_.restoreFocus,formStateSync:_.formStateSync||"attribute",idMap:b,persistentIds:x,hyperMatches:w,hyperMatchedOldElements:B,merge:j,pantry:E(),activeElementAndParents:O(k),callbacks:_.callbacks,head:_.head,scripts:_.scripts}}function T(k){let f=Object.assign({},y);return Object.assign(f,k),f.callbacks=Object.assign({},y.callbacks,k.callbacks),f.head=Object.assign({},y.head,k.head),f.scripts=Object.assign({},y.scripts,k.scripts),f}function E(){let k=document.createElement("div");return k.hidden=!0,document.body.insertAdjacentElement("afterend",k),k}function O(k){let f=[],h=document.activeElement;if(h?.tagName!=="BODY"&&k.contains(h))for(;h&&(f.push(h),h!==k);)h=h.parentElement;return f}function C(k){let f=Array.from(k.querySelectorAll("[id]"));return k.getAttribute?.("id")&&f.push(k),f}function M(k,f,h,x){for(let b of x){let w=b.getAttribute("id");if(f.has(w)){let _=b;for(;_;){let j=k.get(_);if(j==null&&(j=new Set,k.set(_,j)),j.add(w),_===h)break;_=_.parentElement}}}}function v(k,f){let h=C(k),x=C(f),b=A(h,x),w=new Map;M(w,b,k,h);let _=f.__hyperMorphRoot||f;return M(w,b,_,x),{persistentIds:b,idMap:w}}function A(k,f){let h=new Set,x=new Map;for(let w of k){let _=w.getAttribute("id");x.has(_)?h.add(_):x.set(_,w.tagName)}let b=new Set;for(let w of f){let _=w.getAttribute("id");b.has(_)?h.add(_):x.get(_)===w.tagName&&b.add(_)}for(let w of h)b.delete(w);return b}return g})(),{normalizeElement:gi,normalizeParent:Er}=(function(){let g=new WeakSet;function T(v){return v instanceof Document?v.documentElement:v}function E(v){if(v==null)return document.createElement("div");if(typeof v=="string")return E(M(v));if(g.has(v))return v;if(v instanceof Node){if(v.parentNode)return new O(v);{let A=document.createElement("div");return A.append(v),A}}else{let A=document.createElement("div");for(let k of[...v])A.append(k);return A}}class O{constructor(A){this.originalNode=A,this.realParentNode=A.parentNode,this.previousSibling=A.previousSibling,this.nextSibling=A.nextSibling}get childNodes(){let A=[],k=this.previousSibling?this.previousSibling.nextSibling:this.realParentNode.firstChild;for(;k&&k!=this.nextSibling;)A.push(k),k=k.nextSibling;return A}querySelectorAll(A){return this.childNodes.reduce((k,f)=>{if(f instanceof Element){f.matches(A)&&k.push(f);let h=f.querySelectorAll(A);for(let x=0;x<h.length;x++)k.push(h[x])}return k},[])}insertBefore(A,k){return this.realParentNode.insertBefore(A,k)}moveBefore(A,k){return this.realParentNode.moveBefore(A,k)}get __hyperMorphRoot(){return this.originalNode}}function C(v){let A=x=>`<${x}(?:\\s(?:[^>"']|"[^"]*"|'[^']*')*)?>`,k=v.replace(/<!--[\s\S]*?-->/g,"");for(let x of["script","style","textarea","title"])k=k.replace(new RegExp(`${A(x)}[\\s\\S]*?</${x}\\s*>`,"gi"),"");let f=new RegExp(`${A("svg")}[\\s\\S]*?</svg\\s*>`,"gi"),h;do h=k,k=k.replace(f,"");while(k!==h);return k}function M(v){let A=new DOMParser,k=C(v);if(k.match(/<\/html>/)||k.match(/<\/head>/)||k.match(/<\/body>/)){let f=A.parseFromString(v,"text/html");if(k.match(/<\/html>/))return g.add(f),f;{let h=f.firstChild;return h&&g.add(h),h}}else{let h=A.parseFromString("<body><template>"+v+"</template></body>","text/html").body.querySelector("template").content;return g.add(h),h}}return{normalizeElement:T,normalizeParent:E}})(),Cr=Symbol("hyper-morph-duplicate-key"),Tr=[g=>g.getAttribute("data-id"),g=>g.getAttribute("id")];function Ue(g,T){return T.map(E=>{let O=new Map;for(let C of g){if(C.nodeType!==1)continue;let M=E(C);M==null||M===""||O.set(M,O.has(M)?Cr:C)}return O})}function Rr(g,T,E,O){for(let C=0;C<O.length;C++){let M=O[C](g);if(M==null||M===""||T[C].get(M)!==g)continue;let v=E[C].get(M);if(!(!v||v===Cr)&&v.tagName===g.tagName)return v}return null}function Se(g,T,E){for(let O=0;O<E.length;O++){let C=E[O](g);if(!(C==null||C==="")&&T[O].get(C)===g)return!0}return!1}function bi(g,T,E={}){let O=E.skip||(()=>!1),C=E.ignoreAttr||(()=>!1),M=E.tiers&&E.tiers.length?E.tiers:Tr,v=null;function A(){return v||(v=Ue([g,...g.querySelectorAll("*")],M)),v}let k=null;function f(){return k||(k=Ue([T,...T.querySelectorAll("*")],M)),k}function h(q){return!q.parentElement||!q.parentElement.parentElement}function x(q,D,L){return h(q)||Se(q,A(),M)?(L.push({type:"subtree",el:q,base:D}),!1):!0}function b(q,D){let L=[];for(let H of q.attributes)C(q,H.name)||D.getAttribute(H.name)!==H.value&&L.push(H.name);for(let H of D.attributes)C(q,H.name)||q.hasAttribute(H.name)||L.push(H.name);return L}function w(q){let D=[],L=null,H=()=>{L!==null&&(D.push({nodeType:3,nodeValue:L}),L=null)};for(let G of q.childNodes){if(G.nodeType===3){L=(L===null?"":L)+G.nodeValue;continue}G.nodeType===1&&O(G)||(H(),(G.nodeType===1||G.nodeType===8)&&D.push(G))}return H(),D}function _(q,D){if(q.nodeType!==D.nodeType)return!1;if(q.nodeType!==1)return!0;if(q.tagName!==D.tagName)return!1;for(let L of M){let H=L(q),G=L(D);if(H!=null&&H!==""&&G!=null&&G!==""&&H!==G)return!1}return!0}function j(q){let D="";for(let L of q)L.nodeType===3&&L.nodeValue.trim()!==""?D+="\0"+L.nodeValue:L.nodeType===8&&(D+=""+L.nodeValue);return D}function B(q,D,L){let H=w(q),G=w(D);if(H.length===G.length){let P=!0;for(let Z=0;Z<H.length;Z++)if(!_(H[Z],G[Z])){P=!1;break}if(P){for(let Z=0;Z<H.length;Z++){let Ee=H[Z];if(Ee.nodeType===1){if(S(Ee,G[Z],L))return!0}else if(Ee.nodeValue!==G[Z].nodeValue)return!0}return!1}}let xe=H.filter(P=>P.nodeType===1),Ft=G.filter(P=>P.nodeType===1);if(j(H)!==j(G))return!0;let Or=Ue(xe,M),Mr=Ue(Ft,M),qt=[],Dt=new Set,Nr=[];for(let P of xe){let Z=Rr(P,Or,Mr,M);Z&&!Dt.has(Z)?(qt.push([P,Z]),Dt.add(Z)):Nr.push(P)}let ge=[];for(let P of Nr)Se(P,Or,M)?L.push({type:"subtree",el:P,base:null}):ge.push(P);let ze=[];for(let P of Ft)Dt.has(P)||(Se(P,Mr,M)?L.push({type:"deletion",el:P}):ze.push(P));if(ge.length!==ze.length)return!0;for(let P=0;P<ge.length;P++)if(!_(ge[P],ze[P]))return!0;let Ir=new Map(qt);for(let P=0;P<ge.length;P++)Ir.set(ge[P],ze[P]);let jr=-1;for(let P of xe){let Z=Ir.get(P);if(!Z)continue;let Ee=Ft.indexOf(Z);if(Ee<jr)return!0;jr=Ee}for(let P=0;P<ge.length;P++)if(S(ge[P],ze[P],L))return!0;for(let[P,Z]of qt)if(S(P,Z,L))return!0;return!1}function S(q,D,L){if(q.tagName!==D.tagName)return x(q,D,L);let H=b(q,D),G=[];if(B(q,D,G))return x(q,D,L);if(H.length){if(!h(q)&&!Se(D,f(),M))return!0;L.push({type:"attrs",el:q,names:H,base:D})}return L.push(...G),!1}let I=[],W=b(g,T);W.length&&I.push({type:"attrs",el:g,names:W});let $=(q,D)=>Array.from(q.children).find(L=>L.tagName===D)||null,K=$(g,"HEAD"),re=$(T,"HEAD");if(K&&re){let q=[];S(K,re,q),q.length&&I.push({type:"head",el:K})}else(K||re)&&K&&I.push({type:"head",el:K});let X=$(g,"BODY"),J=$(T,"BODY");return X&&J?S(X,J,I):X&&I.push({type:"subtree",el:X,base:null}),{entries:I}}function ki(g,T,E={}){let O=E.tiers&&E.tiers.length?E.tiers:Tr,C=g.documentElement,M=[],v=0,A=S=>({ok:!1,placed:M,held:S,skippedAttrs:v});if(!C)return A(null);function k(S){let I=[S,...S.querySelectorAll("*")];return Ue(I,O)}let f=k(C),h=new Map,x=S=>{let I=S.getRootNode(),W=h.get(I);if(!W){let $=I.nodeType===9?I.documentElement:I;W=k($),h.set(I,W)}return W};function b(S){if(!S.parentElement&&S.tagName==="HTML")return C;if(S.parentElement&&!S.parentElement.parentElement&&S.parentElement.tagName==="HTML"){if(S.tagName==="BODY")return g.body||null;if(S.tagName==="HEAD")return g.head||null}return null}function w(S){let I=b(S);return I||Rr(S,x(S),f,O)}function _(S){if(!S)return null;let I=w(S);return I&&I.isConnected?I:null}function j(S){for(let I=0;I<O.length;I++){let W=O[I](S);W!=null&&W!==""&&f[I].set(W,S)}}for(let S of T){if(S.type!=="deletion")continue;let I=w(S.el);I&&I!==C&&I.remove()}let B=T.filter(S=>S.type!=="deletion").sort((S,I)=>S.el===I.el?0:S.el.compareDocumentPosition(I.el)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);for(let S of B){if(S.type==="head"){let J=g.importNode(S.el,!0);g.head?g.head.replaceWith(J):C.insertBefore(J,C.firstChild),M.push({entry:S,imported:J});continue}if(S.type==="attrs"){let J=_(S.el)||_(S.base);if(!J){v++;continue}for(let q of S.names)S.el.hasAttribute(q)?J.setAttribute(q,S.el.getAttribute(q)):J.removeAttribute(q);continue}let I=S.el;if(b(I))return A(S);let W=_(I)||_(S.base);if(W){let J=g.importNode(I,!0);W.replaceWith(J),j(J),M.push({entry:S,imported:J});continue}if(S.base!=null&&!Se(S.base,x(S.base),O)||!Se(I,x(I),O))return A(S);let $=I.parentElement;if(!$)return A(S);let K=_($);if(!K)return A(S);let re=null;for(let J=I.previousElementSibling;J;J=J.previousElementSibling){let q=_(J);if(q&&q.parentNode===K){re=q;break}}let X=g.importNode(I,!0);if(re)K.insertBefore(X,re.nextSibling);else{let J=Array.prototype.indexOf.call($.children,I);K.insertBefore(X,K.children[J]||null)}j(X),M.push({entry:S,imported:X})}return{ok:!0,placed:M,held:null,skippedAttrs:v}}return{morph:R,defaults:y,findChangedRoots:bi,spliceProtected:ki,mergeJson:zt,mergeScriptText:Ht,parseJsonRelaxed:ot,parseRulesRelaxed:Hr}})();var Na=Ve.morph,Ia=Ve.defaults,ja=Ve.findChangedRoots,La=Ve.spliceProtected;var Vt=Ve;var at=["textContent","innerText","innerHTML","outerHTML","value","checked","selected","disabled","readOnly","type","tagName","nodeName","nodeType","nodeValue","childElementCount","id","className","classList","baseURI","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","dataset","currentSrc","duration","paused","title","documentURI","contentType"],Wt=new Set(at),Gr=new Set(["textContent","innerText","innerHTML","value","checked","selected","disabled","readOnly","type","id","className","title"]),Jr=new Set(["tagName","nodeName","nodeType","nodeValue","childElementCount","classList","baseURI","documentURI","contentType","offsetWidth","offsetHeight","clientWidth","clientHeight","scrollWidth","scrollHeight","currentSrc","duration","paused","dataset"]);var lt={};Pt(lt,{EmptyListInsert:()=>Ke,MAX_RULE_DEPTH:()=>Oe,MaxRuleDepthExceeded:()=>we,RuleTargetReadOnly:()=>Ge,RulesParseError:()=>Te,ShapeMismatch:()=>We,UnknownRulesVersion:()=>Re});var Te=class extends Error{constructor(t,r){super(t),this.name="RulesParseError",this.cause=r}},Re=class extends Error{constructor(t){super(`unknown rules version: ${t}. Library supports "1".`),this.name="UnknownRulesVersion",this.version=t}},Oe=20,we=class extends Error{constructor(t){super(`rule depth exceeded ${Oe} at path: ${t.join(".")}`),this.name="MaxRuleDepthExceeded",this.path=t}},We=class extends Error{constructor(t){super(`shape mismatch: ${t.length} field(s) failed validation`),this.name="ShapeMismatch",this.mismatches=t}},Ke=class extends Error{constructor(t){super(`cannot add items to empty list at "${t.join(".")}" \u2014 no sibling to clone as template. Seed the list with a hidden item first.`),this.name="EmptyListInsert",this.path=t}},Ge=class extends Error{constructor(t){super(`cannot write to read-only DOM property "${t}"`),this.name="RuleTargetReadOnly",this.target=t}};function ke(e,t,r,n={}){return Kt(e,t,r,{depth:0,path:[]},n)}function Kt(e,t,r,n,i){if(n.depth>Oe)throw new we(n.path);if(typeof r=="string")return Yi(e,t,r,n,i);if(Array.isArray(r)){let[o,s]=r,a=e.find(t,o,i);return Zr(i,n,a),a.map((l,c)=>Kt(e,l,s,{depth:n.depth+1,path:[...n.path,c]},i))}if(typeof r=="object"&&r!==null){let o={};for(let[s,a]of Object.entries(r))o[s]=Kt(e,t,a,{depth:n.depth+1,path:[...n.path,s]},i);return o}return null}function Yi(e,t,r,n,i){if(r.endsWith("[]")){let a=r.slice(0,-2),l=e.find(t,a,i);return Zr(i,n,l),l.map(c=>e.text(c))}if(r.startsWith("@"))return Yr(e,t,r.slice(1));let o=Q(r);if(o!==-1){let a=r.slice(0,o),l=r.slice(o+1),c=a?e.find(t,a,i):[t];return c.length===0?null:Yr(e,c[0],l)}if(r===".")return e.text(t);let s=e.find(t,r,i);return s.length===0?null:e.text(s[0])}function Zr(e,t,r){if(typeof e.onRowsRead=="function")try{e.onRowsRead(t.path.slice(),r)}catch(n){console.warn(`[hyper-html-api] onRowsRead threw at "${t.path.join(".")||"(root)"}"`,n)}}function Yr(e,t,r){if(Wt.has(r)){let i=e.prop(t,r);return i==null?null:String(i)}let n=e.attr(t,r);return n||null}function Zi(e){return e&&e.nodeType===1&&e.tagName==="SCRIPT"&&e.hasAttribute&&e.hasAttribute("data-rules-name")}function Xi(e){return e?(e.nodeType===9||e.nodeType===11,e):null}var Qi={find(e,t,r={}){let n=Xi(e);if(!n||!n.querySelectorAll)return[];let i=Array.from(n.querySelectorAll(t));r.includeRulesTag||(i=i.filter(a=>!Zi(a)));let o=[];r.skip&&o.push(r.skip);let s=r.templateAttr===null?null:r.templateAttr||"cms-template";if(s&&o.push("["+s+"]"),o.length){let a=o.join(", ");i=i.filter(l=>!l.closest||!l.closest(a))}return i},parent(e){return e?e.parentElement:null},children(e){return e?Array.from(e.children):[]},text(e,t){if(t===void 0)return(e.textContent||"").trim();e.textContent=t},attr(e,t,r){if(r===void 0)return e.hasAttribute&&e.hasAttribute(t)?e.getAttribute(t):null;e.setAttribute(t,r)},removeAttr(e,t){e&&e.removeAttribute&&e.removeAttribute(t)},prop(e,t,r){if(r===void 0){let n=e?e[t]:void 0;return n!==void 0?n:null}e[t]=r},clone(e){return e.cloneNode(!0)},insertAt(e,t,r){let n=e.children[r]||null;e.insertBefore(t,n)},remove(e){e&&e.parentNode&&e.parentNode.removeChild(e)},replaceWith(e,t){if(!e||!e.parentNode)throw new Error("dom.replaceWith: node has no parent");let n=e.ownerDocument.createElement("template");n.innerHTML=t;let i=n.content.firstElementChild;if(!i)throw new Error("dom.replaceWith: html did not parse to an element");return e.parentNode.replaceChild(i,e),i},stripIds(e){let t=0;return e.id&&(e.removeAttribute("id"),t++),(e.querySelectorAll?e.querySelectorAll("[id]"):[]).forEach(n=>{n.removeAttribute("id"),t++}),t},sameNode(e,t){return e===t}},ue=Qi;function Gt(e){try{return JSON.parse(e)}catch(t){throw new Te(`Invalid strict JSON: ${t.message}`,t)}}function Me(e){try{return JSON.parse(e)}catch{}let t={BRACE_OPEN:"{",BRACE_CLOSE:"}",BRACKET_OPEN:"[",BRACKET_CLOSE:"]",COLON:":",COMMA:",",STRING:"STRING",SELECTOR:"SELECTOR",IDENTIFIER:"IDENTIFIER",NUMBER:"NUMBER",BOOLEAN:"BOOLEAN"};function r(i){let o=[],s=0;for(;s<i.length;){let a=i[s];if(/\s/.test(a)){s++;continue}if("{}".includes(a)){o.push({type:a,value:a}),s++;continue}if(a==="["){let p=!1,d=s+1;for(;d<i.length&&/\s/.test(i[d]);)d++;if(d<i.length&&/[a-zA-Z_]/.test(i[d])&&(p=!0),!p){o.push({type:a,value:a}),s++;continue}}if(a==="]"){o.push({type:a,value:a}),s++;continue}if(a===":"){o.push({type:t.COLON,value:a}),s++;continue}if(a===","){o.push({type:t.COMMA,value:a}),s++;continue}if(a==='"'||a==="'"){let p=a,d=s+1;for(;d<i.length&&i[d]!==p;)i[d]==="\\"&&d++,d++;o.push({type:t.STRING,value:i.substring(s+1,d),quoted:!0,sourceQuote:p}),s=d+1;continue}let l=s,c;for(;l<i.length&&!/[{},]/.test(i[l]);)if(i[l]===":"){let p=[":first",":last",":nth-child",":nth-of-type",":first-child",":last-child",":first-of-type",":last-of-type",":only-child",":only-of-type",":hover",":focus",":active",":visited",":disabled",":enabled",":checked",":empty",":root",":target",":not",":before",":after",":nth-last-child",":nth-last-of-type"],d=!1;for(let u of p){let y=u.substring(1);if(i.substring(l+1,l+1+y.length)===y){d=!0,l+=y.length;break}}if(!d)break}else if(i[l]==="["){for(l++;l<i.length&&i[l]!=="]";){if(i[l]==='"'||i[l]==="'"){let p=i[l];for(l++;l<i.length&&i[l]!==p;)i[l]==="\\"&&l++,l++}l++}l<i.length&&i[l]==="]"&&l++}else l++;c=i.substring(s,l);let m=t.IDENTIFIER;/^-?\d+(\.\d+)?$/.test(c)?m=t.NUMBER:c==="true"||c==="false"||c==="null"?m=t.BOOLEAN:/^[.#@\[]|[.#@\[]| /.test(c)&&(m=t.SELECTOR),o.push({type:m,value:c,quoted:!1}),s=l}return o}function n(i){let o="";for(let s=0;s<i.length;s++){let a=i[s];if("{}".includes(a.type)||"[]".includes(a.type)){o+=a.value;continue}if(a.type===t.COLON){o+=a.value;continue}if(a.type===t.COMMA){let l=i[s+1];if(l&&(l.type==="}"||l.type==="]"))continue;o+=a.value;continue}if(a.type===t.STRING&&a.quoted){let l=a.value;a.sourceQuote==="'"&&(l=l.replace(/\\'/g,"'"),l=l.replace(/(\\*)"/g,(c,m)=>m.length%2===0?m+'\\"':c)),o+=`"${l}"`;continue}if(a.type===t.NUMBER||a.type===t.BOOLEAN){o+=a.value;continue}if(a.type===t.SELECTOR||a.type===t.IDENTIFIER){o+=`"${a.value}"`;continue}o+=`"${a.value}"`}return o}try{let i=r(e),o=n(i);return JSON.parse(o)}catch(i){throw new Te("Invalid extraction rules syntax: "+i.message,i)}}var Qr="1",Xr=/^[a-zA-Z0-9_-]+$/;function Je(e,t,r){let n;if(r===void 0)n="script[data-rules-name]";else{if(typeof r!="string"||!Xr.test(r))throw new Error(`hyper-html-api: invalid rules token ${JSON.stringify(r)} (must match ${Xr})`);n=`script[data-rules-name~="${r}"]`}let i=e.find(t,n,{includeRulesTag:!0});if(i.length===0)return null;r!==void 0&&i.length>1&&console.warn(`hyper-html-api: ${i.length} rules tags match data-rules-name~="${r}"; using the first.`);let o=i[0],s=e.attr(o,"data-rules-version");if(s!==Qr)throw new Re(s);return{rules:Me(e.text(o)),tagNode:o}}var ml=new Function("url","return import(url)");function sn(e,t,r,n){let i=e.length,o=t.length,s=new Array(i).fill(-1);if(n){let R=new Set;for(let F=0;F<i;F++){let V=n[F];!(V>=0&&V<o)||R.has(V)||(s[F]=V,R.add(V))}}if(i===0||o===0)return s;let a=e.map(R=>nn(R,r)),l=t.map(R=>nn(R,r)),c=new Array(o).fill(!1);for(let R of s)R>=0&&(c[R]=!0);let m=new Map;l.forEach((R,F)=>{c[F]||m.set(R,m.has(R)?-1:F)});let p=new Map;a.forEach((R,F)=>{s[F]>=0||p.set(R,(p.get(R)||0)+1)}),a.forEach((R,F)=>{if(s[F]>=0||p.get(R)!==1)return;let V=m.get(R);V===void 0||V===-1||c[V]||(s[F]=V,c[V]=!0)});let d=[];for(let R=0;R<i;R++)s[R]<0&&d.push(R);let u=[];for(let R=0;R<o;R++)c[R]||u.push(R);if(d.length===0||u.length===0)return s;let y=i*o+1,N=(R,F)=>to(e[R],t[F],r)*y+Math.abs(R-F);for(let[R,F]of ro(d,u,N))s[R]=F;return s}var an=e=>typeof e=="object"&&e!==null;function nn(e,t){if(!an(t))return e==null?" null":String(e);let r=Object.keys(t);return JSON.stringify(r.map(n=>{let i=JSON.stringify(e?.[n]);return i===void 0?" undef":i}))}function to(e,t,r){if(!an(r))return e===t?0:1;let n=Object.keys(r);if(n.length===0)return 0;let i=0;for(let o of n){let s=JSON.stringify(e?.[o]),a=JSON.stringify(t?.[o]);s!==a&&i++}return i}function ro(e,t,r){return e.length<=t.length?on(e,t,r,!1):on(t,e,(n,i)=>r(i,n),!0)}function on(e,t,r,n){let i=e.length,o=t.length,s=[];for(let p=0;p<=i;p++)s.push(new Float64Array(o+1).fill(1/0));let a=[];for(let p=0;p<=i;p++)a.push(new Uint8Array(o+1));for(let p=0;p<=o;p++)s[i][p]=0;for(let p=i-1;p>=0;p--)for(let d=o-1;d>=0;d--){let u=r(e[p],t[d])+s[p+1][d+1],y=s[p][d+1];u<=y?(s[p][d]=u,a[p][d]=1):s[p][d]=y}let l=[],c=0,m=0;for(;c<i&&m<o;)a[c][m]&&(l.push(n?[t[m],e[c]]:[e[c],t[m]]),c++),m++;return l}function Yt(e,t,r,n,i,o,s,a={}){let l=e.find(t,r,a);if(i.length===0){l.forEach(z=>e.remove(z)),Jt(a,"onRowsApplied",o.path,[]);return}let c=i.length>l.length,m=l[0]||null;if(c&&!m&&(m=so(e,t,r,a),!m))throw new Ke(o.path);let p=l.map(z=>oo(e,z,n,a)),d=null;if(c&&m){d=e.clone(m),a.templateAttr&&e.removeAttr(d,a.templateAttr);let z=e.stripIds(d);z>0&&console.warn(`[hyper-html-api] stripped ${z} id attribute(s) from cloned template at "${o.path.join(".")||"(root)"}"`)}let u=sn(i,p,n,no(e,l,i,o,a)),y=l[0]||m,N=e.parent(y),R=l.length>0?ln(e,N,y):0,F=ao(e,l),V=new Set,te=[],le=i.map((z,oe)=>{let ee=u[oe];if(ee>=0)return V.add(ee),te.push(!1),l[ee];te.push(!0);let pe=e.clone(d);return e.stripIds(pe),pe});l.forEach((z,oe)=>{V.has(oe)||e.remove(z)}),F?le.forEach((z,oe)=>{let ee=R+oe;e.children(N).findIndex(Lt=>e.sameNode(Lt,z))!==ee&&e.insertAt(N,z,ee)}):lo(e,le,te,N,R),io(e,le,n,i,o,s,a),Jt(a,"onRowsApplied",o.path,le)}function Jt(e,t,r,n){if(typeof e[t]=="function")try{return e[t](r.slice(),n)}catch(i){console.warn(`[hyper-html-api] ${t} threw at "${r.join(".")||"(root)"}"`,i);return}}function no(e,t,r,n,i){let o=Jt(i,"identifyRows",n.path,r);if(!Array.isArray(o))return null;let s=new Array(r.length).fill(-1),a=new Set;for(let l=0;l<r.length;l++)if(o[l]){for(let c=0;c<t.length;c++)if(!(a.has(c)||!e.sameNode(t[c],o[l]))){s[l]=c,a.add(c);break}}return s}function io(e,t,r,n,i,o,s){t.forEach((a,l)=>{if(r===null){let c=n[l],m=c==null?"":String(c);e.text(a)!==m&&e.text(a,m)}else{let c=o(e,a,r,n[l],{depth:i.depth+1,path:[...i.path,l]},s);c&&c!==a&&(t[l]=c)}})}function oo(e,t,r,n){return r===null?e.text(t):ke(e,t,r,n.onRowsRead?{...n,onRowsRead:void 0}:n)}function ln(e,t,r){let n=e.children(t);for(let i=0;i<n.length;i++)if(e.sameNode(n[i],r))return i;return-1}function so(e,t,r,n){if(!n.templateAttr)return null;let i=t;for(;i;){let o=e.find(i,r,{includeRulesTag:!1,templateAttr:null});for(let s of o)if(e.attr(s,n.templateAttr)!=null)return s;i=e.parent(i)}return null}function ao(e,t){if(t.length<=1)return!0;let r=e.parent(t[0]);if(!r)return!1;let n=e.children(r),i=[];for(let o of t){let s=n.findIndex(a=>e.sameNode(a,o));if(s===-1)return!1;i.push(s)}return i.sort((o,s)=>o-s),i[i.length-1]-i[0]===i.length-1}function lo(e,t,r,n,i){let o=null,s=i;for(let a=0;a<t.length;a++){if(!r[a]){o=t[a];continue}let l=o?e.parent(o):n;if(!l)continue;let c=o?ln(e,l,o)+1:s++;e.insertAt(l,t[a],c),o=t[a]}}var cn=new Set(["checked","selected","disabled","readOnly","paused"]);function Ne(e,t,r,n,i={}){let o=[];if(Zt(r,n,[],o),o.length)throw new We(o);ct(e,t,r,n,{depth:0,path:[]},i)}function ct(e,t,r,n,i,o={}){if(i.depth>Oe)throw new we(i.path);if(n===void 0)return t;if(typeof r=="string")return co(e,t,r,n,i,o);if(Array.isArray(r)){let[s,a]=r;return Yt(e,t,s,a,n,i,ct,o),t}if(typeof r=="object"&&r!==null){for(let[s,a]of Object.entries(r)){let l=ct(e,t,a,n==null?n:n[s],{depth:i.depth+1,path:[...i.path,s]},o);l&&l!==t&&(t=l)}return t}return t}function co(e,t,r,n,i,o){if(r.endsWith("[]")){let l=r.slice(0,-2);return Yt(e,t,l,null,n,i,ct,o),t}if(r.startsWith("@"))return dn(e,t,r.slice(1),n);let s=Q(r);if(s!==-1){let l=r.slice(0,s),c=r.slice(s+1),m=l?e.find(t,l,o):[t];return m.length===0||dn(e,m[0],c,n),t}if(r===".")return un(e,t,n),t;let a=e.find(t,r,o);return a.length===0||un(e,a[0],n),t}function un(e,t,r){let n=r==null?"":String(r);e.text(t)!==n&&e.text(t,n)}function dn(e,t,r,n){if(Jr.has(r))throw new Ge(r);if(r==="outerHTML"){let i=n==null?"":String(n);return e.replaceWith(t,i)}return Gr.has(r)?(e.prop(t,r,uo(r,n)),t):(e.attr(t,r,n==null?"":String(n)),t)}function uo(e,t){return t==null?cn.has(e)?!1:"":cn.has(e)?t==="false"?!1:!!t:t}function Zt(e,t,r,n){if(t!==void 0){if(typeof e=="string"){if(e.endsWith("[]")){Array.isArray(t)?t.forEach((i,o)=>{typeof i=="object"&&i!==null&&n.push({path:Ze([...r,o]),expected:"scalar",got:Ye(i)})}):n.push({path:Ze(r),expected:"array",got:Ye(t)});return}t!==null&&typeof t=="object"&&n.push({path:Ze(r),expected:"scalar",got:Ye(t)});return}if(Array.isArray(e)){if(!Array.isArray(t)){n.push({path:Ze(r),expected:"array",got:Ye(t)});return}let i=e[1];t.forEach((o,s)=>Zt(i,o,[...r,s],n));return}if(typeof e=="object"&&e!==null){if(t===null||Array.isArray(t)||typeof t!="object"){n.push({path:Ze(r),expected:"object",got:Ye(t)});return}for(let[i,o]of Object.entries(e))Zt(o,t[i],[...r,i],n)}}}function Ye(e){return e===null?"null":Array.isArray(e)?"array":typeof e}function Ze(e){return e.join(".")}function Xt(e,t,r){if(r&&typeof r=="object")return{rules:r,tagNode:null};if(typeof r=="string"){let n=t&&t.ownerDocument?t.ownerDocument:t;return Je(e,n,r)}return null}function hn(e,t,r,n){let i=Xt(e,t,r);if(!i){let a=typeof r=="string"?`data-rules-name~="${r}"`:"the provided rules object";throw new Error(`hyper-html-api: could not resolve rules for ${a}`)}let{rules:o,tagNode:s}=i;return{rules:o,tagNode:s,get:()=>ke(e,t,o,n),set:a=>Ne(e,t,o,a,n)}}var ne={extract:(e,t,r)=>ke(ue,e,t,r),apply:(e,t,r,n)=>Ne(ue,e,t,r,n),findRulesIn:(e,t)=>Je(ue,e,t),findRules:(e,t)=>Xt(ue,e,t),bind:(e,t,r)=>hn(ue,e,t,r),parseStrict:Gt,parseRelaxed:Me,ruleAttrIndex:Q,splitRule:it,errors:lt,DOM_PROPERTIES:at};var er={};Pt(er,{fromString:()=>me,getRuleAtPath:()=>_e,getValueAtPath:()=>So,setAtPath:()=>Qt,toString:()=>Ao});function Ao(e){return e.map(String).join(".")}function me(e){return e===""?[]:e.split(".").map(t=>/^\d+$/.test(t)?Number(t):t)}function _e(e,t){let r=e;for(let n of t){if(r==null)return;if(typeof r=="string"){if(r.endsWith("[]")&&(typeof n=="number"||n==="*")){r=r.slice(0,-2);continue}return}if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function So(e,t){let r=e;for(let n of t){if(r==null)return;r=r[n]}return r}function Qt(e,t,r){if(t.length===0)return r;let[n,...i]=t;if(typeof n=="number"){let o=Array.isArray(e)?[...e]:[];return o[n]=Qt(o[n],i,r),o}return{...e&&typeof e=="object"?e:{},[n]:Qt((e||{})[n],i,r)}}function Xe(e){if(typeof e=="string")return e.endsWith("[]")?[]:"";if(Array.isArray(e))return[];if(typeof e=="object"&&e!==null){let t={};for(let[r,n]of Object.entries(e))t[r]=Xe(n);return t}return""}function ut(e,t,{ignoreActiveValue:r=!0}={}){Vt.morph(e,t,{morphStyle:"innerHTML",ignoreActiveValue:r,restoreFocus:!0,formStateSync:"property"})}function mt(e){return e.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,t=>t.toUpperCase())}var Eo='<div class="hcms-drag-handle mirk-sortable__grip" aria-hidden="true"><div class="mirk-sortable__dots"><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span><span class="mirk-sortable__dot"></span></div></div>',tr='<svg class="hcms-x" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"></path></svg>',gn={"@scalar":`
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
      ${Eo}
      <div class="hcms-card-body mirk-sortable__body">
        <div class="hcms-card-fields"></div>
        <div class="hcms-card-controls">
          <button type="button" class="hcms-move hcms-move-up hcms-sr-only" data-hcms-action="move-up" aria-label="Move up">\u2191</button>
          <button type="button" class="hcms-move hcms-move-down hcms-sr-only" data-hcms-action="move-down" aria-label="Move down">\u2193</button>
          <button type="button" class="hcms-remove hcms-remove--card" data-hcms-action="remove" aria-label="Remove">${tr}</button>
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
        <button type="button" class="hcms-upload-clear" data-hcms-action="clear-upload" aria-label="Remove file">${tr}</button>
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
          <button type="button" class="hcms-upload-clear hcms-upload-clear--badge" data-hcms-action="clear-upload" aria-label="Remove image">${tr}</button>
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
  `},Co=["@scalar","@object","@scalar-array","@scalar-array-item","@object-array","@object-array-item"];function ht(e){let t=e.head||e.documentElement;if(t)for(let r of Co)vn(e,t,r)}function rr(e,t){if(!gn[t])return null;let r=e&&(e.head||e.documentElement);return r?vn(e,r,t):null}var pn={src:"@image",checked:"@checkbox",innerHTML:"@richtext"},dt={image:"@image",file:"@file",checkbox:"@checkbox",toggle:"@toggle",select:"@select",radio:"@radio",textarea:"@textarea",number:"@number",richtext:"@richtext"},To=new Set([...Object.values(dt),"@chips","@chips-item"]);function Qe(e,t,r,n){if(typeof e!="string")return"@scalar";let i=Q(e),o=gt(e,i,r,n),s=bt(o,t,"data-hcms-component");if(s&&dt[s]){let a=dt[s],l=Array.isArray(r)&&r.some(c=>c==="*"||typeof c=="number");return a==="@number"&&!fn(e,i,t,l,o).every(Oo)||(a==="@checkbox"||a==="@toggle")&&(i<0||e.slice(i+1)!=="checked")&&!fn(e,i,t,l,o).every(Mo)?"@scalar":a}if(i>=0){let a=e.slice(i+1);if(pn[a])return pn[a]}return"@scalar"}function bn(e,t,r,n){if(typeof e!="string")return null;let i=Q(e),o=bt(gt(e,i,r,n),t,"data-hcms-component");return o&&dt[o]||null}var Ro=/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;function Oo(e){return e==null||e===""?!0:Ro.test(String(e))}function Mo(e){return e==null||e===""||e==="true"||e==="false"}function fn(e,t,r,n,i){if(!r||!r.querySelectorAll)return[];if(!i||i===".")return[];let o=null;try{o=r.querySelectorAll(i)}catch{return[]}let s=t>=0?e.slice(t+1):null,a=[];for(let l of o)if(!(l.closest&&l.closest("[cms-template], [data-hcms-shell]"))&&(s?s==="value"&&"value"in l?a.push(l.value):a.push(l.getAttribute?l.getAttribute(s):null):a.push((l.textContent||"").trim()),!n))break;return a}function pt(e,t){if(typeof e!="string"||!e.endsWith("[]")||!t||!t.querySelector)return null;let r=e.slice(0,-2).trim();if(!r)return null;let n=null;try{n=t.querySelector(r)}catch{return null}let i=n&&n.closest?n.closest("[data-hcms-component]"):null;return(i&&i.getAttribute?i.getAttribute("data-hcms-component"):null)==="chips"?{array:"@chips",item:"@chips-item"}:null}function Ie(e,t,r){let n=e.join("."),i=e.map(o=>typeof o=="number"?"*":o).join(".");return n&&ce(r,n)||i&&i!==n&&ce(r,i)||ce(r,t)}function ft(e,t,r){let n=pt(e,r);if(!n)return null;let i=Ie(t,n.array,r);return i&&i.getAttribute("data-hcms-tpl")===n.array?n:null}function kn(e,t,r,n){if(typeof e!="string")return null;let i=Q(e),o=bt(gt(e,i,r,n),t,"data-hcms-options");if(o==null)return null;let s=o.trim().split(/\s+/).filter(Boolean);return s.length?s:null}function yn(e,t,r,n){if(typeof e!="string")return null;let i=Q(e);return bt(gt(e,i,r,n),t,"data-hcms-crop")}function No(e,t){return t>=0?e.slice(0,t):e}function gt(e,t,r,n){let i=No(e,t);return i&&i!=="."?i:Io(n,r)}function Io(e,t){if(e==null||!Array.isArray(t))return"";let r=[],n=e;for(let i of t){if(n==null||typeof n=="string")break;if(Array.isArray(n)){if(typeof n[0]!="string"||i!=="*"&&typeof i!="number")return"";r.push(n[0]),n=n[1];continue}if(typeof n!="object"||!Object.prototype.hasOwnProperty.call(n,i))return"";n=n[i]}return r.join(" ")}function bt(e,t,r){if(!t||!t.querySelector||!e||e===".")return null;let n=null;try{n=t.querySelector(e)}catch{return null}return n&&n.getAttribute?n.getAttribute(r):null}function kt(e,t){if(!e||t==null)return;r(t,[]);function r(n,i){let o=Ae(n);if(o==="scalar"){let s=Qe(n,e,i,t);To.has(s)&&rr(e,s);return}if(o==="scalar-array"){let s=pt(n,e);s&&(rr(e,s.array),rr(e,s.item));return}if(o==="object"){for(let[s,a]of Object.entries(n))r(a,[...i,s]);return}if(o==="object-array"){let s=n[1],a=[...i,"*"];if(s&&typeof s=="object"&&!Array.isArray(s))for(let[l,c]of Object.entries(s))r(c,[...a,l]);else r(s,a)}}}function vn(e,t,r){let n=ce(e,r);if(n)return n;let i=e.createElement("template");return i.setAttribute("data-hcms-tpl",r),i.setAttribute("save-remove",""),i.innerHTML=gn[r].trim(),t.appendChild(i),i}function ce(e,t){return!e||!e.querySelector?null:e.querySelector(`template[data-hcms-tpl="${jo(t)}"]`)}function jo(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function Ae(e){return typeof e=="string"?e.endsWith("[]")?"scalar-array":"scalar":Array.isArray(e)?"object-array":typeof e=="object"&&e!==null?"object":"scalar"}function et(e){return e?!!(e.content||e).querySelector("[data-hcms-field]"):!1}var xn={IMG:"src",A:"href"};function yt(e){if(!e)return"value";let t=(e.tagName||"").toUpperCase();return t==="INPUT"?(e.getAttribute("type")||"text").toLowerCase()==="checkbox"?"checked":"value":t==="TEXTAREA"||t==="SELECT"?"value":xn[t]?xn[t]:e.hasAttribute&&e.hasAttribute("contenteditable")?"innerHTML":null}function wn(e,t){let r=(e.tagName||"").toUpperCase(),n=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),i=yt(e),s=`${An(r,n)}[data-hcms-field="${je(t)}"]`;return r==="INPUT"&&n==="radio"?`${s}:checked@value`:i?`${s}@${i}`:s}function Lo(e){let t=(e.tagName||"").toUpperCase(),r=(e.getAttribute&&e.getAttribute("type")||"").toLowerCase(),n=yt(e),o=`${An(t,r)}[data-hcms-field]`;return t==="INPUT"&&r==="radio"?`${o}:checked@value`:n?`${o}@${n}`:o}function An(e,t){return e==="INPUT"?t?`input[type="${t}"]`:"input":e==="TEXTAREA"?"textarea":e==="SELECT"?"select":e==="IMG"?"img":e==="A"?"a":':not([data-hcms-shape="scalar"]):not([data-hcms-shape="object"]):not([data-hcms-shape="object-array"]):not([data-hcms-shape="scalar-array"])'}function je(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var _n=new Set(["__proto__","constructor","prototype"]);function vt(e,t){return r(e,[]);function r(c,m){let p=Ae(c);if(p==="scalar")return n(c,m);if(p==="scalar-array")return i(c,m);if(p==="object-array")return o(c,m);if(p==="object"){let d=Object.create(null);for(let[u,y]of Object.entries(c)){if(_n.has(u))throw new Error(`hypercms: rule key "${u}" is forbidden at "${m.join(".")||"<root>"}"`);d[u]=r(y,[...m,u])}return d}return null}function n(c,m){let p=m.length?m[m.length-1]:null,d=typeof p=="string"?p:"__value",u=l(m,d);if(u)return wn(u,d);let y=a(Qe(c,t,m,e),d);return y?wn(y,d):`input[data-hcms-field="${je(d)}"]@value`}function i(c,m){let p=ft(c,m,t),d=p&&a(p.item,null)||a("@scalar-array-item",null),u=d?Lo(d):"input[data-hcms-field]@value";return[s(m,"[data-hcms-array-item]"),u]}function o(c,m){let[,p]=c,d=[...m,"*"],u=s(m,"[data-hcms-card]");if(p&&typeof p=="object"&&!Array.isArray(p)){let y=Object.create(null);for(let[N,R]of Object.entries(p)){if(_n.has(N))throw new Error(`hypercms: rule key "${N}" is forbidden at "${d.join(".")}"`);y[N]=r(R,[...d,N])}return[u,y]}return[u,r(p,[...d,0])]}function s(c,m){let p=c.length?c[c.length-1]:"",d=c.some(N=>N==="*"),u=c.join(".");return`${d?`[data-hcms-field="${je(p)}"]`:`[data-hcms-path="${je(u)}"]`} > .hcms-array-items > ${m}`}function a(c,m){if(!t)return null;let p=ce(t,c);if(!p)return null;let d=p.content||p;if(m){let u=d.querySelector(`[data-hcms-field="${je(m)}"]`);if(u)return u}return d.querySelector("[data-hcms-field]")}function l(c,m){if(!t)return null;let p=c.map(y=>typeof y=="number"?"*":y).join("."),u=[c.join("."),p];for(let y=c.length-1;y>=0;y--){let N=c.slice(0,y).map(R=>typeof R=="number"?"*":R);N.push("*"),u.push(N.join("."))}for(let y of u){if(!y)continue;let N=ce(t,y);if(!N||!et(N))continue;let R=N.content||N,F=R.querySelector(`[data-hcms-field="${je(m)}"]`)||R.querySelector("[data-hcms-field]");if(F)return F}return null}}function nr(e){if(!e)return"";let t=String(e).split(/[?#]/)[0],r=t.split("/").pop()||t;try{return decodeURIComponent(r)}catch{return r}}function xt({pageRules:e,formRules:t,data:r,doc:n}){let i=n.createDocumentFragment(),o=ir(e,[],r,n,e);return o&&i.appendChild(o),i}function En({shape:e,itemShape:t,pathArr:r,data:n,doc:i,itemKey:o,pageRules:s}){if(e==="object-array-item")return Tn(t,r,n,i,s);if(e==="scalar-array-item")return Rn(r,n,i,o||null);throw new Error(`hypercms: buildItem called with unknown shape "${e}"`)}function ir(e,t,r,n,i){let o=Ae(e);return o==="scalar"?Fo(e,t,r,n,i):o==="object"?Po(e,t,r,n,i):o==="object-array"?Bo(e,t,r,n,i):o==="scalar-array"?Uo(e,t,r,n):null}function Fo(e,t,r,n,i){let o=Qe(e,n,t,i),s=Ie(t,o,n);if(!s)throw new Error(`hypercms: missing template for scalar at "${t.join(".")}"`);let a=bn(e,n,t,i);a==="@number"&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "@number" but its value isn't a plain number; rendering a text input so the value is preserved`),(a==="@checkbox"||a==="@toggle")&&o==="@scalar"&&console.info(`[hypercms] field "${t.join(".")}" declares component "${a}" but its value isn't true/false; rendering a text input so the value is preserved`),Cn(s,a===o?a:null,t);let l=Le(s,n);Fe(l,t);let c=s.getAttribute?.("data-hcms-tpl");if((o==="@select"||o==="@radio")&&c===o&&qo(l,e,t,r,n,o,i),o==="@image"&&c==="@image"){let m=yn(e,n,t,i);m!=null&&!l.hasAttribute("data-hcms-crop")&&l.setAttribute("data-hcms-crop",m)}return zo(l,he(t)),wt(l,he(t)),_t(l,he(t)),jn(l,r),o==="@file"&&$o(l),l}function Cn(e,t,r){if(!t)return;let n=e.getAttribute?.("data-hcms-tpl");n&&n!==t&&console.info(`[hypercms] field "${r.join(".")}" declares component "${t}" but custom template "${n}" wins`)}function qo(e,t,r,n,i,o,s){let a=kn(t,i,r,s),l=a?[...a]:[],c=n==null?"":String(n);if(c!==""&&!l.includes(c)&&l.unshift(c),!a&&(Do(e,"data-hcms-options required (space-separated values)"),l.length===0)){e.querySelector(".mirk-radio")?.remove();return}if(o==="@select"){let d=e.querySelector("select[data-hcms-field]");if(!d)return;for(let u of l){let y=i.createElement("option");y.value=u,y.textContent=mt(u),d.appendChild(y)}return}let m=e.querySelector(".mirk-radio");if(!m||!m.parentNode)return;let p=or(r.join("."));for(let d of l){let u=m.cloneNode(!0),y=u.querySelector('input[type="radio"]');y&&(y.value=d,y.name=p);let N=u.querySelector(".mirk-radio__label");N&&(N.textContent=mt(d)),m.parentNode.insertBefore(u,m)}m.remove()}function or(e){return"hcms-"+String(e).replace(/[^A-Za-z0-9_-]/g,"-")}function Do(e,t){let r=e.querySelector?e.querySelector(".hcms-error"):null;r&&(r.textContent=t,r.hidden=!1)}function $o(e){let t=e.querySelector?e.querySelector("a.mirk-file__name[data-hcms-field]"):null;t&&(t.textContent=nr(t.getAttribute("href")))}function Po(e,t,r,n,i){let o=Ie(t,"@object",n);if(!o)throw new Error(`hypercms: missing template for object at "${t.join(".")}"`);let s=Le(o,n);if(Fe(s,t),wt(s,he(t)),_t(s,he(t)),et(o))return Fn(s,e,t),Ln(s,e,r),s;let a=At(s,".hcms-object-fields",o,t);for(let[l,c]of Object.entries(e)){let m=r==null?null:r[l],p=ir(c,[...t,l],m,n,i);p&&a.appendChild(p)}return s}function Bo(e,t,r,n,i){let o=Ie(t,"@object-array",n);if(!o)throw new Error(`hypercms: missing template for object-array at "${t.join(".")}"`);let s=Le(o,n);Fe(s,t),wt(s,he(t)),_t(s,he(t)),Mn(s,o),In(s,o,t);let a=At(s,".hcms-array-items",o,t),[,l]=e;return(Array.isArray(r)?r:[]).forEach((m,p)=>{let d=Tn(l,[...t,p],m,n,i);d&&a.appendChild(d)}),Nn(s),s}function Tn(e,t,r,n,i){let o=On(t,"object-array-item",n);if(!o)throw new Error(`hypercms: missing item template for "${t.join(".")}"`);let s=Le(o,n);if(s.setAttribute("data-hcms-card",""),s.classList.contains("hcms-card")||s.classList.add("hcms-card"),Fe(s,t),et(o))return e&&typeof e=="object"&&!Array.isArray(e)&&(Fn(s,e,t),Ln(s,e,r)),s;let a=At(s,".hcms-card-fields",o,t);if(e&&typeof e=="object"&&!Array.isArray(e))for(let[l,c]of Object.entries(e)){let m=r==null?null:r[l],p=ir(c,[...t,l],m,n,i);p&&a.appendChild(p)}return s}function Uo(e,t,r,n){let i=pt(e,n),o=ft(e,t,n),s=i?i.array:"@scalar-array",a=Ie(t,s,n);if(!a)throw new Error(`hypercms: missing template for scalar-array at "${t.join(".")}"`);Cn(a,i?i.array:null,t);let l=Le(a,n);Fe(l,t),wt(l,he(t)),_t(l,he(t)),Mn(l,a),In(l,a,t),o&&l.setAttribute("data-hcms-item-tpl",o.item);let c=At(l,".hcms-array-items",a,t);return(Array.isArray(r)?r:[]).forEach((p,d)=>{let u=Rn([...t,d],p,n,o?o.item:null);u&&c.appendChild(u)}),Nn(l),l}function Rn(e,t,r,n){let i=On(e,"scalar-array-item",r,n);if(!i)throw new Error(`hypercms: missing item template for "${e.join(".")}"`);let o=Le(i,r);return o.setAttribute("data-hcms-array-item",""),o.classList.contains("hcms-array-item")||o.classList.add("hcms-array-item"),Fe(o,e),jn(o,t),o}function On(e,t,r,n){let i=e.map(o=>typeof o=="number"?"*":o).join(".");return ce(r,i)||n&&ce(r,n)||ce(r,"@"+t)}function Le(e,t){let r=e.content||e,n=t.createElement("div");return n.appendChild(r.cloneNode(!0)),n.firstElementChild||n}function Fe(e,t){e.setAttribute("data-hcms-path",t.join("."))}function zo(e,t){let r=t==null?"":String(t);if(e.matches&&e.matches("[data-hcms-field]")){e.getAttribute("data-hcms-field")||e.setAttribute("data-hcms-field",r);return}(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{i.getAttribute("data-hcms-field")||i.setAttribute("data-hcms-field",r)})}function wt(e,t){t==null||t===""||!e.setAttribute||e.hasAttribute?.("data-hcms-field")||e.setAttribute("data-hcms-field",String(t))}function _t(e,t){if(t==null||t==="")return;(e.querySelectorAll?e.querySelectorAll("[data-hcms-label]"):[]).forEach(n=>{(n.textContent||"").trim()===""&&(n.textContent=mt(String(t)))})}function Mn(e,t){["data-hcms-no-add","data-hcms-no-remove","data-hcms-no-reorder"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,"")}),["data-hcms-min-items","data-hcms-max-items"].forEach(r=>{t.hasAttribute(r)&&e.setAttribute(r,t.getAttribute(r))})}function Nn(e){let t=e.querySelector?e.querySelector(".hcms-array-items"):null;if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Sn(e,"data-hcms-max-items"),o=Sn(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),a=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector('[data-hcms-action="add"]');c&&(c.hidden=s||i!=null&&n>=i),r.forEach((m,p)=>{let d=m.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=a||o!=null&&n<=o);let u=m.querySelector('[data-hcms-action="move-up"]');u&&(u.hidden=l||p===0);let y=m.querySelector('[data-hcms-action="move-down"]');y&&(y.hidden=l||p===n-1)})}function Sn(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function In(e,t,r){if(e.hasAttribute("data-hcms-no-reorder")||t.hasAttribute("data-hcms-no-reorder"))return;let n=e.querySelector(".hcms-array-items");if(!n)return;let i="hcms-"+r.join(".");n.setAttribute("sortable",i),n.setAttribute("onsorted","hypercmsCommit && hypercmsCommit()")}function he(e){return e.length?e[e.length-1]:null}function jn(e,t){let r=Ho(e);if(r.length!==0)for(let n of r)qn(n,t)}function Ho(e){if(!e)return[];let t=[];return e.matches?.("[data-hcms-field]")&&Vo(e)&&t.push(e),(e.querySelectorAll?e.querySelectorAll("input[data-hcms-field], textarea[data-hcms-field], select[data-hcms-field], img[data-hcms-field], a[data-hcms-field], [contenteditable][data-hcms-field]"):[]).forEach(n=>t.push(n)),t}function Vo(e){let t=(e.tagName||"").toUpperCase();return!!(t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="IMG"||t==="A"||e.hasAttribute?.("contenteditable"))}function Ln(e,t,r){(e.querySelectorAll?e.querySelectorAll("[data-hcms-field]"):[]).forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o)return;if(!t||typeof t!="object"||!(o in t)){console.warn(`[hypercms] inline template field "${o}" is not in the rule shape; ignoring`);return}let s=r==null?null:r[o];qn(i,s)})}function Fn(e,t,r){if(!e.querySelectorAll)return;e.querySelectorAll("[data-hcms-field]").forEach(i=>{let o=i.getAttribute("data-hcms-field");if(!o||t&&typeof t=="object"&&!(o in t))return;let s=[...r,o].join(".");i.setAttribute("data-hcms-path",s)})}function At(e,t,r,n){if(!e.querySelector)return e;let i=e.querySelector(t);if(i)return i;let o=r?.getAttribute?.("data-hcms-tpl")||n.join(".");throw new Error(`hypercms: template "${o}" is in slotted mode but has no ${t} element`)}function qn(e,t){let r=yt(e),n=(e.tagName||"").toUpperCase(),i=(e.getAttribute("type")||"").toLowerCase();if(n==="INPUT"&&i==="radio"){e.checked=e.value!=null&&String(e.value)===String(t??"");return}if(r==="checked"){e.checked=t===!0||t==="true";return}if(r){e[r]=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var Dn=new WeakMap,sr=e=>e.map(String).join(".");function Wo(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}function $n(e,t){if(!e||!e.querySelector)return null;let r=e.querySelector(`[data-hcms-path="${Wo(t)}"]`),n=r&&r.querySelector(".hcms-array-items");return n?Array.from(n.children).filter(i=>i.matches&&i.matches("[data-hcms-card], [data-hcms-array-item]")):null}function Pn(e,t,r){let n=$n(e,t);!n||n.length!==r.length||n.forEach((i,o)=>{r[o]&&Dn.set(i,r[o])})}function St(){let e=new Map;return{hooks:{onRowsRead(t,r){e.set(sr(t),r)}},seed(t){for(let[r,n]of e)Pn(t,r,n);e.clear()}}}function Bn(e){return{identifyRows(t,r){let n=$n(e,sr(t));return!n||n.length!==r.length?null:n.map(i=>Dn.get(i)||null)},onRowsApplied(t,r){Pn(e,sr(t),r)}}}var Un={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function zn(e,t,r,n={}){let{observerHandle:i,shellRoot:o,structural:s,structuralPath:a,formRoot:l}=n,c=l?{...Un,...Bn(l)}:Un;i?.pause?.();try{if(!s)try{return ne.apply(e,t,r,c),{ok:!0}}catch(u){return{ok:!1,error:u}}let m=Ko(e,t,a),p=m?Jo(m):null,d=m?null:Zo(e,o);try{return ne.apply(e,t,r,c),{ok:!0}}catch(u){return p?Yo(m,p):d&&Xo(e,o,d),{ok:!1,error:u}}}finally{i?.resume?.()}}function Ko(e,t,r){if(!r||!e)return null;let n=me(r),i=[],o=t;for(let s of n){if(typeof o=="string"||o==null||Array.isArray(o))break;if(typeof o=="object"&&s in o){if(i.push(s),o=o[s],Array.isArray(o)||typeof o=="string"&&o.endsWith("[]"))break}else return null}return!Array.isArray(o)&&!(typeof o=="string"&&o.endsWith("[]"))?null:Go(e,t,i)}function Go(e,t,r){if(r.length===0)return null;let n=e,i=t;for(let o=0;o<r.length;o++){let s=r[o];if(!i||typeof i!="object"||Array.isArray(i))return null;let a=i[s];if(a==null)return null;if(o===r.length-1){if(Array.isArray(a)){let[l]=a;return n.querySelector?.(l)?.parentElement||null}if(typeof a=="string"&&a.endsWith("[]")){let l=a.slice(0,-2);return n.querySelector?.(l)?.parentElement||null}return null}i=a}return null}function Jo(e){let t=[];for(let r of Array.from(e.childNodes))t.push(r.cloneNode(!0));return t}function Yo(e,t){for(;e.firstChild;)e.removeChild(e.firstChild);for(let r of t)e.appendChild(r)}function Zo(e,t){let r=[];for(let n of Array.from(e.childNodes))n===t||t&&n.contains?.(t)||r.push(n.cloneNode(!0));return r}function Xo(e,t,r){for(let i of Array.from(e.childNodes))i===t||t&&i.contains?.(t)||e.removeChild(i);let n=Qo(e,t);for(let i of r)e.insertBefore(i,n||null)}function Qo(e,t){if(!t)return null;for(let r of Array.from(e.childNodes))if(r===t||r.contains?.(t))return r;return null}var es={Mutation:(e,t)=>e?.Mutation??t?.Mutation,undo:(e,t)=>e?.undo??t?.undo,onPrepareForSave:(e,t)=>e?.addDocumentTransform??t?.onPrepareForSave,consent:(e,t)=>e?.confirm??t?.consent,RichClay:(e,t)=>e?.RichClay??t?.RichClay,quickcrop:(e,t)=>e?.quickcrop??t?.quickcrop,upload:(e,t)=>e?.upload??(t?.uploadFileBasic?rs(t.uploadFileBasic):null)},ts={402:"payment-required",413:"too-large",415:"unsupported-type",401:"unauthorized",403:"forbidden",404:"not-found"},ar=()=>({ok:!1,msg:"Upload cancelled",msgType:"skipped",code:"aborted",uploads:[]});function rs(e){return async function(r,{onProgress:n,signal:i}={}){if(i?.aborted)return ar();try{let o=await e(r,{onProgress:a=>{n?.({loaded:null,total:null,percent:a})}});if(i?.aborted)return ar();let s=o&&o.uploads||[];return typeof s[0]?.url!="string"?{ok:!1,msg:"The host accepted the file but did not say where it put it",msgType:"error",code:"bad-response",uploads:[]}:{ok:!0,msg:o.msg||"Uploaded",msgType:o.msgType||"success",code:o.code||null,uploads:s}}catch(o){if(i?.aborted)return ar();let s={};try{s=JSON.parse(o?.response||"{}")}catch{s={}}let a=s.code||ts[o?.status]||"error";return{ok:!1,msg:o&&o.message||"Upload failed",msgType:"error",code:a,uploads:[]}}}}function ie(e,t){let r=es[e];if(!r)throw new Error(`hypercms: unknown platform capability "${e}"`);let n=t||(typeof window<"u"?window:null);return n&&r(n.clay,n.hyperclay)||null}var Hn=["clay:mutation-ready","hyperclay:mutation-ready"],Vn=["clay:sync-applied","hyperclay:livesync-applied"];function lr(e,t,r){let n=null,i=o=>{n!==null&&n!==o.type||(n=o.type,queueMicrotask(()=>{n=null}),r(o))};for(let o of t)e.addEventListener(o,i);return()=>{for(let o of t)e.removeEventListener(o,i)}}function Et(e,t){if(!t||e==null)return e;return r(e);function r(n){if(typeof n=="string"){if(n.endsWith("[]")||Q(n)!==-1)return n;let i=null;try{i=t.querySelector(n)}catch{return n}return i&&i.children.length>0?n+"@innerHTML":n}if(Array.isArray(n))return n;if(n&&typeof n=="object"){let i=Object.create(null);for(let[o,s]of Object.entries(n))i[o]=r(s);return i}return n}}function cr(e){if(!e||e.tagName!=="TEXTAREA")return;let t=e.ownerDocument.defaultView||(typeof window<"u"?window:null);t&&t.CSS&&t.CSS.supports&&t.CSS.supports("field-sizing: content")||(e.style.height="auto",e.style.height=e.scrollHeight+"px")}function qe(e,t){if(!e||!e.querySelectorAll)return;e.querySelectorAll("textarea[data-hcms-field]").forEach(cr);let r=t&&t.defaultView||(typeof window<"u"?window:null),n=r&&r.richclay&&r.richclay.RichClay||ie("RichClay",r)||(r&&typeof r.RichClay=="function"?r.RichClay:null);n&&e.querySelectorAll("[contenteditable][data-hcms-field]").forEach(i=>{if(i.__hcmsRichclay)return;let o;try{o=new n(i,{inline:!0,hyperclay:!1,toolbar:["bold","italic","link","undo","redo"]})}catch(a){console.warn("[hypercms] richclay activation failed; field stays plain contenteditable",a);return}i.__hcmsRichclay=o;let s=o&&o.squire;s&&typeof s.addEventListener=="function"&&s.addEventListener("input",()=>{let a=r&&r.Event||Event;i.dispatchEvent(new a("input",{bubbles:!0}))})})}var ur=new WeakSet;function Pe(e,t){let r=ie("undo");if(!r)return t();r.pause();try{let n=t();return n&&n.ok?r.commitCaptured(e):r.discardCaptured(),n}finally{r.resume()}}function Rt(e){let t=ie("undo");if(!t)return e();t.pause();try{return e()}finally{t.discardCaptured(),t.resume()}}function Yn(e){let{formRoot:t}=e;if(!t||ur.has(t))return;ur.add(t);let r=s=>{let a=s.target;!a||!a.closest||a.closest("[data-hcms-form-root]")&&a.matches("input, textarea, select, [contenteditable][data-hcms-field]")&&(a.tagName==="TEXTAREA"&&cr(a),!a.matches('input[type="file"]')&&(!a.closest("[data-hcms-field]")&&!a.hasAttribute?.("data-hcms-field")||Wn(a,e)))},n=s=>{let a=s.target;if(!(!a||!a.closest)&&a.closest("[data-hcms-form-root]")){if(a.matches('input[type="file"][data-hcms-upload]')){us(a,e);return}a.matches('input[type="checkbox"], input[type="radio"], select')&&Wn(a,e)}},i=s=>{let a=s.target;if(!a||!a.closest)return;let l=a.closest("[data-hcms-action]");if(!l)return;let c=l.getAttribute("data-hcms-action");if(c==="add"||c==="remove"||c==="move-up"||c==="move-down"||c==="clear-upload"){if(!l.closest("[data-hcms-form-root]"))return}else if(c==="close"&&!l.closest("[data-hcms-shell]"))return;if(c==="add"){let m=l.closest("[data-hcms-path]");if(!m)return;let p=m.getAttribute("data-hcms-path");mr(p,e)}else if(c==="remove"){let m=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;ys(m,e)}else if(c==="move-up"||c==="move-down"){let m=l.closest("[data-hcms-card], [data-hcms-array-item]");if(!m)return;bs(m,c==="move-up"?-1:1,e)}else c==="clear-upload"?ps(l,e):c==="close"&&e.onCloseRequested?.()},o=t.ownerDocument;o.addEventListener("input",r,!0),o.addEventListener("change",n,!0),o.addEventListener("click",i,!0),e.detachEvents=()=>{o.removeEventListener("input",r,!0),o.removeEventListener("change",n,!0),o.removeEventListener("click",i,!0),ur.delete(t)}}var ns=new Set(["value","checked"]);function is(e,t){if(!t)return null;let r=me(t);if(r.some(l=>typeof l=="number"||l==="*"))return null;let n=_e(e.pageRules,r);if(typeof n!="string")return null;let i=ne.ruleAttrIndex(n);if(i===-1)return null;let o=n.slice(i+1);if(!ns.has(o))return null;let s=n.slice(0,i),a=s?e.pageRoot.querySelector(s):e.pageRoot;return a?{el:a,prop:o,oldValue:a[o]}:null}function Wn(e,t){let n=(e.closest("[data-hcms-field]")||e).closest("[data-hcms-path]")?.getAttribute("data-hcms-path")||"",i=is(t,n);if(de(ae(t),{path:n,structural:!1},t),i){let o=ie("undo");o&&typeof o.recordValue=="function"&&o.recordValue(i.el,{prop:i.prop,oldValue:i.oldValue,newValue:i.el[i.prop]})}}var os={type:"image/webp",quality:.85,maxWidth:2048,maxHeight:2048};async function ss(e,t){let r=t&&t.getAttribute?t.getAttribute("data-hcms-crop"):null;if(r==null)return{file:e};let n=ie("quickcrop");if(typeof n!="function")return{file:e};try{let i=typeof window<"u"&&(window.clay?.modal??window.themodal)||"auto",o=await n(e,{aspect:as(r),modal:i,...os});return o===null?null:{file:ls(o.blob,e.name),dataURL:o.dataURL}}catch(i){return $e(t,i&&i.message||"Crop failed"),null}}function as(e){let t=String(e??"").trim().toLowerCase();if(t===""||t==="free")return null;let r=t.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);if(!r)return null;let n=parseFloat(r[1]),i=parseFloat(r[2]);return!n||!i?null:n/i}function ls(e,t){let r=e.type==="image/webp"?".webp":e.type==="image/jpeg"?".jpg":".png",n=String(t||"image").replace(/\.[^.]+$/,"");try{return new File([e],n+r,{type:e.type})}catch{return e}}var cs=new Set(["unsupported","payment-required"]);async function us(e,t){let r=e.files&&e.files[0];if(!r)return;let n=e.closest("[data-hcms-path]");if(!n)return;let i=n.getAttribute("data-hcms-path")||"";$e(n,null);let o=await ss(r,n);if(!o||t.closed){ye(e);return}let s=o.file,a=o.dataURL||null,l=ie("upload");if(typeof l!="function")return dr(e,n,t,i,await Kn(s,a,n),s);Xn(n,a),Gn(n,0);let c=ms(t),m;try{m=await l(s,{signal:c?.signal,onProgress:({percent:d})=>Gn(n,d)})}finally{hs(t,c),gs(n)}if(t.closed){ye(e);return}if(m.code==="aborted"){ye(e);return}if(m.ok)return dr(e,n,t,i,m.uploads[0].url,s);if(!cs.has(m.code)){$e(n,m.msg||"Upload failed"),t.dispatch?.("hcms:error",{error:new Error(m.msg||"Upload failed"),code:m.code,path:i}),ye(e);return}let p=m.code==="payment-required"?"This file is stored in the page. Add a paid plan to upload files.":null;return dr(e,n,t,i,await Kn(s,a,n),s,p)}function dr(e,t,r,n,i,o,s=null){if(r.closed){ye(e);return}if(Xn(t,null),$e(t,null),!i){ye(e);return}Zn(t,i,o.name),de(ae(r),{path:n,structural:!1},r),s&&$e(t,s,"info"),ye(e)}async function Kn(e,t,r){return t||await ds(e,r)}function ds(e,t){let r=t?.ownerDocument?.defaultView?.FileReader||globalThis.FileReader;return r?new Promise(n=>{let i=new r;i.onload=()=>n(typeof i.result=="string"?i.result:""),i.onerror=()=>n("");try{i.readAsDataURL(e)}catch{n("")}}):Promise.resolve("")}function ms(e){if(typeof AbortController!="function")return null;let t=new AbortController;return(e.uploads||(e.uploads=new Set)).add(t),t}function hs(e,t){t&&e.uploads?.delete(t)}function ps(e,t){let r=e.closest("[data-hcms-path]");if(!r)return;let n=r.getAttribute("data-hcms-path")||"";Zn(r,"","");let i=r.querySelector('input[type="file"][data-hcms-upload]');i&&ye(i),$e(r,null),de(ae(t),{path:n,structural:!1},t)}function fs(e){return e.querySelector?e.querySelector("img[data-hcms-field], a[data-hcms-field]"):null}function Zn(e,t,r){let n=fs(e);if(!n)return;let i=(n.tagName||"").toUpperCase();i==="IMG"?n.src=t||"":i==="A"&&(n.href=t||"",n.textContent=t?r||nr(t):"")}function ye(e){try{e.value=""}catch{}}function Xn(e,t){let r=e.querySelector?e.querySelector(".mirk-image__frame"):null;r&&(t?r.style.backgroundImage=`url("${t.replace(/"/g,"%22")}")`:r.style.removeProperty("background-image"))}function Gn(e,t){let r=Math.max(0,Math.min(100,Number(t)||0));e.setAttribute("data-hcms-uploading",""),e.style?.setProperty?.("--hcms-upload-progress",`${r}%`)}function gs(e){e.removeAttribute("data-hcms-uploading"),e.style?.removeProperty?.("--hcms-upload-progress")}function $e(e,t,r="error"){let n=e.querySelector?e.querySelector(":scope > .hcms-error"):null;n&&(n.classList.toggle("hcms-error--info",!!t&&r==="info"),t?(n.textContent=t,n.hidden=!1):(n.textContent="",n.hidden=!0))}function mr(e,t){let{formRoot:r,pageRules:n}=t,i=r.querySelector(`[data-hcms-path="${Es(e)}"]`);if(!i)throw new Error(`hypercms: no element at path "${e}"`);let o=i.querySelector(".hcms-array-items");if(!o)throw new Error(`hypercms: array container missing .hcms-array-items at "${e}"`);let s=me(e),a=_s(n,s),l=Array.isArray(a),c=typeof a=="string"&&a.endsWith("[]");if(!l&&!c)throw new Error(`hypercms: path "${e}" is not an array`);let m=Tt(i,"data-hcms-max-items"),p=o.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]");if(i.hasAttribute("data-hcms-no-add")||m!=null&&p.length>=m)return;let d=p.length,u=l?a[1]:a.replace(/\[\]$/,""),y=Xe(l?u:"string"),N=En({shape:l?"object-array-item":"scalar-array-item",itemShape:u,pathArr:[...s,d],data:y,doc:t.doc,itemKey:i.getAttribute("data-hcms-item-tpl")||null,pageRules:n});return o.appendChild(N),qe(N,t.doc),pr(i),Pe(`Add ${e}`,()=>de(ae(t),{path:e,structural:!0},t))}function bs(e,t,r){let n=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!n||n.hasAttribute("data-hcms-no-reorder"))return;let i=n.querySelector(".hcms-array-items");if(!i)return;let o=Array.from(i.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),s=o.indexOf(e);if(s<0)return;let a=s+t;if(a<0||a>=o.length)return;let l=e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`);return t<0?i.insertBefore(e,o[a]):i.insertBefore(e,o[a].nextSibling),gr(i),pr(n),l&&typeof l.focus=="function"&&e.querySelector(`[data-hcms-action="${t<0?"move-up":"move-down"}"]`)?.focus?.(),Pe(`Reorder ${n.getAttribute("data-hcms-path")||""}`,()=>de(ae(r),{path:n.getAttribute("data-hcms-path")||"",structural:!0},r))}var Ct="Delete this item?";function ks(e,t){let r=e&&e.getAttribute("data-hcms-confirm-remove");if(r!=null)return/^(off|false|no|0)$/i.test(r.trim())?null:r||Ct;let n=t&&t.confirmRemove;return n===!1?null:typeof n=="string"?n||Ct:n===!0||e&&e.getAttribute("data-hcms-shape")==="object-array"?Ct:null}function ys(e,t){let r=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]'),n=ks(r,t);if(n==null)return De(e,t);let i=ie("consent")||typeof window<"u"&&window.consent;typeof i=="function"?Promise.resolve(i(n)).then(()=>De(e,t),()=>{}):typeof window<"u"&&typeof window.confirm=="function"?window.confirm(n)&&De(e,t):De(e,t)}function De(e,t){let r=e.getAttribute("data-hcms-path")||"",n=e.parentElement,i=e.closest('[data-hcms-shape="object-array"], [data-hcms-shape="scalar-array"]');if(!i?.hasAttribute("data-hcms-no-remove")){if(i){let o=Tt(i,"data-hcms-min-items"),s=i.querySelector(".hcms-array-items"),a=s?s.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]").length:0;if(o!=null&&a<=o)return}return e.remove(),n&&gr(n),i&&pr(i),Pe(`Remove ${r}`,()=>de(ae(t),{path:r,structural:!0},t))}}function de(e,t,r){let n=tt(e);if(!t.structural&&n===r.lastFingerprint)return{ok:!0,skipped:!0};let i=zn(r.pageRoot,r.pageRules,e,{observerHandle:r.observerHandle,shellRoot:r.shellRoot,structural:!!t.structural,structuralPath:t.path||null,formRoot:r.formRoot});return i.ok?(r.lastFingerprint=n,r.lastData=e,Jn(r,null),r.dispatch?.("hcms:change",{data:e,path:t.path,structural:!!t.structural}),r.onChange?.(e,t)):(Jn(r,ws(i.error,t.path)),r.dispatch?.("hcms:error",{error:i.error,attemptedData:e}),r.onError?.(i.error)),i}function ae(e){let t=ne.extract(e.formRoot,e.formRules);return ve(t,e.formRules)}function ve(e,t){if(t==null||e==null)return e;if(typeof t=="string")return t.endsWith("@checked")?e===!0||e==="true":e;if(Array.isArray(t)){if(!Array.isArray(e))return e;let[,r]=t;return e.map(n=>ve(n,r))}if(typeof t=="object"){if(typeof e!="object"||Array.isArray(e))return e;let r={};for(let[n,i]of Object.entries(t))r[n]=ve(e[n],i);return r}return e}function Jn(e,t){e.lastErrors=t&&t.length?t:null,hr(e)}function hr(e){if(vs(e),e.errorEl&&(e.errorEl.textContent="",e.errorEl.hidden=!0),!e.lastErrors)return;let t=[];for(let{message:r,path:n}of e.lastErrors){if(n!=null&&n!==""){let i=xs(e.formRoot,n);if(i){i.textContent=i.textContent?`${i.textContent}
${r}`:r,i.hidden=!1;continue}}t.push(r)}t.length&&e.errorEl&&(e.errorEl.textContent=t.join(`
`),e.errorEl.hidden=!1)}function vs(e){if(e.formRoot)for(let t of e.formRoot.querySelectorAll(".hcms-error"))t.textContent="",t.hidden=!0}function xs(e,t){if(!e)return null;let r=t.split(".");for(;r.length>0;){let n=r.join("."),i=typeof CSS<"u"&&CSS.escape?CSS.escape(n):n.replace(/[^a-zA-Z0-9_\-.*]/g,s=>"\\"+s),o=e.querySelector(`[data-hcms-path="${i}"]`);if(o){for(let s of o.children)if(s.classList&&s.classList.contains("hcms-error"))return s}r.pop()}return null}function ws(e,t){return e?e.name==="EmptyListInsert"?[{message:"Add a seed item in HTML first.",path:t}]:e.name==="ShapeMismatch"&&Array.isArray(e.mismatches)&&e.mismatches.length?e.mismatches.map(r=>({message:`Shape mismatch: expected ${r.expected}, got ${r.got}`,path:r.path})):[{message:e.message||String(e),path:t}]:[{message:"unknown error",path:t}]}function _s(e,t){let r=e;for(let n of t){if(r==null||typeof r=="string")return;if(Array.isArray(r)){if(typeof n!="number"&&n!=="*")return;r=r[1];continue}if(typeof r=="object"){if(typeof n=="number"||!(n in r))return;r=r[n];continue}return}return r}function Tt(e,t){if(!e||!e.hasAttribute(t))return null;let r=parseInt(e.getAttribute(t),10);return Number.isFinite(r)?r:null}function pr(e){if(!e)return;let t=e.querySelector(".hcms-array-items");if(!t)return;let r=Array.from(t.querySelectorAll(":scope > [data-hcms-card], :scope > [data-hcms-array-item]")),n=r.length,i=Tt(e,"data-hcms-max-items"),o=Tt(e,"data-hcms-min-items"),s=e.hasAttribute("data-hcms-no-add"),a=e.hasAttribute("data-hcms-no-remove"),l=e.hasAttribute("data-hcms-no-reorder"),c=e.querySelector(':scope > .hcms-add, :scope > * > .hcms-add, :scope > [data-hcms-action="add"]');c&&(c.hidden=s||i!=null&&n>=i),r.forEach((m,p)=>{let d=m.querySelector('[data-hcms-action="remove"]');d&&(d.hidden=a||o!=null&&n<=o);let u=m.querySelector('[data-hcms-action="move-up"]');u&&(u.hidden=l||p===0);let y=m.querySelector('[data-hcms-action="move-down"]');y&&(y.hidden=l||p===n-1)})}function fr(e){!e||!e.querySelectorAll||e.querySelectorAll(".hcms-array-items").forEach(t=>gr(t))}function gr(e){let t=e.querySelectorAll?Array.from(e.querySelectorAll('input[type="radio"][data-hcms-field]'),n=>[n,n.checked]):[],r=0;for(let n of e.children){if(!n.matches?.("[data-hcms-card], [data-hcms-array-item]"))continue;let i=n.getAttribute("data-hcms-path");if(!i)continue;let o=i.split(".");o[o.length-1]=String(r);let s=o.join(".");s!==i&&As(n,i,s),r++}for(let[n,i]of t)n.checked!==i&&(n.checked=i)}function As(e,t,r){let n=e.querySelectorAll("[data-hcms-path]");e.setAttribute("data-hcms-path",r);for(let i of n){let o=i.getAttribute("data-hcms-path");o===t?i.setAttribute("data-hcms-path",r):o&&o.startsWith(t+".")&&i.setAttribute("data-hcms-path",r+o.slice(t.length))}Ss(e)}function Ss(e){for(let t of e.querySelectorAll('input[type="radio"][data-hcms-field]')){if(!t.name||!t.name.startsWith("hcms-"))continue;let r=t.closest("[data-hcms-path]");r&&(t.name=or(r.getAttribute("data-hcms-path")))}}function tt(e){return JSON.stringify(e,(t,r)=>{if(r&&typeof r=="object"&&!Array.isArray(r)){let n=Object.create(null);for(let i of Object.keys(r).sort())n[i]=r[i];return n}return r})}function Es(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var Is={},Ot="hcms-shell-styles",Cs="hcms-bundled-styles-installed",Ts='a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',Be=new WeakSet,br="";function ei(e){br=e}var Rs=0;function Qn(e){return String(e).replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t])}function ti({mountTo:e,side:t="right",overlay:r=!1,showSaveButton:n=!1,title:i="Page content",eyebrow:o="Edit",theme:s=null,doc:a}){ri(a);let l=`hcms-shell-title-${++Rs}`,c=a.createElement("div");c.setAttribute("data-hcms-shell",""),c.setAttribute("save-remove",""),c.setAttribute("save-ignore",""),c.setAttribute("tabindex","-1"),c.setAttribute("role","dialog"),c.setAttribute("aria-modal","true"),c.setAttribute("aria-labelledby",l);let m=s==="dark"?" dark":s==="light"?" light":"";c.className="hcms-shell pixel-quiet hcms-side-"+t+(r?" hcms-overlay":"")+m;let p=Qn(i),d=Qn(o);c.innerHTML=`
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
  `,(e||a.body).appendChild(c);let y=a.body;y.classList.add("hcms-open"),r&&y.classList.add("hcms-overlay"),t==="left"&&y.classList.add("hcms-side-left");let N=Ns(c,a),R=Ms(c);return{root:c,formRoot:c.querySelector("[data-hcms-form-root]"),noticeEl:c.querySelector(".hcms-shell-notice"),errorEl:c.querySelector(".hcms-shell-error"),saveButton:c.querySelector(".hcms-shell-save"),destroy(){N.detach(),R.detach(),c.remove(),y.classList.remove("hcms-open","hcms-overlay","hcms-side-left")},restoreChrome(){Os(a),y.classList.add("hcms-open"),r&&y.classList.add("hcms-overlay"),t==="left"&&y.classList.add("hcms-side-left")}}}function Os(e){e&&(e.getElementById(Ot)||e.querySelector("style[data-hcms-bundled-styles]")||(Be.delete(e),ri(e)))}function ri(e){if(e&&!Be.has(e)){if(e[Cs]){Be.add(e);return}if(e.getElementById(Ot)||e.querySelector("style[data-hcms-bundled-styles]")){Be.add(e);return}if(br){let t=e.createElement("style");t.id=Ot,t.setAttribute("save-remove",""),t.setAttribute("save-ignore",""),t.textContent=br,(e.head||e.documentElement).appendChild(t),Be.add(e);return}try{let t=new URL("./theme.generated.css",Is.url).href,r=e.createElement("link");r.rel="stylesheet",r.id=Ot,r.setAttribute("save-remove",""),r.setAttribute("save-ignore",""),r.href=t,(e.head||e.documentElement).appendChild(r),Be.add(e)}catch{console.warn("hypercms: shell stylesheet not applied \u2014 cssText is empty and the co-located theme fallback is unavailable. Call installStyles(themeText) before opening the CMS.")}}}function Ms(e){let t=e.querySelector(".hcms-shell-body"),r=e.querySelector(".hcms-shell-header");if(!t||!r||typeof t.addEventListener!="function")return{detach(){}};let n=()=>{let i=(r.offsetHeight||0)-12;e.classList.toggle("is-condensed",t.scrollTop>i)};return t.addEventListener("scroll",n,{passive:!0}),n(),{detach(){t.removeEventListener("scroll",n)}}}function Ns(e,t){function r(n){if(n.key!=="Tab"||!e.contains(t.activeElement))return;let i=Array.from(e.querySelectorAll(Ts));if(i.length===0)return;let o=i[0],s=i[i.length-1];n.shiftKey&&t.activeElement===o?(n.preventDefault(),s.focus()):!n.shiftKey&&t.activeElement===s&&(n.preventDefault(),o.focus())}return t.addEventListener("keydown",r),{detach:()=>t.removeEventListener("keydown",r)}}var js="[hypercms]",ni={skip:"[data-hcms-shell]",templateAttr:"cms-template"},ii={skip:"[data-hcms-shell]",templateAttr:null},kr=class extends Error{constructor(t,r,n){super(`hypercms: rule at "${t}" has an invalid CSS selector: "${r}"`),this.name="InvalidRuleSelector",this.path=t,this.selector=r,this.cause=n}};function Nt(e,t){let r=[],n=[];return yr(e,t,[],r,n),{missing:Ds(r),twins:$s(n)}}function yr(e,t,r,n,i){if(typeof t=="string"){let o=Ls(t);if(!o)return;let s=Mt(e,o,ni,r);if(t.endsWith("[]")){s.length===0&&Mt(e,o,ii,r).length===0&&n.push(rt(r));return}s.length===0?n.push(rt(r)):s.length>1&&i.push({path:rt(r),count:s.length});return}if(Array.isArray(t)){let[o,s]=t;if(typeof o!="string"||!o)return;let a=Mt(e,o,ni,r);if(a.length===0){Mt(e,o,ii,r).length===0&&n.push(rt(r));return}for(let l of a)yr(l,s,[...r,"*"],n,i);return}if(t&&typeof t=="object")for(let[o,s]of Object.entries(t))yr(e,s,[...r,o],n,i)}function Mt(e,t,r,n){try{return ue.find(e,t,r)}catch(i){throw new kr(rt(n),t,i)}}function Ls(e){if(e==="."||e.startsWith("@"))return null;if(e.endsWith("[]"))return e.slice(0,-2)||null;let t=Q(e);return(t===-1?e:e.slice(0,t))||null}function It(e){Fs(e),qs(e)}function Fs(e){let t=e.noticeEl;if(!t)return;let r=e.unresolved&&e.unresolved.missing||[];if(r.length===0){t.textContent="",t.hidden=!0;return}let n=r.length===1?"1 field no longer matches this page":`${r.length} fields no longer match this page`;t.textContent=`${n}: ${r.join(", ")}`,t.hidden=!1}function qs(e){let t=e.unresolved&&e.unresolved.twins||[],r=t.map(n=>`${n.path}:${n.count}`).join("|");if(r!==e.lastTwinSignature){e.lastTwinSignature=r;for(let{path:n,count:i}of t)console.warn(`${js} "${n}" matches ${i} elements; edits go to the first one.`)}}function Ds(e){return[...new Set(e)]}function $s(e){let t=new Map;for(let r of e){let n=t.get(r.path);(!n||r.count>n.count)&&t.set(r.path,r)}return[...t.values()]}function rt(e){return e.length?e.join("."):"(whole page)"}var Ps={skip:"[data-hcms-shell]",templateAttr:"cms-template"};function jt(e,{ignoreActiveValue:t}={}){let r=ne.findRules(e.doc,e.rulesSource||"cms");r&&(e.pageRules=e.richText?Et(r.rules,e.pageRoot):r.rules,e.rulesTagNode=r.tagNode),ht(e.doc),kt(e.doc,e.pageRules),e.formRules=vt(e.pageRules,e.doc),e.unresolved=Nt(e.pageRoot,e.pageRules);let n=St(),i=ve(ne.extract(e.pageRoot,e.pageRules,{...Ps,...n.hooks}),e.pageRules),o=xt({pageRules:e.pageRules,formRules:e.formRules,data:i,doc:e.doc});ut(e.formRoot,o,{ignoreActiveValue:t}),n.seed(e.formRoot),qe(e.formRoot,e.doc),hr(e),It(e),e.updateFingerprint&&e.updateFingerprint()}function oi({debounce:e=100,onRefresh:t}){let r=ie("Mutation");if(!r||typeof r.onAnyChange!="function")throw new Error("hypercms: a mutation hub is required (clay.Mutation or hyperclay.Mutation). Load clayjs or hyperclayjs, or just the mutation utility, before initializing hypercms.");let n=0,i=r.onAnyChange({debounce:e},()=>{n>0||t()});return{unsubscribe:typeof i=="function"?i:()=>{},pause(){n++},resume(){n=Math.max(0,n-1)}}}var Bs="[hypercms]";function si(e,t){if(!e||!e.querySelectorAll||!t)return;let r=Us(t);e.querySelectorAll("template[data-hcms-tpl]").forEach(i=>{let o=i.getAttribute("data-hcms-tpl");o&&(o.startsWith("@")||r.has(o)||console.warn(`${Bs} template "${o}" doesn't match any rule path; ignored`))})}function Us(e){let t=new Set;return r([],e),t;function r(n,i){let o=n.join("."),s=n.map(l=>typeof l=="number"?"*":l).join(".");o&&t.add(o),s&&t.add(s);let a=Ae(i);if(a==="object")for(let[l,c]of Object.entries(i))r([...n,l],c);else if(a==="object-array"||a==="scalar-array"){let l=[...n,"*"],c=l.map(m=>typeof m=="number"?"*":m).join(".");if(t.add(c),a==="object-array"){let m=i[1];if(m&&typeof m=="object"&&!Array.isArray(m))for(let[p,d]of Object.entries(m))r([...l,p],d)}}}}var ai="hcms-toggle",li="hcms-toggle-style",zs=`
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
`;function Hs({search:e="",cookie:t="",forced:r=null}={}){let n=typeof e=="string"?e:"",i=n.indexOf("?"),o=i===-1?n:n.slice(i+1),s=new URLSearchParams(o).get("editmode");return s?s==="true":r!=null?!!r:/(?:^|;\s*)isAdminOfCurrentResource=[^;]/.test(t)}function Vs({open:e,close:t,isOpen:r},n=document){let i=n.getElementById(ai);if(i)return i;if(!n.getElementById(li)){let s=n.createElement("style");s.id=li,s.setAttribute("snapshot-remove",""),s.textContent=zs,n.head.appendChild(s)}let o=n.createElement("button");return o.type="button",o.id=ai,o.setAttribute("no-save",""),o.setAttribute("snapshot-remove",""),o.setAttribute("save-ignore",""),o.setAttribute("aria-label","Toggle content editor"),o.innerHTML='<span class="hcms-toggle__open">Edit content</span><span class="hcms-toggle__close">Close editor</span>',o.addEventListener("click",async()=>{try{r()?t():await e()}catch(s){console.warn("hypercms: toggle failed to open the CMS",s)}}),n.body.appendChild(o),o}function ci(e){if(typeof window>"u"||typeof document>"u")return;let t=window.__hyperclayEditMode!=null?window.__hyperclayEditMode:null;if(!Hs({search:window.location.search,cookie:document.cookie,forced:t}))return;let r=()=>{document.body&&e.hasRules(document)&&Vs(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r()}function mi(e){ei(e)}var U={isOpen:!1,ctx:null,shell:null,opts:null};function ui(e,t){if(U.ctx!==e)return;let r=t==="livesync";t==="livesync"&&U.shell?.restoreChrome?.(),jt(e,{ignoreActiveValue:r})}var di=!1;function Ws(){if(di)return;let e=ie("onPrepareForSave");typeof e=="function"&&(e(t=>{let r=t&&t.querySelector&&t.querySelector("body");r&&r.classList.remove("hcms-open","hcms-overlay","hcms-side-left")}),di=!0)}function wr(e={}){if(U.isOpen){console.warn("cms.open() called while already open; ignoring");return}Ws();let t=e.pageRoot||(typeof document<"u"?document.body:null);if(!t)throw new Error("hypercms: no pageRoot available");let r=t.ownerDocument||(typeof document<"u"?document:null);if(!r)throw new Error("hypercms: no document available");let n=e.rules!==void 0?e.rules:"cms",i=ne.findRules(r,n);if(!i){let y=typeof n=="string"?`data-rules-name~="${n}"`:"the provided rules object";throw new Error(`hypercms: no rules found for ${y}`)}let o=e.richText!==!1,s=o?Et(i.rules,t):i.rules,a=i.tagNode;ht(r),kt(r,s),si(r,s);let l=vt(s,r),c=Nt(t,s),m=St(),p=ve(ne.extract(t,s,{skip:"[data-hcms-shell]",templateAttr:"cms-template",...m.hooks}),s),d=Rt(()=>ti({mountTo:e.mountTo||r.body,side:e.side||"right",overlay:!!e.overlay,showSaveButton:!!e.showSaveButton,title:e.title,eyebrow:e.eyebrow,theme:e.theme,doc:r})),u={doc:r,pageRoot:t,pageRules:s,formRules:l,rulesTagNode:a,rulesSource:n,richText:o,formRoot:d.formRoot,shellRoot:d.root,errorEl:d.errorEl,noticeEl:d.noticeEl,unresolved:c,lastTwinSignature:null,lastFingerprint:null,lastData:null,observerHandle:null,undoUnsub:null,livesyncUnsub:null,onChange:e.onChange,onError:e.onError,confirmRemove:e.confirmRemove,previouslyFocused:r.activeElement,dispatch(y,N){let R=r.defaultView&&r.defaultView.CustomEvent||(typeof CustomEvent<"u"?CustomEvent:null);if(!R)return;let F=new R(y,{bubbles:!0,cancelable:y==="hcms:change",detail:N});d.root.dispatchEvent(F)},onCloseRequested(){_r()}};u.updateFingerprint=()=>{u.lastFingerprint=tt(ae(u))};try{let y=xt({pageRules:s,formRules:l,data:p,doc:r});d.formRoot.appendChild(y),m.seed(d.formRoot),qe(d.formRoot,r),It(u),Yn(u),u.updateFingerprint(),u.observerHandle=oi({onRefresh:()=>jt(u)});let N=ie("undo");if(N&&typeof N.on=="function"){let F=()=>{if(U.ctx!==u)return;ui(u,"undo");let V=ve(ne.extract(u.pageRoot,u.pageRules,{skip:"[data-hcms-shell]",templateAttr:"cms-template"}),u.pageRules);tt(V)!==tt(u.lastData)&&(u.lastData=V,u.onChange?.(V,{path:"",structural:!1}))};N.on("undo",F),N.on("redo",F),u.undoUnsub=()=>{N.off("undo",F),N.off("redo",F)}}let R=()=>ui(u,"livesync");u.livesyncUnsub=lr(r,Vn,R),nt.ctx=u,Gs(r),Ks(d.root),U.isOpen=!0,U.ctx=u,U.shell=d,U.opts=e,u.dispatch("hcms:open",{pageRoot:t})}catch(y){throw u.observerHandle?.unsubscribe?.(),u.undoUnsub?.(),u.livesyncUnsub?.(),u.detachEvents?.(),nt.ctx===u&&(nt.ctx=null),Rt(()=>d.destroy()),U.isOpen=!1,U.ctx=null,U.shell=null,U.opts=null,y}}function Ks(e){let r=e.querySelector('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');r&&typeof r.focus=="function"&&r.focus()}var nt={ctx:null};function Gs(e){let t=e.defaultView||(typeof globalThis<"u"?globalThis:null);if(!t)return;let r=function(){let i=nt.ctx;if(i)return fr(i.formRoot),Pe("Reorder",()=>de(ae(i),{path:"",structural:!0},i))};typeof t.hypercmsCommit!="function"&&(t.hypercmsCommit=r),typeof globalThis<"u"&&typeof globalThis.hypercmsCommit!="function"&&(globalThis.hypercmsCommit=r)}var xr="cms";function Js(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);if(!n)return t;let i=new URLSearchParams(n);return i.get(xr)!=="true"?t:(i.set(xr,"false"),"?"+i.toString())}function Ys(e){let t=typeof e=="string"?e:"",r=t.indexOf("?"),n=r===-1?t:t.slice(r+1);return n?new URLSearchParams(n).get(xr)==="true":!1}function Zs(){if(typeof window>"u"||!window.location||!window.history||typeof window.history.replaceState!="function")return;let e=window.location.search,t=Js(e);t!==e&&window.history.replaceState(window.history.state,"",t+window.location.hash)}function _r(){if(!U.isOpen)return;let{ctx:e,shell:t}=U;e.closed=!0;for(let n of e.uploads||[])try{n.abort()}catch{}e.uploads?.clear();let r=e.previouslyFocused;if(e.dispatch("hcms:close",null),Zs(),e.observerHandle?.unsubscribe?.(),e.undoUnsub?.(),e.livesyncUnsub?.(),e.detachEvents?.(),Rt(()=>t.destroy()),U.isOpen=!1,U.ctx=null,U.shell=null,U.opts=null,nt.ctx=null,r&&typeof r.focus=="function")try{r.focus()}catch{}}function hi(){U.isOpen&&jt(U.ctx)}function Xs(){return U.isOpen}var Qs={getData(){return U.isOpen?ae(U.ctx):null},setValue(e,t){if(!U.isOpen)throw new Error("hypercms: cms is not open");let r=U.ctx,n=me(e),i=_e(r.pageRules,n);if(i===void 0)throw new Error(`hypercms: no rule at path "${e}"`);if(typeof i!="string"||i.endsWith("[]"))throw new Error(`hypercms: setValue requires a leaf scalar path; "${e}" is not a leaf`);let o=ea(r.formRoot,e);if(!o)throw new Error(`hypercms: no field element at path "${e}"`);ta(o,t,r.formRoot,e),de(ae(r),{path:e,structural:!1},r)},addItem(e){if(!U.isOpen)throw new Error("hypercms: cms is not open");mr(e,U.ctx)},removeItem(e){if(!U.isOpen)throw new Error("hypercms: cms is not open");let t=U.ctx,r=me(e);if(typeof r[r.length-1]!="number")throw new Error(`hypercms: removeItem requires an item path; "${e}" is not an array index`);let i=_e(t.pageRules,r.slice(0,-1));if(!(Array.isArray(i)||typeof i=="string"&&i.endsWith("[]")))throw new Error(`hypercms: removeItem requires an item path; parent of "${e}" is not an array`);let s=t.formRoot.querySelector(`[data-hcms-path="${Sr(e)}"]`);if(!s)throw new Error(`hypercms: no element at path "${e}"`);De(s,t)},refresh:hi,_commit(){if(!U.isOpen)return;let e=U.ctx;return fr(e.formRoot),Pe("Update",()=>de(ae(e),{path:"",structural:!0},e))}};function ea(e,t){let r=Sr(t),n=`[data-hcms-path="${r}"] input[data-hcms-field], [data-hcms-path="${r}"] textarea[data-hcms-field], [data-hcms-path="${r}"] select[data-hcms-field], [data-hcms-path="${r}"] img[data-hcms-field], [data-hcms-path="${r}"] a[data-hcms-field], [data-hcms-path="${r}"] [contenteditable][data-hcms-field], input[data-hcms-path="${r}"][data-hcms-field], textarea[data-hcms-path="${r}"][data-hcms-field], select[data-hcms-path="${r}"][data-hcms-field], img[data-hcms-path="${r}"][data-hcms-field], a[data-hcms-path="${r}"][data-hcms-field], [contenteditable][data-hcms-path="${r}"][data-hcms-field]`;return e.querySelector(n)}function ta(e,t,r,n){let i=(e.tagName||"").toUpperCase(),o=(e.getAttribute("type")||"").toLowerCase();if(i==="INPUT"&&o==="checkbox"){e.checked=t===!0||t==="true";return}if(i==="INPUT"&&o==="radio"){let s=Sr(n),a=r.querySelectorAll(`[data-hcms-path="${s}"][data-hcms-field][type="radio"], [data-hcms-path="${s}"] [data-hcms-field][type="radio"]`);a.length?a.forEach(l=>{l.checked=String(l.value)===String(t??"")}):e.checked=String(e.value)===String(t??"");return}if(i==="IMG"){e.src=t==null?"":String(t);return}if(i==="A"){e.href=t==null?"":String(t);return}if(e.hasAttribute&&e.hasAttribute("contenteditable")){e.innerHTML=t==null?"":String(t);return}if("value"in e){e.value=t==null?"":String(t);return}e.textContent=t==null?"":String(t)}var ra=250,na=1e4;function ia(){typeof window>"u"||typeof document>"u"||Ys(window.location?window.location.search:"")&&(U.isOpen||oa(()=>{if(!U.isOpen)try{wr()}catch(e){console.warn("hypercms: auto-open failed",e)}}))}function vr(){return!!document.body&&!!ie("Mutation")}function oa(e){if(vr()){queueMicrotask(e);return}let t=Date.now()+na,r=!1,n=null,i=null,o=()=>{r||(r=!0,n!==null&&clearInterval(n),i&&i())};function s(){if(U.isOpen){o();return}vr()&&(o(),e())}i=lr(document,Hn,s),n=setInterval(()=>{if(U.isOpen){o();return}if(vr()){o(),e();return}Date.now()>=t&&(o(),console.warn("hypercms: ?cms=true auto-open gave up \u2014 no mutation hub appeared. Load clayjs or hyperclayjs (or just the mutation utility) so the CMS can initialize."))},ra)}ia();ci({open:wr,close:_r,isOpen:Xs,hasRules:e=>!!ne.findRules(e,"cms")});var Ar={open:wr,close:_r,refresh:hi,api:Qs,get isOpen(){return U.isOpen},path:er,scaffold:Xe,morphForm:ut};function Sr(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):String(e).replace(/[^a-zA-Z0-9_\-.*]/g,t=>"\\"+t)}var pi=`/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css \u2014 DO NOT EDIT.
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
`;typeof window<"u"&&typeof document<"u"&&(function(){if(window.__mirk)return;window.__mirk=!0;let e='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>';document.addEventListener("click",r=>{let n=r.target.closest(".mirk-number__step");if(!n)return;let i=n.closest(".mirk-number").querySelector("input[type=number]");i&&(n.dataset.step==="up"?i.stepUp():i.stepDown(),i.dispatchEvent(new Event("change",{bubbles:!0})))}),document.addEventListener("input",r=>{let n=r.target.closest(".mirk-slider__input");n&&n.closest(".mirk-slider").style.setProperty("--mirk-value",`${n.value}%`)}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-file__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-file"),o=i.querySelector(".mirk-file__name");if(!o)return;let s=n.files[0],a=document.createElement("a");if(a.className="mirk-file__name",a.dataset.filled="",a.href=URL.createObjectURL(s),a.target="_blank",a.rel="noopener",a.textContent=s.name,o.replaceWith(a),!i.querySelector(".mirk-file__remove")){let l=document.createElement("button");l.type="button",l.className="mirk-file__remove",l.setAttribute("aria-label","Remove file"),l.innerHTML=e,a.after(l)}}),document.addEventListener("change",r=>{let n=r.target.closest(".mirk-image__input");if(!n||!n.files.length)return;let i=n.closest(".mirk-image"),o=i.querySelector(".mirk-image__preview");if(!o)return;let s=i.querySelector(".mirk-image__placeholder"),a=new FileReader;a.onload=l=>{o.src=l.target.result,o.removeAttribute("hidden"),s&&s.setAttribute("hidden",""),i.querySelector(".mirk-image__thumb")?.removeAttribute("hidden"),i.querySelector(".mirk-image__upload")?.setAttribute("hidden","")},a.readAsDataURL(n.files[0])}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-file__remove");if(n){let o=n.closest(".mirk-file"),s=o?.querySelector(".mirk-file__input"),a=o?.querySelector(".mirk-file__name");if(s&&(s.value=""),a){let l=document.createElement("span");l.className="mirk-file__name",l.textContent="No file chosen",a.replaceWith(l)}n.remove();return}let i=r.target.closest(".mirk-image__remove");if(i){let o=i.closest(".mirk-image"),s=o?.querySelector(".mirk-image__input"),a=o?.querySelector(".mirk-image__preview");s&&(s.value=""),a&&(a.removeAttribute("src"),a.setAttribute("hidden","")),o?.querySelector(".mirk-image__thumb")?.setAttribute("hidden",""),o?.querySelector(".mirk-image__upload")?.removeAttribute("hidden")}});function t(r,n){let i=document.createElement("span");i.textContent=r;let o=document.createElement("input");o.type="hidden",o.name="tags[]",o.value=r;let s=document.createElement("button");s.type="button",s.className="mirk-tags__remove",s.textContent="\xD7";let a=document.createElement("span");if(a.className="mirk-tags__chip",n){let l=document.createElement("span");l.className="mirk-tags__chip-inner",l.append(i,o,s),a.append(l)}else a.append(i,o,s);return a}document.addEventListener("keydown",r=>{let n=r.target.closest(".mirk-tags__input");if(!n)return;let i=n.closest(".mirk-tags");if(r.key==="Enter"||r.key===","){let o=n.value.trim();if(!o)return;r.preventDefault(),n.before(t(o,i.classList.contains("mirk-tags--round"))),n.value=""}else if(r.key==="Backspace"&&!n.value){let o=i.querySelectorAll(".mirk-tags__chip");o[o.length-1]?.remove()}}),document.addEventListener("click",r=>{let n=r.target.closest(".mirk-tags__remove");if(n){n.closest(".mirk-tags__chip").remove();return}let i=r.target.closest(".mirk-tags");i&&r.target===i&&i.querySelector(".mirk-tags__input")?.focus()}),document.addEventListener("click",r=>{let n=r.target.closest("[data-mirk-chip]");if(!n)return;let i=n.getAttribute("data-mirk-chip");if(i==="open")n.closest(".mirk-chip")?.classList.add("mirk-chip--open");else if(i==="collapse")n.closest(".mirk-chip")?.classList.remove("mirk-chip--open");else if(i==="changes"){let o=n.closest(".mirk-chip__panel")?.classList.toggle("is-changes");n.textContent=o?"(hide changes)":"(view changes)"}}),document.addEventListener("click",r=>{let n=r.target.closest("[data-copy-btn]");if(!n)return;let i=n.closest("[data-copy]");if(!i)return;let o=i.cloneNode(!0);o.querySelectorAll("[data-copy-btn]").forEach(l=>l.remove());let a=i.getAttribute("data-copy")==="text"?o.textContent.replace(/^\s+|\s+$/g,""):o.innerHTML.replace(/\s+data-copy(="[^"]*")?/g,"").replace(/^\s*\n/gm,"").trim();navigator.clipboard.writeText(a).then(()=>{let l=n.textContent;n.textContent="copied",n.dataset.copied="",setTimeout(()=>{n.textContent=l,delete n.dataset.copied},1200)}).catch(()=>{n.textContent="error",setTimeout(()=>{n.textContent="copy"},1200)})})})();mi(pi);var la=Ar,ca={cms:Ar};return _i(ua);})();

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
