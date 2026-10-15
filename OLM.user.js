// ==UserScript==
// @name         KeyVault Gate Loader
// @namespace    keyvault-gate-v2
// @version      2.2
// @description  Loader tối giản: chỉ gọi API server. Menu nhập key, giải mã và chèn file.js đều do server đẩy xuống.
// @match        *://olm.vn/*
// @match        *://*.olm.vn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      serverkey-210-0nyo.onrender.com
// @run-at       document-start
// ==/UserScript==

// ===== EARLY HOOKS v1.0 — Cài hook XHR/Fetch ngay từ document-start =====
// Mục đích: bắt kịp API câu hỏi OLM TRƯỚC KHI loader async + key-check chạy xong.
// Dữ liệu được lưu vào window.__kv_q_buf để OLM_mod_goc.js đọc sau.
;(function _kvEarlyHooks() {
  try {
    var _UW = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    var BUF = _UW.__kv_q_buf = [];
    var Q_KEYS = ['get-question-of-ids', 'get-question', 'get-test'];
    function _kvIsQ(u) {
      var s = String(u || '');
      return Q_KEYS.some(function(k) { return s.indexOf(k) >= 0; });
    }
    // --- Hook XMLHttpRequest ---
    var _kXO = _UW.XMLHttpRequest.prototype.open;
    var _kXS = _UW.XMLHttpRequest.prototype.send;
    _UW.XMLHttpRequest.prototype.open = function(m, u) {
      this.__kvU = String(u || '');
      return _kXO.apply(this, arguments);
    };
    _UW.XMLHttpRequest.prototype.send = function() {
      if (_kvIsQ(this.__kvU)) {
        var _self = this;
        this.addEventListener('loadend', function() {
          try {
            if (_self.status === 200 && _self.responseText) {
              var item = { url: _self.responseURL || _self.__kvU, text: _self.responseText };
              BUF.push(item);
              /* [v3.2] Broadcast real-time cho stage code ngay cả khi hook fetch bị trễ */
              try { _UW.dispatchEvent(new CustomEvent('__kv_qdata', { detail: item })); } catch(_) {}
            }
          } catch(e) {}
        }, { once: true });
      }
      return _kXS.apply(this, arguments);
    };
    // --- Hook Fetch ---
    if (_UW.fetch) {
      var _kF = _UW.fetch;
      _UW.fetch = async function() {
        var args = arguments;
        var res = await _kF.apply(this, args);
        try {
          var u = typeof args[0] === 'string' ? args[0] : ((args[0] && args[0].url) || (res && res.url) || '');
          if (_kvIsQ(u)) {
            res.clone().text().then(function(t) {
              if (t) {
                var item = { url: u, text: t };
                BUF.push(item);
                /* [v3.2] Broadcast real-time cho stage code */
                try { _UW.dispatchEvent(new CustomEvent('__kv_qdata', { detail: item })); } catch(_) {}
              }
            }).catch(function() {});
          }
        } catch(e) {}
        return res;
      };
    }
  } catch(e) { /* im lặng — không được làm hỏng trang */ }
})();

(async function () {
  'use strict';
  const BASE = 'https://serverkey-210-0nyo.onrender.com';

  /* [2.1] Cấu hình tốc độ */
  const TRIES = 4;                   // số lần thử tối đa khi server Render đang "ngủ" (cold start 30-60s)
  const TRY_TIMEOUT = 30000;         // timeout mỗi lần thử (ms)
  const KEEPALIVE = 9 * 60 * 1000;   // ping giữ server thức khi tab olm.vn còn mở (Render ngủ sau ~15 phút). 0 = tắt

  /* Gọi server qua GM_xmlhttpRequest (không dính CORS/CSP của trang) */
  const call = (method, path, body, tmo) => new Promise(resolve => {
    GM_xmlhttpRequest({
      method, url: BASE + path, timeout: tmo || 25000,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      data: body ? JSON.stringify(body) : undefined,
      onload: r => resolve({ status: r.status, text: r.responseText || '' }),
      onerror: () => resolve({ status: 0, text: '' }),
      ontimeout: () => resolve({ status: 0, text: '' })
    });
  });

  /* Những thứ stage do server đẩy xuống được phép dùng */
  const ctx = {
    uw: unsafeWindow,
    gs: k => GM_getValue(k, ''),
    ss: (k, v) => GM_setValue(k, v),
    post: async (path, body, tmo) => {
      const r = await call('POST', path, body, tmo);
      let j = null; try { j = JSON.parse(r.text); } catch (_) {}
      return { status: r.status, json: j };
    },
    get: path => call('GET', path)
  };

  /* Thông tin máy gửi lên ở bước đầu. Server dùng để loại giả lập / máy ảo / bot. */
  async function collectDev() {
    const N = navigator, ua = N.userAgent || '';
    const d = { tp: N.maxTouchPoints | 0, sw: screen.width | 0, sh: screen.height | 0, cores: N.hardwareConcurrency | 0, pl: N.platform || '', wd: N.webdriver === true };
    if (N.userAgentData && typeof N.userAgentData.mobile === 'boolean') d.um = N.userAgentData.mobile;
    let hv = {};
    try { if (N.userAgentData && N.userAgentData.getHighEntropyValues) hv = await N.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'architecture', 'bitness']); } catch (_) {}
    if (/android/i.test(ua)) {
      d.os = 'android';
      const m = /Android\s+([\d.]+)/i.exec(ua);
      d.osv = String(hv.platformVersion || (m && m[1]) || '');
      let model = String(hv.model || '').trim();
      if (!model) { const mm = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/i.exec(ua); if (mm) model = mm[1].trim(); }
      if (model.length < 2 || /^(k|mobile|android)$/i.test(model)) model = '';      // Chrome rút gọn UA → model "K"; Firefox không có model
      d.model = model;
      d.name = model || ('Android ' + String(d.osv).split('.')[0]);
      d.abi = hv.architecture ? (hv.architecture + (hv.bitness || '')) : String(N.platform || '');
    } else if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && N.maxTouchPoints > 1)) {
      d.os = 'ios';
      const m = /OS (\d+)[_.](\d+)(?:[_.](\d+))?/i.exec(ua);
      d.osv = m ? (m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '')) : '';
      d.name = (/iPad/i.test(ua) || /Macintosh/i.test(ua)) ? 'iPad' : (/iPod/i.test(ua) ? 'iPod' : 'iPhone');
    } else {
      d.os = ((/windows|macintosh|linux|cros/i.exec(ua) || ['desktop'])[0]).toLowerCase();   // PC → server từ chối
    }
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); d.gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }
    } catch (_) {}
    return d;
  }

  /* [2.1] Chờ DOM sẵn sàng (thay cho document-idle cũ), nhường trang chạy xong handler DOMContentLoaded rồi mới chạy stage */
  const domReady = new Promise(res => {
    const go = () => setTimeout(res, 0);
    if (document.readyState !== 'loading') go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  });

  /* [2.1] Gọi server NGAY từ document-start (song song lúc trang đang tải) + thử lại khi server Render đang thức dậy.
     Máy ảo / bị từ chối → server trả 403 → dừng ngay, không thử lại, không có gì xảy ra. */
  async function hello() {
    const dev = await collectDev();
    for (let i = 0; i < TRIES; i++) {
      const r = await ctx.post('/api/g/m', { dev }, TRY_TIMEOUT);
      if (r.json) return r.json;
      // thử lại khi: 0 = lỗi mạng/timeout · 2xx không phải JSON = trang chờ của Render · 5xx. Còn 4xx (vd 403) = từ chối thật → dừng
      if (!(r.status < 300 || r.status === 408 || r.status >= 500)) return null;
      if (i < TRIES - 1) await new Promise(s => setTimeout(s, 800 * (i + 1)));
    }
    return null;
  }

  const h = await hello();
  if (!h || !h.ok || typeof h.stage !== 'string') return;
  /* [2.1] Giữ server thức khi tab olm.vn còn mở → lần vào bài tập kế tiếp không phải chờ khởi động lại */
  if (KEEPALIVE) setInterval(() => call('GET', '/', null, 15000), KEEPALIVE);
  await domReady;
  new Function('ctx', h.stage)(ctx);
})();
