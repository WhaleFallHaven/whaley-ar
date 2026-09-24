/* The usable page shell must not depend on any AR or font CDN. */
(function () {
  'use strict';
  WhaleyI18n.init();
  WhaleyI18n.injectSwitcher();
  const t = key => WhaleyI18n.t(key);
  const overlay = document.getElementById('ui-overlay');
  const button = document.getElementById('start-button');
  const loading = document.getElementById('loading-indicator');
  const stage = loading.querySelector('p');
  const errorBox = document.getElementById('error-message');
  const hud = document.getElementById('ar-hud');
  const exitButton = document.getElementById('exit-ar');
  const hintToggle = document.getElementById('toggle-hints');
  const hint = document.getElementById('ar-hint');
  const greetButton = document.getElementById('greet-whaley');
  let inAR = false, lostTimer, hintState = '', hasSeenWhaley = false;
  const translate = (element, key) => {
    element.dataset.i18n = key;
    element.textContent = t(key);
  };
  const setButton = (key, busy) => {
    translate(button, key);
    button.disabled = busy;
    button.setAttribute('aria-disabled', String(busy));
    button.setAttribute('aria-busy', String(busy));
  };
  const setStage = key => {
    translate(stage, key);
    loading.style.display = 'block';
  };

  const drawer = document.getElementById('copyright-drawer');
  const tab = document.getElementById('copyright-tab');
  const drawerContent = document.getElementById('copyright-content');
  function toggleDrawer(open) {
    if (!open && drawerContent.contains(document.activeElement)) tab.focus();
    drawer.classList.toggle('expanded', open);
    tab.setAttribute('aria-expanded', String(open));
    drawerContent.inert = !open;
    drawerContent.setAttribute('aria-hidden', String(!open));
    const frame = drawerContent.querySelector('iframe');
    if (open && !frame.getAttribute('src')) frame.src = frame.dataset.src;
  }
  tab.addEventListener('click', () => toggleDrawer(!drawer.classList.contains('expanded')));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('expanded')) {
      toggleDrawer(false);
      tab.focus();
    }
  });
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--drawer-height', drawer.offsetHeight + 'px');
  }).observe(drawer);
  document.getElementById('card-guide').addEventListener('toggle', event => {
    if (event.target.open) event.target.querySelectorAll('img[data-src]').forEach(image => {
      if (!image.getAttribute('src')) image.src = image.dataset.src;
    });
  });

  function setHint(state) {
    if (hintState === state) return;
    hintState = state;
    hud.dataset.tracking = state;
    const keys = { searching: 'hintScan', found: 'hintFound', ready: 'hintTap', greeting: 'hintGreeting', lost: 'hintLost' };
    translate(document.getElementById('ar-hint-title'), keys[state]);
    translate(document.getElementById('ar-hint-detail'), keys[state] + 'Detail');
  }
  function trackingChanged({ visible, interactive, greeting }) {
    clearTimeout(lostTimer);
    greetButton.disabled = !interactive;
    greetButton.setAttribute('aria-disabled', String(!interactive));
    greetButton.setAttribute('aria-busy', String(greeting));
    if (visible) {
      hasSeenWhaley = true;
      setHint(greeting ? 'greeting' : interactive ? 'ready' : 'found');
    } else {
      // Small tracking flickers should not repeatedly announce "lost".
      lostTimer = setTimeout(() => setHint(hasSeenWhaley ? 'lost' : 'searching'), 650);
    }
  }
  hintToggle.addEventListener('click', () => {
    hint.hidden = !hint.hidden;
    hud.classList.toggle('hints-hidden', hint.hidden);
    hintToggle.setAttribute('aria-expanded', String(!hint.hidden));
    translate(hintToggle, hint.hidden ? 'showHints' : 'hideHints');
  });
  function showAR(active, focus = true) {
    inAR = active;
    toggleDrawer(false);
    if (active) {
      hud.hidden = false;
      hud.inert = false;
      hud.setAttribute('aria-hidden', 'false');
      exitButton.focus({ preventScroll: true });
      overlay.inert = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('hidden');
      drawer.inert = true;
      drawer.hidden = true;
    } else {
      clearTimeout(lostTimer);
      overlay.inert = false;
      overlay.setAttribute('aria-hidden', 'false');
      overlay.classList.remove('hidden');
      drawer.hidden = false;
      drawer.inert = false;
      if (focus) button.focus({ preventScroll: true });
      else if (hud.contains(document.activeElement)) document.activeElement.blur();
      hud.inert = true;
      hud.setAttribute('aria-hidden', 'true');
      hud.hidden = true;
    }
  }

  const ua = navigator.userAgent.toLowerCase();
  if (/micromessenger/.test(ua) && /iphone|ipad|ipod/.test(ua)) {
    document.getElementById('safari-warning').style.display = 'block';
    document.getElementById('normal-interface').style.display = 'none';
    document.getElementById('main-instruction').style.display = 'none';
    const copy = document.getElementById('copy-link-button');
    const success = document.getElementById('copy-success');
    copy.addEventListener('click', async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(location.href);
        copied = true;
      } catch (_) {
        const field = document.createElement('textarea');
        field.value = location.href;
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (_) { /* Show fallback below. */ }
        field.remove();
      }
      translate(success, copied ? 'copySuccess' : 'copyFailed');
      success.style.display = 'block';
      translate(copy, copied ? 'copyDone' : 'copyLink');
      setTimeout(() => {
        success.style.display = 'none';
        translate(copy, 'copyLink');
      }, 3000);
    });
    return; // Do not download the AR stack on the browser fallback screen.
  }

  let helpers, loadAssets, preparation, runtime, scene, starting = false, reload = false;
  const fail = error => {
    console.error('Whaley startup:', error);
    reload = Boolean(error.requiresReload);
    translate(errorBox, error.key || 'errRuntime');
    errorBox.style.display = 'block';
    loading.style.display = 'none';
    setButton(reload ? 'btnReload' : 'btnRetry', false);
    showAR(false, inAR);
  };

  async function prepare() {
    if (runtime) return runtime;
    if (preparation) return preparation;
    preparation = (async () => {
      setStage('runtimeLoading');
      // Catch failed or stalled module imports here so the shell stays usable.
      // Imports cannot be cancelled safely; a timed-out import requires reload.
      let timer;
      try {
        helpers = helpers || await Promise.race([
          import('./startup.mjs'),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject({ key: 'errRuntimeTimeout', requiresReload: true }), 30000);
          }),
        ]);
      } catch (error) {
        throw error.key ? error : { key: 'errRuntimeReload', requiresReload: true };
      } finally { clearTimeout(timer); }
      loadAssets = loadAssets || helpers.createAssetLoader();
      const assetsPromise = loadAssets();
      const dependenciesPromise = (async () => {
        await helpers.loadScript('https://aframe.io/releases/1.7.0/aframe.min.js', () => Boolean(window.AFRAME));
        await helpers.loadScript('https://cdn.jsdelivr.net/gh/BillyPung/mind-ar-js/mindar-image-aframe.prod.js',
          () => Boolean(window.AFRAME.components['mindar-image']));
      })();
      const modulePromise = helpers.withTimeout(import('./ar.mjs'), 30000,
        helpers.startupError('errRuntimeTimeout', true)).catch(error => {
          throw error.key ? error : helpers.startupError('errRuntimeReload', true);
        });
      // Observe every branch immediately, including downloads that finish after
      // another branch fails. A retry never overlaps a previous preparation.
      const results = await Promise.allSettled([dependenciesPromise, modulePromise, assetsPromise]);
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) {
        throw (failures.find(result => result.reason.requiresReload) || failures[0]).reason;
      }
      const ar = results[1].value;
      const assets = results[2].value;
      setStage('modelPreparing');
      if (!scene) {
        const fragment = document.getElementById('ar-scene-template').content.cloneNode(true);
        scene = fragment.querySelector('a-scene');
        document.body.appendChild(fragment);
      }
      await helpers.waitForScene(scene);
      if (!scene.systems['mindar-image-system']) throw helpers.startupError('errRuntimeReload', true);
      try { runtime = await ar.createExperience(scene, assets, fail, trackingChanged); }
      catch (error) {
        // A successful HTTP response can still contain a corrupt image/atlas.
        // Do not make Retry reuse bytes that failed decoding or model validation.
        loadAssets = undefined;
        throw error;
      }
      return runtime;
    })();
    try { return await preparation; }
    finally { preparation = undefined; }
  }

  button.addEventListener('click', async () => {
    if (reload) { location.reload(); return; }
    if (starting) return;
    starting = true;
    errorBox.style.display = 'none';
    setButton('btnLoading', true);
    try {
      const experience = await prepare();
      setStage('arLoading');
      await experience.start();
      loading.style.display = 'none';
      hasSeenWhaley = false;
      setHint('searching');
      showAR(true);
    } catch (error) { fail(error); }
    finally { starting = false; }
  });

  greetButton.addEventListener('click', () => runtime?.greet());
  function exitAR(focus = true) {
    if (!inAR) return;
    runtime.stop();
    translate(document.querySelector('.camera-note'), 'cameraStopped');
    setButton('btnReady', false);
    showAR(false, focus);
  }
  exitButton.addEventListener('click', () => exitAR());
  document.addEventListener('visibilitychange', () => { if (document.hidden) exitAR(false); });
  window.addEventListener('pagehide', () => exitAR(false));

  setButton('btnPreparing', true);
  // Let the lightweight translated shell paint before starting network/CPU work.
  requestAnimationFrame(() => setTimeout(() => {
    prepare().then(() => {
      loading.style.display = 'none';
      setButton('btnReady', false);
    }).catch(fail);
  }, 0));
}());
