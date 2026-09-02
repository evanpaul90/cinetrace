# Security policy

## Supported version

Security fixes are applied to the latest tagged release. CineTrace is currently in the 0.x series,
so fixes may ship with a minor version change.

## Report a vulnerability

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting form:

https://github.com/evanpaul90/cinetrace/security/advisories/new

Include the affected version, a minimal reproduction, impact and any suggested mitigation. You can
expect an acknowledgement within five business days. No bounty programme is currently offered.

Project adapters are executable JavaScript supplied by the operator and run with the local Node and
browser permissions of the CineTrace process. Only run adapters you trust. CineTrace is a local CLI,
not a hosted URL-scanning service.
