import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'evidence', 'SHA256SUMS');
const manifest = await readFile(manifestPath, 'utf8');
const rows = manifest.split('\n').filter(Boolean);

if (rows.length === 0) throw new Error('Evidence manifest is empty');

for (const row of rows) {
  const match = /^(?<digest>[a-f0-9]{64})  (?<file>.+)$/.exec(row);
  if (!match) throw new Error(`Malformed evidence manifest row: ${row}`);
  const filePath = path.resolve(root, 'evidence', match.groups.file);
  if (!filePath.startsWith(`${path.join(root, 'evidence')}${path.sep}`)) {
    throw new Error(`Evidence path escapes its directory: ${match.groups.file}`);
  }
  const content = await readFile(filePath);
  const digest = createHash('sha256').update(content).digest('hex');
  if (digest !== match.groups.digest) {
    throw new Error(`Evidence digest mismatch: ${match.groups.file}`);
  }
}

const parseJson = async (file) => JSON.parse(await readFile(path.join(root, 'evidence', file), 'utf8'));
const summary = await parseJson('odessis-production-control-2026-09-02.json');
const baseline = await parseJson('odessis-production-control-run-1-report.json');
const control = await parseJson('odessis-production-control-run-2-report.json');
const schema = JSON.parse(await readFile(path.join(root, 'report.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

for (const [name, report] of [['baseline', baseline], ['control', control]]) {
  if (!validate(report)) throw new Error(`${name} report failed schema validation: ${ajv.errorsText(validate.errors)}`);
  assert.deepEqual(report.verdict, { pass: true, defectCount: 0 });
}

assert.equal(summary.verdict.pass, true);
assert.equal(summary.verdict.defects, 0);
assert.equal(summary.controls.pass, true);
assert.equal(summary.controls.requested, 2);
assert.equal(summary.controls.completed, 2);
assert.equal(baseline.controls.pass, true);
assert.equal(baseline.controls.completedRuns, 2);
assert.equal(summary.controls.run1Fingerprint, baseline.controls.runs[0].fingerprint);
assert.equal(summary.controls.run2Fingerprint, baseline.controls.runs[1].fingerprint);
assert.equal(control.controls.baselineFingerprint, summary.controls.run2Fingerprint);

process.stdout.write(`Verified ${rows.length} evidence files, 2 report schemas and matching control fingerprints.\n`);
