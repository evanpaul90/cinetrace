import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('public demo and source installation stay bound to the recorded evidence', async () => {
  const [html, readme, summary] = await Promise.all([
    readFile(path.join(root, 'docs', 'index.html'), 'utf8'),
    readFile(path.join(root, 'README.md'), 'utf8'),
    readFile(path.join(root, 'evidence', 'odessis-production-control-2026-09-02.json'), 'utf8').then(JSON.parse),
  ]);

  assert.equal(summary.verdict.pass, true);
  assert.equal(summary.verdict.defects, 0);
  assert.equal(summary.controls.run1Fingerprint, summary.controls.run2Fingerprint);
  assert.match(html, new RegExp(summary.controls.run1Fingerprint));
  assert.match(html, /0 defects/i);
  assert.match(html, /40 PNG captures/i);
  assert.match(readme, /not published today/i);
  assert.match(readme, /git clone --depth 1 --branch v0\.3\.0/);
  assert.doesNotMatch(readme, /^npx cinetrace audit/m);

  for (const frame of ['frame-0.webp', 'frame-0_25.webp', 'frame-0_5.webp', 'frame-0_75.webp', 'frame-1.webp']) {
    assert.match(html, new RegExp(frame.replace('.', '\\.')));
    await access(path.join(root, 'docs', 'assets', frame));
  }
});
