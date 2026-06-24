# 自动签到模块框架

本目录包含一套 Surge/QX/Loon 风格的自动任务脚本框架。开发态代码在 `scripts/core/` 和 `scripts/adapters/`，可加载单文件在 `scripts/dist/`。

## 架构

- `scripts/core/env.js`：环境识别、通知、持久化。
- `scripts/core/http.js`：统一 GET/POST 与重试日志。
- `scripts/core/store.js`：按站点隔离的持久化 key。
- `scripts/core/parser.js`：HTML/JSON 文本提取工具。
- `scripts/core/safety.js`：随机延迟、每日计数限制。
- `scripts/core/runner.js`：抓包模式和 cron 模式调度。
- `scripts/adapters/*.js`：站点差异逻辑。
- `tools/build-modules.mjs`：生成 `scripts/dist/*.js`。
- `tools/check.mjs`：本地可运行性检查。

## 使用

1. 在 Surge 中安装对应 `modules/*.sgmodule`。
2. 启用 MITM hostname。
3. 登录目标网站并访问任意匹配页面触发抓包。
4. 等待 cron 或手动运行脚本。

## 站点状态

- PSNINE：通过 Cookie 访问首页，定位右下角蓝色“签”按钮（`onclick="qidao(this);"`），调用 `GET https://www.psnine.com/set/qidao/ajax` 完成“祈祷”签到。该接口在已签到时会返回 HTTP 404 且响应体为“今天已经签过了”，脚本已将其识别为“今日已祈祷”状态，不会误报失败或触发登出。
- Keylol：通过 Cookie 做每日访问，读取积分/体力/蒸汽信息；没有伪造发帖行为。
- Linux.do：当前只保留 Chrome/Profile A 的账号 A 用于测试。脚本做登录态检测、读取 `latest.json`、按时间窗口随机浏览不同主题；不发帖、不回复、不点赞。账号 A 绑定方式：在 Chrome/Profile A 访问 `https://linux.do/?autosign_account=A`。浏览窗口：工作日 09:00-10:00 浏览 10 个、13:00-15:00 浏览 15 个、17:00-18:00 浏览 10 个；周末 20:30-22:00 浏览 10 个。
- Bahamut：封装 NobyDa 脚本思路，支持登录、CSRF 签到、公会签到、动画疯答题。账号密码可写入持久化配置：
  - `AutoSign.gamer.config.uid`
  - `AutoSign.gamer.config.password`
  - `AutoSign.gamer.config.totp` 可选
  - `AutoSign.gamer.config.guild=false` 可关闭公会签到
  - `AutoSign.gamer.config.answer=false` 可关闭动画疯答题

## 开发

生成 dist：

```bash
node tools/build-modules.mjs
```

检查：

```bash
node tools/check.mjs
```

新增站点时，新增 `scripts/adapters/<site>.js`，调用 `AutoSignCore.registerSite(site)`，再把站点名加入 `tools/build-modules.mjs` 和 `tools/check.mjs`。
