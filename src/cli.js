#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { auditTarget } from './audit.js';

const HELP = `CineTrace 0.3.0

Usage:
  cinetrace audit <url> [options]

Options:
  --out <directory>          Report directory (default: cinetrace-report)
  --viewports <presets>      Comma-separated presets: desktop,mobile
  --viewport <name:WxH@DPR>  Custom viewport; repeat to add more
  --steps <count|values>     Evenly spaced count or comma checkpoints
  --direction <mode>         forward, reverse, or both (default: both)
  --reverse                  Compatibility alias for --direction both
  --reduced-motion           Explicitly enable reduced-motion verification
  --browser <engine>         chromium, firefox, or webkit
  --control-runs <count>     Same-build deterministic repetitions (1-5)
  --adapter <file>           ESM adapter: [prepare,] ready/setProgress/readState
  --primary-action <css>     Rendered primary-action selector
  --no-js-primary-action <css>
                             No-JS primary-action selector
  --semantic-content <css>   Rendered semantic-content selector
  --no-js-semantic-content <css>
                             No-JS semantic-content selector
  --force-webgl-failure      Block WebGL before page scripts and audit fallback
  --overlay <css>            Explicit overlay selector
  --overlay-target <css>     Elements protected from overlay occlusion
  --timeout <milliseconds>   Navigation timeout (default: 30000)
  --settle <milliseconds>    Delay after two animation frames (default: 50)
  --help                     Show this help

Outputs:
  <directory>/report.json    Machine-readable audit
  <directory>/index.html     Static filmstrip report
  <directory>/images/*.png   Viewport captures
`;

const VIEWPORT_PRESETS = {
  desktop: { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
};

export function parseViewport(value) {
  const match = /^(?<name>[a-z0-9_-]+):(?<width>\d+)x(?<height>\d+)(?:@(?<dpr>\d+(?:\.\d+)?))?$/i.exec(value);
  if (!match) throw new TypeError(`Invalid viewport "${value}"; expected name:WIDTHxHEIGHT@DPR`);
  const width = Number(match.groups.width);
  const height = Number(match.groups.height);
  if (width < 200 || height < 200) throw new RangeError('Viewport dimensions must be at least 200px');
  const deviceScaleFactor = match.groups.dpr ? Number(match.groups.dpr) : 1;
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0 || deviceScaleFactor > 4) throw new RangeError('Viewport DPR must be greater than 0 and no more than 4');
  return { name: match.groups.name, width, height, deviceScaleFactor };
}

export function parseSteps(value) {
  if (/^\d+$/.test(value)) {
    const count = Number(value);
    if (count < 2 || count > 101) throw new RangeError('Step count must be from 2 through 101');
    return Array.from({ length: count }, (_, index) => index / (count - 1));
  }
  return value.split(',').map(Number);
}

function parseViewportPresets(value) {
  return value.split(',').map((name) => {
    const preset = VIEWPORT_PRESETS[name.trim().toLowerCase()];
    if (!preset) throw new TypeError(`Unknown viewport preset: ${name}`);
    return { ...preset };
  });
}

export function parseArgs(args) {
  const values = [...args];
  if (values.includes('--help') || values.includes('-h')) return { help: true };
  const command = values.shift();
  const url = values.shift();
  if (command !== 'audit' || !url || url.startsWith('-')) throw new TypeError('Expected: cinetrace audit <url>');
  const options = { url, viewports: [] };
  while (values.length) {
    const flag = values.shift();
    if (['--force-webgl-failure', '--reverse', '--reduced-motion'].includes(flag)) {
      if (flag === '--force-webgl-failure') options.forceWebglFailure = true;
      if (flag === '--reverse') options.direction = 'both';
      if (flag === '--reduced-motion') options.checkReducedMotion = true;
      continue;
    }
    const value = values.shift();
    if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
    switch (flag) {
      case '--out': options.outDir = path.resolve(value); break;
      case '--viewport': options.viewports.push(parseViewport(value)); break;
      case '--viewports': options.viewports.push(...parseViewportPresets(value)); break;
      case '--steps': options.steps = parseSteps(value); break;
      case '--direction': options.direction = value; break;
      case '--browser': options.browserName = value.toLowerCase(); break;
      case '--control-runs': options.controlRuns = Number(value); break;
      case '--adapter': options.adapterPath = path.resolve(value); break;
      case '--primary-action': options.primaryActionSelector = value; break;
      case '--no-js-primary-action': options.noJsPrimaryActionSelector = value; break;
      case '--semantic-content': options.semanticSelector = value; break;
      case '--no-js-semantic-content': options.noJsSemanticSelector = value; break;
      case '--overlay': options.overlaySelector = value; break;
      case '--overlay-target': options.protectedSelector = value; break;
      case '--timeout': options.timeoutMs = Number(value); break;
      case '--settle': options.delayMs = Number(value); break;
      default: throw new TypeError(`Unknown option: ${flag}`);
    }
  }
  if (options.viewports.length === 0) delete options.viewports;
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(HELP);
      return;
    }
    const result = await auditTarget(options);
    process.stdout.write(`${JSON.stringify({
      pass: result.verdict.pass,
      defects: result.verdict.defectCount,
      report: path.join(path.resolve(options.outDir ?? 'cinetrace-report'), 'index.html'),
      json: path.join(path.resolve(options.outDir ?? 'cinetrace-report'), 'report.json'),
    }, null, 2)}\n`);
    if (!result.verdict.pass) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`CineTrace: ${error.message}\n\n${HELP}`);
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
