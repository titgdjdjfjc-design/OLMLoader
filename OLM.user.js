// ==UserScript==
// @name         KeyVault Gate Loader
// @namespace    keyvault-gate-v2
// @version      2.4
// @description  Loader
// @match        *://olm.vn/*
// @match        *://*.olm.vn/*
// @match        *://chess.com/*
// @match        *://*.chess.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      serverkey-210-0nyo.onrender.com
// @run-at       document-start
// ==/UserScript==

;(function _kvEarlyHooks() {
  try {
    var _UW = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    var BUF = _UW.__kv_q_buf = [];
    var Q_KEYS = ['get-question-of-ids', 'get-question', 'get-test'];
    function _kvIsQ(u) {
      var s = String(u || '');
      return Q_KEYS.some(function(k) { return s.indexOf(k) >= 0; });
    }
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
              try { _UW.dispatchEvent(new CustomEvent('__kv_qdata', { detail: item })); } catch(_) {}
            }
          } catch(e) {}
        }, { once: true });
      }
      return _kXS.apply(this, arguments);
    };
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
                try { _UW.dispatchEvent(new CustomEvent('__kv_qdata', { detail: item })); } catch(_) {}
              }
            }).catch(function() {});
          }
        } catch(e) {}
        return res;
      };
    }
  } catch(e) {}
})();

(async function () {
  'use strict';
  const BASE = 'https://serverkey-210-0nyo.onrender.com';

  const TRIES = 4;
  const TRY_TIMEOUT = 30000;
  const KEEPALIVE = 9 * 60 * 1000;

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
      if (model.length < 2 || /^(k|mobile|android)$/i.test(model)) model = '';
      d.model = model;
      d.name = model || ('Android ' + String(d.osv).split('.')[0]);
      d.abi = hv.architecture ? (hv.architecture + (hv.bitness || '')) : String(N.platform || '');
    } else if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && N.maxTouchPoints > 1)) {
      d.os = 'ios';
      const m = /OS (\d+)[_.](\d+)(?:[_.](\d+))?/i.exec(ua);
      d.osv = m ? (m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '')) : '';
      d.name = (/iPad/i.test(ua) || /Macintosh/i.test(ua)) ? 'iPad' : (/iPod/i.test(ua) ? 'iPod' : 'iPhone');
    } else {
      d.os = ((/windows|macintosh|linux|cros/i.exec(ua) || ['desktop'])[0]).toLowerCase();
    }
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
      if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); d.gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); }
    } catch (_) {}
    return d;
  }

  const domReady = new Promise(res => {
    const go = () => setTimeout(res, 0);
    if (document.readyState !== 'loading') go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  });

  async function hello() {
    const dev = await collectDev();
    for (let i = 0; i < TRIES; i++) {
      const r = await ctx.post('/api/g/m', { dev }, TRY_TIMEOUT);
      if (r.json) return r.json;
      if (!(r.status < 300 || r.status === 408 || r.status >= 500)) return null;
      if (i < TRIES - 1) await new Promise(s => setTimeout(s, 800 * (i + 1)));
    }
    return null;
  }

  const h = await hello();
  if (!h || !h.ok || typeof h.stage !== 'string') return;
  if (KEEPALIVE) setInterval(() => call('GET', '/', null, 15000), KEEPALIVE);
  await domReady;
  // ── GM_* SHIM: chess-hint và các script inject qua stage cần GM APIs ──────
  // new Function() chạy trong scope cô lập, không kế thừa GM_* từ userscript.
  // Truyền các hàm này vào như parameter để script injected có thể dùng trực tiếp.
  var _gmAddStyle = function(css) {
    try {
      if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
      var el = document.createElement('style');
      el.textContent = css;
      (document.head || document.documentElement).appendChild(el);
    } catch(e) {}
  };
  var _gmGetValue = function(key, def) {
    try { return GM_getValue(key, def); } catch(e) { return def; }
  };
  var _gmSetValue = function(key, val) {
    try { GM_setValue(key, val); } catch(e) {}
  };
  var _gmXhr = function(opts) {
    try { GM_xmlhttpRequest(opts); } catch(e) {
      if (opts && opts.onerror) opts.onerror(e);
    }
  };
  new Function(
    'ctx',
    'GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'unsafeWindow',
    h.stage
  )(ctx, _gmAddStyle, _gmGetValue, _gmSetValue, _gmXhr, unsafeWindow);
})();
