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
    //   FONT_STORAGE_PREFIX / PDF_ZOOM_STORAGE_KEY — localStorage 键
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
      'tab.description': '播客转写文稿与生词本',
      'button.open': '打开英语精读',
      'mode.reader': '文稿',
      'mode.vocab': '生词本',
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
      'tab.description': 'Podcast transcripts and wordbook',
      'button.open': 'Open English practice',
      'mode.reader': 'Transcript',
      'mode.vocab': 'Wordbook',
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
    ].join('')

    const HEADER_CSS = [
      '.egl-header-btn{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;margin:0}',
      '.egl-header-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.egl-header-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
    ].join('')


    // ═══════════════════════════════════════════════════════════════════
    // §3 纯函数（时间、格式化、高亮、数学公式、选区清洗、环境判定）
    // 符号表：
    //   fmtClock / errorMessage / parseLoose / classify / sentenceAround / speakerName
    //   readFontSize / saveFontSize / readPdfZoom / savePdfZoom — localStorage 偏好
    //   fileResourceAddress — 工作区文件 → dsh-resource:// 地址
    //   hashString / listSignature — 轮询数据签名（只在变化时 setState）
    //   copyText — 剪贴板写入（唯一浏览器副作用小工具）
    //   isEditableNode / isEditableFocus / isEditableEvent — 输入框焦点守卫
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
    //       （import 240s = Host 侧 pdftoppm 180s + pdftotext 120s 的最坏组合；两边同步改，避免漂移）
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
      'env.check': 15000,
    }
    const API_DEDUPE_ACTIONS = new Set([
      'transcripts.list',
      'recordings.list',
      'models.list',
      'browse.list',
      'job',
      'lookup',
      'env.check',
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
      'job/not-found': 'error.jobNotFound',
      'job/failed': 'error.jobFailed',
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
        transcribe: (payload, signal) => call('transcribe', payload, { signal, dedupe: false }),
        job: (id, signal) => call('job', { id }, { signal }),
        envCheck: (signal) => call('env.check', {}, { signal }),

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
      const meanings = Array.isArray(result.meanings) ? result.meanings : []
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
      const { t, entry, detail, onDelete, onEnrich, enriching } = props
      const isWord = entry.kind !== 'sentence'
      const pending = entry.status === 'pending'
      const full = detail !== 'simple'
      const family = isWord && Array.isArray(entry.family) ? entry.family : []
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
          ? (Array.isArray(entry.meanings) && entry.meanings.length > 0
              ? entry.meanings.map((meaning, index) => h('div', { key: index, className: 'egl-meaning' },
                  h('span', { className: 'egl-pos' }, meaning.pos ?? ''),
                  h('span', null, meaning.zh ?? '')
                ))
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
        h('div', { className: 'egl-card-actions' },
          canEnrich
            ? h('button', { type: 'button', className: 'egl-link', disabled: enriching, onClick: () => onEnrich(entry) }, t('vocab.enrich'))
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
    // §6 hooks（usePolling / useSelectionLookup / useTranscript）
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


    // ═══════════════════════════════════════════════════════════════════
    // §7 视图（转写面板、任务条、文稿、PDF、生词本、环境自检卡）
    // 符号表：
    //   TranscribePanel — 录音选择 + 路径扫描 + 模型/说话人数
    //   JobBar — 转写任务状态条（失败可重试）
    //   TranscriptBody — 文稿正文：按视口分片渲染（IntersectionObserver 哨兵增量加载）
    //   PdfView — PDF 页容器（页面本身懒加载）
    //   VocabView — 生词本（筛选 / 搜索 / 排序 / 详情）
    //   EnvCommand / EnvCard — 「环境自检」卡：bl / Poppler / 工作区状态 + 可复制命令，可折叠
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
        onCopyPrompt, onDelete, onEnrich, enriching, font,
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


    // ═══════════════════════════════════════════════════════════════════
    // §8 ReaderPanel 组装
    // 符号表：
    //   ReaderPanel — 侧栏面板：状态、生命周期（api.retain/release）、轮询编排、
    //       文稿加载、查词浮窗、转写任务、生词本动作、以及 §7 视图的组合
    // 关键约定：
    //   - 列表轮询 4s，数据签名不变不 setState；后台标签页与 in-flight 由 usePolling 守
    //   - 任务轮询 1.5s，只读一次终态；迟到响应被 jobTerminalRef 丢弃
    //   - 切文稿只触发一次 workspaceFiles 读取（签名 useMemo + useTranscript）
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
      const [pdfZoom, setPdfZoom] = useState(() => readPdfZoom())
      const [query, setQuery] = useState('')
      const [toast, setToast] = useState('')
      const [busy, setBusy] = useState('')
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

      useEffect(() => {
        if (transcripts.length === 0) {
          if (selected !== null) setSelected(null)
          return
        }
        if (selected === null || !transcripts.some((item) => item.file === selected)) {
          setSelected(transcripts[0].file)
        }
      }, [transcripts, selected])

      useEffect(() => {
        setDeleteConfirm(false)
      }, [selected])

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
        setVocabFont((value) => {
          const next = Math.min(MAX_FONT, Math.max(MIN_FONT, value + delta))
          saveFontSize('vocab', next)
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

      const activeFont = mode === 'reader' ? readerFont : vocabFont
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
        font: vocabFont,
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
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'vocab', className: 'egl-tab' + (mode === 'vocab' ? ' is-on' : ''), onClick: () => setMode('vocab') }, t('mode.vocab') + (pending > 0 ? ' ' + String(pending) : ''))
          ),
          h(FontControl, { t, value: activeFont, onChange: changeFont }),
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
              : h('button', { type: 'button', className: 'egl-btn', onClick: refresh }, t('common.refresh'))
          )
        ),
        apiError !== ''
          ? h('div', { className: 'egl-job is-failed', style: { margin: '8px 10px 0' } }, t('error.withDetail', { message: apiError }))
          : null,
        mode === 'reader' ? readerView : vocabView,
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
