# Production evidence

This directory preserves the public, machine-checkable portion of the CineTrace 0.3.0 production
control against `https://odessis.in/` on 2 September 2026.

## Files

- `odessis-adapter.mjs` is the exact project adapter used by both controls.
- `odessis-production-control-2026-09-02.json` is the compact evidence index.
- `odessis-production-control-run-1-report.json` is the complete sanitized baseline report.
- `odessis-production-control-run-2-report.json` is the complete sanitized fresh-context report.
- `SHA256SUMS` binds the public adapter and all three JSON records.

The only sanitization replaces the private local adapter pathname recorded by the CLI with the
public repository path `./evidence/odessis-adapter.mjs`. Verdicts, fingerprints, states, screenshot
digests, browser/runtime metadata, checks and errors are unchanged.

Run the integrity check from the repository root:

```sh
npm run evidence:verify
```

The `v0.3.0` GitHub Release also carries a compressed evidence bundle containing both generated
static reports and all 40 original PNG frames. The production target can change after the recorded
run; these artifacts prove the sampled state at the recorded time, not the target's future state.
