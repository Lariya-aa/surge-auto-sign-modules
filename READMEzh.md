# Surge 自动签到模块

英文默认文档见 [README.md](README.md)。

这是一个面向 Surge / Quantumult X / Loon 的多站点自动签到与每日活跃模块框架。代码采用“通用核心 + 站点适配器 + 可加载单文件”的结构：

- `scripts/core/`：运行时、HTTP、持久化、解析、风控与调度。
- `scripts/adapters/`：每个站点的差异逻辑。
- `scripts/dist/`：由构建脚本生成的单文件脚本，供 `.sgmodule` 直接加载。
- `modules/`：Surge 模块文件。
- `tools/`：构建与本地检查脚本。
- `tests/`：离线核心测试。

## 已包含模块

| 模块 | 文件 | 能力 |
|---|---|---|
| PSNINE | `modules/psnine.sgmodule` | Cookie 抓取、登录态检测、签到入口解析、签到请求与通知 |
| Keylol | `modules/keylol.sgmodule` | Cookie 抓取、每日访问、积分/体力/蒸汽解析 |
| Linux.do | `modules/linuxdo.sgmodule` | Chrome/Profile A Cookie 抓取、账号 A 登录态检测、分时随机浏览帖子 |
| Bahamut | `modules/gamer.sgmodule` | 登录、CSRF 获取、主页签到、公会签到、动画疯答题 |

Linux.do 模块明确不包含自动回复、发帖、批量灌水和点赞能力。

Linux.do 当前只保留账号 A 用于测试。Chrome/Profile A 固定登录 Linux.do 账号 A，并绑定固定槽位：

- 在 Chrome/Profile A 里访问 `https://linux.do/?autosign_account=A`

自动浏览策略：

- 周一至周五 09:00-10:00：随机浏览 10 个不同帖子。
- 周一至周五 13:00-15:00：随机浏览 15 个不同帖子。
- 周一至周五 17:00-18:00：随机浏览 10 个不同帖子。
- 周六和周日 20:30-22:00：随机浏览 10 个不同帖子。

Surge 会在每个窗口开始时触发脚本，脚本在窗口内随机延迟后浏览不同帖子。如果代理节点切换导致 Linux.do 自动登出或刷新 session，只需要在 Chrome/Profile A 里重新登录，再访问 `https://linux.do/?autosign_account=A` 刷新账号 A 槽位。

## 使用方式

1. 在 Surge 中安装需要的网站模块 URL。
2. 启用模块中声明的 MITM hostname。
3. 登录目标网站，并访问对应网站页面触发 Cookie 抓取。
4. 等待 cron 自动执行，或在 Surge 中手动运行脚本。

自托管 GitLab 模块 URL：

- PSNINE: `http://192.168.3.11:5580/yara/surge-auto-sign-modules/-/raw/main/modules/psnine.sgmodule`
- Keylol: `http://192.168.3.11:5580/yara/surge-auto-sign-modules/-/raw/main/modules/keylol.sgmodule`
- Linux.do: `http://192.168.3.11:5580/yara/surge-auto-sign-modules/-/raw/main/modules/linuxdo.sgmodule`
- Bahamut: `http://192.168.3.11:5580/yara/surge-auto-sign-modules/-/raw/main/modules/gamer.sgmodule`

本机 URL 服务只作为未上传前的可选开发方式。完整本机安装、测试和上传 GitLab 前检查见 [docs/LOCAL_SURGE_SETUP.md](docs/LOCAL_SURGE_SETUP.md)。

Bahamut 如果不用抓取 Cookie，而希望通过账号密码登录，可配置持久化 key：

- `AutoSign.gamer.config.uid`
- `AutoSign.gamer.config.password`
- `AutoSign.gamer.config.totp` 可选
- `AutoSign.gamer.config.guild=false` 可关闭公会签到
- `AutoSign.gamer.config.answer=false` 可关闭动画疯答题

## 开发与验证

修改 `scripts/core/` 或 `scripts/adapters/` 后重新生成 dist：

```bash
node tools/build-modules.mjs
```

运行本地检查：

```bash
node tools/check.mjs
```

检查内容包括：

- `modules/*.sgmodule` 是否存在。
- 模块中的 `script-path` 是否存在；本地路径会解析到 dist 文件，远程 raw URL 会跳过本地路径检查。
- `scripts/dist/*.js` 是否通过 `node --check`。
- Linux.do dist 是否包含发帖/回复/点赞相关接口。
- 核心 parser/safety 离线测试。

## 说明与限制

这些脚本无法在没有真实 Cookie、MITM、站点响应的情况下证明线上签到一定成功。当前本地验证证明的是：框架可构建、脚本可加载、无 Cookie 时能明确失败通知、Linux.do 不包含自动回复面。真实签到效果需要在 Surge 环境中完成抓包后验证。

站点页面结构和接口可能变化；如果脚本提示未找到 token、签到入口或登录态失效，需要更新对应 adapter。
