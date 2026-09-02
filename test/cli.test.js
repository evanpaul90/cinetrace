import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs, parseSteps, parseViewport } from '../src/cli.js';

test('parses repeated configurable viewports and progress steps', () => {
  const options = parseArgs([
    'audit',
    'https://example.com',
    '--viewport', 'wide:1600x900',
    '--viewport', 'phone:390x844',
    '--steps', '0,0.33,0.66,1',
    '--direction', 'reverse',
    '--primary-action', '.book-now',
    '--no-js-primary-action', '#fallback-booking',
    '--semantic-content', '.story',
    '--no-js-semantic-content', 'main',
    '--force-webgl-failure',
  ]);
  assert.deepEqual(options.viewports, [
    { name: 'wide', width: 1600, height: 900, deviceScaleFactor: 1 },
    { name: 'phone', width: 390, height: 844, deviceScaleFactor: 1 },
  ]);
  assert.deepEqual(options.steps, [0, 0.33, 0.66, 1]);
  assert.equal(options.direction, 'reverse');
  assert.equal(options.primaryActionSelector, '.book-now');
  assert.equal(options.noJsPrimaryActionSelector, '#fallback-booking');
  assert.equal(options.semanticSelector, '.story');
  assert.equal(options.noJsSemanticSelector, 'main');
  assert.equal(options.forceWebglFailure, true);
});

test('rejects malformed viewports', () => {
  assert.throws(() => parseViewport('mobile-390x844'), /expected name:WIDTHxHEIGHT@DPR/);
});

test('accepts the opportunity brief compatibility command', () => {
  const options = parseArgs([
    'audit', 'https://example.test',
    '--viewports', 'desktop,mobile',
    '--steps', '15',
    '--reverse',
    '--reduced-motion',
    '--browser', 'firefox',
    '--control-runs', '2',
  ]);
  assert.deepEqual(options.viewports.map((viewport) => viewport.name), ['desktop', 'mobile']);
  assert.equal(options.steps.length, 15);
  assert.equal(options.steps[0], 0);
  assert.equal(options.steps.at(-1), 1);
  assert.equal(options.direction, 'both');
  assert.equal(options.checkReducedMotion, true);
  assert.equal(options.browserName, 'firefox');
  assert.equal(options.controlRuns, 2);
});

test('parses explicit progress lists separately from evenly spaced counts', () => {
  assert.deepEqual(parseSteps('0,0.2,1'), [0, 0.2, 1]);
  assert.equal(parseSteps('3')[1], 0.5);
});
