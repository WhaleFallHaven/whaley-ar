import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetLoader, waitForScene, withTimeout, startupError } from '../assets/js/startup.mjs';

class Scene extends EventTarget {
  constructor(loaded = false) { super(); this.hasLoaded = loaded; }
  load() { this.hasLoaded = true; this.dispatchEvent(new Event('loaded')); }
}

test('already-loaded scenes do not wait for an event that has passed', async () => {
  const scene = new Scene(true);
  assert.equal(await waitForScene(scene, 10), scene);
});

test('scene readiness resolves when loaded fires after subscription', async () => {
  const scene = new Scene();
  const waiting = waitForScene(scene, 100);
  scene.load();
  assert.equal(await waiting, scene);
});

test('a timed-out scene can be retried once it becomes ready', async () => {
  const scene = new Scene();
  await assert.rejects(waitForScene(scene, 5), { key: 'errSceneTimeout' });
  scene.load();
  assert.equal(await waitForScene(scene, 5), scene);
});

const response = value => ({ ok: true, json: async () => value, text: async () => value, blob: async () => value });

test('asset warmup coalesces concurrent callers and caches completed downloads', async () => {
  const requested = [];
  const load = createAssetLoader({ fetchAsset: async url => {
    requested.push(url.pathname);
    return response('downloaded');
  }});
  const first = load();
  assert.equal(load(), first);
  assert.deepEqual(Object.keys(await first).sort(), ['atlas', 'skeleton', 'target', 'texture']);
  assert.equal(await load(), await first);
  assert.equal(requested.length, 4);
});

test('HTTP failure never reports model-ready; retry only fetches unfinished files', async () => {
  const counts = new Map();
  const load = createAssetLoader({ fetchAsset: async url => {
    const count = (counts.get(url.pathname) || 0) + 1;
    counts.set(url.pathname, count);
    if (url.pathname.endsWith('.png') && count === 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
      return { ok: false, status: 503 };
    }
    return response('valid');
  }});
  await assert.rejects(load(), { key: 'errAssets' });
  assert.equal((await load()).texture, 'valid');
  for (const [path, count] of counts) assert.equal(count, path.endsWith('.png') ? 2 : 1);
});

test('stalled response bodies time out, abort requests, and allow a fresh retry', async () => {
  let stall = true;
  const signals = [];
  const load = createAssetLoader({ timeout: 10, fetchAsset: async (_url, { signal }) => {
    signals.push(signal);
    return stall ? { ok: true, json: () => new Promise(() => {}), text: () => new Promise(() => {}), blob: () => new Promise(() => {}) } : response('recovered');
  }});
  await assert.rejects(load(), { key: 'errAssetTimeout' });
  assert.ok(signals.every(signal => signal.aborted));
  stall = false;
  assert.equal((await load()).texture, 'recovered');
});

test('an aborted late response cannot overwrite the retry cache', async () => {
  let release, attempt = 0;
  const load = createAssetLoader({ timeout: 10, fetchAsset: async url => {
    if (url.pathname.endsWith('.png') && attempt++ === 0) {
      return { ok: true, blob: () => new Promise(resolve => { release = resolve; }) };
    }
    return response('fresh');
  }});
  await assert.rejects(load(), { key: 'errAssetTimeout' });
  assert.equal((await load()).texture, 'fresh');
  release('stale');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await load()).texture, 'fresh');
});

test('uncancellable dependency timeouts explicitly require reload', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, startupError('errRuntimeTimeout', true)),
    { key: 'errRuntimeTimeout', requiresReload: true });
});
