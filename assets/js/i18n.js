/**
 * assets/js/i18n.js
 * Whaley AR — lightweight i18n (zh / en)
 *
 * Responsibilities:
 *   - Detect language from localStorage or navigator.language
 *   - Apply translated strings to [data-i18n] / [data-i18n-html] elements
 *   - Inject the 中 / EN language switcher and keep its pressed state in sync
 *   - Keep document.documentElement.lang current for screen readers
 *
 * Notes:
 *   - localStorage access is wrapped in try/catch (throws in some
 *     private/WebView modes); falls back to an in-memory store.
 *   - Web fonts are loaded by the Adobe Fonts (Typekit) snippet in
 *     index.html <head>; this module does not fetch any fonts.
 */

(function (global) {
  'use strict';

  /* ───────────────────────────────────────────
     STORAGE HELPER — safe localStorage wrapper
     SecurityError thrown in some private/WebView
  ─────────────────────────────────────────── */
  var _store = (function () {
    try {
      localStorage.setItem('_wt', '1');
      localStorage.removeItem('_wt');
      return {
        get: function (k) { return localStorage.getItem(k); },
        set: function (k, v) { localStorage.setItem(k, v); },
      };
    } catch (_) {
      // Storage unavailable — fall back to in-memory only
      var mem = {};
      return {
        get: function (k) { return mem[k] || null; },
        set: function (k, v) { mem[k] = v; },
      };
    }
  }());

  /* ───────────────────────────────────────────
     STRINGS
  ─────────────────────────────────────────── */
  var STRINGS = {
    zh: {
      studio:           '鲸鲸工作室 · Whaley Studio',
      titleEn:          'WHALEFALL HAVEN',
      instruction:      '将摄像头对准识别图像',
      btnPreparing:     '系统准备中',
      btnReady:         '开始体验',
      btnLoading:       '加载中',
      btnRetry:         '重试',
      arLoading:        '启动AR中',
      modelPreload:     '正在预加载3D模型...',
      modelAr:          '模型加载中...',
      safariTitle:      '⚠ 浏览器不兼容',
      safariDesc:       '您的浏览器对AR功能支持有限，请使用以下浏览器获得最佳体验：',
      safariBrowsers:   'Chrome · Firefox · Edge',
      copyLink:         '复制链接',
      copyDone:         '已复制！',
      copySuccess:      '链接已复制！请在其他浏览器中打开',
      copyright:        '© 鲸鲸工作室 Whaley Studio',
      copyrightLine1:   '鲸落港 Whalefall Haven',
      copyrightLine2:   '鲸鲸工作室 Whaley Studio',
      errCamera:        '摄像头访问失败，请允许摄像头权限',
      errCameraDenied:  '摄像头权限被拒绝，请允许摄像头访问',
      errCameraNotFound:'未找到摄像头设备',
      errSpine:         'Spine模型加载失败，请检查文件',
      errArGeneric:     'AR系统启动失败，请检查摄像头权限',
      errTimeout:       '场景加载超时，请刷新页面重试',
      errStartPrefix:   '启动失败: ',
      errArPrefix:      'AR错误: ',
      errUnknown:       '未知错误',
    },
    en: {
      studio:           'Whaley Studio',
      titleEn:          'WHALEFALL HAVEN',
      instruction:      'Point your camera at the card',
      btnPreparing:     'Preparing...',
      btnReady:         'Start',
      btnLoading:       'Loading...',
      btnRetry:         'Retry',
      arLoading:        'Starting AR...',
      modelPreload:     'Preloading 3D model...',
      modelAr:          'Loading model...',
      safariTitle:      '⚠ Browser Incompatible',
      safariDesc:       'Your browser has limited AR support. For the best experience, please use:',
      safariBrowsers:   'Chrome · Firefox · Edge',
      copyLink:         'Copy Link',
      copyDone:         'Copied!',
      copySuccess:      'Link copied! Open it in another browser.',
      copyright:        '© Whaley Studio',
      copyrightLine1:   'Whalefall Haven · 鲸落港',
      copyrightLine2:   'Whaley Studio · 鲸鲸工作室',
      errCamera:        'Camera access failed. Please allow camera permission.',
      errCameraDenied:  'Camera permission denied. Please allow camera access.',
      errCameraNotFound:'No camera device found.',
      errSpine:         'Failed to load Spine model.',
      errArGeneric:     'AR failed to start. Please check camera permissions.',
      errTimeout:       'Scene load timed out. Please refresh the page.',
      errStartPrefix:   'Start failed: ',
      errArPrefix:      'AR error: ',
      errUnknown:       'Unknown error',
    },
  };

  /* ───────────────────────────────────────────
     FONTS
     Web fonts are loaded via the Adobe Fonts (Typekit) snippet in
     index.html <head> (kit oep4rkz → "lxgw-wenkai-tc"). This module no
     longer fetches any fonts itself.
  ─────────────────────────────────────────── */

  /* ───────────────────────────────────────────
     LANG DETECTION
  ─────────────────────────────────────────── */
  function detectLang() {
    var saved = _store.get('whaley-lang');
    if (saved === 'zh' || saved === 'en') return saved;
    var nav = (navigator.language || navigator.userLanguage || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  /* ───────────────────────────────────────────
     DOM RENDERER
  ─────────────────────────────────────────── */
  var _lang = 'zh';

  function t(key) {
    return (STRINGS[_lang] && STRINGS[_lang][key]) ||
           (STRINGS['zh'][key]) ||
           key;
  }

  function applyToDOM() {
    // data-i18n → textContent
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    // data-i18n-html → innerHTML (for markup inside strings)
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });

    // Sync html[lang] so screen readers announce the correct language
    document.documentElement.lang = _lang === 'zh' ? 'zh-CN' : 'en';

    // Sync lang toggle active state
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var isActive = btn.dataset.lang === _lang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /* ───────────────────────────────────────────
     PUBLIC API
  ─────────────────────────────────────────── */
  function setLang(lang) {
    if (!STRINGS[lang]) return;
    _lang = lang;
    _store.set('whaley-lang', lang);
    applyToDOM();
  }

  function getLang() { return _lang; }

  /**
   * init() — call once on DOMContentLoaded.
   * Applies strings immediately. Web fonts are loaded by the Adobe Fonts
   * (Typekit) snippet in index.html <head>, so no font loading happens here.
   */
  function init() {
    _lang = detectLang();
    applyToDOM();
  }

  /* ───────────────────────────────────────────
     LANG SWITCHER INJECTION
  ─────────────────────────────────────────── */
  function injectSwitcher() {
    if (document.getElementById('lang-switcher')) return;

    var sw = document.createElement('div');
    sw.id = 'lang-switcher';
    // role="group" + aria-label makes the switcher announced as a unit
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Language / 语言');
    sw.innerHTML =
      '<button class="lang-btn" data-lang="zh" ' +
        'aria-label="切换到中文" aria-pressed="false">中</button>' +
      '<span class="lang-sep" aria-hidden="true"></span>' +
      '<button class="lang-btn" data-lang="en" ' +
        'aria-label="Switch to English" aria-pressed="false">EN</button>';

    sw.addEventListener('click', function (e) {
      var btn = e.target.closest('.lang-btn');
      if (btn) setLang(btn.dataset.lang);
    });

    var overlay = document.getElementById('ui-overlay');
    if (overlay) overlay.appendChild(sw);

    // Sync pressed state immediately
    applyToDOM();
  }

  /* ───────────────────────────────────────────
     EARLY LANG SNIPPET
     Paste this as a plain <script> in <head> BEFORE
     any other scripts. Prevents flash of wrong lang.
  ─────────────────────────────────────────── */
  var EARLY_LANG_SNIPPET = [
    '(function(){',
    '  try{',
    '    var s=localStorage.getItem("whaley-lang");',
    '    var l=(s==="zh"||s==="en")?s:',
    '          (navigator.language||"zh").toLowerCase().startsWith("zh")?"zh":"en";',
    '    document.documentElement.lang=l==="zh"?"zh-CN":"en";',
    '  }catch(_){}',
    '})();',
  ].join('\n');

  /* expose */
  global.WhaleyI18n = {
    init:             init,
    setLang:          setLang,
    getLang:          getLang,
    t:                t,
    injectSwitcher:   injectSwitcher,
    EARLY_LANG_SNIPPET: EARLY_LANG_SNIPPET,
  };

}(window));
