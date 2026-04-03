# HQChart Simple Layout Design

Date: 2026-04-03

## Goal

Restructure the repo into three clear top-level folders (frontend/backend/services), simplify the demo URL to `/hqchart`, and ensure all backend data comes from live public free sources with multi-source failover. Keep Python indicator computation as a standalone tool.

## Progress

- [x] Requirements confirmed (structure, URL, live data sources)
- [x] Create new directory layout (frontend/backend/services)
- [x] Move demo page to `frontend/hqchart/index.html`
- [x] Move gateway service to `backend/gateway`
- [x] Keep python tool under `services/python`
- [x] Move all other existing projects to `services/legacy` (no code changes)
- [x] Update all internal paths, scripts, and docs
- [ ] Implement live providers (A股 + 港股, multi-source)
- [ ] Verify demo loads at `/hqchart` and API at `/api`

## Directory Layout (Final)

```
frontend/
  hqchart/            # static demo site with the full hqchart page

backend/
  gateway/            # Node API service, multi-provider live data

services/
  python/             # python indicator computation (standalone)
  legacy/             # all other existing projects, unchanged
```

## URL Rules

- Demo page: `http://127.0.0.1:8080/hqchart`
- API base: `http://127.0.0.1:18080/api`

## Data Source Strategy (Live + Multi-Provider)

- Use public free providers only, no self-hosted data.
- Default provider order: Sina -> Tencent -> additional free providers if needed.
- Gateway supports switching provider by config or URL parameter.
- On provider failure: fall back to next provider and return unified error payload.
- Short in-memory TTL cache is allowed; no local disk persistence of market data.

## Live Provider Coverage (A股 + 港股)

### Providers

- Sina: live quote (fallback for basic行情)
- Tencent: live quote / minute / kline
- Eastmoney: live capital / trade-detail / announcements (news暂用公告回填)

### Endpoints (Gateway -> Provider)

- `/api/stock` -> Tencent (primary), Sina (fallback)
- `/api/minute` -> Tencent (primary)
- `/api/kline` -> Tencent (primary)
- `/api/capital` -> Eastmoney (primary)
- `/api/trade-detail` -> Eastmoney (primary)
- `/api/news` -> Eastmoney announcements (temporary)
- `/api/announcements` -> Eastmoney (primary)

### Error and Fallback Rules

- 行情类（stock/minute/kline）：失败则抛错，由 provider registry 自动切换。
- 资讯类（capital/trade/announcements/news）：不可用时返回空列表或 0 值，保证接口稳定。

## Frontend Behavior

- `frontend/hqchart/index.html` is the full demo page.
- Default API base points to `http://127.0.0.1:18080/api`.
- Supports query overrides: `apiBase`, `provider`, `providerMode`.

## Non-Goals

- No integration of Python computation into gateway in this phase.
- No data storage or historical database build-out.
- No UI redesign beyond path updates.

## Risks / Notes

- Moving directories will break existing relative paths and scripts, must update all references.
- Some legacy projects may assume old paths; they will be moved intact under `services/legacy` to avoid refactors.

## Acceptance

- Running static server at repo root exposes `http://127.0.0.1:8080/hqchart` and loads the full demo page.
- Running gateway exposes `http://127.0.0.1:18080/api/*` and returns live data from public sources.
- Provider switching and failover function as expected.
- Python tool remains runnable from `services/python` without changes.
