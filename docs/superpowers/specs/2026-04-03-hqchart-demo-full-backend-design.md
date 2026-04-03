# HQChart Demo Full Backend Design

## Scope

This document records the backendized HQChart demo verification scope for 2026-04-03.

- Backend service: `hqchart-gateway`
- Verified routes:
  - `/api/hqchart/watchlist`
  - `/api/hqchart/stock`
  - `/api/hqchart/kline`
- Validation methods:
  - full backend test suite
  - local API smoke against a running server

## Design Notes

- The gateway exposes a small API surface for demo pages and smoke testing.
- Mock provider mode is used for deterministic local verification.
- Watchlist reads and market data reads are expected to remain stable across the demo flow.
- Trace id and CORS behavior are part of the API contract because the demo runs in browser contexts.

## Implementation Status（当前完成度）

### Completed

- [x] Full backend test suite passes in `hqchart-gateway`
- [x] Local API smoke passes for `/watchlist`, `/stock`, and `/kline`
- [x] Verification report written to `docs/superpowers/plans/2026-04-03-hqchart-demo-full-backend-test-report.md`
- [x] Release/design note updated with current validation status

### Verified Output

- `npm test` completed successfully with `6` passed files and `29` passed tests
- Local smoke returned:
  - `/api/hqchart/watchlist` -> `200`, body `{ "items": [] }`
  - `/api/hqchart/stock` -> `200`, mock payload for `600000.sh`
  - `/api/hqchart/kline` -> `200`, mock payload for `00700.hk`

### Not Executed in This Task

- [ ] Browser-level visual regression on the demo pages
- [ ] Live upstream provider validation outside mock mode

### Current Readiness

The backend verification required for the demo flow is complete for this task. Remaining work is limited to browser rendering verification and any non-mock provider follow-up, which are outside the scope of this change.
