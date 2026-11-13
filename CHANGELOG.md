# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-11-13

### Added

- 顶部工具栏新增「**跨项目**」开关（不新增视图）：打开后当前项目成为**共享库**，所有项目共用它的文稿、生词本、背记进度、查词缓存、录音与 PDF 页；关闭后各项目立即回到自己的数据，不复制、不移动、不删除任何文件。换库方式为关闭后到目标项目重新打开。
- 全局设置文件 `~/.dsh/english-practice.json`（存在 `DSH_HOME` 时以它为准，版本 1，`sharedRoot` 为绝对路径或 null）；开关只在当前会话工作区打开，不接受任意路径，共享库缺失时数据 action 返回 `library/unavailable`，开关仍可关闭。
- 新增 HTTP action `library.status` / `library.set`、`transcripts.read` / `vocab.read` / `pdf.page`，以及错误码 `library/invalid` / `library/unavailable` / `library/busy` / `library/settings-failed`；有转写任务进行中时拒绝切换（`library/busy`，409）。
- 新增 `host/library.js`（全局设置读取/写入、有效根解析、状态与目录探测）与 `tests/library.test.mjs`、`tests/library-integration.test.mjs`；`env.check` 新增 `library` 字段，环境自检卡显示共享库路径、目录与可写性。

### Changed

- 有效根概念：开启共享时所有文稿/生词/背记/图谱/转写/PDF/配置都走共享库目录；关闭时走当前项目。后台多义分析按有效根去重，切换共享库时清空调度状态。
- 客户端读取文稿、生词本 JSON 与 PDF 页图不再走会话工作区的 `workspaceFiles`，改走插件自己的 HTTP 读取（`transcripts.read` / `vocab.read` / `pdf.page`），因此共享库在别的项目时也能正常读取；PDF 原文件「DSH 预览」只在共享库所在项目显示，页图阅读不受影响。
- 客户端不再声明已用不到的 `remote` / `remote.workspaceFiles` 依赖；`package.json#dsh.client.inject` 同步移除 `@deepseek-ai/dsh-api-remotes` 与 `@deepseek-ai/dsh-api-workspace-files`。
- 面板顶部 4 秒轮询同时同步共享库开关状态；共享库不可用时在工具栏下方显示可关闭的警告条。

### Security

- 共享库路径只能由 `library.set` 从当前会话工作区写入，工作区内的 `.dsh-english/config.json` 不能重定向数据根；`pdf.page` 只允许读取 `.dsh-english/pdfs/<uuid>/page-<n>.png` 并做工作区包含校验；`transcripts.read` 继续使用文件名校验。
- 共享库设置写入使用同一把按路径串行锁与原子写；多个 DSH 实例同时写同一共享库为 best-effort（原子写、后写覆盖）。

## [0.2.0] - 2026-11-13

### Fixed

- **文稿视图记住上次打开的那一篇**：面板重开、刷新页面或切换会话时，不再自动跳到最新转写的一篇，而是回到浏览器本地记录的「上次打开」；只有这一篇已被删除或不在当前工作区时，才回退到最新一篇（下拉框手动切换同样会被记住）。
- **超时兜底定时器不再被事件循环提前丢弃**：多义分析的单次模型调用与 HTTP 网关请求靠 `setTimeout` 兜底；此前 `unref()` 会让没有其它活动句柄的进程（Linux CI、headless、一次性脚本）在定时器触发前退出，导致超时永远不生效、测试被取消。现在这两个兜底定时器保持引用；后台分析调度器与 ASR 心跳仍按设计 `unref()`。
- **Linux CI 恢复全绿**：`tests/config.test.mjs` 的可执行路径断言改为按平台选择绝对路径（Windows 用 `C:\...`、POSIX 用 `/usr/...`），Windows 路径在 POSIX 上按「相对路径」拒绝；配合上一条，之前被取消的 15 个分析测试恢复运行。
- **生词本重复释义合并**：词典释义与多义分析给出的近义条目不再并排显示。按中文义项片段折叠——片段集合相同或一条被另一条完全覆盖时视为同一条释义，保留更完整的写法并把缺失的例句/来源回填（例如 `v. 介入；干预；调停` 吸收 `v. 介入；干预` 与 `n. 干预；介入`，`n. 丑闻` 与 `n. 丑闻（尤指性丑闻）` 合并，`风流韵事；婚外情` 与 `婚外情；风流韵事` 合并）；跨词性只在片段集合严格包含时合并，`n. 增加` / `v. 增加` 这类同词不同性的义项保持独立。规则实现在 `host/text.js`（`collapseMeanings` / `mergeMeaningPair`），写入（`normalizeMeanings`、`mergeSenses`）、`vocab/生词本.md` 导出与 `english_vocab list` 返回都走同一份实现；`client.js` §3 有同规则的展示副本，作用于生词卡、背记卡、图谱详情与查词浮窗，历史重复数据不再显示（下次改写该词条时落盘收敛）。

### Added

- 新增面板第四个视图「**图谱**」：用只读关系图展示**文稿 ↔ 单词**与**单词 ↔ 单词**的联系，全部由工作区数据现算（不调用模型、不写任何文件、不新增数据格式与配置项）。四类联系：`appears`（词及其词形按整词命中统计出现次数，同一句重复出现也按多次计；单词被收录时所在的那篇标为「来源」并带例句，其它文稿显示出现次数）、`cooccur`（两个词在同一句里共现）、`morph`（共享有意义的词源词根，或一个词形出现在另一词条的词形表里）、`sense`（共享中文义项片段）。词形匹配按整 token 归一（大小写、撇号、连字符、多词短语），同根过滤 `ad-` / `in-` 等词缀噪音。
- 图谱交互：Canvas 2D + 自写力导向布局（零依赖、零构建）；拖动节点、滚轮或按钮缩放、复位视图、按联系类型筛选（全部 / 文稿-单词 / 单词-单词）、搜索并居中、「只看这篇文稿」、点击节点查看释义 / 掌握度弧环 / 例句 / 关联清单，并可从详情「打开文稿」跳回文稿视图；节点与链接有上限（400 词 / 80 篇文稿 / 2M 字符预算 / 每词 appears 12 条、cooccur 8 条），节点超限按关联度保留、链接超限按稳定顺序截断，并在面板提示；配色经 `getComputedStyle` 读取宿主主题变量，深浅色自动跟随。
- 新增只读 HTTP action `graph.overview`（网关预算 30s、只读去重）与 `host/graph.js`（纯函数 `buildGraph` + 只读服务 `createGraphService`，复用 `host/senses.js` 的切句与词形）；新增 `tests/graph.test.mjs`，契约测试新增 `REQUIRED_GRAPH_KEYS`，集成测试新增 `graph.overview` HTTP 子测试。

## [0.1.1] - 2026-11-12

### Added

- README 开头新增精简版「让 Agent 带你跑起来」引导：短提示词只保留索引、边界与三段回报，详细步骤拆到 `AGENT_ONBOARDING.md` / `AGENT_ONBOARDING.zh.md`，按链接、raw URL 或挂载文件读取。
- 新增「背记」视图：把生词本单词做成 **英→中 / 中→英 / 混合** 三种方式的主动回忆练习，按「忘记 / 模糊 / 记得 / 熟练」自评更新掌握度 0–5，并按 1 / 1 / 2 / 4 / 7 / 15 天安排下次复习；每天首次打开生成**当天固定一轮**（到期词优先 + 每日新词上限 + 总题量上限，当天不重排），答题卡支持「**显示例句**」提示（中→英时把目标词挖空成等长下划线），答完显示完成情况、连续天数、最近 14 天记录；「掌握情况」是**独立页面**（顶部「今日复习 / 掌握情况」标签切换），表格按掌握度排序列出单词 / 掌握度进度条 / 等级 / 下次复习 / 操作（各列左对齐），可单个或全部重置；进度存于 `.dsh-english/recall.json`，删除生词本词条后自动清理。
- 新增 HTTP action `recall.overview` / `recall.grade` / `recall.reset`，新增配置 `recall.newPerDay` / `recall.dailyLimit` / `recall.mode`（默认 10 / 30 / `mix`）与错误码 `recall/invalid`、`recall/not-found`；面板视图切换变为「文稿 / 生词本 / 背记」三视图。
- 生词本**自动多义分析**：后台在插件空闲（最近 `analysis.idleMinutes` 内没有插件请求）时扫描当前工作区的全部文稿，找出每个单词在各文稿里的真实用法，调用查词后端把「别的文稿里的其它意思」追加进词条；新义项带 `example` 语境例句与 `source` 来源证据，既有释义只补证据不覆盖，最多保留 8 条，上下文不足 2 条时只标记跳过、不调用模型。只在语料/词形/原例句变化或失败重试窗口到期后才重新分析，不重复消耗模型；后台每批最多 `analysis.batchWords` 个词、批间 20s，避免影响前台使用。
- 生词卡新增多义展示与「分析多义」按钮；新增 HTTP action `vocab.analyze` 与 agent 工具动作 `english_vocab { action: "analyze" }`；新增 `host/senses.js`（语料切句/命中、上下文收集、提示词、结果归一化、义项合并、语料指纹）与 `host/analysis.js`（分析流水线 + 空闲调度）。
- 新增可选数据字段 `meanings[].example` / `meanings[].source` / `entry.analysis`（`version` 仍为 1；旧数据与旧客户端不受影响），新增配置 `analysis.*`（`enabled` / `idleMinutes` / `batchWords` / `maxContexts` / `maxContextChars` / `timeoutMs` / `retryMinutes`）与错误码 `analysis/disabled`。

## [0.1.0] - 2026-11-11

首个正式发布：DSH「英语精读」持久插件（npm 包名 `dsh-increasing-my-english`）。
First public release of the DSH "English Practice" plugin (npm package `dsh-increasing-my-english`).

### Added

- 右侧边栏「英语精读」面板：文稿阅读、生词本、PDF 分页阅读，会话头部与侧栏入口均可打开。
- 播客转写：`bl speech recognize`（Qwen-Audio filetrans，说话人分离）+ 主备模型回退、任务状态机与落盘恢复、进程树取消、同说话人短句自动合并。
- 划词查词：选中单词/短语（≤4 词）或句子后按 Ctrl（macOS ⌘），单词显示音标 + 中文释义，句子只显示中文翻译；已收录词命中生词本、不再调用模型，新词结果写入查词缓存。
- 生词本：单词/句子条目、搜索与过滤、删除、「待补全」状态与补全提示；单词自动带**词形（最多 8 条）**与**词源**（来源语言 + 词根词缀 + 中文说明），支持按 id **enrich** 重新查询补全；自动导出 `vocab/生词本.md`。
- PDF 导入：`pdftoppm` 渲染页图 + `pdftotext -bbox` 生成词坐标文本层，按页划词查词；文本导入支持 `.txt` / `.text` / `.md` / `.markdown` / `.html` / `.htm` / `.tex` / `.rst` / `.log`。
- 环境自检（`env.check`）：检测 `bl`（存在/版本/登录态）、poppler 与工作区可写性，缺失时给出一键复制的安装/登录命令。
- 两个 agent 工具：`english_transcribe`、`english_vocab`（`list / lookup / add / update / enrich / remove / export`）。
- 可选配置 `.dsh-english/config.json`（asr / lookup / import / dirs）；zh/en 双语界面；同源 HTTP 路由 `POST /dsh-english/api`。

### Changed

- Host 半拆分为 `host/*` 多模块（`index.js` 只做组装）：配置校验与合并、路径安全、原子 JSON 存储与串行写锁、文本清洗、PDF 解析、文稿归一化、ASR 任务、查词、词条规范化、环境自检、action 分发表与 HTTP 网关。
- Client 半按 §0–§9 分区重排：轮询治理（变化才 setState、in-flight 守卫、页面隐藏跳过、失败退避、终态后忽略迟到响应）、真取消（卸载即 abort）、长文稿视口切片与 memo、PDF 页懒加载、错误码到本地文案的映射。
- 查词超时默认值统一为 **20000ms**；词形上限由 6 条提高到 **8 条**。
- 配置中的可执行文件不再可配置（见 Security），PDF 相关配置改为 `import.maxPdfPages` / `import.dpi`。

### Fixed

- 转写任务取消/重启后的状态恢复、UTF-8 跨 chunk 解码、BOM 与损坏 JSON 的备份恢复。
- 同名文稿重复转写、删除文稿后残留的任务记录、大输出时的 stdout 截断。
- 查词失败、配置非法值、未知配置键统一由错误码与 warnings 呈现，不再静默失败。

### Security

- 修复 `transcripts.delete` 的 `pdfId` **越界删除**：`pdfId` 必须是 UUID，解析后必须位于 `<workspace>/.dsh-english/pdfs` 内，且 `lstat` 必须是真实目录（拒绝符号链接），统一走安全删除。
- 修复**可执行路径注入面**：移除 `config.json` 里的 `blPath` / `import.pdfToPpmPath` / `import.pdfToTextPath`，`bl` / `pdftoppm` / `pdftotext` 只能由只读环境变量 `DSH_ENGLISH_BL` / `DSH_ENGLISH_PDFTOPPM` / `DSH_ENGLISH_PDFTOTEXT` 覆盖，且拒绝含空格、参数或 shell 元字符的值；避免工作区可写配置变成执行入口。
- 路径与文件名加固：`..` 规范化 + 工作区包含检查，拒绝 Windows 保留名与尾点/尾空格，文件名用 `wx` 原子占位消除 TOCTOU。
- HTTP 网关仅回环地址、`Origin`/`Host` 同源校验 + 自定义请求头，限流、请求体上限与对外脱敏文案。

[Unreleased]: https://github.com/LeeKai233/dsh-increasing-my-english/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/LeeKai233/dsh-increasing-my-english/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/LeeKai233/dsh-increasing-my-english/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/LeeKai233/dsh-increasing-my-english/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/LeeKai233/dsh-increasing-my-english/releases/tag/v0.1.0
