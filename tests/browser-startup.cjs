// Run with Node and Playwright installed. Uses the actual AR dependencies and
// Chromium's simulated camera; no physical camera permission is requested.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
let server, browser, base;
before(async () => {
  server = http.createServer(async (request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'],
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openPage(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  await page.route(/https:\/\/(use\.typekit\.net|p\.typekit\.net|store\.steampowered\.com)\//, route => route.abort());
  // Optional local copies of the exact vendor versions keep repeat runs fast.
  if (process.env.WHALEY_DEPENDENCY_CACHE) {
    for (const [pattern, file] of [
      ['https://aframe.io/releases/1.7.0/aframe.min.js', 'aframe.js'],
      ['https://cdn.jsdelivr.net/gh/BillyPung/mind-ar-js/mindar-image-aframe.prod.js', 'mindar.js'],
      ['https://unpkg.com/@esotericsoftware/spine-threejs@4.2.95/dist/esm/spine-threejs.min.mjs', 'spine.mjs'],
    ]) {
      await page.route(pattern, route => route.fulfill({ path: path.join(process.env.WHALEY_DEPENDENCY_CACHE, file), contentType: 'text/javascript' }));
    }
  }
  return page;
}

async function ready(page) {
  await page.waitForFunction(() => !document.getElementById('start-button').disabled, {}, { timeout: 70000 });
  assert.equal(await page.locator('#start-button').innerText(), 'Start');
}
async function cameraReady(page) {
  await page.waitForFunction(() => document.getElementById('ui-overlay').classList.contains('hidden'), {}, { timeout: 55000 });
  assert.equal(await page.evaluate(() => document.querySelector('video').srcObject.getVideoTracks()[0].readyState), 'live');
}

async function capture(page, name) {
  if (!process.env.WHALEY_SCREENSHOTS) return;
  await fs.mkdir(process.env.WHALEY_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(process.env.WHALEY_SCREENSHOTS, name + '.png') });
}

test('shell and browser fallback work without AR or font CDNs', async t => {
  const page = await openPage(t, { userAgent: 'Mozilla/5.0 (iPhone) MicroMessenger' });
  const arRequests = [];
  page.on('request', request => { if (/aframe|mindar|spine|Whaley\./.test(request.url())) arRequests.push(request.url()); });
  await page.goto(base);
  await page.locator('#safari-warning').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '切换到中文' }).click();
  assert.equal(await page.locator('#copy-link-button').innerText(), '复制链接');
  await page.locator('#copyright-tab').click();
  assert.equal(await page.locator('#copyright-tab').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('a-scene').count(), 0);
  assert.deepEqual(arRequests, []);
});

test('blocked AR script presents Retry and recovers without a duplicate scene', async t => {
  const page = await openPage(t);
  let blocked = true;
  await page.route('https://aframe.io/releases/1.7.0/aframe.min.js', route => blocked ? route.abort() : route.fallback());
  await page.goto(base);
  await page.locator('#error-message').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal(await page.locator('#start-button').innerText(), 'Retry');
  assert.equal(await page.locator('a-scene').count(), 0);
  blocked = false;
  await page.locator('#start-button').click();
  await cameraReady(page);
  assert.equal(await page.locator('a-scene').count(), 1);
});

test('model downloads before Start; camera denial and retry reuse assets and interaction', async t => {
  const page = await openPage(t);
  const requests = [];
  page.on('request', request => { if (/\/assets\/(spine|targets)\//.test(request.url())) requests.push(request.url()); });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let denied = false;
    navigator.mediaDevices.getUserMedia = constraints => {
      if (!denied) { denied = true; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); }
      return getUserMedia(constraints);
    };
    const add = EventTarget.prototype.addEventListener;
    window.pointerListeners = 0;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (this.localName === 'a-scene' && type === 'pointerup') window.pointerListeners++;
      return add.call(this, type, ...rest);
    };
  });
  await page.goto(base);
  await ready(page);
  assert.equal(requests.length, 4);
  assert.equal(await page.locator('video').count(), 0);
  await page.getByRole('button', { name: '切换到中文' }).click();
  assert.equal(await page.locator('#start-button').innerText(), '开始体验');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.locator('#start-button').click();
  await page.locator('#error-message').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#start-button').innerText(), 'Retry');
  assert.equal(await page.locator('video').count(), 0);
  const listeners = await page.evaluate(() => window.pointerListeners);
  await page.locator('#start-button').click();
  await cameraReady(page);
  assert.equal(requests.length, 4);
  assert.equal(await page.evaluate(() => window.pointerListeners), listeners);
  // Exercise both existing card orientations against the real Spine runtime.
  await page.evaluate(() => {
    const first = document.getElementById('whaley-target-0');
    first.emit('targetFound');
    first.emit('targetLost');
    document.getElementById('whaley-target-1').emit('targetFound');
  });
  assert.equal(await page.evaluate(() => document.getElementById('whaley-target-1').object3D.children[0].scale.x), -0.0005);
});

test('a failed texture is retryable and completed sibling assets are reused', async t => {
  const page = await openPage(t);
  let failed = false;
  const counts = {};
  page.on('request', request => {
    if (/\/assets\/(spine|targets)\//.test(request.url())) counts[request.url()] = (counts[request.url()] || 0) + 1;
  });
  await page.route('**/assets/spine/Whaley.png', async route => {
    if (!failed) {
      failed = true;
      // Allow the three smaller successful responses to complete first.
      await new Promise(resolve => setTimeout(resolve, 100));
      return route.fulfill({ status: 503, body: 'Unavailable' });
    }
    return route.continue();
  });
  await page.goto(base);
  await page.locator('#error-message').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal(await page.locator('#start-button').innerText(), 'Retry');
  await page.locator('#start-button').click();
  await cameraReady(page);
  for (const [url, count] of Object.entries(counts)) assert.equal(count, url.endsWith('.png') ? 2 : 1);
});

test('a failed Spine module leaves a translated, actionable shell', async t => {
  const page = await openPage(t);
  await page.route('**/spine-threejs.min.mjs', route => route.abort());
  await page.goto(base);
  await page.locator('#error-message').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal(await page.locator('#start-button').innerText(), 'Reload');
  await page.getByRole('button', { name: '切换到中文' }).click();
  assert.equal(await page.locator('#start-button').innerText(), '重新加载');
  assert.equal(await page.locator('a-scene').count(), 0);
});

test('a corrupt successful texture response is discarded on Retry', async t => {
  const page = await openPage(t);
  let requests = 0;
  await page.route('**/assets/spine/Whaley.png', route => {
    requests++;
    return requests === 1 ? route.fulfill({ status: 200, contentType: 'image/png', body: 'not an image' }) : route.continue();
  });
  await page.goto(base);
  await page.locator('#error-message').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal(await page.locator('#start-button').innerText(), 'Retry');
  await page.locator('#start-button').click();
  await cameraReady(page);
  assert.equal(requests, 2);
  assert.equal(await page.locator('a-scene').count(), 1);
});

test('camera timeout offers Reload and stops a camera granted after timeout', async t => {
  const page = await openPage(t);
  await page.route('**/assets/js/ar.mjs', async route => route.fulfill({
    contentType: 'text/javascript',
    body: (await fs.readFile(path.join(root, 'assets/js/ar.mjs'), 'utf8')).replace('function start(timeout = 45000)', 'function start(timeout = 200)'),
  }));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
      window.releaseCamera = async () => {
        window.lateStream = await original(constraints);
        resolve(window.lateStream);
      };
    });
  });
  await page.goto(base);
  await ready(page);
  await page.locator('#start-button').click();
  await page.locator('#error-message').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#start-button').innerText(), 'Reload');
  await page.evaluate(() => window.releaseCamera());
  await page.waitForFunction(() => window.lateStream.getVideoTracks().every(track => track.readyState === 'ended'));
  assert.equal(await page.locator('video').count(), 0);
  assert.equal(await page.locator('#ui-overlay').evaluate(element => element.classList.contains('hidden')), false);
});

test('rejected tracking initialization releases the camera and shows Reload', async t => {
  const page = await openPage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    const system = document.querySelector('a-scene').systems['mindar-image-system'];
    // Fail the first operation inside MindAR's async initialization, after it
    // creates a controller. The wrapper must observe the rejected promise.
    system._resize = () => { throw new Error('Simulated tracking failure'); };
  });
  await page.locator('#start-button').click();
  await page.locator('#error-message').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#start-button').innerText(), 'Reload');
  assert.equal(await page.locator('video').count(), 0);
});

test('card guide, tracking hints, keyboard greeting, and exit/re-entry work together', async t => {
  const page = await openPage(t, { reducedMotion: 'reduce' });
  const assetRequests = [];
  page.on('request', request => { if (/\/assets\/(spine|targets)\//.test(request.url())) assetRequests.push(request.url()); });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    window.resizeListeners = 0;
    const add = window.addEventListener;
    window.addEventListener = function (name, ...args) {
      if (name === 'resize') window.resizeListeners++;
      return add.call(this, name, ...args);
    };
  });
  await page.goto(base);
  await ready(page);
  assert.equal(assetRequests.length, 4, 'previews are not downloaded before the guide opens');
  await capture(page, 'mobile-ready');
  await page.locator('#card-guide summary').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.card-previews img')].every(image => image.naturalWidth === 256));
  await capture(page, 'mobile-card-guide');
  await page.locator('#card-guide summary').click();
  await page.locator('#start-button').click();
  await cameraReady(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'exit-ar');
  assert.equal(await page.locator('#ui-overlay').evaluate(element => element.inert), true);
  assert.equal(await page.locator('#copyright-drawer').isVisible(), false);
  assert.equal(await page.locator('#ar-hint-title').innerText(), 'Bring Whaley into view');
  await capture(page, 'ar-searching');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-hints');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#ar-hint').isVisible(), false);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#ar-hint').isVisible(), true);
  await page.evaluate(() => document.getElementById('whaley-target-0').emit('targetFound'));
  await page.waitForFunction(() => !document.getElementById('greet-whaley').disabled);
  assert.equal(await page.locator('#ar-hint-title').innerText(), 'Tap Whaley to say hello');
  await page.evaluate(() => WhaleyI18n.setLang('zh'));
  assert.equal(await page.locator('#ar-hint-title').innerText(), '轻点鲸鲸，打个招呼');
  await page.evaluate(() => WhaleyI18n.setLang('en'));
  await page.locator('#greet-whaley').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ar-hint-title').innerText(), 'Whaley says hello');
  const delta = await page.evaluate(() => {
    const scene = document.querySelector('a-scene');
    const mesh = document.getElementById('whaley-target-0').object3D.children[0];
    const before = mesh.state.getCurrent(0).trackTime;
    scene.components['whaley-animation'].tick(10000, 10000);
    return mesh.state.getCurrent(0).trackTime - before;
  });
  assert.ok(Math.abs(delta - 0.05) < 0.001, 'resume delta is capped at 50 ms');
  await page.evaluate(() => document.getElementById('whaley-target-0').emit('targetLost'));
  await page.waitForFunction(() => document.getElementById('ar-hud').dataset.tracking === 'lost');
  assert.equal(await page.locator('#greet-whaley').isDisabled(), true);
  await capture(page, 'ar-lost');
  const downloads = assetRequests.length;
  const listeners = await page.evaluate(() => window.resizeListeners);
  await page.evaluate(() => { window.previousStream = document.querySelector('video').srcObject; });
  await page.locator('#exit-ar').click();
  assert.equal(await page.locator('video').count(), 0);
  assert.equal(await page.evaluate(() => window.previousStream.getTracks().every(track => track.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'start-button', JSON.stringify(await page.evaluate(() => {
    const e = document.getElementById('start-button'), p = document.getElementById('ui-overlay');
    return { active: document.activeElement.outerHTML.slice(0, 100), disabled: e.disabled, inert: p.inert, visibility: getComputedStyle(e).visibility, display: getComputedStyle(p).display, opacity: getComputedStyle(p).opacity, rect: e.getBoundingClientRect().toJSON() };
  })));
  assert.equal(await page.locator('#ui-overlay').evaluate(element => element.inert), false);
  assert.equal(await page.locator('#ar-hud').isVisible(), false);
  await page.locator('#start-button').click();
  await cameraReady(page);
  assert.equal(assetRequests.length, downloads);
  assert.equal(await page.evaluate(() => window.resizeListeners), listeners);
  assert.equal(await page.locator('a-scene').count(), 1);
});

test('collapsed drawer is inert and Escape restores focus to its toggle', async t => {
  const page = await openPage(t);
  await page.goto(base);
  await ready(page);
  assert.equal(await page.locator('#copyright-content').evaluate(element => element.inert), true);
  assert.equal(await page.locator('iframe').getAttribute('src'), null);
  await page.locator('#copyright-tab').click();
  assert.equal(await page.locator('#copyright-content').evaluate(element => element.inert), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#copyright-content').evaluate(element => element.inert), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'copyright-tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#copyright-content'))), false);
});

test('splash controls remain reachable on short screens and with enlarged text', async t => {
  const page = await openPage(t);
  await page.goto(base);
  await ready(page);
  const problems = [];
  for (const [name, width, height, fontSize] of [
    ['desktop-ready', 1440, 900, '16px'],
    ['landscape-ready', 844, 390, '16px'],
    ['large-text-ready', 320, 568, '32px'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
    await page.locator('#start-button').scrollIntoViewIfNeeded();
    const reachable = await page.locator('#start-button').evaluate(element => {
      const box = element.getBoundingClientRect();
      const drawerTop = document.getElementById('copyright-drawer').getBoundingClientRect().top;
      // Browser scroll offsets are rounded while element bounds are fractional.
      return box.top >= -0.5 && box.bottom <= drawerTop + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5;
    });
    await capture(page, name);
    if (!reachable) problems.push(name + ': ' + JSON.stringify(await page.evaluate(() => {
      const p = document.getElementById('ui-overlay');
      return { button: document.getElementById('start-button').getBoundingClientRect().toJSON(), overlay: p.getBoundingClientRect().toJSON(), drawer: document.getElementById('copyright-drawer').getBoundingClientRect().toJSON(), height: p.clientHeight, scroll: p.scrollTop, max: p.scrollHeight, overflow: getComputedStyle(p).overflow, footer: getComputedStyle(p).bottom };
    })));
    if (await page.locator('#ui-overlay').evaluate(element => element.scrollWidth > element.clientWidth)) problems.push(name + ': horizontal overflow');
  }
  assert.deepEqual(problems, []);
});
