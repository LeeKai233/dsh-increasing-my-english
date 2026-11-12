# Agent 引导 — 英语精读（dsh-increasing-my-english）

这份文件是给 AI Agent 看的。当用户发送 README 里的设置提示词时，读这份文件并照着做。能自己做的自己做，只把必须用户动手的事交还给他。用用户的语言回复。

## 目标结果

用户最终得到：

- 当前工作区里有 `recordings/`、`transcripts/`、`vocab/`；
- 百炼 CLI 已安装并登录，或有一个清楚、可操作的阻塞原因；
- poppler 已安装（只在能装时；只影响 PDF 导入）；
- 如果 `recordings/` 里有还没转写的音频，最新的一条已转写成文稿；
- 生词本里 pending 的条目已补全，所有过期单词的多义分析已跑完（按 `remaining` 重复调用到 0；补全 `meanings[].example` / 新义项），`vocab/生词本.md` 已导出；
- 生词本里的单词可以在面板第三个视图「背记」里每天做一轮主动回忆（英→中 / 中→英 / 混合），掌握度与进度纯本地保存在 `.dsh-english/recall.json`；
- 一份短回报：只剩哪些必须用户做，以及一个 10 分钟阅读任务。

## 边界

你可以自己做：

- 检查工作区、跑下面的命令；
- 缺什么装什么（百炼 CLI、poppler）；
- 在后台启动 `bl auth login --console` 并等待；
- 建工作区目录；
- 只转写一条最新且未转写的录音；
- 补全生词本 pending 条目、把多义分析跑到没有过期词并导出；
- 按第 5c 节提醒用户去做今天的一轮背记（背记没有 agent 工具，进度由面板维护）；
- 回报。

必须停下来问（或直接告诉用户点哪里）：

- 在插件页安装/启用插件；
- 在浏览器里完成登录和授权；
- 安装器的 UAC/管理员弹窗；
- 重启 DSH；
- 任何破坏性操作，或第二条转写。

绝不做：

- 手改 DSH 桌面 profile 或插件 manifest；
- 删除、移动或改写用户的音频、文稿、已有词条；
- 手动编辑 `.dsh-english/recall.json` 或替用户答题、改背记进度；
- 把工作区内容发到别处（百炼 ASR 和插件自身的 DSH 查词除外）；
- 打印、保存或回显 API Key 或其他凭据；
- 额外安装百炼 skills（`bl skill init`）；CLI 本身就够了；
- 自己重启 DSH；
- 编造结果。失败就给真实命令、错误码和修法。

## 第 1 步 — 检查插件工具

看工具列表里有没有 `english_transcribe` 和 `english_vocab`。

- 有：继续第 2 步。
- 没有：插件没装或没启用。告诉用户：
  1. 在 DSH 里打开侧栏 →「插件」→「添加插件」；
  2. 输入 `dsh-increasing-my-english`，安装并启用；
  3. 如果插件页要求重启，或这个对话里仍没有工具，新开一个对话重发设置提示词。

  然后继续第 2–4 步（这些不需要插件）。跳过第 5 步，并在回报里说明。

## 第 2 步 — 准备工作区

在当前工作区里建好这些目录（不存在就建）：

```text
recordings/
transcripts/
vocab/
```

不要删除或覆盖已有文件。插件默认用这三个目录；如果 `.dsh-english/config.json` 存在并改过 `dirs.recordings` 或 `dirs.transcripts`，按配置走。

## 第 3 步 — 百炼 CLI

运行：

```bash
bl --version
bl auth status --output json
```

### 3a. `bl` 缺失

按 <https://bailian.aliyun.com/cli/install.md> 安装。

- Node.js >= 18.17 且 npm 可用时：

```bash
npm i -g bailian-cli --registry=https://registry.npmmirror.com
```

  npmmirror 镜像给中国大陆网络用；不带镜像的 `npm i -g bailian-cli` 也可以。
- 否则用官方二进制安装脚本：
  - Windows PowerShell：`irm https://bailian.aliyun.com/cli/install.ps1 | iex`
  - macOS/Linux：`curl -fsSL https://bailian.aliyun.com/cli/install.sh | bash`

只装 CLI；不要执行 `bl skill init` 或安装百炼 skills。

用 `bl --version` 验证并回报真实版本。装完 shell 找不到 `bl` 时，检查 `npm prefix -g` 和 `where.exe bl`（macOS/Linux 用 `which bl`），后续检查用绝对路径。

### 3b. `bl` 未登录

1. 在后台终端启动 `bl auth login --console`。
2. 告诉用户浏览器已打开（或转述 CLI 输出里的 URL），需要他完成登录和授权。
3. 等它结束，再跑一次 `bl auth status --output json`。
4. 只回报 masked/登录状态字段；绝不要回显 API Key。

### 3c. 刚装好 `bl` 之后

DSH 进程可能在安装前就启动了，插件子进程不一定看得到新的 `PATH`。提醒用户：整套设置做完后重启 DSH（桌面版退出重开；CLI/`dsh web` 重启进程），然后重发提示词。不要自己重启 DSH。

## 第 4 步 — poppler（只影响 PDF 导入）

运行：

```bash
pdftoppm -v
```

缺失时安装：

- Windows：`winget install -e --id oschwartz10612.Poppler`
- macOS：`brew install poppler`
- Linux：`sudo apt install poppler-utils`

装不上或用户拒绝就说明：转写和查词不受影响，只有 PDF 导入需要 poppler。不要为它阻塞第 5–6 步。和 `bl` 一样，刚装完 poppler 也可能要重启 DSH 插件才看得到。

## 第 5 步 — 准备第一次练习

只在插件工具可用时做。

### 5a. 转写（最多一条）

1. 列出 `recordings/`，只保留支持的音频：`.mp3`、`.m4a`、`.wav`、`.aac`、`.flac`、`.ogg`、`.opus`、`.amr`、`.wma`、`.mp4`、`.webm`。
2. 读所有 `transcripts/*.json`，收集每个文件的 `audio` 字段。
3. 选修改时间最新、且没有被任何现有文稿 `audio` 引用的一条。按工作区相对路径匹配；如果存的是绝对路径，按文件名匹配。
4. 有的话，用 `english_transcribe` 调用：

```json
{ "audio": "recordings/<file>" }
```

这是唯一一次不需要问就授权的转写。等工具完成。

5. 不要启动第二条转写。失败就回报错误和修法；不要重试超过一次。

没有可转写的音频就跳过这一步，让用户往 `recordings/` 里丢一集。

### 5b. 生词本

1. 用 `english_vocab` 列出 pending 条目：

```json
{ "action": "list", "status": "pending" }
```

2. 逐条处理：
   - 单词：先 `{ "action": "lookup", "kind": "word", "text": "<word>" }`，再更新：

```json
{
  "action": "update",
  "entries": [
    {
      "id": "<entry id>",
      "ipa": "<lookup 返回>",
      "meanings": [{"pos": "n.", "zh": "…"}],
      "family": [{"label": "过去式", "form": "…"}],
      "etymology": {"language": "拉丁语", "parts": [{"part": "…", "meaning": "…"}], "explanation": "…"}
    }
  ]
}
```

只补缺失字段，不要覆盖已有内容。lookup 返回的 `ipa`、`meanings`、`family`、`etymology` 形状可以直接用。
   - 句子：先 `{ "action": "lookup", "kind": "sentence", "text": "<sentence>" }`，再更新 `{ "action": "update", "entries": [{ "id": "<id>", "translation": "<lookup 返回>" }] }`。
   - lookup 失败就跳过该条继续，并在回报里说明。

3. 补全释义后，跑多义分析：`{ "action": "analyze" }`。它会对比当前工作区全部文稿里这个单词的用法，把「别的文稿里的其它意思」追加进词条（带语境例句与来源证据，不覆盖已有释义），返回 `{analyzed,updated,added,skipped,failed,remaining,entries}`。
   - 按返回的 `remaining` 重复调用直到 0：一次最多分析 `analysis.batchWords` 个过期词（默认 2 个），词多时要多调用几次。
   - 只分析有变化的词：同一份语料不会重复分析；`skipped` 表示该词在所有文稿里上下文不足 2 条，属正常。
   - 也可以指定单词：`{ "action": "analyze", "id": "<entry id>" }`。
   - 即使你不调用，插件在用户闲置一会儿后也会在后台自动跑（见 `AGENTS.md` 的「后台多义分析」），所以这一步只是让用户马上看到结果。

4. 最后 `{ "action": "export" }`，刷新 `vocab/生词本.md`。即使没有 pending 也要导出。

### 5c. 背记

背记没有 agent 工具，进度由面板维护；你只负责让用户知道可以开始，不要改 `.dsh-english/recall.json`。

1. 读 `vocab/vocabulary.json`，数一下 `kind` 为 `word`、且 `word` 与 `meanings` 都非空的条目——这些才是可背的单词（句子条目不会进入背记）。
2. 告诉用户打开右侧「英语精读」面板顶部的第三个 tab「**背记**」：
   - 每天首次打开会生成**当天固定一轮**：到期该复习的词优先，再用每日新词上限补新词，总题量有上限（默认 `recall.newPerDay` 10、`recall.dailyLimit` 30，可在 `.dsh-english/config.json` 改）；
   - 练习方式有「英→中」「中→英」「混合」三种，面板里可随时切换；
   - 作答后用「忘记 / 模糊 / 记得 / 熟练」自评（快捷键 1–4），系统按掌握度安排下次复习；可随时重置单个词或全部进度。
3. 可背单词为 0 时说明原因（生词本还没有单词条目，或单词条目缺中文释义），请用户先在文稿里查词收词；当天还没有轮次时，加完词再打开背记就会生成新一轮。

### 5d. 阅读任务

- 有文稿：读一下，挑一段 200–400 词（或前 10–20 段）适合 10 分钟读完的内容。告诉用户打开右侧「英语精读」面板，读这一段，选 3–5 个词按 **Ctrl**（macOS 按 **⌘**），读完回来找你。
- 还没有文稿：让用户往 `recordings/` 丢一集并说「转写一下」；等文稿好了再给同样的指令。

## 第 6 步 — 只回三段

用用户的语言，保持简短。

**已完成** — 装了什么/验证了什么（带版本）、建了哪些目录、转写了哪条（或为什么没转）、补了几条生词、导出路径、跳过了什么。

**需要你操作** — 只列只有用户能做的事，每条写清点哪里：

- 百炼的浏览器登录/授权；
- 重启 DSH 让新装的 `bl`/poppler 生效；
- 在插件页添加/启用插件；
- 往 `recordings/` 丢一集；
- 打开右侧「英语精读」面板，在第三个 tab「背记」做今天的一轮；
- 打开右侧「英语精读」面板检查「环境自检」。

不要列你已经做过的事。

**现在开始** — 一个 10 分钟阅读任务：读哪一段、用 Ctrl/⌘ 查哪 3–5 个词、读完做什么（例如「回来找我复盘这些词」）。

## 失败矩阵

| 现象 | 怎么做 |
|---|---|
| 没有 `english_transcribe` / `english_vocab` | 给插件页步骤；继续第 2–4 步；跳过第 5 步。 |
| `bl` 缺失 | 按官方文档、npm 或二进制脚本安装；`bl --version` 验证。 |
| `bl auth status` 显示未登录 | 后台跑 `bl auth login --console`；等浏览器完成；复查。 |
| 没有 Node/npm | 用安装文档里的二进制脚本。 |
| poppler 缺失 | 给平台命令；说明只影响 PDF 导入；不阻塞。 |
| `recordings/` 里没音频 | 让用户加一集；跳过转写。 |
| 音频已转写过 | 不再转写；用现有文稿。 |
| 没有 pending 条目 | 导出，并说明没有要补的。 |
| 背记加载失败 | 让用户先刷新页面重试；仍失败就重启 DSH（Host 改动需重启生效）后重开面板第三个 tab。不要手改 `.dsh-english/recall.json`。 |
| `lookup` 失败 | 跳过该条，继续，回报错误。 |
| 转写失败 | 回报真实错误；不要重试超过一次；不要转另一条。 |
| 需要 PATH/重启 | 把「重启 DSH」写进「需要你操作」；不要自己重启。 |
| 审批/UAC 弹窗 | 告诉用户批准什么；不要绕过。 |

## 幂等

再跑一遍这份引导不能重复劳动：

- 转写前先看 `transcripts/*.json` 的 `audio`；
- 先看 pending 数量再查词；
- 已存在的目录再建是 no-op；
- 重复导出生词本是安全的。

## 安全与隐私

- 没有遥测。文稿、生词本、缓存都留在用户工作区。
- 唯一的外发内容是转写时发给百炼 ASR 的音频，以及插件自身 DSH 查词时发送的文本。不要把工作区内容发到别处。
- 绝不打印、保存或回显 API Key 或凭据。只报 masked 状态。
- 不要改工作区之外的文件、DSH profile 或插件 manifest。
