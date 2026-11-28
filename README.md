# AGY 控制台 (`agy-monitor`)

> 为 **Antigravity** 打造的零侵入侧边栏控制台插件：集 **实时遥测与配额分析（通用）**、**多 Agent 协作网与类 Codex 历程追踪（掌握）**、**撞色主题与整机壁纸/输入框圆环 HUD（美化）**、**多账号 DPAPI 安全管理与自动切号（账号）** 与 **可插拔 AI 桌宠工作室（桌宠）** 于一体。
>
> **零外部 npm 依赖** · **支持纯零侵入贴背模式与可一键还原的原生持久注入模式** · **开箱即用，改动自动保存**

---

## 核心功能

### 1. 通用（Telemetry & Sessions）
- **实时上下文饼图**：拆解系统底座、规则附加、对话历史与工具输出占比，支持 `256k / 512k / 1M` 窗口上限切换。
- **Token 消耗与原生 5h / 周配额看板**：按今日/7天/30天统计当前会话与全局各模型消耗与单次请求记录；免配置、免 CDP 静默直连官方本地语言服务，在模型用量正下方以双联圆环卡片实时展示 **Gemini / GPT&Claude** 的 5 小时与每周剩余配额百分比及精确重置倒计时。
- **实时生成速率与真实模型对照**：展示实时/平均 `tok/s`、Prompt Cache 缓存命中率，以及上游真实返回模型与前端选定模型的一致性核验。
- **会话管理与 Prompt 规则**：支持跟随最新会话/锁定会话、活动/未读/收藏会话一键切换，内置多套 Prompt 规则与自定义 Markdown 规则（带安全校验）。

<img width="1920" height="1080" alt="cfe47dc0153eabfd1e7e2512c6199019" src="https://github.com/user-attachments/assets/f45a5312-cacb-4816-a047-f77c683f0cf0" />

### 2. 掌握（Multi-Agent Mastery）
- **会话进程总览**：按活动运行中、任务结束未读（翠绿）、任务结束已读（沉静灰）清晰分层，右侧进度环实时同步主 Agent 进度。
- **主次协作关系网**：自动读取本地 `subagents` / `swarm` / `messages` 数据，可视化呈现左主右次协作拓扑、主次往来箭头与次级协作连线。
- **类 Codex 内容历程**：点击任意主/次 Agent 即可进入多轮完整历程（运行中补充消息不清空历史），自动分类折叠操作组（运行了命令 / 编辑了文件 `+add -del` / 读取了文件 / 检索了资料 / 协同了子 Agent），支持安全 Markdown 渲染与文件芯片悬停预览。
- **双模式定时总结（默认关闭 · 按需开启）**：
  - **自身模型模式（每分钟 · 思维低）**：开启后通过官方 `PreInvocation` Hook 仅在尾部轻量化追加提示，几乎不破坏原会话 KV 缓存命中率；自动输出约 30 字开场思考与 10 字以内通俗进度总结；关闭后立即生效。
  - **第三方模型模式**：支持 OpenAI / Anthropic 双协议自定义接口、本机保存 API Key、实时拉取 `/models` 与连通测速。

<img width="1920" height="1080" alt="91061725f97fd1d4087d2f940c8c2fba" src="https://github.com/user-attachments/assets/2294b5e6-d128-41d6-96fe-4483f32cc8af" />
<img width="1920" height="1080" alt="77423415c71d65d4cfba6332449db742" src="https://github.com/user-attachments/assets/38066d89-9ad9-4fb1-9163-c2bfa0466fb5" />
<img width="836" height="420" alt="7a51323271d83629f0c8e4796d1ca484" src="https://github.com/user-attachments/assets/dbf75067-ef77-415d-99ad-52062f2e4b8d" />


### 3. 美化（Theme & Backdrop Studio）
- **撞色主题引擎**：内置「极昼原版」等 5 套精选方案，支持 6 项核心色自定义、方案保存、随宿主明暗自动反色。
- **图片壁纸 & Windows 整机壁纸**：内置 5 张高清壁纸（默认启用「星海夜行电车」），支持自定义上传图片、透明度/模糊度/暗度遮罩/圆角调节；提供 **方案三：持久纯 CSS 注入（默认，免快捷方式且文字/图片 100% 锐利，全窗口与 AGY 控制台透明无缝共享同一张连续壁纸，可随时一键还原原版）**、**方案一：贴背微透（零侵入）**、**方案二：CDP 纯 CSS**，以及 **原生 Shadow DOM 输入框底栏状态条**（零 UIA、零漂移、支持上下文圆环、速率/缓存/模型与双圆环 5h/周剩余额度同频帘幕展开）。

<img width="1920" height="1080" alt="ff9e0805cd6335cbb0a53afd3a58fc51" src="https://github.com/user-attachments/assets/d69f30ed-d0e4-417b-889b-2e02ed64dec6" />

### 4. 账号（Multi-Account Hub）
- **DPAPI 硬件级加密多账号保险库**：所有凭据均由 Windows 原生 DPAPI（CurrentUser）加密封装，磁盘零明文 Token、CLI 零敏感参数暴露。
- **多种安全入库方式**：支持 **一键捕获当前已登录账号**、**浏览器官方 OAuth 一键直连授权新号**（PKCE S256 + 本地回环回调 + 系统代理隧道，不干扰当前运行中的 Antigravity），以及 **Token / JSON 批量导入导出**。
- **官方合规实时额度同步、自动续签 & 总余量看板**：遵循官方合规策略，生产路径彻底禁绝直连 `cloudcode-pa.googleapis.com` 探测未激活账号，仅通过官方 CLI `statusLine` 被动回调或宿主本机回环 `language_server` 同步当前登录账号的 5 小时 / 周配额与重置倒计时，并在切号前自动续签 OAuth 凭证；支持在「其他」页一键关闭全部额度查看与查询；顶部展示 Gemini / GPT&Claude 额度总余量聚合卡片，宽屏自动适配 1/2/3 列卡片网格，并提供悬停下拉 + 点击轮切的多维度排序。
- **无感一键切号与耗尽自动切号**：支持一键离线安全切号（自动备份与失败回滚）、自定义配额自动刷新间隔，以及开启指定模型组的 5h 耗尽 / 周额度归零 / `QUOTA_EXHAUSTED` 报错自动切号（优先选取最高可用额度且自动过滤 0 额度号，切号后仅自动续接真正运行中的会话）。

### 5. 桌宠（Desktop Pet Studio · 可插拔扩展）
- **完全低耦合插件化设计**：全部桌宠前后端、独立配置存储、Windows 透明悬浮进程、帧动画工作室与 MCP 工具集中收拢于 [sidecars/agy_monitor/extensions/desktop_pet/](sidecars/agy_monitor/extensions/desktop_pet/README.md)；删除该目录或设置 `AGY_DISABLE_EXTENSIONS=1` 即可完全移除，不影响主分支核心逻辑。
- **6 轨道自定义帧动画 & 物理动效**：内置 3 款主题色矢量萌宠，支持单图/GIF 及 `1~30 FPS` 六轨道序列帧（`idle` 待机 / `running` 思考 / `unread` 完成 / `interact` 互动 / `walk` 自主漫步 / `drag` 拖拽），自带横向精灵图切帧、拖拽钟摆悬垂与落地回弹、自主桌面漫步与左右镜像、互动粒子，以及支持自定义文案模板/预设（`{in}/{out}/{tps}/{pct}/{model}/{cache}/{unread}/{quota5h}/{quota7d}` 与多行「会话进展」列表）的 **60fps 硬件加速弹出气泡**。
- **主题联动右键二级菜单 & 500% 缩放 & 游戏防误触穿透**：独立自定义 WPF 主题右键菜单（自动适配深浅色与强调色），顶部以二级菜单「🐾 切换桌宠 ›」收纳造型选择，支持 `60%~500%` 实时大小调节、带流畅过渡且不关闭菜单的胶囊开关、以及「可选中 / 不可选中（穿透）」双状态（锁定穿透时悬停头顶浮现不抢焦点 🔒 锁图标一键解锁）。
- **Antigravity MCP API & Gemini 自动生图做动画**：内置 [`agy-monitor_desktop_pet_mcp`](mcp_config.json)（6 个 MCP 工具 + 零依赖精灵表切帧与绿幕/纯色抠图引擎）及 [`desktop-pet-animator`](skills/desktop-pet-animator/SKILL.md) 技能，可直接让 Gemini 调用生图制作多轨道桌宠动画并在控制台舞台与离线交互 HTML 中实时预览。详细接口与使用说明见 [桌宠扩展文档](sidecars/agy_monitor/extensions/desktop_pet/README.md)。

---

## 版本更新日志（Changelog）

### `v1.2.4`（2026-11-28）— 修复 `/compact` 上下文压缩误触发掌握汇报钩子（PR #9）

- **跳过 `/compact` 压缩请求的进度注入（合入 PR #9 `@Elosiad`）**：
  - `mastery_summary_hook.mjs` 识别 `/compact`（兼容大小写、前后空白与附加压缩指令）并直接返回 `{}`，不再污染压缩摘要，也不覆盖当前会话的 `hook_state`；普通消息提及 `/compact` 仍正常触发开场汇报。

---

### `v1.2.3`（2026-11-28）— 修复 Antigravity 升级后美化失效死锁（新增独立退出原子落盘进程）

- **彻底修复 Antigravity 升级后美化/HUD 无法自动重注**：
  - 修复 Windows 上 Antigravity 自动更新覆盖 `app.asar` 后，运行态文件锁（`EBUSY/EPERM`）阻止补丁写回的死锁问题。
  - 新增零依赖后台退出落盘进程 `asar_apply_worker.mjs`：全程杜绝就地覆写运行中的 `app.asar`；检测到锁定占用时自动暂存已校验补丁并在关闭 Antigravity 的瞬间完成原子替换（含 SHA-256 与目标指纹防覆盖守卫），下次启动自动清理残留临时文件。
  - 美化页徽章与操作提示同步联动延迟落盘状态，排队就绪后明确显示「已持久化 · 重启生效」。

---

### `v1.2.2`（2026-11-27）— 主窗口深度中文汉化 v2、「增强」加速分页、「免 TUN 代理」、多账号跨平台加固 & `app.asar` 安全防护

- **主窗口深度中文汉化 v2**：
  - 新增词典驱动的 `host_i18n` 汉化引擎，全面覆盖 Antigravity 主窗口菜单、设置页、左侧栏与常用交互文案；支持原生钩子与 CDP 实时热同步，切回英文时完整恢复原文本。
- **新增「增强」加速分页（默认全关 · 按需勾选）**：
  - 集成零外部依赖的 `boost_mcp` 加速工具集，按三项独立开关拆分：**合并批处理（并发搜索/原子编辑/并发校验）**、**大文件先看目录再精读**、**长日志首尾压缩折叠**，顶部支持一键全开/全关，每项附带悬停预览窗与点击全屏简介弹窗。
- **「其他」分页新增「免 TUN 代理」（默认开启）**：
  - 自动探测系统代理或自定义 HTTP/HTTPS/SOCKS5 代理地址（含账号密码与绕过域名），同时作用于 Electron 主窗口与底层 `language_server`，支持强制 HTTP/1.1 开关与一键连通测速。
- **多账号跨平台安全升级**：
  - 新增 POSIX 原生钥匙串驱动（macOS Keychain / Linux Secret Service）、静态纯 Node 切号守护 `switch_worker.mjs`、切号引导状态同步及防串号校验自愈机制。
- **`app.asar` 写入安全、侧栏加固与卸载自休眠**：
  - 移除运行期危险的 `.agy_stale` 强行改名热替换，改为探锁后原子替换，且检测到钩子运行中时延迟覆盖旧版 `app.asar` 直至客户端关闭。
  - 主进程钩子内置 `isPluginInstalled()` 自休眠守卫（卸载后自动撤回注入并休眠），`uninstall.mjs` 同步还原原版 `app.asar` 并清理运行时注入缓存；移除侧栏吸顶容器 `overflow: clip`、收紧侧栏图层扫描边界并补齐普通毛玻璃浅色主题变量，修复 `mcp_bridge.mjs` 未定义 `ERR_PARSE` 缺陷。

---

### `v1.2.1`（2026-11-27）— macOS 原生透明桌宠伴侣（PR #8）、全界面 UI 精简整顿 & 账号层级识别与加权总余量

- **macOS 原生桌面桌宠伴侣（合入 PR #8 `@WhiteNorth` + 安全节能加固）**：
  - 新增零依赖 Swift / AppKit 原生透明桌宠 `AgyDesktopPetMac.swift`，与 Windows C# 版对齐全部核心体验（3 款矢量萌宠主题联动、单图/GIF/6 轨帧动画、钟摆物理拖拽、2D 漫游、气泡模板与进度列表 DSL、右键菜单与穿透解锁）。
  - 合入时同步加固：停止进程前先探查单实例 `flock` 并用 `proc_pidpath` 校验可执行文件名杜绝 PID 复用误杀；移除 `NSScreen.screens.first!` 强解包防合盖休眠/切屏闪退；`detectMacHostEnv` 先通过 `xcode-select -p` 判断 CLT 安装状态避免未装环境误触发系统安装弹窗；补齐 GIF 90 帧封顶、ImageIO 缩略图降采样、多轨道按需 LRU 懒加载及自适应节能帧率（配合 `timer.tolerance` 降低 Mac 续航开销）。
- **全界面 UI 精简整顿**：
  - 全面精简「其他 / 账号 / 美化 / 桌宠 / 内存管理」等界面的长篇技术说明，仅保留直观明了的产品文案；大幅收紧「其他」分页设置项尺寸，一屏容纳全部核心开关。
- **多账号订阅层级识别 & 加权总余量**：
  - 支持通过本机官方 `GetUserStatus` 与 CLI `statusLine` 自动识别并持久化账号层级（`Free` / `Free Pro` / `Paid Pro` / `Plus` / `Ultra 5x` / `Ultra 20x`），卡片标签可随时点击微调（人工修改自动锁定不被覆盖，导入导出完整保留）。
  - 账号页顶部总余量看板按真实权益加权汇总：`Ultra 20x` 计 `2000%`、`Ultra 5x` 计 `500%`、`Plus / Pro / Free` 计 `100%`。

---

### `v1.2.0`（2026-11-27）— 全链路 RAM / VRAM 深度性能优化（Issue #7）& 新增可选「轻量省显存模式」

- **Node 后台常驻内存与峰值抖动根治**：
  - 15 秒 Watchdog 对 `app.asar` 的检验改为 `(mtimeMs, size)` 缓存 + 文件句柄头部切片读取，彻底告别每 15 秒整包读取 80–160 MB；`stageLiveHudAssets` 增加内容指纹跳过无变化写盘。
  - `discoverLocalOAuthClient()` 改为 4 MB 滑动窗口分块流式扫描，消除 300–520 MB 内存峰值；`resolveSessionProgress` 改为按单会话 `convId` 独立 LRU 缓存并优先只读 128 KB 尾部窗口。
  - `scan_worker` 迁入 `worker_threads` 省下独立 Electron-as-Node 进程基线，SQLite `gen_metadata` 回退查询改 `.iterate()` 流式遍历；内存瘦身回调同步释放壁纸/引导图/错误缓存并清理 `sessions_meta` 过期键。
- **HUD 注入与 CDP 通信降载**：
  - CDP 900ms 轮询在页面已挂载 HUD 时仅发送轻量增量 JSON（`< 2 KB`），不再重复推送整段渲染脚本与引导图 base64。
  - 注入图层引擎 `scanLayers()` 在 `document.hidden` 时暂停并放宽至 350ms 节流；吸顶壁纸 CSS 抽成 `:root` 的 `--agy-wp-url` 变量去重（默认观感零变化）。
- **WPF 壁纸与桌宠伴侣显存/CPU 优化**：
  - `AgyDesktopPet.cs` 与 `AgyBackdrop.cs` 解码前均先探测原图尺寸并禁止放大解码（256×256 序列帧与小壁纸不再被放大占 4 倍内存，GIF 同步封顶）。
  - 桌宠改为多轨道按需懒加载（LRU 保留活跃轨 + `idle`）、空闲/全屏遮挡自动降频暂停、冻结画刷并降级 `BitmapCache`。
  - 壁纸伴侣在隐藏/暂停/切换至 CSS 或 CDP 模式时释放位图与窗口、用离线三遍盒式预模糊替代实时全屏 `BlurEffect`，并补齐原生 Windows 下的 `--parent-pid` 孤儿自动退出守卫。
- **侧栏前端优化 & 可选「轻量省显存模式」**：
  - 共享宿主壁纸模式下将侧栏壁纸层设为 `display: none` 并清空 `backgroundImage`，彻底消除重复 GPU 纹理；自定义壁纸上传自动限长边 `2560px` 并转码 WebP（动图与异常自动兜底）。
  - 静默 SVG 动画停跑、`mastery_hub.js` 增加轮询签名防重绘与图片/草稿缓存封顶去重。
  - 在「其他」分页新增可选 **「轻量省显存模式」** 开关（默认关闭，保持原有默认视觉不变；开启后通过 `/api/preferences/lite-mode` 即时关闭侧栏与宿主端 `backdrop-filter` 毛玻璃、吸顶壁纸遮罩与非必要动画，深浅主题均已高对比适配）。

---

### `v1.1.9`（2026-11-27）— 精选「Gemini 猫娘」按需下载桌宠（预览图占位 · 点击下载 6 轨 144 帧动画包）

- **轻量预览图占位 + 点击按需下载架构**：
  - 桌宠造型库新增 **「Gemini 猫娘」** 精选预览占位卡，仓库与主安装包仅包含约 69 KB 的高清透明预览图，不增加主插件体积。
  - 点击占位卡即可按需从官方 GitHub Release 下载完整 `gemini-neko-pet-pack-v1.zip`（6 轨 × 24 帧，共 144 帧 · 18 FPS），自动适配系统 HTTP/SOCKS5 代理，内置官方域名白名单、纯 Node.js 防 ZIP 炸弹解压与 **SHA-256 哈希校验**，校验通过后自动安装并启用；支持随时删除以释放空间并恢复为预览占位卡。

---

### `v1.1.8`（2026-11-26）— 官方合规额度通道（CLI `statusLine` 零请求桥接 + 禁绝 `cloudcode-pa` 直连）& 新增「其他」分页额度总开关与全界面自动补位

- **官方合规额度通道升级（彻底禁绝 `cloudcode-pa.googleapis.com` 直连）**：
  - 优先被动读取 Antigravity CLI 官方 `statusLine` 回调推送到本地的 `official_statusline_quota.json`（零额外 RPC 请求），桌面端未配置 CLI 时仅走宿主本机回环 `language_server` 同步当前登录账号，放宽轮询与活动防抖间隔。
  - 生产路径彻底禁绝直接请求 Google `cloudcode-pa.googleapis.com` 探测未激活账号，防止账号触发风控标记。
- **新增「其他」分页与「额度查看与查询」总开关（默认开启）**：
  - 顶部导航新增「其他」分页，提供额度查看与查询全局总开关（默认开启，持久化保存）、当前官方数据通道/合规状态看板，以及 **一键配置 CLI `statusLine` 桥接** 与 `/statusline` 命令复制。
  - 关闭总开关后立即全链路停止全部前后台额度查询：后端 `/api/quota`、`hudPublisher`、账号生命周期轮询及前端定时器、焦点/手动刷新、桌宠配额同步全部短路停用。
- **关闭开关后的全界面无缝补位适配**：
  - **通用页**：隐藏底部双配额条，右侧「模型 Token 用量」列表向下拉满，与左侧上下文饼图齐平，空态自动垂直居中。
  - **原生输入框 HUD（`v2.2.8`）**：自动收起输入栏配额胶囊与设置项，多余宽度全量让给生成速率、缓存命中与模型名。
  - **账号页**：自动隐藏顶部额度汇总卡、单卡配额条、同步时间、刷新额度按钮及按额度排序选项，剩余 5 个操作按钮等宽铺满整行；设置弹窗清晰提示当前已暂停额度刷新。

---

### `v1.1.7`（2026-11-26）— 多账号分组管理、消除闲置 AT 过期误报 & 根治异常提示闪烁与轮询降频

- **多账号分组功能（默认 `default` + 预置可删分组）**：
  - 所有历史账号与新增账号默认归入 `default`（兜底不可删），并预置 `pro`、`ultra 5x`、`ultra 20x` 三个常用分组（均支持自由删除，删后原组成员自动归回 `default` 且不自动复活），支持 `+ 新建分组` 创建自定义分组。
  - 新增顶部分组筛选栏、账号卡片内一键切组下拉框，以及 OAuth 捕获 / 批量导入时的目标分组选择；顶部「额度总余量」卡片、状态筛选与批量操作均与当前选中分组实时联动，导入/导出 JSON 完整保留分组字段。
- **消除闲置账号 `AT 过期` 误报**：
  - 拥有有效 Refresh Token（`RT`）的闲置账号在 1 小时 Access Token 自然到期后不再误报黄色 `AT 过期` 警告（切号或刷新额度时会自动静默续签），仅在确实缺少 `RT` 或实测接口返回 HTTP 401 时才提示异常。
- **彻底解决异常账号提示条闪烁并加固零轮询防风控**：
  - 移除 `.acc-item-alert` 反复重播的入场动画，为账号列表与汇总卡片增加状态签名比对（数据未变更时不重建 DOM），修复 `syncPolling()` 退出快速模式未降频问题并将常态本地同步放宽至 30 秒。
  - 后端 `runLifecycleTick` 追加 `hasRefreshToken === false` 与 `blocking` 双重守卫，确保 `RT 过期`、封禁、需验证及已禁用账号永不被后台轮询探测。

---

### `v1.1.6`（2026-11-26）— 异常账号全链路处理与低风控一键刷新 AT（PR #5）、修复无壁纸模式侧栏项目消失（PR #6）& 全站吸顶栏无缝壁纸遮罩

- **多账号异常识别、验证引导与低风控一键续签 AT（PR #5 `@GreenNa717`）**：
  - 精细化识别并展示 `需验证 / 已封禁 / RT 过期 / AT 过期 / 缺少 RT / 无订阅 / 客户端异常 / 网络异常` 状态徽章与异常条，优先识别封禁态（防止带申诉链接的封禁号误判为需验证），过滤非验证文档链接，主号恢复正常时自动清旧异常字段。
  - 新增 `POST /api/accounts/renew-at` 纯 OAuth 续签与 **「一键刷新 AT」**（1s 顺序节流、零 CloudCode / `loadCodeAssist` 探测），新增状态筛选栏（全部 / 正常 / 异常）、1.2s 节流 **「一键检测全部」**、**「禁用异常账号」**、以及通过 `AccountChooser` 预填邮箱的 **「去验证」 / 「复制验证链接」**。
  - 强化防风控保护：`cachedProjectId` 命中跳过重复资格检查，封禁/验证/无订阅立即短路，后台任务、自动切号与手动切号严格阻断异常阻断态账号，并在主客户端 `invalid_grant` 后停止跨客户端试探。
- **修复未开壁纸时 Antigravity 2.35.2 侧栏 Projects 列表消失（PR #6 `@Elosiad`）**：
  - 将 [hud_injector.mjs](sidecars/agy_monitor/backend/hud_injector.mjs) 主进程钩子中的壁纸清理表达式包裹在 IIFE 中并使用块级 `const el`，彻底杜绝顶层 `var el` 覆写宿主 Redux 全局函数 `window.el` 导致侧栏项目同步崩溃的问题，并新增 `vm` 沙箱回归测试。
- **全站吸顶栏无缝同源壁纸遮罩（`v2.2.7`）**：
  - 为左侧 `Projects` 吸顶栏以及 `Customizations / Automations / Settings / Diff` 等全站主区吸顶栏（`.sticky.bg-background` / `.sticky.bg-shell` / `div.sticky.bg-secondary` 及图层引擎 v5 自动识别的 `sticky-main` / `sticky-sidebar`）加入 `background-attachment: fixed` 像素级同视口壁纸遮罩，彻底消除滚动内容穿透重叠文字且肉眼零边缝。

---

### `v1.1.5`（2026-11-25）— 修复 Electron 宿主环境下持久注入 `app.asar` 报 `ENOENT` 异常

- **修复持久化注入 / 方案三壁纸在 Windows 桌面端报 `ENOENT, not found in ...\resources\app.asar`**：
  - [hud_injector.mjs](sidecars/agy_monitor/backend/hud_injector.mjs) 在 Electron 运行时（`ELECTRON_RUN_AS_NODE=1`）下自动改用内置 `original-fs` 读写与原子替换磁盘 `app.asar`，彻底绕过 Electron ASAR 虚拟文件系统拦截，修复另一台设备更新后状态栏停在「待自动补注」且无法写入的问题。

---

### `v1.1.4`（2026-11-25）— 持久纯 CSS 整机壁纸与毛玻璃化（方案三默认）、原生 Shadow DOM 底栏与双圆环额度帘幕动画 & Cockpit 同款保守切号

- **方案三：持久纯 CSS 整机壁纸注入（默认选项，免快捷方式且文字 100% 锐利）**：
  - 新增 `app.asar` 轻量主进程钩子与看门狗自动补注（支持随时一键安全还原原版备份），并支持实时修改壁纸/透明度/模糊度/遮罩免重启热同步。
  - 全面接管宿主暗黑主题 Token（`--background` / `--card` / `--shell-canvas` / `--sidebar` / `--onyx-selected` 等），统一将左侧项目行、顶部角落栏、输入框、用户气泡、排队消息框（`Queued Messages`）及各类 `.bg-card` 卡片与弹窗升级为同系毛玻璃材质，清除输入框上方黑影，并打通 AGY 控制台 `iframe` 透明穿透，与主聊天区无缝共享同一张连续整机壁纸。
- **原生 Shadow DOM 输入框底栏与「账号剩余额度」双圆环**：
  - 底部上下文状态栏默认升级为原生 Shadow DOM 挂载（零 UIA 扫描、零定位漂移、点击弹窗经顶层 Portal 挂载不再被输入框毛玻璃裁切），胶囊底色自动随输入框背景色半透同步。
  - 底部状态栏菜单新增 **「账号剩余额度」** 可选项，开启后并排显示 **5h（左）+ 周（右）双圆环**；鼠标移入采用与中间指标胶囊同频耦合的 `0.48s` S 型缓动帘幕动画（右侧双圆环展开多少、中间胶囊同步丝滑收进多少，整栏总宽与左侧模型选择器全程几乎纹丝不动），同时彻底消除窄栏悬停抽搐与重复挂载问题。
- **Cockpit 同款保守切号与风控加固**：
  - 多账号切号流程与 OAuth 刷新全面对齐 Cockpit Tools：默认关闭非当前号后台静默轮询与定时续签（降低异常高频刷新风险），切号前按单飞锁与精确凭据格式写入并在 `invalid_grant` 时精准重试/中止，同步加固 `AgyAccountTool.cs`。
- **界面精简**：移除「通用」页中冗余的「发起模型偏好」与「+ 发起新对话」栏及对应接口，界面更紧凑清爽。

---

### `v1.1.3`（2026-11-24）— 全量 AGY 内存管理与零 UIA 省内存模式、桌宠独立 `{quota5h}` / `{quota7d}` 变量与多行「会话进展」气泡

- **全量 AGY 内存监控、智能诊断与安全瘦身引擎**：
  - 顶栏新增三态颜色实时 `RAM` 胶囊，点击打开「AGY 内存管理」弹窗，通过原生 Win32 PSAPI / Toolhelp 高速扫描（约 250ms、零 PowerShell 开销）精准拆解 **Antigravity 主进程 / 渲染与 GPU / `language_server` / 本插件伴侣 / 其他扩展** 五大分类的专用物理内存与提交内存，并支持展开 Top 8 高占用进程明细。
  - 内置智能根因诊断（检测主进程 `uiautomationcore.dll` 无障碍树驻留、伴侣内存膨胀、单会话超大 DB、多渲染子进程堆积与整机高压），支持 **一键安全释放全量内存**（不关窗、不中断会话）、**一键重启伴侣进程** 及 **超阈值自动后台瘦身**（默认 `1.8G`、10 分钟冷却，可自由调整阈值与开关）。
- **根治插件自身内存膨胀并提供可选零 UIA 模式**：
  - 壁纸伴侣 [AgyBackdrop.cs](sidecars/agy_monitor/backdrop/AgyBackdrop.cs) 与桌宠伴侣 [AgyDesktopPet.cs](sidecars/agy_monitor/extensions/desktop_pet/AgyDesktopPet.cs) 新增定时 Gen-2 GC + 工作集压缩与跨进程即时瘦身事件，同时可在内存管理弹窗按需开启「极致零 UIA 省内存模式」（搭配方案二 CDP 可兼得零 UIA 与像素级原生输入框圆环）。
  - [scan_worker.mjs](sidecars/agy_monitor/backend/scan_worker.mjs) 与 [telemetry.mjs](sidecars/agy_monitor/backend/telemetry.mjs) 限制 SQLite 页缓存上限（`cache_size = -2000/-1000`）并周期性执行 `PRAGMA shrink_memory`。
- **彻底修复底部上下文圆环（HUD）高频乱串**：
  - [AgyBackdrop.cs](sidecars/agy_monitor/backdrop/AgyBackdrop.cs) 新增 `IsInsideAgyConsoleDocument` 直接隔离右侧控制台 Document、收紧底部搜索带（`280px → 108px`）并移除会误吸掌握/账号/桌宠面板按钮的宽泛关键词，无论开关控制台、切换会话或打开原生 `Review` 面板均精准紧贴输入框 `Turbo` 左侧。
- **桌宠气泡模板升级（拆分 5h/周纯数值变量 + 多行「会话进展」预设）**：
  - 将 `{quota}` 拆分为纯数值变量 `{quota5h}`（5 小时剩余额度）与 `{quota7d}`（周剩余额度），快捷预设「模型 + 额度」精简为 **「额度」**（`5h {quota5h}% · 周 {quota7d}%`）。
  - 新增 **「会话进展」** 预设与多行列表语法 `[{schedule:<id>},{content:<id>}](active,unread)`，自动导入当前所有活动/未读会话并按项换行、列表间空行排版，WPF 桌面气泡随内容行数自动向上平滑扩展。

---

### `v1.1.2`（2026-11-24）— 可插拔 AI 桌宠工作室（PR #3）、桌宠气泡实时额度 `{quota}` & 安全/DPI/生命周期加固

- **可插拔桌宠工作室扩展（来自 PR #3 `@GreenNa717` + 安全加固）**：
  - 新增低耦合扩展加载器 [loader.mjs](sidecars/agy_monitor/extensions/loader.mjs) 与 MCP 扩展桥 [mcp_bridge.mjs](sidecars/agy_monitor/extensions/mcp_bridge.mjs)，支持通过 `AGY_DISABLE_EXTENSIONS=1` 或移除扩展目录实现零侵入插拔（默认关闭、零常驻进程）。
  - 新增独立「桌宠」分页、顶栏快捷开关、6 轨道帧动画工作室与 Windows 透明桌宠伴侣 `agy_desktop_pet.exe`（支持父进程 + Antigravity 宿主防孤儿守卫、休眠/锁屏自动暂停与恢复、Per-Monitor DPI 多屏坐标换算、60fps 硬件加速气泡、主题联动右键菜单、`60%~500%` 缩放与游戏防误触穿透/解锁）。
  - 通过 [mcp_config.json](mcp_config.json) 暴露 6 大 MCP 工具与纯 Node.js 精灵表自动切帧抠图引擎（含路径沙箱、符号链接校验与防 PNG 解压炸弹加固），搭配内置 [desktop-pet-animator](skills/desktop-pet-animator/SKILL.md) 技能支持全自动 AI 生图、抠图、导入与双通道实时预览。
- **桌宠弹出气泡新增实时额度变量 `{quota}` 与「模型 + 额度」预设**：
  - 点击插入变量栏新增 `{quota}`，预设栏新增「模型 + 额度」（`{model} · {quota}`）；自动识别当前模型所属配额池（Gemini / GPT&Claude）展示 `5h XX%/周 YY%`，待机未知模型时展示总览 `G XX% · C YY%`。
  - 后端实时额度同步写入 `hud_telemetry.json` 与 `/api/snapshot`，面板预览与 Windows 桌面悬浮宠双端即时刷新。
- **打包 / 更新 / 卸载与前端布局兼容加固**：
  - [pack_release.mjs](scripts/pack_release.mjs) 与 [updater.mjs](sidecars/agy_monitor/backend/updater.mjs) 纳入 `mcp_config.json` 与 `skills/`（回退旧版自动清理）；[uninstall.mjs](scripts/uninstall.mjs) / [uninstall.cmd](uninstall.cmd) 补齐退出桌宠伴侣进程。
  - 修复窄屏挤出公告按钮、桌宠浮窗遮挡更新公告弹窗、重复动画定义导致预览气泡抖动及隐藏标签页时帧动画定时器空跑问题。

---

### `v1.1.1`（2026-11-24）— 顶栏更新公告与单版本更新/回退、OAuth 自动续签防 401、移除 Argon 双列适配 & 对话回退秒刷

- **顶部导航栏「更新公告」按钮与全版本更新/回退弹窗**：
  - 顶栏右侧新增更新公告入口图标，点击弹窗即可浏览自 `v1.0.0` 起的全部版本更新历史，并自动同步 GitHub 最新 Release。
  - 每个版本条目右侧均带有交互按钮：高于本地版本显示 **`更新`**，等于本地版本显示 **`当前版本`**，低于本地版本显示 **`回退`**，一键拉取官方对应 Tag 归档完成升级或安全回退（严格保留个人配置与 `rules/AGENTS.md`，并自动走系统代理）。
- **彻底修复 Electron 环境 OAuth 刷新 401 与全链路自动续签凭证**：
  - 修复 Electron 宿主环境下 `fs.statSync` 误将 `app.asar` 识别为虚拟目录而跳过、导致个人号错用企业版 OAuth Client 触发 `HTTP 401` 的根因；支持发现全部本地客户端并按 `id_token` `aud` 自动精准匹配与兜底切换。
  - 全面对齐 Cockpit Tools 自动续签体验：刷新额度距过期不足 5 分钟自动换取新 `access_token` 写回加密保险库、后台在令牌剩余不足 10 分钟时主动续签保鲜、切号前预续签目标账号凭证、当前活跃号自动同步系统最新令牌。
- **适配官方移除独立 Argon 配额池（并入 Gemini）**：
  - 后端过滤废弃的独立 `Argon` 配额分组并将 `argon` 模型归属及旧配置自动迁移至 `Gemini`（保留历史 Token 账单统计）；重新协调通用页模型下方与账号页总余量/单号卡片的双列等宽布局与间距。
- **修复对话回退/重跑复用旧 `step_index` 导致模型与速率长时间卡滞**：
  - [scan_worker.mjs](sidecars/agy_monitor/backend/scan_worker.mjs) 在检测到 `step_index` 回退复用时立即清理被废弃的旧尾部步骤并重置被覆盖步骤的上游模型与耗时缓存，按时间戳单调更新最新指标并自动自愈历史缓存库。

---

### `v1.1.0`（2026-11-24）— 多账号安全管理与自动切号（账号分页）、掌握页发消息输入框、真实上游模型校正 & 伴侣兼容加固

- **全新「账号」分页（Multi-Account Hub）**：
  - 新增基于 Windows 原生 DPAPI 硬件级加密的多账号保险库（[accounts.mjs](sidecars/agy_monitor/backend/accounts.mjs)、[AgyAccountTool.cs](sidecars/agy_monitor/accounts/AgyAccountTool.cs)、[accounts_hub.js](sidecars/agy_monitor/frontend/components/accounts_hub.js)），支持当前账号一键捕获、**浏览器官方 OAuth 一键直连授权新号**（PKCE S256 + 自动识别环境变量与 Windows 系统代理 HTTP/SOCKS5 隧道）、Token/JSON 批量导入导出、备注编辑、启/停用与删除。
  - **全账号真实实时额度刷新**：参考 Cockpit Tools 接入官方 CloudCode 接口（`v1internal:loadCodeAssist` + `v1internal:retrieveUserQuotaSummary` 及 `v1internal:fetchAvailableModels` 兜底），支持任意非当前账号实时刷新 5 小时与周配额及重置倒计时，并支持定时自动同步。
  - **三类额度总余量聚合卡片 & 多维排序 & 响应式多列布局**：顶部展示全部启用账号的 Gemini / GPT&Claude / Argon 5h 与周总余量进度条；提供悬停展开/点击轮切排序器与窄/宽屏 1～3 列卡片网格自适应。
  - **一键安全切号 & 耗尽自动切号**：切号前自动 DPAPI 快照备份并支持一键回滚；设置中可配置配额自动刷新间隔与自动切号开关（支持 5h 耗尽、周额度归零及会话数据库 `step_type = 17` `QUOTA_EXHAUSTED` 报错触发，优先挑选最高余量账号且排除 0 额度号），重启后仅对切号前处于 `running` 状态的会话执行 At-Most-Once 自动续接。
- **「掌握」页集成消息发送器**：
  - 新增 [composer.mjs](sidecars/agy_monitor/backend/composer.mjs)，支持在掌握页直接向会话发送文本、附件图片及自动发现的 `/swarm` / 自定义技能指令。
- **上游真实模型 ID 精准提取 & 消除误报「疑似降级」**：
  - 从会话数据库 `gen_metadata.#1.#19` 提取权威上游返回模型（如 `gemini-3.8-flash-n`），并严格对比该轮实际请求模型，修复无降级却误标「疑似降级」的问题。
- **桌面壁纸伴侣与切号助手进程识别兼容 & 测试路径隔离**：
  - [AgyBackdrop.cs](sidecars/agy_monitor/backdrop/AgyBackdrop.cs) 与 [AgyAccountTool.cs](sidecars/agy_monitor/accounts/AgyAccountTool.cs) 同步兼容 `Antigravity` 与 `Antigravity_Original` 宿主进程，修复外壳启动器环境下整机美化与底部上下文圆环无法追踪主窗的问题；加固 [paths.mjs](sidecars/agy_monitor/backend/paths.mjs) 测试路径隔离，避免污染用户真实配置目录。

---

### `v1.0.13`（2026-11-22）— 请求记录真实首字 (TTFT) 与全量精确耗时打通 & 伴侣冷启动探测优化

- **请求记录首字 (TTFT) 与末轮纯文本耗时全量补齐**：
  - 后端 [scan_worker.mjs](sidecars/agy_monitor/backend/scan_worker.mjs) 新增零依赖只读解析 Antigravity 本地会话数据库 `conversations/<convId>.db` 中 `steps.metadata` 的官方纳秒级时间戳（发起 `f1`、首字 `f6`、结束 `f7`），为每一条 `PLANNER_RESPONSE`（含末轮无工具调用的纯文本回复与纯对话会话）补全精确 `首字 (TTFT)`、`总耗时` 与 `tok速度`，并在首次扫描时自动一次性回填历史记录。
  - 底栏实时生成速率与悬浮 HUD 升级优先使用会话精确耗时（`conv_db_exact`），悬停请求记录的「耗时」与「tok速度」单元格可查看「首字 + 生成」拆解与纯流式吐字速率；同步支持 `>= 60s` 首字延迟格式化。
- **桌面壁纸伴侣冷启动探测优化**：
  - 将 [backdrop_manager.mjs](sidecars/agy_monitor/backend/backdrop_manager.mjs) 拉起 `agy_backdrop.exe` 后的状态检查由固定 350ms 单次等待升级为最多 1800ms（WSL 2200ms）的 200ms 短轮询，避免高负载 WPF 冷启动被误判为启动失败。

---

### `v1.0.12`（2026-11-22）— 桌面伴侣防崩与防闪黑加固、HUD 多会话实时同步与分屏防误隐

- **彻底根治主窗残留半透明透底、壁纸反复闪黑与弹窗重入崩溃**：
  - 修复 `OnWinEvent` 监听 `EVENT_OBJECT_HIDE / DESTROY` 漏校验 `CHILDID_SELF`（`idChild == 0`）与主窗真实可见性导致 Chromium 子元素隐藏误杀壁纸的问题；优化 `EVENT_OBJECT_REORDER` 为跳过不可见/透明/不重叠辅助窗（`IsDirectlyBehindVisible`）并加 80ms 防抖，纯 Z 序微调附带 `SWP_NOMOVE | SWP_NOSIZE`，消除壁纸反复黑屏与重排 CPU 飙高；同步前紧急保护收严至壁纸真正越界至主窗上方时才触发隐藏。
  - 修复点击底部上下文圆环弹窗时重入关闭引发的 `HwndSource ObjectDisposedException` 崩溃，补充 `_hudPopupOpening` 重入锁与非致命 UI 异常自愈。
  - 接入 Windows 电源休眠（`PowerModeChanged`）与锁屏（`SessionSwitch`）事件：休眠/锁屏前自动还原主窗 100% 不透明，唤醒解锁后自动重贴壁纸；新增 `--restore-opacity` 全桌面应急还原与真实 Win32 透明度核验补刷。
  - 桌面环境探测改用原生 `agy_backdrop.exe --probe-desktop`（~59ms 极速响应，永不缓存瞬态超时失败），Sidecar 新增 15 秒轻量伴侣看门狗断线自愈。
- **底部 HUD 与控制台多会话精准同步**：
  - 前景可见 AGY 控制台切换会话自动同步 HUD，常规轮询实时推送活跃前景会话速率与上下文占比，同时严格拦截后台隐藏 iframe 抢占。
  - 顶栏 UIA 标题探测新增真实会话白名单校验（`MatchesAnyKnownSession`），彻底杜绝聊天正文片段污染会话标题；单窗口切换会话自动清理陈旧窗口标题缓存。
- **分屏防误隐与窄输入框完整显示**：
  - 将 `console-fullscreen` 遮挡判定收严至真全屏宽度（>= 60%～62%），修复普通分屏切换至 Overview 后圆环被幽灵全屏误隐藏问题。
  - 窄输入框放不下完整模型 ID 时整段优雅收起模型名，避免半截断字。

---

### `v1.0.11`（2026-11-22）— 官方原生 5 小时与周配额三联圆环看板 & 顶栏等高锁定

- **原生官方 5 小时 / 周配额三联卡片**：
  - 无需开启 CDP、无需手动打开设置页，后端通过宿主注入的原生本地语言服务通道（`RetrieveUserQuotaSummary`）毫秒级静默拉取官方实时配额，自带 30 秒缓存、并发合并与失败陈旧兜底。
  - 在「上下文占用」右侧、「模型 Token 用量」正下方横向排布 **`Gemini`**、**`GPT&Claude`**、**`Argon`** 三张配额小卡片；每张卡片内上下排列「5小时」与「周额度」，左侧为按剩余比例自动变色（绿 / 琥珀 / 红 / 虚线灰）的 SVG 进度圆环，右侧上下双行清晰呈现名称、剩余百分比及动态刷新倒计时（悬停可看精确小数百分比、本地重置时刻与包含模型列表，点击卡片可立即强制刷新）。
- **顶栏双列等高锁定（展开模型列表不撑高页面）**：将右侧「模型 Token 用量 + 配额卡片」区域高度严格锁定为左侧「上下文占用」的精确高度，展开任意多个模型明细项时仅在列表区域内部滚动，彻底消除展开/折叠引起的布局跳动与底栏挤压。

---

### `v1.0.10`（2026-11-21）— 方案二侧边栏防叠色、WSL2 NAT 隧道加固与 6 项稳定性修复

- **方案二侧边栏防多层叠色**：`scanLayers` 改为由外向内反序遍历并自动清除嵌套后代重复 `sidebar` 标记（引擎升级 `v3` 自动热替换），避免侧边栏多层半透明叠加发灰遮挡壁纸。
- **WSL2 NAT 隧道与跨端路径加固**：监听 `close` 事件防止大响应提前截断并补全真实 WebSocket 隧道双向测试；隧道程序按源码哈希命名避免 Windows 升级文件锁；`toWindowsPath` 对尚不存在的路径自动回溯父目录转换。
- **WSL2 自更新与入口体验完善**：WSL2 一键更新后自动重编 Windows 贴背伴侣，顶栏 GitHub 入口自动调用 Windows 浏览器打开。
- **请求记录弹窗分页防越界**：翻页后刷新若总条数收缩，自动回退至最后一有效页并重拉。

---

### `v1.0.9`（2026-11-21）— Win + WSL2（含 NAT）全屏美化适配、单次请求记录明细弹窗与掌握页体验升级

- **Win + WSL2（含 NAT 模式）全屏美化完整适配（#1）**：
  - 自动识别 WSL2 + Windows Interop 环境并解除「仅支持 Windows」限制：支持**方案一（贴背伴侣）**自动跨端编译至 Windows NTFS 目录并静默拉起，心跳存活检测兼容 Windows PID。
  - **方案二（CDP 高清纯 CSS）**新增零管理员权限、零防火墙弹窗的 WSL2 NAT 免转发回环隧道（`agy_wsl_cdp_tunnel.exe`），无需开启 `mirrored` 模式即可自动桥接 Windows `127.0.0.1:<port>`。
  - 放行 WSL Remote 主窗口 `https://127.0.0.1:<port>/` Target（仍严格排除 AGY 控制台自身与其他本地服务），并升级 9×9 全边缘图层扫描与工作台壳层（含右侧栏、底栏、标签栏及浅色区域）透明覆盖。
- **单次模型请求记录明细弹窗**：「模型 Token 用量」新增 **`请求记录`** 入口按钮，弹窗完整展示每次请求的 10 项明细（时间、`model_id`、输入及缓存拆分、输出、缓存命中率、估算费用、首字、耗时、`tok` 速度、状态及异常报错详情），支持独立切换范围/时间/模型/状态筛选与分页浏览。
- **「掌握 → 会话进程」常用会话置顶与行内星标**：常用会话始终按原顺序置顶显示在最上方，每行支持一键设为常用或取消常用，并与「通用 → 常用会话」实时双向同步。
- **「掌握」页连续/行内图片并排展示**：正文行内嵌入的多个本地图片自动收束为紧凑图片芯片，并在行下并排排列为缩略图画廊，不再打断正文排版。
- **严格语义化版本更新检测**：仅当远端最新 Release 版本号严格高于本地版本时提示「有更新」，消除同版本文档提交或本地超前版本导致的误报。

---

### `v1.0.8`（2026-11-21）— 全屏多高度排版、窄栏分级压缩、全屏遮挡联动与性能内存优化

- **宽屏 / 全屏与多高度自适应排版**：宽屏居中收束（`1180px–1260px`）并加入轻毛玻璃卡片分层；「通用」配置行双栏并排、「掌握」页宽屏升级为左栏会话进程 + 右栏主次协作画布、「美化」页色调与示例区左右联排、壁纸改为 16:9 画廊与 4 列滑块、能力边界说明改为 3 列卡片；同时适配矮窗口紧凑与高屏舒展高度。
- **输入框过窄按长度分级压缩**：补全 `ComboBox / SplitButton / MenuItem` 与工具栏子树扫描及输入框容器左边界硬约束；空间不足时按优先级整段隐藏 Model ID → 缓存命中 → 速率，仅保留紧凑圆环（不再半截省略或溢出盖住模型下拉框）。
- **全屏控制台 HUD 几何联动**：控制台实时上报物理视口宽度，全屏控制台（含左侧边栏展开时）自动隐藏底部上下文圆环且鼠标按下不闪现，退出全屏毫秒级恢复。
- **全链路性能与内存优化**：桌面伴侣壁纸/灯箱流式解码限制 `DecodePixelWidth`、空闲工作集回收、冻结高频画刷、`UiaWorkerLoop` 分级休眠（后台零 COM UIA RPC）；Node 后端 SQLite 语句缓存、冷热会话分级扫描与 `mtime` 缓存；移除「掌握」页打开本地文件/目录成功后的多余提示弹窗。

| 通用面板 + 底部圆环 HUD + 整机壁纸联动 | 掌握页类 Codex 历程详情 + 跳转会话 + 进度胶囊 |
| :---: | :---: |
| ![v1.0.8 通用面板与输入框 HUD](docs/screenshots/v1.0.8-general-split.jpg) | ![v1.0.8 掌握页历程详情](docs/screenshots/v1.0.8-mastery-detail.jpg) |

---

### `v1.0.7`（2026-11-21）— 底部状态栏勾选弹窗、悬停打开指引、双屏防覆盖熔断与中文配额避让

- **点击上下文圆环自定义显示项**：点击底部圆环或胶囊弹出配置菜单，支持自由勾选/取消 **生成速率 / 缓存命中 / 上游模型 / 上下文占用**，设置自动持久化且不抢主窗焦点。
- **「? 如何打开 AGY 控制台」悬停图解指引**：彻底移除模拟鼠标点击方案，改为移入弹窗底部入口即在侧边弹出清晰图示，一键看懂插件打开位置。
- **双屏 & Wallpaper Engine Z-Order 硬防线**：引入 `IsWindowStrictlyBehind` 严格后置校验与异常熔断机制，防止壁纸窗口在多屏/壁纸引擎环境下遮挡 Antigravity 主窗。
- **中文模型与配额弹窗避让**：补全 `使用限额 / 查看用量 / 重置于` 等中英文浮层检测与多点祖先链识别，展开模型/用量弹窗时自动隐藏圆环。

| 点击圆环弹出 4 项自由勾选配置 | 悬停「如何打开 AGY 控制台」弹出图解指引 |
| :---: | :---: |
| ![v1.0.7 底部状态栏配置弹窗](docs/screenshots/v1.0.7-hud-popover.png) | ![v1.0.7 如何打开 AGY 控制台指引](assets/open_console_guide.jpg) |

---

### `v1.0.6`（2026-11-21）— GPU 硬件加速贴背、VSync 跟窗与 10 项上下文圆环精度修复

- **硬件加速贴背 & VSync 同步跟窗**：贴背层升级硬件加速渲染 + 原生 DWM 圆角，`BeginDeferWindowPos` 原子批量同步并接入 `CompositionTarget.Rendering` 实现跟手拖动；补充全局未捕获异常兜底自动还原主窗不透明度。
- **上下文圆环 10 项修复**：压缩 `CHECKPOINT` 摘要调用避免占比虚高、纯文本对话不再误借其他会话速率/模型、新建空白对话立即重置 `0%`、过滤 `[AGY_PROGRESS]` 进度标签噪音。

---

### `v1.0.5`（2026-11-21）— 子 Agent 实时状态、安全校验与多 DPI 稳定性加固

- 接入权威子 Agent 运行状态（长任务超过 90 秒不再误判结束），修复 `<thinking>` 思考内容泄露并补全 `replace_file_content` 精确 `+add -del` 行数统计。
- 强化本地路径安全策略（拒绝 UNC 路径、限制非图片可执行文件直开），按会话隔离 Hook 状态文件，修复混合 DPI 灯箱偏移与含逗号路径在资源管理器中的选中定位。

---

### `v1.0.4`（2026-11-20）— 定时总结默认关闭与状态竞态修复

- 定时总结功能改为默认关闭、按需一键开启；统一 `PLUGIN_DATA` 配置读取路径，修复会话中途开启总结无响应及开关轮询竞态问题。

---

### `v1.0.2` ~ `v1.0.3`（2026-11-20）— 「掌握」页内联图片预览与 100% 不透明原生全窗灯箱

- 在「掌握」页对话历程中自动提取并内联渲染清晰的本地图片预览网格；点击任意图片可在 Windows 下拉起 100% 不透明原生 WPF 全窗灯箱（支持滚轮缩放、拖拽平移、打开文件与定位所在目录）。

<img width="720" alt="v1.0.3 掌握页内联图片预览" src="docs/screenshots/v1.0.3-inline-images.jpg" />

---

### `v1.0.1`（2026-11-20）— 顶栏一键自更新、GitHub 入口、跳转会话与防孤儿悬浮窗

- 顶栏新增自动检查更新/一键升级按钮与 GitHub 仓库快捷图标；「掌握」页总览与 Agent 详情页新增「跳转会话」按钮；修复重入导致的孤儿 HUD 悬浮窗并升级 Markdown 安全渲染。

---

### `v1.0.0`（2026-11-20）— 首个开源正式版

- 首发交付「通用（上下文饼图 / Token 消耗与 5h 配额 / 速率与模型对照 / 会话管理）」「掌握（多 Agent 协作关系网 / 类 Codex 内容历程）」「美化（撞色主题 / 二次元壁纸 / Windows 零侵入贴背伴侣与底部 HUD）」三大模块及全平台一键安装/卸载脚本。

---

## 最简单安装方式（三选一）

> **运行环境**：只需已安装 **Node.js >= 22.5.0**（Windows 双击安装器若检测到缺失会自动提示通过 `winget` 一键装好，无需手动配置）。

### 方式一：下载 Release 压缩包，双击即装（推荐 · 最无脑）

1. 前往 [Releases 最新版本页面](https://github.com/aishadiaodeqishui/agy-monitor/releases/latest) 下载 `agy-monitor-v*.zip` 并解压到任意文件夹。
2. 运行安装器：
   - **Windows**：直接双击根目录的 **`install.cmd`**
   - **macOS / Linux**：终端进入解压目录执行 `chmod +x install.sh && ./install.sh`
3. 打开 **Antigravity** -> 左侧 **Customizations -> Plugins** -> 打开 **「AGY 控制台 (`agy-monitor`)」** 开关即可使用！

### 方式二：终端一行命令安装（无需手动下载）

- **Windows (PowerShell)**：
  ```powershell
  irm https://raw.githubusercontent.com/aishadiaodeqishui/agy-monitor/main/scripts/install.ps1 | iex
  ```
- **macOS / Linux**：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/aishadiaodeqishui/agy-monitor/main/install.sh | bash
  ```

### 方式三：Git Clone 安装（开发者）

```bash
git clone https://github.com/aishadiaodeqishui/agy-monitor.git
cd agy-monitor
node scripts/install.mjs
```

---

## 默认设置与自动保存

首次安装即自动启用以下精选默认配置，**你在界面中做的任何改动都会实时自动保存到本机 `~/.gemini/antigravity/plugin_data/agy-monitor/`，升级插件也不会丢失**：

- **通用**：简体中文、512k 上下文窗口上限、自动跟随最新会话
- **掌握**：定时总结默认关闭（可随时一键开启「自身模型」或「第三方模型」）、操作分组默认收起
- **美化**：极昼原版配色、壁纸「星海夜行电车」（透明度 100% / 模糊 0px / 暗度 0% / 圆角 10px / 铺满裁剪）、Windows 整机壁纸方案一（透显度 25%）与输入框圆环 HUD 开启
- **桌宠（可选扩展）**：默认关闭（关闭时零后台进程），开启后支持 `60%~500%` 缩放、自主桌面漫步、每轮输入/输出 Token 弹出气泡与自定义帧动画

---

## 升级与卸载

- **升级**：重新运行 `install.cmd` / `./install.sh` / `node scripts/install.mjs` 即可覆盖升级，个人配置与 Prompt 规则完整保留。
- **卸载**：
  - **Windows**：双击 **`uninstall.cmd`**（或运行 `node scripts/uninstall.mjs`）
  - **macOS / Linux**：运行 `chmod +x uninstall.sh && ./uninstall.sh`
  - 默认保留你的个人配置与自定义壁纸目录；如需彻底清除数据，执行 `node scripts/uninstall.mjs --purge-data`。

---

## 开发与打包发布

```bash
# 运行全量单元测试（零外部依赖）
npm test

# 同步当前源码到本机 Antigravity 插件目录
npm run sync

# 打包可直接上传 GitHub Releases 的独立 ZIP（输出到 dist/）
npm run pack
```

---

## 零侵入安全说明

- 严格遵守 Antigravity 官方插件规范，仅安装在 `~/.gemini/config/plugins/agy-monitor`。
- **绝不修改** Antigravity 安装目录、`app.asar` 或宿主 `~/.gemini/config/config.json`。
- 所有本地会话与数据库均以只读方式读取，所有第三方 API Key 仅保存在本机 `plugin_data` 目录，绝不上传或外传。

## 社区支持

https://linux.do
