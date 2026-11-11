# AGENTS.md — 维护 dsh-increasing-my-english

DSH 持久插件「英语精读」：把播客录音用百炼 `bl speech recognize` 转成分角色文稿，在右侧边栏阅读；
选中单词或句子按 Ctrl 查词并收进生词本。Host 半（Node）提供 agent 工具与同源 HTTP 接口，Client 半（浏览器）
是手写 `window.__ModuleLoader__.load` bundle。

## 架构决策（不要推翻）

1. **零构建**：没有 TypeScript、没有打包器、没有运行时依赖。Host 用 ESM 多文件，Node 直接加载；
   `client.js` 必须保持单文件（`__ModuleLoader__` factory 拿不到相对 import），靠严格分区而不是拆文件。
2. **稳定标识不随包名改**：`.dsh-english/`、`/dsh-english/api`、`x-english-practice` 请求头、
   工具名 `english_transcribe`/`english_vocab`、tab kind `english-reader`、locale NS `englishPractice`、
   patch 行 id `english-practice`。用户数据与既有行为依赖它们。
3. **数据格式冻结**（`version: 1`）：`vocab/vocabulary.json`、`transcripts/*.json`、`transcripts/.jobs/*.json`、
   `.dsh-english/{config.json,lookup-cache.json,pdfs/}`。只允许新增可选字段；损坏时备份为 `*.corrupt-<ts>`。
4. **不迁移 Typert Remote API**（需要 TS 装饰器与代码生成产物），HTTP 路由靠同源校验加固。
5. **本地开发包名**：`package.json` 在开发期间保持 `@local/dsh-english-practice`（桌面 profile 以 link: 安装）。
   发布提交会统一改成 `dsh-increasing-my-english`（package.json、cordis.patch.yml、client.js 的 PKG 与 loader id、locale meta）。

## 目录结构（目标态）

```
index.js            export name / inject / apply(ctx)：只做组装
host/config.js      默认配置、校验、合并
host/paths.js       工作区路径校验、安全删除、文件名分配、DomainError/fail 领域错误原语
host/json-store.js  原子写、损坏备份、串行写锁、vocab/cache 读写
host/text.js        实体解码、HTML/Markdown/TeX 清洗、段落切分
host/pdf.js         pdftotext -bbox 解析、行分组、PDF 渲染（poppler 预检）
host/transcript.js  文稿归一化、合并、列表、导入、删除
host/asr.js         转写任务状态机、落盘、恢复、进程树取消
host/lookup.js      查词提示词、ds/bl 后端、结果归一化、缓存、整句翻译
host/vocab.js       词条规范化（唯一实现）、增删改查、Markdown 导出
host/env.js         环境自检（bl / poppler / 工作区）、唯一子进程 runner（StringDecoder、进程树 kill）
host/api.js         action 分发表 + HTTP 网关（校验、限流、错误码、脱敏）
host/tools.js       两个 agent 工具的注册、schema、render
client.js           单文件浏览器 bundle（见下方分区）
locale/{zh,en}.json 插件页展示元数据（meta.title / meta.description），不是运行时 i18n
icon.svg            插件页图标
assets/             文档图片（npm 包内也收录，保证 README 在 npm 页面不裂图）
tests/              node --test（零依赖）
```

`client.js` 分区与依赖方向（编号小的不得引用编号大的）：

```
§0 常量 / PKG / ID
§1 运行时 i18n（zh / en 字典，经 ctx.locale.register）
§2 styles
§3 纯函数（时间、格式化、高亮、数学公式、选区清洗）
§4 api 网关（唯一 fetch/poll/abort 出口）
§5 纯组件（弹窗、生词卡、PDF 页、按钮）
§6 hooks（usePolling / useSelectionLookup / useTranscript）
§7 视图（转写面板、文稿、PDF、生词本、环境自检卡）
§8 ReaderPanel 组装
§9 注册（locale / sidebarRightTabs / slots / 会话头按钮）
```

## 开发回路

- 改 Host：DSH 重启后生效（桌面版退出重开；CLI/`dsh web` 重启进程）。
- 改 Client：刷新页面即可（bundle 按包解析，内容变化后页面重新拉取）。
- 改 `package.json` 的 `dsh` 清单或 `cordis.patch.yml`：需要重启 DSH。
- 自检：`npm run check`（`node --check` 两个入口 + `node --test` 自动发现 `tests/*.test.mjs`；需要 Node 20+）。

## 冻结契约（Host ↔ Client ↔ 工具）

### HTTP

`POST /dsh-english/api`，请求头 `content-type: application/json` + `x-english-practice: 1`。
鉴权：仅回环地址 + `Origin`/`Host` 为本地 + 会话必须在线。请求体上限 32MB（各 action 另有上限），网关超时默认 60s、`transcripts.import` 300s（覆盖 pdftoppm 180s + pdftotext 120s，客户端预算必须同步），限流 30 req/s（突发 60）。

请求：`{ action: string, sessionId: string, payload: object }`

成功：`200 { ok: true, value: any }`
失败：`{ ok: false, code: string, message: string, params?: object }`
状态码：400 `http/*`、403 `http/forbidden|http/origin`、404 `*/not-found`、409 `session/unavailable`、
413 `*/too-large`、429 `http/rate-limited`、500 `internal`（对外只回脱敏文案）。

错误码（新增码必须实现方与消费方同时加）：

```
http/method http/forbidden http/origin http/bad-json http/too-large http/rate-limited internal
session/unavailable action/unknown config/invalid path/invalid path/outside-workspace
bl/missing bl/not-authenticated bl/failed
pdf/poppler-missing pdf/render-failed pdf/too-large
transcript/not-found transcript/invalid-name transcript/invalid-format transcript/empty
import/unsupported-format import/too-large import/empty
lookup/failed vocab/invalid-entry vocab/not-found job/not-found job/failed
```

### actions

| action | payload | value |
|---|---|---|
| `transcripts.list` | `{}` | `[{file,title,audio,createdAt,durationMs,speakers[],segments,model,imported?,pdf?}]` |
| `transcripts.merge` | `{file}` | `{file,before,after,changed}` |
| `transcripts.import` | `{name, content?, contentBase64?}` | `{file,segments,pages}` |
| `transcripts.delete` | `{file}` | `{file,deleted}` |
| `recordings.list` | `{}` | `[{name,path}]` |
| `browse.list` | `{path}` | `{kind:'dir'|'file',dir,files:[{name,path}]}` |
| `models.list` | `{}` | `{models[],defaultModel,fallbackModel}` |
| `lookup` | `{kind:'word'|'sentence', text, sentence?}` | `{ok,kind,text,ipa?,meanings?,family?,etymology?,sentenceZh?,translation?,cached}`（失败 `{ok:false,message}`） |
| `vocab.add` | `{kind, word?, text?, ipa?, meanings?, sentence?, sentenceZh?, family?, etymology?, translation?, source?}` | `{duplicate,id,entry}` |
| `vocab.remove` | `{ids[]}` | `{removed}` |
| `vocab.enrich` | `{id}` | `{entry}` |
| `transcribe` | `{audio, speakers?, model?, language?}` | `{jobId,transcript}` |
| `job` | `{id}` | `{jobId,state:'queued'|'running'|'done'|'failed',transcript?,error?,warnings?,segments?,speakers?,durationMs?,heartbeatAt?}`；未知 id 直接 404 + `job/not-found` |
| `env.check`（新增） | `{}` | `{workspace:{root,writable,transcripts,vocab,recordings}, bl:{present,version?,authenticated?,message?}, pdf:{present,tool,message?}, warnings:string[]}` |

### agent 工具

- `english_transcribe { audio, speakers?, model?, language? }` → `{ok,jobId,transcript,segments,speakers,durationMs,model,warnings,state,error?}`；
  失败必须带可操作信息（bl 缺失/未登录时给安装或登录命令）。
- 工具注册只接受静态 `timeoutMs`：注册时取默认值（`asr.toolTimeoutMinutes` 默认 32 分钟），工作区配置载入后更新已注册定义对象上的 `timeoutMs`（宿主每次调用读取该定义）。
- `english_vocab { action: list|lookup|add|update|enrich|remove|export, ... }`；
  `output.schema` 必须覆盖 render 实际读取的 `result/words/sentences/removed/updated/entries/total/pending/path/duplicate`。

### 配置 `.dsh-english/config.json`

不存在时用默认值；未知/过时键忽略并由 `env.check` 提示。**不得**再接受可执行路径：
`bl`、`pdftoppm`、`pdftotext` 只能通过环境变量 `DSH_ENGLISH_BL` / `DSH_ENGLISH_PDFTOPPM` / `DSH_ENGLISH_PDFTOTEXT` 覆盖（绝对路径或纯命令名）。

```json
{
  "asr": { "model": "qwen-audio-3.1-asr-flash-filetrans", "fallbackModel": "fun-asr", "language": "en", "maxJobMinutes": 30, "pollIntervalSeconds": 2, "mergeGapMs": 4000, "toolTimeoutMinutes": 32 },
  "lookup": { "backend": "ds", "provider": null, "model": null, "timeoutMs": 20000 },
  "import": { "maxPdfPages": 120, "dpi": 100 },
  "dirs": { "recordings": "recordings", "transcripts": "transcripts" }
}
```

## 测试

- 只使用 `node:test` + `node:assert/strict`，不引入依赖。
- 纯逻辑（text/pdf/transcript/vocab/json-store/paths/config/asr 状态机）必须有单测。
- 契约测试：`client.js` 里出现的 action 名集合与 `host/api.js` 分发表一致；`client.js` 的 loader id 与 `package.json#name` 一致。

## 发布流程（维护者）

1. `npm run check` 全绿。
2. 统一改名（package.json、cordis.patch.yml、client.js 的 PKG 与 loader id、locale meta），`git commit`。
3. `git tag -a vX.Y.Z` → push → GitHub Release（附 `npm pack` 产物）。
4. `npm login` 后 `npm publish`；npm 页面会同步显示 README（`assets/` 已随包发布）。
5. 桌面 profile 由 Electron 独占：换名/换源走插件页（移除 → 添加），不要手工改 manifest，除非已备份。

## 非目标

- 不引入构建步骤、TypeScript、打包器或运行时依赖。
- 不改数据格式。
- 不把 HTTP 接口改成 Typert Remote。
- 不收集任何遥测。