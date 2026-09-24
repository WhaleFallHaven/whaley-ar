import * as spine from 'spine-threejs';
import { decodeTexture, startupError } from './startup.mjs';

// Construct once. Camera retries reuse these decoded assets and this mesh.
export async function createExperience(scene, assets, onError = () => {}, onTracking = () => {}) {
  const THREE = window.AFRAME.THREE;
  const arSystem = scene.systems['mindar-image-system'];
  let atlas, skeletonMesh;
  try {
    const image = await decodeTexture(assets.texture);
    atlas = new spine.TextureAtlas(assets.atlas);
    if (atlas.pages.length !== 1 || atlas.pages[0].name !== 'Whaley.png') {
      throw new Error('Unexpected Whaley texture atlas');
    }
    // Same upload/PMA behavior as the previous Spine AssetManager.
    atlas.pages[0].setTexture(new spine.ThreeJsTexture(image, false));
    const reader = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
    const skeletonData = reader.readSkeletonData(assets.skeleton);
    skeletonMesh = new spine.SkeletonMesh({
      skeletonData,
      zOffset: 0.00001,
      materialFactory: parameters => new THREE.MeshBasicMaterial({
        ...parameters,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    });
    skeletonMesh.position.set(0, 0, -0.5);
  } catch (error) {
    skeletonMesh?.dispose();
    atlas?.dispose();
    console.error('Whaley model:', error);
    throw error.key ? error : startupError('errSpine');
  }

  // MindAR consumes the already-downloaded target, avoiding a new network wait
  // after permission is granted. Keep the object URL alive for camera retries.
  const targetUrl = URL.createObjectURL(assets.target);
  arSystem.imageTargetSrc = targetUrl;
  const targets = [0, 1].map(index => document.getElementById('whaley-target-' + index));
  const visible = [false, false];
  let activeTarget = null, isAnimating = false, greeting = false, started = false, poisoned = false, pending;
  let session = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const report = () => onTracking({
    visible: started && activeTarget !== null,
    interactive: started && activeTarget !== null && !isAnimating,
    greeting,
  });

  // The shipped MindAR build calls this async method from a video event without
  // observing its promise. Surface target/initialization failures in our UI.
  arSystem._startAR = async function () {
    if (poisoned) { cleanup(); return; }
    const currentSession = session;
    const video = this.video;
    try {
      // Own the small initialization bridge so Exit/re-entry does not accumulate
      // the vendor bridge's anonymous resize handlers. Tracking remains MindAR's.
      const controller = new window.MINDAR.IMAGE.Controller({
        inputWidth: video.videoWidth, inputHeight: video.videoHeight,
        maxTrack: this.maxTrack, filterMinCF: this.filterMinCF, filterBeta: this.filterBeta,
        missTolerance: this.missTolerance, warmupTolerance: this.warmupTolerance,
        onUpdate: data => {
          if (!started || currentSession !== session || data.type !== 'updateMatrix') return;
          for (const anchor of this.anchorEntities) {
            if (anchor.targetIndex === data.targetIndex) anchor.el.updateWorldMatrix(data.worldMatrix);
          }
        },
      });
      this.controller = controller;
      this._resize();
      const { dimensions } = await controller.addImageTargets(this.imageTargetSrc);
      if (currentSession !== session) return;
      for (const anchor of this.anchorEntities) {
        if (anchor.targetIndex < dimensions.length) anchor.el.setupMarker(dimensions[anchor.targetIndex]);
      }
      await controller.dummyRun(video);
      if (currentSession !== session) return;
      scene.emit('arReady');
      controller.processVideo(video);
    }
    catch (error) { if (currentSession === session) scene.emit('arError', { error }); }
  };
  const resize = arSystem._resize;
  arSystem._resize = function (...args) {
    if (this.controller && this.video?.srcObject) resize.apply(this, args);
  };
  window.addEventListener('resize', () => arSystem._resize());

  const playAnimation = (name, loop, complete) => {
    const entry = skeletonMesh.state.setAnimation(0, name, loop);
    if (complete) entry.listener = { complete };
  };
  const idle = (afterGreeting = false) => {
    greeting = afterGreeting;
    if (reducedMotion.matches && !afterGreeting) {
      playAnimation('Idle_tired', true);
      skeletonMesh.update(0);
      isAnimating = false;
      report();
      return;
    }
    isAnimating = true;
    playAnimation('idle_adv', false, () => {
      playAnimation('Idle_tired', true);
      isAnimating = false;
      greeting = false;
      report();
    });
    report();
  };
  const selectTarget = () => {
    const next = visible[0] ? 0 : visible[1] ? 1 : null;
    if (next === activeTarget) return;
    activeTarget = next;
    skeletonMesh.removeFromParent();
    if (next === null) { isAnimating = false; greeting = false; report(); return; }
    targets[next].object3D.add(skeletonMesh);
    skeletonMesh.scale.set(next === 0 ? 0.0005 : -0.0005, 0.0005, 0.0005);
    idle();
  };
  targets.forEach((target, index) => {
    target.addEventListener('targetFound', () => {
      if (!started) return;
      visible[index] = true;
      selectTarget();
    });
    target.addEventListener('targetLost', () => {
      visible[index] = false;
      selectTarget();
    });
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown;
  scene.addEventListener('pointerdown', event => {
    pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  scene.addEventListener('pointercancel', () => { pointerDown = null; });
  function greet() {
    if (!started || activeTarget === null || isAnimating) return;
    isAnimating = true;
    greeting = true;
    playAnimation('See', false, () => idle(true));
    report();
  }
  scene.addEventListener('pointerup', event => {
    const down = pointerDown;
    pointerDown = null;
    if (!down || down.id !== event.pointerId || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return;
    if (activeTarget === null || isAnimating || (event.pointerType === 'touch' && !event.isPrimary)) return;
    pointer.set(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, scene.camera);
    if (!raycaster.intersectObject(skeletonMesh, true).length) return;
    greet();
  });

  // Share A-Frame's frame clock; no extra perpetual requestAnimationFrame loop.
  // A bounded delta also prevents a jump after losing the card or resuming a tab.
  if (!AFRAME.components['whaley-animation']) {
    AFRAME.registerComponent('whaley-animation', {
      tick(_time, delta) { this.updateWhaley?.(Math.min(delta || 0, 50) / 1000); },
    });
  }
  scene.setAttribute('whaley-animation', '');
  scene.components['whaley-animation'].updateWhaley = delta => {
    if (started && activeTarget !== null && (!reducedMotion.matches || greeting)) skeletonMesh.update(delta);
  };

  function cleanup() {
    session++;
    started = false;
    visible.fill(false);
    selectTarget();
    targets.forEach(target => { target.object3D.visible = false; });
    report();
    // MindAR.stop() assumes both a controller and stream exist. A failed
    // permission request has neither, so clean each initialized resource.
    try { arSystem.controller?.stopProcessVideo(); } catch (_) { /* Already stopped. */ }
    try { arSystem.controller?.dispose(); } catch (_) { /* Partially initialized. */ }
    arSystem.controller = null;
    const video = arSystem.video;
    video?.srcObject?.getTracks().forEach(track => track.stop());
    video?.remove();
    arSystem.ui?.hideLoading();
    arSystem.ui?.hideScanning();
    arSystem.ui?.hideCompatibility();
  }
  function cameraError(event) {
    // A partially failed tracking pipeline is discarded through a reload.
    if (arSystem.controller) {
      poisoned = true;
      return startupError('errArReload', true);
    }
    const error = event.detail?.error;
    if (error?.name === 'NotAllowedError') return startupError('errCameraDenied');
    if (error?.name === 'NotFoundError') return startupError('errCameraNotFound');
    return startupError('errArGeneric');
  }
  // A late event from a timed-out, uncancellable vendor operation must never
  // hide the error screen or keep a late-acquired camera stream alive.
  scene.addEventListener('arReady', () => {
    // Let MindAR finish the synchronous work following its emit before disposal.
    if (poisoned) queueMicrotask(cleanup);
  });
  scene.addEventListener('arError', event => {
    if (started) {
      const error = cameraError(event);
      cleanup();
      onError(error);
    }
  });

  function start(timeout = 45000) {
    if (poisoned) return Promise.reject(startupError('errStartTimeout', true));
    if (started) return Promise.resolve();
    if (pending) return pending;
    session++;
    pending = new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        scene.removeEventListener('arReady', ready);
        scene.removeEventListener('arError', failed);
        if (error) { cleanup(); reject(error); }
        else { started = true; resolve(); }
      };
      const ready = () => finish();
      const failed = event => finish(cameraError(event));
      const timer = setTimeout(() => {
        // getUserMedia and MindAR's internal initialization cannot be aborted.
        // Reload is the honest recovery action instead of overlapping starts.
        poisoned = true;
        finish(startupError('errStartTimeout', true));
      }, timeout);
      scene.addEventListener('arReady', ready, { once: true });
      scene.addEventListener('arError', failed, { once: true });
      try {
        const result = arSystem.start();
        if (result?.catch) result.catch(() => failed({}));
        const video = arSystem.video;
        video?.addEventListener('loadedmetadata', event => {
          if (!poisoned) return;
          event.stopImmediatePropagation();
          video.srcObject?.getTracks().forEach(track => track.stop());
          video.remove();
        }, { once: true });
      } catch (_) { finish(startupError('errArGeneric')); }
    }).finally(() => { pending = undefined; });
    return pending;
  }

  return { start, stop: cleanup, greet };
}
