// ==UserScript==
// @name         OLM GOD MODE v1.6 - Thiên Tai Tù Tội (VIP LOADER)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Hệ thống tự động hóa OLM.
// @author       Thiên Tai Tù Tội 
// @match        *://olm.vn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
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
   [v3.0] SECURE PIPELINE — thay cho toàn bộ khối GIẢI MÃ cũ
   ------------------------------------------------------------
   ĐÃ XOÁ: KEY BLOCK (k1a / iv / k2), AES Gate Key, _KV_AUTO_AES_KEY (khoá master nhúng sẵn), k1b / POST /api/snippet-key,
           token 128-bit kiểu cũ (POST /api/g/x), giải mã XOR + AES-CBC, cache code trong GM storage.
   → Loader KHÔNG còn chứa khoá giải mã cố định nào. Server tự giải mã file.js gốc rồi mã hoá lại RIÊNG cho từng phiên
     bằng khoá sinh ra từ License Key của người dùng; loader chỉ mở được gói của chính key đó.

   Luồng (tự chạy ngay sau khi người dùng nhập License Key):
     1) Thu thập thiết bị : tên máy · Android/iOS · phiên bản · GPU · màn hình · kiến trúc CPU
     2) IP thật của máy   : hỏi dịch vụ echo bằng đúng đường mạng của trình duyệt
     3) POST /api/g/s { key, c, d, ip, dev } → server kiểm tra thiết bị → IP → key → 128-bit
                                              → trả "phong bì" đã mã hoá bằng License Key
     4) Mở phong bì (HKDF-SHA256 + AES-256-GCM) → link ngẫu nhiên (dùng 1 lần) + khoá của phiên
     5) GET link → gói mã hoá chứa TOÀN BỘ file.js gốc → giải mã bằng khoá phiên → inject tự huỷ như cũ
   Link chỉ dùng được 1 lần, sống ~45s, bắt buộc cùng IP/mạng + cùng trình duyệt với bước 3.
   Hợp đồng chi tiết: PIPELINE_API.md (đi kèm server).
   ============================================================ */

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

const _KEY_DEV = '_kv_dev';
const _KV_PIPE_RETRY_MAX = 4;   // 502/503/lỗi mạng (server Render đang khởi động) → thử lại tối đa 4 lần

// [v3.1] Cờ "đã xem hiệu ứng loader ở lần đầu" — lưu BỀN trong GM storage (sống qua đóng tab / thoát & mở lại app).
// Không bắt đầu bằng "__olm_kv_" nên _kvPurgeLegacyCache không xoá nhầm. Chỉ được set sau khi lần đầu kích hoạt thành công.
const _KEY_INTRO = '_kv_intro_seen';
function _kvIntroSeen() {
    try { return String(GM_getValue(_KEY_INTRO, '')) === '1'; } catch (_) { return false; }
}
function _kvMarkIntroSeen() {
    try { GM_setValue(_KEY_INTRO, '1'); } catch (_) {}
}

function _bytesToHex(b) {
    return Array.from(b, function(x) { return x.toString(16).padStart(2, '0'); }).join('');
}
function _b64ToBytes(s) {
    return Uint8Array.from(atob(String(s)), function(c) { return c.charCodeAt(0); });
}

// Mã thiết bị ổn định: 'VM-' + 32 hex (server yêu cầu 8–96 ký tự A-Z a-z 0-9 _ -)
function _kvDeviceId() {
    let d = _kvGetStr(_KEY_DEV);
    if (!/^[A-Za-z0-9_\-]{8,96}$/.test(d)) {
        d = 'VM-' + _bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        try { GM_setValue(_KEY_DEV, d); } catch (_) {}
    }
    return d;
}

function _gmGet(url, timeoutMs) {
    return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            timeout: timeoutMs || 30000,
            onload: function(r) { resolve(r); },
            onerror: function(e) { reject(new Error('Network error: ' + ((e && e.statusText) || 'unknown'))); },
            ontimeout: function() { reject(new Error('Request timeout')); },
            onabort: function() { reject(new Error('Request aborted')); }
        });
    });
}

// Toast lỗi "server từ chối": giữ nguyên License Key, cho thử lại hoặc nhập lại key ngay trên toast
function _kvDeniedToast(msg) {
    function show() {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;bottom:12px;right:12px;background:rgba(239,83,80,.95);color:#fff;'
                + 'padding:10px 14px;border-radius:8px;font-size:11px;z-index:2147483647;max-width:300px;'
                + 'line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.5);font-family:system-ui,sans-serif';
            const t = document.createElement('div');
            t.textContent = msg;
            d.appendChild(t);
            const row = document.createElement('div');
            row.style.cssText = 'margin-top:8px;display:flex;gap:8px';
            [['THỬ LẠI', function() { location.reload(); }],
             ['NHẬP LẠI KEY', function() { try { GM_setValue('_kv_lic', ''); } catch (_) {} location.reload(); }]
            ].forEach(function(b) {
                const btn = document.createElement('button');
                btn.textContent = b[0];
                btn.style.cssText = 'flex:1;background:#fff;color:#c62828;border:none;border-radius:6px;'
                    + 'padding:6px 8px;font-size:11px;font-weight:700;cursor:pointer';
                btn.addEventListener('click', b[1]);
                row.appendChild(btn);
            });
            d.appendChild(row);
            (document.body || document.documentElement).appendChild(d);
            setTimeout(function() { d.remove(); }, 30000);
        } catch (_) {}
    }
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
}

/* ------------------------------------------------------------
   1) THÔNG TIN THIẾT BỊ — tên máy · Android/iOS · phiên bản (+ GPU, màn hình, kiến trúc CPU để server nhận ra máy ảo)
   Chromium trên Android cho đọc model + phiên bản thật qua userAgentData; iOS / Firefox chỉ lộ loại máy.
   Chỉ điện thoại / máy tính bảng Android hoặc iOS được hỗ trợ.
   ------------------------------------------------------------ */
function _kvGpuRenderer() {
    try {
        const cv = document.createElement('canvas');
        const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
        if (!gl) return '';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    } catch (_) { return ''; }
}

async function _kvCollectDevice() {
    const ua  = navigator.userAgent || '';
    const uad = navigator.userAgentData || null;
    let hi = null;
    if (uad && typeof uad.getHighEntropyValues === 'function') {
        try { hi = await uad.getHighEntropyValues(['model', 'platformVersion', 'architecture', 'bitness']); } catch (_) {}
    }
    const ipadDesktopUA = /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1;   // iPadOS bật "trang web máy tính"
    let os = '', osv = '', name = '';
    if (/Android/i.test(ua) || (uad && uad.platform === 'Android')) {
        os = 'android';
        const m = /Android\s+(\d+(?:\.\d+){0,2})/i.exec(ua);
        osv  = (hi && hi.platformVersion) || (m ? m[1] : '');
        name = (hi && hi.model) || '';
        if (!name) { const mm = /Android[^;)]*;\s*([^;)]+?)\s*(?:Build\/|\)|;)/i.exec(ua); if (mm) name = mm[1]; }
        name = String(name || '').trim();
        // UA bị Chrome rút gọn ("K") / Firefox không lộ model → chỉ biết phiên bản
        if (!name || /^(K|Mobile|Tablet|Android)$/i.test(name)) name = 'Android ' + osv;
    } else if (/iPhone|iPad|iPod/i.test(ua) || ipadDesktopUA) {
        os = 'ios';
        const m = /OS (\d+)[_.](\d+)(?:[_.](\d+))?/i.exec(ua);
        if (m && !ipadDesktopUA) osv = m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '');
        else { const v = /Version\/(\d+(?:\.\d+){0,2})/i.exec(ua); if (v) osv = v[1]; }   // iPad "trang máy tính": số Safari = số iPadOS
        name = (/iPad/i.test(ua) || ipadDesktopUA) ? 'iPad' : (/iPod/i.test(ua) ? 'iPod' : 'iPhone');
    }
    if (!os || !osv) {
        throw _kvErr('Thiết bị không được hỗ trợ — chỉ chạy trên điện thoại / máy tính bảng Android hoặc iOS.', { kvStop: true });
    }
    const dev = { name: name, os: os, osv: osv };
    const gpu = _kvGpuRenderer();
    if (gpu) dev.gpu = gpu;
    if (typeof navigator.maxTouchPoints === 'number') dev.tp = navigator.maxTouchPoints;
    if (typeof screen !== 'undefined' && screen.width && screen.height) { dev.sw = screen.width; dev.sh = screen.height; }
    if (typeof navigator.hardwareConcurrency === 'number') dev.cores = navigator.hardwareConcurrency;
    if (hi && hi.architecture) dev.abi = String(hi.architecture) + (hi.bitness ? '-' + hi.bitness : '');
    return dev;
}

/* ------------------------------------------------------------
   2) IP THẬT CỦA MÁY — hỏi dịch vụ echo bằng đúng đường mạng của trình duyệt.
   Server so IP này với IP nó thấy khi nhận request: lệch mạng (proxy / VPN tách đường) hoặc IP VPN / datacenter → từ chối.
   Thử lần lượt từng dịch vụ, cái nào trả IP hợp lệ trước thì dùng.
   ------------------------------------------------------------ */
const _KV_IP_ECHO = [
    { url: 'https://api64.ipify.org?format=json', json: true  },
    { url: 'https://icanhazip.com',               json: false },
    { url: 'https://ifconfig.me/ip',              json: false },
    { url: 'https://checkip.amazonaws.com',       json: false }
];
function _kvIsIp(s) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || (s.indexOf(':') >= 0 && /^[0-9a-fA-F:.]{2,45}$/.test(s));
}
async function _kvGetRealIP() {
    for (let i = 0; i < _KV_IP_ECHO.length; i++) {
        try {
            const r = await _gmGet(_KV_IP_ECHO[i].url, 6000);
            if (r.status !== 200) continue;
            let s = String(r.responseText || '').trim();
            if (_KV_IP_ECHO[i].json) { try { s = String(JSON.parse(s).ip || '').trim(); } catch (_) { s = ''; } }
            if (_kvIsIp(s)) return s;
        } catch (_) { /* thử dịch vụ kế tiếp */ }
    }
    throw _kvErr('Không xác định được IP của máy — kiểm tra kết nối mạng rồi thử lại.', { kvStop: true });
}

/* ------------------------------------------------------------
   3) PHIÊN — gửi key + thiết bị + IP; server tự chạy: thiết bị → IP → key → 128-bit → giải mã file.js gốc → link mã hoá
   Mọi lần từ chối server đều trả 403 giống nhau (kèm "mã" để admin tra nhật ký) — loader không biết lý do thật.
   ------------------------------------------------------------ */
async function _kvPipelineSession(lic, dev, ip) {
    let lastErr = null;
    for (let i = 1; i <= _KV_PIPE_RETRY_MAX; i++) {
        try {
            const body = {
                key: lic,
                c:   _bytesToHex(crypto.getRandomValues(new Uint8Array(16))),   // nonce 128-bit
                d:   _kvDeviceId(),
                ip:  ip,
                dev: dev
            };
            if (SNIPPET_ID) body.s = SNIPPET_ID;
            const r = await _gmPostJSON(SERVER_BASE + '/api/g/s', body, 30000);
            let j = null;
            try { j = JSON.parse(r.responseText); } catch (_) {}

            if (r.status === 404) {
                if (j && j.error === 'no_script') throw _kvErr('Server chưa có file .js nào để cấp.', { kvStop: true });
                throw _kvErr('Server chưa hỗ trợ Secure Pipeline — cập nhật server (index.js) lên bản mới.', { kvStop: true });
            }
            if (r.status === 403) {
                if (j && j.error === 'device_limit') {
                    const m = /(\d+)\s*\/\s*(\d+)/.exec(String(j.message || ''));
                    throw _kvErr('Key đã dùng đủ ' + (m ? m[1] + '/' + m[2] + ' ' : '') + 'thiết bị — liên hệ admin để reset thiết bị.', { kvDevice: true, kvStop: true });
                }
                const ref = (j && /^[0-9a-f]{8}$/.test(String(j.ref || ''))) ? j.ref : '';
                const dbg = (j && j.stage) ? ' [' + String(j.stage + ':' + (j.reason || '')).replace(/[^\w:.()\-]/g, '') + ']' : '';   // chỉ có khi server bật KV_PIPE_VERBOSE
                throw _kvErr('Server từ chối truy cập' + (ref ? ' (mã ' + ref + ')' : '') + dbg + '.', { kvDenied: true, kvStop: true });
            }
            if (r.status === 429) throw _kvErr('Gọi server quá nhanh — thử lại sau ít phút.', { kvStop: true });
            if (r.status === 400) throw _kvErr('Server từ chối yêu cầu (' + String((j && j.error) || 'bad_request').replace(/[^\w-]/g, '') + ').', { kvStop: true });
            if (r.status === 500) throw _kvErr('Server lỗi khi chuẩn bị code (' + String((j && j.error) || '500').replace(/[^\w-]/g, '') + ') — liên hệ admin.', { kvStop: true });
            if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);   // 502/503: server đang khởi động → thử lại
            if (!j || j.ok !== true || !j.s || !j.i || !j.d) throw _kvErr('Server trả dữ liệu không hợp lệ.', { kvStop: true });
            return j;
        } catch (e) {
            if (e && e.kvStop) throw e;
            lastErr = e;
            if (i < _KV_PIPE_RETRY_MAX) {
                const wait = i * 6;
                _setStatusText('SERVER ĐANG KHỞI ĐỘNG, CHỜ ' + wait + 'S...');
                await new Promise(function(res) { setTimeout(res, wait * 1000); });
            }
        }
    }
    if (lastErr) lastErr.kvStop = true;
    throw lastErr || _kvErr('Không kết nối được server.', { kvStop: true });
}

/* ------------------------------------------------------------
   4) MỞ PHONG BÌ + GÓI — mọi khoá sinh ra tại chỗ từ License Key và dữ liệu của phiên, không có khoá nhúng sẵn
   Phong bì : khoá = HKDF-SHA256(ikm = License Key IN HOA, salt = s, info = "kvs-wrap|v1"), AES-256-GCM(iv = i) trên d
              → 72 byte: 128-bit(16) ‖ mã link(32) ‖ salt(16) ‖ hạn(8, big-endian, ms)
   Gói      : khoá = HKDF-SHA256(ikm = 128-bit ‖ License Key, salt, info = "kvs-pkg|v1|" + mã link hex),
              AES-256-GCM, AAD = "kvs|v1|" + mã link hex + "|" + hạn → toàn bộ file.js (UTF-8)
   ------------------------------------------------------------ */
async function _kvHkdfAesKey(ikm, salt, info) {
    const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: salt, info: new TextEncoder().encode(info) },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

async function _kvOpenEnvelope(w, lic) {
    const nk = String(lic).trim().toUpperCase();
    const wk = await _kvHkdfAesKey(new TextEncoder().encode(nk), _b64ToBytes(w.s), 'kvs-wrap|v1');
    const p  = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64ToBytes(w.i) }, wk, _b64ToBytes(w.d)));
    if (p.length !== 72) throw new Error('bad_envelope');
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    return {
        nk:   nk,
        tok:  p.slice(0, 16),
        id:   _bytesToHex(p.slice(16, 48)),
        salt: p.slice(48, 64),
        exp:  dv.getUint32(64) * 4294967296 + dv.getUint32(68)
    };
}

// Tải gói qua link ngẫu nhiên (dùng được đúng 1 lần). 404 = link chết (chậm mạng / đổi mạng) → xin phiên mới.
async function _kvFetchLink(id) {
    const r = await _gmGet(SERVER_BASE + '/api/g/c/' + id, 30000);
    if (r.status === 200) {
        let j = null;
        try { j = JSON.parse(r.responseText); } catch (_) {}
        if (j && j.ok === true && j.i && j.d) return j;
        throw _kvErr('Gói code server trả về không hợp lệ.', { kvStop: true });
    }
    if (r.status === 404) throw _kvErr('Link đã hết hạn hoặc bị huỷ.', { kvRelink: true });
    if (r.status === 429) throw _kvErr('Gọi server quá nhanh — thử lại sau ít phút.', { kvStop: true });
    throw new Error('HTTP ' + r.status);
}

async function _kvDecryptPackage(env, pkg) {
    const enc = new TextEncoder();
    const nkb = enc.encode(env.nk);
    const ikm = new Uint8Array(env.tok.length + nkb.length);
    ikm.set(env.tok, 0);
    ikm.set(nkb, env.tok.length);                                              // 128-bit ‖ License Key
    const pk  = await _kvHkdfAesKey(ikm, env.salt, 'kvs-pkg|v1|' + env.id);
    const out = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _b64ToBytes(pkg.i), additionalData: enc.encode('kvs|v1|' + env.id + '|' + env.exp) },
        pk, _b64ToBytes(pkg.d));
    return new TextDecoder().decode(out);
}

// License Key (nhập 1 lần, lưu lại). Trả về license key, hoặc null nếu người dùng không nhập.
let _kvAccessPromise = null;
function _kvEnsureAccess() {
    if (!_kvAccessPromise) {   // tránh bật 2 hộp thoại cùng lúc nếu có 2 lần gọi chồng nhau
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
        try { GM_setValue('_kv_lic', lic); } catch (_) {}
    }
    return lic;
}

function _kvHandleError(err) {
    if (err && err.kvLicense) {   // license sai/hết hạn/bị khoá → xoá để lần sau hỏi lại
        try { GM_setValue('_kv_lic', ''); } catch (_) {}
        _kvToast('[KeyVault] ' + err.message + ' — reload trang và nhập lại License Key.');
        return;
    }
    if (err && err.kvDenied) {    // server từ chối (thiết bị / IP / key) — giữ key, cho thử lại hoặc nhập lại ngay trên toast
        _kvDeniedToast('[KeyVault] ⛔ ' + err.message + ' Hãy tắt VPN/proxy, dùng điện thoại thật (không phải máy ảo/giả lập) và kiểm tra key còn hạn.');
        return;
    }
    _kvToast('[KeyVault] ' + ((err && err.message) || 'Lỗi tải/thực thi'));
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
   CACHE KEYS — [v3.0] loader mới KHÔNG lưu code / khoá giải mã vào GM storage.
   Các key dưới đây chỉ còn để xoá dấu vết bản cũ (anti-devtools / _purgeAllTraces cũng gọi tới).
   ============================================================ */
const _KEY_CODE = '__olm_kv_code2__' + (SNIPPET_ID || 'auto');
const _KEY_META = '__olm_kv_meta2__' + (SNIPPET_ID || 'auto');
(function _kvPurgeLegacyCache() {
    ['_kv_aes64', '__olm_kv_k1b__', _KEY_CODE, _KEY_META].forEach(function(k) {
        try { GM_deleteValue(k); } catch (_) {}
    });
    try {   // dọn nốt cache từng file (__olm_kv_part2__<id>) và mọi blob mã hoá của bản cũ
        if (typeof GM_listValues === 'function') {
            GM_listValues().forEach(function(k) {
                if (String(k).indexOf('__olm_kv_') === 0) { try { GM_deleteValue(k); } catch (_) {} }
            });
        }
    } catch (_) {}
})();

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
    // Gói nhiều file .js (_KV_MULTI) → inject lần lượt từng file (giữ nguyên thứ tự)
    if (typeof scriptCode === 'string' && scriptCode.indexOf(_KV_MULTI) === 0) {
        let parts = [];
        try { parts = JSON.parse(scriptCode.slice(_KV_MULTI.length)); } catch (_) {}
        scriptCode = null;
        for (let i = 0; i < parts.length; i++) {
            const one = parts[i];
            parts[i] = null;
            _selfDestructInject(one);
        }
        return;
    }
    _selfDestructInject(scriptCode);
    scriptCode = null; // Đảm bảo biến caller cũng null
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
   MAIN LOADER — [v3.0] Secure Pipeline (không cache code):
   1) License Key (nhập 1 lần, lưu lại)
   2) Thu thập thiết bị (tên máy · Android/iOS · phiên bản…) + IP thật của máy
   3) POST /api/g/s → server kiểm tra thiết bị → IP → key → 128-bit → giải mã file.js gốc → link ngẫu nhiên mã hoá
   4) Mở phong bì → GET link → giải mã gói → trả về TOÀN BỘ code file.js cho caller inject
   Mỗi lần tải trang đều xác thực lại từ đầu — không còn chạy từ cache nên key hết hạn / bị khoá / đổi máy có hiệu lực ngay.
   ============================================================ */
const _KV_MULTI = '\u0001KVMULTI\u0001';

async function _kvFetchAndRun(onSuccess, onError) {
    // 0) License Key
    let lic = null;
    try { lic = await _kvEnsureAccess(); } catch (_) {}
    if (!lic) { onError('Chưa có License Key.<br>Reload trang và nhập License Key để tải code.'); return; }

    try {
        _setStatusText('ĐANG THU THẬP THÔNG TIN THIẾT BỊ...');
        const dev = await _kvCollectDevice();
        _setStatusText('ĐANG XÁC ĐỊNH IP CỦA MÁY...');
        const ip = await _kvGetRealIP();

        let code = null;
        for (let round = 1; round <= 2 && !code; round++) {
            _setStatusText('ĐANG XÁC THỰC THIẾT BỊ · IP · KEY...');
            const w = await _kvPipelineSession(lic, dev, ip);
            let env;
            try { env = await _kvOpenEnvelope(w, lic); }
            catch (_) { throw _kvErr('Giải mã phong bì thất bại — kiểm tra License Key.', { kvStop: true }); }
            try {
                _setStatusText('ĐANG TẢI CORE MODULE (LINK NGẪU NHIÊN)...');
                const pkg = await _kvFetchLink(env.id);
                code = await _kvDecryptPackage(env, pkg);
            } catch (e) {
                if (e && e.kvRelink && round < 2) continue;   // link chết → xin phiên mới đúng 1 lần
                throw (e && (e.kvStop || e.kvRelink)) ? e : _kvErr('Giải mã gói code thất bại: ' + String((e && e.message) || 'lỗi').replace(/[<>]/g, ''), { kvStop: true });
            }
        }
        if (!code || code.trim().length < 10) throw _kvErr('Server trả về code rỗng.', { kvStop: true });

        _setStatusText('✔ XÁC THỰC XONG — KHỞI ĐỘNG...');
        onSuccess(code, 'fresh');
        code = null;
    } catch (e) {
        _kvHandleError(e);
        onError(String((e && e.message) || 'Lỗi tải code').replace(/[<>]/g, ''));
    }
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
            { msg: 'XÁC THỰC THIẾT BỊ & IP...', delay: 1400 },
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
            _kvMarkIntroSeen();   // [v3.1] lần đầu xong → từ lần vào lại thứ 2 chạy ngầm, không hiện hiệu ứng nữa
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
/* [v3.1] CHỈ HIỆN HIỆU ỨNG Ở LẦN ĐẦU:
   - Lần đầu cài loader (chưa có cờ _kv_intro_seen) → hiện matrix loader như cũ (ở bất kỳ trang OLM nào).
   - Kích hoạt thành công → lưu cờ vào GM storage (bền, không mất khi đóng tab / thoát app).
   - Từ lần vào lại thứ 2 → KHÔNG hiện hiệu ứng, tự xác thực + inject JS ngầm. */
const loaderAlreadySeen = _kvIntroSeen();

// Đã xem hiệu ứng ở lần đầu → xác thực + kéo code ngầm, inject thẳng khi xong
if (loaderAlreadySeen) {
    // [v3.0] Không còn cache code trong GM storage → mỗi lần tải trang đều xác thực lại (thiết bị · IP · key) rồi mới nhận code
    _kvFetchAndRun(
        (code) => { injectScriptToDOM(code); },
        (_err) => { /* Lỗi đã hiện qua toast — không có gì để inject */ }
    );
} else {
    // Lần đầu → hiện matrix loader animation (cờ được lưu trong _doFinishSuccess khi kích hoạt xong)
    showLoaderThenInject();
}
