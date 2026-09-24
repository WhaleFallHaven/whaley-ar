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
      cameraHint:       '点击开始后才会开启摄像头。',
      cardGuide:        '查看识别图像',
      cardFront:        '鲸鲸识别图像',
      cardBack:         '镜像鲸鲸识别图像',
      cardPreviewNote:  '识别图像的灰度预览，两面均可识别。',
      arControls:       'AR控制',
      exitAr:           '退出AR',
      hideHints:        '隐藏提示',
      showHints:        '显示提示',
      greetWhaley:      '和鲸鲸打招呼',
      hintScan:         '让鲸鲸出现在镜头里',
      hintScanDetail:   '对准识别图像，让完整图案入镜并避开反光。',
      hintFound:        '找到鲸鲸了',
      hintFoundDetail:  '拿稳卡片，鲸鲸正在醒来。',
      hintTap:          '轻点鲸鲸，打个招呼',
      hintTapDetail:    '也可以使用下方的打招呼按钮。',
      hintGreeting:     '鲸鲸在和你打招呼',
      hintGreetingDetail: '保持图像在镜头里。',
      hintLost:         '再让鲸鲸回到镜头里',
      hintLostDetail:   '移回卡片，让完整图案入镜并避开反光。',
      cameraStopped:    '摄像头已关闭，可以随时再次开始。',
      btnPreparing:     '系统准备中',
      btnReady:         '开始体验',
      btnLoading:       '加载中',
      btnRetry:         '重试',
      btnReload:        '重新加载',
      runtimeLoading:   '正在准备AR并下载鲸鲸…',
      modelPreparing:   '正在准备鲸鲸…',
      errRuntime:       'AR资源下载失败，请检查网络后重试。',
      errRuntimeReload: 'AR资源未能启动，请检查网络并重新加载。',
      errRuntimeTimeout:'AR资源加载超时，请检查网络并重新加载。',
      errAssets:        '鲸鲸资源下载失败，请检查网络后重试。',
      errAssetTimeout:  '鲸鲸资源加载超时，请检查网络后重试。',
      errArReload:      'AR初始化失败，请重新加载后再试。',
      errSceneTimeout:  'AR场景尚未就绪，请重试。',
      errStartTimeout:  '摄像头或AR启动超时，请重新加载并允许摄像头访问。',
      copyFailed:       '无法自动复制，请从地址栏复制链接。',
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
      errSpine:         '鲸鲸未能加载，请重试。',
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
      cameraHint:       'Your camera opens only after you tap Start.',
      cardGuide:        'See the recognition image',
      cardFront:        'Whaley recognition image',
      cardBack:         'Mirrored Whaley recognition image',
      cardPreviewNote:  'Grayscale recognition previews. Either side works.',
      arControls:       'AR controls',
      exitAr:           'Exit AR',
      hideHints:        'Hide hints',
      showHints:        'Show hints',
      greetWhaley:      'Say hello',
      hintScan:         'Bring Whaley into view',
      hintScanDetail:   'Frame the whole image and avoid glare.',
      hintFound:        'There you are, Whaley',
      hintFoundDetail:  'Hold your card steady while Whaley wakes up.',
      hintTap:          'Tap Whaley to say hello',
      hintTapDetail:    'You can also use the button below.',
      hintGreeting:     'Whaley says hello',
      hintGreetingDetail: 'Keep the image in view.',
      hintLost:         'Bring Whaley back into view',
      hintLostDetail:   'Move the card back. Keep the whole image visible and avoid glare.',
      cameraStopped:    'Camera off. You can start again whenever you like.',
      btnPreparing:     'Preparing...',
      btnReady:         'Start',
      btnLoading:       'Loading...',
      btnRetry:         'Retry',
      btnReload:        'Reload',
      runtimeLoading:   'Preparing AR and downloading Whaley…',
      modelPreparing:   'Getting Whaley ready…',
      errRuntime:       'AR resources could not be downloaded. Check your connection and retry.',
      errRuntimeReload: 'AR resources could not start. Check your connection and reload.',
      errRuntimeTimeout:'AR resources took too long to load. Check your connection and reload.',
      errAssets:        'Whaley could not be downloaded. Check your connection and retry.',
      errAssetTimeout:  'Whaley took too long to load. Check your connection and retry.',
      errArReload:      'AR initialization failed. Please reload and try again.',
      errSceneTimeout:  'The AR scene is not ready yet. Please retry.',
      errStartTimeout:  'Camera or AR startup took too long. Reload and allow camera access.',
      copyFailed:       'Copy failed. Please copy the link from the address bar.',
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
      errSpine:         'Whaley could not be prepared. Please retry.',
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

    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      el.alt = t(el.dataset.i18nAlt);
    });
    document.querySelectorAll('[data-i18n-label]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.dataset.i18nLabel));
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
