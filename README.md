# 英语精读（@local/dsh-english-practice）

一个 DSH 持久插件：把播客录音用百炼 `bl speech recognize`（Qwen-Audio filetrans，带说话人分离）转成分角色文稿，在右侧边栏阅读；选中单词或句子后按 **Ctrl** 弹出浮窗（单词显示音标 + 中文释义，句子只显示中文翻译），点浮窗右上角按钮即可加入生词本。生词本保存在工作区，含单词、音标、释义、例句、例句翻译与来源，并导出可读的 Markdown。

## 目录结构

```
<工作区>/
  recordings/                  你放外部录音（插件只读）
  transcripts/<name>.json      归一化文稿（按说话人分段、带毫秒时间戳）
  transcripts/.jobs/           转写任务状态与原始 ASR 结果
  vocab/vocabulary.json        生词本数据源（单词 + 句子两种条目）
  vocab/生词本.md              每次变更后自动重写的导出
  .dsh-english/config.json     可选：覆盖默认配置（见下）
  .dsh-english/lookup-cache.json  查词缓存
  plugin/                      插件源码（本目录）
```

## 使用

1. 把录音放进 `recordings/`（mp3 / m4a / wav / aac / flac / ogg / opus / amr / wma / mp4 / webm）。
2. 打开右侧边栏：会话头部工具条上的**耳机按钮**，或右侧栏 guide 里的「英语精读」卡片。
   面板顶部的 **A− / A+** 分别调整「文稿」和「生词本」的字号（12–20px，各自记住上次的值）。
3. 文稿视图里点「转写录音」：
   - 默认列出工作区 `recordings/` 里的音频；
   - 也可以直接粘贴**任意文件夹或音频文件的绝对路径**，点「扫描」列出其中的音频（支持 mp3/m4a/wav/aac/flac/ogg/opus/amr/wma/mp4/webm）；
   - 或点「选择文件夹…」用系统目录选择器挑选文件夹。
   选好文件、可选填说话人数，点「开始转写」，等 1–3 分钟；完成后自动出现文稿。
   也可以直接在对话里说「转写 recordings/xxx.m4a」或给绝对路径，助手会调用 `english_transcribe`。
   - 另外可以点「**导入文稿**」直接导入本地文件（`.txt` / `.md` / `.markdown` / `.html` / `.htm` / `.tex` / `.rst` / `.log` ≤3MB，或 `.pdf` ≤20MB）：
     - HTML 去标签、Markdown 去标记；
     - TeX 去命令并**保留 `$…$` 公式**（侧边栏渲染上下标、分数、根号）；
     - **PDF 直接在侧边栏按页显示**（本机 `pdftoppm` 渲染页面图 + `pdftotext -bbox` 生成词坐标文本层），
       可以像普通文稿一样划词按 Ctrl 查词、加生词本，已收录词同样有虚线标记；
     - 导入的文稿没有说话人和时间戳，也不显示「合并短句」。
4. 在文稿里选中单词或句子，按 **Ctrl**（macOS 可用 **Cmd**）：
   - 单词/短语（≤4 个词）：浮窗显示音标 + 1–3 条中文释义；
   - 句子：浮窗只显示中文翻译。
   - 文稿中**已收进生词本**的单词/短语带**虚线**标记；选中它们时浮窗直接使用生词本里的音标/释义/翻译，
     **不再调用模型**（新词仍会查询一次，结果也会进缓存）。
5. 点浮窗右上角按钮加入生词本（重复内容不会重复入库）。单词条目会自动带上：
   - **词形**：不同词性（名词/动词/形容词/副词…）和不规则形式（过去式、过去分词、复数、比较级、最高级、现在分词、第三人称单数等，最多 6 条）；
   - **词源**：来源语言 + 词根/词缀拆解（例如 nostalgia = 希腊语 nostos「返乡」+ algos「痛苦」）+ 一段中文词源说明。
   老词条若没有这些字段，卡片上会出现「补全词形/词源」按钮，点一下重新查询并补全。
6. 生词本视图支持搜索、按单词/句子过滤、删除；查词失败时条目以「待补全」入库，
   在对话里说「补全生词本」，助手会读取 pending 条目并写回音标/释义/翻译。
7. 文稿标题旁还有「合并短句」和「删除」：删除需要再点一次「确认」，只删 `transcripts/<name>.json`
   与对应的任务记录，不会删除你的录音文件。

## 配置（可选）

`.dsh-english/config.json`（不存在时使用默认值）：

```json
{
  "blPath": "bl",
  "asr": {
    "model": "qwen-audio-3.1-asr-flash-filetrans",
    "fallbackModel": "fun-asr",
    "language": "en",
    "maxJobMinutes": 30,
    "pollIntervalSeconds": 2,
    "mergeGapMs": 4000
  },
  "lookup": {
    "backend": "ds",
    "provider": null,
    "model": null,
    "timeoutMs": 15000
  },
  "dirs": {
    "recordings": "recordings",
    "transcripts": "transcripts"
  }
}
```

- `lookup.backend`：`ds`（默认，调用 DSH 当前默认模型，进程内、快）或 `bl`（`bl text chat`）或 `off`。
- `asr.model` 失败会回退 `asr.fallbackModel`，并记录在文稿的 `warnings` 里。
- 转写时同一说话人、停顿不超过 `asr.mergeGapMs`（默认 4000ms）的相邻短句会自动合并成段落；已转好的老文稿可在文稿标题旁点「合并短句」重新整理。
- 面板的「转写录音」里可以选模型（默认 `qwen-audio-3.1-asr-flash-filetrans`，列表由 Host 提供，可在配置里改默认值）。
- 首次转写会按需创建 `recordings/`、`transcripts/`、`vocab/`、`.dsh-english/`。

## 前置与计费

- 需要本机 `bl`（百炼 CLI）已登录：`bl auth status`。转写会调用百炼语音识别并按其价格计费；
  音频会先上传到百炼临时存储（48h）。`lookup.backend = "bl"` 时查词同样走百炼文本模型。
- 默认查词走 DSH 模型（`ctx.llm`），不额外消耗百炼文本额度。

## 助手工具

- `english_transcribe { audio, speakers?, model?, language? }`：转写并等待完成，返回文稿路径、段数与说话人数。
- `english_vocab { action: list|lookup|add|update|remove|export, ... }`：
  `list` 默认列待补全条目；`update` 用于助手自己补全音标/释义/例句翻译；`export` 重写 `vocab/生词本.md`。

面板通过插件自建的 `POST /dsh-english/api`（仅接受同源请求，带 `x-english-practice: 1` 头）调用同一套 Host 实现；助手通过上面的工具调用。面板的轮询走这个 HTTP 路由，不会在会话里产生命令记录。

## 开发备注

- Host 半（`index.js`）改动后，需要让插件行重启才会加载新代码：
  `plugin_manager` 用 `set_plugin` 对 `include:english-practice` 关闭再开启即可（或重启 DSH）。
- Client 半（`client.js`）改动后，插件行重启会让页面加载新的 bundle；必要时刷新页面。
- 卸载：`plugin_manager` `remove_bundle`（数据文件保留）。
