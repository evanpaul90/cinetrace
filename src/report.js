import { writeFile } from 'node:fs/promises';
import { escapeHtml } from './utils.js';

function badge(pass, unchecked = false) {
  if (unchecked) return '<span class="badge neutral">not checked</span>';
  return `<span class="badge ${pass ? 'pass' : 'fail'}">${pass ? 'pass' : 'fail'}</span>`;
}

function renderFrames(viewport) {
  return viewport.frames.map((frame) => `
    <figure>
      <img src="${escapeHtml(frame.screenshot)}" alt="${escapeHtml(viewport.viewport.name)} ${frame.direction} at ${frame.progress}">
      <figcaption><strong>${frame.direction}</strong> · ${Math.round(frame.progress * 100)}% · state ${frame.stateDigest}</figcaption>
    </figure>`).join('');
}

export async function renderHtmlReport(filePath, report) {
  const sections = report.viewports.map((viewport) => {
    const checks = viewport.checks;
    return `
      <section>
        <h2>${escapeHtml(viewport.viewport.name)} <small>${viewport.viewport.width}×${viewport.viewport.height}</small></h2>
        <div class="checks">
          <div>Horizontal overflow ${badge(checks.overflow.pass)}</div>
          <div>Semantic content ${badge(checks.semantics.pass)}</div>
          <div>Rendered primary action ${badge(checks.primaryAction.pass)}</div>
          <div>Keyboard reaches action ${badge(checks.keyboardReachability.pass)}</div>
          <div>No-JS semantic fallback ${badge(checks.semanticFallback.pass)}</div>
          <div>No-JS primary action ${badge(checks.primaryActionFallback.pass)}</div>
          <div>Reverse drift ${badge(checks.reverseDrift.pass, !checks.reverseDrift.checked)}</div>
          <div>Reduced motion ${badge(checks.reducedMotion.pass)}</div>
          <div>Forced WebGL failure ${badge(checks.webglFailure.pass, !checks.webglFailure.checked)}</div>
          <div>Page errors ${badge(checks.pageErrors.pass)}</div>
        </div>
        <div class="filmstrip">${renderFrames(viewport)}</div>
      </section>`;
  }).join('');
  const defectList = report.defects.length
    ? `<ul>${report.defects.map((defect) => `<li><code>${escapeHtml(defect.code)}</code> · ${escapeHtml(defect.viewport)}</li>`).join('')}</ul>`
    : '<p>No defects detected by the configured checks.</p>';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CineTrace report · ${escapeHtml(report.target)}</title>
  <style>
    :root { color-scheme: dark; --paper:#11130f; --ink:#f5f2e8; --muted:#a6a99d; --line:#32372d; --acid:#d8ff66; --red:#ff735c; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
    header,section { padding:clamp(24px,5vw,72px); border-bottom:1px solid var(--line); }
    h1 { max-width:18ch; margin:.2em 0; font:700 clamp(40px,7vw,92px)/.92 system-ui,sans-serif; letter-spacing:-.06em; }
    h2 { display:flex; gap:16px; align-items:baseline; font:650 clamp(26px,4vw,52px)/1 system-ui,sans-serif; }
    h2 small { color:var(--muted); font:13px ui-monospace,monospace; letter-spacing:0; }
    .eyebrow { color:var(--acid); text-transform:uppercase; letter-spacing:.16em; }
    .summary { max-width:780px; color:var(--muted); }
    .checks { display:flex; flex-wrap:wrap; gap:10px 22px; margin:24px 0; }
    .badge { display:inline-block; margin-left:5px; padding:2px 7px; border:1px solid; border-radius:99px; font-size:11px; }
    .pass { color:var(--acid); }.fail { color:var(--red); }.neutral { color:var(--muted); }
    .filmstrip { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(260px,36vw); gap:14px; overflow-x:auto; scroll-snap-type:x mandatory; padding-bottom:18px; }
    figure { margin:0; scroll-snap-align:start; border:1px solid var(--line); background:#090a08; }
    img { display:block; width:100%; aspect-ratio:16/10; object-fit:cover; }
    figcaption { padding:10px 12px; color:var(--muted); font-size:11px; }
    code { color:var(--acid); }
    @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation:none!important; transition:none!important; } }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">CineTrace / deterministic filmstrip audit</div>
    <h1>${report.verdict.pass ? 'Sequence holds.' : `${report.verdict.defectCount} defect${report.verdict.defectCount === 1 ? '' : 's'} found.`}</h1>
    <p class="summary">${escapeHtml(report.target)} · ${escapeHtml(report.generatedAt)} · native progress, forward/reverse state comparison, overflow, semantic and primary-action fallback, keyboard access, forced WebGL failure, reduced motion, and runtime errors.</p>
    ${defectList}
  </header>
  ${sections}
</body>
</html>`;
  await writeFile(filePath, html);
}
