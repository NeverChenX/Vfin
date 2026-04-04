# HQChart Simple Layout Test Report

Date: 2026-04-04 (updated)

## Backend Tests

Command:
```
cd backend/gateway
npm test
```
Result: PASS (last run 2026-04-03, 7 test files)

Fresh run:
```
cd backend/gateway
npm test
```
Result: PASS (2026-04-04, 7 files / 36 tests)

## API Smoke

- /api/watchlist: PASS
- /api/stock?symbol=600000.sh: PASS
- /api/kline?symbol=00700.hk&period=day&count=200: PASS

## Frontend Smoke

URL: http://127.0.0.1:8080/hqchart
Result: PASS (2026-04-04 fresh run, HTTP 200)

## Notes

- Live gateway smoke endpoints returned HTTP 200 for `/api/health/live` and `/api/stock?symbol=600000.sh` during 2026-04-04 fresh run.
- Added repo-root `hqchart/index.html` entry page to guarantee `/hqchart` works when serving static files from repo root.
