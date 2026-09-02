import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import * as defaultAdapter from './default-adapter.js';
import { ensureDir, fileDigest, slug, stableStringify, stateDigest, writeJson } from './utils.js';
import { renderHtmlReport } from './report.js';

const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
];
const DEFAULT_STEPS = [0, 0.25, 0.5, 0.75, 1];
const BROWSER_TYPES = { chromium, firefox, webkit };

async function loadAdapter(adapterPath) {
  if (!adapterPath) return defaultAdapter;
  const absolute = path.resolve(adapterPath);
  const adapter = await import(`${pathToFileURL(absolute).href}?v=${Date.now()}`);
  for (const method of ['ready', 'setProgress', 'readState']) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`Adapter ${absolute} must export async ${method}(page, ...)`);
    }
  }
  return adapter;
}

async function settle(page, delayMs) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  if (delayMs > 0) await page.waitForTimeout(delayMs);
}

async function inspectDocument(
  page,
  primaryActionSelector,
  semanticSelector,
  overlaySelector = '[data-cinetrace-overlay]',
  protectedSelector = '[data-cinetrace-protected]',
) {
  return page.evaluate(({ actionSelector, contentSelector, overlaySelector: overlayCss, protectedSelector: protectedCss }) => {
    const root = document.documentElement;
    const body = document.body;
    const scroller = document.scrollingElement ?? root;
    const viewportWidth = root.clientWidth;
    const documentWidth = scroller.scrollWidth;
    const bodyWidth = body?.scrollWidth ?? documentWidth;
    const overflow = documentWidth - viewportWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: element.id ? `#${element.id}` : element.classList.length
            ? `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join('.')}`
            : element.tagName.toLowerCase(),
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        };
      })
      .filter((item) => item.right > viewportWidth + 1 || item.left < -1)
      .sort((a, b) => (b.right - viewportWidth) - (a.right - viewportWidth))
      .slice(0, 10);
    const main = document.querySelector(contentSelector);
    const visibleText = (main?.innerText ?? body?.innerText ?? '').replace(/\s+/g, ' ').trim();
    const actions = [...document.querySelectorAll(actionSelector)].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = Boolean(rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) > 0);
      const enabled = !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true';
      const destination = element.matches('a[href]')
        ? element.getAttribute('href')
        : element.matches('button, input, [role="button"]');
      const named = Boolean((element.getAttribute('aria-label')
        ?? element.getAttribute('title') ?? element.textContent ?? '').trim());
      const usable = Boolean(visible && enabled && destination
        && !String(destination).toLowerCase().startsWith('javascript:') && named);
      return { element, visible, enabled, destination, named, usable };
    });
    const action = actions.find((candidate) => candidate.usable) ?? actions[0] ?? null;
    const describeRect = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) > 0;
      return {
        element,
        visible,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        selector: element.id ? `#${element.id}` : element.classList.length
          ? `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join('.')}`
          : element.tagName.toLowerCase(),
      };
    };
    const overlays = [...document.querySelectorAll(overlayCss)].map(describeRect).filter((item) => item.visible);
    const protectedElements = [...document.querySelectorAll(protectedCss)].map(describeRect).filter((item) => item.visible);
    const collisions = [];
    for (const overlay of overlays) {
      for (const protectedElement of protectedElements) {
        if (overlay.element === protectedElement.element) continue;
        const overlapWidth = Math.max(0, Math.min(overlay.rect.right, protectedElement.rect.right)
          - Math.max(overlay.rect.left, protectedElement.rect.left));
        const overlapHeight = Math.max(0, Math.min(overlay.rect.bottom, protectedElement.rect.bottom)
          - Math.max(overlay.rect.top, protectedElement.rect.top));
        if (overlapWidth > 4 && overlapHeight > 4) collisions.push({
          overlay: overlay.selector,
          protected: protectedElement.selector,
          overlapWidth: Math.round(overlapWidth * 100) / 100,
          overlapHeight: Math.round(overlapHeight * 100) / 100,
          overlapArea: Math.round(overlapWidth * overlapHeight * 100) / 100,
        });
      }
    }
    return {
      overflow: {
        pass: overflow <= 1,
        viewportWidth,
        documentWidth,
        bodyWidth,
        overflowPixels: Math.max(0, overflow),
        clippedBodyOverflowPixels: overflow <= 1 ? Math.max(0, bodyWidth - viewportWidth) : 0,
        scrollingElement: scroller.tagName.toLowerCase(),
        rootOverflowX: getComputedStyle(root).overflowX,
        bodyOverflowX: body ? getComputedStyle(body).overflowX : null,
        offenders,
      },
      semantics: {
        pass: document.querySelectorAll('h1').length === 1 && Boolean(main) && visibleText.length >= 80,
        selector: contentSelector,
        h1Count: document.querySelectorAll('h1').length,
        hasMainLandmark: Boolean(main),
        meaningfulTextCharacters: visibleText.length,
      },
      primaryAction: {
        pass: action?.usable ?? false,
        selector: actionSelector,
        found: actions.length > 0,
        matchCount: actions.length,
        visible: action?.visible ?? false,
        enabled: action?.enabled ?? false,
        named: action?.named ?? false,
        destination: typeof action?.destination === 'string' ? action.destination : action?.destination ? 'button-action' : null,
        tagName: action?.element?.tagName?.toLowerCase() ?? null,
      },
      overlayCollision: {
        checked: overlays.length > 0 && protectedElements.length > 0,
        pass: collisions.length === 0,
        overlaySelector: overlayCss,
        protectedSelector: protectedCss,
        overlayCount: overlays.length,
        protectedCount: protectedElements.length,
        collisions,
      },
    };
  }, {
    actionSelector: primaryActionSelector,
    contentSelector: semanticSelector,
    overlaySelector,
    protectedSelector,
  });
}

async function inspectKeyboardReachability(page, selector) {
  const targetCount = await page.locator(selector).count();
  const focusableCount = await page.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]').count();
  const maxTabs = Math.max(1, Math.min(focusableCount + 1, 1000));
  const engine = page.context().browser()?.browserType().name() ?? 'unknown';
  const keys = engine === 'webkit' ? ['Tab', 'Alt+Tab'] : ['Tab'];
  for (const key of keys) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.body?.focus();
    });
    for (let tabs = 1; tabs <= maxTabs; tabs += 1) {
      await page.keyboard.press(key);
      const match = await page.evaluate((actionSelector) => {
        const active = document.activeElement;
        return Boolean(active && active.matches(actionSelector));
      }, selector);
      if (match) {
        return { pass: true, selector, targetCount, focusableCount, tabsRequired: tabs, maxTabs, key, engine };
      }
    }
  }
  return { pass: false, selector, targetCount, focusableCount, tabsRequired: null, maxTabs, attemptedKeys: keys, engine };
}

function registerErrors(page, bucket) {
  page.on('console', (message) => {
    if (message.type() === 'error') bucket.push({ type: 'console', critical: false, message: message.text() });
  });
  page.on('pageerror', (error) => bucket.push({ type: 'pageerror', critical: true, message: error.message }));
  page.on('requestfailed', (request) => {
    const resourceType = request.resourceType();
    const critical = request.isNavigationRequest() || ['document', 'script', 'stylesheet'].includes(resourceType);
    bucket.push({
      type: 'requestfailed',
      critical,
      resourceType,
      message: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    const resourceType = request.resourceType();
    const critical = request.isNavigationRequest() || ['document', 'script', 'stylesheet'].includes(resourceType);
    if (critical) bucket.push({
      type: 'http-error',
      critical: true,
      resourceType,
      status: response.status(),
      message: `${request.method()} ${response.url()}: HTTP ${response.status()}`,
    });
  });
}

async function captureSequence({ page, adapter, steps, direction, viewportName, viewportIndex, imagesDir, delayMs, primaryActionSelector, semanticSelector, overlaySelector, protectedSelector }) {
  const frames = [];
  const ordered = direction === 'reverse' ? [...steps].reverse() : [...steps];
  for (const progress of ordered) {
    await adapter.setProgress(page, progress, { direction });
    await settle(page, delayMs);
    const state = await adapter.readState(page, { direction, progress });
    const documentAudit = await inspectDocument(page, primaryActionSelector, semanticSelector, overlaySelector, protectedSelector);
    const fileName = `${viewportIndex}-${slug(viewportName)}-${direction}-${String(progress).replace('.', '_')}.png`;
    const screenshotPath = path.join(imagesDir, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    frames.push({
      direction,
      progress,
      screenshot: `images/${fileName}`,
      screenshotDigest: await fileDigest(screenshotPath),
      state,
      stateDigest: stateDigest(state),
      ...documentAudit,
    });
  }
  return frames;
}

async function inspectReducedMotion(browser, url, viewport, adapter, timeoutMs, delayMs) {
  const { deviceScaleFactor = 1, ...dimensions } = viewport;
  const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  registerErrors(page, errors);
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await adapter.ready(page);
    await adapter.setProgress(page, 0.5, { direction: 'forward', reducedMotion: true });
    await settle(page, delayMs);
    const result = await page.evaluate(() => ({
      mediaQueryMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      activeAnimations: document.getAnimations()
        .map((animation) => {
          const timing = animation.effect?.getComputedTiming();
          const target = animation.effect?.target;
          return {
            target: target?.id ? `#${target.id}` : target?.tagName?.toLowerCase() ?? 'unknown',
            playState: animation.playState,
            duration: Number(timing?.duration ?? 0),
          };
        })
        .filter((animation) => animation.playState === 'running' && animation.duration > 100),
    }));
    return {
      checked: true,
      pass: Boolean(response?.ok()) && result.mediaQueryMatches && result.activeAnimations.length === 0 && errors.length === 0,
      status: response?.status() ?? null,
      ...result,
      errors: [...errors],
    };
  } catch (error) {
    return { checked: true, pass: false, status: response?.status() ?? null, mediaQueryMatches: false, activeAnimations: [], errors: [...errors, { type: 'navigation', message: error.message }] };
  } finally {
    await context.close();
  }
}

async function inspectSemanticFallback(browser, url, viewport, timeoutMs, primaryActionSelector, semanticSelector) {
  const { deviceScaleFactor = 1, ...dimensions } = viewport;
  const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const audit = await inspectDocument(page, primaryActionSelector, semanticSelector);
    return {
      pass: Boolean(response?.ok()) && audit.semantics.pass,
      status: response?.status() ?? null,
      semantics: audit.semantics,
      primaryAction: audit.primaryAction,
    };
  } catch (error) {
    return {
      pass: false,
      status: null,
      semantics: { pass: false, selector: semanticSelector, h1Count: 0, hasMainLandmark: false, meaningfulTextCharacters: 0 },
      primaryAction: { pass: false, selector: primaryActionSelector, found: false, matchCount: 0, visible: false, enabled: false, named: false, destination: null, tagName: null },
      error: error.message,
    };
  } finally {
    await context.close();
  }
}

async function inspectWebglFailure(browser, url, viewport, timeoutMs, primaryActionSelector, semanticSelector, enabled) {
  if (!enabled) return { checked: false, pass: null, metricScope: 'engine-specific', errors: [] };
  const { deviceScaleFactor = 1, ...dimensions } = viewport;
  const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor });
  await context.addInitScript(() => {
    const blocked = new Set(['webgl', 'webgl2', 'experimental-webgl', 'moz-webgl', 'webkit-3d']);
    const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (blocked.has(String(type).toLowerCase())) return null;
      return originalCanvasGetContext.call(this, type, ...args);
    };
    if (typeof OffscreenCanvas !== 'undefined') {
      const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function getContext(type, ...args) {
        if (blocked.has(String(type).toLowerCase())) return null;
        return originalOffscreenGetContext.call(this, type, ...args);
      };
    }
    Object.defineProperty(window, '__cinetraceWebglFailureForced', { value: true });
  });
  const page = await context.newPage();
  const errors = [];
  registerErrors(page, errors);
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await defaultAdapter.ready(page);
    const audit = await inspectDocument(page, primaryActionSelector, semanticSelector);
    const patchActive = await page.evaluate(() => window.__cinetraceWebglFailureForced === true);
    const fatalErrors = errors.filter((error) => error.type === 'pageerror'
      || (['requestfailed', 'http-error'].includes(error.type) && error.critical));
    return {
      checked: true,
      metricScope: 'engine-specific',
      pass: Boolean(response?.ok()) && patchActive && audit.semantics.pass && audit.primaryAction.pass && fatalErrors.length === 0,
      status: response?.status() ?? null,
      patchActive,
      semantics: audit.semantics,
      primaryAction: audit.primaryAction,
      errors: [...errors],
      fatalErrors,
    };
  } catch (error) {
    return {
      checked: true,
      metricScope: 'engine-specific',
      pass: false,
      status: response?.status() ?? null,
      patchActive: false,
      semantics: { pass: false, selector: semanticSelector },
      primaryAction: { pass: false, selector: primaryActionSelector },
      errors: [...errors, { type: 'webgl-failure-audit', critical: true, message: error.message }],
      fatalErrors: [...errors.filter((item) => item.critical), { type: 'webgl-failure-audit', critical: true, message: error.message }],
    };
  } finally {
    await context.close();
  }
}

function compareReverseDrift(frames) {
  const forward = new Map(frames.filter((frame) => frame.direction === 'forward').map((frame) => [frame.progress, frame]));
  const reverse = frames.filter((frame) => frame.direction === 'reverse');
  if (!forward.size || !reverse.length) return { checked: false, pass: null, mismatches: [] };
  const mismatches = reverse
    .filter((frame) => forward.get(frame.progress)?.stateDigest !== frame.stateDigest)
    .map((frame) => ({
      progress: frame.progress,
      forwardDigest: forward.get(frame.progress)?.stateDigest ?? null,
      reverseDigest: frame.stateDigest,
      forwardState: forward.get(frame.progress)?.state ?? null,
      reverseState: frame.state,
    }));
  return { checked: true, pass: mismatches.length === 0, mismatches };
}

async function collectRendererMetadata(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) return {
        metricScope: 'webgl-specific',
        available: false,
        api: null,
        vendor: null,
        renderer: null,
        unmaskedVendor: null,
        unmaskedRenderer: null,
      };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        metricScope: 'webgl-specific',
        available: true,
        api: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
        vendor: gl.getParameter(gl.VENDOR) ?? null,
        renderer: gl.getParameter(gl.RENDERER) ?? null,
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) ?? null : null,
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? null : null,
      };
    });
  } catch (error) {
    return {
      metricScope: 'webgl-specific',
      available: null,
      api: null,
      vendor: null,
      renderer: null,
      unmaskedVendor: null,
      unmaskedRenderer: null,
      error: error.message,
    };
  } finally {
    await context.close();
  }
}

function controlFingerprint(result) {
  return stateDigest({
    toolVersion: result.tool.version,
    browser: result.environment.browser,
    os: result.environment.os,
    runtime: result.environment.runtime,
    renderer: result.environment.renderer,
    defects: result.defects,
    viewports: result.viewports.map((viewport) => ({
      viewport: viewport.viewport,
      frames: viewport.frames.map((frame) => ({
        direction: frame.direction,
        progress: frame.progress,
        screenshotDigest: frame.screenshotDigest,
        stateDigest: frame.stateDigest,
        overflow: frame.overflow.pass,
        semantics: frame.semantics.pass,
        primaryAction: frame.primaryAction.pass,
        overlayCollision: frame.overlayCollision,
      })),
      checks: Object.fromEntries(Object.entries(viewport.checks).map(([name, check]) => [name, {
        checked: check.checked,
        pass: check.pass,
      }])),
    })),
  });
}

export async function auditTarget(input = {}) {
  const browserName = input.browserName ?? input.browserType?.name?.() ?? 'chromium';
  const options = {
    url: input.url,
    outDir: path.resolve(input.outDir ?? 'cinetrace-report'),
    viewports: (input.viewports?.length ? input.viewports : DEFAULT_VIEWPORTS)
      .map((viewport) => ({ ...viewport, deviceScaleFactor: viewport.deviceScaleFactor ?? 1 })),
    steps: input.steps?.length ? input.steps : DEFAULT_STEPS,
    direction: input.direction ?? 'both',
    adapterPath: input.adapterPath,
    timeoutMs: input.timeoutMs ?? 30_000,
    delayMs: input.delayMs ?? 50,
    primaryActionSelector: input.primaryActionSelector ?? 'a[href], button',
    noJsPrimaryActionSelector: input.noJsPrimaryActionSelector ?? input.primaryActionSelector ?? 'a[href], button',
    semanticSelector: input.semanticSelector ?? 'main, article, [role="main"]',
    noJsSemanticSelector: input.noJsSemanticSelector ?? input.semanticSelector ?? 'main, article, [role="main"]',
    overlaySelector: input.overlaySelector ?? '[data-cinetrace-overlay]',
    protectedSelector: input.protectedSelector ?? '[data-cinetrace-protected]',
    forceWebglFailure: input.forceWebglFailure ?? false,
    checkReducedMotion: input.checkReducedMotion ?? true,
    controlRuns: input.controlRuns ?? 1,
    browserName,
    browserType: input.browserType ?? BROWSER_TYPES[browserName],
  };
  if (!options.url) throw new TypeError('auditTarget requires a URL');
  if (!['forward', 'reverse', 'both'].includes(options.direction)) throw new TypeError('direction must be forward, reverse, or both');
  if (!BROWSER_TYPES[options.browserName] && !input.browserType) throw new TypeError('browser must be chromium, firefox, or webkit');
  if (!Array.isArray(options.steps) || options.steps.length < 2 || options.steps.some((step) => !Number.isFinite(step) || step < 0 || step > 1)) {
    throw new TypeError('steps must contain at least two finite numbers from 0 through 1');
  }
  if (new Set(options.steps).size !== options.steps.length) throw new TypeError('steps must not contain duplicates');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 300_000) {
    throw new RangeError('timeout must be a finite value from 100 through 300000 milliseconds');
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0 || options.delayMs > 60_000) {
    throw new RangeError('settle must be a finite value from 0 through 60000 milliseconds');
  }
  if (!Array.isArray(options.viewports) || options.viewports.length === 0) throw new TypeError('at least one viewport is required');
  for (const viewport of options.viewports) {
    if (!viewport || typeof viewport.name !== 'string' || !viewport.name.trim()) throw new TypeError('every viewport requires a non-empty name');
    if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 200 || viewport.height < 200) {
      throw new TypeError('viewport width and height must be integers of at least 200px');
    }
    if (!Number.isFinite(viewport.deviceScaleFactor) || viewport.deviceScaleFactor <= 0 || viewport.deviceScaleFactor > 4) {
      throw new TypeError('viewport deviceScaleFactor must be a finite value greater than 0 and no more than 4');
    }
  }
  const viewportNames = options.viewports.map((viewport) => viewport.name);
  if (new Set(viewportNames).size !== viewportNames.length) throw new TypeError('viewport names must be unique');
  for (const [label, selector] of Object.entries({
    primaryActionSelector: options.primaryActionSelector,
    noJsPrimaryActionSelector: options.noJsPrimaryActionSelector,
    semanticSelector: options.semanticSelector,
    noJsSemanticSelector: options.noJsSemanticSelector,
    overlaySelector: options.overlaySelector,
    protectedSelector: options.protectedSelector,
  })) {
    if (typeof selector !== 'string' || !selector.trim()) throw new TypeError(`${label} must be a non-empty CSS selector`);
  }
  if (!Number.isInteger(options.controlRuns) || options.controlRuns < 1 || options.controlRuns > 5) {
    throw new RangeError('controlRuns must be an integer from 1 through 5');
  }

  const adapter = await loadAdapter(options.adapterPath);
  const imagesDir = path.join(options.outDir, 'images');
  await ensureDir(imagesDir);
  const browser = await options.browserType.launch({ headless: true });
  const environment = {
    browser: {
      engine: browser.browserType().name(),
      version: browser.version(),
    },
    os: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
    },
    runtime: {
      name: 'node',
      version: process.version,
    },
    renderer: await collectRendererMetadata(browser),
    metricLabels: {
      generic: ['overflow', 'heading', 'keyboard', 'semantic-content', 'primary-action', 'overlay-collision', 'reverse-drift', 'reduced-motion', 'page-errors'],
      engineSpecific: ['renderer-metadata', 'forced-webgl-failure'],
    },
  };
  const viewportReports = [];
  try {
    for (const [viewportIndex, viewport] of options.viewports.entries()) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
      });
      const page = await context.newPage();
      const errors = [];
      let observedErrors = [];
      registerErrors(page, errors);
      let response;
      let frames = [];
      let initialAudit = null;
      let keyboardReachability = { pass: false, selector: options.primaryActionSelector, targetCount: 0, focusableCount: 0, tabsRequired: null, maxTabs: 0 };
      try {
        response = await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
        await adapter.ready(page);
        initialAudit = await inspectDocument(
          page,
          options.primaryActionSelector,
          options.semanticSelector,
          options.overlaySelector,
          options.protectedSelector,
        );
        keyboardReachability = await inspectKeyboardReachability(page, options.primaryActionSelector);
        const directions = options.direction === 'both' ? ['forward', 'reverse'] : [options.direction];
        for (const direction of directions) {
          frames.push(...await captureSequence({
            page,
            adapter,
            steps: options.steps,
            direction,
            viewportName: viewport.name,
            viewportIndex,
            imagesDir,
            delayMs: options.delayMs,
            primaryActionSelector: options.primaryActionSelector,
            semanticSelector: options.semanticSelector,
            overlaySelector: options.overlaySelector,
            protectedSelector: options.protectedSelector,
          }));
        }
      } catch (error) {
        errors.push({ type: 'audit', message: error.message });
      } finally {
        observedErrors = [...errors];
        await context.close();
      }
      const overflow = {
        pass: frames.length > 0 && frames.every((frame) => frame.overflow.pass),
        failingFrames: frames.filter((frame) => !frame.overflow.pass).map((frame) => ({
          direction: frame.direction,
          progress: frame.progress,
          ...frame.overflow,
        })),
      };
      const semantics = initialAudit?.semantics ?? { pass: false, selector: options.semanticSelector, h1Count: 0, hasMainLandmark: false, meaningfulTextCharacters: 0 };
      const primaryAction = initialAudit?.primaryAction ?? { pass: false, selector: options.primaryActionSelector, found: false, matchCount: 0, visible: false, enabled: false, named: false, destination: null, tagName: null };
      const overlayCollision = {
        checked: frames.some((frame) => frame.overlayCollision.checked),
        pass: frames.every((frame) => frame.overlayCollision.pass),
        overlaySelector: options.overlaySelector,
        protectedSelector: options.protectedSelector,
        failingFrames: frames.filter((frame) => !frame.overlayCollision.pass).map((frame) => ({
          direction: frame.direction,
          progress: frame.progress,
          collisions: frame.overlayCollision.collisions,
        })),
      };
      const reverseDrift = compareReverseDrift(frames);
      const reducedMotion = options.checkReducedMotion
        ? await inspectReducedMotion(browser, options.url, viewport, adapter, options.timeoutMs, options.delayMs)
        : { checked: false, pass: null, status: null, mediaQueryMatches: null, activeAnimations: [], errors: [] };
      const fallback = await inspectSemanticFallback(
        browser,
        options.url,
        viewport,
        options.timeoutMs,
        options.noJsPrimaryActionSelector,
        options.noJsSemanticSelector,
      );
      const semanticFallback = { status: fallback.status, ...fallback.semantics, pass: fallback.pass && fallback.semantics.pass };
      const primaryActionFallback = { status: fallback.status, ...fallback.primaryAction, pass: Boolean(fallback.status && fallback.status < 400) && fallback.primaryAction.pass };
      const webglFailure = await inspectWebglFailure(
        browser,
        options.url,
        viewport,
        options.timeoutMs,
        options.primaryActionSelector,
        options.semanticSelector,
        options.forceWebglFailure,
      );
      const pageErrors = { pass: observedErrors.length === 0 && Boolean(response?.ok()), status: response?.status() ?? null, errors: observedErrors };
      viewportReports.push({
        viewport,
        frames,
        checks: {
          overflow,
          semantics,
          primaryAction,
          primaryActionFallback,
          keyboardReachability,
          overlayCollision,
          semanticFallback,
          reverseDrift,
          reducedMotion,
          webglFailure,
          pageErrors,
        },
      });
    }
  } finally {
    await browser.close();
  }

  const defects = [];
  for (const report of viewportReports) {
    const name = report.viewport.name;
    if (!report.checks.overflow.pass) defects.push({ code: 'HORIZONTAL_OVERFLOW', viewport: name, severity: 'error' });
    if (!report.checks.semantics.pass) defects.push({ code: 'SEMANTIC_CONTENT_MISSING', viewport: name, severity: 'error' });
    if (!report.checks.primaryAction.pass) defects.push({ code: 'PRIMARY_ACTION_MISSING', viewport: name, severity: 'error' });
    if (!report.checks.primaryActionFallback.pass) defects.push({ code: 'NOJS_PRIMARY_ACTION_MISSING', viewport: name, severity: 'error' });
    if (!report.checks.keyboardReachability.pass) defects.push({ code: 'PRIMARY_ACTION_KEYBOARD_UNREACHABLE', viewport: name, severity: 'error' });
    if (report.checks.overlayCollision.checked && !report.checks.overlayCollision.pass) defects.push({ code: 'OVERLAY_COLLISION', viewport: name, severity: 'error' });
    if (!report.checks.semanticFallback.pass) defects.push({ code: 'SEMANTIC_FALLBACK_MISSING', viewport: name, severity: 'error' });
    if (report.checks.reverseDrift.checked && !report.checks.reverseDrift.pass) defects.push({ code: 'REVERSE_DRIFT', viewport: name, severity: 'error' });
    if (report.checks.reducedMotion.checked && !report.checks.reducedMotion.pass) defects.push({ code: 'REDUCED_MOTION_UNSAFE', viewport: name, severity: 'error' });
    if (report.checks.webglFailure.checked && !report.checks.webglFailure.pass) defects.push({ code: 'WEBGL_FAILURE_FALLBACK_MISSING', viewport: name, severity: 'error' });
    if (!report.checks.pageErrors.pass) defects.push({ code: 'PAGE_ERRORS', viewport: name, severity: 'error' });
  }
  const result = {
    schemaVersion: '2.0.0',
    tool: { name: 'CineTrace', version: '0.3.0' },
    environment,
    target: options.url,
    generatedAt: new Date().toISOString(),
    configuration: {
      viewports: options.viewports,
      steps: options.steps,
      direction: options.direction,
      adapter: options.adapterPath ? path.resolve(options.adapterPath) : 'default',
      selectors: {
        primaryAction: options.primaryActionSelector,
        noJsPrimaryAction: options.noJsPrimaryActionSelector,
        semanticContent: options.semanticSelector,
        noJsSemanticContent: options.noJsSemanticSelector,
        overlay: options.overlaySelector,
        overlayTarget: options.protectedSelector,
      },
      forceWebglFailure: options.forceWebglFailure,
      checkReducedMotion: options.checkReducedMotion,
      controlRuns: options.controlRuns,
      browser: options.browserName,
    },
    verdict: { pass: defects.length === 0, defectCount: defects.length },
    defects,
    viewports: viewportReports,
  };
  const baselineFingerprint = controlFingerprint(result);
  result.controls = {
    checked: options.controlRuns > 1,
    requestedRuns: options.controlRuns,
    completedRuns: 1,
    pass: options.controlRuns > 1 ? true : null,
    baselineFingerprint,
    runs: [{ run: 1, fingerprint: baselineFingerprint, match: true, sameBuild: true, report: 'report.json' }],
  };
  for (let run = 2; run <= options.controlRuns; run += 1) {
    const relativeReport = `controls/run-${run}/report.json`;
    const controlResult = await auditTarget({
      url: options.url,
      outDir: path.join(options.outDir, 'controls', `run-${run}`),
      viewports: options.viewports,
      steps: options.steps,
      direction: options.direction,
      adapterPath: options.adapterPath,
      timeoutMs: options.timeoutMs,
      delayMs: options.delayMs,
      primaryActionSelector: options.primaryActionSelector,
      noJsPrimaryActionSelector: options.noJsPrimaryActionSelector,
      semanticSelector: options.semanticSelector,
      noJsSemanticSelector: options.noJsSemanticSelector,
      overlaySelector: options.overlaySelector,
      protectedSelector: options.protectedSelector,
      forceWebglFailure: options.forceWebglFailure,
      checkReducedMotion: options.checkReducedMotion,
      controlRuns: 1,
      browserName: options.browserName,
      browserType: input.browserType,
    });
    const fingerprint = controlFingerprint(controlResult);
    const sameBuild = stableStringify(controlResult.environment.browser) === stableStringify(result.environment.browser)
      && stableStringify(controlResult.environment.runtime) === stableStringify(result.environment.runtime)
      && stableStringify(controlResult.environment.os) === stableStringify(result.environment.os);
    const match = sameBuild && fingerprint === baselineFingerprint;
    result.controls.runs.push({ run, fingerprint, match, sameBuild, report: relativeReport });
    result.controls.completedRuns += 1;
    if (!match) result.controls.pass = false;
  }
  if (result.controls.checked && !result.controls.pass) {
    result.defects.push({ code: 'CONTROL_DRIFT', viewport: 'all', severity: 'error' });
  }
  result.verdict = { pass: result.defects.length === 0, defectCount: result.defects.length };
  await writeJson(path.join(options.outDir, 'report.json'), result);
  await renderHtmlReport(path.join(options.outDir, 'index.html'), result);
  return result;
}
