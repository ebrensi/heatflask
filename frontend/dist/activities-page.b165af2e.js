function e(e,t,n,r){Object.defineProperty(e,t,{get:n,set:r,enumerable:!0,configurable:!0})}var t="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},n={},r={},i=t.parcelRequire1cb5;null==i&&((i=function(e){if(e in n)return n[e].exports;if(e in r){var t=r[e];delete r[e];var i={id:e,exports:{}};return n[e]=i,t.call(i.exports,i,i.exports),i.exports}var o=new Error("Cannot find module '"+e+"'");throw o.code="MODULE_NOT_FOUND",o}).register=function(e,t){r[e]=t},t.parcelRequire1cb5=i),i.register("kXevI",(function(t,n){var r,i;e(t.exports,"register",(function(){return r}),(function(e){return r=e})),e(t.exports,"resolve",(function(){return i}),(function(e){return i=e}));var o={};r=function(e){for(var t=Object.keys(e),n=0;n<t.length;n++)o[t[n]]=e[t[n]]},i=function(e){var t=o[e];if(null==t)throw new Error("Could not resolve bundle with id "+e);return t}})),i("kXevI").register(JSON.parse('{"8iTKF":"activities-page.b165af2e.js","liIPv":"strava_button.d874814d.png"}'));var o={};e(o,"decodeMultiStream",(function(){return se}),(function(e){return se=e}));var s={};function a(e){return"".concat(e<0?"-":"","0x").concat(Math.abs(e).toString(16).padStart(2,"0"))}e(s,"Decoder",(function(){return Q}),(function(e){return Q=e}));var c=function(e,t){this.type=e,this.data=t},u={};e(u,"DecodeError",(function(){return f}),(function(e){return f=e}));var h,l=(h=function(e,t){return(h=Object.setPrototypeOf||{__proto__:[]}instanceof Array&&function(e,t){e.__proto__=t}||function(e,t){for(var n in t)Object.prototype.hasOwnProperty.call(t,n)&&(e[n]=t[n])})(e,t)},function(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Class extends value "+String(t)+" is not a constructor or null");function n(){this.constructor=e}h(e,t),e.prototype=null===t?Object.create(t):(n.prototype=t.prototype,new n)}),f=function(e){function t(n){var r=e.call(this,n)||this,i=Object.create(t.prototype);return Object.setPrototypeOf(r,i),Object.defineProperty(r,"name",{configurable:!0,enumerable:!1,value:t.name}),r}return l(t,e),t}(Error);function d(e,t){return 4294967296*e.getInt32(t)+e.getUint32(t+4)}function p(e){var t=e.sec,n=e.nsec;if(t>=0&&n>=0&&t<=17179869183){if(0===n&&t<=4294967295){var r=new Uint8Array(4);return(s=new DataView(r.buffer)).setUint32(0,t),r}var i=t/4294967296,o=4294967295&t;r=new Uint8Array(8);return(s=new DataView(r.buffer)).setUint32(0,n<<2|3&i),s.setUint32(4,o),r}var s;r=new Uint8Array(12);return(s=new DataView(r.buffer)).setUint32(0,n),function(e,t,n){var r=Math.floor(n/4294967296),i=n;e.setUint32(t,r),e.setUint32(t+4,i)}(s,4,t),r}var y,v,g,w={type:-1,encode:function(e){var t,n,r,i;return e instanceof Date?p((t=e.getTime(),n=Math.floor(t/1e3),r=1e6*(t-1e3*n),i=Math.floor(r/1e9),{sec:n+i,nsec:r-1e9*i})):null},decode:function(e){var t=function(e){var t=new DataView(e.buffer,e.byteOffset,e.byteLength);switch(e.byteLength){case 4:return{sec:t.getUint32(0),nsec:0};case 8:var n=t.getUint32(0);return{sec:4294967296*(3&n)+t.getUint32(4),nsec:n>>>2};case 12:return{sec:d(t,4),nsec:t.getUint32(0)};default:throw new u.DecodeError("Unrecognized data size for timestamp (expected 4, 8, or 12): ".concat(e.length))}}(e);return new Date(1e3*t.sec+t.nsec/1e6)}},b=function(){function e(){this.builtInEncoders=[],this.builtInDecoders=[],this.encoders=[],this.decoders=[],this.register(w)}return e.prototype.register=function(e){var t=e.type,n=e.encode,r=e.decode;if(t>=0)this.encoders[t]=n,this.decoders[t]=r;else{var i=1+t;this.builtInEncoders[i]=n,this.builtInDecoders[i]=r}},e.prototype.tryToEncode=function(e,t){for(var n=0;n<this.builtInEncoders.length;n++){if(null!=(r=this.builtInEncoders[n]))if(null!=(i=r(e,t)))return new c(-1-n,i)}for(n=0;n<this.encoders.length;n++){var r,i;if(null!=(r=this.encoders[n]))if(null!=(i=r(e,t)))return new c(n,i)}return e instanceof c?e:null},e.prototype.decode=function(e,t,n){var r=t<0?this.builtInDecoders[-1-t]:this.decoders[t];return r?r(e,t,n):new c(t,e)},e.defaultCodec=new e,e}(),m=y={};function x(){throw new Error("setTimeout has not been defined")}function S(){throw new Error("clearTimeout has not been defined")}function k(e){if(v===setTimeout)return setTimeout(e,0);if((v===x||!v)&&setTimeout)return v=setTimeout,setTimeout(e,0);try{return v(e,0)}catch(t){try{return v.call(null,e,0)}catch(t){return v.call(this,e,0)}}}!function(){try{v="function"==typeof setTimeout?setTimeout:x}catch(e){v=x}try{g="function"==typeof clearTimeout?clearTimeout:S}catch(e){g=S}}();var E,U,T,I,L=[],B=!1,D=-1;function A(){B&&E&&(B=!1,E.length?L=E.concat(L):D=-1,L.length&&_())}function _(){if(!B){var e=k(A);B=!0;for(var t=L.length;t;){for(E=L,L=[];++D<t;)E&&E[D].run();D=-1,t=L.length}E=null,B=!1,function(e){if(g===clearTimeout)return clearTimeout(e);if((g===S||!g)&&clearTimeout)return g=clearTimeout,clearTimeout(e);try{g(e)}catch(t){try{return g.call(null,e)}catch(t){return g.call(this,e)}}}(e)}}function M(e,t){this.fun=e,this.array=t}function O(){}m.nextTick=function(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var n=1;n<arguments.length;n++)t[n-1]=arguments[n];L.push(new M(e,t)),1!==L.length||B||k(_)},M.prototype.run=function(){this.fun.apply(null,this.array)},m.title="browser",m.browser=!0,m.env={},m.argv=[],m.version="",m.versions={},m.on=O,m.addListener=O,m.once=O,m.off=O,m.removeListener=O,m.removeAllListeners=O,m.emit=O,m.prependListener=O,m.prependOnceListener=O,m.listeners=function(e){return[]},m.binding=function(e){throw new Error("process.binding is not supported")},m.cwd=function(){return"/"},m.chdir=function(e){throw new Error("process.chdir is not supported")},m.umask=function(){return 0};var P=(void 0===y||"never"!==(null===(U=null==y?void 0:y.env)||void 0===U?void 0:U.TEXT_ENCODING))&&"undefined"!=typeof TextEncoder&&"undefined"!=typeof TextDecoder;var C=P?new TextEncoder:void 0;P&&void 0!==y&&(null===(T=null==y?void 0:y.env)||void 0===T||T.TEXT_ENCODING);null==C||C.encodeInto;function R(e,t,n){for(var r=t,i=r+n,o=[],s="";r<i;){var a=e[r++];if(0==(128&a))o.push(a);else if(192==(224&a)){var c=63&e[r++];o.push((31&a)<<6|c)}else if(224==(240&a)){c=63&e[r++];var u=63&e[r++];o.push((31&a)<<12|c<<6|u)}else if(240==(248&a)){var h=(7&a)<<18|(c=63&e[r++])<<12|(u=63&e[r++])<<6|63&e[r++];h>65535&&(h-=65536,o.push(h>>>10&1023|55296),h=56320|1023&h),o.push(h)}else o.push(a);o.length>=4096&&(s+=String.fromCharCode.apply(String,o),o.length=0)}return o.length>0&&(s+=String.fromCharCode.apply(String,o)),s}var $=P?new TextDecoder:null,j=P?void 0!==y&&"force"!==(null===(I=null==y?void 0:y.env)||void 0===I?void 0:I.TEXT_DECODER)?200:0:4294967295;function F(e){return e instanceof Uint8Array?e:ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):e instanceof ArrayBuffer?new Uint8Array(e):Uint8Array.from(e)}var z=function(){function e(e,t){void 0===e&&(e=16),void 0===t&&(t=16),this.maxKeyLength=e,this.maxLengthPerKey=t,this.hit=0,this.miss=0,this.caches=[];for(var n=0;n<this.maxKeyLength;n++)this.caches.push([])}return e.prototype.canBeCached=function(e){return e>0&&e<=this.maxKeyLength},e.prototype.find=function(e,t,n){e:for(var r=0,i=this.caches[n-1];r<i.length;r++){for(var o=i[r],s=o.bytes,a=0;a<n;a++)if(s[a]!==e[t+a])continue e;return o.str}return null},e.prototype.store=function(e,t){var n=this.caches[e.length-1],r={bytes:e,str:t};n.length>=this.maxLengthPerKey?n[Math.random()*n.length|0]=r:n.push(r)},e.prototype.decode=function(e,t,n){var r=this.find(e,t,n);if(null!=r)return this.hit++,r;this.miss++;var i=R(e,t,n),o=Uint8Array.prototype.slice.call(e,t,t+n);return this.store(o,i),i},e}(),N=function(e,t,n,r){return new(n||(n=Promise))((function(i,o){function s(e){try{c(r.next(e))}catch(e){o(e)}}function a(e){try{c(r.throw(e))}catch(e){o(e)}}function c(e){var t;e.done?i(e.value):(t=e.value,t instanceof n?t:new n((function(e){e(t)}))).then(s,a)}c((r=r.apply(e,t||[])).next())}))},H=function(e,t){var n,r,i,o,s={label:0,sent:function(){if(1&i[0])throw i[1];return i[1]},trys:[],ops:[]};return o={next:a(0),throw:a(1),return:a(2)},"function"==typeof Symbol&&(o[Symbol.iterator]=function(){return this}),o;function a(o){return function(a){return function(o){if(n)throw new TypeError("Generator is already executing.");for(;s;)try{if(n=1,r&&(i=2&o[0]?r.return:o[0]?r.throw||((i=r.return)&&i.call(r),0):r.next)&&!(i=i.call(r,o[1])).done)return i;switch(r=0,i&&(o=[2&o[0],i.value]),o[0]){case 0:case 1:i=o;break;case 4:return s.label++,{value:o[1],done:!1};case 5:s.label++,r=o[1],o=[0];continue;case 7:o=s.ops.pop(),s.trys.pop();continue;default:if(!(i=s.trys,(i=i.length>0&&i[i.length-1])||6!==o[0]&&2!==o[0])){s=0;continue}if(3===o[0]&&(!i||o[1]>i[0]&&o[1]<i[3])){s.label=o[1];break}if(6===o[0]&&s.label<i[1]){s.label=i[1],i=o;break}if(i&&s.label<i[2]){s.label=i[2],s.ops.push(o);break}i[2]&&s.ops.pop(),s.trys.pop();continue}o=t.call(e,s)}catch(e){o=[6,e],r=0}finally{n=i=0}if(5&o[0])throw o[1];return{value:o[0]?o[1]:void 0,done:!0}}([o,a])}}},V=function(e){if(!Symbol.asyncIterator)throw new TypeError("Symbol.asyncIterator is not defined.");var t,n=e[Symbol.asyncIterator];return n?n.call(e):(e="function"==typeof __values?__values(e):e[Symbol.iterator](),t={},r("next"),r("throw"),r("return"),t[Symbol.asyncIterator]=function(){return this},t);function r(n){t[n]=e[n]&&function(t){return new Promise((function(r,i){(function(e,t,n,r){Promise.resolve(r).then((function(t){e({value:t,done:n})}),t)})(r,i,(t=e[n](t)).done,t.value)}))}}},K=function(e){return this instanceof K?(this.v=e,this):new K(e)},X=function(e,t,n){if(!Symbol.asyncIterator)throw new TypeError("Symbol.asyncIterator is not defined.");var r,i=n.apply(e,t||[]),o=[];return r={},s("next"),s("throw"),s("return"),r[Symbol.asyncIterator]=function(){return this},r;function s(e){i[e]&&(r[e]=function(t){return new Promise((function(n,r){o.push([e,t,n,r])>1||a(e,t)}))})}function a(e,t){try{(n=i[e](t)).value instanceof K?Promise.resolve(n.value.v).then(c,u):h(o[0][2],n)}catch(e){h(o[0][3],e)}var n}function c(e){a("next",e)}function u(e){a("throw",e)}function h(e,t){e(t),o.shift(),o.length&&a(o[0][0],o[0][1])}},q=new DataView(new ArrayBuffer(0)),G=new Uint8Array(q.buffer),W=function(){try{q.getInt8(0)}catch(e){return e.constructor}throw new Error("never reached")}(),J=new W("Insufficient data"),Y=new z,Q=function(){function e(e,t,n,r,i,o,s,a){void 0===e&&(e=b.defaultCodec),void 0===t&&(t=void 0),void 0===n&&(n=4294967295),void 0===r&&(r=4294967295),void 0===i&&(i=4294967295),void 0===o&&(o=4294967295),void 0===s&&(s=4294967295),void 0===a&&(a=Y),this.extensionCodec=e,this.context=t,this.maxStrLength=n,this.maxBinLength=r,this.maxArrayLength=i,this.maxMapLength=o,this.maxExtLength=s,this.keyDecoder=a,this.totalPos=0,this.pos=0,this.view=q,this.bytes=G,this.headByte=-1,this.stack=[]}return e.prototype.reinitializeState=function(){this.totalPos=0,this.headByte=-1,this.stack.length=0},e.prototype.setBuffer=function(e){this.bytes=F(e),this.view=function(e){if(e instanceof ArrayBuffer)return new DataView(e);var t=F(e);return new DataView(t.buffer,t.byteOffset,t.byteLength)}(this.bytes),this.pos=0},e.prototype.appendBuffer=function(e){if(-1!==this.headByte||this.hasRemaining(1)){var t=this.bytes.subarray(this.pos),n=F(e),r=new Uint8Array(t.length+n.length);r.set(t),r.set(n,t.length),this.setBuffer(r)}else this.setBuffer(e)},e.prototype.hasRemaining=function(e){return this.view.byteLength-this.pos>=e},e.prototype.createExtraByteError=function(e){var t=this.view,n=this.pos;return new RangeError("Extra ".concat(t.byteLength-n," of ").concat(t.byteLength," byte(s) found at buffer[").concat(e,"]"))},e.prototype.decode=function(e){this.reinitializeState(),this.setBuffer(e);var t=this.doDecodeSync();if(this.hasRemaining(1))throw this.createExtraByteError(this.pos);return t},e.prototype.decodeMulti=function(e){return H(this,(function(t){switch(t.label){case 0:this.reinitializeState(),this.setBuffer(e),t.label=1;case 1:return this.hasRemaining(1)?[4,this.doDecodeSync()]:[3,3];case 2:return t.sent(),[3,1];case 3:return[2]}}))},e.prototype.decodeAsync=function(e){var t,n,r,i;return N(this,void 0,void 0,(function(){var o,s,c,u,h,l,f,d;return H(this,(function(p){switch(p.label){case 0:o=!1,p.label=1;case 1:p.trys.push([1,6,7,12]),t=V(e),p.label=2;case 2:return[4,t.next()];case 3:if((n=p.sent()).done)return[3,5];if(c=n.value,o)throw this.createExtraByteError(this.totalPos);this.appendBuffer(c);try{s=this.doDecodeSync(),o=!0}catch(e){if(!(e instanceof W))throw e}this.totalPos+=this.pos,p.label=4;case 4:return[3,2];case 5:return[3,12];case 6:return u=p.sent(),r={error:u},[3,12];case 7:return p.trys.push([7,,10,11]),n&&!n.done&&(i=t.return)?[4,i.call(t)]:[3,9];case 8:p.sent(),p.label=9;case 9:return[3,11];case 10:if(r)throw r.error;return[7];case 11:return[7];case 12:if(o){if(this.hasRemaining(1))throw this.createExtraByteError(this.totalPos);return[2,s]}throw l=(h=this).headByte,f=h.pos,d=h.totalPos,new RangeError("Insufficient data in parsing ".concat(a(l)," at ").concat(d," (").concat(f," in the current buffer)"))}}))}))},e.prototype.decodeArrayStream=function(e){return this.decodeMultiAsync(e,!0)},e.prototype.decodeStream=function(e){return this.decodeMultiAsync(e,!1)},e.prototype.decodeMultiAsync=function(e,t){return X(this,arguments,(function(){var n,r,i,o,s,a,c,u,h;return H(this,(function(l){switch(l.label){case 0:n=t,r=-1,l.label=1;case 1:l.trys.push([1,13,14,19]),i=V(e),l.label=2;case 2:return[4,K(i.next())];case 3:if((o=l.sent()).done)return[3,12];if(s=o.value,t&&0===r)throw this.createExtraByteError(this.totalPos);this.appendBuffer(s),n&&(r=this.readArraySize(),n=!1,this.complete()),l.label=4;case 4:l.trys.push([4,9,,10]),l.label=5;case 5:return[4,K(this.doDecodeSync())];case 6:return[4,l.sent()];case 7:return l.sent(),0==--r?[3,8]:[3,5];case 8:return[3,10];case 9:if(!((a=l.sent())instanceof W))throw a;return[3,10];case 10:this.totalPos+=this.pos,l.label=11;case 11:return[3,2];case 12:return[3,19];case 13:return c=l.sent(),u={error:c},[3,19];case 14:return l.trys.push([14,,17,18]),o&&!o.done&&(h=i.return)?[4,K(h.call(i))]:[3,16];case 15:l.sent(),l.label=16;case 16:return[3,18];case 17:if(u)throw u.error;return[7];case 18:return[7];case 19:return[2]}}))}))},e.prototype.doDecodeSync=function(){e:for(;;){var e=this.readHeadByte(),t=void 0;if(e>=224)t=e-256;else if(e<192)if(e<128)t=e;else if(e<144){if(0!==(r=e-128)){this.pushMapState(r),this.complete();continue e}t={}}else if(e<160){if(0!==(r=e-144)){this.pushArrayState(r),this.complete();continue e}t=[]}else{var n=e-160;t=this.decodeUtf8String(n,0)}else if(192===e)t=null;else if(194===e)t=!1;else if(195===e)t=!0;else if(202===e)t=this.readF32();else if(203===e)t=this.readF64();else if(204===e)t=this.readU8();else if(205===e)t=this.readU16();else if(206===e)t=this.readU32();else if(207===e)t=this.readU64();else if(208===e)t=this.readI8();else if(209===e)t=this.readI16();else if(210===e)t=this.readI32();else if(211===e)t=this.readI64();else if(217===e){n=this.lookU8();t=this.decodeUtf8String(n,1)}else if(218===e){n=this.lookU16();t=this.decodeUtf8String(n,2)}else if(219===e){n=this.lookU32();t=this.decodeUtf8String(n,4)}else if(220===e){if(0!==(r=this.readU16())){this.pushArrayState(r),this.complete();continue e}t=[]}else if(221===e){if(0!==(r=this.readU32())){this.pushArrayState(r),this.complete();continue e}t=[]}else if(222===e){if(0!==(r=this.readU16())){this.pushMapState(r),this.complete();continue e}t={}}else if(223===e){if(0!==(r=this.readU32())){this.pushMapState(r),this.complete();continue e}t={}}else if(196===e){var r=this.lookU8();t=this.decodeBinary(r,1)}else if(197===e){r=this.lookU16();t=this.decodeBinary(r,2)}else if(198===e){r=this.lookU32();t=this.decodeBinary(r,4)}else if(212===e)t=this.decodeExtension(1,0);else if(213===e)t=this.decodeExtension(2,0);else if(214===e)t=this.decodeExtension(4,0);else if(215===e)t=this.decodeExtension(8,0);else if(216===e)t=this.decodeExtension(16,0);else if(199===e){r=this.lookU8();t=this.decodeExtension(r,1)}else if(200===e){r=this.lookU16();t=this.decodeExtension(r,2)}else{if(201!==e)throw new u.DecodeError("Unrecognized type byte: ".concat(a(e)));r=this.lookU32();t=this.decodeExtension(r,4)}this.complete();for(var i=this.stack;i.length>0;){var o=i[i.length-1];if(0===o.type){if(o.array[o.position]=t,o.position++,o.position!==o.size)continue e;i.pop(),t=o.array}else{if(1===o.type){if(s=void 0,"string"!==(s=typeof t)&&"number"!==s)throw new u.DecodeError("The type of key must be string or number but "+typeof t);if("__proto__"===t)throw new u.DecodeError("The key __proto__ is not allowed");o.key=t,o.type=2;continue e}if(o.map[o.key]=t,o.readCount++,o.readCount!==o.size){o.key=null,o.type=1;continue e}i.pop(),t=o.map}}return t}var s},e.prototype.readHeadByte=function(){return-1===this.headByte&&(this.headByte=this.readU8()),this.headByte},e.prototype.complete=function(){this.headByte=-1},e.prototype.readArraySize=function(){var e=this.readHeadByte();switch(e){case 220:return this.readU16();case 221:return this.readU32();default:if(e<160)return e-144;throw new u.DecodeError("Unrecognized array type byte: ".concat(a(e)))}},e.prototype.pushMapState=function(e){if(e>this.maxMapLength)throw new u.DecodeError("Max length exceeded: map length (".concat(e,") > maxMapLengthLength (").concat(this.maxMapLength,")"));this.stack.push({type:1,size:e,key:null,readCount:0,map:{}})},e.prototype.pushArrayState=function(e){if(e>this.maxArrayLength)throw new u.DecodeError("Max length exceeded: array length (".concat(e,") > maxArrayLength (").concat(this.maxArrayLength,")"));this.stack.push({type:0,size:e,array:new Array(e),position:0})},e.prototype.decodeUtf8String=function(e,t){var n;if(e>this.maxStrLength)throw new u.DecodeError("Max length exceeded: UTF-8 byte length (".concat(e,") > maxStrLength (").concat(this.maxStrLength,")"));if(this.bytes.byteLength<this.pos+t+e)throw J;var r,i=this.pos+t;return r=this.stateIsMapKey()&&(null===(n=this.keyDecoder)||void 0===n?void 0:n.canBeCached(e))?this.keyDecoder.decode(this.bytes,i,e):e>j?function(e,t,n){var r=e.subarray(t,t+n);return $.decode(r)}(this.bytes,i,e):R(this.bytes,i,e),this.pos+=t+e,r},e.prototype.stateIsMapKey=function(){return this.stack.length>0&&1===this.stack[this.stack.length-1].type},e.prototype.decodeBinary=function(e,t){if(e>this.maxBinLength)throw new u.DecodeError("Max length exceeded: bin length (".concat(e,") > maxBinLength (").concat(this.maxBinLength,")"));if(!this.hasRemaining(e+t))throw J;var n=this.pos+t,r=this.bytes.subarray(n,n+e);return this.pos+=t+e,r},e.prototype.decodeExtension=function(e,t){if(e>this.maxExtLength)throw new u.DecodeError("Max length exceeded: ext length (".concat(e,") > maxExtLength (").concat(this.maxExtLength,")"));var n=this.view.getInt8(this.pos+t),r=this.decodeBinary(e,t+1);return this.extensionCodec.decode(r,n,this.context)},e.prototype.lookU8=function(){return this.view.getUint8(this.pos)},e.prototype.lookU16=function(){return this.view.getUint16(this.pos)},e.prototype.lookU32=function(){return this.view.getUint32(this.pos)},e.prototype.readU8=function(){var e=this.view.getUint8(this.pos);return this.pos++,e},e.prototype.readI8=function(){var e=this.view.getInt8(this.pos);return this.pos++,e},e.prototype.readU16=function(){var e=this.view.getUint16(this.pos);return this.pos+=2,e},e.prototype.readI16=function(){var e=this.view.getInt16(this.pos);return this.pos+=2,e},e.prototype.readU32=function(){var e=this.view.getUint32(this.pos);return this.pos+=4,e},e.prototype.readI32=function(){var e=this.view.getInt32(this.pos);return this.pos+=4,e},e.prototype.readU64=function(){var e,t,n=(e=this.view,t=this.pos,4294967296*e.getUint32(t)+e.getUint32(t+4));return this.pos+=8,n},e.prototype.readI64=function(){var e=d(this.view,this.pos);return this.pos+=8,e},e.prototype.readF32=function(){var e=this.view.getFloat32(this.pos);return this.pos+=4,e},e.prototype.readF64=function(){var e=this.view.getFloat64(this.pos);return this.pos+=8,e},e}(),Z={};e(Z,"ensureAsyncIterable",(function(){return ie}),(function(e){return ie=e}));var ee=function(e,t){var n,r,i,o,s={label:0,sent:function(){if(1&i[0])throw i[1];return i[1]},trys:[],ops:[]};return o={next:a(0),throw:a(1),return:a(2)},"function"==typeof Symbol&&(o[Symbol.iterator]=function(){return this}),o;function a(o){return function(a){return function(o){if(n)throw new TypeError("Generator is already executing.");for(;s;)try{if(n=1,r&&(i=2&o[0]?r.return:o[0]?r.throw||((i=r.return)&&i.call(r),0):r.next)&&!(i=i.call(r,o[1])).done)return i;switch(r=0,i&&(o=[2&o[0],i.value]),o[0]){case 0:case 1:i=o;break;case 4:return s.label++,{value:o[1],done:!1};case 5:s.label++,r=o[1],o=[0];continue;case 7:o=s.ops.pop(),s.trys.pop();continue;default:if(!(i=s.trys,(i=i.length>0&&i[i.length-1])||6!==o[0]&&2!==o[0])){s=0;continue}if(3===o[0]&&(!i||o[1]>i[0]&&o[1]<i[3])){s.label=o[1];break}if(6===o[0]&&s.label<i[1]){s.label=i[1],i=o;break}if(i&&s.label<i[2]){s.label=i[2],s.ops.push(o);break}i[2]&&s.ops.pop(),s.trys.pop();continue}o=t.call(e,s)}catch(e){o=[6,e],r=0}finally{n=i=0}if(5&o[0])throw o[1];return{value:o[0]?o[1]:void 0,done:!0}}([o,a])}}},te=function(e){return this instanceof te?(this.v=e,this):new te(e)},ne=function(e,t,n){if(!Symbol.asyncIterator)throw new TypeError("Symbol.asyncIterator is not defined.");var r,i=n.apply(e,t||[]),o=[];return r={},s("next"),s("throw"),s("return"),r[Symbol.asyncIterator]=function(){return this},r;function s(e){i[e]&&(r[e]=function(t){return new Promise((function(n,r){o.push([e,t,n,r])>1||a(e,t)}))})}function a(e,t){try{(n=i[e](t)).value instanceof te?Promise.resolve(n.value.v).then(c,u):h(o[0][2],n)}catch(e){h(o[0][3],e)}var n}function c(e){a("next",e)}function u(e){a("throw",e)}function h(e,t){e(t),o.shift(),o.length&&a(o[0][0],o[0][1])}};function re(e){if(null==e)throw new Error("Assertion Failure: value must not be null nor undefined")}function ie(e){return null!=e[Symbol.asyncIterator]?e:function(e){return ne(this,arguments,(function(){var t,n,r,i;return ee(this,(function(o){switch(o.label){case 0:t=e.getReader(),o.label=1;case 1:o.trys.push([1,,9,10]),o.label=2;case 2:return[4,te(t.read())];case 3:return n=o.sent(),r=n.done,i=n.value,r?[4,te(void 0)]:[3,5];case 4:return[2,o.sent()];case 5:return re(i),[4,te(i)];case 6:return[4,o.sent()];case 7:return o.sent(),[3,2];case 8:return[3,10];case 9:return t.releaseLock(),[7];case 10:return[2]}}))}))}(e)}var oe={};function se(e,t){void 0===t&&(t=oe);var n=Z.ensureAsyncIterable(e);return new s.Decoder(t.extensionCodec,t.context,t.maxStrLength,t.maxBinLength,t.maxArrayLength,t.maxMapLength,t.maxExtLength).decodeStream(n)}function ae(e,t){let n=String(e);for(;n.length<(t||2);)n="0"+n;return n}function ce(e,t=20,n=20,r=""){return`<img loading=lazy src='${e}' width=${t}px height=${n}px alt="${r}">`}function ue(e,t){return`<a href='${e}' target='_blank'>${t}</a>`}function he(e,t=""){return`<i class="hf-${e} ${t}"></i>`}const le={AlpineSki:["speed","#800080",he("skiing")],BackcountrySki:["speed","#800080",he("xc-ski")],Canoeing:["speed","#fa8080",he("canoe")],Crossfit:[null,null,he("crossfit")],EBikeRide:["speed","#0000cd",he("motorcycle")],Elliptical:[null,null],Golf:[null,null,he("golf")],Handcycle:["speed","#2b60de",he("handbike")],Hike:["pace","#ff1493",he("hiking")],IceSkate:["speed","#663399",he("skating")],InlineSkate:["speed","#8a2be2",he("inline-skating")],Kayaking:["speed","#ffa500",he("kayak")],Kitesurf:["speed","#00ff00",he("kitesurf")],NordicSki:["speed","#800080",he("skiing-nordic")],Ride:["speed","#2b60de",he("bicycle")],RockClimbing:[null,"#4b0082",he("climbing")],RollerSki:["speed","#800080",he("roller-ski")],Rowing:["speed","#fa8072",he("rowing")],Run:["pace","#ff0000",he("running")],Sail:["speed","#8a2be2",he("sailboat")],Skateboard:["speed","#800080",he("skateboarding")],Snowboard:["speed","#00ff00",he("snowboarding")],Snowshoe:["pace","#800080",he("snowshoes")],Soccer:["pace","#8a2be2",he("soccer")],StairStepper:["pace",null,he("stairs")],StandUpPaddling:["speed","#800080",he("sup-paddle")],Surfing:["speed","#006400",he("surf")],Swim:["speed","#00ff7f",he("swimming")],Velomobile:["speed",null,null],VirtualRide:["speed","#1e90ff",he("spinning")],VirtualRun:["pace",null,he("treadmill")],Walk:["pace","#ff00ff",he("walking")],WeightTraining:[null,null,he("weights")],Wheelchair:["speed","#2b60de",he("wheelchair")],Windsurf:["speed","#4b0082",he("windsurf")],Workout:[null,null,"#4b0082",he("activity")],Yoga:[null,null,he("meditate")],undefined:["speed",null,he("activity")]};function fe(e){return le[e][2]||e}Object.keys(le),(()=>{const e={};let t=0;for(const n of Object.keys(le))e[n]=t++})();var de;de=new URL(i("kXevI").resolve("liIPv"),import.meta.url).toString();const pe=new URL(de),ye=document.getElementById("status_msg"),ve=document.getElementById("count"),ge=document.getElementById("activity_list"),we=document.getElementById("runtime_json").innerText,be=JSON.parse(we),me=be.atypes,xe=!be.query_obj.user_id;function Se(e,t){if(!e||!t)return"";return ue(`/${e}`,ce(t,40,40,e))}const ke=ce(pe),Ee="metric"==window.localStorage.getItem("units"),Ue=Ee?.001:1/1609.34,Te=Ee?"km":"mi",Ie=Ee?1:3.28084,Le=Ee?"m":"ft";function Be(){const e=[he("calendar1")+" "+he("link"),he("external"),he("activity"),he("user-secret"),he("stopwatch"),`${he("road1")} (${Te})`,`${he("rocket")} (${Le})`,he("pencil")];return xe?[he("user")].concat(e):e}const De=he("eye-blocked"),Ae=he("eye");async function _e(){ve.classList.add("spinner");const e=await fetch(be.query_url,{method:"POST",headers:{Accept:"application/msgpack","Content-Type":"application/msgpack"},body:JSON.stringify(be.query_obj)}),t=[];let n,r=0;const i=[];for await(const s of o.decodeMultiStream(e.body))"msg"in s?ye.innerText=s.msg:"count"in s?(n=s.count,t[n-1]=void 0,t.fill(r,n,void 0),ye.innerText="Fetching activities..."):"error"in s?i.push(s.error):(t[r]=Me(s),ve.innerText=r++);var s;console.time("buildTable"),function(e,t){const n=`<thead><th>${Be().join("</th><th>")}</th></thead>\n`;if(t.length){const r=`<tbody>\n${t.map((e=>`<tr><td>${e.join("</td><td>")}</td></tr>`)).join("\n")}\n</tbody>`;e.innerHTML=n+r}else e.innerHTML=n+"<tr>Sorry no data &#128577</tr>"}(ge,t),console.timeEnd("buildTable"),ye.innerText="",ve.innerText="",await(s=.2,new Promise((e=>window.setTimeout(e,s)))),ve.classList.remove("spinner")}function Me(e){const t=e._id,n=`/?id=${t}`,r=ue(""+`https://www.strava.com/activities/${t}`,ke),i=new Date(1e3*(e.s+e.o)).toLocaleString(),o=(e.D*Ue).toFixed(2),s=function(e){let t=e;const n=ae(Math.floor(t/3600),2);return t%=3600,`${n}:${ae(Math.floor(t/60),2)}:${ae(Math.round(t%60),2)}`}(e.T),a=(e["+"]*Ie).toFixed(2);const c=me[e.t]||`${e.t}*`,u=e.p?De:Ae;return xe?[Se(e.U,e.profile),ue(n,i),r,fe(c),u,s,o,a,e.N]:[ue(n,i),r,fe(c),u,s,o,a,e.N]}(async()=>{try{await _e()}catch(e){console.log("oops. ",e)}})();
//# sourceMappingURL=activities-page.b165af2e.js.map
