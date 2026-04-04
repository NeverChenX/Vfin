# HQChart K线全历史显示修复设计

日期: 2026-04-04
分支: master

## 1. 目标

用户目标是“正确显示数据”，并明确要求日线显示全部历史数据，而不是固定 200 根。

本设计目标:
- 日线/周线/月线/年线: 默认展示可获取到的全部历史数据。
- 1分钟线: 保持稳定可用，采用受控窗口加载，避免一次性全量分钟数据导致前端卡死。
- 避免“只显示一根K线”这类静默失败，出现异常时必须有可见错误提示。

## 2. 范围

包含:
- backend/gateway 的 provider -> mapper -> normalizer -> /api/kline 响应链路。
- frontend/hqchart/samples/hqchart_demo.html 的 K线请求与数据组装逻辑。

不包含:
- HQChart 内核库源码修改。
- 新增独立数据源或数据库历史回补任务。

## 3. 方案对比

### 方案 A（采用）: 协议统一 + 全历史拉取 + 前端分批渲染
- 后端统一 K线返回结构，支持 allHistory 模式。
- 日/周/月/年在 API 层通过分页或多次拉取汇总为全历史。
- 前端按批次注入图表，避免一次塞入超大数组造成卡顿。

优点: 根因修复，可扩展，能满足“全历史”诉求。
缺点: 改动面较大，需要补回归测试。

### 方案 B: 前端兜底补丁
- 仅在 demo 页面做容错和补齐。

优点: 快。
缺点: 无法保证全历史正确性，后端返回变化后仍会坏。

### 方案 C: 单股票特判
- 针对 601390.sh 定向修。

优点: 最快。
缺点: 不可维护，其他股票继续失败。

## 4. 最终设计

## 4.1 API 约定

统一 /api/kline 响应:
- 顶层: symbol, market, provider, timestamp, period, items
- items[]: date, open, high, low, close, volume, amount

请求参数新增/统一:
- symbol: 股票代码
- period: day/week/month/year/minute1/minute5/minute15/minute30
- allHistory: true/false
- count: 非 allHistory 时有效

规则:
- period 为 day/week/month/year 且 allHistory=true 时，后端返回当前源可获得的全历史。
- 分钟线默认 allHistory=false，按 count 窗口返回。

## 4.2 后端改造

1) services/hqchart-data-service.js
- 统一 period 归一化。
- allHistory=true 时触发聚合拉取逻辑，直到无更多数据。

2) providers/live-mappers.js
- 各 provider 的原始格式统一映射为标准 OHLCV。
- 修复导致仅 1 条有效记录的映射条件。

3) normalizers/hqchart-normalizer.js
- 统一日期格式。
- 丢弃非法 K线点并记录诊断日志。
- 当合法点不足阈值（例如 <=1）时返回结构化错误，不再伪成功。

4) providers/tencent-provider.js（及其他 live provider）
- 补齐分页/起止时间参数处理（如果源支持）。
- 对不支持全历史一次返回的数据源执行分段拉取。

## 4.3 前端改造

frontend/hqchart/samples/hqchart_demo.html:
- 日/周/月/年请求 /kline 时默认 allHistory=true。
- 分钟线继续使用 count（例如 200~1000）避免页面冻结。
- 接口返回 items<=1 或结构异常时，显示明确错误文案，不再只画一根。
- 图表数据加载改为分批推送，减少主线程阻塞。

## 5. 错误处理

- 后端:
  - provider 请求失败: 返回明确错误码与 message。
  - 数据格式异常: 返回 DATA_NORMALIZE_ERROR。
  - allHistory 拉取中断: 返回 partial=true + 已拉取区间信息。

- 前端:
  - 显示“数据不足/拉取失败/部分数据”状态。
  - 保留上一次成功图形，不因单次失败清空为一根。

## 6. 测试策略

自动化:
- 新增/补充 mapper 与 normalizer 单测:
  - day/week/month/year 正常多条
  - 异常数据过滤后仍 >1 条
  - allHistory 聚合边界
- API 集成测试:
  - /api/kline?symbol=601390.sh&period=day&allHistory=true
  - 覆盖 A股/港股 各 1 支

手工回归:
- 页面: frontend/hqchart/samples/hqchart_demo.html
- 验证项:
  - 中国中铁日线显示全历史（明显大于 200）
  - 周/月/年可切换且非单条
  - 1分钟切换正常且页面不卡死

## 7. 验收标准

必须同时满足:
1. 601390.sh 日线为全历史，不再出现仅 1 根。
2. A股随机 2 支、港股随机 1 支，日/周/月/年均可正常显示。
3. 1分钟可用，交互无明显卡死。
4. 出错时有可见错误提示，不出现静默错误图。

## 8. 风险与回滚

风险:
- 全历史数据量大，前端渲染耗时上升。
- 不同 provider 的历史深度不一致。

缓解:
- 分批渲染。
- 支持 partial 标记与用户提示。

回滚:
- 通过配置关闭 allHistory 默认开关，退回 count 模式。
