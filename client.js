window.__ModuleLoader__.load({
  id: '@local/dsh-english-practice',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = React

    const PKG = '@local/dsh-english-practice'
    const NS = 'englishPractice'
    const KIND = 'english-reader'
    const ID = 'english-practice'
    const REL = {
      transcripts: 'transcripts',
      vocab: 'vocab/vocabulary.json',
    }

    const zh = {
      'tab.title': '英语精读',
      'tab.description': '播客转写文稿与生词本',
      'button.open': '打开英语精读',
      'mode.reader': '文稿',
      'mode.vocab': '生词本',
      'common.refresh': '刷新',
      'common.close': '关闭',
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
      'transcribe.retry': '重试',
      'transcribe.queued': '已排队',
      'transcribe.hint': '转写在后台运行，通常需要 1–3 分钟；完成后文稿会自动出现。',
      'transcribe.pathPlaceholder': '粘贴文件夹或音频文件路径',
      'transcribe.scan': '扫描',
      'transcribe.browse': '选择文件夹…',
      'transcribe.pathRequired': '请输入文件夹或音频文件路径',
      'transcribe.noAudio': '这个位置没有支持的音频文件',
      'transcribe.found': '找到 {n} 个音频文件',
      'transcribe.pickUnsupported': '当前环境不支持系统目录选择，请手动粘贴路径',
      'transcribe.absolute': '请输入绝对路径，例如 D:\\Podcasts\\ep12.m4a',
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
      'vocab.example': '例句',
      'vocab.translation': '翻译',
      'vocab.family': '词形',
      'vocab.etymology': '词源',
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
      'common.close': 'Close',
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
      'transcribe.retry': 'Retry',
      'transcribe.queued': 'Queued',
      'transcribe.hint': 'Transcription runs in the background, usually 1–3 minutes; the transcript appears automatically.',
      'transcribe.pathPlaceholder': 'Paste a folder or audio file path',
      'transcribe.scan': 'Scan',
      'transcribe.browse': 'Choose folder…',
      'transcribe.pathRequired': 'Enter a folder or audio file path',
      'transcribe.noAudio': 'No supported audio files here',
      'transcribe.found': '{n} audio files',
      'transcribe.pickUnsupported': 'This environment cannot open a system folder picker; paste the path instead',
      'transcribe.absolute': 'Enter an absolute path, e.g. D:\\Podcasts\\ep12.m4a',
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
      'vocab.example': 'Example',
      'vocab.translation': 'Translation',
      'vocab.family': 'Forms',
      'vocab.etymology': 'Etymology',
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
      'toast.added': 'Added to the wordbook',
      'toast.duplicate': 'This entry is already in the wordbook',
      'toast.jobStarted': 'Transcription started',
      'toast.deleted': 'Deleted',
    }

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
      '.egl-header-btn{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;margin:0}',
      '.egl-header-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.egl-header-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
      '.egl-row{display:flex;align-items:center;gap:8px;min-width:0}',
    ].join('')

    const HEADER_CSS = [
      '.egl-header-btn{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;margin:0}',
      '.egl-header-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.egl-header-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
    ].join('')

    function fmtClock(ms) {
      const total = Math.max(0, Math.round(Number(ms) || 0) / 1000)
      const hours = Math.floor(total / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = Math.floor(total % 60)
      const mm = String(minutes).padStart(2, '0')
      const ss = String(seconds).padStart(2, '0')
      return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
    }

    function errorMessage(error) {
      if (error instanceof Error) return error.message
      return String(error)
    }

    const MIN_FONT = 12
    const MAX_FONT = 20

    function readFontSize(key, fallback) {
      try {
        const value = Number(window.localStorage.getItem(`english-practice:font:${key}`))
        return Number.isFinite(value) && value >= MIN_FONT && value <= MAX_FONT ? value : fallback
      } catch {
        return fallback
      }
    }

    function saveFontSize(key, value) {
      try {
        window.localStorage.setItem(`english-practice:font:${key}`, String(value))
      } catch {
        // private mode or a storage failure only loses the preference
      }
    }

    const MIN_ZOOM = 0.5
    const MAX_ZOOM = 3
    const ZOOM_STEP = 0.25

    function readPdfZoom() {
      try {
        const value = Number(window.localStorage.getItem('english-practice:pdf-zoom'))
        return Number.isFinite(value) && value >= MIN_ZOOM && value <= MAX_ZOOM ? value : 1
      } catch {
        return 1
      }
    }

    function savePdfZoom(value) {
      try {
        window.localStorage.setItem('english-practice:pdf-zoom', String(value))
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

    const apiCache = new Map()

    function fileResourceAddress(sessionId, path) {
      const normalized = String(path ?? '').replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      const encoded = normalized
        .split('/')
        .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
        .join('/')
      return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`
    }

    function apiFor(ctx, sessionId) {
      const cached = apiCache.get(sessionId)
      if (cached !== undefined) return cached
      const signal = () => new AbortController().signal

      async function call(action, payload) {
        const response = await fetch('/dsh-english/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-english-practice': '1' },
          body: JSON.stringify({ action, sessionId, payload: payload ?? {} }),
        })
        let body
        try {
          body = await response.json()
        } catch {
          body = undefined
        }
        if (!body || body.ok !== true) throw new Error(body?.error ?? `请求失败（HTTP ${response.status}）`)
        return body.value
      }

      async function readAll(path) {
        let offset = 1
        const parts = []
        for (let page = 0; page < 50; page += 1) {
          const result = await ctx.remote.workspaceFiles.read(sessionId, path, { offset, limit: 4000 }, signal())
          if (!result || result.ok !== true) {
            const failure = result?.error
            if (failure?.code === 'workspace-file/not-found') return undefined
            throw new Error(failure?.message ?? 'read failed')
          }
          const content = result.value
          parts.push(content.text ?? '')
          if (content.eof) break
          if (!content.lines) break
          offset += content.lines
        }
        return parts.join('\n')
      }

      const api = {
        transcripts: () => call('transcripts.list', {}),
        transcriptsMerge: (file) => call('transcripts.merge', { file }),
        transcriptsImport: (payload) => call('transcripts.import', payload),
        transcriptsDelete: (file) => call('transcripts.delete', { file }),
        recordings: () => call('recordings.list', {}),
        browse: (path) => call('browse.list', { path }),
        models: () => call('models.list', {}),
        pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
        openFile: (path) => ctx.sidebarRight.openResource(fileResourceAddress(sessionId, path)),
        lookup: (payload) => call('lookup', payload),
        add: (payload) => call('vocab.add', payload),
        remove: (ids) => call('vocab.remove', { ids }),
        enrich: (id) => call('vocab.enrich', { id }),
        transcribe: (payload) => call('transcribe', payload),
        job: (id) => call('job', { id }),
        transcriptText: (file) => readAll(`${REL.transcripts}/${file}`),
        vocabText: () => readAll(REL.vocab),
        readBytes: async (path) => {
          const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, new AbortController().signal)
          if (!result || result.ok !== true) throw new Error(result?.error?.message ?? 'read failed')
          return result.value.data
        },
      }
      apiCache.set(sessionId, api)
      return api
    }

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
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
        return new RegExp(`(?<![A-Za-z'])(?:${source})(?![A-Za-z'])`, 'gi')
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
        parts.push(h('span', { key: `known-${index++}`, className: 'egl-known', title: label }, match[0]))
        last = match.index + match[0].length
        if (match[0].length === 0) pattern.lastIndex += 1
      }
      if (last < value.length) parts.push(value.slice(last))
      return parts.length > 0 ? parts : value
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
          previous.text = `${previous.text}\n${text}`
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
      const nextKey = () => `${keyPrefix}-${counter++}`
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
          parts.push(h('span', { key: `t-${chunk++}` }, renderPlainChunk(value.slice(last, match.index), options)))
        }
        const raw = match[0]
        const display = raw.startsWith('$$') || raw.startsWith('\\[')
        const inner = raw.startsWith('$$') ? raw.slice(2, -2) : raw.startsWith('\\[') ? raw.slice(2, -2) : raw.slice(1, -1)
        // Source files often break formulas at every operator; collapse those line breaks.
        const body = inner.replace(/\\\\/g, ' ').replace(/\s+/g, ' ').trim()
        parts.push(h('span', { key: `math-${index++}`, className: 'egl-math' + (display ? ' egl-math-display' : '') }, renderMath(body, `m${index}`)))
        last = match.index + raw.length
      }
      if (last < value.length) {
        parts.push(h('span', { key: `t-${chunk++}` }, renderPlainChunk(value.slice(last), options)))
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

    function isKnownWord(pattern, word) {
      if (pattern === undefined) return false
      pattern.lastIndex = 0
      const match = pattern.test(word)
      pattern.lastIndex = 0
      return match
    }

    function PdfPage({ api, page, index, knownPattern, t }) {
      const boxRef = useRef(null)
      const [src, setSrc] = useState('')
      const [scale, setScale] = useState(1)
      const [error, setError] = useState('')
      useEffect(() => {
        let alive = true
        let url = ''
        api.readBytes(page.image)
          .then((bytes) => {
            if (!alive) return
            const array = toUint8Array(bytes)
            if (array === undefined) throw new Error('unexpected image bytes')
            url = URL.createObjectURL(new Blob([array], { type: 'image/png' }))
            setSrc(url)
          })
          .catch((failure) => {
            if (alive) setError(errorMessage(failure))
          })
        return () => {
          alive = false
          if (url !== '') URL.revokeObjectURL(url)
        }
      }, [api, page.image])
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
      return h('div', {
        className: 'egl-pdf-page',
        ref: boxRef,
        'data-egl-page': String(index),
        onDragStart: (event) => event.preventDefault(),
      },
        src !== ''
          ? h('img', { className: 'egl-pdf-img', src, alt: '', draggable: false, onDragStart: (event) => event.preventDefault() })
          : h('div', { className: 'egl-pdf-loading' }, error || t('reader.loading')),
        src !== ''
          ? page.lines.map((line, lineIndex) => line.words.map((word, wordIndex) => h('span', {
              key: `${lineIndex}-${wordIndex}`,
              className: 'egl-pdf-word' + (isKnownWord(knownPattern, word.t) ? ' is-known' : ''),
              'data-egl-page': String(index),
              'data-egl-line': String(lineIndex),
              style: {
                left: `${word.x * scale}px`,
                top: `${word.y * scale}px`,
                width: `${word.w * scale}px`,
                height: `${word.h * scale}px`,
                fontSize: `${Math.max(1, word.h * scale)}px`,
              },
            }, word.t)))
          : null
      )
    }

    function cleanSelectionText(text) {      return String(text ?? '').trim().replace(/^[\s"'“”‘’()[\]{}.,;:!?…—–-]+|[\s"'“”‘’()[\]{}.,;:!?…—–-]+$/g, '')
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

    function VocabCard({ t, entry, detail, onDelete, onEnrich, enriching }) {
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
              h('span', { className: 'egl-muted' }, t('vocab.family') + '：'),
              family.map((item, index) => h('span', { key: index, className: 'egl-form' }, `${item.label ? `${item.label} ` : ''}${item.form}`))
            )
          : null,
        hasEtymology && full
          ? h('div', { className: 'egl-etymology' },
              h('span', { className: 'egl-etymology-line' },
                h('span', { className: 'egl-etymology-label' }, t('vocab.etymology') + '：'),
                h('span', null, [etymology.language || '', etymologyParts.map((part) => `${part.part}${part.meaning ? `（${part.meaning}）` : ''}`).join(' + ')].filter(Boolean).join(' · '))
              ),
              etymology.explanation ? h('div', { className: 'egl-etymology-note' }, etymology.explanation) : null
            )
          : null,
        isWord && entry.sentence && full
          ? h('div', { className: 'egl-example' },
              h('span', { className: 'egl-muted' }, t('vocab.example') + '：'),
              renderRichText(entry.sentence, { word: entry.word }))
          : null,
        isWord && entry.sentenceZh && full ? h('div', { className: 'egl-example', }, entry.sentenceZh) : null,
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
    }

    function ReaderPanel({ sessionId, t, api }) {
      const rootRef = useRef(null)
      const readerRef = useRef(null)
      const popupRef = useRef(null)
      const requestRef = useRef(0)
      const segmentsRef = useRef([])
      const pagesRef = useRef([])
      const vocabRef = useRef([])
      const importRef = useRef(null)
      const toastTimer = useRef(undefined)
      const ctrlAlone = useRef(false)
      const tRef = useRef(t)
      tRef.current = t
      const [mode, setMode] = useState('reader')
      const [transcripts, setTranscripts] = useState([])
      const [selected, setSelected] = useState(null)
      const [transcript, setTranscript] = useState(null)
      const [transcriptError, setTranscriptError] = useState('')
      const [transcriptLoading, setTranscriptLoading] = useState(false)
      const [reloadKey, setReloadKey] = useState(0)
      const [vocab, setVocab] = useState({ version: 1, words: [] })
      const [apiError, setApiError] = useState('')
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
      const [browseResult, setBrowseResult] = useState(null)
      const [browseError, setBrowseError] = useState('')
      const [browseBusy, setBrowseBusy] = useState(false)
      const [modelList, setModelList] = useState([])
      const [modelChoice, setModelChoice] = useState('')
      const [modelDefault, setModelDefault] = useState('')
      const [job, setJob] = useState(null)
      const [lastJobRequest, setLastJobRequest] = useState(null)

      const showToast = useCallback((text) => {
        setToast(text)
        if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(''), 2600)
      }, [])

      useEffect(() => () => {
        if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
      }, [])

      const refreshLists = useCallback(async () => {
        try {
          const list = await api.transcripts()
          if (Array.isArray(list)) setTranscripts(list)
          setApiError('')
        } catch (error) {
          // keep the previous list, but surface why the panel cannot talk to its Host half
          setApiError(errorMessage(error))
        }
        try {
          const text = await api.vocabText()
          const document = parseLoose(text)
          if (document && Array.isArray(document.words)) setVocab({ version: 1, words: document.words })
          else if (text === undefined) setVocab({ version: 1, words: [] })
        } catch {
          // keep the previous wordbook
        }
      }, [api])

      useEffect(() => {
        let alive = true
        const tick = () => {
          if (!alive) return
          void refreshLists()
        }
        tick()
        const timer = setInterval(tick, 4000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [refreshLists])

      useEffect(() => {
        if (transcripts.length === 0) {
          if (selected !== null) setSelected(null)
          return
        }
        if (selected === null || !transcripts.some((item) => item.file === selected)) {
          setSelected(transcripts[0].file)
        }
      }, [transcripts, selected])

      const transcriptMetaRef = useRef('')
      useEffect(() => {
        setDeleteConfirm(false)
      }, [selected])

      useEffect(() => {
        if (!selected) return
        const meta = transcripts.find((item) => item.file === selected)
        if (!meta) return
        const signature = `${meta.createdAt}|${meta.segments}|${meta.durationMs}`
        if (transcriptMetaRef.current !== '' && transcriptMetaRef.current !== signature) {
          setReloadKey((value) => value + 1)
        }
        transcriptMetaRef.current = signature
      }, [transcripts, selected])

      useEffect(() => {
        if (!selected) {
          setTranscript(null)
          setTranscriptError('')
          return undefined
        }
        let alive = true
        setTranscriptLoading(true)
        setTranscriptError('')
        api.transcriptText(selected)
          .then((text) => {
            if (!alive) return
            const document = parseLoose(text)
            if (!document || !Array.isArray(document.segments)) throw new Error(tRef.current('error.transcript'))
            setTranscript(document)
          })
          .catch((error) => {
            if (!alive) return
            setTranscript(null)
            setTranscriptError(errorMessage(error))
          })
          .finally(() => {
            if (alive) setTranscriptLoading(false)
          })
        return () => {
          alive = false
        }
      }, [selected, reloadKey, api])

      useEffect(() => {
        if (!transcribeOpen) return undefined
        let alive = true
        api.recordings()
          .then((list) => {
            if (!alive) return
            const items = Array.isArray(list) ? list : []
            setRecordings(items)
            setRecordingChoice((current) => (items.some((item) => item.path === current) ? current : (items[0]?.path ?? '')))
          })
          .catch(() => {
            if (alive) setRecordings([])
          })
        return () => {
          alive = false
        }
      }, [transcribeOpen, api])

      useEffect(() => {
        if (!transcribeOpen) return undefined
        let alive = true
        api.models()
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
        }
      }, [transcribeOpen, api])

      const jobId = job?.jobId
      useEffect(() => {
        if (!jobId) return undefined
        let alive = true
        let timer
        const poll = async () => {
          try {
            const next = await api.job(jobId)
            if (!alive || !next) return
            setJob((previous) => (previous && previous.jobId === jobId ? { ...previous, ...next } : previous))
            if (next.state === 'done' || next.state === 'failed' || next.state === 'missing') {
              if (timer !== undefined) clearInterval(timer)
              if (next.state === 'done') {
                setReloadKey((value) => value + 1)
                if (next.transcript) setSelected(String(next.transcript).split('/').pop())
              } else {
                showToast(`${tRef.current('transcribe.failed')}${next.error ? `：${next.error}` : ''}`)
              }
              await refreshLists()
            }
          } catch {
            // keep polling; transient Remote failures are expected while reconnecting
          }
        }
        void poll()
        timer = setInterval(poll, 1500)
        return () => {
          alive = false
          if (timer !== undefined) clearInterval(timer)
        }
      }, [jobId, api, refreshLists, showToast])

      const startTranscribe = useCallback(async (request) => {
        setBusy('transcribe')
        try {
          const result = await api.transcribe(request)
          setJob({ jobId: result.jobId, state: 'queued', transcript: result.transcript })
          setLastJobRequest(request)
          setTranscribeOpen(false)
          showToast(t('toast.jobStarted'))
        } catch (error) {
          showToast(errorMessage(error))
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
          setBrowseResult({ kind: result?.kind, dir: result?.dir, files })
          if (files.length === 0) {
            setBrowseError(t('transcribe.noAudio'))
          } else {
            setRecordingChoice(files[0].path)
          }
        } catch (error) {
          setBrowseResult(null)
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
          if (dir === null || dir === undefined || dir === '') {
            return
          }
          setBrowsePath(dir)
          await scanPath(dir)
        } catch (error) {
          setBrowseError(errorMessage(error))
        } finally {
          setBrowseBusy(false)
        }
      }, [api, scanPath, showToast, t])

      const mergeCurrent = useCallback(async () => {
        if (!selected) return
        try {
          const result = await api.transcriptsMerge(selected)
          if (result?.changed) showToast(t('toast.merged', { before: String(result.before), after: String(result.after) }))
          else showToast(t('toast.mergeNoop'))
          setReloadKey((value) => value + 1)
        } catch (error) {
          showToast(errorMessage(error))
        }
      }, [api, selected, showToast, t])

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
          showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, deleteConfirm, refreshLists, selected, showToast, t])

      const runLookup = useCallback(async (payload) => {
        const requestId = requestRef.current + 1
        requestRef.current = requestId
        const stored = findStoredEntry(vocabRef.current, payload.kind, payload.text)
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
          const result = await api.lookup({ kind: payload.kind, text: payload.text, sentence: payload.sentence })
          if (requestId !== requestRef.current) return
          setPopup((previous) => {
            if (!previous || previous.requestId !== requestId) return previous
            if (result && result.ok === true) return { ...previous, status: 'ready', result }
            return { ...previous, status: 'error', error: result?.message ?? t('error.lookup') }
          })
        } catch (error) {
          if (requestId !== requestRef.current) return
          setPopup((previous) => (previous && previous.requestId === requestId ? { ...previous, status: 'error', error: errorMessage(error) } : previous))
        }
      }, [api, t])

      const addPopup = useCallback(async (current) => {
        if (busy) return
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
          showToast(errorMessage(error))
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
          showToast(errorMessage(error))
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
          showToast(errorMessage(error))
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
          showToast(errorMessage(error))
        } finally {
          setBusy('')
        }
      }, [api, refreshLists, showToast, t])

      const copyPrompt = useCallback(async () => {
        const text = t('vocab.prompt')
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text)
            showToast(t('vocab.promptCopied'))
            return
          }
        } catch {
          // fall through to the manual hint
        }
        showToast(text)
      }, [showToast, t])

      segmentsRef.current = Array.isArray(transcript?.segments) ? transcript.segments : []
      pagesRef.current = Array.isArray(transcript?.pages) ? transcript.pages : []

      useEffect(() => {
        const openFromSelection = () => {
          if (!rootRef.current) return
          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
          const range = selection.getRangeAt(0)
          const raw = range.toString().replace(/\s+/g, ' ').trim()
          if (raw === '' || raw.length > 400) return
          const selectionRect = range.getBoundingClientRect()
          const rootRect = rootRef.current.getBoundingClientRect()
          const kind = classify(raw)
          const width = kind === 'sentence' ? 380 : 320
          let left = selectionRect.left - rootRect.left
          left = Math.max(8, Math.min(left, Math.max(8, rootRect.width - width - 8)))
          const below = selectionRect.bottom - rootRect.top + 8
          const above = rootRect.height - (selectionRect.top - rootRect.top) + 8
          const style = below + 200 < rootRect.height ? { top: below, left, width } : { bottom: above, left, width }
          const title = transcripts.find((item) => item.file === selected)?.title ?? (selected ?? '')
          const startPdf = pdfLineElement(range.startContainer)
          const endPdf = pdfLineElement(range.endContainer)
          if (startPdf !== null && endPdf !== null
            && startPdf.getAttribute('data-egl-page') === endPdf.getAttribute('data-egl-page')
            && startPdf.getAttribute('data-egl-line') === endPdf.getAttribute('data-egl-line')
            && rootRef.current.contains(startPdf)) {
            const pageIndex = Number(startPdf.getAttribute('data-egl-page'))
            const lineIndex = Number(startPdf.getAttribute('data-egl-line'))
            const line = pagesRef.current[pageIndex]?.lines?.[lineIndex]
            if (!line) return
            const sentence = sentenceAround(line.text, raw)
            void runLookup({
              kind,
              text: raw,
              sentence,
              source: { transcript: selected ?? '', title, speaker: '', startMs: 0 },
              style,
            })
            return
          }
          const startSegment = segmentElement(range.startContainer)
          const endSegment = segmentElement(range.endContainer)
          if (!startSegment || startSegment !== endSegment) return
          if (!rootRef.current.contains(startSegment)) return
          const index = Number(startSegment.getAttribute('data-egl-seg'))
          const segment = segmentsRef.current[index]
          if (!segment) return
          const sentence = sentenceAround(segment.text, raw)
          void runLookup({
            kind,
            text: raw,
            sentence,
            source: { transcript: selected ?? '', title, speaker: String(segment.speaker ?? ''), startMs: Number(segment.start) || 0 },
            style,
          })
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            if (popup) {
              setPopup(null)
              event.stopPropagation()
            }
            return
          }
          if (event.key === 'Control' || event.key === 'Meta') {
            if (!event.repeat) ctrlAlone.current = true
            return
          }
          ctrlAlone.current = false
        }
        const onKeyUp = (event) => {
          if (event.key !== 'Control' && event.key !== 'Meta') return
          const alone = ctrlAlone.current
          ctrlAlone.current = false
          if (alone) openFromSelection()
        }
        const onPointerDown = () => {
          ctrlAlone.current = false
        }
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('keyup', onKeyUp, true)
        window.addEventListener('pointerdown', onPointerDown, true)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('keyup', onKeyUp, true)
          window.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [popup, runLookup, selected, transcripts])

      useEffect(() => {
        if (!popup) return undefined
        const onDown = (event) => {
          if (popupRef.current && !popupRef.current.contains(event.target)) setPopup(null)
        }
        document.addEventListener('mousedown', onDown, true)
        return () => document.removeEventListener('mousedown', onDown, true)
      }, [popup])

      function pdfLineElement(node) {
        let element = node && node.nodeType === 3 ? node.parentElement : node
        while (element && element !== document.body) {
          if (element.getAttribute && element.getAttribute('data-egl-line') !== null) return element
          element = element.parentElement
        }
        return null
      }

      function segmentElement(node) {
        let element = node && node.nodeType === 3 ? node.parentElement : node
        while (element && element !== document.body) {
          if (element.getAttribute && element.getAttribute('data-egl-seg') !== null) return element
          element = element.parentElement
        }
        return null
      }

      const segments = Array.isArray(transcript?.segments) ? transcript.segments : []
      const displaySegments = useMemo(() => mergeMathSegments(segments), [segments])
      segmentsRef.current = displaySegments
      const words = Array.isArray(vocab?.words) ? vocab.words : []
      vocabRef.current = words
      const knownSignature = useMemo(() => words
        .filter((entry) => entry.kind !== 'sentence')
        .map((entry) => String(entry.normalized ?? ''))
        .filter((value, index, all) => value !== '' && all.indexOf(value) === index)
        .sort()
        .join('|'), [words])
      const knownPattern = useMemo(() => knownWordPattern(words), [knownSignature])
      const pending = words.filter((entry) => entry.status === 'pending').length
      const currentTitle = transcripts.find((item) => item.file === selected)?.title ?? ''
      const meta = transcript
        ? (transcript.pdf === true
            ? t('reader.metaPdf', { pages: String(Array.isArray(transcript.pages) ? transcript.pages.length : 0) })
            : transcript.imported
              ? t('reader.metaImported', { segments: String(segments.length) })
              : t('reader.meta', {
                  segments: String(segments.length),
                  speakers: String(Array.isArray(transcript.speakers) ? transcript.speakers.length : 0),
                  duration: fmtClock(transcript.durationMs ?? 0),
                }))
        : ''

      const transcriptOptions = useMemo(() => {
        const counts = new Map()
        for (const entry of words) {
          const title = String(entry.source?.title ?? '').trim()
          if (title === '') continue
          counts.set(title, (counts.get(title) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
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

      const activeFont = mode === 'reader' ? readerFont : vocabFont
      const changePdfZoom = (delta) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((pdfZoom + delta) * 100) / 100))
        setPdfZoom(next)
        savePdfZoom(next)
      }
      const changeFont = (delta) => {
        if (mode === 'reader') {
          const next = Math.min(MAX_FONT, Math.max(MIN_FONT, readerFont + delta))
          setReaderFont(next)
          saveFontSize('reader', next)
        } else {
          const next = Math.min(MAX_FONT, Math.max(MIN_FONT, vocabFont + delta))
          setVocabFont(next)
          saveFontSize('vocab', next)
        }
      }
      const fontControl = h('div', { className: 'egl-fontctl', role: 'group', 'aria-label': t('font.label') },
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('font.smaller'),
          'aria-label': t('font.smaller'),
          disabled: activeFont <= MIN_FONT,
          onClick: () => changeFont(-1),
        }, 'A−'),
        h('span', { className: 'egl-fontsize', title: `${activeFont}px` }, String(activeFont)),
        h('button', {
          type: 'button',
          className: 'egl-btn egl-fontbtn',
          title: t('font.larger'),
          'aria-label': t('font.larger'),
          disabled: activeFont >= MAX_FONT,
          onClick: () => changeFont(1),
        }, 'A+')
      )

      function renderTranscribe() {
        if (!transcribeOpen) return null
        const items = Array.isArray(recordings) ? recordings : []
        const found = Array.isArray(browseResult?.files) ? browseResult.files : []
        const choices = found.length > 0 ? found : items
        const usingBrowse = found.length > 0
        const effectiveChoice = choices.some((item) => item.path === recordingChoice) ? recordingChoice : (choices[0]?.path ?? '')
        return h('div', { className: 'egl-panel' },
          h('div', { className: 'egl-row' },
            h('strong', null, t('transcribe.title')),
            h('button', { type: 'button', className: 'egl-btn egl-ghost', onClick: () => setTranscribeOpen(false) }, t('transcribe.cancel'))
          ),
          h('div', { className: 'egl-tools' },
            h('input', {
              className: 'egl-input',
              style: { flex: 1, minWidth: 150 },
              placeholder: t('transcribe.pathPlaceholder'),
              value: browsePath,
              onChange: (event) => setBrowsePath(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') void scanPath(browsePath)
              },
            }),
            h('button', { type: 'button', className: 'egl-btn', disabled: browseBusy, onClick: () => { void scanPath(browsePath) } }, t('transcribe.scan')),
            h('button', { type: 'button', className: 'egl-btn', disabled: browseBusy, onClick: () => { void chooseFolder() } }, t('transcribe.browse'))
          ),
          browseError ? h('div', { className: 'egl-err', style: { marginTop: 6 } }, browseError) : null,
          choices.length === 0
            ? h('div', { className: 'egl-muted', style: { marginTop: 6 } }, t('transcribe.empty'))
            : h('div', null,
                h('div', { className: 'egl-tools' },
                  h('label', { className: 'egl-field' },
                    h('span', null, usingBrowse ? t('transcribe.found', { n: String(found.length) }) : t('transcribe.audio')),
                    h('select', {
                      className: 'egl-select',
                      value: effectiveChoice,
                      onChange: (event) => setRecordingChoice(event.target.value),
                    }, choices.map((item) => h('option', { key: item.path, value: item.path }, item.name)))
                  ),
                  h('label', { className: 'egl-field' },
                    h('span', null, t('transcribe.speakers')),
                    h('input', {
                      className: 'egl-input',
                      style: { width: 64 },
                      inputMode: 'numeric',
                      value: speakerCount,
                      onChange: (event) => setSpeakerCount(event.target.value.replace(/[^0-9]/g, '')),
                    })
                  ),
                  h('label', { className: 'egl-field' },
                    h('span', null, t('transcribe.model')),
                    h('select', {
                      className: 'egl-select',
                      value: modelChoice,
                      onChange: (event) => setModelChoice(event.target.value),
                    }, (modelList.length > 0 ? modelList : [modelDefault]).filter((id) => id !== '').map((id) => h('option', { key: id, value: id }, id === modelDefault ? t('transcribe.modelDefault', { model: id }) : id)))
                  ),
                  h('button', {
                    type: 'button',
                    className: 'egl-btn',
                    disabled: busy === 'transcribe' || effectiveChoice === '',
                    onClick: () => startTranscribe({
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

      function renderJob() {
        if (!job) return null
        const state = job.state ?? 'queued'
        const failed = state === 'failed' || state === 'missing'
        const label = state === 'done' ? t('transcribe.done')
          : failed ? t('transcribe.failed')
          : state === 'queued' ? t('transcribe.queued')
          : t('transcribe.running')
        return h('div', { className: 'egl-job' + (failed ? ' is-failed' : '') },
          h('span', { className: 'egl-job-text' }, label + (job.error ? `：${job.error}` : '') + (state === 'running' || state === 'queued' ? ` ${t('transcribe.hint')}` : '')),
          failed && lastJobRequest
            ? h('button', { type: 'button', className: 'egl-btn', disabled: busy === 'transcribe', onClick: () => startTranscribe(lastJobRequest) }, t('transcribe.retry'))
            : null
        )
      }

      function renderReader() {
        const transcribePanel = renderTranscribe()
        const jobView = renderJob()
        const headVisible = transcript !== null && !transcriptError && !(transcriptLoading && !transcript)
        const headRow = headVisible
          ? h('div', { className: 'egl-transcript-head' },
              h('strong', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, currentTitle),
              transcript !== null && transcript.imported !== true
                ? h('button', {
                    type: 'button',
                    className: 'egl-btn egl-ghost',
                    style: { flex: 'none' },
                    onClick: () => { void mergeCurrent() },
                  }, t('reader.merge'))
                : null,
              transcript !== null && transcript.pdf === true && typeof transcript.pdfPath === 'string'
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
              transcript !== null && transcript.pdf === true
                ? h('div', { className: 'egl-fontctl', role: 'group', 'aria-label': t('reader.zoom'), style: { flex: 'none' } },
                    h('button', { type: 'button', className: 'egl-btn egl-fontbtn', 'aria-label': t('reader.zoomOut'), disabled: pdfZoom <= MIN_ZOOM, onClick: () => changePdfZoom(-ZOOM_STEP) }, '−'),
                    h('span', { className: 'egl-fontsize', style: { minWidth: 38 } }, `${Math.round(pdfZoom * 100)}%`),
                    h('button', { type: 'button', className: 'egl-btn egl-fontbtn', 'aria-label': t('reader.zoomIn'), disabled: pdfZoom >= MAX_ZOOM, onClick: () => changePdfZoom(ZOOM_STEP) }, '+')
                  )
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
        let body
        if (transcripts.length === 0) {
          body = renderReaderEmpty()
        } else if (transcriptLoading && !transcript) {
          body = h('div', { className: 'egl-empty' }, t('reader.loading'))
        } else if (transcriptError) {
          body = h('div', { className: 'egl-empty' },
            h('div', { className: 'egl-empty-title' }, t('reader.failed')),
            h('div', null, transcriptError)
          )
        } else if (!transcript) {
          body = renderReaderEmpty()
        } else if (transcript.pdf === true) {
          const pages = Array.isArray(transcript.pages) ? transcript.pages : []
          body = h('div', { className: 'egl-pdf', style: { width: `${Math.round(pdfZoom * 100)}%` } },
            pages.map((page, index) => h(PdfPage, { key: index, api, page, index, knownPattern, t })))
        } else {
          body = displaySegments.map((segment, index) => h('p', {
            key: index,
            className: 'egl-seg',
            'data-egl-seg': String(index),
          },
            transcript?.imported === true
              ? null
              : h('span', { className: 'egl-seg-meta' },
                  speakerName(t, transcript, segment.speaker) + ' · ' + fmtClock(segment.start)),
            h('span', { className: 'egl-seg-text' }, renderRichText(String(segment.text ?? ''), { pattern: knownPattern, label: t('reader.known') }))
          ))
        }
        return h('div', { className: 'egl-reader' },
          transcribePanel !== null || jobView !== null
            ? h('div', { className: 'egl-reader-top' }, transcribePanel, jobView)
            : null,
          headRow,
          h('div', { className: 'egl-scroll', ref: readerRef, style: { fontSize: `${readerFont}px` }, onScroll: () => { if (popup) setPopup(null) } }, body)
        )
      }

      function renderReaderEmpty() {
        return h('div', { className: 'egl-empty' },
          h('div', { className: 'egl-empty-title' }, t('reader.emptyTitle')),
          h('div', null, t('reader.emptyHint')),
          h('div', { style: { marginTop: 10 } },
            h('button', { type: 'button', className: 'egl-btn', onClick: () => setTranscribeOpen(true) }, t('reader.transcribe')),
            h('button', { type: 'button', className: 'egl-btn', style: { marginLeft: 8 }, disabled: busy === 'import', onClick: () => importRef.current?.click() }, t('reader.import'))
          )
        )
      }

      function renderVocab() {
        return h('div', { className: 'egl-vocab' },
          h('div', { className: 'egl-vocab-head' },
            h('div', { className: 'egl-tools' },
              h('div', { className: 'egl-tabs' },
                h('button', { type: 'button', className: 'egl-tab' + (filter === 'all' ? ' is-on' : ''), onClick: () => setFilter('all') }, t('vocab.filter.all')),
                h('button', { type: 'button', className: 'egl-tab' + (filter === 'word' ? ' is-on' : ''), onClick: () => setFilter('word') }, t('vocab.filter.word')),
                h('button', { type: 'button', className: 'egl-tab' + (filter === 'sentence' ? ' is-on' : ''), onClick: () => setFilter('sentence') }, t('vocab.filter.sentence'))
              ),
              h('input', {
                className: 'egl-input',
                style: { flex: 1, minWidth: 120 },
                placeholder: t('vocab.search'),
                value: query,
                onChange: (event) => setQuery(event.target.value),
              })
            ),
            h('div', { className: 'egl-tools' },
              h('label', { className: 'egl-field', style: { flex: 'none' } },
                h('span', null, t('vocab.transcript')),
                h('select', {
                  className: 'egl-select',
                  value: transcriptFilter,
                  onChange: (event) => setTranscriptFilter(event.target.value),
                },
                  h('option', { value: '' }, t('vocab.transcriptAll')),
                  transcriptOptions.map((option) => h('option', { key: option.title, value: option.title }, `${option.title} (${option.count})`))
                )
              ),
              h('label', { className: 'egl-field', style: { flex: 'none' } },
                h('span', null, t('vocab.sort')),
                h('select', {
                  className: 'egl-select',
                  value: sortMode,
                  onChange: (event) => setSortMode(event.target.value),
                },
                  h('option', { value: 'time-desc' }, t('vocab.sort.timeDesc')),
                  h('option', { value: 'time-asc' }, t('vocab.sort.timeAsc')),
                  h('option', { value: 'az' }, t('vocab.sort.az'))
                )
              ),
              h('div', { className: 'egl-tabs', style: { marginLeft: 'auto' }, role: 'group', 'aria-label': t('vocab.detail') },
                h('button', { type: 'button', className: 'egl-tab' + (cardDetail === 'simple' ? ' is-on' : ''), 'aria-pressed': cardDetail === 'simple', onClick: () => setCardDetail('simple') }, t('vocab.detailSimple')),
                h('button', { type: 'button', className: 'egl-tab' + (cardDetail === 'full' ? ' is-on' : ''), 'aria-pressed': cardDetail === 'full', onClick: () => setCardDetail('full') }, t('vocab.detailFull'))
              )
            )
          ),
          h('div', { className: 'egl-scroll', style: { fontSize: `${vocabFont}px` } },
            pending > 0
              ? h('div', { className: 'egl-banner' },
                  h('span', { className: 'egl-banner-text' }, t('vocab.pendingBanner', { n: String(pending) })),
                  h('button', { type: 'button', className: 'egl-btn', onClick: copyPrompt }, t('vocab.copyPrompt'))
                )
              : null,
            words.length === 0
              ? h('div', { className: 'egl-empty' }, t('vocab.empty'))
              : filtered.length === 0
                ? h('div', { className: 'egl-empty' }, t('vocab.noMatch'))
                : h('div', { className: 'egl-cards' + (cardDetail === 'simple' ? ' egl-cards-simple' : '') },
                    filtered.map((entry) => h(VocabCard, { key: entry.id, t, entry, detail: cardDetail, onDelete: deleteEntry, onEnrich: enrichEntry, enriching: busy === 'enrich' }))
                  )
          )
        )
      }

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
            h('button', { type: 'button', role: 'tab', 'aria-selected': mode === 'vocab', className: 'egl-tab' + (mode === 'vocab' ? ' is-on' : ''), onClick: () => setMode('vocab') }, t('mode.vocab') + (pending > 0 ? ` ${pending}` : ''))
          ),
          fontControl,
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
              : h('button', { type: 'button', className: 'egl-btn', onClick: () => { void refreshLists() } }, t('common.refresh'))
          )
        ),
        apiError
          ? h('div', { className: 'egl-job is-failed', style: { margin: '8px 10px 0' } }, t('error.generic') + '：' + apiError)
          : null,
        mode === 'reader' ? renderReader() : renderVocab(),
        popup
          ? h('div', { ref: popupRef },
              h(Popup, { t, popup, busy: busy === 'add', onAdd: addPopup, onClose: () => setPopup(null) }))
          : null,
        toast ? h('div', { className: 'egl-toast', role: 'status' }, toast) : null
      )
    }

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
        inject: (sessionId) => ({ api: apiFor(ctx, sessionId) }),
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
