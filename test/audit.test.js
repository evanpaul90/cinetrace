import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { auditTarget } from '../src/audit.js';
import { ready as defaultReady } from '../src/default-adapter.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const adapterPath = path.join(fixtureDir, 'fixture-adapter.js');
let origin;
let server;
let tempRoot;
const pendingResponses = new Set();

test.before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cinetrace-test-'));
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://fixture.local').pathname;
    if (pathname === '/never') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      response.write(': connection remains open\n\n');
      pendingResponses.add(response);
      response.on('close', () => pendingResponses.delete(response));
      return;
    }
    const fileName = path.basename(pathname === '/' ? '/clean.html' : pathname);
    if (!/^[a-z-]+\.html$/.test(fileName)) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(path.join(fixtureDir, fileName));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const response of pendingResponses) response.end();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(tempRoot, { recursive: true, force: true });
});

async function runFixture(name, overrides = {}) {
  return auditTarget({
    url: `${origin}/${name}.html`,
    outDir: path.join(tempRoot, name),
    adapterPath,
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
    steps: [0, 0.5, 1],
    direction: 'both',
    delayMs: 0,
    ...overrides,
  });
}

test('clean fixture passes and emits JSON plus an HTML filmstrip', async () => {
  const result = await runFixture('clean');
  assert.equal(result.verdict.pass, true, JSON.stringify(result.defects));
  const json = JSON.parse(await readFile(path.join(tempRoot, 'clean', 'report.json'), 'utf8'));
  const schema = JSON.parse(await readFile(path.join(path.dirname(fixtureDir), '..', 'report.schema.json'), 'utf8'));
  const validator = addFormats(new Ajv2020({ allErrors: true, strict: false })).compile(schema);
  const html = await readFile(path.join(tempRoot, 'clean', 'index.html'), 'utf8');
  assert.equal(json.schemaVersion, '2.0.0');
  assert.equal(validator(json), true, JSON.stringify(validator.errors));
  assert.equal(json.viewports[0].frames.length, 6);
  assert.equal(json.viewports[0].checks.primaryAction.pass, true);
  assert.equal(json.viewports[0].checks.primaryActionFallback.pass, true);
  assert.equal(json.viewports[0].checks.keyboardReachability.pass, true);
  assert.equal(json.environment.browser.engine, 'chromium');
  assert.ok(json.environment.browser.version);
  assert.equal(json.environment.os.platform, process.platform);
  assert.equal(json.environment.os.arch, process.arch);
  assert.ok(json.environment.os.release);
  assert.equal(json.environment.runtime.version, process.version);
  assert.equal(json.viewports[0].viewport.deviceScaleFactor, 1);
  assert.equal(json.environment.renderer.metricScope, 'webgl-specific');
  assert.match(html, /deterministic filmstrip audit/i);
  assert.match(html, /images\/0-mobile-forward-0\.png/);
});

test('detects horizontal overflow and names an offending element', async () => {
  const result = await runFixture('broken-overflow');
  assert.ok(result.defects.some((defect) => defect.code === 'HORIZONTAL_OVERFLOW'));
  const failure = result.viewports[0].checks.overflow.failingFrames[0];
  assert.ok(failure.overflowPixels > 500);
  assert.ok(failure.offenders.some((offender) => offender.selector === '#scene'));
});

test('does not fail intentionally clipped decoration when the root cannot scroll horizontally', async () => {
  const result = await runFixture('clean-clipped-decoration');
  const overflow = result.viewports[0].frames[0].overflow;
  assert.equal(overflow.pass, true);
  assert.equal(overflow.documentWidth, overflow.viewportWidth);
  assert.ok(overflow.bodyWidth > overflow.viewportWidth);
  assert.ok(overflow.clippedBodyOverflowPixels >= 40);
  assert.equal(overflow.rootOverflowX, 'hidden');
  assert.equal(overflow.bodyOverflowX, 'hidden');
  assert.ok(overflow.offenders.some((offender) => offender.selector === 'div.decoration'));
  assert.ok(!result.defects.some((defect) => defect.code === 'HORIZONTAL_OVERFLOW'));
});

test('detects state drift at matching forward and reverse checkpoints', async () => {
  const result = await runFixture('broken-reverse');
  assert.ok(result.defects.some((defect) => defect.code === 'REVERSE_DRIFT'));
  const drift = result.viewports[0].checks.reverseDrift;
  assert.equal(drift.checked, true);
  assert.ok(drift.mismatches.some((mismatch) => mismatch.progress === 0.5));
  assert.notDeepEqual(drift.mismatches[0].forwardState, drift.mismatches[0].reverseState);
});

test('detects a late asynchronous layout rewrite that changes native scroll geometry mid-journey', async () => {
  const steps = Array.from({ length: 15 }, (_, index) => index / 14);
  const result = await runFixture('broken-late-layout', {
    adapterPath: null,
    steps,
  });
  const forward = result.viewports[0].frames.filter((frame) => frame.direction === 'forward');
  const reverse = result.viewports[0].frames.filter((frame) => frame.direction === 'reverse');
  const forwardHeights = new Set(forward.map((frame) => frame.state.scrollHeight));
  const reverseHeights = new Set(reverse.map((frame) => frame.state.scrollHeight));

  assert.equal(forwardHeights.size, 2, JSON.stringify([...forwardHeights]));
  assert.equal(reverseHeights.size, 1, JSON.stringify([...reverseHeights]));
  assert.ok(result.defects.some((defect) => defect.code === 'REVERSE_DRIFT'));
  assert.ok(result.viewports[0].checks.reverseDrift.mismatches.some((mismatch) => (
    mismatch.forwardState.scrollHeight !== mismatch.reverseState.scrollHeight
  )));
});

test('explicit overlay annotations pass without overlap and fail with geometric collision evidence', async () => {
  const clean = await runFixture('clean-overlay');
  const cleanCheck = clean.viewports[0].checks.overlayCollision;
  assert.equal(cleanCheck.checked, true);
  assert.equal(cleanCheck.pass, true);
  const broken = await runFixture('broken-overlay');
  const brokenCheck = broken.viewports[0].checks.overlayCollision;
  assert.equal(brokenCheck.checked, true);
  assert.equal(brokenCheck.pass, false);
  assert.ok(brokenCheck.failingFrames[0].collisions[0].overlapArea > 1000);
  assert.ok(broken.defects.some((defect) => defect.code === 'OVERLAY_COLLISION'));
});

test('detects a semantic experience that disappears without JavaScript', async () => {
  const result = await runFixture('broken-semantic');
  assert.equal(result.viewports[0].checks.semantics.pass, true);
  assert.equal(result.viewports[0].checks.semanticFallback.pass, false);
  assert.ok(result.defects.some((defect) => defect.code === 'SEMANTIC_FALLBACK_MISSING'));
  assert.ok(result.defects.some((defect) => defect.code === 'NOJS_PRIMARY_ACTION_MISSING'));
});

test('default adapter drives real native scroll at every progress checkpoint', async () => {
  const result = await runFixture('tall-scroll', { adapterPath: null });
  assert.equal(result.verdict.pass, true, JSON.stringify(result.defects));
  const forward = result.viewports[0].frames.filter((frame) => frame.direction === 'forward');
  for (const frame of forward) {
    const maxScroll = frame.state.scrollHeight - frame.state.viewportHeight;
    assert.ok(maxScroll > 1000);
    assert.ok(Math.abs(frame.state.scrollY - maxScroll * frame.progress) <= 1);
    assert.ok(Math.abs(frame.state.progress - frame.progress) <= 0.001);
  }
});

test('default readiness completes promptly while a network response remains open', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/long-lived-request.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.longLivedHeadersReceived === true);
    assert.ok(pendingResponses.size > 0);
    const startedAt = performance.now();
    await defaultReady(page);
    const elapsedMs = performance.now() - startedAt;
    assert.ok(elapsedMs < 1500, `bounded readiness took ${elapsedMs.toFixed(1)}ms`);
  } finally {
    await browser.close();
  }
});

test('accepts configurable semantic and primary-action selectors in rendered and no-JS routes', async () => {
  const result = await runFixture('custom-action', {
    primaryActionSelector: '.reserve',
    noJsPrimaryActionSelector: '.reserve',
    semanticSelector: '.story',
    noJsSemanticSelector: '.story',
  });
  const checks = result.viewports[0].checks;
  assert.equal(checks.semantics.pass, true);
  assert.equal(checks.primaryAction.pass, true);
  assert.equal(checks.primaryActionFallback.pass, true);
  assert.equal(checks.keyboardReachability.pass, true);
});

test('detects a visible primary action that cannot be reached with Tab', async () => {
  const result = await runFixture('broken-keyboard');
  const checks = result.viewports[0].checks;
  assert.equal(checks.primaryAction.pass, true);
  assert.equal(checks.keyboardReachability.pass, false);
  assert.ok(result.defects.some((defect) => defect.code === 'PRIMARY_ACTION_KEYBOARD_UNREACHABLE'));
});

test('rejects action-shaped markup that is hidden and disabled', async () => {
  const result = await runFixture('broken-action', {
    primaryActionSelector: '.book',
    noJsPrimaryActionSelector: '.book',
  });
  const action = result.viewports[0].checks.primaryAction;
  assert.equal(action.found, true);
  assert.equal(action.visible, false);
  assert.equal(action.enabled, false);
  assert.equal(action.pass, false);
  assert.ok(result.defects.some((defect) => defect.code === 'PRIMARY_ACTION_MISSING'));
  assert.ok(result.defects.some((defect) => defect.code === 'NOJS_PRIMARY_ACTION_MISSING'));
});

test('forced WebGL failure preserves a resilient semantic route', async () => {
  const result = await runFixture('clean-webgl-failure', { forceWebglFailure: true });
  const check = result.viewports[0].checks.webglFailure;
  assert.equal(check.checked, true);
  assert.equal(check.patchActive, true);
  assert.equal(check.semantics.pass, true);
  assert.equal(check.primaryAction.pass, true);
  assert.ok(check.errors.some((error) => error.type === 'console' && /Handled renderer diagnostic/.test(error.message)));
  assert.equal(check.fatalErrors.length, 0);
  assert.equal(check.pass, true, JSON.stringify(check.fatalErrors));
});

test('forced WebGL failure catches a renderer that deletes its semantic route', async () => {
  const result = await runFixture('broken-webgl-failure', { forceWebglFailure: true });
  assert.equal(result.viewports[0].checks.webglFailure.pass, false);
  assert.ok(result.defects.some((defect) => defect.code === 'WEBGL_FAILURE_FALLBACK_MISSING'));
});

test('forced WebGL failure rejects an uncaught page error even when fallback content survives', async () => {
  const result = await runFixture('broken-webgl-pageerror', { forceWebglFailure: true });
  const check = result.viewports[0].checks.webglFailure;
  assert.equal(check.semantics.pass, true);
  assert.equal(check.primaryAction.pass, true);
  assert.ok(check.fatalErrors.some((error) => error.type === 'pageerror' && /Unhandled renderer/.test(error.message)));
  assert.equal(check.pass, false);
  assert.ok(result.defects.some((defect) => defect.code === 'WEBGL_FAILURE_FALLBACK_MISSING'));
});

test('captures an unhandled promise rejection as a page error', async () => {
  const result = await runFixture('broken-unhandled-rejection');
  const errors = result.viewports[0].checks.pageErrors.errors;
  assert.ok(errors.some((error) => error.type === 'pageerror' && /Unhandled journey promise rejection/.test(error.message)));
  assert.ok(result.defects.some((defect) => defect.code === 'PAGE_ERRORS'));
});

test('reduced-motion mutation distinguishes a safe and unsafe animation', async () => {
  const safe = await runFixture('clean-reduced-motion');
  assert.equal(safe.viewports[0].checks.reducedMotion.pass, true);
  const unsafe = await runFixture('broken-reduced-motion');
  assert.equal(unsafe.viewports[0].checks.reducedMotion.pass, false);
  assert.ok(unsafe.viewports[0].checks.reducedMotion.activeAnimations.length > 0);
  assert.ok(unsafe.defects.some((defect) => defect.code === 'REDUCED_MOTION_UNSAFE'));
});

test('rejects collision-prone and non-finite audit configuration', async () => {
  const base = { url: `${origin}/clean.html`, adapterPath, steps: [0, 1], viewports: [{ name: 'mobile', width: 390, height: 844 }] };
  await assert.rejects(() => auditTarget({ ...base, viewports: [...base.viewports, { ...base.viewports[0] }] }), /viewport names must be unique/);
  await assert.rejects(() => auditTarget({ ...base, steps: [0, 0, 1] }), /steps must not contain duplicates/);
  await assert.rejects(() => auditTarget({ ...base, timeoutMs: Number.NaN }), /timeout must be a finite value/);
  await assert.rejects(() => auditTarget({ ...base, delayMs: -1 }), /settle must be a finite value/);
});

test('viewport indices keep screenshot paths unique even when names normalize alike', async () => {
  const result = await runFixture('clean', {
    viewports: [
      { name: 'phone_a', width: 390, height: 844 },
      { name: 'phone-a', width: 412, height: 915 },
    ],
    steps: [0, 1],
  });
  const screenshots = result.viewports.flatMap((viewport) => viewport.frames.map((frame) => frame.screenshot));
  assert.equal(new Set(screenshots).size, screenshots.length);
  assert.ok(screenshots.some((name) => name.includes('/0-phone-a-')));
  assert.ok(screenshots.some((name) => name.includes('/1-phone-a-')));
});

test('same-build control passes two clean runs and catches nondeterministic drift', async () => {
  const settings = { steps: [0, 1], controlRuns: 2 };
  const clean = await runFixture('clean', settings);
  assert.equal(clean.controls.checked, true);
  assert.equal(clean.controls.completedRuns, 2);
  assert.equal(clean.controls.pass, true, JSON.stringify(clean.controls.runs));
  assert.equal(clean.controls.runs[0].fingerprint, clean.controls.runs[1].fingerprint);
  const broken = await runFixture('broken-control-drift', settings);
  assert.equal(broken.controls.pass, false);
  assert.notEqual(broken.controls.runs[0].fingerprint, broken.controls.runs[1].fingerprint);
  assert.ok(broken.defects.some((defect) => defect.code === 'CONTROL_DRIFT'));
});

for (const browserName of ['chromium', 'firefox', 'webkit']) {
  test(`generic clean corpus passes in ${browserName}`, async () => {
    const result = await runFixture('clean-overlay', {
      browserName,
      steps: [0, 1],
      direction: 'both',
    });
    assert.equal(result.environment.browser.engine, browserName);
    assert.equal(result.verdict.pass, true, JSON.stringify(result.defects));
    assert.equal(result.viewports[0].checks.overlayCollision.checked, true);
    assert.ok(result.environment.metricLabels.generic.includes('overlay-collision'));
    assert.ok(result.environment.metricLabels.engineSpecific.includes('forced-webgl-failure'));
  });
}
