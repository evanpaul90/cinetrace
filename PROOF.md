# CineTrace proof record

Verified locally on 2 September 2026 against CineTrace 0.3.0. This record contains only commands and evidence actually executed against the local repository.

## Release-bar mutation corpus

Three consecutive `npm test` runs completed 90 tests with 90 passes and 0 failures. The
document-start preparation control was also repeated 30 times after removing cross-run colour and
font raster variability; all 30 runs produced the same fingerprint
`67ee8cbecdf52f33`.

The corpus proves deliberate failures for:

- actual root horizontal overflow;
- reverse-path state drift;
- explicitly annotated overlay occlusion, with overlap dimensions and area;
- missing no-JavaScript semantics and primary action;
- unreachable, hidden and disabled primary actions;
- unhandled promise rejection and uncaught page error;
- broken forced-WebGL fallback;
- ignored reduced-motion preference;
- nondeterministic same-build control drift;
- a document-start preparation patch planted too late in `ready(page)`, which remains nondeterministic and leaves unsafe reduced motion active;
- a late scroll-geometry rewrite after traversal has begun;
- malformed progress, timing and viewport configuration;
- screenshot-path collisions.

The controls prove that clipped decoration does not become false root overflow, handled renderer console diagnostics do not become fatal fallback errors, a long-lived network response does not delay default readiness, and an adapter without the optional `prepare(page)` hook remains compatible.

The clean preparation fixture also proves that `prepare(page)` runs before document scripts in both primary and reduced-motion pages. Its init script fixes the boot seed at `0.3141592653589793`; every captured state reports the same seed, reduced motion passes, and two same-build fingerprints match. The report schema remains 2.0.0 because the lifecycle hook changes adapter execution only, not the output contract.

## Same-build clean control

The test corpus runs the clean fixture twice through the same installed browser build. Both clean fingerprints match, while `broken-control-drift.html` produces `CONTROL_DRIFT`.

An additional CLI control run completed with 0 defects:

```text
requestedRuns: 2
completedRuns: 2
browser: chromium 151.0.7922.34
run 1 fingerprint: 98d9095cbbbd511a
run 2 fingerprint: 98d9095cbbbd511a
sameBuild: true
```

## Three-engine generic corpus

The generic clean overlay corpus passed through the same overflow, heading, keyboard, semantic-content, primary-action, overlay, reverse-drift, reduced-motion and error checks in:

- Chromium 151.0.7922.34
- Firefox 153.0
- WebKit 26.5

Renderer metadata and forced WebGL failure are labelled `engine-specific` in report metadata. Generic checks are listed separately.

## Public CLI compatibility

The opportunity-brief compatibility aliases are covered by parser tests. The binary-equivalent command was also executed end to end against the local clean fixture:

```sh
node src/cli.js audit http://127.0.0.1:41777 \
  --viewports desktop,mobile \
  --steps 15 \
  --reverse \
  --reduced-motion \
  --out artifacts/compatibility-proof
```

Result: PASS, 0 defects, 15 evenly spaced states, 30 forward/reverse frames per viewport, 60 frames total.

The generated schema-2.0.0 report records browser engine and version, OS platform/architecture/release, Node runtime, viewport dimensions and device scale, plus honestly nullable WebGL API/vendor/renderer fields. The clean report is validated against `report.schema.json` in the automated corpus.

## Production release proof

The earlier CineTrace 0.2.2 three-state pass against `https://odessis.in/` is not retained as release evidence. A 15-state 0.3.0 control run showed that the short audit had completed while the fixed boot canvas still covered the application and before the asynchronous scene build replaced provisional chapter heights with final weighted heights.

The observed desktop document changed from 8784px to 8073px; mobile changed from 7090px to 7571px. Source inspection accounts for those values exactly: the initial CSS contributes 976vh on desktop and 840vh on mobile, while the later `scrollWeight * 92vh` rewrite contributes 897vh. The two same-build runs crossed that real layout transition at different reverse checkpoints, and the time-driven boot canvas produced different screenshot bytes, so `REVERSE_DRIFT` and `CONTROL_DRIFT` were valid findings under the configured default adapter.

A post-diagnosis three-state production rerun completed in 11.8 seconds with zero reported defects and only the provisional heights. Its final screenshot still showed the boot canvas, proving why the short green result is insufficient. A separate desktop probe waited until the boot element was absent; readiness took 56.95 seconds in that headless run, after which five forward and five reverse checkpoints all retained the final 8073px height and matching scroll progress.

Odessis PR 8 subsequently moved the final weighted chapter geometry into first-paint CSS. Its live
boot-geometry oracle now holds desktop at 8073px and mobile at 7571px before readiness, at readiness
and after the boot element leaves the DOM.

Odessis PR 9 added an inactive-by-default fixed-time capture surface and fixed-seed atmosphere
construction. A separate decoded-RGBA production oracle passed across two fresh contexts in pinned
Chromium 145.0.7632.6 with ANGLE Metal:

- between Stoa and Theatre: `0c984f5af78832a289190396129a3fe61d6e5f5b4c5302ccbe345e69a88cfc25` in both contexts;
- Tholos: `bba76f9e0fb596d1a948840d63476ea9c216c55e18bbeab75b1f3f2fcc977cc5` in both contexts;
- deliberate film-grain mutation: `053d4c30468ee65802325011f16ce6951b5ecd7c48f2431925926d38d5737d0c`, correctly different.

The complete CineTrace production command then passed against `https://odessis.in/` with zero
defects. It captured five checkpoints forward and reverse at 1440x900 and 390x844, verified rendered
and no-JavaScript semantics and primary actions, keyboard reachability, overflow, reverse state,
reduced motion, forced WebGL failure and page errors, then repeated the entire audit in a fresh
same-build control. Both controls produced fingerprint `1273464af6848e6b` under Chromium
151.0.7922.34 and SwiftShader WebGL2. The machine-readable summary is
`evidence/odessis-production-control-2026-09-02.json`.

CineTrace's reverse, screenshot and control oracles were not weakened. The earlier premature green
remains invalid evidence; the final result passed only after the target's real readiness and
determinism defects were corrected.

## Package checks

- `npm audit --audit-level=moderate`: 0 vulnerabilities
- `node --check` on every source file: PASS
- `report.schema.json` JSON syntax: PASS
- `npm pack --dry-run`: PASS, 10 distributable files, 20.1 kB packed / 71.5 kB unpacked
- Product-coupling scan over the distributable package payload: no Odessis references
- Readiness scan: no `networkidle` dependency
- `git diff --check`: PASS

## Evidence boundaries

A desktop browser context at phone dimensions is not a physical device. The keyboard, heading, semantic, primary-action and reduced-motion checks are not WCAG conformance testing, a complete accessibility audit or certification. CineTrace does not score beauty, universal smoothness or market demand, and sampled checkpoints do not prove that every intermediate frame was physically presented.

CineTrace audits light DOM only. It does not pierce iframes or shadow roots. Keyboard evidence proves focus reachability, not downstream transaction success. Reduced-motion evidence covers active DOM animations longer than 100 ms, not motion entirely inside canvas or WebGL. Forced renderer failure covers initial WebGL/WebGL2 context creation, not later context loss or WebGPU. Virtual-scroll sites need a custom adapter.

No package or external repository was published by this verification run.
