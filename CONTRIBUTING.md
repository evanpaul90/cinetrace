# Contributing to CineTrace

CineTrace is a focused audit tool. Contributions should preserve deterministic evidence, honest
scope boundaries and compatibility with Chromium, Firefox and WebKit.

## Before opening a pull request

1. Open an issue for a new oracle or report-contract change so its failure condition can be agreed
   before implementation.
2. Add one clean fixture and one deliberate mutation for any new oracle. A check without a known
   failing control is not release evidence.
3. Run the local release checks:

   ```sh
   npm ci
   npx playwright install chromium firefox webkit
   npm test
   npm run evidence:verify
   npm audit --audit-level=moderate
   npm pack --dry-run
   ```

4. Keep product-specific adapters and proof outside the distributable package payload.
5. Document evidence limits. Do not turn a sampled browser check into a claim about physical
   devices, complete accessibility conformance or universal renderer behavior.

Small bug fixes can go straight to a pull request. Explain the failure, the oracle that catches it
and the evidence that proves the fix.
