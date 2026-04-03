# HQChart Demo Full Backend Test Report

Date: 2026-04-03  
Branch: `feature/hqchart-full-backend`

## Summary

- Backend unit/integration tests: PASS
- API smoke tests: PASS
- UI regression matrix: NOT RUN (requires browser session)

## Environment

- Host: local workspace
- Gateway: `node src/server.js` (port 18080)
- Demo page: not opened in browser for this report

## Backend Test Suite

Command:

```bash
cd hqchart-gateway
npm test
```

Result: PASS  
`6` files, `29` tests passed.

## API Smoke

Commands:

```bash
curl "http://127.0.0.1:18080/api/hqchart/watchlist"
curl "http://127.0.0.1:18080/api/hqchart/stock?symbol=600000.sh"
curl "http://127.0.0.1:18080/api/hqchart/kline?symbol=00700.hk&period=day&count=200"
```

Results (sample):

```json
{"items":[]}
```

```json
{"symbol":"600000.sh","market":"sh","provider":"sina","timestamp":"2026-04-03T09:30:00.000Z","name":"Mock 600000.sh","price":12.34,"open":12.1,"high":12.6,"low":12,"volume":123456,"amount":1523456}
```

```json
{"symbol":"00700.hk","market":"hk","provider":"sina","timestamp":"2026-04-03T09:30:00.000Z","period":"day","items":[{"date":"2026-04-01","open":12,"high":12.5,"low":11.9,"close":12.2,"volume":110000,"amount":1342000},{"date":"2026-04-02","open":12.2,"high":12.4,"low":12.1,"close":12.28,"volume":98000,"amount":1204800},{"date":"2026-04-03","open":12.28,"high":12.6,"low":12.18,"close":12.34,"volume":123456,"amount":1523456}]}
```

## UI Regression Matrix

Not executed in this run. Use `webhqchart.demo/samples/hqchart_demo.html` with a local static server and verify:

- [ ] A-share symbol add/remove works and persists after refresh
- [ ] HK symbol add/remove works and persists after refresh
- [ ] Minute, 5-day minute, day/week/month/year, 1/5/15/30 minute all switch correctly
- [ ] Stock chip / call auction / draw tool path still render without JS errors
- [ ] Provider failure shows structured error, no blank screen

## Issues

None observed in automated tests and API smoke.
