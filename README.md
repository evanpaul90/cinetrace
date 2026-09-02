# CineTrace

CineTrace turns a progress-driven web experience into a deterministic filmstrip, then checks whether the experience remains structurally sound in both directions. It is a small, MIT-licensed Node 22+ CLI built on Playwright.

It reports:

- horizontal overflow, including likely offending elements;
- one-H1 and semantic main-content presence;
- visible, enabled, named primary actions in rendered and no-JavaScript routes;
- keyboard reachability of the rendered primary action through `Tab`;
- usable semantic content when JavaScript is disabled;
- state drift between matching forward and reverse progress checkpoints;
- long-running animation under `prefers-reduced-motion: reduce`;
- optional survival of semantic content and the primary action when WebGL creation is forced to fail before page scripts;
- console errors, uncaught page errors, failed requests, and navigation failures.

## Install and run

```sh
npm install
npx playwright install chromium
node src/cli.js audit https://example.com \
  --out ./artifacts/example \
  --viewport desktop:1440x900 \
  --viewport mobile:390x844 \
  --steps 0,0.25,0.5,0.75,1 \
  --direction both \
  --primary-action '.book-now' \
  --no-js-primary-action '#fallback-booking' \
  --semantic-content 'main' \
  --no-js-semantic-content 'main' \
  --force-webgl-failure
```

The command writes `report.json`, a static `index.html`, and PNG frames under `images/`. Reports identify schema version `1.1.0`; the corresponding JSON Schema ships as `report.schema.json`. A failed audit exits with status 1. Invalid CLI input exits with status 2.

Horizontal-overflow verdicts use the browser’s actual scrolling element (`document.scrollingElement`) rather than the widest internal box. `body.scrollWidth`, clipped overflow pixels, overflow styles, and out-of-bounds elements remain in the report as diagnostics. A deliberately oversized decoration clipped by the root therefore does not become a false failure, while a genuinely wider root still does.

## Page integration

The built-in adapter drives native page scroll at every checkpoint. It computes `maxScroll = document.documentElement.scrollHeight - window.innerHeight`, scrolls to `maxScroll * progress`, and reports progress as `window.scrollY / maxScroll`. It also sets `--cinetrace-progress` on the root element, dispatches a `cinetrace:progress` event, and calls `window.cineTraceSetProgress(progress)` when present.

Default readiness never waits for network idleness. After `page.goto(..., { waitUntil: 'domcontentloaded' })`, CineTrace gives fonts up to 750 ms to settle, waits two animation frames, then applies a deterministic 50 ms buffer. Analytics, streams, polling, and other long-lived requests therefore cannot hold the audit open indefinitely.

Rendered and no-JavaScript semantic-content and primary-action selectors can be configured independently. Defaults are `main, article, [role="main"]` and `a[href], button`. A primary action passes only when it is found, visibly rendered, enabled, named, and has an actionable destination. The rendered route must also make one matching action reachable through sequential keyboard focus.

`--force-webgl-failure` installs a pre-page-script patch that makes WebGL context creation return `null` for both `HTMLCanvasElement` and `OffscreenCanvas`. CineTrace then independently verifies that the configured semantic route and primary action survive. Console errors are retained as diagnostics because renderers commonly log the handled failure before activating fallback. The oracle fails for an uncaught page error, failed navigation or critical document/script/stylesheet request, an inactive patch, or missing semantic/action fallback. This check is opt-in and appears as `not checked` otherwise.

For a custom experience, pass an ESM module:

```js
export async function ready(page) {
  await page.waitForFunction(() => window.sceneReady === true);
}

export async function setProgress(page, progress) {
  await page.evaluate((value) => window.scene.seek(value), progress);
}

export async function readState(page) {
  return page.evaluate(() => window.scene.debugState());
}
```

Then run with `--adapter ./cinetrace-adapter.js`. `readState` must return JSON-serializable, deterministic state. CineTrace hashes stable key-sorted state at every checkpoint and compares the forward and reverse readings.

Adapter methods receive an optional final context argument for direction and progress, but portable adapters should not need it. CineTrace does not assume any framework, WebGL engine, geometry, or project-specific debug surface.

## Programmatic API

```js
import { auditTarget } from 'cinetrace';

const report = await auditTarget({
  url: 'https://example.com',
  outDir: './artifacts/example',
  direction: 'both',
  primaryActionSelector: '.book-now',
  noJsPrimaryActionSelector: '#fallback-booking',
  semanticSelector: 'main',
  noJsSemanticSelector: 'main',
  forceWebglFailure: true,
});
```

## Testing

```sh
npm test
```

The test corpus proves native-scroll checkpoint accuracy, bounded readiness with an open streaming response, configurable primary-action and semantic selectors, keyboard reachability, safe and unsafe forced-WebGL failure paths, reduced-motion mutation behavior, screenshot-collision prevention, configuration validation, true root overflow versus intentionally clipped body decoration, reverse-state drift, and missing semantic fallback. The clean baseline must remain green.

## Known limits

- Selectors inspect the light DOM; iframe and shadow-root traversal is not automatic.
- Keyboard auditing proves sequential focus reachability but does not activate or transaction-test the action.
- Reduced-motion auditing samples active DOM animations over 100 ms and cannot observe motion drawn internally by canvas or WebGL.
- Forced renderer failure covers initial WebGL/WebGL2 context creation, not later context loss, GPU process failure, or WebGPU.
- A non-critical failed image, media, font, fetch, or XHR remains diagnostic in the forced-WebGL report when semantic content and the primary action survive. Projects can still inspect the full `errors` collection.
- Virtual-scroll experiences require a custom adapter.
