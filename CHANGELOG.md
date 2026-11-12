# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/LeeKai233/dsh-increasing-my-english/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/LeeKai233/dsh-increasing-my-english/releases/tag/v0.1.0
