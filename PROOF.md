# CineTrace proof record

Verified locally on 2 September 2026 against CineTrace 0.2.2.

## Adversarial corpus

`npm test` completed 18 tests with 18 passes and 0 failures in 6.53 seconds. The corpus includes deliberate failures for horizontal overflow, reverse-scroll state drift, missing no-JavaScript semantics, unreachable and disabled primary actions, uncaught page errors, broken WebGL fallback, unsafe reduced motion, malformed configuration, and screenshot path collisions.

It also proves that intentionally clipped decoration is not misclassified as page overflow and that readiness completes while a network response remains open.

## Production audit

Target: `https://odessis.in/`

Command:

```sh
cinetrace audit https://odessis.in/ \
  --viewport desktop:1440x900 \
  --viewport mobile:390x844 \
  --steps 0,0.5,1 \
  --direction both \
  --semantic-content 'main, body' \
  --no-js-semantic-content 'main, body' \
  --force-webgl-failure \
  --timeout 20000
```

Result: PASS, 0 defects.

Both viewports passed all ten checks: horizontal overflow, rendered semantics, rendered primary action, no-JavaScript primary action, keyboard reachability, no-JavaScript semantics, reverse-scroll drift, reduced motion, forced WebGL failure, and uncaught page errors.

The forced WebGL run recorded the expected Three.js context-creation errors as handled console diagnostics. It recorded no fatal errors, and the semantic route plus primary action remained available.

## Package checks

- `npm audit --audit-level=moderate`: 0 vulnerabilities
- `node --check` on every source file: PASS
- `npm pack --dry-run`: 10 files, 14.3 kB packed, 47.9 kB unpacked
- Product-specific coupling scan: no Odessis references in source, tests, package metadata, or README
- Readiness scan: no `networkidle` dependency

## Honest limits

CineTrace 0.2.2 audits light DOM only. It does not pierce iframes or shadow roots. Keyboard evidence proves that a primary action is reachable with Tab, not that a downstream transaction succeeds. Reduced-motion evidence covers active DOM animations longer than 100 ms, not animation rendered entirely inside canvas or WebGL. Forced renderer failure covers initial WebGL/WebGL2 context creation, not later context loss or WebGPU. Sites using virtual scrolling need a custom adapter.

This record is local verification, not a claim of third-party certification.
