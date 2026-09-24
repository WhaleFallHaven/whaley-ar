// Small, dependency-free startup helpers. Importing this file never starts a camera.
export function startupError(key, requiresReload = false) {
  return Object.assign(new Error(key), { key, requiresReload });
}

export function withTimeout(promise, milliseconds, error) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(error), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

const scripts = new Map();
export function loadScript(url, isReady, timeout = 30000) {
  if (isReady()) return Promise.resolve();
  if (scripts.has(url)) return scripts.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    // Removing a timed-out script does not reliably cancel its execution.
    // Require a reload in that case, rather than racing two runtime copies.
    const timer = setTimeout(() => finish(startupError('errRuntimeTimeout', true)), timeout);
    script.src = url;
    script.async = true;
    script.onload = () => finish(isReady() ? null : startupError('errRuntimeReload', true));
    script.onerror = () => finish(startupError('errRuntime'));
    document.head.appendChild(script);
  }).catch(error => {
    scripts.delete(url);
    throw error;
  });
  scripts.set(url, promise);
  return promise;
}

export function waitForScene(scene, timeout = 15000) {
  if (scene.hasLoaded) return Promise.resolve(scene);
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      scene.removeEventListener('loaded', loaded);
      if (error) reject(error);
      else resolve(scene);
    };
    const loaded = () => finish();
    const timer = setTimeout(() => finish(startupError('errSceneTimeout')), timeout);
    scene.addEventListener('loaded', loaded, { once: true });
    // Covers scenes initialized between the initial check and subscription.
    if (scene.hasLoaded) loaded();
  });
}

// Keep completed files across retries, even when a sibling request fails.
// Only publish a complete model after every response body has been read.
export function createAssetLoader({ fetchAsset = (...args) => fetch(...args), timeout = 30000 } = {}) {
  const cache = new Map();
  let pending;
  const files = {
    skeleton: ['spine/Whaley.json', 'json'],
    atlas: ['spine/Whaley.atlas.txt', 'text'],
    texture: ['spine/Whaley.png', 'blob'],
    target: ['targets/whaley-target-bothsides.mind', 'blob'],
  };
  return function loadAssets() {
    if (pending) return pending;
    const controller = new AbortController();
    let timer;
    const work = Promise.all(Object.entries(files).map(async ([key, [path, type]]) => {
      if (cache.has(key)) return [key, cache.get(key)];
      const response = await fetchAsset(new URL('../' + path, import.meta.url), { signal: controller.signal });
      if (!response.ok) throw startupError('errAssets');
      const value = await response[type]();
      // An aborted, older attempt must never overwrite a later retry's cache.
      if (controller.signal.aborted) throw startupError('errAssets');
      cache.set(key, value);
      return [key, value];
    }));
    pending = Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(startupError('errAssetTimeout')), timeout);
      }),
    ]).then(entries => Object.fromEntries(entries)).catch(error => {
      controller.abort();
      pending = undefined;
      throw error.key ? error : startupError('errAssets');
    }).finally(() => clearTimeout(timer));
    return pending;
  };
}

export function decodeTexture(blob, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      URL.revokeObjectURL(url);
      if (error) {
        image.removeAttribute('src');
        reject(error);
      } else resolve(image);
    };
    const timer = setTimeout(() => finish(startupError('errAssetTimeout')), timeout);
    image.onload = () => finish();
    image.onerror = () => finish(startupError('errAssets'));
    image.src = url;
  });
}
