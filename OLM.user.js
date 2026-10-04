// ==UserScript==
// @name         OLM GOD MODE v1.6 - Thiên Tai Tù Tội (VIP LOADER)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Hệ thống tự động hóa OLM. Kéo code ngầm từ KeyVault Server với cache thông minh, auto-update. v1.8: Fix false positive ACCESS DENIED trên mobile. v1.9: Hỗ trợ code mã hoá AES-256 từ server (nhập License Key + AES Key như Violentmonkey Loader).
// @author       Thiên Tai Tù Tội 
// @match        *://olm.vn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// ==/UserScript==

'use strict';

/* ============================================================
   BẢO VỆ SINGLE-INSTANCE — Phát hiện & ngắt nếu có script VM thứ 2
   - Dùng một "token" duy nhất được ghi vào unsafeWindow ngay khi chạy
   - Nếu token đã tồn tại → nghĩa là script này đã chạy trước đó
     (hoặc một bản clone/script thứ 2 đang cố khởi động)
   - Lập tức xóa sạch mọi cache GM, sessionStorage, và dừng hoàn toàn
   ============================================================ */
(function _singleInstanceGuard() {
    'use strict';

    // Token ẩn đặt trên unsafeWindow để các script cùng trang đều thấy
    const _TOKEN_KEY  = '__olm_si_' + btoa('god_mode_guard').replace(/=/g,'') + '__';
    const _TOKEN_TS   = '__olm_si_ts__';

    // Hàm xóa sạch toàn bộ dấu vết
    function _purgeAllTraces() {
        // 1. Xóa GM cache
        const _GM_KEYS = [
            '__olm_kv_code__auto', '__olm_kv_meta__auto',
            '__olm_kv_code__', '__olm_kv_meta__',
            '__olm_kv_k1b__'
        ];
        _GM_KEYS.forEach(function(k) {
            try { GM_deleteValue(k); } catch(_) {}
        });
        // Xóa thêm key động theo SNIPPET_ID nếu có
        try {
            const sid = (typeof SNIPPET_ID !== 'undefined' && SNIPPET_ID) ? SNIPPET_ID : 'auto';
            GM_deleteValue('__olm_kv_code__' + sid);
            GM_deleteValue('__olm_kv_meta__' + sid);
        } catch(_) {}

        // 2. Xóa sessionStorage / localStorage
        try {
            const _ssKeys = Object.keys(sessionStorage);
            _ssKeys.forEach(function(k) {
                if (k.includes('olm') || k.includes('tiep') || k.includes('kv') || k.includes('loader')) {
                    sessionStorage.removeItem(k);
                }
            });
        } catch(_) {}
        try {
            const _lsKeys = Object.keys(localStorage);
            _lsKeys.forEach(function(k) {
                if (k.includes('olm') || k.includes('tiep') || k.includes('kv')) {
                    localStorage.removeItem(k);
                }
            });
        } catch(_) {}

        // 3. Xóa token trên unsafeWindow
        try {
            delete unsafeWindow[_TOKEN_KEY];
            delete unsafeWindow[_TOKEN_TS];
        } catch(_) {}

        // 4. Đóng băng network
        try {
            var _noop = function() { return new Promise(function(){}); };
            unsafeWindow.fetch = _noop;
        } catch(_) {}
        try {
            var _deadXHR = function(){
                return {open:function(){},send:function(){},setRequestHeader:function(){},
                        addEventListener:function(){},abort:function(){},getAllResponseHeaders:function(){return '';}};
            };
            unsafeWindow.XMLHttpRequest = _deadXHR;
        } catch(_) {}
    }

    // --- Kiểm tra xem script thứ 2 đã chạy chưa ---
    try {
        var _existing = unsafeWindow[_TOKEN_KEY];
        if (_existing === true) {
            // Script thứ 2 hoặc clone đang cố khởi động → kích hoạt self-destruct
            _purgeAllTraces();
            // Throw để dừng hoàn toàn phần còn lại của loader này
            throw new Error('DUPLICATE_SCRIPT_BLOCKED');
        }
    } catch(e) {
        if (e && e.message === 'DUPLICATE_SCRIPT_BLOCKED') {
            // Re-throw để dừng toàn bộ file
            throw e;
        }
        // Các lỗi khác (unsafeWindow không truy cập được, v.v.) → bỏ qua, tiếp tục
    }

    // --- Đây là lần đầu chạy → đặt token ---
    try {
        unsafeWindow[_TOKEN_KEY] = true;
        unsafeWindow[_TOKEN_TS]  = Date.now();
    } catch(_) {}

    // --- Lắng nghe nếu script khác cố ghi đè token ---
    try {
        var _originalToken = true;
        Object.defineProperty(unsafeWindow, _TOKEN_KEY, {
            get: function() { return _originalToken; },
            set: function(v) {
                // Script thứ 2 cố ghi đè token → kích hoạt purge trên bản đó
                // Không cho phép ghi đè
                _purgeAllTraces();
            },
            configurable: false
        });
    } catch(_) {
        // Nếu defineProperty thất bại, token vẫn được set ở trên → vẫn bảo vệ được
    }

})();

/* ============================================================
   CHUNK LOADING — XOR split/join trong memory
   Server phải trả { chunks: ["hex1","hex2",...], key: number }
   hoặc trả { code/content: "..." } như cũ (tự động fallback)
   ============================================================ */
function _xorHexDecode(hexStr, key) {
    // hexStr: chuỗi hex, key: số 0-255
    let out = '';
    for (let i = 0; i < hexStr.length; i += 2) {
        const byte = parseInt(hexStr.substr(i, 2), 16) ^ key;
        out += String.fromCharCode(byte);
    }
    return out;
}

function _assembleChunks(chunks, key) {
    // Ghép các chunk, XOR từng chunk với key, trả về code hoàn chỉnh
    let full = '';
    for (let i = 0; i < chunks.length; i++) {
        full += _xorHexDecode(chunks[i], key);
        chunks[i] = null; // Xóa ngay chunk đã dùng
    }
    return full;
}

function _extractCode(cRes) {
    // Hỗ trợ cả 2 format: chunk mới và code string cũ
    // [v1.9] Server mã hoá snippet → trả { code:null, encCode:"<base64>" }.
    //        Giữ nguyên blob mã hoá (cache cũng lưu dạng mã hoá), chỉ giải mã ngay trước khi inject.
    if (cRes && typeof cRes.encCode === 'string' && cRes.encCode.length > 0) {
        return cRes.encCode;
    }
    if (cRes && Array.isArray(cRes.chunks) && typeof cRes.key === 'number') {
        const code = _assembleChunks(cRes.chunks, cRes.key);
        cRes.chunks = null;
        cRes.key = null;
        return code;
    }
    return (cRes && (cRes.code || cRes.content)) || null;
}

/* ============================================================
   [v1.9] KEYVAULT DECRYPT — kéo & chạy code MÃ HOÁ từ server
   ------------------------------------------------------------
   Server (index.js) mã hoá snippet ngay khi upload:
     code gốc → XOR(k2) → AES-256-CBC(k1 = k1a‖k1b, iv) → base64 = "encCode"
   • k1a, iv, k2 : nhúng sẵn trong loader (KEY BLOCK bên dưới —
                   chính là khối khoá của Violentmonkey Loader)
   • k1b         : server chỉ trả khi License Key còn hạn
                   (POST /api/snippet-key)
   Luồng: License Key → AES Key Gate → k1b → giải mã → inject như cũ.
   Toàn bộ phần còn lại của loader giữ nguyên.
   ============================================================ */
const OLM_USE_AES_GATE = true;            // false = bỏ bước nhập AES 64-bit Key
const _K1B_TTL_MS      = 60 * 60 * 1000;  // nhớ k1b 1 giờ (0 = hỏi server mỗi lần tải trang)
const _KEY_K1B         = '__olm_kv_k1b__';

/* >>> KEY BLOCK — khi server đổi key: GET /api/admin/encryption-keys
       rồi dán đè 3 đoạn k1a_code / iv_code / k2_code vào đây <<< */
const _4efdd2=[(27+18),(6+46),(13+41),(167+24),(104+34),(130+38),(78+40),(74+11)];
const _e2470c=254;
const _4667ca=[(97+50),(33+186),(86+37),(96+22),(44+121),(78+67),(144+94),(4+52)];
const _70ee6e=276;
const _EK1a=[..._4efdd2,..._4667ca].map(n=>n.toString(16).padStart(2,'0')).join('');
const _32d0c9=[(6+61),(21+8),(13+224),(15+5),(25+5),(28+19),(39+170),(26+13)];
const _d093c2=251;
const _fddc09=[(1+7),(35+216),(97+80),(60+66),(69+57),(31+48),(118+1),(88+98)];
const _5988ef=695;
const _EIV=[..._32d0c9,..._fddc09].map(n=>n.toString(16).padStart(2,'0')).join('');
const _186068=[(6+23),(55+61),(12+45),(122+91),(130+35),(29+41),(60+0),(190+4),(75+3),(13+13),(7+67),(106+99),(125+78),(30+4),(23+88),(39+29),(156+74),(65+26),(68+61),(23+86),(25+39),(101+61),(74+114),(10+61),(96+47),(0+15),(14+235),(13+161),(29+23),(46+39),(138+63),(79+139)];
const _e300cc=112;
const _3a09d2=[(49+104),(46+11),(133+63),(57+151),(90+144),(118+34),(215+31),(81+74),(15+40),(47+10),(30+53),(63+37),(13+141),(46+67),(59+53),(16+14),(13+20),(134+8),(33+189),(84+41),(42+199),(32+120),(4+16),(108+11),(21+0),(30+78),(108+59),(73+24),(100+71),(32+84),(135+106),(141+90)];
const _d36130=426;
const _EK2=[..._186068,..._3a09d2].map(n=>n.toString(16).padStart(2,'0')).join('');
/* <<< HẾT KEY BLOCK <<< */

/* >>> AES GATE KEY BLOCK — lấy từ Violentmonkey Loader (ô "AES 64-bit Key") <<< */
const _kxppw9=[85,67,146,181,252,53,248,31];
const _ka1=[237,222,124,5,87,214,40,0].map((b,i)=>b^_kxppw9[i]);
const _kxrx4c=[30,157,92,14,64,233,122,13];
const _ka2=[106,21,252,89,136,31,31,45].map((b,i)=>b^_kxrx4c[i]);
const _kxj323=[148,83,95,114,243,58,18,7];
const _ka3=[78,250,43,221,53,73,103,230].map((b,i)=>b^_kxj323[i]);
const _kxsnm9=[251,209,142,140,92,19,215,139];
const _ka4=[80,33,73,114,162,111,243,7].map((b,i)=>b^_kxsnm9[i]);
const _kvAesGateKey=[..._ka1,..._ka2,..._ka3,..._ka4].map(b=>b.toString(16).padStart(2,'0')).join('');
/* <<< HẾT AES GATE KEY BLOCK <<< */

/* >>> AUTO AES KEY — loader tự dùng key này, không còn hộp thoại nhập AES 64-bit Key <<< */
const _KV_AUTO_AES_KEY = 'b89deeb0abe3d01f7488a057c8f66520daa974afc67375e1abf0c7fefe7c248c';
/* <<< HẾT AUTO AES KEY <<< */

function _hexToBytes(h) {
    const b = new Uint8Array(h.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
}

// Blob base64 thuần (không có ký tự của JS như ( ) ; { }) → là code đã mã hoá
function _isEncPayload(s) {
    return typeof s === 'string' && s.length > 64 && /^[A-Za-z0-9+\/=\s]+$/.test(s);
}

function _kvErr(msg, flags) {
    const e = new Error(msg);
    if (flags) Object.keys(flags).forEach(function(k) { e[k] = flags[k]; });
    return e;
}

function _kvGetStr(k) {
    try { const v = GM_getValue(k, ''); return typeof v === 'string' ? v : ''; } catch (_) { return ''; }
}

function _kvPrompt(msg) {
    try { return (typeof prompt === 'function' ? (prompt(msg) || '') : '').trim(); } catch (_) { return ''; }
}

function _kvToast(msg, ms) {
    function show() {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;bottom:12px;right:12px;background:rgba(239,83,80,.95);color:#fff;'
                + 'padding:10px 14px;border-radius:8px;font-size:11px;z-index:2147483647;max-width:300px;'
                + 'line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.5);font-family:system-ui,sans-serif';
            d.textContent = msg;
            (document.body || document.documentElement).appendChild(d);
            setTimeout(function() { d.remove(); }, ms || 12000);
        } catch (_) {}
    }
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
}

function _gmPostJSON(url, bodyObj, timeoutMs) {
    return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
            data: JSON.stringify(bodyObj),
            timeout: timeoutMs || 30000,
            onload: function(r) { resolve(r); },
            onerror: function(e) { reject(new Error('Network error: ' + ((e && e.statusText) || 'unknown'))); },
            ontimeout: function() { reject(new Error('Request timeout')); },
            onabort: function() { reject(new Error('Request aborted')); }
        });
    });
}

const _LIC_REASON = { expired: 'đã hết hạn', banned: 'đã bị khoá', key_not_found: 'không tồn tại', missing_key: 'đang trống' };

/* k1b = ½ sau của AES key. Có cache còn hạn → dùng luôn (giữ tốc độ inject như bản cũ,
   và tránh giới hạn 20 request/phút/IP của /api/snippet-key). */
async function _kvGetK1b(lic) {
    let cached = null;
    try { const raw = GM_getValue(_KEY_K1B, null); cached = raw ? JSON.parse(raw) : null; } catch (_) {}
    const haveCache = !!(cached && typeof cached.v === 'string' && /^[0-9a-f]{32}$/i.test(cached.v));
    if (haveCache && Date.now() - cached.t < _K1B_TTL_MS) return cached.v;

    const MAX = 4;
    let lastErr = null;
    for (let i = 1; i <= MAX; i++) {
        try {
            // Có k1b cũ thì chỉ chờ tối đa 8s rồi dùng tạm — không để trang đứng chờ Render khởi động
            const r = await _gmPostJSON(SERVER_BASE + '/api/snippet-key', { key: lic }, haveCache ? 8000 : 30000);
            let j = null;
            try { j = JSON.parse(r.responseText); } catch (_) {}

            if (r.status === 403 || (j && j.error === 'invalid_key')) {
                const why = (j && j.reason && (_LIC_REASON[j.reason] || j.reason)) || 'không hợp lệ';
                throw _kvErr('License key ' + why, { kvLicense: true });
            }
            if (r.status === 429) throw _kvErr('Gọi server quá nhanh — thử lại sau ít phút.', { kvFatal: true });
            if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status); // 502/503: server đang khởi động
            if (!j || j.ok !== true || !/^[0-9a-f]{32}$/i.test(String(j.data || ''))) {
                throw _kvErr('Server trả khoá giải mã không hợp lệ.', { kvFatal: true });
            }
            try { GM_setValue(_KEY_K1B, JSON.stringify({ v: j.data, t: Date.now() })); } catch (_) {}
            return j.data;
        } catch (e) {
            if (e && e.kvLicense) throw e;      // license sai / hết hạn / bị khoá → dừng hẳn
            lastErr = e;
            if (haveCache) break;               // có k1b cũ → dùng tạm, khỏi chờ
            if (e && e.kvFatal) throw e;
            if (i < MAX) await new Promise(function(res) { setTimeout(res, i * 6000); });
        }
    }
    if (haveCache) return cached.v;             // offline / server ngủ → dùng k1b đã nhớ (giống 'cache-offline')
    throw lastErr || new Error('Không lấy được khoá giải mã từ server');
}

async function _kvDecrypt(encB64, lic) {
    const k1b = await _kvGetK1b(lic);
    try {
        const enc = Uint8Array.from(atob(encB64.replace(/\s+/g, '')), function(c) { return c.charCodeAt(0); });
        const key = await crypto.subtle.importKey('raw', _hexToBytes(_EK1a + k1b), { name: 'AES-CBC' }, false, ['decrypt']);
        const dec = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: _hexToBytes(_EIV) }, key, enc); // Layer 2: AES-256-CBC
        const k2  = _hexToBytes(_EK2);
        const out = new Uint8Array(dec);
        for (let i = 0; i < out.length; i++) out[i] ^= k2[i % k2.length];                                // Layer 1: XOR
        return new TextDecoder().decode(out);
    } catch (e) {
        throw _kvErr('Giải mã thất bại — khoá không khớp (server đã đổi key?). Cập nhật KEY BLOCK trong loader.', { kvDecrypt: true });
    }
}

function _kvAesGateCheck(inputKey) {
    return typeof inputKey === 'string' && inputKey.trim().toLowerCase() === _kvAesGateKey;
}

// License Key (nhập 1 lần, lưu lại) → AES 64-bit Key Gate. Trả về license key, hoặc null nếu bị chặn.
let _kvAccessPromise = null;
function _kvEnsureAccess() {
    if (!_kvAccessPromise) {   // tránh bật 2 hộp thoại cùng lúc nếu có 2 lần inject chồng nhau
        _kvAccessPromise = _kvEnsureAccessOnce().finally(function() { _kvAccessPromise = null; });
    }
    return _kvAccessPromise;
}
async function _kvEnsureAccessOnce() {
    let lic = _kvGetStr('_kv_lic');
    if (!lic) {
        lic = _kvPrompt('🔑 KeyVault — Nhập License Key của bạn:');
        if (!lic) {
            _kvToast('[KeyVault] ⛔ Yêu cầu License Key — liên hệ admin để mua key. Reload trang để thử lại.');
            return null;
        }
        try { GM_setValue('_kv_lic', lic); GM_deleteValue(_KEY_K1B); } catch (_) {}
    }
    if (OLM_USE_AES_GATE) {
        const stored = _kvGetStr('_kv_aes64');
        if (!(stored && _kvAesGateCheck(stored))) {
            // [AUTO-KEY] Không hỏi người dùng nữa — tự dùng AES Key nhúng sẵn, xử lý ngầm
            const input = String(_KV_AUTO_AES_KEY || '').trim().toLowerCase();
            if (!_kvAesGateCheck(input)) {
                try { GM_setValue('_kv_aes64', ''); } catch (_) {}
                _kvToast('[KeyVault] ❌ AES Key nhúng sẵn trong loader không khớp — cập nhật _KV_AUTO_AES_KEY.');
                return null;
            }
            try { GM_setValue('_kv_aes64', input); } catch (_) {}
        }
    }
    return lic;
}

function _kvHandleError(err) {
    if (err && err.kvLicense) {   // license sai/hết hạn/bị khoá → xoá để lần sau hỏi lại
        try { GM_setValue('_kv_lic', ''); GM_deleteValue(_KEY_K1B); } catch (_) {}
        _kvToast('[KeyVault] ' + err.message + ' — reload trang và nhập lại License Key.');
        return;
    }
    if (err && err.kvDecrypt) { try { GM_deleteValue(_KEY_K1B); } catch (_) {} }
    _kvToast('[KeyVault] ' + ((err && err.message) || 'Lỗi giải mã/thực thi'));
}

async function _kvDecryptAndInject(payload) {
    try {
        const lic = await _kvEnsureAccess();
        if (!lic) return;
        let code = await _kvDecrypt(payload, lic);
        payload = null;
        _selfDestructInject(code);   // từ đây giữ nguyên cơ chế inject tự huỷ như cũ
        code = null;
    } catch (err) {
        _kvHandleError(err);
    }
}

/* ============================================================
   CODE TỰ HỦY — inject xong là xóa sạch mọi dấu vết
   textContent là primary (không bị CSP blob-src chặn trên OLM)
   ============================================================ */
function _selfDestructInject(scriptCode) {
    if (!scriptCode) return;
    const root = document.head || document.documentElement;

    // Primary: textContent — luôn hoạt động, không phụ thuộc blob-src CSP
    try {
        const el = document.createElement('script');
        el.textContent = scriptCode;
        scriptCode = null;
        root.appendChild(el);
        el.remove(); // Xóa tag ngay sau khi browser đã parse và chạy
        return;
    } catch (_) {}

    // Fallback: Blob URL (nếu textContent bị chặn vì inline-script CSP)
    if (scriptCode) {
        try {
            const blob = new Blob([scriptCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            scriptCode = null;
            const el = document.createElement('script');
            el.src = blobUrl;
            el.onload = function() { URL.revokeObjectURL(blobUrl); this.remove(); };
            el.onerror = function() { URL.revokeObjectURL(blobUrl); this.remove(); };
            root.appendChild(el);
        } catch (_) {}
    }
}

/* ============================================================
   CẤU HÌNH — Chỉ cần sửa 2 dòng này nếu đổi server / snippet
   ============================================================ */
const SERVER_BASE = 'https://serverkey-210-0nyo.onrender.com';  // URL server KeyVault
const SNIPPET_ID  = '';                                   // ID snippet core trên server
                                                         // Để trống '' → tự động lấy snippet đầu tiên (auto-endpoint)

/* ============================================================
   CACHE KEYS
   ============================================================ */
const _KEY_CODE = '__olm_kv_code__' + (SNIPPET_ID || 'auto');
const _KEY_META = '__olm_kv_meta__' + (SNIPPET_ID || 'auto');

/* ============================================================
   HELPERS: lưu/đọc cache bằng GM_setValue / GM_getValue
   ============================================================ */
function _saveCache(code, checksum, updatedAt) {
    try {
        GM_setValue(_KEY_CODE, code);
        GM_setValue(_KEY_META, JSON.stringify({ checksum, updatedAt, cachedAt: Date.now() }));
    } catch (_) {}
}
function _loadCacheCode() {
    try { return GM_getValue(_KEY_CODE, null); } catch (_) { return null; }
}
function _loadCacheMeta() {
    try {
        const raw = GM_getValue(_KEY_META, null);
        return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
}

/* ============================================================
   KIỂM TRA TRANG MỤC TIÊU
   ============================================================ */
const currentHref = window.location.href;
const isTargetPage = currentHref.includes('/chu-de/')
    || currentHref.includes('/bai-kiem-tra/')
    || currentHref.includes('/video')
    || currentHref.includes('/luyen-tap');

/* ============================================================
   INJECT SCRIPT VÀO DOM CỦA OLM — dùng self-destruct
   ============================================================ */
function injectScriptToDOM(scriptCode) {
    // [v1.9] Blob mã hoá → giải mã bằng License Key rồi mới inject (code thường vẫn inject thẳng như cũ)
    if (_isEncPayload(scriptCode)) {
        _kvDecryptAndInject(scriptCode);
        scriptCode = null;
        return;
    }
    _selfDestructInject(scriptCode);
    scriptCode = null; // Đảm bảo biến caller cũng null
}

/* ============================================================
   FETCH HELPER — dùng GM_xmlhttpRequest để bypass CORS hoàn toàn
   timeout 30s, retry 5 lần, xử lý 502/503 cold-start
   ============================================================ */
function _gmFetch(url) {
    return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            timeout: 30000,
            onload: function(r) { resolve(r); },
            onerror: function(e) { reject(new Error('Network error: ' + (e.statusText || 'unknown'))); },
            ontimeout: function() { reject(new Error('Request timeout')); },
            onabort: function() { reject(new Error('Request aborted')); }
        });
    });
}

async function _fetchJSON(url, label) {
    const MAX = 5;
    for (let i = 1; i <= MAX; i++) {
        try {
            _setStatusText(i === 1 ? ('ĐANG TẢI ' + label + '...') : ('THỬ LẠI LẦN ' + i + '/' + MAX + '...'));
            const r = await _gmFetch(url);
            if (r.status === 502 || r.status === 503) {
                const wait = i * 6;
                _setStatusText('SERVER ĐANG KHỞI ĐỘNG, CHỜ ' + wait + 'S...');
                await new Promise(res => setTimeout(res, wait * 1000));
                continue;
            }
            if (r.status === 404) throw new Error('HTTP 404 — snippet không tồn tại');
            if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
            return JSON.parse(r.responseText);
        } catch (e) {
            if (i === MAX) throw e;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
}

/* ============================================================
   HELPER ĐỂ CẬP NHẬT STATUS TEXT TRONG LOADER MATRIX
   ============================================================ */
let _pendingStatus = '';
function _setStatusText(msg) {
    _pendingStatus = msg;
    const el = document.getElementById('ml-statusText');
    if (el) el.textContent = msg;
}

/* ============================================================
   MAIN LOADER — KeyVault Smart Cache Engine:
   1) Auto-endpoint: lấy snippet đầu tiên từ /api/public/snippets (nếu không có SNIPPET_ID)
   2) Version check nhẹ (/version) → so sánh checksum với cache
   3) Nếu đã mới nhất → chạy cache, skip download
   4) Nếu có bản mới → tải code → lưu cache → chạy
   5) Fallback về cache nếu mất mạng
   ============================================================ */
async function _kvFetchAndRun(onSuccess, onError) {
    let versionUrl = SERVER_BASE + '/api/public/snippet/' + SNIPPET_ID + '/version';
    let codeUrl    = SERVER_BASE + '/api/public/snippet/' + SNIPPET_ID;

    // Auto-endpoint: lấy snippet đầu tiên nếu không có SNIPPET_ID
    if (!SNIPPET_ID) {
        try {
            _setStatusText('ĐANG LẤY PUBLIC ENDPOINT TỪ SERVER...');
            const listUrl = SERVER_BASE + '/api/public/snippets';
            const r = await _gmFetch(listUrl);
            if (r.status >= 200 && r.status < 300) {
                const list = JSON.parse(r.responseText);
                if (Array.isArray(list) && list.length > 0) {
                    const sn = list[0];
                    versionUrl = SERVER_BASE + '/api/public/snippet/' + sn.id + '/version';
                    codeUrl    = SERVER_BASE + '/api/public/snippet/' + sn.id;
                }
            }
        } catch (_) {
            const cc = _loadCacheCode();
            if (cc) {
                _setStatusText('OFFLINE — ĐANG DÙNG CACHE...');
                onSuccess(cc, 'cache-offline');
                return;
            }
            onError('Không kết nối được server và chưa có cache.');
            return;
        }
    }

    // Fetch version để so sánh checksum
    let vRes;
    try {
        vRes = await _fetchJSON(versionUrl, 'VERSION');
    } catch (e) {
        const cc = _loadCacheCode();
        const cm = _loadCacheMeta();
        if (cc) {
            const age = cm ? Math.round((Date.now() - cm.cachedAt) / 60000) : '?';
            _setStatusText('OFFLINE — DÙNG CACHE (' + age + ' PHÚT TRƯỚC)...');
            onSuccess(cc, 'cache-offline');
        } else {
            onError((e && e.message || 'Lỗi kết nối') + '<br>Chưa có cache dự phòng.');
        }
        return;
    }

    const sChecksum = (vRes && vRes.checksum) || null;
    const sDate     = (vRes && vRes.updatedAt) || null;
    const cm        = _loadCacheMeta();
    const cc        = _loadCacheCode();
    const hasCached = !!(cc && cm && cm.checksum);
    const upToDate  = hasCached && cm.checksum === sChecksum;

    // Cache đã mới nhất → chạy luôn
    if (upToDate) {
        _setStatusText('✔ SCRIPT ĐÃ MỚI NHẤT — KHỞI ĐỘNG...');
        onSuccess(cc, 'cache-fresh');
        return;
    }

    // Tải code mới
    if (hasCached) _setStatusText('🔄 PHÁT HIỆN BẢN MỚI — ĐANG TẢI...');
    else           _setStatusText('TẢI CORE MODULE TỪ SERVER...');

    let cRes;
    try {
        cRes = await _fetchJSON(codeUrl, 'CORE');
    } catch (e) {
        if (cc) {
            _setStatusText('TẢI THẤT BẠI — DÙNG CACHE CŨ...');
            onSuccess(cc, 'cache-fallback');
        } else {
            onError((e && e.message || 'Lỗi tải code') + '<br>Không có cache dự phòng.');
        }
        return;
    }

    const newCode = _extractCode(cRes);
    cRes = null; // Xóa response object ngay sau khi extract
    if (!newCode || newCode.trim().length < 10) {
        onError('Server trả về code rỗng.<br>Kiểm tra lại snippet trên admin panel.');
        return;
    }

    _saveCache(newCode, sChecksum || null, sDate || null);
    _setStatusText('🔄 ĐÃ CẬP NHẬT: ' + (sDate ? new Date(sDate).toLocaleString('vi-VN') : 'PHIÊN BẢN MỚI'));
    onSuccess(newCode, 'fresh');
}

/* ============================================================
   ANTI-DEBUG + ANTI-DEVTOOLS — 8 LỚP BẢO VỆ NÂNG CAO
   ============================================================ */
(function _antiDevTools() {
    'use strict';

    const _noop = function(){};
    let _dtHandled = false;

    /* ----------------------------------------------------------
       XỬ LÝ KHI PHÁT HIỆN DEVTOOLS
       - Xóa cache GM ngay lập tức
       - Xóa DOM
       - Chặn mọi network / navigation
       - Override console để không leak thêm gì
    ---------------------------------------------------------- */
    function _onDevToolsDetected(source) {
        if (_dtHandled) return;
        _dtHandled = true;

        // 1. Xóa toàn bộ cache GM ngay lập tức
        try { GM_deleteValue('__olm_kv_code__auto'); } catch(_) {}
        try { GM_deleteValue('__olm_kv_meta__auto'); } catch(_) {}
        try { GM_deleteValue(_KEY_CODE); } catch(_) {}
        try { GM_deleteValue(_KEY_META); } catch(_) {}
        try { GM_deleteValue('__olm_kv_k1b__'); } catch(_) {}

        // 2. Xóa sessionStorage / localStorage liên quan
        try {
            for (const k of Object.keys(sessionStorage)) {
                if (k.includes('olm') || k.includes('tiep') || k.includes('kv')) {
                    sessionStorage.removeItem(k);
                }
            }
        } catch(_) {}

        // 3. Override console để không leak thêm log nào
        try {
            const _dead = function() { return undefined; };
            ['log','warn','error','info','debug','table','dir','dirxml','group','groupEnd','trace','assert','count','time','timeEnd'].forEach(function(m) {
                try { console[m] = _dead; } catch(_) {}
            });
        } catch(_) {}

        // 4. Chặn mọi network request tiếp theo (freeze fetch + XHR)
        try {
            window.fetch = function() { return new Promise(function(){}); };
            const _deadXHR = function() {
                return { open:_noop, send:_noop, setRequestHeader:_noop,
                         addEventListener:_noop, abort:_noop, getAllResponseHeaders:_noop };
            };
            window.XMLHttpRequest = _deadXHR;
            window.XMLHttpRequest.prototype = {};
        } catch(_) {}

        // 5. Xóa DOM và thay bằng màn hình giả
        try {
            document.documentElement.innerHTML = [
                '<html><head><style>',
                '*{margin:0;padding:0;box-sizing:border-box}',
                'body{background:#000;color:#0f0;font-family:"Courier New",monospace;',
                'display:flex;align-items:center;justify-content:center;height:100vh;',
                'user-select:none}',
                'pre{font-size:13px;line-height:2;border:1px solid #0f0;',
                'padding:40px;box-shadow:0 0 30px #0f05}',
                '</style></head><body>',
                '<pre>',
                '&#9608;&#9608;&#9608; ACCESS DENIED &#9608;&#9608;&#9608;\n\n',
                'Security violation detected.\n',
                'Session terminated.\n\n',
                'Code: SEC-' + source + '-' + Date.now().toString(36).toUpperCase() + '\n\n',
                'All cached data has been purged.',
                '</pre></body></html>'
            ].join('');
        } catch(_) {}

        // 6. Vô hiệu hóa back/forward để chống xem source (bỏ onbeforeunload
        //    vì nó gây popup "rời trang?" phiền phức khi navigate bình thường)
        try {
            history.pushState(null, '', location.href);
            window.onpopstate = function() { history.pushState(null, '', location.href); };
            // KHÔNG dùng onbeforeunload — gây false alert cho người dùng bình thường
        } catch(_) {}

        // 7. Liên tục overwrite để chống restore
        let _lockCount = 0;
        const _lockInterval = setInterval(function() {
            _lockCount++;
            try { document.title = '⛔ ACCESS DENIED'; } catch(_) {}
            try {
                window.fetch = function() { return new Promise(function(){}); };
            } catch(_) {}
            if (_lockCount > 60) clearInterval(_lockInterval); // dừng sau 1 phút
        }, 1000);
    }

    /* ----------------------------------------------------------
       LỚP 1: KÍCH THƯỚC CỬA SỔ (nhanh nhất, check thường xuyên)
       FIX: Mobile browser UI (address bar + status bar + tab bar)
       thường chiếm 80-200px chiều cao → phải bỏ qua hDiff trên mobile.
       Chỉ check wDiff (chiều ngang) vì DevTools dock-right mới có wDiff lớn.
       Thêm: cần ≥3 lần liên tiếp vượt ngưỡng để tránh false positive nhất thời.
    ---------------------------------------------------------- */
    const _DT_W_THRESHOLD = 200; // Chỉ check chiều NGANG — dock-right DevTools
    const _isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    let _sizeOpenCount = 0;
    function _checkSize() {
        // Trên mobile: bỏ qua hoàn toàn check kích thước (browser chrome quá lớn)
        if (_isMobile) return;
        const wDiff = window.outerWidth - window.innerWidth;
        const open  = wDiff > _DT_W_THRESHOLD;
        if (open) {
            _sizeOpenCount++;
            // Cần 3 lần liên tiếp (1.8 giây) để xác nhận, tránh nhất thời
            if (_sizeOpenCount >= 3) _onDevToolsDetected('SIZE');
        } else {
            _sizeOpenCount = 0;
        }
    }
    setInterval(_checkSize, 600);

    /* ----------------------------------------------------------
       LỚP 2: TIMING CỦA debugger STATEMENT
       DevTools mở → pause tại debugger → dt > ngưỡng
       FIX: Mobile CPU chậm có thể vượt 80ms bình thường.
       - Tăng ngưỡng lên 200ms (chỉ bị chặn khi thực sự pause tại breakpoint)
       - Bỏ qua trên mobile để tránh hoàn toàn false positive
    ---------------------------------------------------------- */
    function _checkTiming() {
        if (_isMobile) return; // CPU mobile quá chậm, bỏ qua
        const t0 = performance.now();
        (function(){ try { (new Function('debugger'))(); } catch(_){} })();
        if (performance.now() - t0 > 200) _onDevToolsDetected('TIMING');
    }
    setInterval(_checkTiming, 1200);

    /* ----------------------------------------------------------
       LỚP 3: DEBUGGER LOOP LIÊN TỤC TRONG WEB WORKER
       Worker chạy vòng lặp debugger → nếu DevTools mở, Worker bị block
       → Worker gửi heartbeat chậm → phát hiện
       FIX: Bỏ qua trên mobile (tốn pin, CPU chậm → false positive).
       Tăng ngưỡng heartbeat từ 200ms → 500ms để an toàn hơn trên desktop chậm.
    ---------------------------------------------------------- */
    if (!_isMobile) {
        try {
            const _workerCode = [
                'var _last = Date.now();',
                'setInterval(function(){',
                '  (new Function("debugger"))();',
                '  var now = Date.now();',
                '  if(now - _last > 500) postMessage("DT_DETECTED");',
                '  _last = now;',
                '}, 150);' // Giảm tần suất từ 100 → 150ms để ít tốn CPU hơn
            ].join('\n');
            const _blob   = new Blob([_workerCode], {type:'application/javascript'});
            const _wUrl   = URL.createObjectURL(_blob);
            const _worker = new Worker(_wUrl);
            _worker.onmessage = function(e) {
                if (e.data === 'DT_DETECTED') _onDevToolsDetected('WORKER');
            };
            URL.revokeObjectURL(_wUrl);
        } catch(_) {}
    }

    /* ----------------------------------------------------------
       LỚP 4: OVERRIDE console.log VIA GETTER TRAP
       Khi DevTools mở, trình duyệt tự gọi getter của object được log
       → dùng để phát hiện
       FIX: Kỹ thuật này không đáng tin — browser extension, React DevTools,
       và một số thư viện có thể trigger nó mà không liên quan đến DevTools.
       Thêm debounce 2s: chỉ kích hoạt nếu được trigger nhiều lần liên tiếp
       (DevTools thực sự sẽ trigger liên tục khi console tab mở).
    ---------------------------------------------------------- */
    if (!_isMobile) {
        try {
            let _consoleTrapCount = 0;
            let _consoleTrapTimer = null;
            let _trap = /./;
            _trap.toString = function() {
                _consoleTrapCount++;
                clearTimeout(_consoleTrapTimer);
                _consoleTrapTimer = setTimeout(function() { _consoleTrapCount = 0; }, 2000);
                if (_consoleTrapCount >= 3) { // Cần 3 lần trigger trong 2s mới xác nhận
                    _onDevToolsDetected('CONSOLE_TRAP');
                }
                return '';
            };
        } catch(_) {}
    }

    /* ----------------------------------------------------------
       LỚP 5: CHẶN PHÍM TẮT MỞ DEVTOOLS
    ---------------------------------------------------------- */
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault(); e.stopImmediatePropagation(); return false;
        }
        if (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c','K','k'].indexOf(e.key) !== -1) {
            e.preventDefault(); e.stopImmediatePropagation(); return false;
        }
        if (e.ctrlKey && ['U','u','S','s'].indexOf(e.key) !== -1) {
            e.preventDefault(); e.stopImmediatePropagation(); return false;
        }
        // Alt+Cmd+I (Mac)
        if (e.altKey && e.metaKey && (e.key === 'I' || e.key === 'i')) {
            e.preventDefault(); e.stopImmediatePropagation(); return false;
        }
    }, true);

    /* ----------------------------------------------------------
       LỚP 6: CHẶN CONTEXT MENU (chuột phải → inspect)
    ---------------------------------------------------------- */
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault(); e.stopImmediatePropagation(); return false;
    }, true);

    /* ----------------------------------------------------------
       LỚP 7: PHÁT HIỆN QUA toString CỦA FUNCTION
       DevTools hiện native code khác → so sánh length
       FIX: Bỏ qua trên mobile. Thêm: cần 2 lần liên tiếp để xác nhận
       tránh trường hợp polyfill hay extension làm thay đổi một lần nhất thời.
    ---------------------------------------------------------- */
    if (!_isMobile) {
        try {
            const _fStr = Function.prototype.toString;
            const _expected = _fStr.call(_fStr).length;
            let _fnstrMismatchCount = 0;
            setInterval(function() {
                try {
                    if (_fStr.call(_fStr).length !== _expected) {
                        _fnstrMismatchCount++;
                        if (_fnstrMismatchCount >= 2) _onDevToolsDetected('FNSTR');
                    } else {
                        _fnstrMismatchCount = 0; // reset nếu trở lại bình thường
                    }
                } catch(_) {}
            }, 2000);
        } catch(_) {}
    }

    /* ----------------------------------------------------------
       LỚP 8: CHẶN DRAG & DROP FILE ĐỂ TRÁNH SOURCE MAP
    ---------------------------------------------------------- */
    document.addEventListener('dragover',  function(e){ e.preventDefault(); }, true);
    document.addEventListener('drop',      function(e){ e.preventDefault(); }, true);

})();

/* ============================================================
   MATRIX LOADER ANIMATION — giữ nguyên style gốc
   ============================================================ */
function showLoaderThenInject() {

    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

        #tiep-matrix-loader {
            position: fixed; inset: 0; z-index: 2147483647;
            background: #020c06;
            font-family: 'Share Tech Mono', monospace;
            color: #00ff88;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        #tiep-matrix-loader::before {
            content: ''; position: absolute; inset: 0;
            background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px);
            pointer-events: none; z-index: 100;
            animation: flicker 8s infinite;
        }
        #tiep-matrix-loader::after {
            content: ''; position: absolute; inset: 0;
            background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%);
            pointer-events: none; z-index: 99;
        }
        @keyframes flicker {
            0%, 95%, 100% { opacity: 1; }
            96% { opacity: 0.85; }
            97% { opacity: 1; }
            98% { opacity: 0.9; }
        }
        #matrix-canvas {
            position: absolute; inset: 0; opacity: 0.07; z-index: 0;
        }
        .ml-container {
            position: relative; z-index: 10; width: 520px;
            display: flex; flex-direction: column; gap: 0;
        }
        .ml-top-label {
            font-family: 'Orbitron', monospace; font-size: 9px;
            letter-spacing: 6px; color: #00ff88; opacity: 0.5;
            text-align: center; margin-bottom: 8px;
            animation: pulse-text 3s infinite;
        }
        @keyframes pulse-text {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 0.8; }
        }
        .ml-panel {
            background: #040f08;
            border: 1px solid #00ff8833;
            position: relative; padding: 28px 32px;
            clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
        }
        .ml-panel::before {
            content: ''; position: absolute; top: -1px; left: -1px;
            width: 40px; height: 40px;
            border-top: 2px solid #00ff88; border-left: 2px solid #00ff88;
            box-shadow: -2px -2px 12px #00ff8844;
        }
        .ml-panel::after {
            content: ''; position: absolute; bottom: -1px; right: -1px;
            width: 40px; height: 40px;
            border-bottom: 2px solid #00ff88; border-right: 2px solid #00ff88;
            box-shadow: 2px 2px 12px #00ff8844;
        }
        .ml-title-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
        .ml-title-main {
            font-family: 'Orbitron', monospace; font-size: 26px; font-weight: 900;
            color: #00ff88;
            text-shadow: 0 0 20px #00ff88, 0 0 40px #00ff8844;
            letter-spacing: 4px;
        }
        .ml-version {
            font-size: 10px; font-family: 'Orbitron', monospace; letter-spacing: 3px;
            color: #020c06; background: #00ff88; padding: 2px 8px; font-weight: 700;
            clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
        }
        .ml-subtitle {
            font-size: 11px; letter-spacing: 3px; color: #00ff88; opacity: 0.55;
            margin-bottom: 24px;
        }
        .ml-divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #00ff88, #00ff8844, transparent);
            margin: 0 -32px 22px;
            box-shadow: 0 0 8px #00ff8844;
        }
        .ml-status-lines {
            display: flex; flex-direction: column; gap: 7px;
            margin-bottom: 22px; min-height: 80px;
        }
        .ml-status-line {
            font-size: 11px; letter-spacing: 1px; opacity: 0;
            transform: translateX(-10px); transition: all 0.3s ease;
            display: flex; align-items: center; gap: 10px;
        }
        .ml-status-line.visible { opacity: 1; transform: translateX(0); }
        .ml-prefix { color: #00ff88; opacity: 0.5; flex-shrink: 0; }
        .ml-msg { color: #00ff88; }
        .ml-ok { margin-left: auto; color: #00ff88; font-size: 10px; opacity: 0.7; flex-shrink: 0; }
        .ml-progress-section { margin-bottom: 20px; }
        .ml-progress-header {
            display: flex; justify-content: space-between;
            font-size: 10px; letter-spacing: 2px; opacity: 0.6; margin-bottom: 8px;
        }
        .ml-progress-track {
            height: 6px; background: rgba(0,255,136,0.08);
            border: 1px solid #00ff8833; position: relative; overflow: hidden;
        }
        .ml-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00aa55, #00ff88);
            box-shadow: 0 0 12px #00ff88, 0 0 24px #00ff8844;
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            width: 0%; position: relative;
        }
        .ml-progress-fill::after {
            content: ''; position: absolute; right: 0; top: 0;
            width: 20px; height: 100%;
            background: rgba(255,255,255,0.4);
            animation: shimmer 1s infinite;
        }
        @keyframes shimmer { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        .ml-mini-bars { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .ml-mini-item { display: flex; flex-direction: column; gap: 5px; }
        .ml-mini-label { font-size: 8px; letter-spacing: 2px; opacity: 0.4; }
        .ml-mini-track {
            height: 3px; background: rgba(0,255,136,0.08);
            border: 1px solid rgba(0,255,136,0.15);
        }
        .ml-mini-fill {
            height: 100%; background: #00ff88;
            box-shadow: 0 0 6px #00ff88; width: 0%;
            transition: width 1.5s ease;
        }
        .ml-bottom-row {
            display: flex; justify-content: space-between; align-items: center;
            border-top: 1px solid #00ff8833; padding-top: 14px; margin-top: 4px;
        }
        .ml-author { font-size: 10px; letter-spacing: 3px; color: #00ff88; opacity: 0.4; }
        .ml-author span { opacity: 1; color: #00ff88; text-shadow: 0 0 8px #00ff8844; }
        .ml-status-dot { display: flex; align-items: center; gap: 8px; font-size: 9px; letter-spacing: 2px; opacity: 0.7; }
        .ml-dot {
            width: 7px; height: 7px; border-radius: 50%; background: #00ff88;
            box-shadow: 0 0 8px #00ff88; animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; box-shadow: 0 0 8px #00ff88; }
            50% { opacity: 0.3; box-shadow: none; }
        }
        .ml-title-main.done { animation: godmode-activate 0.5s ease forwards; }
        @keyframes godmode-activate {
            0% { text-shadow: 0 0 20px #00ff88, 0 0 40px #00ff8844; }
            50% { text-shadow: 0 0 40px #00ff88, 0 0 80px #00ff88, 0 0 120px #00ff8844; color: #fff; }
            100% { text-shadow: 0 0 20px #00ff88, 0 0 60px #00ff88, 0 0 100px #00ff8044; }
        }
        .ml-glitch { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
        .ml-glitch.active { animation: glitch-flash 0.4s steps(1) forwards; }
        @keyframes glitch-flash {
            0%   { opacity: 0; background: rgba(0,255,136,0.05); }
            25%  { opacity: 1; background: rgba(0,255,136,0.08); }
            50%  { opacity: 0; }
            75%  { opacity: 1; background: rgba(255,34,68,0.05); }
            100% { opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    const loaderEl = document.createElement('div');
    loaderEl.id = 'tiep-matrix-loader';
    loaderEl.innerHTML = `
        <canvas id="matrix-canvas"></canvas>
        <div class="ml-container">
            <div class="ml-top-label">◈ SECURE CONNECTION ESTABLISHED ◈</div>
            <div class="ml-panel" id="ml-mainPanel">
                <div class="ml-glitch" id="ml-glitchOverlay"></div>
                <div class="ml-title-row">
                    <div class="ml-title-main" id="ml-titleMain">OLM GOD MODE</div>
                    <div class="ml-version">V 1.8 VIP</div>
                </div>
                <div class="ml-subtitle">◈ SYSTEM OVERRIDE PROTOCOL ◈ DEV.Thiên Tai Tù Tội</div>
                <div class="ml-divider"></div>
                <div class="ml-status-lines" id="ml-statusLines"></div>
                <div class="ml-progress-section">
                    <div class="ml-progress-header">
                        <span>LOADING CORE MODULE</span>
                        <span id="ml-pctText">0%</span>
                    </div>
                    <div class="ml-progress-track">
                        <div class="ml-progress-fill" id="ml-progressFill"></div>
                    </div>
                </div>
                <div class="ml-mini-bars">
                    <div class="ml-mini-item">
                        <div class="ml-mini-label">XHR INTERCEPT</div>
                        <div class="ml-mini-track"><div class="ml-mini-fill" id="ml-m1"></div></div>
                    </div>
                    <div class="ml-mini-item">
                        <div class="ml-mini-label">DOM INJECT</div>
                        <div class="ml-mini-track"><div class="ml-mini-fill" id="ml-m2"></div></div>
                    </div>
                    <div class="ml-mini-item">
                        <div class="ml-mini-label">STEALTH MODE</div>
                        <div class="ml-mini-track"><div class="ml-mini-fill" id="ml-m3"></div></div>
                    </div>
                </div>
                <div class="ml-bottom-row">
                    <div class="ml-author">BY <span>THIÊN TAI TÙ TỘI</span></div>
                    <div class="ml-status-dot">
                        <div class="ml-dot" id="ml-statusDot"></div>
                        <span id="ml-statusText">CONNECTING</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const waitBodyInterval = setInterval(() => {
        if (document.body) {
            clearInterval(waitBodyInterval);
            document.body.appendChild(loaderEl);
            _startMatrixAndFetch();
        }
    }, 10);

    function _startMatrixAndFetch() {

        /* --- Matrix rain background --- */
        const canvas = document.getElementById('matrix-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const cols = Math.floor(canvas.width / 16);
        const drops = Array(cols).fill(1);
        const chars = 'アイウエオカキクケコ0123456789ABCDEF<>{}[]|\\/*+-=!@#$%^&()_~`';

        const matrixInterval = setInterval(() => {
            ctx.fillStyle = 'rgba(2,12,6,0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#00ff88';
            ctx.font = '14px Share Tech Mono';
            drops.forEach((y, i) => {
                ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, y * 16);
                if (y * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            });
        }, 50);

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        /* --- Log messages animation (chạy song song với fetch thật) --- */
        const fakeSteps = [
            { msg: 'KHỞI TẠO TAMPERMONKEY BRIDGE...', delay: 200 },
            { msg: 'KẾT NỐI KEYVAULT SERVER...', delay: 600 },
            { msg: 'XÁC THỰC SNIPPET ID: ' + (SNIPPET_ID ? SNIPPET_ID.slice(0, 8) + '...' : 'AUTO'), delay: 1000 },
            { msg: 'KIỂM TRA CHECKSUM CACHE...', delay: 1400 },
            { msg: 'BYPASS CORS RESTRICTION...', delay: 1900 },
            { msg: 'INJECT SCRIPT VÀO OLM DOM...', delay: 2400 },
            { msg: 'HOOK XHR INTERCEPTOR...', delay: 2850 },
            { msg: 'XÓA DẤU VẾT... STEALTH ON ✓', delay: 3200 },
        ];
        const progressPercents = [5, 15, 28, 45, 58, 72, 85, 93];

        const statusLinesEl  = document.getElementById('ml-statusLines');
        const progressFillEl = document.getElementById('ml-progressFill');
        const pctTextEl      = document.getElementById('ml-pctText');

        fakeSteps.forEach((step, idx) => {
            setTimeout(() => {
                const line = document.createElement('div');
                line.className = 'ml-status-line';
                line.innerHTML = `<span class="ml-prefix">[${String(idx + 1).padStart(2, '0')}]</span>`
                    + `<span class="ml-msg">${step.msg}</span>`
                    + `<span class="ml-ok">✓ OK</span>`;
                statusLinesEl.appendChild(line);

                const allLines = statusLinesEl.querySelectorAll('.ml-status-line');
                allLines.forEach((l, i) => {
                    if (i < allLines.length - 4) {
                        l.style.opacity = '0';
                        l.style.height = '0';
                        l.style.margin = '0';
                        l.style.overflow = 'hidden';
                    }
                });

                requestAnimationFrame(() => line.classList.add('visible'));

                progressFillEl.style.width = progressPercents[idx] + '%';

                let current = parseInt(pctTextEl.textContent);
                const target = progressPercents[idx];
                const step_size = Math.ceil((target - current) / 10);
                const pctInterval = setInterval(() => {
                    current = Math.min(current + step_size, target);
                    pctTextEl.textContent = current + '%';
                    if (current >= target) clearInterval(pctInterval);
                }, 30);

                if (idx >= 5) document.getElementById('ml-m1').style.width = '100%';
                if (idx >= 6) document.getElementById('ml-m2').style.width = '100%';
                if (idx >= 7) document.getElementById('ml-m3').style.width = '100%';
            }, step.delay);
        });

        /* --- KeyVault fetch thật — chờ xong animation mới inject --- */
        const MIN_ANIM_MS = 3600; // đợi tối thiểu để animation chạy đẹp
        const fetchStart  = Date.now();

        let _fetchedCode  = null;
        let _fetchDone    = false;
        let _animDone     = false;

        function _tryFinish() {
            if (!_fetchDone || !_animDone) return;
            if (_fetchedCode) {
                _doFinishSuccess();
            } else {
                // _fetchedCode null = error, đã log, loader tự ẩn
            }
        }

        // Animation "done" trigger sau MIN_ANIM_MS
        setTimeout(() => {
            _animDone = true;
            _tryFinish();
        }, MIN_ANIM_MS + 400);

        _kvFetchAndRun(
            (code /*, source */) => {
                _fetchedCode = code;
                _fetchDone   = true;

                const elapsed = Date.now() - fetchStart;
                const remaining = Math.max(0, MIN_ANIM_MS - elapsed);
                // Nếu fetch xong trước animation, chờ nốt
                if (remaining > 0) {
                    setTimeout(() => {
                        _animDone = true;
                        _tryFinish();
                    }, remaining);
                } else {
                    _tryFinish();
                }
            },
            (errMsg) => {
                _fetchDone = true;
                // Hiện lỗi trong loader
                clearInterval(matrixInterval);
                const ov = document.getElementById('tiep-matrix-loader');
                if (ov) {
                    ov.innerHTML = `
                        <div style="text-align:center;font-family:'Share Tech Mono',monospace;color:#00ff88">
                            <div style="font-size:32px;margin-bottom:12px">⚠</div>
                            <div style="font-size:14px;font-weight:600;margin-bottom:6px">KHÔNG TẢI ĐƯỢC CORE MODULE</div>
                            <div style="font-size:11px;color:#888;max-width:300px;line-height:1.7;margin-bottom:18px">${errMsg}</div>
                            <button id="__olm_retry__" style="background:#00ff88;color:#020c06;border:none;border-radius:6px;padding:8px 22px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🔄 THỬ LẠI</button>
                        </div>
                    `;
                    document.getElementById('__olm_retry__').addEventListener('click', () => {
                        ov.remove();
                        sessionStorage.removeItem('tiep_loader_seen');
                        showLoaderThenInject();
                    });
                }
            }
        );

        function _doFinishSuccess() {
            // Thêm dòng done cuối
            const doneStep = {
                msg: _pendingStatus.startsWith('✔') || _pendingStatus.startsWith('🔄')
                    ? _pendingStatus
                    : 'GOD MODE KÍCH HOẠT THÀNH CÔNG!',
                done: true
            };
            const idx = fakeSteps.length;
            const line = document.createElement('div');
            line.className = 'ml-status-line';
            line.innerHTML = `<span class="ml-prefix">[${String(idx + 1).padStart(2, '0')}]</span>`
                + `<span class="ml-msg">${doneStep.msg}</span>`
                + `<span class="ml-ok">★ DONE</span>`;
            statusLinesEl.appendChild(line);
            requestAnimationFrame(() => line.classList.add('visible'));

            progressFillEl.style.width = '100%';
            pctTextEl.textContent = '100%';

            document.getElementById('ml-statusText').textContent = 'GOD MODE ACTIVE';
            document.getElementById('ml-titleMain').classList.add('done');
            document.getElementById('ml-glitchOverlay').classList.add('active');
            const dot = document.getElementById('ml-statusDot');
            if (dot) {
                dot.style.background   = '#00ff88';
                dot.style.boxShadow    = '0 0 16px #00ff88, 0 0 32px #00ff8844';
                dot.style.animation    = 'none';
            }

            setTimeout(() => {
                clearInterval(matrixInterval);
                loaderEl.style.transition = 'opacity 0.4s ease';
                loaderEl.style.opacity    = '0';
                setTimeout(() => {
                    loaderEl.remove();
                    injectScriptToDOM(_fetchedCode);
                    _fetchedCode = null; // Xóa khỏi memory ngay sau inject
                }, 400);
            }, 500);
        }
    }
}

/* ============================================================
   MAIN FLOW — đặt sau showLoaderThenInject để hàm đã sẵn sàng
   ============================================================ */
const loaderAlreadySeen = sessionStorage.getItem('tiep_loader_seen');

// Nếu là trang đích hoặc đã thấy loader → kéo code ngầm, inject thẳng khi xong
if (isTargetPage || loaderAlreadySeen) {
    const cachedCore = _loadCacheCode();
    if (cachedCore) {
        // Chạy cache ngay lập tức, cập nhật ngầm
        injectScriptToDOM(cachedCore);
        _kvFetchAndRun(
            (newCode, source) => {
                if (source === 'fresh') {
                    // Có bản mới nhưng đã inject cache rồi, không inject lại để tránh double-run
                    // Cache đã được lưu bởi _kvFetchAndRun — lần sau sẽ dùng bản mới
                }
            },
            (_err) => { /* Lỗi tải bản mới — cache cũ vẫn chạy, không cần log */ }
        );
    } else {
        // Chưa có cache → phải tải về trước
        _kvFetchAndRun(
            (code) => { injectScriptToDOM(code); },
            (_err) => { /* Lỗi tải core — không có gì để inject */ }
        );
    }
} else {
    // Trang không phải đích + lần đầu thấy loader → hiện matrix loader animation
    sessionStorage.setItem('tiep_loader_seen', '1');
    showLoaderThenInject();
}
