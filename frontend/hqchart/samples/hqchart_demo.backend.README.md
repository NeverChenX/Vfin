# hqchart_demo Backend Mode

## 启动方式

1. 启动 gateway

```bash
cd hqchart-gateway
npm install
npm run dev
```

默认接口基址:

```text
http://127.0.0.1:18080/api/hqchart
```

2. 用本地静态服务器打开 demo 页面

```text
webhqchart.demo/samples/hqchart_demo.html
```

建议不要直接双击 `file://` 打开，使用任意静态服务器更稳定。

示例:

```bash
cd webhqchart.demo
python -m http.server 8080
```

然后访问:

```text
http://127.0.0.1:8080/samples/hqchart_demo.html
```

## 可选 Query 参数

- `apiBase`: 覆盖默认后端地址
- `provider`: 指定 gateway provider
- `providerMode`: 常用于联调 mock，例如 `mock`

示例:

```text
http://127.0.0.1:8080/samples/hqchart_demo.html?apiBase=http://127.0.0.1:18080/api/hqchart&providerMode=mock
```

## 页面行为

- 左侧报价列表改为读取 `GET /watchlist`
- 左侧工具栏提供显式输入框，输入 symbol 后点击 `+` 调用 `POST /watchlist`
- 点击左侧报价行会切换主图 symbol

## HTML 语法验证

可在仓库根目录执行下面命令，对页面内联 script 做可复现语法校验：

```bash
@'
const fs = require('fs');
const html = fs.readFileSync('webhqchart.demo/samples/hqchart_demo.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
new Function(scripts[scripts.length - 1]);
console.log('inline-script-ok');
'@ | node
```

期望结果：

```text
inline-script-ok
```

## 常见排查

1. 页面空白或控制台报接口错误

- 确认 gateway 已启动
- 打开 `http://127.0.0.1:18080/api/hqchart/health/live` 应返回 `{"ok":true}`

2. 左侧列表为空

- 这是正常情况，说明当前 watchlist 还没有数据
- 在左侧输入框输入 `600000`、`600000.sh`、`700` 或 `00700.hk`，再点击 `+`

3. 添加自选失败

- 检查 symbol 是否符合 gateway 归一化规则
- A 股支持 `600000` / `600000.sh` / `000001` / `000001.sz`
- 港股支持 `700` / `00700.hk`

4. 页面能打开但请求被浏览器拦截

- 当前 gateway 已返回 CORS 头
- 如果仍失败，确认实际请求地址确实指向 `127.0.0.1:18080`
- 检查是否被代理、浏览器插件或公司网络策略改写

5. 图表数据和本地 demo 数据不一致

- 本页默认以后端为准
- 只有接口失败时，部分图表请求才会回退到本地 demo testdata
