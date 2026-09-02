# CineTrace proof record

Verified locally on 2 September 2026 against CineTrace 0.3.0. This record contains only commands and evidence actually executed against the local repository.

## Release-bar mutation corpus

`npm test` completed 26 tests with 26 passes and 0 failures in 12.42 seconds.

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
- malformed progress, timing and viewport configuration;
- screenshot-path collisions.

The controls prove that clipped decoration does not become false root overflow, handled renderer console diagnostics do not become fatal fallback errors, and a long-lived network response does not delay default readiness.

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

## Prior production audit retained

The earlier CineTrace 0.2.2 production run against `https://odessis.in/` remains historical regression evidence. It completed with 0 defects across desktop and mobile after bounded readiness, clipped-overflow and handled-WebGL diagnostics were repaired. This 0.3.0 release-bar pass did not make a new production-network claim.

## Package checks

- `npm audit --audit-level=moderate`: 0 vulnerabilities
- `node --check` on every source file: PASS
- `report.schema.json` JSON syntax: PASS
- `npm pack --dry-run`: PASS, 11 distributable files
- Product-coupling scan over source, tests, README, schema and package metadata: no Odessis references
- Readiness scan: no `networkidle` dependency
- `git diff --check`: PASS

## Evidence boundaries

A desktop browser context at phone dimensions is not a physical device. The keyboard, heading, semantic, primary-action and reduced-motion checks are not WCAG conformance testing, a complete accessibility audit or certification. CineTrace does not score beauty, universal smoothness or market demand, and sampled checkpoints do not prove that every intermediate frame was physically presented.

CineTrace audits light DOM only. It does not pierce iframes or shadow roots. Keyboard evidence proves focus reachability, not downstream transaction success. Reduced-motion evidence covers active DOM animations longer than 100 ms, not motion entirely inside canvas or WebGL. Forced renderer failure covers initial WebGL/WebGL2 context creation, not later context loss or WebGPU. Virtual-scroll sites need a custom adapter.

No package or external repository was published by this verification run.
