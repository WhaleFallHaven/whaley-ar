Startup regression checks
=========================

Run the dependency-free tests with Node.js:

```sh
node --test tests/startup.test.mjs
```

The browser checks require Playwright and its Chromium browser:

```sh
node --test tests/browser-startup.cjs
```

They start their own local server, use the real A-Frame/MindAR/Spine versions,
and use a simulated camera. They cover blocked dependencies, browser fallback,
asset warmup, permission denial/retry, failed downloads, late camera permission,
and tracking initialization failures. Network access to the dependency CDNs is
required. Physical card tracking and mobile-browser behavior still need device
testing.

UX checks also cover the card guide, translated tracking hints, keyboard
greetings, animation delta limits, camera release and re-entry, hidden-region
focus, and controls on landscape screens and at 200% text size.

Optional environment variables:

- `PLAYWRIGHT_MODULE`: absolute path to an existing Playwright installation.
- `PLAYWRIGHT_CHANNEL`: installed browser channel, for example `msedge`.
- `WHALEY_SCREENSHOTS`: optional output directory for desktop, mobile, landscape,
  enlarged-text, and AR guidance screenshots captured during the UX checks.
- `WHALEY_DEPENDENCY_CACHE`: directory with `aframe.js`, `mindar.js`, and
  `spine.mjs` matching the versions/URLs in the browser test. Omitting this
  variable tests delivery from the production CDN URLs.
