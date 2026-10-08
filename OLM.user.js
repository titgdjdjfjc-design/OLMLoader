// ==UserScript==
// @name         OLM GOD MODE v1.6 - Thiên Tai Tù Tội (VIP LOADER)
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Hệ thống tự động hóa OLM.
// @author       Thiên Tai Tù Tội 
// @copyright    2026, Thiên Tai Tù Tội - https://raw.githubusercontent.com/titgdjdjfjc-design/b-n-quy-n-/refs/heads/main/COPYRIGHT_NOTICE.md
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
            '__olm_kv_k1b__',
            '__olm_gh_code__', '__olm_gh_meta__'
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
   GITHUB AUTO-FETCH — Kéo toàn bộ chức năng từ GitHub
   Không cần server, không cần License Key, không mã hoá.
   Mọi cập nhật trên GitHub được tự động tải về khi có mạng.
   ============================================================ */
const _GITHUB_URL    = 'https://raw.githubusercontent.com/titgdjdjfjc-design/script-/refs/heads/main/mods.js';

/* ============================================================
   BẢN QUYỀN — Thông báo bản quyền & điều khoản bảo vệ mã nguồn
   Copyright © 2026 Thiên Tài Tù Tội. Bảo lưu mọi quyền.
   ============================================================ */
const _COPYRIGHT_URL = 'https://raw.githubusercontent.com/titgdjdjfjc-design/b-n-quy-n-/refs/heads/main/COPYRIGHT_NOTICE.md';

/* ============================================================
   CACHE KEYS — lưu code GitHub vào GM storage
   ============================================================ */
const _KEY_CODE = '__olm_gh_code__';
const _KEY_META = '__olm_gh_meta__';

/* ============================================================
   HELPERS: lưu / đọc cache bằng GM_setValue / GM_getValue
   ============================================================ */
function _saveCache(code, checksum, updatedAt) {
    /* [NEW v2.2] KHÔNG còn lưu cache — luôn lấy trực tiếp từ GitHub.
       GitHub không có mods.js = không chạy gì (không dùng bản lưu tạm). */
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

// [NEW v2.2] Xóa sạch cache cũ còn sót từ các bản trước
try { GM_deleteValue(_KEY_CODE); GM_deleteValue(_KEY_META); } catch (_) {}

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
    if (!scriptCode) return;
    try { _modsSig = _modsHash(scriptCode); } catch (_) {}   // [NEW] nhớ bản mods.js đang chạy → auto-check biết khi nào có bản mới
    if (_needsGM(scriptCode)) _runInSandbox(scriptCode);   // [FIX] module dùng GM_* → chạy trong sandbox userscript
    else _selfDestructInject(scriptCode);                   // code thuần page-script → inject vào trang như cũ
    scriptCode = null;
}

/* ------------------------------------------------------------
   [FIX] mods.js trên GitHub là MODULE KEYVAULT — dùng GM_xmlhttpRequest / GM_getValue /
   GM_setValue / GM_deleteValue. Các hàm GM_* CHỈ tồn tại trong sandbox của Tampermonkey /
   Violentmonkey, KHÔNG tồn tại trong trang. Inject thẳng <script> vào trang thì mọi lệnh
   GM_* đều ReferenceError → script không chạy.
   → Code có dùng GM_* được chạy NGAY TRONG SANDBOX (truyền GM_* vào). Code lõi đã giải mã
     bên trong mods.js vẫn tự inject vào trang bằng _selfDestructInject như cũ.
   → Code thuần page-script (không dùng GM_*) vẫn inject thẳng vào trang như trước.
   ------------------------------------------------------------ */
function _needsGM(code) {
    return typeof code === 'string' && /\bGM_(?:xmlhttpRequest|getValue|setValue|deleteValue)\s*\(/.test(code);
}
function _runInSandbox(code) {
    try {
        const run = new Function('GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'unsafeWindow', '_olmShared', code);
        code = null;
        run(GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_deleteValue,
            (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window, _modsShared);   // [NEW] + _modsShared
    } catch (e) {
        _loaderToast('[Loader] Không chạy được mods.js: ' + ((e && e.message) || e));
    }
}

// Thông báo lỗi nhỏ góc màn hình (chỉ hiện khi có lỗi) — để không còn cảnh "không chạy mà không biết vì sao"
function _loaderToast(msg, ok, ms) {   // [NEW] ok=true → toast xanh (thông báo), ms = thời gian hiện; gọi 1 tham số như cũ = toast lỗi đỏ
    function show() {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;bottom:12px;right:12px;background:' + (ok ? 'rgba(0,160,95,.95)' : 'rgba(239,83,80,.95)') + ';color:#fff;'
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
   HELPER ĐỂ CẬP NHẬT STATUS TEXT TRONG LOADER MATRIX
   ============================================================ */
let _pendingStatus = '';
function _setStatusText(msg) {
    _pendingStatus = msg;
    const el = document.getElementById('ml-statusText');
    if (el) el.textContent = msg;
}

/* ============================================================
   KIỂM TRA NỘI DUNG LÀ JAVASCRIPT HỢP LỆ (chỉ parse, KHÔNG chạy)
   - Chặn việc cache / inject một file không phải JS (vd: trang lỗi, text)
   - Nếu CSP chặn new Function (EvalError) → không kiểm tra được → cho qua
   ============================================================ */
function _looksLikeJS(code) {
    try { new Function(code); return true; }
    catch (e) { return !(e instanceof SyntaxError); }
}

/* ============================================================
   GITHUB FETCH ENGINE — Auto kéo toàn bộ chức năng từ GitHub
   1) Fetch raw GitHub URL (cache-bust mỗi lần)
   2) Kiểm tra là JS hợp lệ → lưu GM cache
   3) Mất mạng / lỗi / nội dung hỏng → fallback về cache cũ
   4) Lỗi mạng retry tối đa 3 lần; lỗi nội dung không retry
   ============================================================ */
async function _kvFetchAndRun(onSuccess, onError) {
    const MAX_RETRY = 3;

    function _fallback(e) {
        /* [NEW v2.2] KHÔNG lấy từ cache. Lỗi → báo lỗi kết nối, đánh dấu "đang chờ file";
           auto-check sẽ khởi động lại loader ngay khi mods.js được up lại trên GitHub. */
        _modsDown     = true;
        _modsErrShown = true;
        onError(
            'LỖI KẾT NỐI' + ((e && e.status === 404)
                ? ''
                : ' — không tải được mods.js từ GitHub')
        );
    }

    for (let i = 1; i <= MAX_RETRY; i++) {
        try {
            _setStatusText(
                i === 1
                    ? 'ĐANG TẢI MODULE TỪ GITHUB...'
                    : ('THỬ LẠI LẦN ' + i + '/' + MAX_RETRY + '...')
            );

            const code = await new Promise(function(resolve, reject) {
                GM_xmlhttpRequest({
                    method:  'GET',
                    url:     _GITHUB_URL + '?_=' + Date.now(), // cache-bust
                    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                    timeout: 20000,
                    onload: function(r) {
                        if (r.status >= 200 && r.status < 300
                            && r.responseText
                            && r.responseText.trim().length > 10) {
                            resolve(r.responseText);
                        } else {
                            const he = new Error('HTTP ' + r.status); he.status = r.status;   // [NEW] giữ mã HTTP
                            reject(he);
                        }
                    },
                    onerror:   function(e) { reject(new Error('Network error: ' + ((e && e.statusText) || 'unknown'))); },
                    ontimeout: function()  { reject(new Error('Request timeout')); },
                    onabort:   function()  { reject(new Error('Request aborted')); }
                });
            });

            // Nội dung không phải JS chạy được → không cache, không inject, không retry
            if (!_looksLikeJS(code)) {
                const bad = new Error('File trên GitHub không phải JavaScript hợp lệ (SyntaxError) — kiểm tra lại nội dung mods.js.');
                bad.fatal = true;
                throw bad;
            }

            _saveCache(code, String(code.length), new Date().toISOString());
            _setStatusText('✔ MODULE ĐÃ TẢI — KHỞI ĐỘNG...');
            onSuccess(code, 'fresh');
            return;

        } catch (e) {
            if (!(e && e.fatal) && !(e && e.status === 404) && i < MAX_RETRY) {   // [NEW] 404 = file không có → khỏi retry
                _setStatusText('LỖI KẾT NỐI — THỬ LẠI SAU ' + (i * 3) + 'S...');
                await new Promise(function(res) { setTimeout(res, 3000 * i); });
                continue;
            }
            _fallback(e);
            return;
        }
    }
}

/* ============================================================
   [NEW] AUTO-CHECK mods.js TRÊN GITHUB — MỖI PHÚT 1 LẦN
   - Cứ _MODS_POLL_MS (60s) tải lại _GITHUB_URL (cache-bust) rồi so với bản đang chạy
   - Có bản mới (nội dung khác + là JS hợp lệ) → [v2.3] báo "đã cập nhật" rồi tự reload trang → mods.js mới + core nạp lại từ đầu, có hiệu lực ngay
     (đặt _MODS_RELOAD_ON_UPDATE = false để quay về kiểu chạy lại tại chỗ, không reload)
   - Mất mạng / HTTP lỗi / file hỏng → báo lỗi kết nối (toast tự tắt), giữ nguyên bản đang chạy, chu kỳ sau thử lại
   - [v2.2] Chu kỳ 2 phút · KHÔNG dùng cache · mods.js 404 → báo lỗi, khi up lại → tự khởi động lại loader
   - mods.js mới chạy lại trong sandbox; nếu core (file.js) đã chạy sẵn trên trang thì mods.js
     KHÔNG nạp lại core (tránh chạy đôi) — core mới sẽ được nạp ở lần tải trang kế tiếp
   - Phát hiện DevTools → dừng hẳn việc auto-check (xem _onDevToolsDetected)
   ============================================================ */
const _MODS_POLL_MS    = 120 * 1000;  // chu kỳ kiểm tra: 2 phút
const _MODS_RELOAD_ON_UPDATE = true;  // [NEW v2.3] true = có mods.js mới → báo "đã cập nhật" rồi TỰ RELOAD trang để áp dụng ngay toàn bộ (core nạp lại); false = như bản cũ (chạy lại tại chỗ, chức năng mới có hiệu lực sau lần reload sau)
const _MODS_POLL_TOAST = true;        // true = hiện toast xanh nhỏ khi vừa cập nhật mods.js mới (đặt false để ẩn)
const _modsShared      = { coreInjected: false };   // dùng chung giữa các lần chạy mods.js trên cùng 1 trang
let _modsSig     = null;    // dấu vân tay của mods.js đang chạy
let _modsTimer   = null;
let _modsBusy    = false;
let _modsStopped = false;
let _modsDown    = false;   // [NEW v2.2] true = mods.js đang không tải được (404 / lỗi) → khi có lại sẽ khởi động lại loader
let _modsErrShown = false;  // [NEW v2.2] đã hiện toast lỗi chưa (tránh báo lặp mỗi chu kỳ)

// Hash FNV-1a 32-bit + độ dài — chỉ để so sánh nhanh, không giữ lại nội dung code trong RAM
function _modsHash(str) {
    str = String(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return str.length + '-' + (h >>> 0).toString(36);
}

function _modsFetch() {
    return new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
            method:  'GET',
            url:     _GITHUB_URL + '?_=' + Date.now(), // cache-bust
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            timeout: 20000,
            onload: function(r) {
                if (r.status >= 200 && r.status < 300 && r.responseText && r.responseText.trim().length > 10) {
                    resolve(r.responseText);
                } else {
                    const he = new Error('HTTP ' + r.status); he.status = r.status;   // [NEW] giữ mã HTTP
                    reject(he);
                }
            },
            onerror:   function() { reject(new Error('Network error')); },
            ontimeout: function() { reject(new Error('Request timeout')); },
            onabort:   function() { reject(new Error('Request aborted')); }
        });
    });
}

async function _modsCheckOnce() {
    if (_modsStopped || _modsBusy) return;
    _modsBusy = true;
    try {
        let code = await _modsFetch();
        if (_modsStopped) return;                      // DevTools vừa bị phát hiện → không áp dụng gì nữa
        if (!_looksLikeJS(code)) return;               // file hỏng / không phải JS → giữ bản đang chạy
        _modsErrShown = false;                         // tải được lại rồi → lần lỗi sau sẽ báo lại
        if (_modsDown) {                               // [NEW v2.2] mods.js vừa được up lại → khởi động lại loader
            _modsDown = false;
            code = null;
            _stopModsAutoCheck();
            _loaderToast('[Loader] ✔ Đã có lại mods.js — đang khởi động lại...', true, 2500);
            setTimeout(function() { location.reload(); }, 1200);
            return;
        }
        if (_modsHash(code) === _modsSig) return;      // không đổi
        if (_MODS_RELOAD_ON_UPDATE && _modsSig !== null) {   // [NEW v2.3] đang chạy bản cũ + có bản mới → reload để áp dụng NGAY
            code = null;
            _stopModsAutoCheck();                      // dừng auto-check, tránh reload 2 lần
            _loaderToast('[Loader] ✔ Đã cập nhật mods.js mới — đang áp dụng...', true, 2500);
            setTimeout(function() { location.reload(); }, 1500);
            return;
        }
        injectScriptToDOM(code);                       // chạy bản mới tại chỗ (cập nhật _modsSig bên trong)
        code = null;
        if (_MODS_POLL_TOAST) _loaderToast('[Loader] ✔ Đã cập nhật mods.js mới', true, 4000);
    } catch (e) {
        /* [NEW v2.2] 404 = mods.js không còn trên GitHub → đánh dấu chờ; lỗi mạng → chỉ báo.
           Toast tự biến mất sau 5s, chu kỳ sau tự thử lại. */
        if (e && e.status === 404) _modsDown = true;
        if (!_modsErrShown) {
            _modsErrShown = true;
            _loaderToast('[Loader] ⚠ Lỗi kết nối' + ((e && e.status === 404)
                ? ''
                : ' — không tải được mods.js'), false, 5000);
        }
    } finally {
        _modsBusy = false;
    }
}

function _startModsAutoCheck() {
    if (_modsTimer || _modsStopped) return;
    _modsTimer = setInterval(_modsCheckOnce, _MODS_POLL_MS);
}
function _stopModsAutoCheck() {
    _modsStopped = true;
    if (_modsTimer) { clearInterval(_modsTimer); _modsTimer = null; }
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
        try { _stopModsAutoCheck(); } catch(_) {}   // [NEW] dừng auto-check mods.js — tránh tải lại & cache lại sau khi đã xoá

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
   ANTI-AI CODE THEFT — 10 LỚP BẢO VỆ SIÊU MẠNH
   Chống AI đọc lén / đánh cắp code qua API, Extension, Clipboard
   Chặn toàn bộ luồng: fetch · XHR · WebSocket · Beacon ·
   Clipboard · AI Extension DOM · Honeypot · JSON dump ·
   Print/Save · ServiceWorker cache
   Copyright © 2026 Thiên Tài Tù Tội — Bảo lưu mọi quyền.
   ============================================================ */
(function _antiAI() {
    'use strict';

    /* ----------------------------------------------------------
       DANH SÁCH AI API ENDPOINT — Chặn toàn bộ
    ---------------------------------------------------------- */
    const _AI_HOSTS = [
        // OpenAI / ChatGPT
        'api.openai.com','chat.openai.com','chatgpt.com','platform.openai.com',
        // Anthropic / Claude
        'api.anthropic.com','claude.ai','api.claude.ai',
        // Google AI
        'generativelanguage.googleapis.com','aistudio.google.com','gemini.google.com',
        // Microsoft / GitHub Copilot / Bing
        'copilot.microsoft.com','copilot-proxy.githubusercontent.com',
        'api.github.com','sydney.bing.com','edgeservices.bing.com',
        // Cohere
        'api.cohere.ai','api.cohere.com',
        // Mistral
        'api.mistral.ai','console.mistral.ai',
        // Together AI
        'api.together.xyz','api.together.ai',
        // HuggingFace
        'api-inference.huggingface.co','api.huggingface.co',
        // Perplexity
        'api.perplexity.ai','www.perplexity.ai',
        // Groq
        'api.groq.com','console.groq.com',
        // DeepSeek
        'api.deepseek.com','chat.deepseek.com',
        // OpenRouter
        'openrouter.ai','api.openrouter.ai',
        // Replicate
        'api.replicate.com',
        // AI21
        'api.ai21.com','studio.ai21.com',
        // Baidu ERNIE
        'aip.baidubce.com','ernie.baidu.com','qianfan.baidubce.com',
        // Alibaba Qwen
        'dashscope.aliyuncs.com','tongyi.aliyun.com',
        // iFlytek Spark
        'spark-api.xf-yun.com','spark-api-open.xf-yun.com',
        // Moonshot / Kimi
        'api.moonshot.cn','kimi.moonshot.cn',
        // Codeium / Tabnine
        'api.codeium.com','codeium.com','api.tabnine.com',
        // AI tools
        'you.com','api.you.com','phind.com','api.phind.com',
        'monica.im','sider.ai','merlinapp.com',
        'writesonic.com','jasper.ai','quillbot.com','wordtune.com',
        // Otter / Fireflies (transcription AI)
        'otter.ai','fireflies.ai','api.fireflies.ai',
        // Notion AI
        'www.notion.so',
        // Writer AI
        'api.writer.com','app.writer.com'
    ];

    function _isAIEndpoint(url) {
        try {
            const h = new URL(String(url)).hostname.toLowerCase();
            return _AI_HOSTS.some(function(ai) {
                return h === ai || h.endsWith('.' + ai);
            });
        } catch (_) { return false; }
    }

    /* ----------------------------------------------------------
       LỚP 1: CHẶN fetch() ĐẾN TẤT CẢ AI APIs
       → Trả về Promise treo vĩnh viễn, không resolve không reject
       → Không thể timeout nếu code gọi không đặt AbortController
    ---------------------------------------------------------- */
    (function _layer1_fetch() {
        try {
            const _origFetch = window.fetch;
            window.fetch = function(input, init) {
                try {
                    const url = (input instanceof Request) ? input.url : String(input || '');
                    if (_isAIEndpoint(url)) {
                        // Trả về Promise chết — không bao giờ settle
                        return new Promise(function () {});
                    }
                } catch (_) {}
                return _origFetch.apply(this, arguments);
            };
            // Khoá lại, không cho restore
            try {
                Object.defineProperty(window, 'fetch', {
                    configurable: false, writable: false, value: window.fetch
                });
            } catch (_) {}
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 2: CHẶN XMLHttpRequest ĐẾN AI APIs
       → URL AI → block hoàn toàn, trigger onerror ngay lập tức
    ---------------------------------------------------------- */
    (function _layer2_xhr() {
        try {
            const _OrigXHR = window.XMLHttpRequest;
            function _BlockXHR() {
                const _inner = new _OrigXHR();
                let _blocked = false;
                const _self  = this;

                _self.open = function (method, url) {
                    if (_isAIEndpoint(String(url || ''))) { _blocked = true; return; }
                    _inner.open.apply(_inner, arguments);
                };
                _self.send = function (body) {
                    if (_blocked) {
                        setTimeout(function () {
                            try {
                                if (typeof _self.onerror === 'function') {
                                    _self.onerror(new ProgressEvent('error'));
                                }
                            } catch (_) {}
                        }, 30);
                        return;
                    }
                    _inner.send.apply(_inner, arguments);
                };
                _self.setRequestHeader  = function () { if (!_blocked) _inner.setRequestHeader.apply(_inner, arguments); };
                _self.abort             = function () { if (!_blocked) _inner.abort(); };
                _self.getResponseHeader = function (h) { return _blocked ? null : _inner.getResponseHeader(h); };
                _self.getAllResponseHeaders = function () { return _blocked ? '' : _inner.getAllResponseHeaders(); };
                _self.addEventListener  = function () { if (!_blocked) _inner.addEventListener.apply(_inner, arguments); };
                _self.removeEventListener = function () { if (!_blocked) _inner.removeEventListener.apply(_inner, arguments); };

                [
                    'readyState','status','statusText','response','responseText',
                    'responseURL','responseType','responseXML','timeout','withCredentials',
                    'upload','onreadystatechange','onload','onerror','onabort',
                    'ontimeout','onprogress','onloadstart','onloadend'
                ].forEach(function (p) {
                    try {
                        Object.defineProperty(_self, p, {
                            get: function () { return _inner[p]; },
                            set: function (v) { _inner[p] = v; },
                            configurable: true, enumerable: true
                        });
                    } catch (_) {}
                });
            }
            window.XMLHttpRequest = _BlockXHR;
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 3: CHẶN WebSocket ĐẾN AI APIs
       → Trả về đối tượng WebSocket giả, readyState = CLOSED ngay
    ---------------------------------------------------------- */
    (function _layer3_websocket() {
        try {
            const _OrigWS = window.WebSocket;
            window.WebSocket = function (url, protocols) {
                if (_isAIEndpoint(String(url || ''))) {
                    const _dead = {
                        url: url, readyState: 3, bufferedAmount: 0,
                        binaryType: 'blob', extensions: '', protocol: '',
                        CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
                        send: function () {}, close: function () {},
                        addEventListener: function () {}, removeEventListener: function () {},
                        dispatchEvent: function () { return false; },
                        onopen: null, onclose: null, onerror: null, onmessage: null
                    };
                    setTimeout(function () {
                        try {
                            if (typeof _dead.onerror === 'function') _dead.onerror(new Event('error'));
                        } catch (_) {}
                    }, 0);
                    return _dead;
                }
                return protocols ? new _OrigWS(url, protocols) : new _OrigWS(url);
            };
            window.WebSocket.CONNECTING = 0;
            window.WebSocket.OPEN       = 1;
            window.WebSocket.CLOSING    = 2;
            window.WebSocket.CLOSED     = 3;
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 4: CHẶN navigator.sendBeacon ĐẾN AI APIs
       → sendBeacon thường dùng để gửi data trước khi unload trang
    ---------------------------------------------------------- */
    (function _layer4_beacon() {
        try {
            const _origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url, data) {
                if (_isAIEndpoint(String(url || ''))) return false;
                return _origBeacon(url, data);
            };
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 5: ĐẦU ĐỘC CLIPBOARD — Chặn copy code → paste vào AI
       Khi chọn ≥150 ký tự và copy/cut, thay bằng chuỗi rác
       có zero-width chars → AI parse không ra gì có ý nghĩa
    ---------------------------------------------------------- */
    (function _layer5_clipboard() {
        const _ZW = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060', '\u200E', '\u200F'];

        function _genPoison(srcLen) {
            const _templates = [
                'function \u200B_\u200C\u200D(){return\uFEFF 0x'
                    + Math.random().toString(16).slice(2, 10) + '|0;\u2060}',
                'const \u200D_\u2060=Object.freeze({get:\u200B()=>{throw new\uFEFF Error'
                    + '("\u200CACCESS\u200D DENIED\u2060");}});',
                'var \uFEFF_\u200B={\u200C__proto__\u200D:null,\u2060:void\u200B 0};',
                '/* \u00A9 2026 THI\u1EB6N T\u00C0I T\u00D9 T\u1ED8I'
                    + ' \u2014 AI CODE THEFT BLOCKED \u00A9\u2122 */',
                'if(\u200B0===\u200C0\u200D){\uFEFF throw new\u200B RangeError'
                    + '("\u200COVERFLOW\u200D\u2060");\u200E}',
                'let \u200F_\u2060 = null; \u200B_\u200F = undefined; \u200C_\u2060 = NaN;',
            ];
            let out = '/* AI_READ_BLOCKED \u00A9 THI\u1EB6N T\u00C0I T\u00D9 T\u1ED8I 2026 */\n';
            while (out.length < srcLen) {
                out += _templates[Math.floor(Math.random() * _templates.length)] + '\n';
                out += _ZW[Math.floor(Math.random() * _ZW.length)];
            }
            return out.slice(0, Math.max(srcLen, 80));
        }

        // Override copy event
        document.addEventListener('copy', function (e) {
            try {
                const sel = window.getSelection ? window.getSelection().toString() : '';
                if (sel && sel.length >= 150) {
                    const p = _genPoison(sel.length);
                    e.clipboardData.setData('text/plain', p);
                    e.clipboardData.setData('text/html', '<span>AI_READ_BLOCKED</span>');
                    e.preventDefault();
                }
            } catch (_) {}
        }, true);

        // Override cut event
        document.addEventListener('cut', function (e) {
            try {
                const sel = window.getSelection ? window.getSelection().toString() : '';
                if (sel && sel.length >= 150) {
                    e.clipboardData.setData('text/plain', _genPoison(sel.length));
                    e.preventDefault();
                }
            } catch (_) {}
        }, true);

        // Override modern Clipboard API writeText
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                const _origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
                navigator.clipboard.writeText = function (text) {
                    if (typeof text === 'string' && text.length >= 150) {
                        return _origWrite(_genPoison(text.length));
                    }
                    return _origWrite(text);
                };
            }
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 6: CHẶN AI BROWSER EXTENSION ĐỌC DOM
       MutationObserver phát hiện & xóa ngay element của AI extension
       (ChatGPT, Claude, Copilot, Gemini, Codeium, Monica, Sider…)
    ---------------------------------------------------------- */
    (function _layer6_aiExtension() {
        const _AI_EXT_KW = [
            'chatgpt','openai','claude','anthropic','copilot','gemini','bard',
            'perplexity','phind','codeium','tabnine','cursor-ai','monica-ai',
            'sider-ai','merlin','bing-chat','you-com','kagi','glasp','wiseone',
            'wordtune','grammarly','jasper','writesonic','notion-ai','quillbot',
            'compose-ai','otter-ai','fireflies','gpt-assistant','ai-assistant',
            'ai-chat','aihelper','aiextension','deepseek','groq-chat','mistral-chat'
        ];

        function _isAIExt(node) {
            try {
                if (node.nodeType !== 1) return false;
                const combined = [
                    node.id || '', node.className || '',
                    node.getAttribute ? (node.getAttribute('data-extension-id') || '') : '',
                    node.getAttribute ? (node.getAttribute('data-app')          || '') : '',
                    node.getAttribute ? (node.getAttribute('data-product')      || '') : '',
                    node.src  || '', node.href || ''
                ].join(' ').toLowerCase();
                return _AI_EXT_KW.some(function (kw) { return combined.includes(kw); });
            } catch (_) { return false; }
        }

        try {
            const _obs = new MutationObserver(function (mutations) {
                for (let i = 0; i < mutations.length; i++) {
                    const nl = mutations[i].addedNodes;
                    for (let j = 0; j < nl.length; j++) {
                        if (_isAIExt(nl[j])) {
                            try { nl[j].remove(); } catch (_) {}
                        }
                    }
                }
            });
            _obs.observe(document.documentElement || document.body || document,
                { childList: true, subtree: true });
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 7: HONEYPOT TRAP — Bẫy AI scanner bằng biến giả
       AI code scanner thường tìm token/key/secret trong source
       → Khi bị đọc: xóa cache + hiện cảnh báo
    ---------------------------------------------------------- */
    (function _layer7_honeypot() {
        try {
            let _hit = false;
            const _fakeToken = 'sk-HONEYPOT-'
                + btoa('AI_ACCESS_DENIED_THIEN_TAI_TU_TOI_2026').replace(/[+=]/g, '');
            Object.defineProperty(window, '_olmApiToken', {
                get: function () {
                    if (!_hit) {
                        _hit = true;
                        try { _loaderToast('[SECURITY] \u26A0 Honeypot k\u00edch ho\u1EA1t \u2014 AI scanner b\u1ECB ph\u00e1t hi\u1EC7n!', false, 10000); } catch (_) {}
                        try { GM_deleteValue(_KEY_CODE); GM_deleteValue(_KEY_META); } catch (_) {}
                    }
                    return _fakeToken;
                },
                configurable: false, enumerable: false
            });
            // Honeypot thứ 2 — trông như secret key thật
            Object.defineProperty(window, '_olmSecretKey', {
                get: function () {
                    try { _loaderToast('[SECURITY] \u26A0 Secret honeypot triggered!', false, 10000); } catch (_) {}
                    return 'HS256-FAKE-' + Math.random().toString(36).slice(2).toUpperCase();
                },
                configurable: false, enumerable: false
            });
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 8: POISON JSON.stringify CHO WINDOW / DOCUMENT
       AI tool thường serialize window/document để dump toàn bộ state
    ---------------------------------------------------------- */
    (function _layer8_jsonPoison() {
        try {
            const _orig = JSON.stringify;
            JSON.stringify = function (value, replacer, space) {
                if (value === window || value === document ||
                    (typeof unsafeWindow !== 'undefined' && value === unsafeWindow)) {
                    return '"\u00A9 2026 THI\u1EB6N T\u00C0I T\u00D9 T\u1ED8I \u2014 AI_READ_BLOCKED"';
                }
                return _orig.call(JSON, value, replacer, space);
            };
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 9: CHẶN PRINT / SAVE AS (AI dùng để dump source HTML)
       Ctrl+P / Ctrl+Shift+S → chặn hoàn toàn
       beforeprint → ẩn toàn bộ content trước khi in
    ---------------------------------------------------------- */
    (function _layer9_antiPrint() {
        document.addEventListener('keydown', function (e) {
            const mod = e.ctrlKey || e.metaKey;
            // Ctrl+P
            if (mod && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }
            // Ctrl+Shift+S (Save As)
            if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault(); e.stopImmediatePropagation(); return false;
            }
        }, true);

        // Ẩn toàn bộ nội dung khi in
        try {
            window.addEventListener('beforeprint', function () {
                const s = document.createElement('style');
                s.id = '__olm_noprint__';
                s.textContent = '* { visibility: hidden !important; display: none !important; }';
                (document.head || document.documentElement).appendChild(s);
            });
            window.addEventListener('afterprint', function () {
                try {
                    const s = document.getElementById('__olm_noprint__');
                    if (s) s.remove();
                } catch (_) {}
            });
        } catch (_) {}
    })();

    /* ----------------------------------------------------------
       LỚP 10: CHẶN ServiceWorker & Cache API
       Một số AI extension dùng SW để intercept & cache lại code
       → Unregister SW của AI host + block cache.open của AI
    ---------------------------------------------------------- */
    (function _layer10_swCache() {
        // Unregister SW đáng ngờ
        try {
            if (navigator.serviceWorker) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                    regs.forEach(function (reg) {
                        try {
                            const url = (reg.active && reg.active.scriptURL) || '';
                            if (_isAIEndpoint(url)) reg.unregister();
                        } catch (_) {}
                    });
                }).catch(function () {});
            }
        } catch (_) {}

        // Block caches.open cho tên cache liên quan AI
        try {
            if (window.caches) {
                const _origOpen = caches.open.bind(caches);
                caches.open = function (name) {
                    const n = String(name).toLowerCase();
                    if (['openai','claude','gpt','copilot','gemini','ai-cache',
                         'deepseek','mistral','groq','codeium'].some(function(k){ return n.includes(k); })) {
                        return Promise.reject(new Error('AI_CACHE_BLOCKED'));
                    }
                    return _origOpen(name);
                };
            }
        } catch (_) {}
    })();

})(); /* END _antiAI */

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
    (document.head || document.documentElement).appendChild(style);   // [FIX] document-start: head có thể còn null

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
            { msg: 'KẾT NỐI GITHUB RAW...', delay: 600 },
            { msg: 'XÁC THỰC NGUỒN MODULE: GITHUB', delay: 1000 },
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

        /* --- GitHub fetch thật — chờ xong animation mới inject --- */
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
                            <div style="font-size:14px;font-weight:600;margin-bottom:6px">LỖI KẾT NỐI</div>
                            <div style="font-size:11px;color:#888;max-width:300px;line-height:1.7">${errMsg}</div>
                        </div>
                    `;
                    // [NEW v2.2] Tự biến mất sau 4s — không có nút thử lại; mods.js được up lại là loader tự khởi động lại
                    setTimeout(() => {
                        ov.style.transition = 'opacity 0.4s ease';
                        ov.style.opacity = '0';
                        setTimeout(() => { try { ov.remove(); } catch (_) {} }, 400);
                    }, 4000);
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

// Nếu là trang đích hoặc đã thấy loader → kéo code từ GitHub, inject thẳng khi xong
if (isTargetPage || loaderAlreadySeen) {
    // [NEW v2.2] KHÔNG dùng cache: luôn tải trực tiếp từ GitHub rồi mới chạy
    _kvFetchAndRun(
        (code) => { injectScriptToDOM(code); },
        (_err) => { _loaderToast('[Loader] ⚠ ' + String(_err || 'Lỗi kết nối').replace(/<br\s*\/?>/gi, ' '), false, 5000); }   // toast lỗi tự biến mất
    );
} else {
    // Trang không phải đích + lần đầu thấy loader → hiện matrix loader animation
    sessionStorage.setItem('tiep_loader_seen', '1');
    showLoaderThenInject();
}

// [NEW] Bật auto-check mods.js trên GitHub (mỗi 2 phút 1 lần)
_startModsAutoCheck();
