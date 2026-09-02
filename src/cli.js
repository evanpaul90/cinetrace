#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { auditTarget } from './audit.js';

const HELP = `CineTrace 0.2.2

Usage:
  cinetrace audit <url> [options]

Options:
  --out <directory>          Report directory (default: cinetrace-report)
  --viewport <name:WxH>      Capture viewport; repeat to add more
  --steps <0,0.25,...,1>     Progress checkpoints
  --direction <mode>         forward, reverse, or both (default: both)
  --adapter <file>           ESM adapter exporting ready/setProgress/readState
  --primary-action <css>     Rendered primary-action selector
  --no-js-primary-action <css>
                             No-JS primary-action selector
  --semantic-content <css>   Rendered semantic-content selector
  --no-js-semantic-content <css>
                             No-JS semantic-content selector
  --force-webgl-failure      Block WebGL before page scripts and audit fallback
  --timeout <milliseconds>   Navigation timeout (default: 30000)
  --settle <milliseconds>    Delay after two animation frames (default: 50)
  --help                     Show this help

Outputs:
  <directory>/report.json    Machine-readable audit
  <directory>/index.html     Static filmstrip report
  <directory>/images/*.png   Viewport captures
`;

export function parseViewport(value) {
  const match = /^(?<name>[a-z0-9_-]+):(?<width>\d+)x(?<height>\d+)$/i.exec(value);
  if (!match) throw new TypeError(`Invalid viewport "${value}"; expected name:WIDTHxHEIGHT`);
  const width = Number(match.groups.width);
  const height = Number(match.groups.height);
  if (width < 200 || height < 200) throw new RangeError('Viewport dimensions must be at least 200px');
  return { name: match.groups.name, width, height };
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
    if (flag === '--force-webgl-failure') {
      options.forceWebglFailure = true;
      continue;
    }
    const value = values.shift();
    if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
    switch (flag) {
      case '--out': options.outDir = path.resolve(value); break;
      case '--viewport': options.viewports.push(parseViewport(value)); break;
      case '--steps': options.steps = value.split(',').map(Number); break;
      case '--direction': options.direction = value; break;
      case '--adapter': options.adapterPath = path.resolve(value); break;
      case '--primary-action': options.primaryActionSelector = value; break;
      case '--no-js-primary-action': options.noJsPrimaryActionSelector = value; break;
      case '--semantic-content': options.semanticSelector = value; break;
      case '--no-js-semantic-content': options.noJsSemanticSelector = value; break;
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
