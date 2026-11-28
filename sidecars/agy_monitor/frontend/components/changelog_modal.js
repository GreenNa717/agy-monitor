/**
 * Release Notes / Changelog Modal (`#changelogModal`) triggered from the top
 * navigation bar button (`#changelogBtn`).
 *
 * - Renders the full version history from newest to oldest using pure DOM nodes
 *   (zero innerHTML interpolation).
 * - Merges newer official GitHub releases from `/api/update/releases` when online.
 * - Provides per-version interactive action buttons:
 *   - Newer version  -> "更新" (downloads & installs that exact release tag)
 *   - Current version -> "当前版本" (disabled indicator)
 *   - Older version  -> "回退" (downloads & rolls back to that exact release tag)
 */

const BUILTIN_CHANGELOG_ENTRIES = Object.freeze([
  {
    version: "1.2.4",
    date: "2026-11-28",
    title: "修复 /compact 上下文压缩误触发掌握汇报钩子（PR #9）",
    items: [
      "合入 PR #9（@Elosiad）：在 PreInvocation 定时总结钩子（mastery_summary_hook.mjs）中精准识别并跳过 /compact 上下文压缩命令（兼容大小写、前后空白与附加指令），避免向压缩请求注入「AGY掌握·开场汇报」污染总结内容，也不再改写当前会话的 hook_state 状态；普通对话中提及 /compact 仍正常处理。",
    ],
  },
  {
    version: "1.2.3",
    date: "2026-11-28",
    title: "修复 Antigravity 升级后美化失效死锁（新增独立退出原子落盘进程）",
    items: [
      "彻底修复 Windows 上 Antigravity 自身升级覆盖 app.asar 后，运行态文件锁（EBUSY/EPERM）导致原生壁纸、状态栏、深度汉化与免 TUN 代理无法自动重注的死锁问题。",
      "新增零依赖独立退出落盘进程 asar_apply_worker.mjs：永不就地覆写运行中的 app.asar；遇到占用锁时自动暂存完整补丁并在客户端关闭释放句柄的瞬间完成 SHA-256 与指纹校验及 0.1ms 原子替换（若期间官方再次更新则自动放弃防覆盖），重启后自动清理残留文件。",
      "美化页状态徽章与操作提示同步适配延迟落盘状态，排队就绪后直接展示「已持久化 · 重启生效」并给出清晰引导。",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-11-27",
    title: "主窗口深度中文汉化 v2、新增「增强」加速分页与「免 TUN 代理」、多账号跨平台加固 & app.asar 安全防护",
    items: [
      "主窗口深度中文汉化 v2：全新词典驱动的 host_i18n 引擎大幅扩展 Antigravity 宿主界面中文覆盖率（菜单、侧栏、设置、项目与操作提示），通过原生钩子与 CDP 实时热同步，切回 English 时可无损还原。",
      "新增「增强」加速分页（全部默认关闭 · 按需启用）：内嵌零依赖 boost_mcp 服务，提供「合并工具批处理（并发检索/原子多文件改写/并发检查）」「大文件先看目录再精读」「长日志自动压缩首尾折叠」三项独立开关与顶部一键全开/全关，附悬停小窗与点击全屏功能说明弹窗。",
      "「其他」分页顶部新增「免 TUN 代理」（默认开启）：支持自动识别 Windows/macOS 系统代理或自定义 HTTP/HTTPS/SOCKS5 代理（含鉴权与绕过列表），通过主进程钩子同时接管 Electron 与 language_server 流量，支持强制 HTTP/1.1 与连通测速。",
      "多账号跨平台安全与可靠性升级：新增 macOS Keychain / Linux Secret Service 原生凭据存储驱动、静态纯 Node 切号守护进程 switch_worker.mjs（告别临时脚本），并补齐切号前引导状态同步与串号自愈防线。",
      "app.asar 写入安全与侧栏/卸载全面加固：彻底移除运行期危险的 .agy_stale 热替换，改为先探锁再原子替换且运行中延迟覆盖旧版 app.asar；主进程钩子增加卸载自休眠检测，卸载脚本自动还原原版 app.asar 并清理运行时缓存；移除侧栏吸顶容器 overflow: clip、收紧侧栏扫描范围、补齐普通毛玻璃浅色主题自适应，并修复 mcp_bridge.mjs 未定义 ERR_PARSE 报错。",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-11-27",
    title: "新增 macOS 原生透明桌宠伴侣（PR #8 及安全节能加固）、全界面精简整顿 & 账号订阅层级识别与加权总余量",
    items: [
      "合入 PR #8（@WhiteNorth）新增 macOS 原生 Swift / AppKit 透明桌面桌宠伴侣（零外部依赖，支持矢量萌宠、单图/GIF、6 轨帧动画、物理拖拽、自主漫步、气泡模板与点击穿透解锁），并顺手完成 5 项安全与节能加固：停止前双校验 flock 与 proc_pidpath 杜绝 PID 复用误杀、移除 NSScreen.screens.first! 强解包防休眠切屏闪退、改用 xcode-select -p 检测 CLT 防未装环境误弹安装框、补齐 GIF 90 帧封顶/ImageIO 缩略图降采样与 6 轨 LRU 懒加载，以及按活跃/睡眠态动态降频与 timer.tolerance 省电。",
      "全界面 UI 精简整顿：大幅删减各分页偏开发说明的冗余文案与长段落卡片，保留直观易懂的功能提示；收紧「其他」分页选项卡片尺寸与留白，操作更紧凑清爽。",
      "多账号订阅层级自动识别与加权总余量统计：通过本机官方 GetUserStatus 与 CLI statusLine 自动识别 Free / Free Pro / Paid Pro / Plus / Ultra 5x / Ultra 20x 并在账号卡片支持点击微调；总余量按 Ultra 20x = 2000%、Ultra 5x = 500%、Plus/Pro/Free = 100% 精确加权汇总。",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-11-27",
    title: "全链路内存与显存（RAM/VRAM）深度优化（Issue #7）& 「其他」分页新增可选「轻量省显存模式」",
    items: [
      "Node 后台内存与磁盘 IO 瘦身：将 15 秒 Watchdog 对 app.asar 的 80–160 MB 整包读取改为 (mtimeMs, size) 缓存 + 头部切片按需读取，资产写盘增加内容指纹跳过无变化覆写；OAuth 二进制探测改用 4 MB 分块流式扫描消除 300–520 MB 峰值；scan_worker 迁入 worker_threads 省下独立进程基线并将 SQLite 回退查询改为 .iterate() 流式遍历；会话进展改按单个 convId 独立缓存且优先读尾部 128 KB；瘦身回调联动清理各模块缓存。",
      "HUD 注入与 CDP 降载：CDP 900ms 轮询在已挂载时仅推轻量 JSON 增量状态（< 2 KB），不再重复序列化完整脚本与引导图；图层引擎 scanLayers() 页面不可见时自动暂停且节流放宽至 350ms；吸顶壁纸 CSS 抽为 :root 的 --agy-wp-url 变量去重，零视觉降级。",
      "WPF 壁纸与桌宠伴侣显存/内存减负：两款伴侣解码前均先探测原图尺寸并禁止放大解码（144 帧 256×256 桌宠不再被放大 4 倍，GIF 同步封顶）；桌宠改用按轨道按需懒加载（LRU）、空闲与全屏遮挡自动降频暂停、冻结画刷与降级离屏缓存；壁纸伴侣隐藏或切换 CSS/CDP 模式时主动释放位图与窗口、以离线三遍预模糊替代实时全屏 BlurEffect，并补齐原生 Windows 下的 --parent-pid 孤儿退出守卫。",
      "侧栏前端优化与可选「轻量省显存模式」：共享宿主壁纸时彻底停用侧栏壁纸纹理；自定义壁纸上传自动限制 2560px 长边并转码 WebP；静默连线停止 SVG 动画、2s 轮询增加签名跳过无变化重建并封顶图片/草稿缓存；在「其他」分页新增可选「轻量省显存模式」开关（默认关闭，不改现有默认观感；开启后即时关闭侧栏与宿主端毛玻璃、吸顶壁纸遮罩与装饰动画）。",
    ],
  },
  {
    version: "1.1.9",
    date: "2026-11-27",
    title: "新增精选「Gemini 猫娘」按需下载桌宠（轻量预览图占位 · 点击下载 6 轨 144 帧动画包）",
    items: [
      "桌宠造型库新增精选「Gemini 猫娘」预览图占位卡片：插件仓库与主安装包仅内置 69 KB 透明预览图，彻底避免撑大主插件体积。",
      "支持点击卡片按需从官方 GitHub Release 下载完整 6 轨 × 24 帧（144 帧 · 18 FPS）高清动画素材包，全程走系统代理通道并执行严格域名白名单、ZIP 炸弹防护与 SHA-256 完整性校验，下载完成后自动安装并启用。",
      "支持随时删除本地已下载的动画包以释放空间，删除后自动恢复为预览占位卡，方便后续按需重新下载。",
    ],
  },
  {
    version: "1.1.8",
    date: "2026-11-26",
    title: "官方合规额度通道（CLI statusLine 零请求桥接 + 禁绝 cloudcode-pa 直连）& 新增「其他」分页额度总开关与全界面自动补位",
    items: [
      "全面切换为官方合规额度获取方案：优先被动读取 Antigravity CLI 官方 statusLine 本地回调快照（零额外 RPC 请求，支持在「其他」页一键写入配置或复制 /statusline 命令），桌面端回落至宿主本机官方 language_server 回环服务；生产路径彻底禁绝直接请求 Google cloudcode-pa.googleapis.com 探测未激活账号，严防账号风控标记。",
      "新增顶部「其他」分页与「额度查看与查询」总开关（默认开启，支持持久化保存）：实时展示当前官方通道与合规防护状态；关闭开关后立即全链路硬停前后台全部额度查询（后端 /api/quota、HUD 同步、账号后台轮询、前端定时器/焦点刷新与桌宠同步全部归零）。",
      "关闭额度开关后的全界面无缝补位适配：通用页隐藏底部双配额条，模型 Token 用量列表自动向下拉满与上下文饼图齐平；原生输入框 HUD 自动隐藏额度胶囊与菜单项，把全部水平宽度让给速率/缓存/模型名（v2.2.8）；账号页隐藏汇总栏、单卡配额条、刷新按钮与按额度排序项，剩余 5 个操作按钮等宽铺满整行。",
    ],
  },
  {
    version: "1.1.7",
    date: "2026-11-26",
    title: "多账号分组管理、消除闲置 AT 过期误报 & 根治异常提示闪烁与轮询降频",
    items: [
      "新增多账号分组管理：默认归入「default」（兜底不可删），预置「pro」「ultra 5x」「ultra 20x」三个常用可选分组（支持自由删除，删后原组账号自动归回 default），并支持新建/删除自定义分组；支持顶部分组筛选、卡片内一键切组、入库/导入选组与 JSON 导入导出保留分组，额度总余量与状态筛选随分组实时联动。",
      "消除闲置账号「AT 过期」误报：持有有效 RT 的闲置账号在 1 小时 AT 自然到期后保持正常态（切号或刷新额度时自动静默续签），仅在缺失 RT 或实测返回 HTTP 401 时提示异常。",
      "根治异常账号提示条反复闪烁并加固防风控：移除异常条入场重播动画、列表/汇总增加无变更跳过 DOM 重建机制、修复轮询退出快速模式未降频并将常态本地刷新放宽至 30 秒，同时在后台周期任务中追加阻断守卫确保 RT 过期/封禁/禁用号永不被轮询。",
    ],
  },
  {
    version: "1.1.6",
    date: "2026-11-26",
    title: "异常账号识别与一键刷新 AT（PR #5）、修复无壁纸侧栏项目消失（PR #6）& 全站吸顶栏无缝壁纸遮罩",
    items: [
      "合入 PR #5（@GreenNa717）：多账号新增精细化异常状态识别（需验证 / 已封禁 / RT 过期 / AT 过期 / 无订阅等）、筛选栏、低风控纯 OAuth「一键刷新 AT」（零 CloudCode 探测）、节流「一键检测全部」、一键禁用异常号及 AccountChooser 预填邮箱「去验证 / 复制链接」，并在后台与切号链路全面强化防风控阻断。",
      "合入 PR #6（@Elosiad）：将主进程钩子的壁纸清理脚本改用 IIFE 与块级 const el，彻底修复未开壁纸时覆写宿主全局 window.el 导致 Antigravity 2.35.2 侧栏 Projects 列表全部消失的严重问题。",
      "全站吸顶栏无缝壁纸遮罩（v2.2.7）：为侧栏 Projects 及 Customizations / Automations / Settings / Diff 等全部吸顶栏加上与整窗像素 1:1 对齐的同源壁纸遮罩（图层引擎升至 v5），彻底消除滚动时文字穿透重叠且无任何黑条色差。",
    ],
  },
  {
    version: "1.1.5",
    date: "2026-11-25",
    title: "修复 Electron 运行时持久注入 app.asar 报 ENOENT 的热修复",
    items: [
      "修复 Windows 桌面端在宿主 Electron 运行时下启用持久化状态栏或方案三持久壁纸时，因 node:fs 将 app.asar 拦截为虚拟目录导致的「ENOENT, not found in ...\\resources\\app.asar」报错：自动改用 Electron 内置 original-fs 绕过拦截，一键注入与自动补注恢复正常。",
    ],
  },
  {
    version: "1.1.4",
    date: "2026-11-25",
    title: "方案三持久纯 CSS 壁纸与全界面毛玻璃化、原生底栏双圆环额度帘幕动画 & Cockpit 同款保守切号",
    items: [
      "新增方案三「持久纯 CSS 注入」（默认）：通过轻量主进程钩子与自动补注实现免快捷方式加载整机壁纸，文字与图片 100% 锐利且支持一键安全还原；同时打通 AGY 控制台透明穿透，与左侧栏和主聊天区无缝共享同一张连续壁纸。",
      "全量替换宿主暗黑实底卡片与面板：统一接管 --background / --card / --shell-canvas / --sidebar / --onyx-selected 等主题 Token，将左侧项目行、输入框、排队消息框（Queued Messages）、文件树与各类弹窗卡片升级为同系毛玻璃质感，并清除输入框上方渐隐黑影。",
      "原生 Shadow DOM 输入框底栏升级：点击菜单改为顶层 Portal 弹出防裁切，胶囊底色随输入框半透联动，新增「账号剩余额度」5h/周双圆环胶囊；悬停采用与中间指标同频耦合的舒缓帘幕动画（零闪跳、零抽搐、自带全局代数防重守卫）。",
      "多账号切号全面对齐 Cockpit Tools 保守风控策略：默认关闭非当前号后台轮询，规范 OAuth 凭据刷新头与单飞锁，切号流程更稳健安全；并精简移除「通用」页多余的发起模型偏好与发起新对话栏。",
    ],
  },
  {
    version: "1.1.3",
    date: "2026-11-24",
    title: "全量 AGY 内存管理与零 UIA 省内存模式、桌宠独立 5h/周额度变量与多行「会话进展」气泡",
    items: [
      "新增全量 AGY 内存管理体系：顶栏新增三态颜色实时 RAM 胶囊与「AGY 内存管理」弹窗，实时拆解主进程、渲染与 GPU、语言服务、本插件伴侣及其他扩展的专用物理内存与提交内存，提供智能根因诊断、一键安全释放全量内存、重启伴侣进程及超阈值自动后台瘦身（默认 1.8G / 10 分钟冷却）。",
      "根治伴侣内存膨胀并提供可选零 UIA 省内存模式：壁纸与桌宠伴侣新增 Gen-2 定时自瘦身与外部触发瘦身，后台 SQLite 限制页缓存并定时执行 PRAGMA shrink_memory；在内存管理弹窗可选开启「极致零 UIA 省内存模式」（推荐搭配方案二 CDP 兼得零 UIA 与原生输入框圆环）。",
      "彻底修复底部上下文圆环（HUD）频繁乱串：通过校验元素所属 Document 直接隔离右侧 AGY 控制台，收紧底部 108px 搜索带并移除「自动/取消/审查」等误匹配词，无论开关控制台、切换会话或打开原生 Review 面板均稳稳贴合输入框 Turbo 左侧。",
      "桌宠气泡模板升级：将 {quota} 拆分为纯数值变量 {quota5h}（5 小时余量）与 {quota7d}（周额度余量），快捷预设「模型 + 额度」精简为「额度」（5h {quota5h}% · 周 {quota7d}%）。",
      "桌宠新增「会话进展」快捷预设与列表模板语法：支持 [{schedule:<id>},{content:<id>}](active,unread) 导入当前全部活动/未读会话并自动多行换行排版，WPF 桌面气泡随行数自动向上扩展展示。",
    ],
  },
  {
    version: "1.1.2",
    date: "2026-11-24",
    title: "可插拔 AI 桌宠工作室（PR #3）、桌宠气泡实时额度变量 {quota} & 安全/DPI/生命周期全面加固",
    items: [
      "合入来自 @GreenNa717 的可插拔桌面宠物扩展（PR #3）：独立「桌宠」分页、顶栏快捷开关、6 轨道自定义帧动画工作室、MCP 工具链与 AI 生图制帧技能（默认关闭、零后台常驻进程，支持 AGY_DISABLE_EXTENSIONS=1 完全隔离）。",
      "桌宠弹出气泡新增实时额度变量 {quota} 与「模型 + 额度」快捷预设：自动按当前模型匹配对应池（Gemini / GPT&Claude）展示 5h/周剩余额度，面板预览与 Windows 桌面悬浮宠全链路实时同步。",
      "全面安全与资源加固：为 PNG 解码补齐尺寸与解压上限防炸弹、收紧精灵表与离线预览 HTML 输出路径并校验符号链接、为预览页增加严格 CSP 与 nosniff、拦截原始 customPets 覆写；打包/更新/卸载脚本全面同步 mcp_config.json、skills/ 与桌宠伴侣进程清理。",
      "加固 Windows 桌宠伴侣与前端兼容性：新增父进程 + Antigravity 宿主防孤儿退出守卫、休眠/锁屏/分辨率切换恢复、Per-Monitor 高分屏 DPI 坐标换算与配置合并写入；修复窄屏挤出公告按钮、浮窗遮挡弹窗、重复动画定义与隐藏时定时器空跑问题。",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-11-24",
    title: "更新公告弹窗（支持单版本更新/回退）、OAuth 自动续签防 401、移除 Argon 双列适配 & 回退切模型秒级响应",
    items: [
      "顶部导航栏新增「更新公告」快捷按钮与全版本历史弹窗，每个版本均提供「更新 / 回退 / 当前版本」一键切换按钮。",
      "修复 Electron 运行环境下读取 app.asar 失败导致的 OAuth 客户端 401 误报，支持多客户端与 JWT aud 自动匹配，并将刷新额度、后台保鲜、切号前注入与当前号同步全面升级为自动续签凭证。",
      "适配官方配额策略调整：移除已并入 Gemini 池的独立 Argon 额度统计，重调通用页与账号页双列卡片尺寸与间距。",
      "修复对话回退重跑复用旧 step_index 时尾部旧分支残留导致模型与速率长时间不刷新的缓存问题，并自动自愈历史记录。",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-11-24",
    title: "多账号安全管理与自动切号（账号分页）、掌握页发消息输入框 & 真实上游模型校正",
    items: [
      "新增「账号」分页：Windows DPAPI 硬件级加密保险库，支持当前号一键捕获、浏览器官方 OAuth 一键直连授权（PKCE + 自动走系统 HTTP/SOCKS5 代理）、Token/JSON 批量导入导出。",
      "接入官方 CloudCode 实时配额刷新，支持全部账号 5 小时与周额度同步、顶部总余量汇总卡片、多维排序与响应式多列卡片网格。",
      "支持一键安全切号（自动备份与回滚）及 5h/周耗尽或额度为空报错自动切号，重启后仅自动续跑真正运行中的会话。",
      "「掌握」页集成消息发送输入框（支持附件图片、/swarm 与自定义技能），上游真实模型精准核验，壁纸伴侣同步兼容 Antigravity_Original 进程。",
    ],
  },
  {
    version: "1.0.13",
    date: "2026-11-22",
    title: "请求记录真实首字 (TTFT) 与全量精确耗时打通 & 伴侣冷启动探测优化",
    items: [
      "只读解析本地会话数据库纳秒级时间戳，为每条请求（含末轮纯文本回复）补全精确首字延迟 (TTFT)、总耗时与 tok 速度。",
      "底栏与悬浮 HUD 优先采用精确耗时计算生成速率，悬停可查看「首字 + 生成」拆分详情。",
      "桌面壁纸伴侣拉起探测升级为 200ms 短轮询（最长 1.8s / WSL 2.2s），消除高负载冷启动误判。",
    ],
  },
  {
    version: "1.0.12",
    date: "2026-11-22",
    title: "桌面伴侣防崩与防闪黑加固、HUD 多会话实时同步与分屏防误隐",
    items: [
      "修复 WinEvent 子元素误触发与 Z 序高频重排引发的壁纸反复闪黑、主窗残留半透明透底及弹窗重入崩溃。",
      "接入 Windows 休眠与锁屏事件自动还原主窗不透明度，唤醒后自动重贴壁纸，并加入 15 秒轻量看门狗自愈。",
      "前景控制台切换会话实时同步底部 HUD 并拦截隐藏 iframe 抢占；收严全屏遮挡判定，修复分屏误隐圆环。",
    ],
  },
  {
    version: "1.0.11",
    date: "2026-11-22",
    title: "官方原生 5 小时与周配额圆环看板 & 顶栏等高锁定",
    items: [
      "免配置、免 CDP 静默直连本地语言服务，在模型 Token 用量下方实时展示 5 小时与周剩余配额圆环及精确重置倒计时。",
      "锁定顶部双列等高，展开任意多个模型用量明细仅在卡片内滚动，彻底消除页面跳动与底栏挤压。",
    ],
  },
  {
    version: "1.0.10",
    date: "2026-11-21",
    title: "方案二侧边栏防叠色、WSL2 NAT 隧道加固与分页防越界",
    items: [
      "CDP 方案二升级由外向内图层遍历，避免侧边栏多层半透明叠加发灰遮挡壁纸。",
      "加固 WSL2 NAT 回环隧道响应完整性、自更新重编伴侣与请求记录翻页防越界回退。",
    ],
  },
  {
    version: "1.0.9",
    date: "2026-11-21",
    title: "Win + WSL2（含 NAT）全屏美化适配、单次请求记录明细弹窗与掌握页升级",
    items: [
      "完整适配 Win + WSL2 环境，新增免管理员权限、免防火墙弹窗的 NAT 回环隧道支持贴背伴侣与 CDP 透明覆盖。",
      "新增「请求记录」明细弹窗，支持 10 项单次请求指标展示与范围/时间/模型/状态筛选分页。",
      "「掌握」页支持常用会话置顶与行内星标双向同步、连续本地图片并排画廊及严格语义化版本检测。",
    ],
  },
  {
    version: "1.0.8",
    date: "2026-11-21",
    title: "全屏多高度排版、窄输入框分级压缩、全屏遮挡联动与性能优化",
    items: [
      "宽屏居中收束与多高度自适应布局，覆盖通用、掌握与美化全页面；全屏控制台自动隐藏底部 HUD 圆环。",
      "输入框过窄时按优先级整段收起模型名 / 缓存 / 速率，不再半截截断或遮挡模型下拉框。",
      "优化伴侣图片流式解码与空闲内存回收、后端 SQLite 语句缓存与冷热会话分级扫描。",
    ],
  },
  {
    version: "1.0.7",
    date: "2026-11-21",
    title: "底部状态栏自由勾选弹窗、悬停打开指引与双屏防覆盖熔断",
    items: [
      "点击底部上下文圆环弹出配置菜单，支持自由勾选生成速率 / 缓存命中 / 上游模型 / 上下文占用。",
      "新增悬停图解指引「如何打开 AGY 控制台」，引入双屏 Z-Order 严格后置熔断与中文配额弹窗避让。",
    ],
  },
  {
    version: "1.0.6",
    date: "2026-11-21",
    title: "GPU 硬件加速贴背、VSync 跟窗与 10 项上下文圆环精度修复",
    items: [
      "贴背伴侣升级硬件加速渲染与 VSync 原子同步跟窗，补全异常退出自动还原主窗不透明度。",
      "修复 CHECKPOINT 摘要占比虚高、纯文本对话借用他会话速率及新建空白对话重置 0% 等 10 项精度问题。",
    ],
  },
  {
    version: "1.0.5",
    date: "2026-11-21",
    title: "子 Agent 实时状态、安全路径校验与多 DPI 稳定性加固",
    items: [
      "接入权威子 Agent 运行状态，修复长任务超 90 秒误判结束与思考标签内容泄露，补全精确行数增减统计。",
      "强化本地路径安全校验（拒绝 UNC 与可执行文件直开），按会话隔离 Hook 状态并修复多 DPI 灯箱偏移。",
    ],
  },
  {
    version: "1.0.4",
    date: "2026-11-20",
    title: "定时总结默认关闭与状态竞态修复",
    items: [
      "「掌握」页定时总结改为默认关闭、按需开启，统一 PLUGIN_DATA 读取路径并修复中途开启无响应与轮询竞态。",
    ],
  },
  {
    version: "1.0.3",
    date: "2026-11-20",
    title: "原生 100% 不透明 WPF 全窗图片灯箱",
    items: [
      "点击「掌握」页内联图片即可在 Windows 下拉起不透明原生全窗灯箱，支持滚轮缩放、拖拽平移与定位文件目录。",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-11-20",
    title: "「掌握」页内联图片缩略图预览",
    items: [
      "自动提取并内联渲染对话历程中的本地图片预览网格与可缩放预览浮层。",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-11-20",
    title: "顶栏一键自更新、GitHub 入口、跳转会话与防孤儿悬浮窗",
    items: [
      "顶栏新增自动检测更新/一键升级按钮与 GitHub 仓库入口；「掌握」页支持一键跳转原会话，修复重入孤儿 HUD 窗。",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-11-20",
    title: "首个开源正式版",
    items: [
      "首发交付「通用（上下文饼图 / Token 消耗 / 速率与模型对照 / 会话管理）」「掌握（多 Agent 协作网 / 类 Codex 历程）」「美化（撞色主题 / 壁纸 / 贴背伴侣与底部 HUD）」三大模块及全平台一键安装卸载脚本。",
    ],
  },
]);

function normalizeVersionText(v) {
  return String(v || "")
    .trim()
    .replace(/^v/i, "");
}

function compareSemverLocal(a, b) {
  const parse = (v) =>
    normalizeVersionText(v)
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function parseReleaseBodyToItems(bodyText, fallbackTitle) {
  const lines = String(bodyText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) || /^---+$/.test(line) || /^!\[/.test(line) || /^\|/.test(line)) {
      continue;
    }
    const cleaned = line
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    if (cleaned.length >= 4) {
      items.push(cleaned);
    }
    if (items.length >= 6) break;
  }
  if (items.length === 0 && fallbackTitle) {
    items.push(fallbackTitle);
  }
  return items;
}

async function requestChangelogJson(apiFetch, url, options = {}) {
  const fetcher =
    typeof apiFetch === "function"
      ? apiFetch
      : typeof window !== "undefined" && typeof window.sidecar?.fetch === "function"
        ? window.sidecar.fetch
        : null;
  if (!fetcher) {
    throw new Error("请求通道暂不可用");
  }
  const res = await fetcher(url, options);
  if (res && typeof res.json === "function") {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  }
  return res ?? {};
}

export function createChangelogModal({
  apiFetch,
  t,
  initialVersion = "1.1.3",
  onVersionApplied,
  onToast,
} = {}) {
  const modal = document.getElementById("changelogModal");
  const listEl = document.getElementById("changelogList");
  const currentVerBadge = document.getElementById("changelogCurrentVer");
  const footerMetaEl = document.getElementById("changelogFooterMeta");
  const triggerBtn = document.getElementById("changelogBtn");

  let translator = typeof t === "function" ? t : (k) => k;
  let currentVersion = normalizeVersionText(initialVersion) || BUILTIN_CHANGELOG_ENTRIES[0].version;
  let mergedEntries = BUILTIN_CHANGELOG_ENTRIES.slice();
  let isOpen = false;
  let applyingVersion = "";
  let applyingAction = "";
  let remoteFetched = false;
  let destroyed = false;
  const cleanups = [];

  const tr = (key, fallback, vars) => {
    let raw = typeof translator === "function" ? translator(key, vars) : "";
    if (!raw || raw === key) raw = fallback;
    if (!vars) return raw;
    return String(raw).replace(/\{\{?(\w+)\}?\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : ""
    );
  };

  function mergeRemoteReleases(remoteList) {
    if (!Array.isArray(remoteList) || remoteList.length === 0) return;
    const byVer = new Map();
    for (const entry of BUILTIN_CHANGELOG_ENTRIES) {
      byVer.set(normalizeVersionText(entry.version), entry);
    }
    let changed = false;
    for (const rel of remoteList) {
      const ver = normalizeVersionText(rel?.version || rel?.tag);
      if (!ver || byVer.has(ver)) continue;
      const title = String(rel?.title || `v${ver}`)
        .replace(/^v?\d+\.\d+\.\d+\s*[-—–:]?\s*/i, "")
        .trim() || `版本 v${ver}`;
      byVer.set(ver, {
        version: ver,
        date: String(rel?.date || "").slice(0, 10) || "",
        title,
        items: parseReleaseBodyToItems(rel?.body, title),
      });
      changed = true;
    }
    if (changed) {
      mergedEntries = Array.from(byVer.values()).sort((a, b) => compareSemverLocal(b.version, a.version));
    }
  }

  async function syncRemoteReleases({ force = false } = {}) {
    if (destroyed) return;
    if (remoteFetched && !force) return;
    try {
      const data = await requestChangelogJson(
        apiFetch,
        `/api/update/releases${force ? "?force=1" : ""}`,
        { method: "GET" }
      );
      if (destroyed) return;
      remoteFetched = true;
      if (data?.currentVersion) {
        const cleanCur = normalizeVersionText(data.currentVersion);
        if (cleanCur) currentVersion = cleanCur;
      }
      if (Array.isArray(data?.releases)) {
        mergeRemoteReleases(data.releases);
      }
      render();
    } catch {
      // Offline or rate-limited: builtin changelog remains fully usable
    }
  }

  async function handleVersionAction(targetVer, isRollback) {
    if (destroyed || applyingVersion) return;
    const cleanTarget = normalizeVersionText(targetVer);
    if (!cleanTarget) return;

    applyingVersion = cleanTarget;
    applyingAction = isRollback ? "rollback" : "update";
    render();

    const verb = isRollback ? "回退" : "更新";
    onToast?.(`正在从 GitHub 下载并${verb}至 v${cleanTarget}…`, "info");

    try {
      const res = await requestChangelogJson(apiFetch, "/api/update/apply", {
        method: "POST",
        body: JSON.stringify({ targetVersion: cleanTarget }),
      });
      if (destroyed) return;
      if (res && res.ok) {
        const installedVer = normalizeVersionText(res.version || cleanTarget) || cleanTarget;
        currentVersion = installedVer;
        applyingVersion = "";
        applyingAction = "";
        render();
        onVersionApplied?.(res);
        onToast?.(
          `已${verb}至 v${installedVer}！已保留全部配置，请重载插件或重启 Antigravity 生效`,
          "success"
        );
      } else {
        applyingVersion = "";
        applyingAction = "";
        render();
        onToast?.(res?.error || `${verb}至 v${cleanTarget} 失败，请稍后重试`, "error");
      }
    } catch (err) {
      if (destroyed) return;
      applyingVersion = "";
      applyingAction = "";
      render();
      onToast?.(err?.message || `${verb}至 v${cleanTarget} 失败，请检查网络连接`, "error");
    }
  }

  function render() {
    if (currentVerBadge) {
      currentVerBadge.textContent = `v${currentVersion}`;
    }
    if (footerMetaEl) {
      footerMetaEl.textContent = tr("changelog.versionCount", "共 {count} 个版本", {
        count: mergedEntries.length,
      });
    }
    if (!listEl) return;
    listEl.innerHTML = "";

    mergedEntries.forEach((entry, idx) => {
      const isLatest = idx === 0;
      const cmp = compareSemverLocal(entry.version, currentVersion);
      const isCurrent = cmp === 0;
      const isUpgrade = cmp > 0;
      const isRollback = cmp < 0;
      const isApplyingThis = applyingVersion === normalizeVersionText(entry.version);

      const card = document.createElement("article");
      card.className = `changelog-entry${isLatest ? " is-latest" : ""}${isCurrent ? " is-current" : ""}`;
      card.setAttribute("data-version", entry.version);

      const head = document.createElement("div");
      head.className = "changelog-entry-head";

      const headLeft = document.createElement("div");
      headLeft.className = "changelog-entry-tags";

      const verPill = document.createElement("span");
      verPill.className = "changelog-ver-pill";
      verPill.textContent = `v${entry.version}`;
      headLeft.appendChild(verPill);

      if (isLatest) {
        const latestBadge = document.createElement("span");
        latestBadge.className = "changelog-badge is-latest";
        latestBadge.textContent = tr("changelog.latestBadge", "最新");
        headLeft.appendChild(latestBadge);
      }

      if (entry.date) {
        const dateEl = document.createElement("span");
        dateEl.className = "changelog-entry-date";
        dateEl.textContent = entry.date;
        headLeft.appendChild(dateEl);
      }

      const headRight = document.createElement("div");
      headRight.className = "changelog-entry-right";

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.setAttribute("data-changelog-action-version", entry.version);

      if (isCurrent) {
        actionBtn.className = "changelog-ver-action-btn is-current";
        actionBtn.disabled = true;
        actionBtn.setAttribute("data-changelog-action", "current");
        actionBtn.textContent = tr("changelog.currentBadge", "当前版本");
        actionBtn.title = `当前已安装 v${entry.version}`;
      } else if (isUpgrade) {
        actionBtn.className = `changelog-ver-action-btn is-upgrade${isApplyingThis ? " is-busy" : ""}`;
        actionBtn.disabled = Boolean(applyingVersion);
        actionBtn.setAttribute("data-changelog-action", "upgrade");
        actionBtn.textContent = isApplyingThis
          ? tr("changelog.actionUpgrading", "更新中…")
          : tr("changelog.actionUpgrade", "更新");
        actionBtn.title = `点击下载并更新至 v${entry.version}（保留个人配置与规则）`;
        actionBtn.addEventListener("click", () => void handleVersionAction(entry.version, false));
      } else if (isRollback) {
        actionBtn.className = `changelog-ver-action-btn is-rollback${isApplyingThis ? " is-busy" : ""}`;
        actionBtn.disabled = Boolean(applyingVersion);
        actionBtn.setAttribute("data-changelog-action", "rollback");
        actionBtn.textContent = isApplyingThis
          ? tr("changelog.actionRollingBack", "回退中…")
          : tr("changelog.actionRollback", "回退");
        actionBtn.title = `点击下载并回退至历史版本 v${entry.version}（保留个人配置与规则）`;
        actionBtn.addEventListener("click", () => void handleVersionAction(entry.version, true));
      }

      headRight.appendChild(actionBtn);
      head.appendChild(headLeft);
      head.appendChild(headRight);
      card.appendChild(head);

      const titleEl = document.createElement("h4");
      titleEl.className = "changelog-entry-title";
      titleEl.textContent = entry.title;
      card.appendChild(titleEl);

      const ul = document.createElement("ul");
      ul.className = "changelog-entry-list";
      (entry.items || []).forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
      });
      card.appendChild(ul);

      listEl.appendChild(card);
    });
  }

  function open() {
    if (!modal) return;
    render();
    modal.hidden = false;
    isOpen = true;
    if (listEl) listEl.scrollTop = 0;
    if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "true");
    void syncRemoteReleases({ force: false });
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    isOpen = false;
    if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "false");
  }

  if (triggerBtn) {
    triggerBtn.setAttribute("aria-haspopup", "dialog");
    triggerBtn.setAttribute("aria-expanded", "false");
    const onOpen = () => open();
    triggerBtn.addEventListener("click", onOpen);
    cleanups.push(() => triggerBtn.removeEventListener("click", onOpen));
  }

  if (modal) {
    const closeTargets = modal.querySelectorAll("[data-changelog-close]");
    closeTargets.forEach((el) => {
      const onClose = () => close();
      el.addEventListener("click", onClose);
      cleanups.push(() => el.removeEventListener("click", onClose));
    });
  }

  if (typeof document !== "undefined") {
    const onKeyDown = (e) => {
      if (isOpen && e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
  }

  render();

  return {
    open,
    close,
    setCurrentVersion(ver) {
      const clean = normalizeVersionText(ver);
      if (clean && clean !== currentVersion) {
        currentVersion = clean;
        render();
      }
    },
    setTranslator(nextT) {
      if (typeof nextT === "function") {
        translator = nextT;
        render();
      }
    },
    syncRemoteReleases,
    getEntries() {
      return mergedEntries;
    },
    destroy() {
      destroyed = true;
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    },
  };
}
