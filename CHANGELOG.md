# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- README 开头新增精简版「让 Agent 带你跑起来」引导：短提示词只保留索引、边界与三段回报，详细步骤拆到 `AGENT_ONBOARDING.md` / `AGENT_ONBOARDING.zh.md`，按链接、raw URL 或挂载文件读取。

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
