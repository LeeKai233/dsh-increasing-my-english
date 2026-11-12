window.__ModuleLoader__.load({
  id: 'dsh-increasing-my-english',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = React

    // ═══════════════════════════════════════════════════════════════════
    // §0 常量 / PKG / ID
    // 符号表：
    //   PKG / NS / KIND / ID / REL — 稳定标识（不改名，用户数据与既有行为依赖）
    //   API_PATH / API_HEADER     — 唯一 HTTP 出口地址与同源校验头
    //   MIN_FONT / MAX_FONT       — 正文字号偏好边界
    //   MIN_ZOOM / MAX_ZOOM / ZOOM_STEP — PDF 缩放偏好
    //   EMPTY_SEGMENTS / EMPTY_PAGES / EMPTY_WORDS — 稳定空数组（memo 依赖不抖动）
    //   TRANSCRIPT_CHUNK          — 文稿视口切片大小
    //   FONT_STORAGE_PREFIX / PDF_ZOOM_STORAGE_KEY / TRANSCRIPT_STORAGE_KEY — localStorage 键
    //   ENV_PLATFORM / ENV_COMMANDS — 环境自检卡里可一键复制的命令（poppler 按平台切换）
    // ═══════════════════════════════════════════════════════════════════
    const PKG = 'dsh-increasing-my-english'
    const NS = 'englishPractice'
    const KIND = 'english-reader'
    const ID = 'english-practice'
    const REL = {
      transcripts: 'transcripts',
      vocab: 'vocab/vocabulary.json',
    }

    const API_PATH = '/dsh-english/api'
    const API_HEADER = { 'content-type': 'application/json', 'x-english-practice': '1' }

    const MIN_FONT = 12
    const MAX_FONT = 20
    const MIN_ZOOM = 0.5
    const MAX_ZOOM = 3
    const ZOOM_STEP = 0.25

    const EMPTY_SEGMENTS = []
    const EMPTY_PAGES = []
    const EMPTY_WORDS = []

    const TRANSCRIPT_CHUNK = 120
    const PDF_LAZY_MARGIN = '700px 0px'

    const FONT_STORAGE_PREFIX = 'english-practice:font:'
    const PDF_ZOOM_STORAGE_KEY = 'english-practice:pdf-zoom'
    // 「上次打开的那一篇」只存浏览器本地：面板重开、刷新页面、换会话都回到同一篇。
    const TRANSCRIPT_STORAGE_KEY = 'english-practice:last-transcript'

    // 图谱（graph）：筛选偏好、宿主主题色变量名（绘制前用 getComputedStyle 解析）、
    // 力导向参数（Fruchterman–Reingold，确定性、可收敛）。
    const GRAPH_FILTER_STORAGE_KEY = 'english-practice:graph-filter'
    const GRAPH_FILTERS = ['all', 'doc', 'word']
    const GRAPH_PALETTE = {
      word: '--dsw-alias-brand-primary',
      transcript: '--dsw-alias-state-warn-primary',
      appears: '--dsw-alias-label-secondary',
      cooccur: '--dsw-alias-brand-primary',
      morph: '--dsw-alias-state-success-primary',
      sense: '--dsw-alias-state-error-primary',
      mastery: '--dsw-alias-state-success-primary',
      text: '--dsw-alias-label-primary',
      halo: '--dsw-alias-bg-base',
    }
    const GRAPH_COLORS_FALLBACK = {
      word: '#3b82f6',
      transcript: '#d97706',
      appears: '#8b8f98',
      cooccur: '#3b82f6',
      morph: '#16a34a',
      sense: '#dc2626',
      mastery: '#16a34a',
      text: '#1f2328',
      halo: '#ffffff',
    }
    // 下限放得比较低：几百个节点时「复位视图」仍能把整张图放进窄侧栏。
    const GRAPH_MIN_SCALE = 0.15
    const GRAPH_MAX_SCALE = 2.6
    const GRAPH_SETTLE_TEMPERATURE = 0.6
    const GRAPH_COOLING = 0.97
    // 拖动后重新加热：必须高于 GRAPH_SETTLE_TEMPERATURE，否则下一步会立刻判定收敛。
    const GRAPH_REHEAT_MIN = 1.2
    const GRAPH_REHEAT_FACTOR = 0.08

    // Poppler 命令随运行平台变化（桌面版 Windows/macOS 与 Linux 的包管理器不同）
    const ENV_PLATFORM = (() => {
      try {
        const text = String(globalThis.navigator?.userAgent ?? '') + ' ' + String(globalThis.navigator?.platform ?? '')
        if (/Windows/i.test(text)) return 'win'
        if (/Mac/i.test(text)) return 'mac'
        return 'posix'
      } catch {
        return 'win'
      }
    })()

    const ENV_COMMANDS = {
      blInstall: 'npm i -g bailian-cli --registry=https://registry.npmmirror.com',
      blLogin: 'bl auth login --console',
      popplerInstall: ENV_PLATFORM === 'win'
        ? 'winget install -e --id oschwartz10612.Poppler'
        : ENV_PLATFORM === 'mac' ? 'brew install poppler' : 'sudo apt install poppler-utils',
    }

    // ═══════════════════════════════════════════════════════════════════
    // §1 运行时 i18n（zh / en 字典，经 ctx.locale.register 注册）
    // 符号表：zh / en — 两套完全等键的字典；所有 UI 文案（含错误码映射）都在这里
    // 约定：中文用全角标点（含「：」），英文用半角标点；宿主 message 只做回退
    // ═══════════════════════════════════════════════════════════════════
    const zh = {
      'tab.title': '英语精读',
      'tab.description': '播客转写、生词本、背记与图谱',
      'button.open': '打开英语精读',
      'mode.reader': '文稿',
      'mode.vocab': '生词本',
      'mode.recall': '背记',
      'mode.graph': '图谱',
      'common.refresh': '刷新',
      'common.copy': '复制',
      'common.copied': '已复制',
      'common.detail': '：{message}',
      'reader.pick': '选择文稿',
      'reader.transcribe': '转写录音',
      'reader.import': '导入文稿',
      'reader.metaImported': '{segments} 段 · 导入文稿',
      'reader.metaPdf': '{pages} 页 · PDF',
      'reader.openPreview': 'DSH 预览',
      'reader.zoom': '缩放',
      'reader.zoomIn': '放大',
      'reader.zoomOut': '缩小',
      'toast.imported': '已导入文稿',
      'error.importTooLarge': '文件太大（超过 3MB）',
      'error.pdfTooLarge': 'PDF 太大（超过 20MB）',
      'reader.emptyTitle': '还没有转写文稿',
      'reader.emptyHint': '把录音放进工作区的 recordings/ 文件夹，然后点「转写录音」，或在对话里让助手转写。',
      'reader.loading': '正在加载文稿…',
      'reader.loadingMore': '继续加载段落…',
      'reader.failed': '文稿加载失败',
      'reader.meta': '{segments} 段 · {speakers} 位说话人 · {duration}',
      'reader.speaker': '说话人 {n}',
      'transcribe.title': '转写录音',
      'transcribe.empty': '没有音频文件。放到工作区的 recordings/ 文件夹，或扫描其他文件夹。',
      'transcribe.audio': '录音',
      'transcribe.speakers': '说话人数（可选）',
      'transcribe.start': '开始转写',
      'transcribe.cancel': '取消',
      'transcribe.running': '转写中…',
      'transcribe.done': '已完成',
      'transcribe.failed': '转写失败',
      'transcribe.failedWithDetail': '转写失败：{message}',
      'transcribe.retry': '重试',
      'transcribe.queued': '已排队',
      'transcribe.hint': '转写在后台运行，通常需要 1–3 分钟；完成后文稿会自动出现。',
      'transcribe.pathPlaceholder': '粘贴文件夹或音频文件路径',
      'transcribe.scan': '扫描',
      'transcribe.browse': '选择文件夹…',
      'transcribe.pathRequired': '请输入文件夹或音频文件路径',
      'transcribe.noAudio': '这个位置没有支持的音频文件',
      'transcribe.found': '找到 {n} 个音频文件',
      'transcribe.model': '模型',
      'transcribe.modelDefault': '{model}（默认）',
      'reader.merge': '合并短句',
      'reader.known': '已在生词本',
      'font.label': '字号',
      'font.smaller': '缩小字号',
      'font.larger': '放大字号',
      'reader.delete': '删除',
      'reader.deleteConfirm': '确认删除？',
      'reader.deleteYes': '确认',
      'reader.deleteNo': '取消',
      'toast.transcriptDeleted': '已删除文稿',
      'toast.merged': '已合并：{before} 段 → {after} 段',
      'toast.mergeNoop': '已经是合并后的段落',
      'vocab.pendingBanner': '有 {n} 个生词待补全（音标 / 释义 / 例句翻译）',
      'vocab.copyPrompt': '复制补全提示',
      'vocab.prompt': '请补全英语生词本里待补全的词条：补上音标、中文释义和例句翻译。用 english_vocab 工具读取 pending 词条，再把结果 update 写回。',
      'vocab.promptCopied': '已复制，粘贴到对话里发送即可',
      'vocab.filter.all': '全部',
      'vocab.filter.word': '单词',
      'vocab.filter.sentence': '句子',
      'vocab.sort': '排序',
      'vocab.sort.timeDesc': '时间（新→旧）',
      'vocab.sort.timeAsc': '时间（旧→新）',
      'vocab.sort.az': 'A–Z',
      'vocab.transcript': '文稿',
      'vocab.transcriptAll': '全部文稿',
      'vocab.detail': '展示内容',
      'vocab.detailFull': '全',
      'vocab.detailSimple': '简',
      'vocab.search': '搜索生词或句子',
      'vocab.delete': '删除',
      'vocab.pending': '待补全',
      'vocab.done': '已补全',
      'vocab.empty': '生词本还是空的。在文稿里选中单词或句子，按 Ctrl 打开浮窗，点右上角按钮加入。',
      'vocab.noMatch': '没有匹配的条目',
      'vocab.source': '来源：{title} · Speaker {speaker} · {time}',
      'vocab.example': '例句：',
      'vocab.family': '词形：',
      'vocab.etymology': '词源：',
      'vocab.enrich': '补全词形/词源',
      'toast.enriched': '已补全词形与词源',
      'vocab.analyze': '分析多义',
      'vocab.analyzing': '分析中…',
      'vocab.analyzeHint': '对比所有文稿里的用法，补全这个词的其它意思',
      'vocab.analysisDone': '多义分析：{contexts} 处 · {transcripts} 篇文稿',
      'vocab.analysisSkipped': '多义分析：没有更多上下文',
      'vocab.analysisFailed': '多义分析失败：{message}',
      'vocab.senseExample': '语境：',
      'toast.analyzed': '多义分析完成，新增 {added} 条释义',
      'toast.analyzeSkipped': '多义分析完成，未发现新的意思',
      'toast.analyzeFailed': '多义分析失败，请稍后重试',
      'error.analysisDisabled': '查词后端已关闭，无法分析多义',
      'recall.loading': '正在准备今日复习…',
      'recall.failed': '背记加载失败',
      'recall.retry': '重试',
      'recall.refresh': '刷新',
      'recall.progress': '已完成 {done} / {total}',
      'recall.remaining': '还剩 {n} 个',
      'recall.due': '待复习 {n}',
      'recall.newWords': '新词 {n}',
      'recall.mastered': '已掌握 {n}',
      'recall.streak': '连续 {n} 天',
      'recall.mode': '练习方式',
      'recall.modeMix': '混合',
      'recall.modeEnZh': '英→中',
      'recall.modeZhEn': '中→英',
      'recall.pagePractice': '今日复习',
      'recall.pageMastery': '掌握情况',
      'recall.pageTabs': '背记页面',
      'recall.cardNew': '新词',
      'recall.cardDue': '复习',
      'recall.promptEnZh': '写出中文意思',
      'recall.promptZhEn': '写出英文单词',
      'recall.placeholderEnZh': '输入中文意思，回车提交',
      'recall.placeholderZhEn': '输入英文单词，回车提交',
      'recall.submit': '提交答案',
      'recall.skip': '不会，直接看答案',
      'recall.showExample': '显示例句',
      'recall.hideExample': '隐藏例句',
      'recall.exampleLabel': '例句',
      'recall.noExample': '这个词还没有例句。在生词本里补全例句后会出现。',
      'recall.answer': '你的答案',
      'recall.correctAnswer': '正确答案',
      'recall.verdictCorrect': '自动判断：正确',
      'recall.verdictClose': '自动判断：接近',
      'recall.verdictWrong': '自动判断：不正确',
      'recall.verdictHint': '自动判断仅供参考，请按你的真实掌握程度选择。',
      'recall.gradeAgain': '忘记',
      'recall.gradeHard': '模糊',
      'recall.gradeGood': '记得',
      'recall.gradeEasy': '熟练',
      'recall.gradeHint': '快捷键 1–4',
      'recall.doneTitle': '今日复习完成',
      'recall.doneSummary': '完成 {done} 个 · 答对 {correct} 个',
      'recall.doneHint': '系统会按掌握程度在合适的日子再安排这些词。',
      'recall.noWordbook': '生词本还没有可背的单词。先在文稿里划词查词并加入生词本。',
      'recall.noMeanings': '生词本里的单词还没有中文释义，先补全释义再来背记。',
      'recall.noRound': '今天没有要复习的单词。',
      'recall.nextReview': '下次复习：{date}',
      'recall.masteryTitle': '掌握情况',
      'recall.tableWord': '单词',
      'recall.tableMastery': '掌握度',
      'recall.tableLevel': '等级',
      'recall.tableNext': '下次复习',
      'recall.tableActions': '操作',
      'recall.mastery0': '生疏',
      'recall.mastery1': '初识',
      'recall.mastery2': '初记',
      'recall.mastery3': '熟悉',
      'recall.mastery4': '掌握',
      'recall.mastery5': '精通',
      'recall.level': 'Lv.{level}',
      'recall.nextToday': '今天',
      'recall.nextTomorrow': '明天',
      'recall.nextDate': '{date}',
      'recall.resetWord': '重置',
      'recall.resetAll': '重置全部进度',
      'recall.resetAllConfirm': '确定重置全部背记进度？',
      'recall.resetYes': '确认重置',
      'recall.resetNo': '取消',
      'recall.historyTitle': '最近 {n} 天',
      'graph.loading': '正在整理关系图…',
      'graph.failed': '图谱加载失败',
      'graph.retry': '重试',
      'graph.refresh': '刷新',
      'graph.summary': '{words} 个单词 · {transcripts} 篇文稿 · {links} 条联系',
      'graph.emptyWords': '生词本还没有单词。先在文稿里划词查词并加入生词本。',
      'graph.emptyTranscripts': '还没有文稿。转写一段录音或导入一份文稿后再来看图谱。',
      'graph.emptyLinks': '这些词还没有出现在任何文稿里，暂时没有可展示的联系。',
      'graph.filter': '联系类型',
      'graph.filterAll': '全部',
      'graph.filterDoc': '文稿-单词',
      'graph.filterWord': '单词-单词',
      'graph.search': '搜索单词或文稿',
      'graph.searchResults': '搜索结果',
      'graph.searchEmpty': '没有匹配的单词或文稿',
      'graph.zoomIn': '放大',
      'graph.zoomOut': '缩小',
      'graph.resetView': '复位视图',
      'graph.hint': '拖动节点、滚轮缩放，点击空白处取消选择。',
      'graph.legendTitle': '图例',
      'graph.legendWord': '单词',
      'graph.legendTranscript': '文稿',
      'graph.legendAppears': '出现 / 来源',
      'graph.legendCooccur': '同句共现',
      'graph.legendMorph': '同根 / 同族',
      'graph.legendSense': '近义',
      'graph.detailEmpty': '点击一个节点，查看它和哪些文稿、单词相连。',
      'graph.kindWord': '单词',
      'graph.kindTranscript': '文稿',
      'graph.close': '关闭',
      'graph.mastery': '掌握度 {n}/5',
      'graph.noMeaning': '还没有中文释义',
      'graph.sentence': '例句',
      'graph.relations': '联系',
      'graph.noRelations': '这个节点还没有联系。',
      'graph.openTranscript': '打开文稿',
      'graph.scopeTranscript': '只看这篇文稿',
      'graph.scopeChip': '只看：{title}',
      'graph.clearScope': '显示全部',
      'graph.occurrences': '出现 {n} 次',
      'graph.origin': '来源',
      'graph.matchedWords': '本稿 {n} 个词',
      'graph.sharedSentences': '同句 {n} 次',
      'graph.morphRoot': '词源同根：{detail}',
      'graph.morphFamily': '词形同族：{detail}',
      'graph.sense': '近义：{detail}',
      'graph.transcriptMeta': '{segments} 段 · {duration} · {speakers} 位说话人',
      'graph.truncated': '节点较多，仅显示最相关的 {words} 个单词和 {transcripts} 篇文稿。',
      'graph.isolated': '另有 {n} 个单词还没有任何联系。',
      'graph.ariaLabel': '文稿与单词关系图谱：{words} 个单词、{transcripts} 篇文稿',
      'popup.word': '单词',
      'popup.sentence': '句子',
      'popup.loading': '查询中…',
      'popup.add': '加入生词本',
      'popup.added': '已加入',
      'popup.duplicate': '已在生词本中',
      'popup.close': '关闭',
      'popup.canStillAdd': '仍可点右上角加入生词本，之后再补全释义。',
      'popup.noIpa': '暂无音标',
      'popup.label': '查词浮窗',
      'error.lookup': '查词失败',
      'error.transcript': '文稿格式无效',
      'error.generic': '操作失败',
      'error.withDetail': '操作失败：{message}',
      'error.network': '无法连接本地插件服务，请确认页面在 DSH 中打开',
      'error.timeout': '请求超时，请稍后再试',
      'error.httpMethod': '请求方式不被允许',
      'error.httpForbidden': '没有权限访问本地接口，请从 DSH 页面打开插件',
      'error.httpOrigin': '来源校验失败，请从 DSH 页面打开插件',
      'error.httpBadJson': '请求格式无效',
      'error.httpTooLarge': '请求内容太大',
      'error.httpRateLimited': '操作太频繁，请稍后再试',
      'error.internal': '插件服务内部出错',
      'error.sessionUnavailable': '会话已离线，无法访问工作区',
      'error.actionUnknown': '插件版本不匹配（未知操作），请更新插件',
      'error.configInvalid': '配置无效，请检查 .dsh-english/config.json',
      'error.pathInvalid': '路径无效',
      'error.pathOutsideWorkspace': '路径不在工作区内',
      'error.blMissing': '未找到百炼 CLI（bl），请先安装',
      'error.blNotAuthenticated': '百炼 CLI 未登录，请先登录',
      'error.blFailed': '百炼 CLI 调用失败',
      'error.popplerMissing': '未找到 PDF 工具（Poppler）',
      'error.pdfRenderFailed': 'PDF 渲染失败',
      'error.pdfRejected': 'PDF 无法处理（太大或超过页数上限）',
      'error.transcriptNotFound': '找不到这个文稿',
      'error.transcriptInvalidName': '文稿名无效',
      'error.transcriptEmpty': '文稿是空的',
      'error.importUnsupported': '不支持这种文件格式',
      'error.importRejected': '文件太大或内容为空，无法导入',
      'error.importEmpty': '文件是空的',
      'error.vocabInvalidEntry': '词条数据无效',
      'error.vocabNotFound': '词条不存在',
      'error.jobNotFound': '找不到这个转写任务',
      'error.jobFailed': '转写任务失败',
      'error.recallInvalid': '背记数据无效',
      'error.recallNotFound': '这个词已不在生词本中',
      'env.title': '环境自检',
      'env.check': '重新检测',
      'env.checking': '检测中…',
      'env.bl': '百炼 CLI (bl)',
      'env.poppler': 'PDF 工具 (Poppler)',
      'env.workspace': '工作区',
      'env.ok': '正常',
      'env.missing': '未安装',
      'env.authenticated': '已登录',
      'env.notAuthenticated': '未登录',
      'env.writable': '可写',
      'env.readonly': '不可写',
      'env.warnings': '提示',
      'env.blInstall': '安装百炼 CLI',
      'env.blLogin': '登录百炼 CLI',
      'env.popplerInstall': '安装 Poppler',
      'env.recheckHint': '装好后点「重新检测」。',
      'env.expand': '展开',
      'env.collapse': '收起',
      'toast.added': '已加入生词本',
      'toast.duplicate': '这个词已在生词本中',
      'toast.jobStarted': '转写已开始',
      'toast.deleted': '已删除',
    }

    const en = {
      'tab.title': 'English practice',
      'tab.description': 'Podcast transcripts, wordbook, review and graph',
      'button.open': 'Open English practice',
      'mode.reader': 'Transcript',
      'mode.vocab': 'Wordbook',
      'mode.recall': 'Review',
      'mode.graph': 'Graph',
      'common.refresh': 'Refresh',
      'common.copy': 'Copy',
      'common.copied': 'Copied',
      'common.detail': ': {message}',
      'reader.pick': 'Choose a transcript',
      'reader.transcribe': 'Transcribe',
      'reader.import': 'Import',
      'reader.metaImported': '{segments} segments · imported',
      'reader.metaPdf': '{pages} pages · PDF',
      'reader.openPreview': 'Preview',
      'reader.zoom': 'Zoom',
      'reader.zoomIn': 'Zoom in',
      'reader.zoomOut': 'Zoom out',
      'toast.imported': 'Transcript imported',
      'error.importTooLarge': 'File is larger than 3 MB',
      'error.pdfTooLarge': 'PDF is larger than 20 MB',
      'reader.emptyTitle': 'No transcripts yet',
      'reader.emptyHint': 'Put a recording in the workspace recordings/ folder, then click Transcribe, or ask the assistant to transcribe it.',
      'reader.loading': 'Loading the transcript…',
      'reader.loadingMore': 'Loading more paragraphs…',
      'reader.failed': 'Could not load the transcript',
      'reader.meta': '{segments} segments · {speakers} speakers · {duration}',
      'reader.speaker': 'Speaker {n}',
      'transcribe.title': 'Transcribe a recording',
      'transcribe.empty': 'No audio files. Put them in the workspace recordings/ folder, or scan another folder.',
      'transcribe.audio': 'Recording',
      'transcribe.speakers': 'Speakers (optional)',
      'transcribe.start': 'Start',
      'transcribe.cancel': 'Cancel',
      'transcribe.running': 'Transcribing…',
      'transcribe.done': 'Done',
      'transcribe.failed': 'Transcription failed',
      'transcribe.failedWithDetail': 'Transcription failed: {message}',
      'transcribe.retry': 'Retry',
      'transcribe.queued': 'Queued',
      'transcribe.hint': 'Transcription runs in the background, usually 1–3 minutes; the transcript appears automatically.',
      'transcribe.pathPlaceholder': 'Paste a folder or audio file path',
      'transcribe.scan': 'Scan',
      'transcribe.browse': 'Choose folder…',
      'transcribe.pathRequired': 'Enter a folder or audio file path',
      'transcribe.noAudio': 'No supported audio files here',
      'transcribe.found': '{n} audio files',
      'transcribe.model': 'Model',
      'transcribe.modelDefault': '{model} (default)',
      'reader.merge': 'Merge',
      'reader.known': 'In wordbook',
      'font.label': 'Font size',
      'font.smaller': 'Smaller font',
      'font.larger': 'Larger font',
      'reader.delete': 'Delete',
      'reader.deleteConfirm': 'Delete?',
      'reader.deleteYes': 'Confirm',
      'reader.deleteNo': 'Cancel',
      'toast.transcriptDeleted': 'Transcript deleted',
      'toast.merged': 'Merged {before} → {after} segments',
      'toast.mergeNoop': 'Already merged',
      'vocab.pendingBanner': '{n} entries still need phonetics, meanings, or example translations',
      'vocab.copyPrompt': 'Copy prompt',
      'vocab.prompt': 'Please complete the pending entries in my English wordbook: add phonetics, Chinese meanings, and example translations. Use the english_vocab tool to list pending entries, then update them with the results.',
      'vocab.promptCopied': 'Copied — paste it into the chat',
      'vocab.filter.all': 'All',
      'vocab.filter.word': 'Words',
      'vocab.filter.sentence': 'Sentences',
      'vocab.sort': 'Sort',
      'vocab.sort.timeDesc': 'Newest first',
      'vocab.sort.timeAsc': 'Oldest first',
      'vocab.sort.az': 'A–Z',
      'vocab.transcript': 'Transcript',
      'vocab.transcriptAll': 'All transcripts',
      'vocab.detail': 'Detail',
      'vocab.detailFull': 'Full',
      'vocab.detailSimple': 'Simple',
      'vocab.search': 'Search words or sentences',
      'vocab.delete': 'Delete',
      'vocab.pending': 'Needs details',
      'vocab.done': 'Complete',
      'vocab.empty': 'The wordbook is empty. Select a word or sentence in the transcript, press Ctrl, then use the button in the popover.',
      'vocab.noMatch': 'No matching entries',
      'vocab.source': 'Source: {title} · Speaker {speaker} · {time}',
      'vocab.example': 'Example: ',
      'vocab.family': 'Forms: ',
      'vocab.etymology': 'Etymology: ',
      'vocab.enrich': 'Fetch forms & etymology',
      'toast.enriched': 'Word forms and etymology added',
      'vocab.analyze': 'Analyze senses',
      'vocab.analyzing': 'Analyzing…',
      'vocab.analyzeHint': 'Compare every document for other meanings of this word',
      'vocab.analysisDone': 'Senses analyzed: {contexts} contexts · {transcripts} transcripts',
      'vocab.analysisSkipped': 'Senses analyzed: no other contexts',
      'vocab.analysisFailed': 'Sense analysis failed: {message}',
      'vocab.senseExample': 'Context: ',
      'toast.analyzed': 'Sense analysis finished — {added} new meanings',
      'toast.analyzeSkipped': 'Sense analysis finished — no new meanings',
      'toast.analyzeFailed': 'Sense analysis failed — try again shortly',
      'error.analysisDisabled': 'The lookup backend is off, so senses cannot be analyzed',
      'recall.loading': 'Preparing today’s review…',
      'recall.failed': 'Could not load the review',
      'recall.retry': 'Retry',
      'recall.refresh': 'Refresh',
      'recall.progress': '{done} of {total} done',
      'recall.remaining': '{n} to go',
      'recall.due': 'Due {n}',
      'recall.newWords': 'New {n}',
      'recall.mastered': 'Mastered {n}',
      'recall.streak': '{n}-day streak',
      'recall.mode': 'Practice mode',
      'recall.modeMix': 'Mixed',
      'recall.modeEnZh': 'EN → ZH',
      'recall.modeZhEn': 'ZH → EN',
      'recall.pagePractice': 'Today',
      'recall.pageMastery': 'Mastery',
      'recall.pageTabs': 'Review pages',
      'recall.cardNew': 'New',
      'recall.cardDue': 'Review',
      'recall.promptEnZh': 'Write the Chinese meaning',
      'recall.promptZhEn': 'Write the English word',
      'recall.placeholderEnZh': 'Type the Chinese meaning, press Enter',
      'recall.placeholderZhEn': 'Type the English word, press Enter',
      'recall.submit': 'Submit',
      'recall.skip': 'Don’t know — show the answer',
      'recall.showExample': 'Show example',
      'recall.hideExample': 'Hide example',
      'recall.exampleLabel': 'Example',
      'recall.noExample': 'No example sentence for this word yet. It appears once the wordbook entry has one.',
      'recall.answer': 'Your answer',
      'recall.correctAnswer': 'Correct answer',
      'recall.verdictCorrect': 'Auto-check: correct',
      'recall.verdictClose': 'Auto-check: close',
      'recall.verdictWrong': 'Auto-check: incorrect',
      'recall.verdictHint': 'The auto-check is only a guide — grade how well you actually knew it.',
      'recall.gradeAgain': 'Forgot',
      'recall.gradeHard': 'Fuzzy',
      'recall.gradeGood': 'Got it',
      'recall.gradeEasy': 'Easy',
      'recall.gradeHint': 'Shortcuts 1–4',
      'recall.doneTitle': 'Today’s review is done',
      'recall.doneSummary': '{done} reviewed · {correct} correct',
      'recall.doneHint': 'These words come back on the days that match how well you know them.',
      'recall.noWordbook': 'No words to review yet. Select a word in a transcript, look it up, and add it to your wordbook.',
      'recall.noMeanings': 'The wordbook words do not have Chinese meanings yet. Fill them in, then come back to review.',
      'recall.noRound': 'Nothing scheduled for today.',
      'recall.nextReview': 'Next review: {date}',
      'recall.masteryTitle': 'Mastery',
      'recall.tableWord': 'Word',
      'recall.tableMastery': 'Mastery',
      'recall.tableLevel': 'Level',
      'recall.tableNext': 'Next',
      'recall.tableActions': 'Actions',
      'recall.mastery0': 'Fresh',
      'recall.mastery1': 'Started',
      'recall.mastery2': 'Learning',
      'recall.mastery3': 'Familiar',
      'recall.mastery4': 'Solid',
      'recall.mastery5': 'Mastered',
      'recall.level': 'Lv.{level}',
      'recall.nextToday': 'Today',
      'recall.nextTomorrow': 'Tomorrow',
      'recall.nextDate': '{date}',
      'recall.resetWord': 'Reset',
      'recall.resetAll': 'Reset all progress',
      'recall.resetAllConfirm': 'Reset all review progress?',
      'recall.resetYes': 'Reset everything',
      'recall.resetNo': 'Cancel',
      'recall.historyTitle': 'Last {n} days',
      'graph.loading': 'Building the graph…',
      'graph.failed': 'Could not load the graph',
      'graph.retry': 'Retry',
      'graph.refresh': 'Refresh',
      'graph.summary': '{words} words · {transcripts} transcripts · {links} links',
      'graph.emptyWords': 'No wordbook words yet. Select a word in a transcript, look it up and add it.',
      'graph.emptyTranscripts': 'No transcripts yet. Transcribe a recording or import a document, then come back.',
      'graph.emptyLinks': 'These words do not appear in any transcript yet, so there is nothing to connect.',
      'graph.filter': 'Relation types',
      'graph.filterAll': 'All',
      'graph.filterDoc': 'Transcripts',
      'graph.filterWord': 'Words',
      'graph.search': 'Search words or transcripts',
      'graph.searchResults': 'Search results',
      'graph.searchEmpty': 'No matching words or transcripts',
      'graph.zoomIn': 'Zoom in',
      'graph.zoomOut': 'Zoom out',
      'graph.resetView': 'Reset view',
      'graph.hint': 'Drag nodes, scroll to zoom, click empty space to clear the selection.',
      'graph.legendTitle': 'Legend',
      'graph.legendWord': 'Word',
      'graph.legendTranscript': 'Transcript',
      'graph.legendAppears': 'Occurs / source',
      'graph.legendCooccur': 'Same sentence',
      'graph.legendMorph': 'Root / family',
      'graph.legendSense': 'Shared meaning',
      'graph.detailEmpty': 'Select a node to see which transcripts and words it connects to.',
      'graph.kindWord': 'Word',
      'graph.kindTranscript': 'Transcript',
      'graph.close': 'Close',
      'graph.mastery': 'Mastery {n}/5',
      'graph.noMeaning': 'No Chinese meaning yet',
      'graph.sentence': 'Example',
      'graph.relations': 'Relations',
      'graph.noRelations': 'This node has no relations yet.',
      'graph.openTranscript': 'Open transcript',
      'graph.scopeTranscript': 'Only this transcript',
      'graph.scopeChip': 'Only: {title}',
      'graph.clearScope': 'Show all',
      'graph.occurrences': '{n} in this transcript',
      'graph.origin': 'Source',
      'graph.matchedWords': '{n} words here',
      'graph.sharedSentences': '{n} shared sentences',
      'graph.morphRoot': 'Same root: {detail}',
      'graph.morphFamily': 'Same word family: {detail}',
      'graph.sense': 'Shared meaning: {detail}',
      'graph.transcriptMeta': '{segments} segments · {duration} · {speakers} speakers',
      'graph.truncated': 'Large graph: showing the {words} most connected words and {transcripts} transcripts.',
      'graph.isolated': '{n} more words have no links yet.',
      'graph.ariaLabel': 'Transcript and word relation graph: {words} words, {transcripts} transcripts',
      'popup.word': 'Word',
      'popup.sentence': 'Sentence',
      'popup.loading': 'Looking up…',
      'popup.add': 'Add to wordbook',
      'popup.added': 'Added',
      'popup.duplicate': 'Already in the wordbook',
      'popup.close': 'Close',
      'popup.canStillAdd': 'You can still add it, then fill in the details later.',
      'popup.noIpa': 'No phonetic available',
      'popup.label': 'Lookup popover',
      'error.lookup': 'Lookup failed',
      'error.transcript': 'Invalid transcript',
      'error.generic': 'Something went wrong',
      'error.withDetail': 'Something went wrong: {message}',
      'error.network': 'Cannot reach the local plugin service. Is this page open inside DSH?',
      'error.timeout': 'The request timed out — try again shortly',
      'error.httpMethod': 'Request method not allowed',
      'error.httpForbidden': 'No permission to reach the local API. Open the plugin from the DSH page.',
      'error.httpOrigin': 'Origin check failed. Open the plugin from the DSH page.',
      'error.httpBadJson': 'Invalid request payload',
      'error.httpTooLarge': 'The request payload is too large',
      'error.httpRateLimited': 'Too many requests — try again in a moment',
      'error.internal': 'The plugin service hit an internal error',
      'error.sessionUnavailable': 'The session is offline, so the workspace is unavailable',
      'error.actionUnknown': 'Plugin version mismatch (unknown action). Please update the plugin.',
      'error.configInvalid': 'Invalid config — check .dsh-english/config.json',
      'error.pathInvalid': 'Invalid path',
      'error.pathOutsideWorkspace': 'That path is outside the workspace',
      'error.blMissing': 'Bailian CLI (bl) is not installed',
      'error.blNotAuthenticated': 'Bailian CLI is not signed in',
      'error.blFailed': 'Bailian CLI failed',
      'error.popplerMissing': 'PDF tooling (Poppler) is not installed',
      'error.pdfRenderFailed': 'PDF rendering failed',
      'error.pdfRejected': 'This PDF cannot be processed (too large or over the page limit)',
      'error.transcriptNotFound': 'Transcript not found',
      'error.transcriptInvalidName': 'Invalid transcript name',
      'error.transcriptEmpty': 'The transcript is empty',
      'error.importUnsupported': 'Unsupported file format',
      'error.importRejected': 'The file is too large or empty, so it cannot be imported',
      'error.importEmpty': 'The file is empty',
      'error.vocabInvalidEntry': 'Invalid wordbook entry',
      'error.vocabNotFound': 'Wordbook entry not found',
      'error.jobNotFound': 'Transcription job not found',
      'error.jobFailed': 'The transcription job failed',
      'error.recallInvalid': 'Invalid review data',
      'error.recallNotFound': 'This word is no longer in the wordbook',
      'env.title': 'Environment check',
      'env.check': 'Check again',
      'env.checking': 'Checking…',
      'env.bl': 'Bailian CLI (bl)',
      'env.poppler': 'PDF tool (Poppler)',
      'env.workspace': 'Workspace',
      'env.ok': 'Ready',
      'env.missing': 'Missing',
      'env.authenticated': 'signed in',
      'env.notAuthenticated': 'not signed in',
      'env.writable': 'writable',
      'env.readonly': 'not writable',
      'env.warnings': 'Notes',
      'env.blInstall': 'Install Bailian CLI',
      'env.blLogin': 'Sign in to Bailian CLI',
      'env.popplerInstall': 'Install Poppler',
      'env.recheckHint': 'After installing, click “Check again”.',
      'env.expand': 'Expand',
      'env.collapse': 'Collapse',
      'toast.added': 'Added to the wordbook',
      'toast.duplicate': 'This entry is already in the wordbook',
      'toast.jobStarted': 'Transcription started',
      'toast.deleted': 'Deleted',
    }

    // ═══════════════════════════════════════════════════════════════════
    // §2 styles
    // 符号表：CSS — 插件面板全部样式（单 <style> 注入）
    //         HEADER_CSS — 会话头耳机按钮的独立样式（该按钮在面板外，需自带样式）
    // 约定：配色一律用宿主 CSS 变量，深浅色主题自动跟随
    // ═══════════════════════════════════════════════════════════════════
    const CSS = [
      '.egl-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;overflow:hidden}',
      '.egl-reader{display:flex;flex-direction:column;flex:1;min-height:0}',
      '.egl-vocab{display:flex;flex-direction:column;flex:1;min-height:0}',
      '.egl-vocab-head{flex:none;padding:8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.egl-vocab-head .egl-tools{margin:0 0 8px}',
      '.egl-vocab-head .egl-tools:last-child{margin-bottom:0}',
      '.egl-reader-top{flex:none;padding:10px 12px 0}',
      '.egl-transcript-head{display:flex;align-items:center;gap:8px;flex:none;padding:8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}',
      '.egl-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;min-width:0;flex-wrap:wrap}',
      '.egl-fontctl{display:flex;align-items:center;gap:2px;flex:none}',
      '.egl-fontbtn{width:30px;height:26px;padding:0;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;text-align:center}',
      '.egl-fontsize{min-width:20px;text-align:center;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.egl-tabs{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:var(--dsw-radius-sm);padding:2px;flex:none}',
      '.egl-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;padding:4px 10px;border-radius:calc(var(--dsw-radius-sm) - 1px);cursor:pointer;white-space:nowrap}',
      '.egl-tab.is-on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px var(--dsw-alias-border-l1)}',
      '.egl-bar-right{margin-left:auto;display:flex;align-items:center;gap:6px;min-width:0}',
      '.egl-select{max-width:170px;height:26px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;padding:0 6px}',
      '.egl-btn{height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;white-space:nowrap}',
      '.egl-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.egl-btn:disabled{opacity:.55;cursor:default}',
      '.egl-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.egl-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.egl-scroll{flex:1;min-height:0;overflow:auto;padding:10px 12px 32px}',
      '.egl-seg{margin:0 0 .95em;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.egl-seg-meta{color:var(--dsw-alias-label-secondary);font-size:.85em;margin-right:6px;user-select:none;font-variant-numeric:tabular-nums}',
      '.egl-sentinel{padding:8px 0 2px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.egl-known{text-decoration:underline dashed;text-decoration-color:var(--dsw-alias-brand-primary);text-decoration-thickness:1px;text-underline-offset:3px;cursor:help}',
      '.egl-pdf{display:flex;flex-direction:column;gap:12px;margin:0 auto}',
      '.egl-pdf-page{position:relative;width:100%;background:var(--dsw-alias-bg-layer-2);border-radius:var(--dsw-radius-sm);overflow:hidden}',
      '.egl-pdf-img{display:block;width:100%;height:auto;user-select:none;-webkit-user-drag:none}',
      '.egl-pdf-word{position:absolute;color:transparent;white-space:pre;line-height:1;overflow:hidden;cursor:text;-webkit-user-drag:none}',
      '.egl-pdf-word::selection{background:rgba(59,130,246,.45);color:transparent}',
      '.egl-pdf-page ::selection{background:rgba(59,130,246,.45)}',
      '.egl-pdf-word.is-known{border-bottom:1.5px dashed #3b82f6;background:rgba(59,130,246,.12)}',
      '.egl-pdf-loading{padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.egl-math{font-family:Georgia,"Times New Roman","Cambria Math","Songti SC","Noto Serif SC",serif;font-style:italic}',
      '.egl-math-display{display:block;text-align:center;margin:.35em 0}',
      '.egl-math sub,.egl-math sup{font-style:normal;font-size:.72em;line-height:0}',
      '.egl-math-text{font-style:normal;font-family:inherit}',
      '.egl-sqrt{display:inline-flex;align-items:baseline}',
      '.egl-frac{display:inline-flex;flex-direction:column;vertical-align:-.55em;text-align:center;margin:0 .12em;line-height:1.15}',
      '.egl-frac-n{border-bottom:.5px solid currentColor;padding:0 .18em}',
      '.egl-frac-d{padding:0 .18em}',
      '.egl-sqrt-body{border-top:.5px solid currentColor;padding:0 .12em;margin-left:-.05em}',
      '.egl-muted{color:var(--dsw-alias-label-secondary)}',
      '.egl-empty{padding:26px 16px;text-align:center;color:var(--dsw-alias-label-secondary);line-height:1.7}',
      '.egl-empty-title{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:6px}',
      '.egl-banner{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 10px;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-warn-primary);font-size:12px}',
      '.egl-banner-text{flex:1;min-width:0}',
      '.egl-cards{display:flex;flex-direction:column;gap:8px;margin-top:8px}',
      '.egl-cards-simple{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '.egl-cards-simple > .egl-card-sentence{grid-column:1 / -1}',
      '.egl-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);padding:10px 12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column}',
      '.egl-card-head{display:flex;align-items:baseline;gap:8px;min-width:0}',
      '.egl-word{font-weight:600;font-size:1.15em;overflow-wrap:anywhere}',
      '.egl-ipa{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}',
      '.egl-family{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;margin-top:6px;font-size:.92em}',
      '.egl-form{border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 6px;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.egl-etymology{margin-top:6px;font-size:.92em;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.egl-etymology-line{display:inline-block;max-width:100%;padding:2px 8px;border-radius:var(--dsw-radius-sm);background:#fcf7ea;color:#6d5c42;font-family:Georgia,"Times New Roman","Songti SC","Noto Serif SC",serif;font-style:italic;line-height:1.55}',
      'body[data-ds-dark-theme] .egl-etymology-line{background:#413a2b;color:#e8dcc0}',
      '.egl-etymology-note{margin-top:4px}',
      '.egl-meaning{margin-top:4px}',
      '.egl-pos{color:var(--dsw-alias-label-secondary);margin-right:4px}',
      '.egl-example{margin-top:6px;color:var(--dsw-alias-label-secondary);font-size:.92em}',
      '.egl-example mark{background:transparent;color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.egl-source{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:.85em}',
      '.egl-sense-example{margin:-2px 0 4px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.4}',
      '.egl-sense-source{color:var(--dsw-alias-label-secondary);opacity:.9}',
      '.egl-analysis{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-chip{margin-left:auto;flex:none;font-size:.85em;padding:1px 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.egl-chip.is-pending{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.egl-card-actions{display:flex;gap:8px;margin-top:auto;padding-top:8px;align-items:center}',
      '.egl-link{border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;padding:0}',
      '.egl-tools{display:flex;gap:6px;align-items:center;margin:8px 0;flex-wrap:wrap}',
      '.egl-field{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.egl-input{height:26px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;padding:0 8px;min-width:0}',
      '.egl-panel{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);padding:10px;margin:0 0 10px;background:var(--dsw-alias-bg-layer-1)}',
      '.egl-job{display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:6px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.egl-job.is-failed{color:var(--dsw-alias-state-error-primary)}',
      '.egl-job-text{flex:1;min-width:0}',
      '.egl-pop{position:absolute;z-index:20;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);padding:10px 12px}',
      '.egl-pop-head{display:flex;align-items:center;gap:8px;min-width:0}',
      '.egl-pop-kind{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 6px}',
      '.egl-pop-text{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.egl-pop-add{flex:none;width:26px;height:26px;display:grid;place-items:center;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);cursor:pointer;padding:0}',
      '.egl-pop-add:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.egl-pop-add:disabled{cursor:default}',
      '.egl-pop-add.is-added{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.egl-pop-body{margin-top:8px;line-height:1.6;max-height:40vh;overflow:auto}',
      '.egl-err{color:var(--dsw-alias-state-error-primary);margin:0 0 4px}',
      '.egl-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:11px}',
      '.egl-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:6px 14px;font-size:12px;box-shadow:0 6px 18px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);z-index:30;max-width:calc(100% - 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.egl-row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.egl-env{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);margin:0 0 10px;overflow:hidden}',
      '.egl-env-head{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.egl-env-head:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:-2px}',
      '.egl-env-title{flex:none;font-weight:600;font-size:12px}',
      '.egl-env-chips{display:flex;gap:4px;flex-wrap:wrap;min-width:0;flex:1}',
      '.egl-env-chip{font-size:11px;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.egl-env-chip.is-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.egl-env-chip.is-bad{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.egl-env-chevron{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.egl-env-body{display:flex;flex-direction:column;gap:7px;padding:0 10px 10px}',
      '.egl-kv{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:12px}',
      '.egl-kv-label{flex:none;min-width:112px;color:var(--dsw-alias-label-secondary)}',
      '.egl-kv-value{min-width:0;overflow-wrap:anywhere}',
      '.egl-env-sub{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}',
      '.egl-cmd-label{font-size:11px;color:var(--dsw-alias-label-secondary);margin:2px 0 3px}',
      '.egl-cmd{display:flex;align-items:center;gap:6px;min-width:0}',
      '.egl-cmd code{flex:1;min-width:0;overflow:auto;white-space:pre;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:2px 6px;background:var(--dsw-alias-bg-layer-2)}',
      '.egl-env-warns{margin:0;padding-left:18px;font-size:11px;color:var(--dsw-alias-state-warn-primary)}',
      '.egl-env-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.egl-env-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall{display:flex;flex-direction:column;flex:1;min-height:0}',
      '.egl-recall-head{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.egl-recall-label{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-progress{display:flex;align-items:center;gap:8px;margin:0 0 8px}',
      '.egl-recall-progress-text{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.egl-recall-track{flex:1;min-width:60px;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.egl-recall-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .18s ease}',
      '.egl-recall-chips{display:flex;flex-wrap:wrap;gap:4px 6px;margin:0 0 10px}',
      '.egl-recall-chip{font-size:11px;line-height:18px;padding:0 7px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.egl-recall-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:14px 14px 12px;margin:0 0 12px}',
      '.egl-recall-cardhead{display:flex;align-items:center;gap:8px;margin:0 0 10px}',
      '.egl-recall-cardchip{flex:none;font-size:11px;line-height:17px;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-cardchip.is-new{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.egl-recall-lv{margin-left:auto;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.egl-recall-word{font-size:1.85em;font-weight:700;line-height:1.25;overflow-wrap:anywhere}',
      '.egl-recall-ipa{margin-left:8px;font-size:.95em;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}',
      '.egl-recall-prompt{margin:0 0 10px}',
      '.egl-recall-prompt-text{font-size:1.05em;font-weight:600;line-height:1.5;overflow-wrap:anywhere}',
      '.egl-recall-prompt-sub{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-prompt-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px}',
      '.egl-recall-prompt-line .egl-recall-prompt-sub{margin-top:0}',
      '.egl-recall-hintbtn{padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}',
      '.egl-recall-hintbtn:hover{text-decoration:underline}',
      '.egl-recall-hintbtn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
      '.egl-recall-example{margin:0 0 10px;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}',
      '.egl-recall-example-label{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:2px}',
      '.egl-recall-example-text{line-height:1.6;overflow-wrap:anywhere}',
      '.egl-recall-input{display:block;width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:inherit;font:inherit}',
      '.egl-recall-input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:-1px;border-color:var(--dsw-alias-brand-primary)}',
      '.egl-recall-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}',
      '.egl-recall-answerline{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 8px}',
      '.egl-recall-answerlabel{flex:none;min-width:64px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-answertext{min-width:0;font-weight:600;overflow-wrap:anywhere}',
      '.egl-recall-answertext.is-blank{font-weight:400;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-correct{margin:0 0 10px;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}',
      '.egl-recall-correct .egl-recall-answerlabel{margin-bottom:2px}',
      '.egl-recall-verdict{margin:0 0 4px;font-size:11px;font-weight:600}',
      '.egl-recall-verdict.is-correct{color:var(--dsw-alias-state-success-primary)}',
      '.egl-recall-verdict.is-close{color:var(--dsw-alias-state-warn-primary)}',
      '.egl-recall-verdict.is-wrong{color:var(--dsw-alias-state-error-primary)}',
      '.egl-recall-hint{margin:0 0 10px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-grades{display:flex;gap:6px;flex-wrap:wrap}',
      '.egl-recall-grade{flex:1;min-width:60px;height:30px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;white-space:nowrap}',
      '.egl-recall-grade:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.egl-recall-grade:disabled{opacity:.55;cursor:default}',
      '.egl-recall-grade.is-rec{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.egl-recall-gradekey{margin-left:4px;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.egl-recall-section{display:flex;align-items:baseline;gap:8px;margin:14px 0 6px}',
      '.egl-recall-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-history{display:flex;align-items:flex-end;gap:3px;height:64px;margin:6px 0 2px}',
      '.egl-recall-histcol{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end}',
      '.egl-recall-histspace{flex:1;min-height:0;display:flex;align-items:flex-end}',
      '.egl-recall-histbar{width:100%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
      '.egl-recall-histdone{width:100%;background:var(--dsw-alias-brand-primary);border-radius:2px 2px 0 0}',
      '.egl-recall-histlabel{flex:none;text-align:center;font-size:9px;line-height:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;overflow:hidden}',
      '.egl-recall-done{padding:18px 12px 12px;text-align:center}',
      '.egl-recall-done-title{font-size:1.15em;font-weight:600}',
      '.egl-recall-done-summary{margin-top:4px;font-variant-numeric:tabular-nums}',
      '.egl-recall-done-hint{margin-top:4px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.egl-recall-tablewrap{overflow-x:auto;margin:4px 0 0}',
      '.egl-recall-table{display:flex;flex-direction:column;min-width:344px}',
      '.egl-recall-tablehead,.egl-recall-tablerow{display:grid;grid-template-columns:minmax(72px,1.6fr) 92px 42px 78px 44px;align-items:center;column-gap:8px;padding:6px 0;text-align:left}',
      '.egl-recall-tablehead{border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600}',
      '.egl-recall-tablerow{border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.egl-recall-tablerow:last-child{border-bottom:0}',
      '.egl-recall-cell{min-width:0;text-align:left}',
      '.egl-recall-cell-word{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.egl-recall-cell-lv,.egl-recall-cell-next{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}',
      '.egl-recall-bar{display:inline-flex;align-items:center;gap:2px;vertical-align:middle}',
      '.egl-recall-barseg{width:13px;height:6px;border-radius:2px;background:var(--dsw-alias-border-l2)}',
      '.egl-recall-barseg.is-on{background:var(--dsw-alias-brand-primary)}',
      '.egl-recall-reset{flex:none;padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}',
      '.egl-recall-reset:disabled{opacity:.55;color:var(--dsw-alias-label-secondary);cursor:default}',
      '.egl-recall-resetbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 0;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.egl-recall-resetbar-text{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-graph{display:flex;flex-direction:column;flex:1;min-height:0}',
      '.egl-graph-tools{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.egl-graph-search{flex:1;min-width:90px;height:26px}',
      '.egl-graph-actions{display:flex;gap:4px;margin-left:auto;flex:none}',
      '.egl-graph-zoom{width:26px;padding:0;font-variant-numeric:tabular-nums}',
      '.egl-graph-banners{flex:none;display:flex;flex-direction:column;gap:4px;padding:6px 10px 0}',
      '.egl-graph-banner{margin:0;padding:4px 8px;font-size:11px;line-height:1.5;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.egl-graph-scope{flex:none;display:flex;align-items:center;gap:8px;padding:6px 10px 0;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.egl-graph-scopetext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.egl-graph-scopebtn{flex:none;padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}',
      '.egl-graph-results{flex:none;max-height:124px;overflow:auto;border-bottom:.5px solid var(--dsw-alias-border-l1);padding:4px 10px}',
      '.egl-graph-result{display:flex;align-items:center;gap:6px;width:100%;padding:3px 4px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.egl-graph-result:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.egl-graph-result-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.egl-graph-canvas{position:relative;flex:1 1 auto;min-height:120px;overflow:hidden}',
      '.egl-graph-canvas canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}',
      '.egl-graph-canvas canvas.is-dragging{cursor:grabbing}',
      '.egl-graph-legend{flex:none;display:flex;flex-wrap:wrap;gap:2px 10px;padding:6px 10px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:10px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.egl-graph-key{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}',
      '.egl-graph-dot{width:8px;height:8px;border-radius:999px;flex:none}',
      '.egl-graph-dash{width:14px;height:0;border-top:1.5px dashed currentColor;flex:none;opacity:.75}',
      // 详情区高度固定：切换节点、内容长短都不改变高度，画布不会因此重排；内容超出在面板内滚动。
      '.egl-graph-detail{flex:0 0 36%;min-height:160px;max-height:340px;overflow:auto;border-top:.5px solid var(--dsw-alias-border-l1);padding:8px 10px 12px}',
      '.egl-graph-detail .egl-empty{padding:10px 4px}',
      '.egl-graph-detailhead{display:flex;align-items:baseline;gap:8px;margin:0 0 6px;min-width:0}',
      '.egl-graph-kind{flex:none;font-size:10px;line-height:16px;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.egl-graph-title{min-width:0;font-weight:600;font-size:1.05em;overflow-wrap:anywhere}',
      '.egl-graph-close{margin-left:auto;flex:none;width:22px;height:22px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer;border-radius:var(--dsw-radius-sm)}',
      '.egl-graph-close:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.egl-graph-meta{margin:0 0 6px;font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.egl-graph-meanings{margin:0 0 6px}',
      '.egl-graph-example{margin:0 0 8px;padding:6px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);font-size:11px;line-height:1.55;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.egl-graph-actionrow{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}',
      '.egl-graph-section{margin:8px 0 4px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.egl-graph-rel{display:flex;align-items:baseline;gap:6px;width:100%;padding:3px 2px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.5;text-align:left;cursor:pointer}',
      '.egl-graph-rel:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.egl-graph-relkind{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);min-width:44px}',
      '.egl-graph-reltext{min-width:0;flex:1;overflow-wrap:anywhere}',
      '.egl-graph-relcount{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.egl-graph-progress{display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-left:6px}',
      '.egl-graph-progressseg{width:9px;height:4px;border-radius:2px;background:var(--dsw-alias-border-l2)}',
      '.egl-graph-progressseg.is-on{background:var(--dsw-alias-state-success-primary)}',
      '.egl-graph-sample{margin:1px 0 0 50px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
    ].join('')

    const HEADER_CSS = [
      '.egl-header-btn{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;margin:0}',
      '.egl-header-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.egl-header-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
    ].join('')


    // ═══════════════════════════════════════════════════════════════════
    // §3 纯函数（时间、格式化、高亮、数学公式、选区清洗、环境判定、图谱布局）
    // 符号表：
    //   fmtClock / errorMessage / parseLoose / classify / sentenceAround / speakerName
    //   readFontSize / saveFontSize / readPdfZoom / savePdfZoom — localStorage 偏好
    //   readLastTranscript / saveLastTranscript — 上次打开的文稿（localStorage，跨面板重开保留）
    //   RECALL_MODE_STORAGE_KEY / RECALL_MODES / RECALL_GRADES / readRecallMode / saveRecallMode — 背记练习方式偏好与评分档位
    //   normalizeEnAnswer / normalizeZhAnswer / levenshtein / lcsLength / judgeAnswer — 背记答案自动判定（客户端，不落后端）
    //   shiftDateString / recallNextLabel — 背记日期展示（最近 14 天柱状图、「明天」标签）
    //   recallExampleOf / maskExampleTerms — 背记「显示例句」提示（取含目标词的句子、中→英时把词挖空）
    //   meaningAtoms / mergeMeaningPair / collapseMeanings — 生词本义项展示合并（与 host/text.js 同规则）
    //   readGraphFilter / saveGraphFilter — 图谱联系类型筛选偏好（localStorage）
    //   graphLinkVisible / graphCreateSim / graphStepSim / graphFitView / graphNeighbors /
    //   graphVisibleDegrees / graphSearchNodes / graphScopedData / graphNodeRadius — 图谱布局、筛选与搜索（确定性纯函数）
    //   graphResolvePalette — 宿主 CSS 变量 → 画布配色（getComputedStyle 解析）
    //   fileResourceAddress — 工作区文件 → dsh-resource:// 地址
    //   hashString / listSignature — 轮询数据签名（只在变化时 setState）
    //   copyText — 剪贴板写入（唯一浏览器副作用小工具）
    //   isEditableNode / isEditableFocus / isEditableEvent / isInteractiveTarget — 输入框与可交互控件守卫
    //   closestDataElement / selectionLookupPayload — 选区解析（含跨行/跨段）
    //   envHasProblems — 环境自检是否需要展开提示
    //   highlight / escapeRegExp / knownWordPattern / renderKnownText / isKnownWord — 已收录词下划线
    //   MATH_SYMBOLS / mathReadGroup / mergeMathSegments / mathDelimitersOpen / renderMath — LaTeX 轻量渲染
    //   renderPlainChunk / renderRichText — 数学公式与正文混排
    //   arrayBufferToBase64 / toUint8Array — PDF 导入与图片字节
    //   cleanSelectionText / findStoredEntry — 选区清洗与生词本命中
    // ═══════════════════════════════════════════════════════════════════
    function fmtClock(ms) {
      const total = Math.max(0, Math.round(Number(ms) || 0) / 1000)
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = Math.floor(total % 60)
      const mm = String(minutes).padStart(2, '0')
      const ss = String(seconds).padStart(2, '0')
      return hours > 0 ? hours + ':' + mm + ':' + ss : mm + ':' + ss
    }

    function errorMessage(error) {
      if (error instanceof Error) return error.message
      return String(error)
    }

    function readFontSize(key, fallback) {
      try {
        const value = Number(window.localStorage.getItem(FONT_STORAGE_PREFIX + key))
        return Number.isFinite(value) && value >= MIN_FONT && value <= MAX_FONT ? value : fallback
      } catch {
        return fallback
      }
    }

    function saveFontSize(key, value) {
      try {
        window.localStorage.setItem(FONT_STORAGE_PREFIX + key, String(value))
      } catch {
        // private mode or a storage failure only loses the preference
      }
    }

    function readPdfZoom() {
      try {
        const value = Number(window.localStorage.getItem(PDF_ZOOM_STORAGE_KEY))
        return Number.isFinite(value) && value >= MIN_ZOOM && value <= MAX_ZOOM ? value : 1
      } catch {
        return 1
      }
    }

    function savePdfZoom(value) {
      try {
        window.localStorage.setItem(PDF_ZOOM_STORAGE_KEY, String(value))
      } catch {
        // a storage failure only loses the preference
      }
    }

    // ── 文稿选择（reader）────────────────────────────────────────────
    // 只存文件名（与工作区无关，跨会话共享）：面板重开时回到上次看的那一篇；
    // 文件被删除或不在当前工作区时由面板回退到最新一篇。
    function readLastTranscript() {
      try {
        const value = String(window.localStorage.getItem(TRANSCRIPT_STORAGE_KEY) ?? '').trim()
        return value === '' ? null : value
      } catch {
        return null
      }
    }

    function saveLastTranscript(file) {
      if (typeof file !== 'string' || file === '') return
      try {
        window.localStorage.setItem(TRANSCRIPT_STORAGE_KEY, file)
      } catch {
        // a storage failure only loses the preference
      }
    }

    // ── 背记（recall）────────────────────────────────────────────────
    // 练习方式偏好只存浏览器本地；RECALL_GRADES 的顺序 = 评分按钮顺序 = 快捷键 1–4。
    // 自动判定是纯前端启发式：只决定「推荐档位」，最终以用户自评四档为准。
    const RECALL_MODE_STORAGE_KEY = 'english-practice:recall-mode'
    const RECALL_MODES = ['mix', 'en-zh', 'zh-en']
    const RECALL_GRADES = ['again', 'hard', 'good', 'easy']

    function readRecallMode() {
      try {
        const value = String(window.localStorage.getItem(RECALL_MODE_STORAGE_KEY) ?? '')
        return RECALL_MODES.includes(value) ? value : null
      } catch {
        return null
      }
    }

    function saveRecallMode(value) {
      if (!RECALL_MODES.includes(value)) return
      try {
        window.localStorage.setItem(RECALL_MODE_STORAGE_KEY, value)
      } catch {
        // a storage failure only loses the preference
      }
    }

    /** 英→中/中→英的英文答案归一化：trim → 小写 → 去掉开头的 to / 冠词 → 只留字母数字与连字符。 */
    function normalizeEnAnswer(text) {
      let value = String(text ?? '').trim().toLowerCase()
      value = value.replace(/^to\s+/, '').replace(/^(?:a|an|the)\s+/, '')
      return value.replace(/[^a-z0-9-]/g, '')
    }

    /** 中文答案归一化：去掉所有空白与中英文标点。 */
    function normalizeZhAnswer(text) {
      return String(text ?? '')
        .replace(/\s+/g, '')
        .replace(/[，。、；：！？,.!?;:'"“”‘’（）()【】\[\]{}<>《》…—–\-~·`\/]/g, '')
    }

    /** 短字符串编辑距离（单词一般 < 20 字符，O(n*m) 足够）。 */
    function levenshtein(a, b) {
      const left = String(a ?? '')
      const right = String(b ?? '')
      if (left === right) return 0
      if (left === '' || right === '') return left.length + right.length
      let previous = []
      for (let index = 0; index <= right.length; index += 1) previous.push(index)
      for (let i = 1; i <= left.length; i += 1) {
        const current = [i]
        for (let j = 1; j <= right.length; j += 1) {
          const cost = left[i - 1] === right[j - 1] ? 0 : 1
          current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        }
        previous = current
      }
      return previous[right.length]
    }

    /** 最长公共子序列长度（中文释义「接近」判定用）。 */
    function lcsLength(a, b) {
      const left = String(a ?? '')
      const right = String(b ?? '')
      if (left === '' || right === '') return 0
      let previous = new Array(right.length + 1).fill(0)
      for (let i = 1; i <= left.length; i += 1) {
        const current = new Array(right.length + 1).fill(0)
        for (let j = 1; j <= right.length; j += 1) {
          current[j] = left[i - 1] === right[j - 1]
            ? previous[j - 1] + 1
            : Math.max(previous[j], current[j - 1])
        }
        previous = current
      }
      return previous[right.length]
    }

    const RECALL_VERDICT_WRONG = Object.freeze({ verdict: 'wrong', recommended: 'again' })
    const RECALL_VERDICT_CLOSE = Object.freeze({ verdict: 'close', recommended: 'hard' })
    const RECALL_VERDICT_CORRECT = Object.freeze({ verdict: 'correct', recommended: 'good' })

    /**
     * 背记自动判定（纯函数，不落后端）：
     * - 空答案 → wrong / again；
     * - 中→英：与 word / family 词形规范化后比较，相等 → correct；编辑距离 ≤ 阈值 → close；
     * - 英→中：释义（含按「；，、/」拆出的子片段）相等/互相包含 → correct；LCS 相似度 ≥ 0.6 → close。
     */
    function judgeAnswer(mode, answer, item) {
      const raw = String(answer ?? '').trim()
      if (raw === '') return RECALL_VERDICT_WRONG
      if (mode === 'zh-en') {
        const normalized = normalizeEnAnswer(raw)
        if (normalized === '') return RECALL_VERDICT_WRONG
        const word = normalizeEnAnswer(item?.word)
        const forms = (Array.isArray(item?.family) ? item.family : [])
          .map((entry) => normalizeEnAnswer(entry?.form))
          .filter((value) => value !== '')
        if (normalized === word || forms.includes(normalized)) return RECALL_VERDICT_CORRECT
        let distance = word === '' ? Infinity : levenshtein(normalized, word)
        for (const form of forms) distance = Math.min(distance, levenshtein(normalized, form))
        return distance <= (word.length >= 6 ? 2 : 1) ? RECALL_VERDICT_CLOSE : RECALL_VERDICT_WRONG
      }
      const normalized = normalizeZhAnswer(raw)
      if (normalized === '') return RECALL_VERDICT_WRONG
      const candidates = []
      for (const meaning of collapseMeanings(item?.meanings)) {
        const zh = String(meaning?.zh ?? '')
        const whole = normalizeZhAnswer(zh)
        if (whole !== '') candidates.push(whole)
        for (const part of zh.split(/[；;，,、/]/)) {
          const fragment = normalizeZhAnswer(part)
          if (fragment !== '') candidates.push(fragment)
        }
      }
      if (candidates.includes(normalized)) return RECALL_VERDICT_CORRECT
      for (const candidate of candidates) {
        if (normalized.length >= 2 && candidate.includes(normalized)) return RECALL_VERDICT_CORRECT
        if (candidate.length >= 2 && normalized.includes(candidate)) return RECALL_VERDICT_CORRECT
      }
      let best = 0
      for (const candidate of candidates) {
        const denominator = Math.max(1, Math.min(normalized.length, candidate.length))
        best = Math.max(best, lcsLength(normalized, candidate) / denominator)
      }
      return best >= 0.6 ? RECALL_VERDICT_CLOSE : RECALL_VERDICT_WRONG
    }

    /** YYYY-MM-DD 加减天数（只用于柱状图日期序列与「明天」标签，按 UTC 计算避免时区漂移）。 */
    function shiftDateString(date, delta) {
      const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''))
      if (matched === null) return ''
      const base = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
      const shifted = new Date(base + Number(delta) * 86400000)
      return shifted.getUTCFullYear() + '-' + String(shifted.getUTCMonth() + 1).padStart(2, '0') + '-' + String(shifted.getUTCDate()).padStart(2, '0')
    }

    /** nextAt 的展示文案：今天 / 明天 / 具体日期；缺失或无效返回 '-'。 */
    function recallNextLabel(t, nextAt, today) {
      if (typeof nextAt !== 'string' || nextAt === '') return '-'
      if (today !== '' && nextAt <= today) return t('recall.nextToday')
      if (today !== '' && nextAt === shiftDateString(today, 1)) return t('recall.nextTomorrow')
      return t('recall.nextDate', { date: nextAt })
    }

    /**
     * 取生词本例句里包含目标词的那一句（例句可能是整段，过长时围绕命中位置截断并加省略号）。
     * 没有任何命中时退回整段（超长截断），供「显示例句」提示使用。
     */
    function recallExampleOf(item) {
      const sentence = String(item?.sentence ?? '').trim()
      if (sentence === '') return ''
      const terms = [item?.word, ...(Array.isArray(item?.family) ? item.family.map((entry) => entry?.form) : [])]
        .filter((term) => typeof term === 'string' && term.trim() !== '')
        .map((term) => term.trim())
      let hit = -1
      for (const term of terms) {
        const index = sentence.search(new RegExp('\\b' + escapeRegExp(term) + '\\b', 'i'))
        if (index >= 0 && (hit < 0 || index < hit)) hit = index
      }
      if (hit < 0) return sentence.length > 220 ? sentence.slice(0, 220).trimEnd() + '…' : sentence
      const head = sentence.slice(0, hit)
      const breakIndex = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('\n'))
      const start = Math.max(0, Math.max(hit - 140, breakIndex >= 0 ? breakIndex + 2 : 0))
      const tail = sentence.slice(hit)
      const endMatch = /[.!?](?=\s|$)/.exec(tail)
      const end = Math.min(sentence.length, endMatch !== null ? hit + endMatch.index + 1 : hit + 180)
      let result = sentence.slice(start, end).trim()
      if (start > 0) result = '…' + result
      if (end < sentence.length) result = result + '…'
      return result
    }

    /** 把例句里的目标词（含词形）替换成等长下划线；中→英模式下用它做「显示例句」提示。 */
    function maskExampleTerms(text, item) {
      let result = String(text ?? '')
      const terms = [item?.word, ...(Array.isArray(item?.family) ? item.family.map((entry) => entry?.form) : [])]
      for (const term of terms) {
        const value = typeof term === 'string' ? term.trim() : ''
        if (value === '') continue
        const blank = '_'.repeat(Math.min(24, Math.max(3, value.length)))
        result = result.replace(new RegExp('\\b' + escapeRegExp(value) + '\\b', 'gi'), blank)
      }
      return result
    }

    function parseLoose(text) {
      const source = String(text ?? '').trim()
      if (source === '') return {}
      try {
        return JSON.parse(source)
      } catch {
        return {}
      }
    }

    function classify(text) {
      const value = String(text ?? '').trim()
      if (value === '') return 'word'
      if (value.length > 60) return 'sentence'
      if (/[.!?。！？…]$/.test(value)) return 'sentence'
      if (value.split(/\s+/).length > 4) return 'sentence'
      return 'word'
    }

    function sentenceAround(segmentText, selected) {
      const text = String(segmentText ?? '')
      const needle = String(selected ?? '').trim()
      if (needle === '' || text === '') return text.trim()
      const index = text.indexOf(needle)
      if (index < 0) return text.trim()
      let start = 0
      for (const mark of ['.', '?', '!', '。', '？', '！']) {
        const found = text.lastIndexOf(mark, Math.max(0, index - 1))
        if (found >= 0) start = Math.max(start, found + 1)
      }
      let end = text.length
      for (const mark of ['.', '?', '!', '。', '？', '！']) {
        const found = text.indexOf(mark, index + needle.length - 1)
        if (found >= 0) end = Math.min(end, found + 1)
      }
      const sentence = text.slice(start, end).trim()
      return sentence === '' ? text.trim() : sentence
    }

    function speakerName(t, transcript, id) {
      const speakers = Array.isArray(transcript?.speakers) ? transcript.speakers : []
      const index = speakers.findIndex((speaker) => String(speaker.id) === String(id))
      if (index >= 0 && speakers[index].label) return speakers[index].label
      return t('reader.speaker', { n: String(id) })
    }

    // ── 生词本义项合并（展示）──────────────────────────────────────
    // 与宿主 host/text.js 的 collapseMeanings 同一规则：中文义项按 ；/;，,、/ 切成片段，
    // 一个片段集合被另一个完全覆盖时视为同一条释义（更完整的写法胜出、证据回填）；
    // 跨词性只在「严格包含」时合并，避免把 n. 增加 / v. 增加 这类同词不同性的义项吞掉。
    // 只用于展示：不改写磁盘数据。
    const MEANING_ATOM_SPLIT = /[；;，,、/]/

    function meaningAtoms(zh) {
      const atoms = []
      const seen = new Set()
      for (const piece of String(zh ?? '').split(MEANING_ATOM_SPLIT)) {
        const atom = piece.trim()
        if (atom === '' || seen.has(atom)) continue
        seen.add(atom)
        atoms.push(atom)
      }
      return atoms
    }

    function atomCoveredByMeaning(atom, cover) {
      if (atom === cover) return true
      return atom.length >= 2 && cover.includes(atom)
    }

    function atomsCoverMeaning(coverAtoms, targetAtoms) {
      if (targetAtoms.length === 0 || coverAtoms.length === 0) return false
      return targetAtoms.every((atom) => coverAtoms.some((cover) => atomCoveredByMeaning(atom, cover)))
    }

    function atomsStrictlyContainMeaning(biggerAtoms, smallerAtoms) {
      return smallerAtoms.length < biggerAtoms.length && atomsCoverMeaning(biggerAtoms, smallerAtoms)
    }

    function hasMeaningExample(meaning) {
      return typeof meaning.example === 'string' && meaning.example !== ''
    }

    function hasMeaningSource(meaning) {
      return meaning.source !== null && typeof meaning.source === 'object' && !Array.isArray(meaning.source)
    }

    /** 两条义项是否在讲同一件事；合并后返回新对象，无关返回 null。 */
    function mergeMeaningPair(left, right) {
      if (!left || typeof left !== 'object' || !right || typeof right !== 'object') return null
      const leftZh = String(left.zh ?? '').trim()
      const rightZh = String(right.zh ?? '').trim()
      if (leftZh === '' || rightZh === '') return null
      const leftAtoms = meaningAtoms(leftZh)
      const rightAtoms = meaningAtoms(rightZh)
      const leftCovers = atomsCoverMeaning(leftAtoms, rightAtoms)
      const rightCovers = atomsCoverMeaning(rightAtoms, leftAtoms)
      if (!leftCovers && !rightCovers) return null
      const leftPos = String(left.pos ?? '').trim()
      const rightPos = String(right.pos ?? '').trim()
      if (leftPos !== '' && rightPos !== '' && leftPos.toLowerCase() !== rightPos.toLowerCase()) {
        if (!atomsStrictlyContainMeaning(leftAtoms, rightAtoms) && !atomsStrictlyContainMeaning(rightAtoms, leftAtoms)) return null
      }
      const keepRight = rightCovers && !leftCovers
      const keep = keepRight ? right : left
      const drop = keepRight ? left : right
      const merged = {
        ...keep,
        pos: String(keep.pos ?? '').trim() || String(drop.pos ?? '').trim(),
        zh: String(keep.zh ?? '').trim(),
      }
      if (!hasMeaningExample(merged) && hasMeaningExample(drop)) merged.example = drop.example
      if (!hasMeaningSource(merged) && hasMeaningSource(drop)) merged.source = drop.source
      return merged
    }

    /** 折叠讲同一件事的义项；顺序保留首次出现，证据不丢，入参不被修改。 */
    function collapseMeanings(raw) {
      const items = []
      for (const meaning of Array.isArray(raw) ? raw : []) {
        if (!meaning || typeof meaning !== 'object' || Array.isArray(meaning)) continue
        const zh = String(meaning.zh ?? '').trim()
        if (zh === '') continue
        items.push({ ...meaning, pos: String(meaning.pos ?? '').trim(), zh })
      }
      let changed = true
      while (changed) {
        changed = false
        for (let index = 0; index < items.length && !changed; index += 1) {
          for (let other = index + 1; other < items.length; other += 1) {
            const merged = mergeMeaningPair(items[index], items[other])
            if (merged === null) continue
            items[index] = merged
            items.splice(other, 1)
            changed = true
            break
          }
        }
      }
      return items
    }

    // ── 图谱（graph）────────────────────────────────────────────────
    // 布局与筛选全是纯函数：确定性初始位置（黄金角螺旋 + id 抖动）、
    // Fruchterman–Reingold 力导向步进、视图拟合、邻居与搜索匹配。
    // 依赖方向：只引用 §0 常量；DOM / Canvas 交互在 §6 hook，视图在 §7。

    function readGraphFilter() {
      try {
        const value = String(window.localStorage.getItem(GRAPH_FILTER_STORAGE_KEY) ?? '')
        return GRAPH_FILTERS.includes(value) ? value : 'all'
      } catch {
        return 'all'
      }
    }

    function saveGraphFilter(value) {
      if (!GRAPH_FILTERS.includes(value)) return
      try {
        window.localStorage.setItem(GRAPH_FILTER_STORAGE_KEY, value)
      } catch {
        // a storage failure only loses the preference
      }
    }

    /** Which relation kinds the segmented filter keeps visible. */
    function graphLinkVisible(kind, filter) {
      if (filter === 'doc') return kind === 'appears'
      if (filter === 'word') return kind === 'cooccur' || kind === 'morph' || kind === 'sense'
      return true
    }

    /** Deterministic 0..1 hash used for the initial position jitter (no Math.random). */
    function graphHash(text) {
      const source = String(text ?? '')
      let hash = 2166136261
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0) / 4294967295
    }

    function graphNodeRadius(node) {
      if (node?.kind === 'transcript') return 9
      const degree = Number(node?.degree)
      return 4.5 + Math.min(6, Math.sqrt(Number.isFinite(degree) && degree > 0 ? degree : 0) * 1.7)
    }

    function graphNodeLabel(node, max) {
      const limit = Number.isFinite(max) ? Math.max(4, Math.trunc(max)) : 20
      const raw = node?.kind === 'transcript'
        ? String(node?.title ?? node?.file ?? '')
        : String(node?.word ?? '')
      const text = raw.trim()
      return text.length > limit ? text.slice(0, limit - 1) + '…' : text
    }

    function graphMatchesQuery(node, query) {
      const text = String(query ?? '').trim().toLowerCase()
      if (text === '') return true
      const label = node?.kind === 'transcript'
        ? String(node?.title ?? node?.file ?? '')
        : String(node?.word ?? '')
      return label.toLowerCase().includes(text)
    }

    /** Up to 20 matching nodes, stable order (words first, then transcripts, each by label). */
    function graphSearchNodes(nodes, query) {
      const text = String(query ?? '').trim()
      if (text === '') return []
      const matches = []
      for (const node of Array.isArray(nodes) ? nodes : []) {
        if (!graphMatchesQuery(node, text)) continue
        matches.push(node)
        if (matches.length >= 60) break
      }
      matches.sort((left, right) => (
        (left.kind === 'word' ? 0 : 1) - (right.kind === 'word' ? 0 : 1)
        || String(left.kind === 'word' ? left.word : left.title).localeCompare(String(right.kind === 'word' ? right.word : right.title))
      ))
      return matches.slice(0, 20)
    }

    /** Narrow the graph to one transcript: the transcript node plus the words it contains. */
    function graphScopedData(data, scopeFile) {
      if (!data || typeof data !== 'object') return data
      const file = typeof scopeFile === 'string' ? scopeFile.trim() : ''
      if (file === '') return data
      const transcriptId = 't:' + file
      const allowed = new Set([transcriptId])
      for (const link of Array.isArray(data.links) ? data.links : []) {
        if (link.kind !== 'appears') continue
        if (link.source === transcriptId) allowed.add(link.target)
      }
      const nodes = (Array.isArray(data.nodes) ? data.nodes : []).filter((node) => allowed.has(node.id))
      const ids = new Set(nodes.map((node) => node.id))
      const links = (Array.isArray(data.links) ? data.links : []).filter((link) => ids.has(link.source) && ids.has(link.target))
      return { ...data, nodes, links }
    }

    /** Build the deterministic force simulation for one payload. */
    function graphCreateSim(data, width, height) {
      const w = Math.max(1, width)
      const h = Math.max(1, height)
      const nodes = Array.isArray(data?.nodes) ? data.nodes : []
      const links = Array.isArray(data?.links) ? data.links : []
      const k = Math.sqrt((w * h) / Math.max(1, nodes.length))
      const centerX = w / 2
      const centerY = h / 2
      const simNodes = []
      const byId = new Map()
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        const angle = index * 2.399963229728653
        const radius = Math.min(w, h) * 0.36 * Math.sqrt((index + 0.5) / Math.max(1, nodes.length))
        const jitter = graphHash(String(node.id) + ':' + String(index))
        const simNode = {
          id: node.id,
          kind: node.kind,
          mastery: Number.isFinite(Number(node.mastery)) ? Math.max(0, Math.trunc(Number(node.mastery))) : 0,
          degree: Number.isFinite(Number(node.degree)) ? Math.max(0, Math.trunc(Number(node.degree))) : 0,
          x: centerX + Math.cos(angle) * radius + (jitter - 0.5) * 6,
          y: centerY + Math.sin(angle) * radius + (jitter - 0.5) * 6,
          dx: 0,
          dy: 0,
          fixed: false,
        }
        simNodes.push(simNode)
        byId.set(simNode.id, simNode)
      }
      const simLinks = []
      for (const link of links) {
        const source = byId.get(link.source)
        const target = byId.get(link.target)
        if (source === undefined || target === undefined) continue
        simLinks.push({
          link,
          source,
          target,
          weight: link.kind === 'appears' ? 0.75 : 1,
        })
      }
      return { nodes: simNodes, links: simLinks, width: w, height: h, k, temperature: k * 0.12, settled: false, byId }
    }

    /** Warm the layout up again (after a drag) so the rest of the graph makes room. */
    function graphReheat(sim) {
      if (!sim) return
      sim.settled = false
      // 回到初始温度（k * 0.12）的大约三分之二，让周围的节点重新让位；
      // 温度过低会在下一步就被判定为 settled，拖动后其它节点不会动。
      sim.temperature = Math.max(sim.temperature, Math.max(GRAPH_REHEAT_MIN, sim.k * GRAPH_REHEAT_FACTOR))
    }

    /**
     * One Fruchterman–Reingold iteration: repulsion k²/d, attraction d²/k along
     * every edge, displacement capped by the cooling temperature. Returns the
     * mean displacement (energie proxy) and flags `settled` when cooled down.
     */
    function graphStepSim(sim) {
      const nodes = sim.nodes
      if (nodes.length === 0) {
        sim.settled = true
        return 0
      }
      const k = Math.max(1, sim.k)
      for (const node of nodes) {
        node.dx = 0
        node.dy = 0
      }
      for (let a = 0; a < nodes.length; a += 1) {
        const left = nodes[a]
        for (let b = a + 1; b < nodes.length; b += 1) {
          const right = nodes[b]
          let dx = left.x - right.x
          let dy = left.y - right.y
          let distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 0.01) {
            dx = 0.37 * (b + 1)
            dy = 0.61 * (a + 1)
            distance = Math.sqrt(dx * dx + dy * dy)
          }
          const force = (k * k) / distance
          const ux = dx / distance
          const uy = dy / distance
          left.dx += ux * force
          left.dy += uy * force
          right.dx -= ux * force
          right.dy -= uy * force
        }
      }
      for (const link of sim.links) {
        const dx = link.target.x - link.source.x
        const dy = link.target.y - link.source.y
        const distance = Math.max(0.01, Math.sqrt(dx * dx + dy * dy))
        const force = ((distance * distance) / k) * link.weight
        const ux = (dx / distance) * force
        const uy = (dy / distance) * force
        link.source.dx += ux
        link.source.dy += uy
        link.target.dx -= ux
        link.target.dy -= uy
      }
      const temperature = Math.max(0.4, sim.temperature)
      let energy = 0
      for (const node of nodes) {
        if (node.fixed) continue
        const magnitude = Math.sqrt(node.dx * node.dx + node.dy * node.dy)
        if (magnitude < 0.0001) continue
        const limited = Math.min(magnitude, temperature)
        node.x = Math.min(sim.width - 10, Math.max(10, node.x + (node.dx / magnitude) * limited))
        node.y = Math.min(sim.height - 10, Math.max(10, node.y + (node.dy / magnitude) * limited))
        energy += limited
      }
      sim.temperature *= GRAPH_COOLING
      if (sim.temperature < GRAPH_SETTLE_TEMPERATURE) sim.settled = true
      return energy / nodes.length
    }

    function graphBounds(sim) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const node of sim.nodes) {
        const radius = graphNodeRadius(node) + 16
        minX = Math.min(minX, node.x - radius)
        minY = Math.min(minY, node.y - radius)
        maxX = Math.max(maxX, node.x + radius)
        maxY = Math.max(maxY, node.y + radius)
      }
      if (!Number.isFinite(minX)) return null
      return { minX, minY, maxX, maxY }
    }

    /** View transform `screen = world * scale + t` that fits every node with padding. */
    function graphFitView(sim, width, height, padding) {
      const pad = Number.isFinite(padding) ? padding : 18
      const bounds = graphBounds(sim)
      if (bounds === null || width < 2 || height < 2) return { scale: 1, tx: width / 2, ty: height / 2 }
      const spanX = Math.max(24, bounds.maxX - bounds.minX)
      const spanY = Math.max(24, bounds.maxY - bounds.minY)
      const scale = Math.min(
        GRAPH_MAX_SCALE,
        Math.max(GRAPH_MIN_SCALE, Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)),
      )
      return {
        scale,
        tx: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
        ty: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
      }
    }

    /** Undirected neighbour set of one node id (highlight/dimming). */
    function graphNeighbors(links, id) {
      const map = new Map()
      for (const link of Array.isArray(links) ? links : []) {
        if (!map.has(link.source)) map.set(link.source, new Set())
        if (!map.has(link.target)) map.set(link.target, new Set())
        map.get(link.source).add(link.target)
        map.get(link.target).add(link.source)
      }
      return map.get(id) ?? new Set()
    }

    /** Visible degree per node under the current kind filter. */
    function graphVisibleDegrees(links, filter) {
      const degrees = new Map()
      for (const link of Array.isArray(links) ? links : []) {
        if (!graphLinkVisible(link.kind, filter)) continue
        degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1)
        degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1)
      }
      return degrees
    }

    /** Resolve the theme colours through getComputedStyle (falls back to defaults). */
    function graphResolvePalette(element) {
      const palette = { ...GRAPH_COLORS_FALLBACK }
      if (!element || typeof window.getComputedStyle !== 'function') return palette
      let styles
      try {
        styles = window.getComputedStyle(element)
      } catch {
        return palette
      }
      for (const [key, variable] of Object.entries(GRAPH_PALETTE)) {
        const value = String(styles.getPropertyValue(variable) ?? '').trim()
        if (value !== '') palette[key] = value
      }
      return palette
    }

    function fileResourceAddress(sessionId, path) {
      const normalized = String(path ?? '').replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      const encoded = normalized
        .split('/')
        .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
        .join('/')
      return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + encoded
    }

    function hashString(text) {
      const source = String(text ?? '')
      let hash = 5381
      for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) + hash + source.charCodeAt(index)) | 0
      }
      return (hash >>> 0).toString(36)
    }

    function listSignature(list) {
      const items = Array.isArray(list) ? list : []
      try {
        return items.length + ':' + hashString(JSON.stringify(items))
      } catch {
        return String(items.length)
      }
    }

    async function copyText(text) {
      const value = String(text ?? '')
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value)
          return true
        }
      } catch {
        // fall through to the legacy path
      }
      try {
        const area = document.createElement('textarea')
        area.value = value
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '-1000px'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(area)
        return copied === true
      } catch {
        return false
      }
    }

    function isEditableNode(node) {
      if (!node || node.nodeType !== 1) return false
      const tag = node.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return node.isContentEditable === true
    }

    function isEditableFocus() {
      if (typeof document === 'undefined') return false
      return isEditableNode(document.activeElement)
    }

    function isEditableEvent(event) {
      if (isEditableNode(event && event.target)) return true
      return isEditableFocus()
    }

    /** True when a keyboard target is a clickable control whose native activation must win. */
    function isInteractiveTarget(target) {
      if (!target || typeof target.closest !== 'function') return false
      return target.closest('button, a, input, select, textarea, [role="button"], [role="tab"], summary') !== null
    }

    function closestDataElement(node, attribute) {
      let element = node && node.nodeType === 3 ? node.parentElement : node
      while (element && element !== document.body) {
        if (element.getAttribute && element.getAttribute(attribute) !== null) return element
        element = element.parentElement
      }
      return null
    }

    /**
     * Build the lookup payload for a text selection.
     * Supports selections inside one transcript segment, selections that span several segments,
     * selections inside one PDF line, and selections that span PDF lines or pages.
     */
    function selectionLookupPayload(context, raw, style) {
      const segments = Array.isArray(context.segments) ? context.segments : EMPTY_SEGMENTS
      const pages = Array.isArray(context.pages) ? context.pages : EMPTY_PAGES
      const range = context.range
      const kind = classify(raw)
      const baseSource = { transcript: context.file ?? '', title: context.title ?? '', speaker: '', startMs: 0 }
      if (!range) return { kind, text: raw, sentence: raw, source: baseSource, style }

      const startLine = closestDataElement(range.startContainer, 'data-egl-line')
      const endLine = closestDataElement(range.endContainer, 'data-egl-line')
      if (startLine !== null && endLine !== null) {
        const pageIndex = Number(startLine.getAttribute('data-egl-page'))
        const lineIndex = Number(startLine.getAttribute('data-egl-line'))
        const line = pages[pageIndex]?.lines?.[lineIndex]
        if (line) {
          let sentence = sentenceAround(line.text, raw)
          const endPageIndex = Number(endLine.getAttribute('data-egl-page'))
          const endLineIndex = Number(endLine.getAttribute('data-egl-line'))
          if (pageIndex !== endPageIndex || lineIndex !== endLineIndex) {
            const tailLine = pages[endPageIndex]?.lines?.[endLineIndex]
            const tail = tailLine ? sentenceAround(tailLine.text, raw) : ''
            if (tail !== '' && tail !== sentence) sentence = (sentence + ' ' + tail).trim()
          }
          return { kind, text: raw, sentence, source: baseSource, style }
        }
      }

      const startSegment = closestDataElement(range.startContainer, 'data-egl-seg')
      if (startSegment !== null) {
        const index = Number(startSegment.getAttribute('data-egl-seg'))
        const segment = segments[index]
        if (segment) {
          let sentence = sentenceAround(segment.text, raw)
          const endSegment = closestDataElement(range.endContainer, 'data-egl-seg')
          if (endSegment !== null && endSegment !== startSegment) {
            const endIndex = Number(endSegment.getAttribute('data-egl-seg'))
            const tailSegment = segments[endIndex]
            const tail = tailSegment ? sentenceAround(tailSegment.text, raw) : ''
            if (tail !== '' && tail !== sentence) sentence = (sentence + ' ' + tail).trim()
          }
          return {
            kind,
            text: raw,
            sentence,
            source: {
              transcript: context.file ?? '',
              title: context.title ?? '',
              speaker: String(segment.speaker ?? ''),
              startMs: Number(segment.start) || 0,
            },
            style,
          }
        }
      }

      // Selections that cross segment/page boundaries but still start inside the panel:
      // keep the selected text as its own context instead of silently dropping the lookup.
      return { kind, text: raw, sentence: raw, source: baseSource, style }
    }

    function envHasProblems(env) {
      if (!env || typeof env !== 'object') return false
      const bl = env.bl && typeof env.bl === 'object' ? env.bl : {}
      const pdf = env.pdf && typeof env.pdf === 'object' ? env.pdf : {}
      const workspace = env.workspace && typeof env.workspace === 'object' ? env.workspace : {}
      if (bl.present !== true) return true
      if (bl.authenticated === false) return true
      if (pdf.present !== true) return true
      if (workspace.writable === false) return true
      if (workspace.transcripts === false || workspace.vocab === false || workspace.recordings === false) return true
      return false
    }

    function highlight(text, word) {
      const source = String(text ?? '')
      const target = String(word ?? '').trim()
      if (source === '' || target === '') return source
      const index = source.toLowerCase().indexOf(target.toLowerCase())
      if (index < 0) return source
      return [
        source.slice(0, index),
        h('mark', { key: 'mark' }, source.slice(index, index + target.length)),
        source.slice(index + target.length),
      ]
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')
    }

    /** Build the dashed-underline matcher for every word/phrase already in the wordbook. */
    function knownWordPattern(words) {
      const normalized = []
      for (const entry of Array.isArray(words) ? words : []) {
        if (entry?.kind === 'sentence') continue
        const value = String(entry?.normalized ?? '').trim()
        if (value !== '' && !normalized.includes(value)) normalized.push(value)
      }
      if (normalized.length === 0) return undefined
      normalized.sort((a, b) => b.length - a.length)
      const source = normalized.slice(0, 800).map(escapeRegExp).join('|')
      try {
        return new RegExp("(?<![A-Za-z'])(?:" + source + ")(?![A-Za-z'])", 'gi')
      } catch {
        return undefined
      }
    }

    /** Split one paragraph into plain text and underlined known words. */
    function renderKnownText(text, pattern, label) {
      const value = String(text ?? '')
      if (pattern === undefined || value === '') return value
      const parts = []
      let last = 0
      let index = 0
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(value)) !== null) {
        if (match.index > last) parts.push(value.slice(last, match.index))
        parts.push(h('span', { key: 'known-' + String(index++), className: 'egl-known', title: label }, match[0]))
        last = match.index + match[0].length
        if (match[0].length === 0) pattern.lastIndex += 1
      }
      if (last < value.length) parts.push(value.slice(last))
      return parts.length > 0 ? parts : value
    }

    function isKnownWord(pattern, word) {
      if (pattern === undefined) return false
      pattern.lastIndex = 0
      const match = pattern.test(word)
      pattern.lastIndex = 0
      return match
    }

    const MATH_SYMBOLS = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
      pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', emptyset: '∅', degree: '°', circ: '°', ldots: '…', cdots: '…', dots: '…', mid: '|', vert: '|', Vert: '‖', langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋',
    }

    function mathReadGroup(source, index) {
      let i = index
      while (source[i] === ' ') i += 1
      if (source[i] === '{') {
        let depth = 0
        const start = i + 1
        for (; i < source.length; i += 1) {
          if (source[i] === '{') depth += 1
          else if (source[i] === '}') {
            depth -= 1
            if (depth === 0) return { content: source.slice(start, i), next: i + 1 }
          }
        }
        return { content: source.slice(start), next: source.length }
      }
      if (source[i] === '\\') {
        const match = /^\\[a-zA-Z]+/.exec(source.slice(i))
        if (match) return { content: match[0], next: i + match[0].length }
        return { content: source.slice(i, i + 2), next: i + 2 }
      }
      return { content: source[i] ?? '', next: i + 1 }
    }

    function mergeMathSegments(segments) {
      const result = []
      for (const segment of Array.isArray(segments) ? segments : []) {
        const text = String(segment?.text ?? '')
        const previous = result[result.length - 1]
        if (previous !== undefined && mathDelimitersOpen(previous.text)) {
          previous.text = previous.text + '\n' + text
          continue
        }
        result.push({ ...segment, text })
      }
      return result
    }

    function mathDelimitersOpen(text) {
      const value = String(text ?? '')
      const dollars = (value.match(/\$\$/g) ?? []).length
      const bracketOpens = (value.match(/\\\[/g) ?? []).length
      const bracketCloses = (value.match(/\\\]/g) ?? []).length
      const parenOpens = (value.match(/\\\(/g) ?? []).length
      const parenCloses = (value.match(/\\\)/g) ?? []).length
      return dollars % 2 === 1 || bracketOpens > bracketCloses || parenOpens > parenCloses
    }

    function renderMath(latex, keyPrefix) {
      const source = String(latex ?? '')
      const nodes = []
      let i = 0
      let counter = 0
      const nextKey = () => keyPrefix + '-' + String(counter++)
      while (i < source.length) {
        const ch = source[i]
        if (ch === '\\') {
          const command = /^\\([a-zA-Z]+)\*?/.exec(source.slice(i))
          if (command) {
            const name = command[1]
            i += command[0].length
            if (name === 'frac') {
              const numerator = mathReadGroup(source, i)
              i = numerator.next
              const denominator = mathReadGroup(source, i)
              i = denominator.next
              nodes.push(h('span', { key: nextKey(), className: 'egl-frac' },
                h('span', { className: 'egl-frac-n' }, renderMath(numerator.content, nextKey())),
                h('span', { className: 'egl-frac-d' }, renderMath(denominator.content, nextKey()))
              ))
            } else if (name === 'sqrt') {
              const body = mathReadGroup(source, i)
              i = body.next
              nodes.push(h('span', { key: nextKey(), className: 'egl-sqrt' }, '√',
                h('span', { className: 'egl-sqrt-body' }, renderMath(body.content, nextKey()))))
            } else if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'mbox') {
              const body = mathReadGroup(source, i)
              i = body.next
              nodes.push(h('span', { key: nextKey(), className: 'egl-math-text' }, body.content))
            } else if (name === 'left' || name === 'right' || name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg') {
              // sizing commands carry no glyph
            } else if (name === 'quad' || name === 'qquad') {
              nodes.push(' ')
            } else if (MATH_SYMBOLS[name] !== undefined) {
              nodes.push(MATH_SYMBOLS[name])
            }
            continue
          }
          const escaped = /^\\(.)/.exec(source.slice(i))
          if (escaped) {
            nodes.push(escaped[1])
            i += 2
          } else {
            i += 1
          }
          continue
        }
        if (ch === '_' || ch === '^') {
          const group = mathReadGroup(source, i + 1)
          i = group.next
          nodes.push(h(ch === '_' ? 'sub' : 'sup', { key: nextKey() }, renderMath(group.content, nextKey())))
          continue
        }
        if (ch === '{') {
          const group = mathReadGroup(source, i)
          i = group.next
          nodes.push(...renderMath(group.content, nextKey()))
          continue
        }
        if (ch === '}') {
          i += 1
          continue
        }
        if (ch === '&') {
          nodes.push('  ')
          i += 1
          continue
        }
        if (ch === '~') {
          nodes.push(' ')
          i += 1
          continue
        }
        nodes.push(ch)
        i += 1
      }
      return nodes
    }

    function renderPlainChunk(text, options) {
      if (text === '') return [text]
      if (options.word) {
        const parts = highlight(text, options.word)
        return Array.isArray(parts) ? parts : [parts]
      }
      if (options.pattern) {
        const parts = renderKnownText(text, options.pattern, options.label)
        return Array.isArray(parts) ? parts : [parts]
      }
      return [text]
    }

    function renderRichText(text, options = {}) {
      const value = String(text ?? '')
      const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g
      const parts = []
      let last = 0
      let chunk = 0
      let index = 0
      let match
      while ((match = regex.exec(value)) !== null) {
        if (match.index > last) {
          parts.push(h('span', { key: 't-' + String(chunk++) }, renderPlainChunk(value.slice(last, match.index), options)))
        }
        const raw = match[0]
        const display = raw.startsWith('$$') || raw.startsWith('\\[')
        const inner = raw.startsWith('$$') ? raw.slice(2, -2) : raw.startsWith('\\[') ? raw.slice(2, -2) : raw.slice(1, -1)
        // Source files often break formulas at every operator; collapse those line breaks.
        const body = inner.replace(/\\\\/g, ' ').replace(/\s+/g, ' ').trim()
        parts.push(h('span', { key: 'math-' + String(index++), className: 'egl-math' + (display ? ' egl-math-display' : '') }, renderMath(body, 'm' + String(index))))
        last = match.index + raw.length
      }
      if (last < value.length) {
        parts.push(h('span', { key: 't-' + String(chunk++) }, renderPlainChunk(value.slice(last), options)))
      }
      return parts.length > 0 ? parts : value
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      const chunk = 0x8000
      let binary = ''
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
      }
      return btoa(binary)
    }

    function toUint8Array(data) {
      if (data instanceof Uint8Array) return data
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      if (Array.isArray(data)) return Uint8Array.from(data)
      if (data && typeof data === 'object' && typeof data.length === 'number') return Uint8Array.from(data)
      return undefined
    }

    function cleanSelectionText(text) {
      return String(text ?? '').trim().replace(/^[\s"'“”‘’()[\]{}.,;:!?…—–-]+|[\s"'“”‘’()[\]{}.,;:!?…—–-]+$/g, '')
    }

    /** Find a stored word/sentence entry for a selection so the popover can skip the model call. */
    function findStoredEntry(words, kind, text) {
      const cleaned = cleanSelectionText(text)
      if (cleaned === '') return undefined
      const wanted = kind === 'sentence' ? cleaned.replace(/\s+/g, ' ').toLowerCase() : cleaned.toLowerCase()
      for (const entry of Array.isArray(words) ? words : []) {
        if (kind === 'sentence') {
          if (entry?.kind === 'sentence' && String(entry.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === wanted) return entry
        } else if (entry?.kind !== 'sentence' && String(entry.normalized ?? '') === wanted) {
          return entry
        }
      }
      return undefined
    }


    // ═══════════════════════════════════════════════════════════════════
    // §4 api 网关（唯一 fetch / workspaceFiles / abort 出口）
    // 符号表：
    //   ApiError / abortError / isAbortError / isApiError — 统一错误（code + 本地化 message）
    //   ERROR_MESSAGE_KEYS — AGENTS.md 错误码 → i18n 键；查不到才回退宿主 message
    //   HTTP_STATUS_CODES — 响应体缺失时按 HTTP 状态码兜底
    //   API_TIMEOUT_MS / API_DEFAULT_TIMEOUT_MS — 每个 action 的超时预算；必须与 Host 网关逐 action 对齐
    //       （import 300s = Host 侧 pdftoppm 180s + pdftotext 120s 的最坏组合；两边同步改，避免漂移）
    //   API_DEDUPE_ACTIONS — 只读 action 允许 in-flight 去重
    //   linkSignal / raceSignal — AbortSignal 组合原语（调用方取消不杀共享请求）
    //   createApi(ctx, sessionId, t, options) — 单会话网关：call / readAll / readBytes / 各 action 方法
    //   apiFor(ctx, sessionId, t) — 按 sessionId 缓存；引用计数归零后 dispose 并清缓存
    // 约束：所有 HTTP 只能经 call() 发出；workspaceFiles 读取共用同一 lifetime signal
    // ═══════════════════════════════════════════════════════════════════
    // 超时预算与 Host 网关一致：客户端预算低于 Host 会让长任务（尤其 PDF 导入）被提前掐断，
    // 高于 Host 则永远等不到响应。Host 侧 import 预算 = pdftoppm 180s + pdftotext 120s = 300s，
    // 因此这里给 300s；改 Host 网关预算时必须同步改这张表。
    const API_DEFAULT_TIMEOUT_MS = 20000
    const API_TIMEOUT_MS = {
      lookup: 25000,
      transcribe: 30000,
      'transcripts.import': 300000,
      'vocab.analyze': 180000,
      'env.check': 15000,
      // Host 侧 graph.overview 预算同为 30s：构建是纯计算且有限额，30s 足够。
      'graph.overview': 30000,
    }
    const API_DEDUPE_ACTIONS = new Set([
      'transcripts.list',
      'recordings.list',
      'models.list',
      'browse.list',
      'job',
      'lookup',
      'env.check',
      'recall.overview',
      'graph.overview',
    ])
    const ERROR_MESSAGE_KEYS = {
      'http/method': 'error.httpMethod',
      'http/forbidden': 'error.httpForbidden',
      'http/origin': 'error.httpOrigin',
      'http/bad-json': 'error.httpBadJson',
      'http/too-large': 'error.httpTooLarge',
      'http/rate-limited': 'error.httpRateLimited',
      'internal': 'error.internal',
      'session/unavailable': 'error.sessionUnavailable',
      'action/unknown': 'error.actionUnknown',
      'config/invalid': 'error.configInvalid',
      'path/invalid': 'error.pathInvalid',
      'path/outside-workspace': 'error.pathOutsideWorkspace',
      'bl/missing': 'error.blMissing',
      'bl/not-authenticated': 'error.blNotAuthenticated',
      'bl/failed': 'error.blFailed',
      'pdf/poppler-missing': 'error.popplerMissing',
      'pdf/render-failed': 'error.pdfRenderFailed',
      'pdf/too-large': 'error.pdfRejected',
      'transcript/not-found': 'error.transcriptNotFound',
      'transcript/invalid-name': 'error.transcriptInvalidName',
      'transcript/invalid-format': 'error.transcript',
      'transcript/empty': 'error.transcriptEmpty',
      'import/unsupported-format': 'error.importUnsupported',
      'import/too-large': 'error.importRejected',
      'import/empty': 'error.importEmpty',
      'lookup/failed': 'error.lookup',
      'vocab/invalid-entry': 'error.vocabInvalidEntry',
      'vocab/not-found': 'error.vocabNotFound',
      'analysis/disabled': 'error.analysisDisabled',
      'job/not-found': 'error.jobNotFound',
      'job/failed': 'error.jobFailed',
      'recall/invalid': 'error.recallInvalid',
      'recall/not-found': 'error.recallNotFound',
    }
    const HTTP_STATUS_CODES = {
      403: 'http/forbidden',
      413: 'http/too-large',
      429: 'http/rate-limited',
      500: 'internal',
    }

    class ApiError extends Error {
      constructor(code, message, extra = {}) {
        super(message)
        this.name = 'ApiError'
        this.code = code
        this.params = extra.params
        this.status = extra.status
        this.hostMessage = extra.hostMessage
        this.aborted = extra.aborted === true
      }
    }

    function abortError() {
      return new ApiError('error/aborted', 'aborted', { aborted: true })
    }

    function isAbortError(error) {
      if (!error) return false
      if (error.aborted === true) return true
      if (error.name === 'AbortError') return true
      return error.code === 'error/aborted'
    }

    function isApiError(error) {
      return error instanceof ApiError
    }

    /** 错误码 → 本地文案；未知错误码回退宿主 message，最后回退通用文案。 */
    function localizedApiMessage(t, code, params, hostMessage) {
      const key = typeof code === 'string' ? ERROR_MESSAGE_KEYS[code] : undefined
      if (key !== undefined) {
        try {
          return t(key, params)
        } catch {
          return t(key)
        }
      }
      const fallback = typeof hostMessage === 'string' ? hostMessage.trim() : ''
      if (fallback !== '') return fallback
      return t('error.generic')
    }

    function linkSignal(signal, controller) {
      if (!signal) return () => {}
      if (signal.aborted === true) {
        controller.abort()
        return () => {}
      }
      const onAbort = () => controller.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      return () => signal.removeEventListener('abort', onAbort)
    }

    function raceSignal(promise, signal) {
      if (!signal) return promise
      if (signal.aborted === true) return Promise.reject(abortError())
      return new Promise((resolve, reject) => {
        let settled = false
        const cleanup = () => signal.removeEventListener('abort', onAbort)
        const onAbort = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(abortError())
        }
        signal.addEventListener('abort', onAbort, { once: true })
        promise.then(
          (value) => {
            if (settled) return
            settled = true
            cleanup()
            resolve(value)
          },
          (error) => {
            if (settled) return
            settled = true
            cleanup()
            reject(error)
          }
        )
      })
    }

    function createApi(ctx, sessionId, t, options = {}) {
      const lifetime = new AbortController()
      const inflight = new Map()
      const onIdle = typeof options.onIdle === 'function' ? options.onIdle : () => {}
      let refs = 0
      let disposed = false
      let disposeTimer

      function dispose() {
        if (disposed) return
        disposed = true
        if (disposeTimer !== undefined) {
          clearTimeout(disposeTimer)
          disposeTimer = undefined
        }
        lifetime.abort()
        inflight.clear()
      }

      function toApiError(body, status) {
        const code = body && typeof body.code === 'string' && body.code !== ''
          ? body.code
          : (HTTP_STATUS_CODES[status] ?? 'internal')
        const params = body && body.params && typeof body.params === 'object' ? body.params : undefined
        const hostMessage = body && typeof body.message === 'string' ? body.message : undefined
        return new ApiError(code, localizedApiMessage(t, code, params, hostMessage), { params, status, hostMessage })
      }

      async function runRequest(action, payload) {
        const timeoutMs = Number.isFinite(API_TIMEOUT_MS[action]) ? API_TIMEOUT_MS[action] : API_DEFAULT_TIMEOUT_MS
        const controller = new AbortController()
        const unlink = linkSignal(lifetime.signal, controller)
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
        try {
          const response = await fetch(API_PATH, {
            method: 'POST',
            headers: API_HEADER,
            body: JSON.stringify({ action, sessionId, payload: payload ?? {} }),
            signal: controller.signal,
          })
          let body
          try {
            body = await response.json()
          } catch {
            body = undefined
          }
          if (!body || body.ok !== true) throw toApiError(body, response.status)
          return body.value
        } catch (error) {
          if (isApiError(error)) throw error
          if (disposed || lifetime.signal.aborted === true) throw abortError()
          if (timedOut) throw new ApiError('error/timeout', t('error.timeout'))
          if (isAbortError(error)) throw abortError()
          throw new ApiError('error/network', t('error.network'))
        } finally {
          clearTimeout(timer)
          unlink()
        }
      }

      /**
       * 唯一 HTTP 出口：超时 + 调用方 AbortSignal + in-flight 去重。
       * 只读 action 会加入完全相同的在途请求；写操作永不合并。
       */
      function call(action, payload, requestOptions = {}) {
        if (disposed || lifetime.signal.aborted === true) return Promise.reject(abortError())
        const signal = requestOptions.signal
        if (requestOptions.dedupe === false || !API_DEDUPE_ACTIONS.has(action)) {
          return raceSignal(runRequest(action, payload), signal)
        }
        const key = action + '|' + JSON.stringify(payload ?? {})
        let shared = inflight.get(key)
        if (shared === undefined) {
          const created = runRequest(action, payload)
          shared = created
          const cleanup = () => {
            if (inflight.get(key) === created) inflight.delete(key)
          }
          created.then(cleanup, cleanup)
          inflight.set(key, created)
        }
        return raceSignal(shared, signal)
      }

      function readAll(path, requestOptions = {}) {
        const signal = requestOptions.signal
        if (disposed || lifetime.signal.aborted === true) return Promise.reject(abortError())
        const key = 'read|' + path
        let shared = inflight.get(key)
        if (shared === undefined) {
          const created = (async () => {
            let offset = 1
            const parts = []
            for (let page = 0; page < 60; page += 1) {
              if (disposed || lifetime.signal.aborted === true) throw abortError()
              const result = await ctx.remote.workspaceFiles.read(sessionId, path, { offset, limit: 4000 }, lifetime.signal)
              if (!result || result.ok !== true) {
                const failure = result && result.error && typeof result.error === 'object' ? result.error : {}
                if (failure.code === 'workspace-file/not-found') return undefined
                throw new ApiError(
                  typeof failure.code === 'string' ? failure.code : 'internal',
                  localizedApiMessage(t, failure.code, undefined, failure.message)
                )
              }
              const content = result.value && typeof result.value === 'object' ? result.value : {}
              parts.push(typeof content.text === 'string' ? content.text : '')
              if (content.eof === true) break
              if (!content.lines) break
              offset += content.lines
            }
            return parts.join('\n')
          })()
          shared = created
          const cleanup = () => {
            if (inflight.get(key) === created) inflight.delete(key)
          }
          created.then(cleanup, cleanup)
          inflight.set(key, created)
        }
        return raceSignal(shared, signal)
      }

      function readBytes(path, requestOptions = {}) {
        const signal = requestOptions.signal
        if (disposed || lifetime.signal.aborted === true) return Promise.reject(abortError())
        const task = (async () => {
          const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, lifetime.signal)
          if (!result || result.ok !== true) {
            const failure = result && result.error && typeof result.error === 'object' ? result.error : {}
            throw new ApiError(
              typeof failure.code === 'string' ? failure.code : 'internal',
              localizedApiMessage(t, failure.code, undefined, failure.message)
            )
          }
          return result.value && typeof result.value === 'object' ? result.value.data : undefined
        })()
        return raceSignal(task, signal)
      }

      const api = {
        /** Panel 挂载时 +1，卸载时 -1；归零后异步 dispose，避免 StrictMode 抖动。 */
        retain() {
          if (disposed) return
          refs += 1
          if (disposeTimer !== undefined) {
            clearTimeout(disposeTimer)
            disposeTimer = undefined
          }
        },
        release() {
          if (disposed) return
          refs -= 1
          if (refs > 0) return
          if (disposeTimer !== undefined) clearTimeout(disposeTimer)
          disposeTimer = setTimeout(() => {
            disposeTimer = undefined
            if (disposed || refs > 0) return
            dispose()
            onIdle()
          }, 0)
        },
        dispose,

        transcripts: (signal) => call('transcripts.list', {}, { signal }),
        transcriptsMerge: (file, signal) => call('transcripts.merge', { file }, { signal }),
        transcriptsImport: (payload, signal) => call('transcripts.import', payload, { signal, dedupe: false }),
        transcriptsDelete: (file, signal) => call('transcripts.delete', { file }, { signal }),
        recordings: (signal) => call('recordings.list', {}, { signal }),
        browse: (path, signal) => call('browse.list', { path }, { signal }),
        models: (signal) => call('models.list', {}, { signal }),
        lookup: (payload, signal) => call('lookup', payload, { signal }),
        add: (payload, signal) => call('vocab.add', payload, { signal, dedupe: false }),
        remove: (ids, signal) => call('vocab.remove', { ids }, { signal, dedupe: false }),
        enrich: (id, signal) => call('vocab.enrich', { id }, { signal, dedupe: false }),
        analyze: (id, signal) => call('vocab.analyze', id === undefined || id === null || id === '' ? {} : { id }, { signal, dedupe: false }),
        transcribe: (payload, signal) => call('transcribe', payload, { signal, dedupe: false }),
        job: (id, signal) => call('job', { id }, { signal }),
        envCheck: (signal) => call('env.check', {}, { signal }),
        recallOverview: (signal) => call('recall.overview', {}, { signal }),
        recallGrade: (payload, signal) => call('recall.grade', payload, { signal, dedupe: false }),
        recallReset: (payload, signal) => call('recall.reset', payload, { signal, dedupe: false }),
        graphOverview: (signal) => call('graph.overview', {}, { signal }),

        pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
        openFile: (path) => ctx.sidebarRight.openResource(fileResourceAddress(sessionId, path)),
        transcriptText: (file, signal) => readAll(REL.transcripts + '/' + file, { signal }),
        vocabText: (signal) => readAll(REL.vocab, { signal }),
        readBytes: (path, signal) => readBytes(path, { signal }),
      }
      return api
    }

    const apiRegistry = new Map()

    function apiFor(ctx, sessionId, t) {
      const cached = apiRegistry.get(sessionId)
      if (cached !== undefined) return cached
      let api
      api = createApi(ctx, sessionId, t, {
        onIdle: () => {
          if (apiRegistry.get(sessionId) === api) apiRegistry.delete(sessionId)
        },
      })
      apiRegistry.set(sessionId, api)
      return api
    }


    // ═══════════════════════════════════════════════════════════════════
    // §5 纯组件（图标、会话头按钮、文稿段落、生词卡、查词浮窗、PDF 页、字号/缩放按钮）
    // 符号表：
    //   ICON_HEADPHONES / ICON_PLUS_BOOK / ICON_CHECK — 内联 SVG 常量
    //   HeaderButton — 会话头耳机按钮（自带 HEADER_CSS）
    //   Segment — 单个文稿段落（React.memo；只有 text/pattern/meta 变化才重渲染）
    //   VocabCard — 生词卡（React.memo；memo 后轮询与浮窗不再重排整本生词本）
    //   LookupBody / Popup — 查词浮窗
    //   FontControl / ZoomControl — 字号与 PDF 缩放
    //   PdfPage — 单页 PDF（IntersectionObserver 懒加载图片，卸载即 revokeObjectURL）
    // 约定：组件只接收 props，不订阅外部状态；重活全部交给 §3 / §6
    // ═══════════════════════════════════════════════════════════════════
    const ICON_HEADPHONES = h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'none' },
      h('path', { d: 'M4 13v-1a8 8 0 0 1 16 0v1', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
      h('rect', { x: 3, y: 12, width: 4, height: 7, rx: 2, fill: 'currentColor' }),
      h('rect', { x: 17, y: 12, width: 4, height: 7, rx: 2, fill: 'currentColor' }),
      h('path', { d: 'M8 17.5h3.2v3.4c-1-.7-2.2-1-3.2-.9z', fill: 'currentColor', opacity: 0.5 }),
      h('path', { d: 'M16 17.5h-3.2v3.4c1-.7 2.2-1 3.2-.9z', fill: 'currentColor', opacity: 0.5 })
    )

    const ICON_PLUS_BOOK = h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true, fill: 'none' },
      h('path', { d: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H18v15H7.5A2.5 2.5 0 0 0 5 20.5z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
      h('path', { d: 'M15 8v6M12 11h6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })
    )

    const ICON_CHECK = h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true, fill: 'none' },
      h('path', { d: 'M5 12.5 10 17l9-10', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })
    )

    function HeaderButton({ t, open }) {
      return h(React.Fragment, null,
        h('style', null, HEADER_CSS),
        h('button', {
          type: 'button',
          className: 'egl-header-btn',
          title: t('button.open'),
          'aria-label': t('button.open'),
          onClick: () => {
            try {
              open()
            } catch {
              // The tab controller reports its own failures; nothing to do here.
            }
          },
        }, ICON_HEADPHONES)
      )
    }

    /** One transcript paragraph. Memoised so polling/wordbook changes never re-parse untouched text. */
    const Segment = React.memo(function Segment(props) {
      const { index, meta, text, pattern, knownLabel } = props
      return h('p', { className: 'egl-seg', 'data-egl-seg': String(index) },
        meta === null ? null : h('span', { className: 'egl-seg-meta' }, meta),
        h('span', { className: 'egl-seg-text' }, renderRichText(text, { pattern, label: knownLabel }))
      )
    })

    function FontControl({ t, value, onChange }) {
      return h('div', { className: 'egl-fontctl', role: 'group', 'aria-label': t('font.label') },
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('font.smaller'),
          'aria-label': t('font.smaller'),
          disabled: value <= MIN_FONT,
          onClick: () => onChange(-1),
        }, 'A−'),
        h('span', { className: 'egl-fontsize', title: String(value) + 'px' }, String(value)),
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('font.larger'),
          'aria-label': t('font.larger'),
          disabled: value >= MAX_FONT,
          onClick: () => onChange(1),
        }, 'A+')
      )
    }

    function ZoomControl({ t, value, onChange }) {
      return h('div', { className: 'egl-fontctl', role: 'group', 'aria-label': t('reader.zoom'), style: { flex: 'none' } },
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('reader.zoomOut'),
          'aria-label': t('reader.zoomOut'),
          disabled: value <= MIN_ZOOM,
          onClick: () => onChange(-ZOOM_STEP),
        }, '−'),
        h('span', { className: 'egl-fontsize', style: { minWidth: 38 } }, Math.round(value * 100) + '%'),
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('reader.zoomIn'),
          'aria-label': t('reader.zoomIn'),
          disabled: value >= MAX_ZOOM,
          onClick: () => onChange(ZOOM_STEP),
        }, '+')
      )
    }

    function LookupBody({ t, popup }) {
      if (popup.status === 'loading') {
        return h('div', { className: 'egl-pop-body egl-muted' }, t('popup.loading'))
      }
      if (popup.status === 'error') {
        return h('div', { className: 'egl-pop-body' },
          h('p', { className: 'egl-err' }, popup.error || t('error.lookup')),
          h('p', { className: 'egl-muted' }, t('popup.canStillAdd'))
        )
      }
      const result = popup.result ?? {}
      if (popup.kind === 'sentence') {
        return h('div', { className: 'egl-pop-body' }, result.translation ?? '')
      }
      const meanings = collapseMeanings(result.meanings)
      return h('div', { className: 'egl-pop-body' },
        h('div', { className: 'egl-ipa' }, result.ipa || t('popup.noIpa')),
        meanings.length > 0
          ? meanings.map((meaning, index) => h('div', { key: index, className: 'egl-meaning' },
              h('span', { className: 'egl-pos' }, meaning.pos ?? ''),
              h('span', null, meaning.zh ?? '')
            ))
          : null
      )
    }

    function Popup({ t, popup, busy, onAdd, onClose }) {
      return h('div', {
        className: 'egl-pop',
        style: popup.style,
        role: 'dialog',
        'aria-label': t('popup.label'),
        onMouseDown: (event) => event.preventDefault(),
      },
        h('div', { className: 'egl-pop-head' },
          h('span', { className: 'egl-pop-kind' }, popup.kind === 'sentence' ? t('popup.sentence') : t('popup.word')),
          h('span', { className: 'egl-pop-text', title: popup.text }, popup.text),
          h('button', {
            type: 'button',
            className: 'egl-pop-add' + (popup.added ? ' is-added' : ''),
            title: popup.added ? t('popup.added') : t('popup.add'),
            'aria-label': popup.added ? t('popup.added') : t('popup.add'),
            disabled: busy || popup.added || popup.status === 'loading',
            onClick: () => onAdd(popup),
          }, popup.added ? ICON_CHECK : ICON_PLUS_BOOK)
        ),
        h(LookupBody, { t, popup }),
        h('div', { className: 'egl-pop-foot' },
          popup.duplicate ? h('span', { className: 'egl-muted' }, t('popup.duplicate')) : h('span'),
          h('button', { type: 'button', className: 'egl-link', onClick: onClose }, t('popup.close'))
        )
      )
    }

    /** One wordbook entry. Memoised so a single add/enrich keeps the other cards untouched. */
    const VocabCard = React.memo(function VocabCard(props) {
      const { t, entry, detail, onDelete, onEnrich, enriching, onAnalyze, analyzing } = props
      const isWord = entry.kind !== 'sentence'
      const pending = entry.status === 'pending'
      const full = detail !== 'simple'
      const family = isWord && Array.isArray(entry.family) ? entry.family : []
      const meanings = isWord ? collapseMeanings(entry.meanings) : []
      const etymology = isWord && entry.etymology && typeof entry.etymology === 'object' ? entry.etymology : undefined
      const etymologyParts = etymology && Array.isArray(etymology.parts) ? etymology.parts : []
      const hasEtymology = etymology !== undefined && (etymologyParts.length > 0 || Boolean(etymology.explanation))
      const canEnrich = isWord && (!family.length || !hasEtymology)
      return h('div', { className: 'egl-card' + (isWord ? '' : ' egl-card-sentence') },
        h('div', { className: 'egl-card-head' },
          h('span', { className: 'egl-word' }, isWord ? entry.word : entry.text),
          isWord && entry.ipa ? h('span', { className: 'egl-ipa' }, entry.ipa) : null,
          h('span', { className: 'egl-chip' + (pending ? ' is-pending' : '') }, pending ? t('vocab.pending') : t('vocab.done'))
        ),
        isWord
          ? (meanings.length > 0
              ? meanings.map((meaning, index) => {
                  if (!meaning || typeof meaning !== 'object') return null
                  const example = typeof meaning.example === 'string' ? meaning.example.trim() : ''
                  const source = meaning.source && typeof meaning.source === 'object' ? meaning.source : undefined
                  const sourceTitle = source && typeof source.title === 'string' ? source.title.trim() : ''
                  const sourceLabel = sourceTitle === ''
                    ? ''
                    : t('vocab.source', {
                        title: sourceTitle,
                        speaker: source.speaker ?? '-',
                        time: fmtClock(source.startMs ?? 0),
                      })
                  return h(React.Fragment, { key: index },
                    h('div', { className: 'egl-meaning' },
                      h('span', { className: 'egl-pos' }, meaning.pos ?? ''),
                      h('span', null, meaning.zh ?? '')
                    ),
                    example !== '' && full
                      ? h('div', { className: 'egl-sense-example', title: sourceLabel || undefined },
                          t('vocab.senseExample'), example,
                          sourceLabel !== '' ? h('span', { className: 'egl-sense-source' }, ' · ' + sourceLabel) : null)
                      : null
                  )
                })
              : h('div', { className: 'egl-muted' }, t('vocab.pending')))
          : (entry.translation ? h('div', { className: 'egl-meaning' }, entry.translation) : h('div', { className: 'egl-muted' }, t('vocab.pending'))),
        family.length > 0
          ? h('div', { className: 'egl-family' },
              h('span', { className: 'egl-muted' }, t('vocab.family')),
              family.map((item, index) => h('span', { key: index, className: 'egl-form' }, item.label ? item.label + ' ' + item.form : item.form))
            )
          : null,
        hasEtymology && full
          ? h('div', { className: 'egl-etymology' },
              h('span', { className: 'egl-etymology-line' },
                h('span', null, t('vocab.etymology')),
                h('span', null, [
                  etymology.language || '',
                  etymologyParts.map((part) => part.part + (part.meaning ? '（' + part.meaning + '）' : '')).join(' + '),
                ].filter(Boolean).join(' · '))
              ),
              etymology.explanation ? h('div', { className: 'egl-etymology-note' }, etymology.explanation) : null
            )
          : null,
        isWord && entry.sentence && full
          ? h('div', { className: 'egl-example' },
              h('span', { className: 'egl-muted' }, t('vocab.example')),
              renderRichText(entry.sentence, { word: entry.word }))
          : null,
        isWord && entry.sentenceZh && full ? h('div', { className: 'egl-example' }, entry.sentenceZh) : null,
        entry.source && entry.source.title
          ? h('div', { className: 'egl-source' }, t('vocab.source', {
              title: entry.source.title,
              speaker: entry.source.speaker ?? '-',
              time: fmtClock(entry.source.startMs ?? 0),
            }))
          : null,
        isWord && entry.analysis && typeof entry.analysis === 'object'
          ? h('div', { className: 'egl-analysis' },
              entry.analysis.status === 'failed'
                ? t('vocab.analysisFailed', { message: entry.analysis.error ?? '' })
                : entry.analysis.status === 'skipped'
                  ? t('vocab.analysisSkipped')
                  : t('vocab.analysisDone', {
                      contexts: String(entry.analysis.contexts ?? 0),
                      transcripts: String(entry.analysis.transcripts ?? 0),
                    }))
          : null,
        h('div', { className: 'egl-card-actions' },
          canEnrich
            ? h('button', { type: 'button', className: 'egl-link', disabled: enriching, onClick: () => onEnrich(entry) }, t('vocab.enrich'))
            : null,
          isWord
            ? h('button', { type: 'button', className: 'egl-link', disabled: analyzing, title: t('vocab.analyzeHint'), onClick: () => onAnalyze(entry) }, analyzing ? t('vocab.analyzing') : t('vocab.analyze'))
            : null,
          h('button', { type: 'button', className: 'egl-link', onClick: () => onDelete(entry) }, t('vocab.delete'))
        )
      )
    })

    /** One PDF page: image + transparent word overlay. The image is fetched only once the page scrolls near the viewport. */
    const PdfPage = React.memo(function PdfPage(props) {
      const { api, page, index, knownPattern, t } = props
      const boxRef = useRef(null)
      const [src, setSrc] = useState('')
      const [visible, setVisible] = useState(false)
      const [scale, setScale] = useState(1)
      const [error, setError] = useState('')
      useEffect(() => {
        if (visible) return undefined
        const element = boxRef.current
        if (!element) return undefined
        if (typeof IntersectionObserver === 'undefined') {
          setVisible(true)
          return undefined
        }
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true)
            observer.disconnect()
          }
        }, { rootMargin: PDF_LAZY_MARGIN })
        observer.observe(element)
        return () => observer.disconnect()
      }, [visible])
      useEffect(() => {
        if (!visible) return undefined
        const controller = new AbortController()
        let objectUrl = ''
        api.readBytes(page.image, controller.signal)
          .then((bytes) => {
            if (controller.signal.aborted) return
            const array = toUint8Array(bytes)
            if (array === undefined) throw new Error('unexpected image bytes')
            objectUrl = URL.createObjectURL(new Blob([array], { type: 'image/png' }))
            setSrc(objectUrl)
          })
          .catch((failure) => {
            if (controller.signal.aborted || isAbortError(failure)) return
            setError(errorMessage(failure))
          })
        return () => {
          controller.abort()
          if (objectUrl !== '') {
            URL.revokeObjectURL(objectUrl)
            objectUrl = ''
          }
        }
      }, [api, page.image, visible])
      useEffect(() => {
        const element = boxRef.current
        if (!element) return undefined
        const update = () => {
          if (element.clientWidth > 0) setScale(element.clientWidth / page.width)
        }
        update()
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', update)
          return () => window.removeEventListener('resize', update)
        }
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
      }, [page.width])
      const ratio = page.width > 0 && page.height > 0 ? page.width + ' / ' + page.height : undefined
      return h('div', {
        className: 'egl-pdf-page',
        ref: boxRef,
        'data-egl-page': String(index),
        style: ratio === undefined ? undefined : { aspectRatio: ratio },
        onDragStart: (event) => event.preventDefault(),
      },
        src !== ''
          ? h('img', { className: 'egl-pdf-img', src, alt: '', draggable: false, onDragStart: (event) => event.preventDefault() })
          : h('div', { className: 'egl-pdf-loading' }, error || t('reader.loading')),
        src !== ''
          ? page.lines.map((line, lineIndex) => line.words.map((word, wordIndex) => h('span', {
              key: String(lineIndex) + '-' + String(wordIndex),
              className: 'egl-pdf-word' + (isKnownWord(knownPattern, word.t) ? ' is-known' : ''),
              'data-egl-page': String(index),
              'data-egl-line': String(lineIndex),
              style: {
                left: word.x * scale + 'px',
                top: word.y * scale + 'px',
                width: word.w * scale + 'px',
                height: word.h * scale + 'px',
                fontSize: Math.max(1, word.h * scale) + 'px',
              },
            }, word.t)))
          : null
      )
    })


    // ═══════════════════════════════════════════════════════════════════
    // §6 hooks（usePolling / useSelectionLookup / useTranscript / useGraphCanvas）
    // 符号表：
    //   usePolling(task, options) — 统一轮询：in-flight 守卫、document.hidden 跳过、
    //       失败指数退避、visibilitychange 唤醒、task 返回 { done:true } 即停、
    //       返回值 refresh() 供「刷新」按钮立即拉取
    //   useSelectionLookup(options) — 选区/Ctrl(⌘) 查词：输入框焦点守卫、跨行/跨段选区、
    //       Escape 只关浮窗、不阻断宿主快捷键、监听器只绑定一次
    //   useTranscript(api, file, signature, reloadKey, t) — 文稿加载：切文稿只发一次请求、
    //       卸载/切换即 abort、同文件重载保留旧内容
    // 依赖方向：本区只引用 §0/§3/§4
    // ═══════════════════════════════════════════════════════════════════
    function usePolling(task, options = {}) {
      const {
        key = '',
        enabled = true,
        intervalMs = 0,
        immediate = true,
        hiddenSkip = true,
        backoff = true,
        maxBackoffMs = 60000,
        onError,
      } = options
      const taskRef = useRef(task)
      const onErrorRef = useRef(onError)
      const refreshRef = useRef(() => {})
      useEffect(() => {
        taskRef.current = task
        onErrorRef.current = onError
      }, [task, onError])
      useEffect(() => {
        if (!enabled) return undefined
        let cancelled = false
        let running = false
        let failures = 0
        let timer
        let controller
        const clearTimer = () => {
          if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
          }
        }
        const schedule = () => {
          if (cancelled) return
          clearTimer()
          const base = Math.max(250, Number(intervalMs) || 0)
          const factor = backoff && failures > 0 ? Math.min(6, failures) : 0
          const delay = factor > 0 ? Math.min(maxBackoffMs, base * Math.pow(2, factor)) : base
          timer = setTimeout(() => {
            timer = undefined
            void tick()
          }, delay)
        }
        const tick = async () => {
          if (cancelled || running) return
          if (hiddenSkip && typeof document !== 'undefined' && document.hidden === true) {
            schedule()
            return
          }
          running = true
          controller = new AbortController()
          let result
          try {
            result = await taskRef.current(controller.signal)
            failures = 0
          } catch (error) {
            running = false
            controller = undefined
            if (cancelled) return
            if (isAbortError(error)) {
              schedule()
              return
            }
            failures += 1
            if (typeof onErrorRef.current === 'function') onErrorRef.current(error)
            schedule()
            return
          }
          running = false
          controller = undefined
          if (cancelled) return
          if (result && result.done === true) {
            clearTimer()
            return
          }
          schedule()
        }
        refreshRef.current = () => {
          if (cancelled) return
          clearTimer()
          void tick()
        }
        const onVisibility = () => {
          if (cancelled) return
          if (typeof document !== 'undefined' && document.hidden !== true) {
            clearTimer()
            void tick()
          }
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
        if (immediate) void tick()
        else schedule()
        return () => {
          cancelled = true
          clearTimer()
          if (controller !== undefined) controller.abort()
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
          refreshRef.current = () => {}
        }
      }, [key, enabled, intervalMs, immediate, hiddenSkip, backoff, maxBackoffMs])
      return useCallback(() => {
        refreshRef.current()
      }, [])
    }

    /**
     * Ctrl/⌘ 松手时读取选区并回调 onSelect(payload)。
     * options: { rootRef, onSelect, popupOpen, closePopup, file, title, segments, pages }
     * 监听器只在挂载时绑定一次；最新值通过 ref（effect 内同步，不在 render 期写 ref）。
     */
    function useSelectionLookup(options) {
      const latest = useRef(options)
      useEffect(() => {
        latest.current = options
      })
      useEffect(() => {
        let ctrlAlone = false
        const openFromSelection = () => {
          const current = latest.current
          const root = current.rootRef ? current.rootRef.current : null
          if (!root) return
          if (isEditableFocus()) return
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
          const range = selection.getRangeAt(0)
          if (!root.contains(range.commonAncestorContainer)) return
          const raw = range.toString().replace(/\s+/g, ' ').trim()
          if (raw === '' || raw.length > 400) return
          const selectionRect = range.getBoundingClientRect()
          const rootRect = root.getBoundingClientRect()
          const kind = classify(raw)
          const width = kind === 'sentence' ? 380 : 320
          let left = selectionRect.left - rootRect.left
          left = Math.max(8, Math.min(left, Math.max(8, rootRect.width - width - 8)))
          const below = selectionRect.bottom - rootRect.top + 8
          const above = rootRect.height - (selectionRect.top - rootRect.top) + 8
          const style = below + 200 < rootRect.height ? { top: below, left, width } : { bottom: above, left, width }
          const payload = selectionLookupPayload({
            range,
            segments: current.segments,
            pages: current.pages,
            file: current.file,
            title: current.title,
          }, raw, style)
          if (typeof current.onSelect === 'function') current.onSelect(payload)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            // 只关浮窗、不阻断事件传播：宿主自己的 Escape 快捷键照常生效
            if (latest.current.popupOpen === true && typeof latest.current.closePopup === 'function') {
              latest.current.closePopup()
            }
            ctrlAlone = false
            return
          }
          if (event.key === 'Control' || event.key === 'Meta') {
            ctrlAlone = event.repeat !== true && !isEditableEvent(event)
            return
          }
          ctrlAlone = false
        }
        const onKeyUp = (event) => {
          if (event.key !== 'Control' && event.key !== 'Meta') return
          const alone = ctrlAlone
          ctrlAlone = false
          if (!alone) return
          openFromSelection()
        }
        const onPointerDown = () => {
          ctrlAlone = false
        }
        const onBlur = () => {
          ctrlAlone = false
        }
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp, true)
        window.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('blur', onBlur)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('keyup', onKeyUp, true)
          window.removeEventListener('pointerdown', onPointerDown, true)
          window.removeEventListener('blur', onBlur)
        }
      }, [])
    }

    /** Load one transcript file. A file switch issues exactly one workspace read (in-flight de-duplicated upstream). */
    function useTranscript(api, file, signature, reloadKey, t) {
      const [state, setState] = useState({ transcript: null, error: '', loading: false })
      const loadedRef = useRef(null)
      useEffect(() => {
        if (!file) {
          loadedRef.current = null
          setState({ transcript: null, error: '', loading: false })
          return undefined
        }
        const controller = new AbortController()
        let alive = true
        setState((previous) => (loadedRef.current === file
          ? { transcript: previous.transcript, error: '', loading: true }
          : { transcript: null, error: '', loading: true }))
        api.transcriptText(file, controller.signal)
          .then((text) => {
            if (!alive) return
            if (text === undefined) throw new ApiError('transcript/not-found', t('error.transcriptNotFound'))
            const document = parseLoose(text)
            if (!document || !Array.isArray(document.segments)) throw new ApiError('transcript/invalid-format', t('error.transcript'))
            loadedRef.current = file
            setState({ transcript: document, error: '', loading: false })
          })
          .catch((error) => {
            if (!alive || isAbortError(error)) return
            loadedRef.current = null
            setState({ transcript: null, error: errorMessage(error), loading: false })
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [api, file, signature, reloadKey, t])
      return state
    }


    /**
     * Canvas force-graph controller for the graph view.
     *
     * Owns: the deterministic simulation, the view transform (pan/zoom), the
     * animation loop, pointer gestures and drawing. The component owns the
     * chrome (filters, search, legend, detail panel) and passes the derived
     * payload down; the hook reads the latest props through a ref so selection
     * and filter changes never restart the layout.
     *
     * Returns imperative helpers so the toolbar can zoom / reset / centre a
     * node found by the search box.
     */
    function useGraphCanvas(options) {
      const canvasRef = options.canvasRef
      const containerRef = options.containerRef
      const data = options.data
      const selectedId = options.selectedId
      const filter = options.filter
      const search = options.search
      const onSelect = options.onSelect

      const frameRef = useRef(0)
      const simRef = useRef(null)
      const viewRef = useRef({ scale: 1, tx: 0, ty: 0 })
      const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
      const paletteRef = useRef(GRAPH_COLORS_FALLBACK)
      const dragRef = useRef(null)
      const propsRef = useRef({ selectedId: null, filter: 'all', search: '', onSelect: null, data: null })
      const dataRef = useRef(null)
      const scheduleRef = useRef(() => {})
      const rebuildRef = useRef(() => {})
      const apiRef = useRef({
        zoomIn: () => {},
        zoomOut: () => {},
        resetView: () => {},
        centerOn: () => {},
      })

      propsRef.current = { selectedId, filter, search, onSelect, data }
      dataRef.current = data

      // scopeKey 让「只看一篇文稿」在节点数恰好相同时也能重建布局。
      const scopeKey = options.scopeKey
      const signature = data && typeof data === 'object'
        ? String(data.generatedAt ?? '') + '|' + String(Array.isArray(data.nodes) ? data.nodes.length : 0) + '|' + String(Array.isArray(data.links) ? data.links.length : 0) + '|' + String(scopeKey ?? '')
        : ''

      useEffect(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return undefined
        let disposed = false
        let reduced = false
        try {
          reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        } catch {
          reduced = false
        }
        const raf = typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame.bind(window)
          : (callback) => window.setTimeout(callback, 16)
        const caf = typeof window.cancelAnimationFrame === 'function'
          ? window.cancelAnimationFrame.bind(window)
          : (handle) => window.clearTimeout(handle)

        function measure() {
          const rect = container.getBoundingClientRect()
          return {
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
            dpr: Math.min(2.5, Math.max(1, Number(window.devicePixelRatio) || 1)),
          }
        }

        function applyCanvasSize() {
          const size = measure()
          const previous = sizeRef.current
          const changed = size.width !== previous.width || size.height !== previous.height || size.dpr !== previous.dpr
          sizeRef.current = size
          if (size.width > 0 && size.height > 0) {
            const pixelWidth = Math.round(size.width * size.dpr)
            const pixelHeight = Math.round(size.height * size.dpr)
            if (canvas.width !== pixelWidth) canvas.width = pixelWidth
            if (canvas.height !== pixelHeight) canvas.height = pixelHeight
          }
          return changed
        }

        function worldPoint(clientX, clientY) {
          const rect = canvas.getBoundingClientRect()
          const view = viewRef.current
          return {
            x: (clientX - rect.left - view.tx) / view.scale,
            y: (clientY - rect.top - view.ty) / view.scale,
          }
        }

        function hitTest(clientX, clientY) {
          const sim = simRef.current
          if (sim === null) return null
          const point = worldPoint(clientX, clientY)
          const tolerance = 6 / viewRef.current.scale
          let best = null
          let bestDistance = Infinity
          for (const node of sim.nodes) {
            const radius = graphNodeRadius(node) + tolerance
            const dx = point.x - node.x
            const dy = point.y - node.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            if (distance <= radius && distance < bestDistance) {
              best = node
              bestDistance = distance
            }
          }
          return best
        }

        function draw() {
          const context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
          const size = sizeRef.current
          if (context === null || size.width < 4 || size.height < 4) return
          const view = viewRef.current
          const palette = paletteRef.current
          const sim = simRef.current
          const payload = propsRef.current.data
          context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
          context.clearRect(0, 0, size.width, size.height)
          if (sim === null || payload === null || typeof payload !== 'object') return
          const links = Array.isArray(payload.links) ? payload.links : []
          const selected = propsRef.current.selectedId
          const activeFilter = propsRef.current.filter
          const query = propsRef.current.search
          const searching = String(query ?? '').trim() !== ''
          const neighbors = selected ? graphNeighbors(links, selected) : null
          const visibleDegrees = graphVisibleDegrees(links, activeFilter)
          const totalNodes = sim.nodes.length
          const showAllLabels = totalNodes <= 60
          const isDimmedNode = (node) => {
            if (neighbors !== null && node.id !== selected && !neighbors.has(node.id)) return true
            if (searching && !graphMatchesQuery(node, query)) return true
            if (activeFilter !== 'all' && (visibleDegrees.get(node.id) ?? 0) === 0) return true
            return false
          }

          context.save()
          context.translate(view.tx, view.ty)
          context.scale(view.scale, view.scale)

          for (const simLink of sim.links) {
            const link = simLink.link
            if (!graphLinkVisible(link.kind, activeFilter)) continue
            let alpha = link.kind === 'appears' ? 0.55 : 0.5
            if (neighbors !== null && link.source !== selected && link.target !== selected) {
              alpha = 0.1
            } else if (searching && !(graphMatchesQuery(simLink.source, query) || graphMatchesQuery(simLink.target, query))) {
              alpha = 0.1
            }
            context.globalAlpha = alpha
            context.strokeStyle = palette[link.kind] ?? palette.appears
            if (link.kind === 'appears') {
              context.lineWidth = link.origin === true ? 1.5 : 1
              context.setLineDash(link.origin === true ? [] : [3, 3])
            } else if (link.kind === 'morph') {
              context.lineWidth = 1.2
              context.setLineDash([5, 3])
            } else if (link.kind === 'sense') {
              context.lineWidth = 1.2
              context.setLineDash([1, 3])
            } else {
              context.lineWidth = 1
              context.setLineDash([])
            }
            context.beginPath()
            context.moveTo(simLink.source.x, simLink.source.y)
            context.lineTo(simLink.target.x, simLink.target.y)
            context.stroke()
          }
          context.setLineDash([])

          for (const node of sim.nodes) {
            const dimmed = isDimmedNode(node)
            const radius = graphNodeRadius(node)
            context.globalAlpha = dimmed ? 0.18 : 1
            context.fillStyle = node.kind === 'transcript' ? palette.transcript : palette.word
            context.beginPath()
            context.arc(node.x, node.y, radius, 0, Math.PI * 2)
            context.fill()
            if (node.kind === 'word' && node.mastery > 0) {
              context.strokeStyle = palette.mastery
              context.lineWidth = 1.6
              context.beginPath()
              context.arc(
                node.x,
                node.y,
                radius + 3,
                -Math.PI / 2,
                -Math.PI / 2 + (Math.PI * 2 * Math.min(5, node.mastery)) / 5,
              )
              context.stroke()
            }
            if (node.id === selected) {
              context.strokeStyle = palette.text
              context.lineWidth = 1.5
              context.beginPath()
              context.arc(node.x, node.y, radius + 5, 0, Math.PI * 2)
              context.stroke()
            }
          }

          context.globalAlpha = 1
          context.textBaseline = 'middle'
          for (const node of sim.nodes) {
            const dimmed = isDimmedNode(node)
            const important = node.id === selected
              || (neighbors !== null && neighbors.has(node.id))
              || (searching && graphMatchesQuery(node, query))
            if (!showAllLabels && !important) continue
            const label = graphNodeLabel(node, node.kind === 'transcript' ? 18 : 20)
            if (label === '') continue
            context.font = (node.kind === 'transcript' ? '600 ' : '') + '10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
            const width = context.measureText(label).width
            const x = node.x
            const y = node.y + graphNodeRadius(node) + 8
            if (node.kind === 'transcript') {
              context.globalAlpha = dimmed ? 0.25 : 0.85
              context.fillStyle = palette.halo
              if (typeof context.roundRect === 'function') {
                context.beginPath()
                context.roundRect(x - width / 2 - 3, y - 7, width + 6, 14, 4)
                context.fill()
              } else {
                context.fillRect(x - width / 2 - 3, y - 7, width + 6, 14)
              }
            }
            context.globalAlpha = dimmed ? 0.35 : 1
            context.fillStyle = palette.text
            context.textAlign = 'center'
            context.fillText(label, x, y)
          }
          context.restore()
          context.globalAlpha = 1
          context.setLineDash([])
        }

        function tick() {
          frameRef.current = 0
          if (disposed) return
          const sim = simRef.current
          if (sim !== null && !sim.settled && document.hidden !== true) {
            graphStepSim(sim)
            schedule()
          }
          draw()
        }

        function schedule() {
          if (disposed || frameRef.current !== 0) return
          frameRef.current = raf(tick)
        }

        function zoomBy(factor) {
          const size = sizeRef.current
          const view = viewRef.current
          const next = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, view.scale * factor))
          if (next === view.scale) return
          const ratio = next / view.scale
          const cx = size.width / 2
          const cy = size.height / 2
          viewRef.current = { scale: next, tx: cx - (cx - view.tx) * ratio, ty: cy - (cy - view.ty) * ratio }
          schedule()
        }

        function resetView() {
          const sim = simRef.current
          const size = sizeRef.current
          if (sim === null) return
          viewRef.current = graphFitView(sim, size.width, size.height)
          schedule()
        }

        function centerOn(id) {
          const sim = simRef.current
          const size = sizeRef.current
          if (sim === null) return
          const node = sim.byId.get(String(id ?? ''))
          if (node === undefined) return
          const scale = viewRef.current.scale
          viewRef.current = {
            scale,
            tx: size.width / 2 - node.x * scale,
            ty: size.height / 2 - node.y * scale,
          }
          schedule()
        }

        function rebuild() {
          if (disposed) return
          const size = sizeRef.current
          const payload = dataRef.current
          if (size.width < 4 || size.height < 4 || payload === null || typeof payload !== 'object') {
            simRef.current = null
            return
          }
          paletteRef.current = graphResolvePalette(canvas)
          const previous = simRef.current
          const previousPositions = new Map()
          if (previous !== null) {
            for (const node of previous.nodes) previousPositions.set(node.id, { x: node.x, y: node.y })
          }
          const sim = graphCreateSim(payload, size.width, size.height)
          for (const node of sim.nodes) {
            const old = previousPositions.get(node.id)
            if (old !== undefined) {
              node.x = old.x
              node.y = old.y
            }
          }
          simRef.current = sim
          viewRef.current = graphFitView(sim, size.width, size.height)
          if (reduced) {
            const settleSteps = sim.nodes.length > 120 ? 200 : 400
            for (let step = 0; step < settleSteps && !sim.settled; step += 1) graphStepSim(sim)
            draw()
            return
          }
          schedule()
        }

        apiRef.current.zoomIn = () => zoomBy(1.25)
        apiRef.current.zoomOut = () => zoomBy(0.8)
        apiRef.current.resetView = resetView
        apiRef.current.centerOn = centerOn
        scheduleRef.current = schedule
        rebuildRef.current = rebuild

        function onPointerDown(event) {
          if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return
          const node = hitTest(event.clientX, event.clientY)
          const view = viewRef.current
          if (node !== null) {
            node.fixed = true
            dragRef.current = {
              mode: 'node',
              node,
              offsetX: worldPoint(event.clientX, event.clientY).x - node.x,
              offsetY: worldPoint(event.clientX, event.clientY).y - node.y,
              startX: event.clientX,
              startY: event.clientY,
              moved: false,
              pointerId: event.pointerId,
            }
            canvas.classList.add('is-dragging')
            if (typeof canvas.setPointerCapture === 'function') {
              try {
                canvas.setPointerCapture(event.pointerId)
              } catch {
                // capture is best effort
              }
            }
            if (typeof propsRef.current.onSelect === 'function') propsRef.current.onSelect(node.id)
            event.preventDefault()
            return
          }
          dragRef.current = {
            mode: 'pan',
            startX: event.clientX,
            startY: event.clientY,
            tx: view.tx,
            ty: view.ty,
            moved: false,
            pointerId: event.pointerId,
          }
          canvas.classList.add('is-dragging')
          if (typeof canvas.setPointerCapture === 'function') {
            try {
              canvas.setPointerCapture(event.pointerId)
            } catch {
              // capture is best effort
            }
          }
        }

        function onPointerMove(event) {
          const drag = dragRef.current
          if (drag === null) return
          if (drag.mode === 'node') {
            const point = worldPoint(event.clientX, event.clientY)
            const size = sizeRef.current
            drag.node.x = Math.min(size.width - 10, Math.max(10, point.x - drag.offsetX))
            drag.node.y = Math.min(size.height - 10, Math.max(10, point.y - drag.offsetY))
            drag.moved = true
            graphReheat(simRef.current)
            schedule()
            event.preventDefault()
            return
          }
          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
          viewRef.current = { scale: viewRef.current.scale, tx: drag.tx + dx, ty: drag.ty + dy }
          schedule()
        }

        function onPointerUp(event) {
          const drag = dragRef.current
          dragRef.current = null
          canvas.classList.remove('is-dragging')
          if (typeof canvas.releasePointerCapture === 'function') {
            try {
              canvas.releasePointerCapture(event.pointerId)
            } catch {
              // already released
            }
          }
          if (drag === null) return
          if (drag.mode === 'node') {
            drag.node.fixed = false
            // A plain click selects and must not reheat the layout; a real drag settles again.
            if (drag.moved === true) {
              graphReheat(simRef.current)
              schedule()
            } else {
              draw()
            }
            return
          }
          if (drag.moved !== true && typeof propsRef.current.onSelect === 'function') propsRef.current.onSelect(null)
        }

        function onWheel(event) {
          event.preventDefault()
          const rect = canvas.getBoundingClientRect()
          const cx = event.clientX - rect.left
          const cy = event.clientY - rect.top
          const view = viewRef.current
          const factor = Math.exp(-event.deltaY * 0.0015)
          const next = Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, view.scale * factor))
          if (next === view.scale) return
          const ratio = next / view.scale
          viewRef.current = { scale: next, tx: cx - (cx - view.tx) * ratio, ty: cy - (cy - view.ty) * ratio }
          schedule()
        }

        function onVisibility() {
          if (document.hidden !== true) schedule()
        }

        function onResize() {
          const changed = applyCanvasSize()
          if (!changed) return
          if (simRef.current === null) {
            rebuild()
            return
          }
          viewRef.current = graphFitView(simRef.current, sizeRef.current.width, sizeRef.current.height)
          schedule()
        }

        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerup', onPointerUp)
        canvas.addEventListener('pointercancel', onPointerUp)
        canvas.addEventListener('wheel', onWheel, { passive: false })
        document.addEventListener('visibilitychange', onVisibility)
        let observer
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(onResize)
          observer.observe(container)
        } else {
          window.addEventListener('resize', onResize)
        }
        applyCanvasSize()
        rebuild()

        return () => {
          disposed = true
          if (frameRef.current !== 0) {
            caf(frameRef.current)
            frameRef.current = 0
          }
          canvas.removeEventListener('pointerdown', onPointerDown)
          canvas.removeEventListener('pointermove', onPointerMove)
          canvas.removeEventListener('pointerup', onPointerUp)
          canvas.removeEventListener('pointercancel', onPointerUp)
          canvas.removeEventListener('wheel', onWheel)
          document.removeEventListener('visibilitychange', onVisibility)
          if (observer !== undefined) observer.disconnect()
          else window.removeEventListener('resize', onResize)
          canvas.classList.remove('is-dragging')
        }
      }, [canvasRef, containerRef])

      useEffect(() => {
        rebuildRef.current()
      }, [signature])

      useEffect(() => {
        scheduleRef.current()
      }, [selectedId, filter, search])

      return apiRef.current
    }

    // ═══════════════════════════════════════════════════════════════════
    // §7 视图（转写面板、任务条、文稿、PDF、生词本、背记、图谱、环境自检卡）
    // 符号表：
    //   TranscribePanel — 录音选择 + 路径扫描 + 模型/说话人数
    //   JobBar — 转写任务状态条（失败可重试）
    //   TranscriptBody — 文稿正文：按视口分片渲染（IntersectionObserver 哨兵增量加载）
    //   PdfView — PDF 页容器（页面本身懒加载）
    //   VocabView — 生词本（筛选 / 搜索 / 排序 / 详情）
    //   EnvCommand / EnvCard — 「环境自检」卡：bl / Poppler / 工作区状态 + 可复制命令，可折叠
    //   RecallCard / RecallProgress / RecallHistory / RecallView — 背记练习页
    //       （作答两阶段 → 自动判定 + 自评四档；完成态、最近 14 天柱状图）
    //   RecallMasteryPage — 背记「掌握情况」独立页（表格：单词 / 掌握度 / 等级 / 下次复习 / 操作，各列左对齐）
    // 依赖方向：本区引用 §0/§3/§5，不引用 §8/§9
    // ═══════════════════════════════════════════════════════════════════
    function TranscribePanel(props) {
      const {
        t, browsePath, onBrowsePathChange, onScan, onPickFolder, browseBusy, browseError,
        browseFiles, recordings, recordingChoice, onRecordingChoiceChange,
        speakerCount, onSpeakerCountChange, modelList, modelChoice, onModelChoiceChange,
        modelDefault, busy, onStart, onClose,
      } = props
      const items = Array.isArray(recordings) ? recordings : []
      const found = Array.isArray(browseFiles) ? browseFiles : []
      const choices = found.length > 0 ? found : items
      const usingBrowse = found.length > 0
      const effectiveChoice = choices.some((item) => item.path === recordingChoice) ? recordingChoice : (choices[0]?.path ?? '')
      return h('div', { className: 'egl-panel' },
        h('div', { className: 'egl-row' },
          h('strong', null, t('transcribe.title')),
          h('button', { type: 'button', className: 'egl-btn egl-ghost', onClick: onClose }, t('transcribe.cancel'))
        ),
        h('div', { className: 'egl-tools' },
          h('input', {
            className: 'egl-input',
            style: { flex: 1, minWidth: 150 },
            placeholder: t('transcribe.pathPlaceholder'),
            value: browsePath,
            onChange: (event) => onBrowsePathChange(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') onScan(browsePath)
            },
          }),
          h('button', { type: 'button', className: 'egl-btn', disabled: browseBusy, onClick: () => onScan(browsePath) }, t('transcribe.scan')),
          h('button', { type: 'button', className: 'egl-btn', disabled: browseBusy, onClick: onPickFolder }, t('transcribe.browse'))
        ),
        browseError !== '' ? h('div', { className: 'egl-err', style: { marginTop: 6 } }, browseError) : null,
        choices.length === 0
          ? h('div', { className: 'egl-muted', style: { marginTop: 6 } }, t('transcribe.empty'))
          : h('div', null,
              h('div', { className: 'egl-tools' },
                h('label', { className: 'egl-field' },
                  h('span', null, usingBrowse ? t('transcribe.found', { n: String(found.length) }) : t('transcribe.audio')),
                  h('select', {
                    className: 'egl-select',
                    value: effectiveChoice,
                    onChange: (event) => onRecordingChoiceChange(event.target.value),
                  }, choices.map((item) => h('option', { key: item.path, value: item.path }, item.name)))
                ),
                h('label', { className: 'egl-field' },
                  h('span', null, t('transcribe.speakers')),
                  h('input', {
                    className: 'egl-input',
                    style: { width: 64 },
                    inputMode: 'numeric',
                    value: speakerCount,
                    onChange: (event) => onSpeakerCountChange(event.target.value.replace(/[^0-9]/g, '')),
                  })
                ),
                h('label', { className: 'egl-field' },
                  h('span', null, t('transcribe.model')),
                  h('select', {
                    className: 'egl-select',
                    value: modelChoice,
                    onChange: (event) => onModelChoiceChange(event.target.value),
                  }, (modelList.length > 0 ? modelList : [modelDefault])
                    .filter((id) => id !== '')
                    .map((id) => h('option', { key: id, value: id }, id === modelDefault ? t('transcribe.modelDefault', { model: id }) : id)))
                ),
                h('button', {
                  type: 'button',
                  className: 'egl-btn',
                  disabled: busy === 'transcribe' || effectiveChoice === '',
                  onClick: () => onStart({
                    audio: effectiveChoice,
                    model: modelChoice || undefined,
                    speakers: speakerCount === '' ? undefined : Number(speakerCount),
                  }),
                }, t('transcribe.start'))
              ),
              h('div', { className: 'egl-muted', style: { fontSize: 11, marginTop: 6 } }, t('transcribe.hint'))
            )
      )
    }

    function JobBar({ t, job, lastJobRequest, busy, onRetry }) {
      if (!job) return null
      const state = job.state ?? 'queued'
      const failed = state === 'failed' || state === 'missing'
      const label = state === 'done' ? t('transcribe.done')
        : failed ? t('transcribe.failed')
          : state === 'queued' ? t('transcribe.queued')
            : t('transcribe.running')
      const detail = job.error ? t('common.detail', { message: job.error }) : ''
      const hint = state === 'running' || state === 'queued' ? ' ' + t('transcribe.hint') : ''
      return h('div', { className: 'egl-job' + (failed ? ' is-failed' : '') },
        h('span', { className: 'egl-job-text' }, label + detail + hint),
        failed && lastJobRequest
          ? h('button', { type: 'button', className: 'egl-btn', disabled: busy === 'transcribe', onClick: () => onRetry(lastJobRequest) }, t('transcribe.retry'))
          : null
      )
    }

    /**
     * Transcript body: renders the first TRANSCRIPT_CHUNK paragraphs and extends the window when a
     * sentinel near the viewport becomes visible. Each paragraph is a memoised Segment, so scrolling
     * never re-runs the LaTeX/highlight parsing for text that is already on screen.
     */
    function TranscriptBody({ t, transcript, segments, pattern }) {
      const [limit, setLimit] = useState(TRANSCRIPT_CHUNK)
      const sentinelRef = useRef(null)
      const segmentCount = segments.length
      const visible = useMemo(() => (segmentCount <= limit ? segments : segments.slice(0, limit)), [segments, segmentCount, limit])
      const knownLabel = t('reader.known')
      const showMeta = transcript.imported !== true
      useEffect(() => {
        setLimit(TRANSCRIPT_CHUNK)
      }, [segments])
      useEffect(() => {
        if (limit >= segmentCount) return undefined
        const element = sentinelRef.current
        if (!element) return undefined
        if (typeof IntersectionObserver === 'undefined') {
          setLimit(segmentCount)
          return undefined
        }
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => Math.min(segmentCount, value + TRANSCRIPT_CHUNK))
        }, { root: element.closest('.egl-scroll'), rootMargin: '600px 0px' })
        observer.observe(element)
        return () => observer.disconnect()
      }, [limit, segmentCount])
      return h('div', null,
        visible.map((segment, index) => h(Segment, {
          key: index,
          index,
          meta: showMeta ? speakerName(t, transcript, segment.speaker) + ' · ' + fmtClock(segment.start) : null,
          text: String(segment.text ?? ''),
          pattern,
          knownLabel,
        })),
        limit < segmentCount
          ? h('div', { key: 'sentinel', ref: sentinelRef, className: 'egl-sentinel' }, t('reader.loadingMore'))
          : null
      )
    }

    function PdfView({ api, pages, knownPattern, zoom, t }) {
      const width = Math.round((Number(zoom) || 1) * 100)
      return h('div', { className: 'egl-pdf', style: { width: width + '%' } },
        pages.map((page, index) => h(PdfPage, {
          key: String(index) + ':' + String(page.image ?? ''),
          api,
          page,
          index,
          knownPattern,
          t,
        })))
    }

    function VocabView(props) {
      const {
        t, words, filtered, pending, filter, onFilter, query, onQuery, sortMode, onSort,
        transcriptFilter, onTranscriptFilter, transcriptOptions, cardDetail, onCardDetail,
        onCopyPrompt, onDelete, onEnrich, enriching, onAnalyze, analyzing, font,
      } = props
      return h('div', { className: 'egl-vocab' },
        h('div', { className: 'egl-vocab-head' },
          h('div', { className: 'egl-tools' },
            h('div', { className: 'egl-tabs' },
              h('button', { type: 'button', className: 'egl-tab' + (filter === 'all' ? ' is-on' : ''), onClick: () => onFilter('all') }, t('vocab.filter.all')),
              h('button', { type: 'button', className: 'egl-tab' + (filter === 'word' ? ' is-on' : ''), onClick: () => onFilter('word') }, t('vocab.filter.word')),
              h('button', { type: 'button', className: 'egl-tab' + (filter === 'sentence' ? ' is-on' : ''), onClick: () => onFilter('sentence') }, t('vocab.filter.sentence'))
            ),
            h('input', {
              className: 'egl-input',
              style: { flex: 1, minWidth: 120 },
              placeholder: t('vocab.search'),
              value: query,
              onChange: (event) => onQuery(event.target.value),
            })
          ),
          h('div', { className: 'egl-tools' },
            h('label', { className: 'egl-field', style: { flex: 'none' } },
              h('span', null, t('vocab.transcript')),
              h('select', {
                className: 'egl-select',
                value: transcriptFilter,
                onChange: (event) => onTranscriptFilter(event.target.value),
              },
                h('option', { value: '' }, t('vocab.transcriptAll')),
                transcriptOptions.map((option) => h('option', { key: option.title, value: option.title }, option.title + ' (' + String(option.count) + ')'))
              )
            ),
            h('label', { className: 'egl-field', style: { flex: 'none' } },
              h('span', null, t('vocab.sort')),
              h('select', {
                className: 'egl-select',
                value: sortMode,
                onChange: (event) => onSort(event.target.value),
              },
                h('option', { value: 'time-desc' }, t('vocab.sort.timeDesc')),
                h('option', { value: 'time-asc' }, t('vocab.sort.timeAsc')),
                h('option', { value: 'az' }, t('vocab.sort.az'))
              )
            ),
            h('div', { className: 'egl-tabs', style: { marginLeft: 'auto' }, role: 'group', 'aria-label': t('vocab.detail') },
              h('button', { type: 'button', className: 'egl-tab' + (cardDetail === 'simple' ? ' is-on' : ''), 'aria-pressed': cardDetail === 'simple', onClick: () => onCardDetail('simple') }, t('vocab.detailSimple')),
              h('button', { type: 'button', className: 'egl-tab' + (cardDetail === 'full' ? ' is-on' : ''), 'aria-pressed': cardDetail === 'full', onClick: () => onCardDetail('full') }, t('vocab.detailFull'))
            )
          )
        ),
        h('div', { className: 'egl-scroll', style: { fontSize: font + 'px' } },
          pending > 0
            ? h('div', { className: 'egl-banner' },
                h('span', { className: 'egl-banner-text' }, t('vocab.pendingBanner', { n: String(pending) })),
                h('button', { type: 'button', className: 'egl-btn', onClick: onCopyPrompt }, t('vocab.copyPrompt'))
              )
            : null,
          words.length === 0
            ? h('div', { className: 'egl-empty' }, t('vocab.empty'))
            : filtered.length === 0
              ? h('div', { className: 'egl-empty' }, t('vocab.noMatch'))
              : h('div', { className: 'egl-cards' + (cardDetail === 'simple' ? ' egl-cards-simple' : '') },
                  filtered.map((entry) => h(VocabCard, {
                    key: entry.id,
                    t,
                    entry,
                    detail: cardDetail,
                    onDelete,
                    onEnrich,
                    enriching,
                    onAnalyze,
                    analyzing,
                  }))
                )
        )
      )
    }

    function EnvCommand({ label, command, copyLabel, onCopy }) {
      return h('div', null,
        h('div', { className: 'egl-cmd-label' }, label),
        h('div', { className: 'egl-cmd' },
          h('code', { className: 'egl-mono' }, command),
          h('button', { type: 'button', className: 'egl-btn', onClick: () => onCopy(command) }, copyLabel)
        )
      )
    }

    /**
     * 「环境自检」卡：只在文稿空态 / 转写面板出现，默认折叠；检测到问题才自动展开。
     * 账号、路径、命令都来自 action env.check（payload {}），不做任何本机探测。
     */
    function EnvCard({ api, t, showToast }) {
      const [env, setEnv] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [nonce, setNonce] = useState(0)
      const [open, setOpen] = useState(false)
      const autoOpenedRef = useRef(false)
      useEffect(() => {
        const controller = new AbortController()
        let alive = true
        setBusy(true)
        api.envCheck(controller.signal)
          .then((value) => {
            if (!alive) return
            setEnv(value && typeof value === 'object' ? value : {})
            setError('')
          })
          .catch((failure) => {
            if (!alive || isAbortError(failure)) return
            setError(errorMessage(failure))
          })
          .finally(() => {
            if (alive) setBusy(false)
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [api, nonce])
      const problems = envHasProblems(env)
      useEffect(() => {
        if (!problems || autoOpenedRef.current) return
        autoOpenedRef.current = true
        setOpen(true)
      }, [problems])
      const checked = env !== null
      const bl = env && typeof env.bl === 'object' && env.bl !== null ? env.bl : {}
      const pdf = env && typeof env.pdf === 'object' && env.pdf !== null ? env.pdf : {}
      const workspace = env && typeof env.workspace === 'object' && env.workspace !== null ? env.workspace : {}
      const blReady = checked && bl.present === true && bl.authenticated !== false
      const pdfReady = checked && pdf.present === true
      const workspaceReady = checked && workspace.writable !== false
      const chipClass = (ready) => 'egl-env-chip' + (!checked ? '' : ready ? ' is-ok' : ' is-bad')
      const chipText = (name, ready, bad) => name + ' · ' + (!checked ? t('env.checking') : ready ? t('env.ok') : bad)
      const blBad = !checked ? t('env.checking') : bl.present !== true ? t('env.missing') : t('env.notAuthenticated')
      const kv = (key, label, value, mono) => h('div', { className: 'egl-kv', key },
        h('span', { className: 'egl-kv-label' }, label),
        h('span', { className: 'egl-kv-value' + (mono ? ' egl-mono' : '') }, value)
      )
      const blDetail = []
      if (checked) {
        if (bl.present !== true) blDetail.push(t('env.missing'))
        else {
          if (bl.version) blDetail.push('v' + String(bl.version))
          if (bl.authenticated === true) blDetail.push(t('env.authenticated'))
          else if (bl.authenticated === false) blDetail.push(t('env.notAuthenticated'))
          if (blDetail.length === 0) blDetail.push(t('env.ok'))
        }
      }
      const pdfDetail = !checked ? '' : pdf.present === true ? String(pdf.tool || t('env.ok')) : t('env.missing')
      const workspaceDetail = !checked ? '' : String(workspace.root ?? '')
      const dirStatus = (value) => (value === true ? t('env.ok') : value === false ? t('env.missing') : '-')
      const commands = []
      if (checked && bl.present !== true) commands.push({ label: t('env.blInstall'), command: ENV_COMMANDS.blInstall })
      if (checked && bl.present === true && bl.authenticated === false) commands.push({ label: t('env.blLogin'), command: ENV_COMMANDS.blLogin })
      if (checked && pdf.present !== true) commands.push({ label: t('env.popplerInstall'), command: ENV_COMMANDS.popplerInstall })
      const warnings = env && Array.isArray(env.warnings) ? env.warnings : []
      const onCopy = (command) => {
        void copyText(command).then((copied) => {
          if (typeof showToast === 'function') showToast(copied ? t('common.copied') : command)
        })
      }
      const messages = []
      if (typeof bl.message === 'string' && bl.message.trim() !== '') messages.push(bl.message.trim())
      if (typeof pdf.message === 'string' && pdf.message.trim() !== '') messages.push(pdf.message.trim())
      return h('div', { className: 'egl-env' },
        h('button', {
          type: 'button',
          className: 'egl-env-head',
          'aria-expanded': open ? 'true' : 'false',
          title: open ? t('env.collapse') : t('env.expand'),
          onClick: () => setOpen((value) => !value),
        },
          h('span', { className: 'egl-env-title' }, t('env.title')),
          h('span', { className: 'egl-env-chips' },
            h('span', { key: 'bl', className: chipClass(blReady) }, chipText('bl', blReady, blBad)),
            h('span', { key: 'pdf', className: chipClass(pdfReady) }, chipText('PDF', pdfReady, t('env.missing'))),
            h('span', { key: 'workspace', className: chipClass(workspaceReady) }, chipText(t('env.workspace'), workspaceReady, t('env.readonly')))
          ),
          h('span', { className: 'egl-env-chevron' }, open ? '▾' : '▸')
        ),
        open
          ? h('div', { className: 'egl-env-body' },
              error !== '' ? h('div', { className: 'egl-err' }, t('error.withDetail', { message: error })) : null,
              kv('bl', t('env.bl'), blDetail.join(' · '), false),
              messages.length > 0
                ? h('div', { className: 'egl-muted', style: { fontSize: 11 } }, messages.join(' · '))
                : null,
              kv('pdf', t('env.poppler'), pdfDetail, false),
              kv('workspace', t('env.workspace'), workspaceDetail, workspaceDetail !== ''),
              h('div', { className: 'egl-env-sub' },
                h('span', { key: 'transcripts' }, 'transcripts · ' + dirStatus(workspace.transcripts)),
                h('span', { key: 'vocab' }, 'vocab · ' + dirStatus(workspace.vocab)),
                h('span', { key: 'recordings' }, 'recordings · ' + dirStatus(workspace.recordings)),
                h('span', { key: 'writable' }, t('env.writable') + ' · ' + dirStatus(checked ? workspace.writable : undefined))
              ),
              commands.map((item) => h(EnvCommand, {
                key: item.command,
                label: item.label,
                command: item.command,
                copyLabel: t('common.copy'),
                onCopy,
              })),
              warnings.length > 0
                ? h('div', null,
                    h('div', { className: 'egl-cmd-label' }, t('env.warnings')),
                    h('ul', { className: 'egl-env-warns' }, warnings.map((warning, index) => h('li', { key: index }, String(warning))))
                  )
                : null,
              h('div', { className: 'egl-env-actions' },
                h('button', {
                  type: 'button',
                  className: 'egl-btn',
                  disabled: busy,
                  onClick: () => setNonce((value) => value + 1),
                }, busy ? t('env.checking') : t('env.check')),
                commands.length > 0 ? h('span', { className: 'egl-env-hint' }, t('env.recheckHint')) : null
              )
            )
          : null
      )
    }


    // ── 背记（recall）视图 ─────────────────────────────────────────
    const RECALL_GRADE_LABEL_KEYS = Object.freeze({
      again: 'recall.gradeAgain',
      hard: 'recall.gradeHard',
      good: 'recall.gradeGood',
      easy: 'recall.gradeEasy',
    })

    const RECALL_VERDICT_LABEL_KEYS = Object.freeze({
      correct: 'recall.verdictCorrect',
      close: 'recall.verdictClose',
      wrong: 'recall.verdictWrong',
    })

    /**
     * 单题作答卡：answer（输入）→ revealed（看答案 + 自评）两阶段。
     * 每换一题由父组件用 key 重挂载，内部状态自然重置；revealed 阶段监听 1–4 / Enter 自评。
     */
    function RecallCard({ t, item, mode, grading, onGrade }) {
      const [phase, setPhase] = useState('answer')
      const [answer, setAnswer] = useState('')
      const [verdict, setVerdict] = useState('wrong')
      const [recommended, setRecommended] = useState('again')
      const [showExample, setShowExample] = useState(false)
      const inputRef = useRef(null)
      const enZh = mode === 'en-zh'

      useEffect(() => {
        if (phase !== 'answer') return
        const element = inputRef.current
        if (element) element.focus()
      }, [phase])

      const submit = useCallback((value) => {
        const outcome = judgeAnswer(mode, value, item)
        setVerdict(outcome.verdict)
        setRecommended(outcome.recommended)
        setPhase('revealed')
      }, [mode, item])

      const grade = useCallback((value) => {
        if (grading) return
        onGrade(item.entryId, value, mode)
      }, [grading, item.entryId, mode, onGrade])

      useEffect(() => {
        if (phase !== 'revealed') return undefined
        const onKeyDown = (event) => {
          if (event.isComposing === true || event.repeat === true) return
          if (event.ctrlKey || event.metaKey || event.altKey) return
          if (isEditableEvent(event)) return
          // Enter on a focused button/tab must stay native (grade that button,
          // toggle the example, switch the page); only blank-area Enter takes the hint.
          if (event.key === 'Enter' && isInteractiveTarget(event.target)) return
          if (event.key === 'Enter') {
            event.preventDefault()
            grade(recommended)
            return
          }
          const index = ['1', '2', '3', '4'].indexOf(event.key)
          if (index >= 0) {
            event.preventDefault()
            grade(RECALL_GRADES[index])
          }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [phase, grade, recommended])

      const meanings = collapseMeanings(item.meanings)
      const family = Array.isArray(item.family) ? item.family : []
      const mastery = Math.min(5, Math.max(0, Number(item.mastery) || 0))
      const answered = String(answer ?? '').trim()

      const header = h('div', { className: 'egl-recall-cardhead' },
        h('span', { className: 'egl-recall-cardchip' + (item.status === 'new' ? ' is-new' : '') },
          item.status === 'new' ? t('recall.cardNew') : t('recall.cardDue')),
        h('span', { className: 'egl-recall-lv' }, t('recall.level', { level: String(mastery) }))
      )

      const exampleSentence = recallExampleOf(item)
      const promptLine = h('div', { className: 'egl-recall-prompt-line' },
        h('span', { className: 'egl-recall-prompt-sub' }, enZh ? t('recall.promptEnZh') : t('recall.promptZhEn')),
        phase === 'answer'
          ? h('button', {
              type: 'button',
              className: 'egl-recall-hintbtn',
              'aria-expanded': showExample ? 'true' : 'false',
              onClick: () => {
                setShowExample((value) => !value)
                if (inputRef.current) inputRef.current.focus()
              },
            }, showExample ? t('recall.hideExample') : t('recall.showExample'))
          : null
      )
      const exampleHint = showExample
        ? h('div', { className: 'egl-recall-example' },
            h('div', { className: 'egl-recall-example-label' }, t('recall.exampleLabel')),
            exampleSentence !== ''
              ? h('div', { className: 'egl-recall-example-text' }, enZh ? exampleSentence : maskExampleTerms(exampleSentence, item))
              : h('div', { className: 'egl-recall-example-text egl-muted' }, t('recall.noExample'))
          )
        : null

      const prompt = enZh
        ? h('div', { className: 'egl-recall-prompt' },
            h('div', null,
              h('span', { className: 'egl-recall-word' }, String(item.word ?? '')),
              item.ipa ? h('span', { className: 'egl-recall-ipa' }, String(item.ipa)) : null
            ),
            promptLine
          )
        : h('div', { className: 'egl-recall-prompt' },
            meanings.length > 0
              ? meanings.map((meaning, index) => h('div', { key: String(index), className: 'egl-recall-prompt-text' },
                  meaning.pos ? h('span', { className: 'egl-pos' }, String(meaning.pos)) : null,
                  h('span', null, String(meaning.zh ?? ''))
                ))
              : h('div', { className: 'egl-recall-prompt-text egl-muted' }, '—'),
            promptLine
          )

      const answerPhase = h('div', null,
        exampleHint,
        h('input', {
          className: 'egl-recall-input',
          ref: inputRef,
          value: answer,
          placeholder: enZh ? t('recall.placeholderEnZh') : t('recall.placeholderZhEn'),
          'aria-label': enZh ? t('recall.promptEnZh') : t('recall.promptZhEn'),
          autoComplete: 'off',
          onChange: (event) => setAnswer(event.target.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter') return
            if (event.nativeEvent?.isComposing === true || event.isComposing === true) return
            event.preventDefault()
            submit(answer)
          },
        }),
        h('div', { className: 'egl-recall-actions' },
          h('button', { type: 'button', className: 'egl-btn', onClick: () => submit(answer) }, t('recall.submit')),
          h('button', {
            type: 'button',
            className: 'egl-link',
            onClick: () => {
              setAnswer('')
              submit('')
            },
          }, t('recall.skip'))
        )
      )

      const correct = enZh
        ? h('div', null,
            meanings.length > 0
              ? meanings.map((meaning, index) => h('div', { key: String(index), className: 'egl-meaning' },
                  h('span', { className: 'egl-pos' }, String(meaning.pos ?? '')),
                  h('span', null, String(meaning.zh ?? ''))
                ))
              : h('div', { className: 'egl-muted' }, '—'),
            exampleSentence !== '' ? h('div', { className: 'egl-example' }, renderRichText(exampleSentence, { word: item.word })) : null,
            item.sentenceZh ? h('div', { className: 'egl-example' }, String(item.sentenceZh)) : null
          )
        : h('div', null,
            h('div', null,
              h('span', { className: 'egl-word' }, String(item.word ?? '')),
              item.ipa ? h('span', { className: 'egl-ipa', style: { marginLeft: 6 } }, String(item.ipa)) : null
            ),
            family.length > 0
              ? h('div', { className: 'egl-family' }, family.map((entry, index) => h('span', { key: String(index), className: 'egl-form' },
                  String(entry.label ? entry.label + ' ' + entry.form : entry.form)
                )))
              : null,
            exampleSentence !== '' ? h('div', { className: 'egl-example' }, renderRichText(exampleSentence, { word: item.word })) : null,
            item.sentenceZh ? h('div', { className: 'egl-example' }, String(item.sentenceZh)) : null
          )

      const reveal = h('div', null,
        h('div', { className: 'egl-recall-answerline' },
          h('span', { className: 'egl-recall-answerlabel' }, t('recall.answer')),
          answered === ''
            ? h('span', { className: 'egl-recall-answertext is-blank' }, '—')
            : h('span', { className: 'egl-recall-answertext' }, answered)
        ),
        h('div', { className: 'egl-recall-correct' },
          h('div', { className: 'egl-recall-answerlabel' }, t('recall.correctAnswer')),
          correct
        ),
        h('div', { className: 'egl-recall-verdict is-' + verdict }, t(RECALL_VERDICT_LABEL_KEYS[verdict] ?? RECALL_VERDICT_LABEL_KEYS.wrong)),
        h('div', { className: 'egl-recall-hint' }, t('recall.verdictHint')),
        h('div', { className: 'egl-recall-grades' }, RECALL_GRADES.map((value, index) => {
          const label = t(RECALL_GRADE_LABEL_KEYS[value])
          return h('button', {
            key: value,
            type: 'button',
            className: 'egl-recall-grade' + (recommended === value ? ' is-rec' : ''),
            'aria-pressed': recommended === value,
            disabled: grading,
            title: label,
            onClick: () => grade(value),
          }, label, h('span', { className: 'egl-recall-gradekey' }, String(index + 1)))
        })),
        h('div', { className: 'egl-recall-hint', style: { marginTop: 6, marginBottom: 0 } }, t('recall.gradeHint'))
      )

      return h('div', { className: 'egl-recall-card' },
        header,
        prompt,
        phase === 'answer' ? answerPhase : reveal
      )
    }

    /** 进度条 + 今日统计 chips（文字表达进度，进度条只是视觉补充）。 */
    function RecallProgress({ t, overview }) {
      const summary = overview?.summary && typeof overview.summary === 'object' ? overview.summary : {}
      const total = Math.max(0, Math.floor(Number(summary.roundTotal) || 0))
      const done = Math.min(total, Math.max(0, Math.floor(Number(summary.roundDone) || 0)))
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      const progressText = t('recall.progress', { done: String(done), total: String(total) })
      const chips = [
        done < total ? t('recall.remaining', { n: String(total - done) }) : '',
        Number(summary.due) > 0 ? t('recall.due', { n: String(Number(summary.due)) }) : '',
        Number(summary.new) > 0 ? t('recall.newWords', { n: String(Number(summary.new)) }) : '',
        Number(summary.mastered) > 0 ? t('recall.mastered', { n: String(Number(summary.mastered)) }) : '',
        Number(summary.streakDays) > 0 ? t('recall.streak', { n: String(Number(summary.streakDays)) }) : '',
      ].filter((text) => text !== '')
      return h('div', null,
        h('div', { className: 'egl-recall-progress' },
          h('span', { className: 'egl-recall-progress-text' }, progressText),
          h('div', {
            className: 'egl-recall-track',
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': total,
            'aria-valuenow': done,
            'aria-label': progressText,
          }, h('div', { className: 'egl-recall-fill', style: { width: percent + '%' } }))
        ),
        chips.length > 0
          ? h('div', { className: 'egl-recall-chips' }, chips.map((text, index) => h('span', { key: String(index), className: 'egl-recall-chip' }, text)))
          : null
      )
    }

    /** 最近 14 天小柱状图：外层灰柱 = 当日题量，内层品牌色 = 当日完成量（无图表库、无 SVG 依赖）。 */
    function RecallHistory({ t, overview }) {
      const today = typeof overview?.date === 'string' ? overview.date : ''
      if (today === '') return null
      const byDate = new Map()
      for (const entry of Array.isArray(overview.history) ? overview.history : []) {
        if (entry && typeof entry.date === 'string') byDate.set(entry.date, entry)
      }
      const days = []
      for (let offset = 13; offset >= 0; offset -= 1) {
        const day = shiftDateString(today, -offset)
        if (day !== '') days.push(day)
      }
      let maxTotal = 1
      for (const day of days) {
        const entry = byDate.get(day)
        if (entry) maxTotal = Math.max(maxTotal, Number(entry.total) || 0)
      }
      const title = t('recall.historyTitle', { n: String(days.length) })
      return h('div', null,
        h('div', { className: 'egl-recall-section' }, h('span', { className: 'egl-recall-section-title' }, title)),
        h('div', { className: 'egl-recall-history', role: 'img', 'aria-label': title },
          days.map((day) => {
            const entry = byDate.get(day)
            const total = entry ? Math.max(0, Math.floor(Number(entry.total) || 0)) : 0
            const done = entry ? Math.min(total, Math.max(0, Math.floor(Number(entry.done) || 0))) : 0
            const barPx = total > 0 ? Math.max(4, Math.round((total / maxTotal) * 44)) : 0
            const donePx = total > 0 ? Math.round((barPx * done) / total) : 0
            return h('div', {
              key: day,
              className: 'egl-recall-histcol',
              title: day + ' · ' + String(done) + '/' + String(total),
            },
              h('div', { className: 'egl-recall-histspace' },
                h('div', { className: 'egl-recall-histbar', style: { height: barPx + 'px' } },
                  h('div', { className: 'egl-recall-histdone', style: { height: donePx + 'px' } })
                )
              ),
              h('span', { className: 'egl-recall-histlabel' }, String(Number(day.slice(8))))
            )
          })
        )
      )
    }

    /**
     * 掌握情况页：表格（单词 / 掌握度进度条 / 等级 / 下次复习 / 操作），每列内容左对齐；
     * 每行可单独重置，底部两段式「重置全部进度」。
     */
    function RecallMasteryPage({ t, overview, grading, onResetWord, onResetAll }) {
      const [confirmAll, setConfirmAll] = useState(false)
      const words = Array.isArray(overview?.words) ? overview.words : []
      const today = typeof overview?.date === 'string' ? overview.date : ''
      if (words.length === 0) return h('div', { className: 'egl-empty' }, t('recall.noWordbook'))
      const head = h('div', { className: 'egl-recall-tablehead', role: 'row' },
        h('span', { role: 'columnheader' }, t('recall.tableWord')),
        h('span', { role: 'columnheader' }, t('recall.tableMastery')),
        h('span', { role: 'columnheader' }, t('recall.tableLevel')),
        h('span', { role: 'columnheader' }, t('recall.tableNext')),
        h('span', { role: 'columnheader' }, t('recall.tableActions'))
      )
      const rows = words.map((entry) => {
        const mastery = Math.min(5, Math.max(0, Math.floor(Number(entry.mastery) || 0)))
        const masteryLabel = t('recall.mastery' + String(mastery))
        return h('div', { key: entry.entryId, className: 'egl-recall-tablerow', role: 'row' },
          h('span', {
            className: 'egl-recall-cell egl-recall-cell-word',
            role: 'cell',
            title: String(entry.word ?? ''),
          }, String(entry.word ?? '')),
          h('span', { className: 'egl-recall-cell', role: 'cell' },
            h('span', { className: 'egl-recall-bar', title: masteryLabel, 'aria-label': masteryLabel },
              [0, 1, 2, 3, 4].map((index) => h('span', {
                key: String(index),
                className: 'egl-recall-barseg' + (index < mastery ? ' is-on' : ''),
              })))
          ),
          h('span', { className: 'egl-recall-cell egl-recall-cell-lv', role: 'cell' },
            t('recall.level', { level: String(mastery) })),
          h('span', {
            className: 'egl-recall-cell egl-recall-cell-next',
            role: 'cell',
            title: typeof entry.nextAt === 'string' ? entry.nextAt : '',
          }, entry.learned ? recallNextLabel(t, entry.nextAt, today) : '-'),
          h('span', { className: 'egl-recall-cell', role: 'cell' },
            h('button', {
              type: 'button',
              className: 'egl-recall-reset',
              disabled: grading,
              onClick: () => onResetWord(entry.entryId),
            }, t('recall.resetWord'))
          )
        )
      })
      return h('div', null,
        h('div', { className: 'egl-recall-section' },
          h('span', { className: 'egl-recall-section-title' }, t('recall.masteryTitle')),
          h('span', { className: 'egl-muted', style: { fontSize: 11 } }, String(words.length))
        ),
        h('div', { className: 'egl-recall-tablewrap' },
          h('div', { className: 'egl-recall-table', role: 'table', 'aria-label': t('recall.masteryTitle') },
            head,
            rows
          )
        ),
        h('div', { className: 'egl-recall-resetbar' },
          confirmAll
            ? h(React.Fragment, null,
                h('span', { className: 'egl-recall-resetbar-text' }, t('recall.resetAllConfirm')),
                h('button', {
                  type: 'button',
                  className: 'egl-btn egl-danger',
                  disabled: grading,
                  onClick: () => {
                    setConfirmAll(false)
                    onResetAll()
                  },
                }, t('recall.resetYes')),
                h('button', { type: 'button', className: 'egl-btn egl-ghost', onClick: () => setConfirmAll(false) }, t('recall.resetNo'))
              )
            : h('button', {
                type: 'button',
                className: 'egl-btn egl-ghost',
                style: { marginLeft: 'auto' },
                disabled: grading,
                onClick: () => setConfirmAll(true),
              }, t('recall.resetAll'))
        )
      )
    }

    /**
     * 背记视图：两个页面（今日复习 / 掌握情况）用顶部标签切换，互不堆叠。
     * 今日复习 = 练习方式切换 + 进度/统计 + 单题卡或完成态/空态；
     * 掌握情况 = 独立的表格页（单词 / 掌握度 / 等级 / 下次复习 / 操作）。
     * 全部数据状态由面板容器持有；本组件只在当前 tab 渲染。
     */
    function RecallView(props) {
      const {
        t, overview, loading, error, mode, onModeChange, onRefresh,
        onGrade, onResetWord, onResetAll, grading, font,
      } = props
      const [page, setPage] = useState('practice')
      const summary = overview?.summary && typeof overview.summary === 'object' ? overview.summary : {}
      const items = Array.isArray(overview?.items) ? overview.items : []
      const listedWords = Array.isArray(overview?.words) ? overview.words.length : 0
      const summaryWords = Math.max(0, Math.floor(Number(summary.words) || 0))
      // Only word entries with at least one Chinese meaning are playable.
      const eligibleWords = Number.isFinite(Number(summary.eligible))
        ? Math.max(0, Math.floor(Number(summary.eligible)))
        : listedWords
      const wordCount = eligibleWords
      const roundTotal = Math.max(0, Math.floor(Number(summary.roundTotal) || 0))
      const roundDone = Math.min(roundTotal, Math.max(0, Math.floor(Number(summary.roundDone) || 0)))
      const completed = roundTotal > 0 && roundDone >= roundTotal
      const effectiveMode = mode === 'en-zh' || mode === 'zh-en' ? mode : 'mix'
      const currentIndex = items.findIndex((item) => item.done !== true)
      const current = currentIndex >= 0 ? items[currentIndex] : null
      const itemMode = effectiveMode === 'mix'
        ? (Math.max(0, currentIndex) % 2 === 0 ? 'en-zh' : 'zh-en')
        : effectiveMode

      const pageTabs = h('div', { className: 'egl-recall-head' },
        h('div', { className: 'egl-tabs', role: 'tablist', 'aria-label': t('recall.pageTabs') },
          [['practice', t('recall.pagePractice')], ['mastery', t('recall.pageMastery')]]
            .map(([value, label]) => h('button', {
              key: value,
              type: 'button',
              role: 'tab',
              'aria-selected': page === value,
              className: 'egl-tab' + (page === value ? ' is-on' : ''),
              onClick: () => setPage(value),
            }, label))
        )
      )

      const modeTabs = page === 'practice'
        ? h('div', { className: 'egl-recall-head' },
            h('span', { className: 'egl-recall-label' }, t('recall.mode')),
            h('div', { className: 'egl-tabs', role: 'group', 'aria-label': t('recall.mode') },
              [['mix', t('recall.modeMix')], ['en-zh', t('recall.modeEnZh')], ['zh-en', t('recall.modeZhEn')]]
                .map(([value, label]) => h('button', {
                  key: value,
                  type: 'button',
                  className: 'egl-tab' + (effectiveMode === value ? ' is-on' : ''),
                  'aria-pressed': effectiveMode === value,
                  onClick: () => onModeChange(value),
                }, label))
            )
          )
        : null

      let body
      if (error !== '') {
        body = h('div', { className: 'egl-empty' },
          h('div', { className: 'egl-empty-title' }, t('recall.failed')),
          h('div', null, error),
          h('div', { style: { marginTop: 10 } },
            h('button', { type: 'button', className: 'egl-btn', onClick: onRefresh }, t('recall.retry'))
          )
        )
      } else if (overview === null) {
        body = h('div', { className: 'egl-empty' }, t('recall.loading'))
      } else if (page === 'mastery') {
        body = h(RecallMasteryPage, { t, overview, grading, onResetWord, onResetAll })
      } else if (wordCount === 0) {
        body = summaryWords > 0
          ? h('div', { className: 'egl-empty' }, h('div', { className: 'egl-empty-title' }, t('recall.noMeanings')))
          : h('div', { className: 'egl-empty' }, t('recall.noWordbook'))
      } else if (completed) {
        body = h('div', null,
          h(RecallProgress, { t, overview }),
          h('div', { className: 'egl-recall-done' },
            h('div', { className: 'egl-recall-done-title' }, t('recall.doneTitle')),
            h('div', { className: 'egl-recall-done-summary' }, t('recall.doneSummary', {
              done: String(roundDone),
              correct: String(Math.max(0, Math.floor(Number(summary.correct) || 0))),
            })),
            h('div', { className: 'egl-recall-done-hint' }, t('recall.doneHint'))
          ),
          h(RecallHistory, { t, overview })
        )
      } else if (current === null) {
        body = h('div', { className: 'egl-empty' },
          h('div', { className: 'egl-empty-title' }, t('recall.noRound')),
          typeof summary.nextAt === 'string' && summary.nextAt !== ''
            ? h('div', { className: 'egl-muted' }, t('recall.nextReview', { date: summary.nextAt }))
            : null
        )
      } else {
        body = h('div', null,
          h(RecallProgress, { t, overview }),
          h(RecallCard, {
            key: String(current.entryId) + ':' + itemMode + ':' + String(roundDone),
            t,
            item: current,
            mode: itemMode,
            grading,
            onGrade,
          })
        )
      }

      return h('div', { className: 'egl-recall', 'aria-busy': loading ? 'true' : 'false' },
        pageTabs,
        modeTabs,
        h('div', { className: 'egl-scroll', style: { fontSize: Number(font) + 'px' } }, body)
      )
    }


    // ── 图谱（graph）视图 ─────────────────────────────────────────────
    const GRAPH_KIND_LABEL_KEYS = {
      word: 'graph.kindWord',
      transcript: 'graph.kindTranscript',
    }
    const GRAPH_REL_KIND_KEYS = {
      appears: 'graph.legendAppears',
      cooccur: 'graph.legendCooccur',
      morph: 'graph.legendMorph',
      sense: 'graph.legendSense',
    }
    const GRAPH_REL_SORT = { cooccur: 0, morph: 1, sense: 2 }

    /** 掌握度弧环的 DOM 版本（详情面板里与画布上的环一致）。 */
    function GraphMastery({ t, mastery }) {
      const value = Math.min(5, Math.max(0, Math.trunc(Number(mastery) || 0)))
      if (value <= 0) return null
      return h('span', { className: 'egl-graph-progress', title: t('graph.mastery', { n: String(value) }) },
        Array.from({ length: 5 }, (_, index) => h('span', {
          key: String(index),
          className: 'egl-graph-progressseg' + (index < value ? ' is-on' : ''),
        })))
    }

    /** 单词-单词联系的展示文案（同句次数 / 同根 / 同族 / 近义）。 */
    function graphRelationLabel(t, link) {
      if (link.kind === 'cooccur') return t('graph.sharedSentences', { n: String(Math.max(0, Math.trunc(Number(link.sentences) || 0))) })
      if (link.kind === 'morph') {
        return link.reason === 'family'
          ? t('graph.morphFamily', { detail: String(link.detail ?? '') })
          : t('graph.morphRoot', { detail: String(link.detail ?? '') })
      }
      if (link.kind === 'sense') return t('graph.sense', { detail: String(link.detail ?? '') })
      return ''
    }

    /** 详情面板：未选中给提示，选中给单词/文稿的关系清单与动作。 */
    function GraphDetail({ t, graph, node, onSelect, onOpenTranscript, onScopeFile }) {
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
      const links = Array.isArray(graph?.links) ? graph.links : []
      const close = h('button', {
        type: 'button',
        className: 'egl-graph-close',
        'aria-label': t('graph.close'),
        title: t('graph.close'),
        onClick: () => onSelect(null),
      }, '×')
      if (node === null || node === undefined) {
        const summary = graph?.summary && typeof graph.summary === 'object' ? graph.summary : {}
        const linkCount = summary.links && typeof summary.links === 'object' ? Math.max(0, Math.floor(Number(summary.links.total) || 0)) : 0
        return h('div', null,
          h('div', { className: 'egl-graph-meta' }, t('graph.summary', {
            words: String(Math.max(0, Math.floor(Number(summary.words) || 0))),
            transcripts: String(Math.max(0, Math.floor(Number(summary.transcripts) || 0))),
            links: String(linkCount),
          })),
          h('div', { className: 'egl-empty' }, t('graph.detailEmpty')),
          h('div', { className: 'egl-muted', style: { fontSize: 11, padding: '0 4px 4px', lineHeight: 1.6 } }, t('graph.hint'))
        )
      }
      const nodeById = new Map(nodes.map((item) => [item.id, item]))
      if (node.kind === 'word') {
        const meanings = collapseMeanings(node.meanings)
        const appears = links
          .filter((link) => link.kind === 'appears' && link.target === node.id)
          .sort((left, right) => (
            Number(right.origin === true) - Number(left.origin === true)
            || (Number(right.count) || 0) - (Number(left.count) || 0)
            || String(left.source).localeCompare(String(right.source))
          ))
        const related = links
          .filter((link) => link.kind !== 'appears' && (link.source === node.id || link.target === node.id))
          .map((link) => ({ link, other: nodeById.get(link.source === node.id ? link.target : link.source) }))
          .filter((row) => row.other !== undefined)
          .sort((left, right) => (
            (GRAPH_REL_SORT[left.link.kind] ?? 9) - (GRAPH_REL_SORT[right.link.kind] ?? 9)
            || String(left.other.word ?? '').localeCompare(String(right.other.word ?? ''))
          ))
        return h(React.Fragment, null,
          h('div', { className: 'egl-graph-detailhead' },
            h('span', { className: 'egl-graph-kind' }, t(GRAPH_KIND_LABEL_KEYS.word)),
            h('span', { className: 'egl-graph-title' }, String(node.word ?? '')),
            node.ipa ? h('span', { className: 'egl-ipa' }, String(node.ipa)) : null,
            close
          ),
          h('div', { className: 'egl-graph-meta' },
            t('graph.mastery', { n: String(Math.min(5, Math.max(0, Math.trunc(Number(node.mastery) || 0)))) }),
            h(GraphMastery, { t, mastery: node.mastery })
          ),
          meanings.length > 0
            ? h('div', { className: 'egl-graph-meanings' }, meanings.map((meaning, index) => h('div', { key: String(index), className: 'egl-meaning' },
              meaning.pos ? h('span', { className: 'egl-pos' }, String(meaning.pos)) : null,
              String(meaning.zh ?? '')
            )))
            : h('div', { className: 'egl-muted' }, t('graph.noMeaning')),
          node.sentence ? h('div', { className: 'egl-graph-example' },
            h('div', { className: 'egl-pos', style: { marginRight: 0 } }, t('graph.sentence')),
            String(node.sentence)
          ) : null,
          h('div', { className: 'egl-graph-section' }, t('graph.relations')),
          appears.length === 0 && related.length === 0
            ? h('div', { className: 'egl-muted' }, t('graph.noRelations'))
            : null,
          appears.map((link) => {
            const transcript = nodeById.get(link.source)
            const title = transcript ? String(transcript.title ?? transcript.file ?? '') : String(link.source)
            return h(React.Fragment, { key: link.id },
              h('div', { className: 'egl-graph-rel', role: 'group' },
                h('span', { className: 'egl-graph-relkind' }, link.origin === true ? t('graph.origin') : t('graph.legendAppears')),
                h('span', { className: 'egl-graph-reltext' }, title),
                h('span', { className: 'egl-graph-relcount' }, t('graph.occurrences', { n: String(Math.max(0, Math.trunc(Number(link.count) || 0))) })),
                transcript && onOpenTranscript
                  ? h('button', { type: 'button', className: 'egl-graph-scopebtn', onClick: () => onOpenTranscript(transcript.file) }, t('graph.openTranscript'))
                  : null
              ),
              link.sample && link.sample.text
                ? h('div', { className: 'egl-graph-sample' }, String(link.sample.text))
                : null
            )
          }),
          related.map((row) => h('button', {
            key: row.link.id,
            type: 'button',
            className: 'egl-graph-rel',
            onClick: () => onSelect(row.other.id),
          },
            h('span', { className: 'egl-graph-relkind' }, t(GRAPH_REL_KIND_KEYS[row.link.kind] ?? 'graph.legendCooccur')),
            h('span', { className: 'egl-graph-reltext' }, String(row.other.word ?? '')),
            h('span', { className: 'egl-graph-relcount' }, graphRelationLabel(t, row.link))
          ))
        )
      }
      const appears = links
        .filter((link) => link.kind === 'appears' && link.source === node.id)
        .map((link) => ({ link, word: nodeById.get(link.target) }))
        .filter((row) => row.word !== undefined)
        .sort((left, right) => (
          (Number(right.link.count) || 0) - (Number(left.link.count) || 0)
          || String(left.word.word ?? '').localeCompare(String(right.word.word ?? ''))
        ))
      return h(React.Fragment, null,
        h('div', { className: 'egl-graph-detailhead' },
          h('span', { className: 'egl-graph-kind' }, t(GRAPH_KIND_LABEL_KEYS.transcript)),
          h('span', { className: 'egl-graph-title' }, String(node.title ?? node.file ?? '')),
          close
        ),
        h('div', { className: 'egl-graph-meta' }, t('graph.transcriptMeta', {
          segments: String(Math.max(0, Math.trunc(Number(node.segments) || 0))),
          duration: fmtClock(Number(node.durationMs) || 0),
          speakers: String(Math.max(0, Math.trunc(Number(node.speakers) || 0))),
        })),
        h('div', { className: 'egl-graph-meta' }, t('graph.matchedWords', { n: String(appears.length) })),
        h('div', { className: 'egl-graph-actionrow' },
          onOpenTranscript
            ? h('button', { type: 'button', className: 'egl-btn', onClick: () => onOpenTranscript(node.file) }, t('graph.openTranscript'))
            : null,
          onScopeFile
            ? h('button', { type: 'button', className: 'egl-btn', onClick: () => onScopeFile(node.file) }, t('graph.scopeTranscript'))
            : null
        ),
        h('div', { className: 'egl-graph-section' }, t('graph.relations')),
        appears.length === 0
          ? h('div', { className: 'egl-muted' }, t('graph.noRelations'))
          : null,
        appears.map((row) => h('button', {
          key: row.link.id,
          type: 'button',
          className: 'egl-graph-rel',
          onClick: () => onSelect(row.word.id),
        },
          h('span', { className: 'egl-graph-relkind' }, row.link.origin === true ? t('graph.origin') : t('graph.legendWord')),
          h('span', { className: 'egl-graph-reltext' }, String(row.word.word ?? '')),
          h('span', { className: 'egl-graph-relcount' }, t('graph.occurrences', { n: String(Math.max(0, Math.trunc(Number(row.link.count) || 0))) }))
        ))
      )
    }

    /**
     * 图谱视图：工具行（筛选 / 搜索 / 缩放复位）+ 画布 + 图例 + 详情。
     * 画布与交互全部由 §6 useGraphCanvas 负责；本组件只做数据派生与 DOM 结构。
     */
    function GraphView(props) {
      const {
        t, graph, loading, error, filter, onFilter, search, onSearch,
        selected, onSelect, onRefresh, onOpenTranscript, scopeFile, onScopeFile, onClearScope,
      } = props
      const canvasRef = useRef(null)
      const containerRef = useRef(null)
      const scoped = useMemo(() => graphScopedData(graph, scopeFile), [graph, scopeFile])
      const nodes = Array.isArray(scoped?.nodes) ? scoped.nodes : []
      const links = Array.isArray(scoped?.links) ? scoped.links : []
      const selectedNode = selected ? nodes.find((node) => node.id === selected) ?? null : null
      const canvasApi = useGraphCanvas({
        canvasRef,
        containerRef,
        data: scoped ?? null,
        scopeKey: scopeFile,
        // 选中节点可能被当前范围排除：此时不高亮/压暗，避免整张图被压暗。
        selectedId: selectedNode !== null ? selected : null,
        filter,
        search,
        onSelect,
      })
      const summary = graph?.summary && typeof graph.summary === 'object' ? graph.summary : {}
      const results = String(search ?? '').trim() === '' ? [] : graphSearchNodes(nodes, search)
      const wordCount = Math.max(0, Math.floor(Number(summary.words) || 0))
      const transcriptCount = Math.max(0, Math.floor(Number(summary.transcripts) || 0))
      const isolated = Math.max(0, Math.floor(Number(summary.isolatedWords) || 0))
      const truncated = summary.truncated && typeof summary.truncated === 'object' ? summary.truncated : {}
      const truncatedWords = Math.max(0, Math.floor(Number(truncated.words) || 0))
      const truncatedTranscripts = Math.max(0, Math.floor(Number(truncated.transcripts) || 0))
      const hasWords = wordCount > 0
      const hasTranscripts = transcriptCount > 0
      const hasLinks = links.length > 0
      const scopeTitle = (() => {
        if (typeof scopeFile !== 'string' || scopeFile === '') return ''
        const found = nodes.find((node) => node.kind === 'transcript' && node.file === scopeFile)
        return found ? String(found.title ?? found.file ?? '') : scopeFile
      })()

      const filterTabs = h('div', { className: 'egl-tabs', role: 'group', 'aria-label': t('graph.filter') },
        [['all', t('graph.filterAll')], ['doc', t('graph.filterDoc')], ['word', t('graph.filterWord')]]
          .map(([value, label]) => h('button', {
            key: value,
            type: 'button',
            role: 'tab',
            'aria-selected': filter === value,
            className: 'egl-tab' + (filter === value ? ' is-on' : ''),
            onClick: () => onFilter(value),
          }, label))
      )

      const searchInput = h('input', {
        className: 'egl-input egl-graph-search',
        type: 'search',
        placeholder: t('graph.search'),
        'aria-label': t('graph.search'),
        value: search,
        onChange: (event) => onSearch(event.target.value),
      })

      const actions = h('div', { className: 'egl-graph-actions' },
        h('button', {
          type: 'button',
          className: 'egl-btn egl-graph-zoom',
          'aria-label': t('graph.zoomIn'),
          title: t('graph.zoomIn'),
          onClick: () => canvasApi.zoomIn(),
        }, '+'),
        h('button', {
          type: 'button',
          className: 'egl-btn egl-graph-zoom',
          'aria-label': t('graph.zoomOut'),
          title: t('graph.zoomOut'),
          onClick: () => canvasApi.zoomOut(),
        }, '−'),
        h('button', { type: 'button', className: 'egl-btn', onClick: () => canvasApi.resetView() }, t('graph.resetView'))
      )

      const scope = typeof scopeFile === 'string' && scopeFile !== ''
        ? h('div', { className: 'egl-graph-scope' },
          h('span', { className: 'egl-graph-scopetext' }, t('graph.scopeChip', { title: scopeTitle })),
          h('button', { type: 'button', className: 'egl-graph-scopebtn', onClick: onClearScope }, t('graph.clearScope'))
        )
        : null

      const resultsList = String(search ?? '').trim() !== '' && hasWords
        ? h('div', { className: 'egl-graph-results', 'aria-label': t('graph.searchResults') },
          results.length === 0
            ? h('div', { className: 'egl-muted' }, t('graph.searchEmpty'))
            : results.map((node) => h('button', {
              key: node.id,
              type: 'button',
              className: 'egl-graph-result',
              onClick: () => {
                onSelect(node.id)
                canvasApi.centerOn(node.id)
              },
            },
              h('span', { className: 'egl-graph-kind' }, t(GRAPH_KIND_LABEL_KEYS[node.kind] ?? 'graph.kindWord')),
              h('span', { className: 'egl-graph-result-label' }, node.kind === 'transcript'
                ? String(node.title ?? node.file ?? '')
                : String(node.word ?? ''))
            )))
        : null

      const banners = []
      if (error !== '' && graph !== null) {
        banners.push(h('div', { key: 'error', className: 'egl-graph-banner' },
          h('span', null, error),
          h('button', { type: 'button', className: 'egl-graph-scopebtn', style: { marginLeft: 8 }, onClick: onRefresh }, t('graph.retry'))
        ))
      }
      if (truncatedWords > 0 || truncatedTranscripts > 0) {
        banners.push(h('div', { key: 'truncated', className: 'egl-graph-banner' }, t('graph.truncated', {
          words: String(wordCount),
          transcripts: String(transcriptCount),
        })))
      }
      if (isolated > 0 && !scopeTitle) {
        banners.push(h('div', { key: 'isolated', className: 'egl-graph-banner' }, t('graph.isolated', { n: String(isolated) })))
      }

      const legend = h('div', { className: 'egl-graph-legend', 'aria-label': t('graph.legendTitle') },
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dot', style: { background: 'var(--dsw-alias-brand-primary)' } }),
          t('graph.legendWord')),
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dot', style: { background: 'var(--dsw-alias-state-warn-primary)' } }),
          t('graph.legendTranscript')),
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dash' }),
          t('graph.legendAppears')),
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dot', style: { background: 'var(--dsw-alias-brand-primary)', width: 6, height: 6 } }),
          t('graph.legendCooccur')),
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dash', style: { color: 'var(--dsw-alias-state-success-primary)' } }),
          t('graph.legendMorph')),
        h('span', { className: 'egl-graph-key' },
          h('span', { className: 'egl-graph-dash', style: { color: 'var(--dsw-alias-state-error-primary)' } }),
          t('graph.legendSense'))
      )

      let placeholder = null
      if (loading && graph === null) {
        placeholder = h('div', { className: 'egl-empty' }, t('graph.loading'))
      } else if (graph === null) {
        placeholder = error !== ''
          ? h('div', { className: 'egl-empty' },
            h('div', { className: 'egl-empty-title' }, t('graph.failed')),
            h('div', { className: 'egl-muted' }, error),
            h('div', { style: { marginTop: 8 } }, h('button', { type: 'button', className: 'egl-btn', onClick: onRefresh }, t('graph.retry'))))
          : h('div', { className: 'egl-empty' }, t('graph.loading'))
      } else if (!hasWords) {
        placeholder = h('div', { className: 'egl-empty' }, t('graph.emptyWords'))
      } else if (!hasTranscripts) {
        placeholder = h('div', { className: 'egl-empty' }, t('graph.emptyTranscripts'))
      } else if (!hasLinks) {
        placeholder = h('div', { className: 'egl-empty' }, t('graph.emptyLinks'))
      }

      const ariaLabel = t('graph.ariaLabel', { words: String(wordCount), transcripts: String(transcriptCount) })
      const detail = selectedNode !== null
        ? h(GraphDetail, { t, graph: scoped, node: selectedNode, onSelect, onOpenTranscript, onScopeFile })
        : (placeholder !== null ? placeholder : h(GraphDetail, { t, graph: scoped, node: null, onSelect, onOpenTranscript, onScopeFile }))

      return h('div', { className: 'egl-graph', 'aria-busy': loading ? 'true' : 'false' },
        h('div', { className: 'egl-graph-tools' }, filterTabs, searchInput, actions),
        scope,
        resultsList,
        banners.length > 0 ? h('div', { className: 'egl-graph-banners' }, banners) : null,
        h('div', { className: 'egl-graph-canvas', ref: containerRef },
          h('canvas', { ref: canvasRef, role: 'img', 'aria-label': ariaLabel })),
        legend,
        h('div', { className: 'egl-graph-detail' }, detail)
      )
    }


    // ═══════════════════════════════════════════════════════════════════
    // §8 ReaderPanel 组装
    // 符号表：
    //   ReaderPanel — 侧栏面板：状态、生命周期（api.retain/release）、轮询编排、
    //       文稿加载、查词浮窗、转写任务、生词本动作、背记动作、图谱加载与选中、以及 §7 视图的组合
    // 关键约定：
    //   - 列表轮询 4s，数据签名不变不 setState；后台标签页与 in-flight 由 usePolling 守
    //   - 任务轮询 1.5s，只读一次终态；迟到响应被 jobTerminalRef 丢弃
    //   - 切文稿只触发一次 workspaceFiles 读取（签名 useMemo + useTranscript）
    //   - 首屏回到「上次打开的那一篇」（localStorage），删了才回退最新一篇
    //   - 背记只在 recall tab 拉一次 recall.overview，切走/卸载 abort；grade/reset 返回的新总览直接替换状态
    //   - 图谱只在 graph tab 拉一次 graph.overview（只读派生数据），刷新用 graphNonce；选中/范围在数据刷新后自动清理失效节点
    //   - 所有异步回调先看 isAbortError，卸载/取消后不再 setState
    // ═══════════════════════════════════════════════════════════════════
    function ReaderPanel({ sessionId, t, api }) {
      const rootRef = useRef(null)
      const popupRef = useRef(null)
      const importRef = useRef(null)
      const toastTimer = useRef(undefined)
      const requestRef = useRef(0)
      const lookupControllerRef = useRef(null)
      const jobTerminalRef = useRef(false)
      const transcriptListSignatureRef = useRef('<init>')
      const vocabTextSignatureRef = useRef('<init>')

      const [mode, setMode] = useState('reader')
      const [transcripts, setTranscripts] = useState([])
      const [selected, setSelected] = useState(null)
      const [reloadKey, setReloadKey] = useState(0)
      const [vocab, setVocab] = useState({ version: 1, words: EMPTY_WORDS })
      const [apiError, setApiError] = useState('')
      const [listsLoaded, setListsLoaded] = useState(false)
      const [filter, setFilter] = useState('all')
      const [sortMode, setSortMode] = useState('time-desc')
      const [transcriptFilter, setTranscriptFilter] = useState('')
      const [cardDetail, setCardDetail] = useState('full')
      const [readerFont, setReaderFont] = useState(() => readFontSize('reader', 13))
      const [vocabFont, setVocabFont] = useState(() => readFontSize('vocab', 13))
      const [recallFont, setRecallFont] = useState(() => readFontSize('recall', 13))
      const [pdfZoom, setPdfZoom] = useState(() => readPdfZoom())
      const [recall, setRecall] = useState(null)
      const [recallLoading, setRecallLoading] = useState(false)
      const [recallError, setRecallError] = useState('')
      const [recallBusy, setRecallBusy] = useState('')
      const [recallMode, setRecallMode] = useState(() => readRecallMode())
      const [recallNonce, setRecallNonce] = useState(0)
      const recallRequestRef = useRef(0)
      const [graph, setGraph] = useState(null)
      const [graphLoading, setGraphLoading] = useState(false)
      const [graphError, setGraphError] = useState('')
      const [graphFilter, setGraphFilter] = useState(() => readGraphFilter())
      const [graphSearch, setGraphSearch] = useState('')
      const [graphSelected, setGraphSelected] = useState(null)
      const [graphScope, setGraphScope] = useState(null)
      const [graphNonce, setGraphNonce] = useState(0)
      const graphRequestRef = useRef(0)
      const [query, setQuery] = useState('')
      const [toast, setToast] = useState('')
      const [busy, setBusy] = useState('')
      const [analyzeBusy, setAnalyzeBusy] = useState(false)
      const [deleteConfirm, setDeleteConfirm] = useState(false)
      const [popup, setPopup] = useState(null)
      const [transcribeOpen, setTranscribeOpen] = useState(false)
      const [recordings, setRecordings] = useState([])
      const [recordingChoice, setRecordingChoice] = useState('')
      const [speakerCount, setSpeakerCount] = useState('')
      const [browsePath, setBrowsePath] = useState('')
      const [browseFiles, setBrowseFiles] = useState([])
      const [browseError, setBrowseError] = useState('')
      const [browseBusy, setBrowseBusy] = useState(false)
      const [modelList, setModelList] = useState([])
      const [modelChoice, setModelChoice] = useState('')
      const [modelDefault, setModelDefault] = useState('')
      const [job, setJob] = useState(null)
      const [lastJobRequest, setLastJobRequest] = useState(null)

      // api 网关按会话共享；面板挂载 +1，卸载 -1（归零后 dispose 并 abort 在途请求）
      useEffect(() => {
        api.retain()
        return () => {
          if (lookupControllerRef.current) lookupControllerRef.current.abort()
          api.release()
        }
      }, [api])

      useEffect(() => () => {
        if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
      }, [])

      const showToast = useCallback((text) => {
        setToast(text)
        if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(''), 2600)
      }, [])

      /** 聚合刷新：数据签名没变就不 setState，避免整面板重渲染。 */
      const refreshLists = useCallback(async (signal) => {
        let ok = true
        try {
          const list = await api.transcripts(signal)
          if (Array.isArray(list)) {
            const signature = listSignature(list)
            if (signature !== transcriptListSignatureRef.current) {
              transcriptListSignatureRef.current = signature
              setTranscripts(list)
            }
          }
          setApiError('')
        } catch (error) {
          if (isAbortError(error)) return false
          ok = false
          setApiError(errorMessage(error))
        } finally {
          setListsLoaded(true)
        }
        try {
          const text = await api.vocabText(signal)
          if (text === undefined) {
            if (vocabTextSignatureRef.current !== '<empty>') {
              vocabTextSignatureRef.current = '<empty>'
              setVocab({ version: 1, words: EMPTY_WORDS })
            }
          } else if (text !== vocabTextSignatureRef.current) {
            vocabTextSignatureRef.current = text
            const document = parseLoose(text)
            if (document && Array.isArray(document.words)) setVocab({ version: 1, words: document.words })
          }
        } catch (error) {
          if (isAbortError(error)) return false
          ok = false
        }
        return ok
      }, [api])

      const refresh = usePolling(refreshLists, { intervalMs: 4000, hiddenSkip: true })

      // 首屏选中文稿：优先「上次打开的那一篇」（浏览器本地记录），它已被删除或不在
      // 当前工作区时才回退到最新一篇（transcripts.list 按 createdAt 倒序）。列表未就绪
      // 前 selected 保持 null，避免先对旧文件名发一次必然失败的读取。
      useEffect(() => {
        if (!listsLoaded) return
        if (transcripts.length === 0) {
          if (selected !== null) setSelected(null)
          return
        }
        if (selected !== null && transcripts.some((item) => item.file === selected)) return
        const remembered = readLastTranscript()
        const next = remembered !== null && transcripts.some((item) => item.file === remembered)
          ? remembered
          : transcripts[0].file
        setSelected(next)
      }, [transcripts, selected, listsLoaded])

      useEffect(() => {
        setDeleteConfirm(false)
      }, [selected])

      // 每次选中都记下来：面板重开、刷新页面或换会话都回到这一篇，而不是最新一篇。
      useEffect(() => {
        if (selected !== null) saveLastTranscript(selected)
      }, [selected])

      // 背记：进入 recall tab 拉一次今日总览；切走或卸载 abort，迟到的错误不落 state。
      // 序号守卫：旧的 overview 响应不能覆盖刚完成的 grade/reset；评分期间不发起新请求。
      useEffect(() => {
        if (mode !== 'recall' || recallBusy !== '') return undefined
        const controller = new AbortController()
        const requestId = ++recallRequestRef.current
        let alive = true
        setRecallLoading(true)
        setRecallError('')
        api.recallOverview(controller.signal)
          .then((value) => {
            if (!alive || requestId !== recallRequestRef.current) return
            setRecall(value && typeof value === 'object' ? value : null)
          })
          .catch((error) => {
            if (!alive || requestId !== recallRequestRef.current || isAbortError(error)) return
            setRecallError(errorMessage(error))
          })
          .finally(() => {
            if (alive && requestId === recallRequestRef.current) setRecallLoading(false)
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [api, mode, recallNonce])

      // 图谱：进入 graph tab 拉一次关系图；切走/卸载 abort，迟到的响应不落 state。
      // 序号守卫 + graphNonce 手动刷新；图是只读派生数据，切回来就重新算一次。
      useEffect(() => {
        if (mode !== 'graph') return undefined
        const controller = new AbortController()
        const requestId = ++graphRequestRef.current
        let alive = true
        setGraphLoading(true)
        setGraphError('')
        api.graphOverview(controller.signal)
          .then((value) => {
            if (!alive || requestId !== graphRequestRef.current) return
            setGraph(value && typeof value === 'object' ? value : null)
          })
          .catch((error) => {
            if (!alive || requestId !== graphRequestRef.current || isAbortError(error)) return
            setGraphError(errorMessage(error))
          })
          .finally(() => {
            if (alive && requestId === graphRequestRef.current) setGraphLoading(false)
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [api, mode, graphNonce])

      // 刷新后节点可能已经消失（删了词/文稿）：清理失效的选中与「只看一篇」范围。
      useEffect(() => {
        if (graph === null || !Array.isArray(graph.nodes)) return
        if (graphSelected !== null && !graph.nodes.some((node) => node.id === graphSelected)) setGraphSelected(null)
        if (graphScope !== null && !graph.nodes.some((node) => node.kind === 'transcript' && node.file === graphScope)) setGraphScope(null)
      }, [graph, graphSelected, graphScope])

      // 首次拿到总览后才采用宿主配置里的默认练习方式（用户手动切换过就不再覆盖）。
      useEffect(() => {
        if (recall === null || recallMode !== null) return
        const configured = recall.config && typeof recall.config.mode === 'string' ? recall.config.mode : ''
        if (!RECALL_MODES.includes(configured)) return
        setRecallMode(configured)
        saveRecallMode(configured)
      }, [recall, recallMode])

      // 文稿元数据签名：只有内容真的变化（合并/转写完成）才重载；切文稿不额外 bump reloadKey。
      const transcriptMetaSignature = useMemo(() => {
        if (selected === null) return ''
        const meta = transcripts.find((item) => item.file === selected)
        if (!meta) return ''
        return String(meta.createdAt ?? '') + '|' + String(meta.segments ?? '') + '|' + String(meta.durationMs ?? '')
      }, [transcripts, selected])

      const { transcript, error: transcriptError, loading: transcriptLoading } = useTranscript(api, selected, transcriptMetaSignature, reloadKey, t)

      const segments = Array.isArray(transcript?.segments) ? transcript.segments : EMPTY_SEGMENTS
      const pages = Array.isArray(transcript?.pages) ? transcript.pages : EMPTY_PAGES
      const displaySegments = useMemo(() => mergeMathSegments(segments), [segments])
      const words = Array.isArray(vocab?.words) ? vocab.words : EMPTY_WORDS
      const knownPattern = useMemo(() => knownWordPattern(words), [words])
      const pending = useMemo(() => words.filter((entry) => entry.status === 'pending').length, [words])
      const currentTitle = useMemo(() => transcripts.find((item) => item.file === selected)?.title ?? '', [transcripts, selected])
      const meta = useMemo(() => {
        if (!transcript) return ''
        if (transcript.pdf === true) return t('reader.metaPdf', { pages: String(Array.isArray(transcript.pages) ? transcript.pages.length : 0) })
        if (transcript.imported) return t('reader.metaImported', { segments: String(segments.length) })
        return t('reader.meta', {
          segments: String(segments.length),
          speakers: String(Array.isArray(transcript.speakers) ? transcript.speakers.length : 0),
          duration: fmtClock(transcript.durationMs ?? 0),
        })
      }, [transcript, segments.length, t])

      const transcriptOptions = useMemo(() => {
        const counts = new Map()
        for (const entry of words) {
          const title = String(entry.source?.title ?? '').trim()
          if (title === '') continue
          counts.set(title, (counts.get(title) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([title, count]) => ({ title, count }))
      }, [words])

      useEffect(() => {
        if (transcriptFilter !== '' && !transcriptOptions.some((option) => option.title === transcriptFilter)) {
          setTranscriptFilter('')
        }
      }, [transcriptOptions, transcriptFilter])

      const filtered = useMemo(() => {
        const search = query.trim().toLowerCase()
        const rows = words.filter((entry) => {
          if (filter !== 'all' && entry.kind !== filter) return false
          if (transcriptFilter !== '' && String(entry.source?.title ?? '') !== transcriptFilter) return false
          if (search === '') return true
          const haystack = [entry.word, entry.text, entry.sentence, entry.sentenceZh, entry.translation, ...(Array.isArray(entry.meanings) ? entry.meanings.map((meaning) => meaning.zh) : [])]
            .filter((value) => typeof value === 'string')
            .join(' ')
            .toLowerCase()
          return haystack.includes(search)
        })
        const labelOf = (entry) => String(entry.kind === 'sentence' ? entry.text ?? '' : entry.word ?? entry.text ?? '')
        const timeOf = (entry) => {
          const parsed = Date.parse(String(entry.createdAt ?? ''))
          return Number.isFinite(parsed) ? parsed : 0
        }
        const sorted = [...rows]
        if (sortMode === 'az') sorted.sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'en', { sensitivity: 'base' }) || timeOf(b) - timeOf(a))
        else if (sortMode === 'time-asc') sorted.sort((a, b) => timeOf(a) - timeOf(b))
        else sorted.sort((a, b) => timeOf(b) - timeOf(a))
        return sorted
      }, [words, filter, query, sortMode, transcriptFilter])

      const changePdfZoom = useCallback((delta) => {
        setPdfZoom((value) => {
          const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((value + delta) * 100) / 100))
          savePdfZoom(next)
          return next
        })
      }, [])
      const changeFont = useCallback((delta) => {
        if (mode === 'reader') {
          setReaderFont((value) => {
            const next = Math.min(MAX_FONT, Math.max(MIN_FONT, value + delta))
            saveFontSize('reader', next)
            return next
          })
          return
        }
        if (mode === 'vocab') {
          setVocabFont((value) => {
            const next = Math.min(MAX_FONT, Math.max(MIN_FONT, value + delta))
            saveFontSize('vocab', next)
            return next
          })
          return
        }
        setRecallFont((value) => {
          const next = Math.min(MAX_FONT, Math.max(MIN_FONT, value + delta))
          saveFontSize('recall', next)
          return next
        })
      }, [mode])

      const closePopup = useCallback(() => setPopup(null), [])

      const runLookup = useCallback(async (payload) => {
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        if (lookupControllerRef.current) lookupControllerRef.current.abort()
        const controller = new AbortController()
        lookupControllerRef.current = controller
        const stored = findStoredEntry(words, payload.kind, payload.text)
        if (stored !== undefined) {
          setPopup({
            requestId,
            ...payload,
            status: 'ready',
            error: '',
            added: true,
            duplicate: true,
            result: payload.kind === 'sentence'
              ? { kind: 'sentence', translation: String(stored.translation ?? '') }
              : {
                  kind: 'word',
                  ipa: String(stored.ipa ?? ''),
                  meanings: Array.isArray(stored.meanings) ? stored.meanings : [],
                  sentenceZh: String(stored.sentenceZh ?? ''),
                },
          })
          return
        }
        setPopup({ requestId, ...payload, status: 'loading', result: null, error: '', added: false, duplicate: false })
        try {
          const result = await api.lookup({ kind: payload.kind, text: payload.text, sentence: payload.sentence }, controller.signal)
          if (requestId !== requestRef.current || controller.signal.aborted) return
          setPopup((previous) => {
            if (!previous || previous.requestId !== requestId) return previous
            if (result && result.ok === true) return { ...previous, status: 'ready', result }
            return { ...previous, status: 'error', error: result?.message ?? t('error.lookup') }
          })
        } catch (error) {
          if (requestId !== requestRef.current || isAbortError(error)) return
          setPopup((previous) => (previous && previous.requestId === requestId ? { ...previous, status: 'error', error: errorMessage(error) } : previous))
        }
      }, [api, t, words])

      useSelectionLookup({
        rootRef,
        onSelect: runLookup,
        popupOpen: popup !== null,
        closePopup,
        file: selected,
        title: currentTitle,
        segments: displaySegments,
        pages,
      })

      useEffect(() => {
        if (!popup) return undefined
        const onDown = (event) => {
          if (popupRef.current && !popupRef.current.contains(event.target)) setPopup(null)
        }
        document.addEventListener('mousedown', onDown, true)
        return () => document.removeEventListener('mousedown', onDown, true)
      }, [popup])

      useEffect(() => {
        if (!transcribeOpen) return undefined
        const controller = new AbortController()
        let alive = true
        api.recordings(controller.signal)
          .then((list) => {
            if (!alive) return
            const items = Array.isArray(list) ? list : []
            setRecordings(items)
            setRecordingChoice((current) => (items.some((item) => item.path === current) ? current : (items[0]?.path ?? '')))
          })
          .catch((error) => {
            if (!alive || isAbortError(error)) return
            setRecordings([])
          })
        api.models(controller.signal)
          .then((result) => {
            if (!alive) return
            const models = Array.isArray(result?.models) ? result.models : []
            setModelList(models)
            setModelDefault(result?.defaultModel ?? '')
            setModelChoice((current) => (models.includes(current) ? current : (result?.defaultModel ?? models[0] ?? '')))
          })
          .catch(() => {
            // the model selector falls back to the host default when the list is unavailable
          })
        return () => {
          alive = false
          controller.abort()
        }
      }, [transcribeOpen, api])

      // 任务轮询：只有 jobId 存在时运行；观察到终态后停止，迟到的 running 响应被丢弃。
      const jobId = job?.jobId ?? null
      useEffect(() => {
        jobTerminalRef.current = false
      }, [jobId])
      const pollJob = useCallback(async (signal) => {
        if (jobId === null) return { done: true }
        const next = await api.job(jobId, signal)
        if (!next || jobTerminalRef.current) return { done: true }
        const state = next.state
        if (state === 'done' || state === 'failed' || state === 'missing') {
          jobTerminalRef.current = true
          setJob((previous) => (previous && previous.jobId === jobId ? { ...previous, ...next } : previous))
          if (state === 'done') {
            await refreshLists(signal)
            if (next.transcript) setSelected(String(next.transcript).split('/').pop())
            setReloadKey((value) => value + 1)
          } else {
            showToast(next.error ? t('transcribe.failedWithDetail', { message: next.error }) : t('transcribe.failed'))
            await refreshLists(signal)
          }
          return { done: true }
        }
        setJob((previous) => (previous && previous.jobId === jobId ? { ...previous, ...next } : previous))
        return { done: false }
      }, [api, jobId, refreshLists, showToast, t])
      usePolling(pollJob, { key: jobId ?? '', enabled: jobId !== null, intervalMs: 1500, hiddenSkip: true })

      const startTranscribe = useCallback(async (request) => {
        setBusy('transcribe')
        try {
          const result = await api.transcribe(request)
          setJob({ jobId: result.jobId, state: 'queued', transcript: result.transcript })
          setLastJobRequest(request)
          setTranscribeOpen(false)
          showToast(t('toast.jobStarted'))
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, showToast, t])

      const scanPath = useCallback(async (path) => {
        const target = String(path ?? '').trim()
        if (target === '') {
          setBrowseError(t('transcribe.pathRequired'))
          return
        }
        setBrowseBusy(true)
        setBrowseError('')
        try {
          const result = await api.browse(target)
          const files = Array.isArray(result?.files) ? result.files : []
          setBrowseFiles(files)
          if (files.length === 0) setBrowseError(t('transcribe.noAudio'))
          else setRecordingChoice(files[0].path)
        } catch (error) {
          if (isAbortError(error)) return
          setBrowseFiles([])
          setBrowseError(errorMessage(error))
        } finally {
          setBrowseBusy(false)
        }
      }, [api, t])

      const chooseFolder = useCallback(async () => {
        setBrowseBusy(true)
        setBrowseError('')
        try {
          const dir = await api.pickDirectory()
          if (dir === null || dir === undefined || dir === '') return
          setBrowsePath(dir)
          await scanPath(dir)
        } catch (error) {
          if (!isAbortError(error)) setBrowseError(errorMessage(error))
        } finally {
          setBrowseBusy(false)
        }
      }, [api, scanPath])

      const mergeCurrent = useCallback(async () => {
        if (!selected) return
        try {
          const result = await api.transcriptsMerge(selected)
          if (result?.changed) showToast(t('toast.merged', { before: String(result.before), after: String(result.after) }))
          else showToast(t('toast.mergeNoop'))
          await refreshLists()
          setReloadKey((value) => value + 1)
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        }
      }, [api, refreshLists, selected, showToast, t])

      const deleteCurrent = useCallback(async () => {
        if (!selected) return
        if (!deleteConfirm) {
          setDeleteConfirm(true)
          return
        }
        setBusy('delete')
        try {
          await api.transcriptsDelete(selected)
          showToast(t('toast.transcriptDeleted'))
          setDeleteConfirm(false)
          setSelected(null)
          await refreshLists()
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, deleteConfirm, refreshLists, selected, showToast, t])

      const addPopup = useCallback(async (current) => {
        if (busy !== '') return
        setBusy('add')
        try {
          const result = current.result ?? {}
          const entry = current.kind === 'word'
            ? {
                kind: 'word',
                word: current.text,
                ipa: result.ipa ?? '',
                meanings: Array.isArray(result.meanings) ? result.meanings : [],
                sentence: current.sentence ?? '',
                sentenceZh: result.sentenceZh ?? '',
                family: Array.isArray(result.family) ? result.family : [],
                etymology: result.etymology ?? null,
                source: current.source ?? {},
              }
            : {
                kind: 'sentence',
                text: current.text,
                translation: result.translation ?? '',
                source: current.source ?? {},
              }
          const outcome = await api.add(entry)
          setPopup((previous) => (previous ? { ...previous, added: true, duplicate: Boolean(outcome?.duplicate) } : previous))
          showToast(outcome?.duplicate ? t('toast.duplicate') : t('toast.added'))
          await refreshLists()
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, busy, refreshLists, showToast, t])

      const deleteEntry = useCallback(async (entry) => {
        try {
          await api.remove([entry.id])
          showToast(t('toast.deleted'))
          await refreshLists()
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        }
      }, [api, refreshLists, showToast, t])

      const enrichEntry = useCallback(async (entry) => {
        if (!entry?.id || busy === 'enrich') return
        setBusy('enrich')
        try {
          await api.enrich(entry.id)
          showToast(t('toast.enriched'))
          await refreshLists()
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, busy, refreshLists, showToast, t])

      const analyzeEntry = useCallback(async (entry) => {
        if (!entry?.id || analyzeBusy) return
        setAnalyzeBusy(true)
        try {
          const result = await api.analyze(entry.id)
          if (Number(result?.failed) > 0) {
            showToast(t('toast.analyzeFailed'))
          } else {
            showToast(result && result.added > 0 ? t('toast.analyzed', { added: String(result.added) }) : t('toast.analyzeSkipped'))
          }
          await refreshLists()
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setAnalyzeBusy(false)
        }
      }, [api, analyzeBusy, refreshLists, showToast, t])

      const changeRecallMode = useCallback((value) => {
        if (!RECALL_MODES.includes(value)) return
        setRecallMode(value)
        saveRecallMode(value)
      }, [])

      const refreshRecall = useCallback(() => {
        setRecallNonce((value) => value + 1)
      }, [])

      /** 提交自评：Host 返回作答后的新总览，直接替换，吃下 pending 卡片的最小刷新。 */
      const gradeRecall = useCallback(async (entryId, grade, itemMode) => {
        if (recallBusy !== '') return
        const requestId = ++recallRequestRef.current
        setRecallLoading(false)
        setRecallBusy('grade')
        try {
          const value = await api.recallGrade({ entryId, grade, mode: itemMode })
          if (requestId === recallRequestRef.current && value && typeof value === 'object') {
            setRecall(value)
            setRecallError('')
          }
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setRecallBusy('')
        }
      }, [api, recallBusy, showToast])

      const resetRecall = useCallback(async (payload) => {
        if (recallBusy !== '') return
        const requestId = ++recallRequestRef.current
        setRecallLoading(false)
        setRecallBusy('reset')
        try {
          const value = await api.recallReset(payload)
          if (requestId === recallRequestRef.current && value && typeof value === 'object') {
            setRecall(value)
            setRecallError('')
          }
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setRecallBusy('')
        }
      }, [api, recallBusy, showToast])

      const resetRecallWord = useCallback((entryId) => {
        void resetRecall({ entryId })
      }, [resetRecall])

      const resetRecallAll = useCallback(() => {
        void resetRecall({ all: true })
      }, [resetRecall])

      const refreshGraph = useCallback(() => {
        setGraphNonce((value) => value + 1)
      }, [])

      const changeGraphFilter = useCallback((value) => {
        if (!GRAPH_FILTERS.includes(value)) return
        setGraphFilter(value)
        saveGraphFilter(value)
      }, [])

      /** 从图谱跳到文稿视图：选中该文稿并切到 reader。 */
      const openTranscriptFromGraph = useCallback((file) => {
        if (typeof file !== 'string' || file === '') return
        setSelected(file)
        setMode('reader')
      }, [])

      const focusGraphFile = useCallback((file) => {
        if (typeof file !== 'string' || file === '') return
        setGraphScope(file)
        setGraphSelected('t:' + file)
      }, [])

      const clearGraphScope = useCallback(() => {
        setGraphScope(null)
      }, [])

      const onImportFile = useCallback(async (event) => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (!file) return
        const extension = (file.name.split('.').pop() || '').toLowerCase()
        const isPdf = extension === 'pdf'
        if (isPdf ? file.size > 20 * 1024 * 1024 : file.size > 3 * 1024 * 1024) {
          showToast(isPdf ? t('error.pdfTooLarge') : t('error.importTooLarge'))
          return
        }
        setBusy('import')
        try {
          const payload = isPdf
            ? { name: file.name, contentBase64: arrayBufferToBase64(await file.arrayBuffer()) }
            : { name: file.name, content: await file.text() }
          const result = await api.transcriptsImport(payload)
          showToast(t('toast.imported'))
          await refreshLists()
          if (result?.file) setSelected(result.file)
        } catch (error) {
          if (!isAbortError(error)) showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, refreshLists, showToast, t])

      const copyPrompt = useCallback(async () => {
        const text = t('vocab.prompt')
        const copied = await copyText(text)
        if (copied) showToast(t('vocab.promptCopied'))
        else showToast(text)
      }, [showToast, t])

      const activeFont = mode === 'reader' ? readerFont : mode === 'vocab' ? vocabFont : recallFont
      const envVisible = (listsLoaded && transcripts.length === 0) || transcribeOpen
      const panelVisible = transcribeOpen || job !== null || envVisible

      const transcribePanel = transcribeOpen
        ? h(TranscribePanel, {
            t,
            browsePath,
            onBrowsePathChange: setBrowsePath,
            onScan: scanPath,
            onPickFolder: chooseFolder,
            browseBusy,
            browseError,
            browseFiles,
            recordings,
            recordingChoice,
            onRecordingChoiceChange: setRecordingChoice,
            speakerCount,
            onSpeakerCountChange: setSpeakerCount,
            modelList,
            modelChoice,
            onModelChoiceChange: setModelChoice,
            modelDefault,
            busy,
            onStart: startTranscribe,
            onClose: () => setTranscribeOpen(false),
          })
        : null

      const jobView = job !== null
        ? h(JobBar, { t, job, lastJobRequest, busy, onRetry: startTranscribe })
        : null

      const envCard = envVisible ? h(EnvCard, { api, t, showToast }) : null

      const readerEmpty = h('div', { className: 'egl-empty' },
        h('div', { className: 'egl-empty-title' }, t('reader.emptyTitle')),
        h('div', null, t('reader.emptyHint')),
        h('div', { style: { marginTop: 10 } },
          h('button', { type: 'button', className: 'egl-btn', onClick: () => setTranscribeOpen(true) }, t('reader.transcribe')),
          h('button', { type: 'button', className: 'egl-btn', style: { marginLeft: 8 }, disabled: busy === 'import', onClick: () => importRef.current?.click() }, t('reader.import'))
        )
      )

      let readerBody
      if (!listsLoaded) {
        readerBody = h('div', { className: 'egl-empty' }, t('reader.loading'))
      } else if (transcripts.length === 0) {
        readerBody = readerEmpty
      } else if (transcriptLoading && transcript === null) {
        readerBody = h('div', { className: 'egl-empty' }, t('reader.loading'))
      } else if (transcriptError !== '') {
        readerBody = h('div', { className: 'egl-empty' },
          h('div', { className: 'egl-empty-title' }, t('reader.failed')),
          h('div', null, transcriptError)
        )
      } else if (transcript === null) {
        readerBody = readerEmpty
      } else if (transcript.pdf === true) {
        readerBody = h(PdfView, { api, pages, knownPattern, zoom: pdfZoom, t })
      } else {
        readerBody = h(TranscriptBody, { t, transcript, segments: displaySegments, pattern: knownPattern })
      }

      const headVisible = transcript !== null && transcriptError === ''
      const headRow = headVisible
        ? h('div', { className: 'egl-transcript-head' },
            h('strong', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, currentTitle),
            transcript.imported !== true
              ? h('button', {
                  type: 'button',
                  className: 'egl-btn egl-ghost',
                  style: { flex: 'none' },
                  onClick: () => { void mergeCurrent() },
                }, t('reader.merge'))
              : null,
            transcript.pdf === true && typeof transcript.pdfPath === 'string'
              ? h('button', {
                  type: 'button',
                  className: 'egl-btn egl-ghost',
                  style: { flex: 'none' },
                  onClick: () => {
                    try {
                      api.openFile(transcript.pdfPath)
                    } catch (error) {
                      showToast(errorMessage(error))
                    }
                  },
                }, t('reader.openPreview'))
              : null,
            transcript.pdf === true
              ? h(ZoomControl, { t, value: pdfZoom, onChange: changePdfZoom })
              : null,
            deleteConfirm
              ? h(React.Fragment, null,
                  h('span', { className: 'egl-muted', style: { flex: 'none', fontSize: 11 } }, t('reader.deleteConfirm')),
                  h('button', { type: 'button', className: 'egl-btn egl-danger', style: { flex: 'none' }, disabled: busy === 'delete', onClick: () => { void deleteCurrent() } }, t('reader.deleteYes')),
                  h('button', { type: 'button', className: 'egl-btn egl-ghost', style: { flex: 'none' }, onClick: () => setDeleteConfirm(false) }, t('reader.deleteNo'))
                )
              : h('button', { type: 'button', className: 'egl-btn egl-ghost', style: { flex: 'none' }, onClick: () => { void deleteCurrent() } }, t('reader.delete')),
            h('span', { className: 'egl-muted', style: { marginLeft: 'auto', flex: 'none', fontSize: 11 } }, meta)
          )
        : null

      const readerView = h('div', { className: 'egl-reader' },
        panelVisible
          ? h('div', { className: 'egl-reader-top' }, transcribePanel, jobView, envCard)
          : null,
        headRow,
        h('div', {
          className: 'egl-scroll',
          style: { fontSize: readerFont + 'px' },
          onScroll: () => { if (popup) setPopup(null) },
        }, readerBody)
      )

      const vocabView = h(VocabView, {
        t,
        words,
        filtered,
        pending,
        filter,
        onFilter: setFilter,
        query,
        onQuery: setQuery,
        sortMode,
        onSort: setSortMode,
        transcriptFilter,
        onTranscriptFilter: setTranscriptFilter,
        transcriptOptions,
        cardDetail,
        onCardDetail: setCardDetail,
        onCopyPrompt: copyPrompt,
        onDelete: deleteEntry,
        onEnrich: enrichEntry,
        enriching: busy === 'enrich',
        onAnalyze: analyzeEntry,
        analyzing: analyzeBusy,
        font: vocabFont,
      })

      const recallModeForView = recallMode ?? (recall && recall.config && typeof recall.config.mode === 'string' ? recall.config.mode : 'mix')
      const recallView = h(RecallView, {
        t,
        overview: recall,
        loading: recallLoading,
        error: recallError,
        mode: recallModeForView,
        onModeChange: changeRecallMode,
        onRefresh: refreshRecall,
        onGrade: gradeRecall,
        onResetWord: resetRecallWord,
        onResetAll: resetRecallAll,
        grading: recallBusy !== '',
        font: recallFont,
      })

      const graphView = h(GraphView, {
        t,
        graph,
        loading: graphLoading,
        error: graphError,
        filter: graphFilter,
        onFilter: changeGraphFilter,
        search: graphSearch,
        onSearch: setGraphSearch,
        selected: graphSelected,
        onSelect: setGraphSelected,
        onRefresh: refreshGraph,
        onOpenTranscript: openTranscriptFromGraph,
        scopeFile: graphScope,
        onScopeFile: focusGraphFile,
        onClearScope: clearGraphScope,
      })

      return h('div', { className: 'egl-root', ref: rootRef },
        h('style', null, CSS),
        h('input', {
          type: 'file',
          ref: importRef,
          accept: '.txt,.text,.md,.markdown,.html,.htm,.tex,.rst,.log,.pdf',
          style: { display: 'none' },
          onChange: onImportFile,
        }),
        h('div', { className: 'egl-bar' },
          h('div', { className: 'egl-tabs', role: 'tablist' },
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'reader', className: 'egl-tab' + (mode === 'reader' ? ' is-on' : ''), onClick: () => setMode('reader') }, t('mode.reader')),
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'vocab', className: 'egl-tab' + (mode === 'vocab' ? ' is-on' : ''), onClick: () => setMode('vocab') }, t('mode.vocab') + (pending > 0 ? ' ' + String(pending) : '')),
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'recall', className: 'egl-tab' + (mode === 'recall' ? ' is-on' : ''), onClick: () => setMode('recall') }, t('mode.recall')),
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'graph', className: 'egl-tab' + (mode === 'graph' ? ' is-on' : ''), onClick: () => setMode('graph') }, t('mode.graph'))
          ),
          mode === 'graph' ? null : h(FontControl, { t, value: activeFont, onChange: changeFont }),
          mode === 'reader' && transcripts.length > 0
            ? h('select', {
                className: 'egl-select',
                'aria-label': t('reader.pick'),
                value: selected ?? '',
                onChange: (event) => setSelected(event.target.value || null),
              }, transcripts.map((item) => h('option', { key: item.file, value: item.file }, item.title)))
            : null,
          h('div', { className: 'egl-bar-right' },
            mode === 'reader'
              ? h(React.Fragment, null,
                  h('button', { type: 'button', className: 'egl-btn', onClick: () => setTranscribeOpen((value) => !value) }, t('reader.transcribe')),
                  h('button', { type: 'button', className: 'egl-btn', disabled: busy === 'import', onClick: () => importRef.current?.click() }, t('reader.import'))
                )
              : mode === 'vocab'
                ? h('button', { type: 'button', className: 'egl-btn', onClick: refresh }, t('common.refresh'))
                : mode === 'recall'
                  ? h('button', { type: 'button', className: 'egl-btn', disabled: recallLoading || recallBusy !== '', onClick: refreshRecall }, t('recall.refresh'))
                  : h('button', { type: 'button', className: 'egl-btn', disabled: graphLoading, onClick: refreshGraph }, t('graph.refresh'))
          )
        ),
        apiError !== ''
          ? h('div', { className: 'egl-job is-failed', style: { margin: '8px 10px 0' } }, t('error.withDetail', { message: apiError }))
          : null,
        mode === 'reader' ? readerView : mode === 'vocab' ? vocabView : mode === 'recall' ? recallView : graphView,
        popup
          ? h('div', { ref: popupRef },
              h(Popup, { t, popup, busy: busy === 'add', onAdd: addPopup, onClose: () => setPopup(null) }))
          : null,
        toast !== ''
          ? h('div', { className: 'egl-toast', role: 'status' }, toast)
          : null
      )
    }

    // ═══════════════════════════════════════════════════════════════════
    // §9 注册（locale / sidebarRightTabs / slots / 会话头按钮）
    // 符号表：inject — 依赖声明；apply(ctx) — 与既有注册代码语义完全一致的组装入口
    // ═══════════════════════════════════════════════════════════════════
    const inject = ['slots', 'locale', 'remote', 'remote.workspaceFiles', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'english-practice: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: PKG,
        kind: KIND,
        title: () => t('tab.title'),
        guide: [{
          id: 'open',
          order: 60,
          title: () => t('tab.title'),
          description: () => t('tab.description'),
        }],
      }), 'english-practice: sidebar tab type')
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: PKG,
        locale: NS,
        inject: (sessionId) => ({ api: apiFor(ctx, sessionId, t) }),
      }, ReaderPanel))
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: ID,
        order: -3,
        locale: NS,
        label: () => t('button.open'),
        inject: () => ({ open: () => ctx.sidebarRight.openTab(KIND) }),
      }, HeaderButton))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
