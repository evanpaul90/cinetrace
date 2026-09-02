import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs, parseViewport } from '../src/cli.js';

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
    { name: 'wide', width: 1600, height: 900 },
    { name: 'phone', width: 390, height: 844 },
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
  assert.throws(() => parseViewport('mobile-390x844'), /expected name:WIDTHxHEIGHT/);
});
