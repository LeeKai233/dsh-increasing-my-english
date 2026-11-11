/**
 * Host half of the English practice bundle.
 *
 * Owns the workspace data (transcripts, vocabulary, caches), the Bailian ASR
 * subprocess, the lookup backends (DSH model by default, Bailian text model as
 * an option), the agent tools, and the `/english` command family that the
 * side-bar panel drives through the Commands Remote namespace.
 *
 * No third-party dependencies: only Node builtins.
 */
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

export const name = 'english-practice'
export const inject = ['tools', 'workingDirectory', 'webServer']

const CONFIG_REL = '.dsh-english/config.json'
const CACHE_REL = '.dsh-english/lookup-cache.json'
const VOCAB_REL = 'vocab/vocabulary.json'
const VOCAB_MD_REL = 'vocab/生词本.md'
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.amr', '.wma', '.mp4', '.webm'])
const IMPORT_EXTENSIONS = new Set(['.txt', '.text', '.md', '.markdown', '.html', '.htm', '.tex', '.rst', '.log', '.pdf'])

const DEFAULT_CONFIG = {
  blPath: 'bl',
  asr: {
    model: 'qwen-audio-3.1-asr-flash-filetrans',
    fallbackModel: 'fun-asr',
    language: 'en',
    maxJobMinutes: 30,
    pollIntervalSeconds: 2,
    mergeGapMs: 4000,
  },
  lookup: {
    backend: 'ds',
    provider: null,
    model: null,
    timeoutMs: 20000,
  },
  dirs: {
    recordings: 'recordings',
    transcripts: 'transcripts',
  },
  import: {
    pdfToTextPath: 'pdftotext',
    pdfToPpmPath: 'pdftoppm',
  },
}

const LOOKUP_SYSTEM =
  'You are a precise English-Chinese dictionary and translator for a Chinese learner of English. ' +
  'Reply with strict JSON only: no markdown fences, no commentary, no extra keys.'

const CACHE_LIMIT = 2000
const LOOKUP_VERSION = 2
const MAX_TEXT = 400
const MAX_WORD = 120

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

function deepMerge(base, extra) {
  if (!isRecord(base) || !isRecord(extra)) return extra === undefined ? base : extra
  const out = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    out[key] = isRecord(value) && isRecord(base[key]) ? deepMerge(base[key], value) : value
  }
  return out
}

function sha1(text) {
  return createHash('sha1').update(text).digest('hex')
}

function uniqueName(name) {
  const cleaned = String(name ?? '').replace(/^\.+/, '').trim()
  return cleaned === '' ? 'transcript' : cleaned
}

function normalizedPath(path) {
  return String(path ?? '').replace(/\\/g, '/')
}

function within(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function resolveInWorkspace(root, path) {
  const text = String(path ?? '').trim()
  if (text === '') throw new Error('路径为空')
  const absolute = isAbsolute(text) ? resolve(text) : resolve(root, text)
  if (!within(root, absolute)) throw new Error(`路径不在当前工作区内：${text}`)
  return absolute
}

function resolveAnyPath(root, path) {
  const text = String(path ?? '').trim()
  if (text === '') throw new Error('路径为空')
  return isAbsolute(text) ? resolve(text) : resolveInWorkspace(root, text)
}

function normalizeSegment(entry) {
  if (!isRecord(entry)) return undefined
  const text = typeof entry.text === 'string' ? entry.text : typeof entry.sentence === 'string' ? entry.sentence : ''
  if (text.trim() === '') return undefined
  if (!/[A-Za-z0-9\u00C0-\u024F\u4E00-\u9FFF]/.test(text)) return undefined
  const start = Number(entry.begin_time ?? entry.start_time ?? entry.start ?? entry.startMs ?? entry.begin ?? 0)
  const end = Number(entry.end_time ?? entry.end ?? entry.endMs ?? entry.finish ?? start)
  const speaker = entry.speaker_id ?? entry.speaker ?? entry.speakerId ?? entry.channel_id ?? '0'
  return {
    start: Number.isFinite(start) ? Math.max(0, Math.round(start)) : 0,
    end: Number.isFinite(end) ? Math.max(0, Math.round(end)) : 0,
    speaker: String(speaker),
    text: text.trim(),
  }
}

/** Tolerant normalization of whatever the ASR model returned. */
function normalizeTranscript(raw, meta) {
  const root = isRecord(raw) ? raw : {}
  const output = isRecord(root.output) ? root.output : isRecord(root.data) ? root.data : root
  const warnings = Array.isArray(meta.warnings) ? [...meta.warnings] : []
  let list = output.transcripts ?? output.result?.transcripts ?? output.results
  if (!Array.isArray(list)) list = []

  const segments = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const sentences = item.sentences ?? item.sentence_list ?? item.segments
    if (Array.isArray(sentences) && sentences.length > 0) {
      for (const sentence of sentences) {
        const segment = normalizeSegment(sentence)
        if (segment !== undefined) segments.push(segment)
      }
      continue
    }
    const whole = normalizeSegment(item)
    if (whole !== undefined) segments.push(whole)
  }
  if (segments.length === 0 && typeof output.text === 'string' && output.text.trim() !== '') {
    segments.push({ start: 0, end: 0, speaker: '0', text: output.text.trim() })
    warnings.push('ASR 结果没有分句，已把整段文本作为一条记录')
  }
  segments.sort((a, b) => a.start - b.start)
  const merged = mergeSegments(segments, meta.mergeGapMs)
  const speakers = []
  const seen = new Set()
  for (const segment of merged) {
    if (seen.has(segment.speaker)) continue
    seen.add(segment.speaker)
    speakers.push({ id: segment.speaker, label: `Speaker ${speakers.length + 1}` })
  }
  const durationMs = merged.reduce((max, segment) => Math.max(max, segment.end), 0)
  return {
    version: 1,
    audio: meta.audio,
    createdAt: new Date().toISOString(),
    model: meta.model,
    durationMs,
    warnings,
    speakers,
    segments: merged.map((segment, index) => ({ i: index, ...segment })),
  }
}

function parseJsonObject(text) {
  const source = String(text ?? '').trim()
  const unfenced = source.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const candidates = [unfenced]
  const first = unfenced.indexOf('{')
  const last = unfenced.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(unfenced.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      // try the next candidate
    }
  }
  throw new Error('模型没有返回可解析的 JSON')
}

function collectStrings(value, out) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out)
  else if (isRecord(value)) for (const item of Object.values(value)) collectStrings(item, out)
}

/** Find the model text inside a Bailian CLI JSON envelope. */
function extractCliText(document) {
  if (typeof document === 'string') return document
  if (!isRecord(document)) return ''
  const direct = [
    document.output?.text,
    document.text,
    document.result?.text,
    document.data?.text,
  ].find((value) => typeof value === 'string' && value.trim() !== '')
  if (typeof direct === 'string') return direct
  const content = document.output?.choices?.[0]?.message?.content ?? document.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const joined = content.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('')
    if (joined.trim() !== '') return joined
  }
  const strings = []
  collectStrings(document, strings)
  const withJson = strings.filter((value) => value.includes('{') && value.includes('}')).sort((a, b) => b.length - a.length)
  return withJson[0] ?? strings.sort((a, b) => b.length - a.length)[0] ?? ''
}

function buildLookupPrompt(kind, text, sentence) {
  if (kind === 'sentence') {
    return [
      `Sentence: ${text}`,
      'Return exactly: {"translation":"<a natural Simplified Chinese translation>"}',
    ].join('\n')
  }
  const lines = [
    `Word or phrase: ${text}`,
    'Return exactly: {"ipa":"/<phonetic transcription>/","meanings":[{"pos":"<n.|v.|adj.|adv.|...>","zh":"<brief Simplified Chinese meaning>"}],"family":[{"label":"<名词|动词|形容词|副词|过去式|过去分词|复数|比较级|最高级|现在分词|第三人称单数>","form":"<the other form>"}],"etymology":{"language":"<source language, e.g. Greek/Latin/Old English/French>","parts":[{"part":"<root/prefix/suffix>","meaning":"<its meaning in Simplified Chinese>"}],"explanation":"<1-3 sentences in Simplified Chinese explaining how the parts form the word>"}}',
    'Rules: give 1 to 3 meanings and keep zh short; ipa may be "". family lists the word\'s other parts of speech and irregular inflections only when they exist and differ from the headword (max 6 items, Chinese labels, no duplicates). etymology is best-effort: when the origin is unknown return {"language":"","parts":[],"explanation":""}; keep the explanation under 120 Chinese characters.',
  ]
  return lines.join('\n')
}

function normalizeLookup(kind, raw) {
  if (kind === 'sentence') {
    const translation = typeof raw.translation === 'string' ? raw.translation.trim() : ''
    if (translation === '') throw new Error('模型没有返回句子翻译')
    return { kind, translation }
  }
  const ipa = typeof raw.ipa === 'string' ? raw.ipa.trim() : ''
  const list = Array.isArray(raw.meanings) ? raw.meanings : []
  const meanings = list
    .filter((item) => isRecord(item) && typeof item.zh === 'string' && item.zh.trim() !== '')
    .map((item) => ({ pos: typeof item.pos === 'string' ? item.pos.trim() : '', zh: item.zh.trim() }))
    .slice(0, 3)
  if (meanings.length === 0) throw new Error('模型没有返回释义')
  const family = []
  if (Array.isArray(raw.family)) {
    for (const item of raw.family) {
      if (!isRecord(item)) continue
      const form = typeof item.form === 'string' ? item.form.trim() : ''
      if (form === '') continue
      if (family.some((existing) => existing.form.toLowerCase() === form.toLowerCase())) continue
      family.push({ label: typeof item.label === 'string' ? item.label.trim() : '', form })
      if (family.length >= 8) break
    }
  }
  let etymology
  if (isRecord(raw.etymology)) {
    const parts = Array.isArray(raw.etymology.parts)
      ? raw.etymology.parts
        .filter((part) => isRecord(part) && typeof part.part === 'string' && part.part.trim() !== '')
        .map((part) => ({ part: part.part.trim(), meaning: typeof part.meaning === 'string' ? part.meaning.trim() : '' }))
        .slice(0, 6)
      : []
    const candidate = {
      language: typeof raw.etymology.language === 'string' ? raw.etymology.language.trim() : '',
      parts,
      explanation: typeof raw.etymology.explanation === 'string' ? raw.etymology.explanation.trim() : '',
    }
    if (candidate.language !== '' || parts.length > 0 || candidate.explanation !== '') etymology = candidate
  }
  return {
    kind,
    ipa,
    meanings,
    sentenceZh: '',
    family,
    etymology,
  }
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = Math.floor(total % 60)
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

function speakerLabel(transcript, id) {
  const match = transcript.speakers?.find((speaker) => speaker.id === String(id))
  return match?.label ?? `Speaker ${String(id)}`
}

function stripHtml(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote|pre|table|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
}

function stripMarkdown(text) {
  return String(text)
    .replace(/^```.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '')
}

const TEX_SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼', propto: '∝', equiv: '≡', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', oint: '∮', sqrt: '√', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', angle: '∠', degree: '°', circ: '°', percent: '%', ldots: '…', cdots: '…', dots: '…', textendash: '–', textemdash: '—', quad: ' ', qquad: ' ',
}

function stripTex(text) {
  let value = String(text)
  value = value.replace(/(^|[^\\])%.*$/gm, '$1')
  // Preamble/definition lines carry no prose.
  value = value.replace(/^[ \t]*\\(documentclass|documentstyle|usepackage|bibliographystyle|setlength|addtolength|setcounter|linespread|newcommand|renewcommand|providecommand|def|DeclareMathOperator|newtheorem|titleformat|hypersetup|geometry|graphicspath|definecolor|pagestyle|thispagestyle|maketitle)\b.*$/gm, '')
  // Non-prose environments disappear entirely.
  value = value.replace(/\\begin\{(algorithm\*?|algorithmic|table\*?|figure\*?|tikzpicture|longtable)\}[\s\S]*?\\end\{\1\}/g, '\n')
  // Display-math environments carry no `$` delimiters; keep them as $$…$$ blocks.
  value = value.replace(/\\begin\{(equation\*?|displaymath|align\*?|aligned|gather\*?|multline\*?|eqnarray\*?|array)\}([\s\S]*?)\\end\{\1\}/g, (match, environment, body) => body
    .split(/\\\\/)
    .map((row) => row.replace(/&/g, ' ').replace(/\\label\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim())
    .filter((row) => row !== '')
    .map((row) => `$$${row}$$`)
    .join('\n\n'))
  value = value.replace(/\\begin\{(math)\}([\s\S]*?)\\end\{\1\}/g, (match, environment, body) => `$${body.replace(/\s+/g, ' ').trim()}$`)
  value = value.replace(/\\(begin|end)\{[^}]*\}/g, '\n')
  // Structural commands whose arguments are not prose.
  value = value.replace(/\\(label|ref|eqref|pageref|cite|citep|citet|nocite)(\[[^\]]*\])?\{[^{}]*\}/g, '')
  value = value.replace(/\\(vspace|hspace|vskip|hskip)(\[[^\]]*\])?\{[^{}]*\}/g, '')
  // Keep math spans intact for the client-side formula renderer.
  const maths = []
  value = value.replace(/\$\$([\s\S]*?)\$\$|\$([^$]*?)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g, (match, display, inline, bracket, paren) => {
    const rawBody = display ?? inline ?? bracket ?? paren ?? ''
    const body = rawBody.replace(/\s+/g, ' ').trim()
    const isDisplay = display !== undefined || bracket !== undefined
    maths.push({ body, isDisplay })
    return `\u0001M${maths.length - 1}\u0001`
  })
  value = value.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
  value = value.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
  value = value.replace(/\\\\(?=\s|$)/g, '\n')
  value = value.replace(/\\([a-zA-Z]+)(\[[^\]]*\])?/g, (match, name) => TEX_SYMBOLS[name] ?? '')
  value = value.replace(/\\[\\&%$#_{}]/g, (match) => match.slice(1))
  value = value.replace(/\\([@,;:!])/g, ' ')
  value = value.replace(/\\[()[\]]/g, '')
  value = value.replace(/\$\$?/g, '')
  value = value.replace(/~+/g, ' ')
  value = value.replace(/\\\\/g, '\n')
  value = value.replace(/[{}]/g, '')
  value = value.replace(/\u0001M(\d+)\u0001/g, (match, index) => {
    const math = maths[Number(index)]
    if (math === undefined) return ''
    return math.isDisplay ? `$$${math.body}$$` : `$${math.body}$`
  })
  return value
}

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function parsePdfLayout(xml) {
  const pages = []
  const pageRegex = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
  let pageMatch
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const width = Number(pageMatch[1])
    const height = Number(pageMatch[2])
    const words = []
    const wordRegex = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g
    let wordMatch
    while ((wordMatch = wordRegex.exec(pageMatch[3])) !== null) {
      const text = decodeXmlEntities(wordMatch[5]).trim()
      if (text === '') continue
      const x = Number(wordMatch[1])
      const y = Number(wordMatch[2])
      words.push({ t: text, x, y, w: Number(wordMatch[3]) - x, h: Number(wordMatch[4]) - y })
    }
    pages.push({ width, height, words })
  }
  return pages
}

function groupPdfLines(words) {
  const lines = []
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const word of sorted) {
    const last = lines[lines.length - 1]
    if (last !== undefined && Math.abs(last.y - word.y) <= 3) {
      last.words.push(word)
      last.text = `${last.text} ${word.t}`.trim()
      last.y = Math.min(last.y, word.y)
    } else {
      lines.push({ y: word.y, text: word.t, words: [word] })
    }
  }
  return lines
}

/** Turn plain text into reader paragraphs (blank lines first, then single lines for line-based files). */
function paragraphsFromText(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (normalized === '') return []
  let blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  if (blocks.length === 1) {
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 3) blocks = lines
  }
  const segments = []
  for (const block of blocks) {
    const value = block.replace(/[ \t]+/g, ' ').trim()
    if (value === '') continue
    segments.push({ i: segments.length, start: 0, end: 0, speaker: '0', text: value })
    if (segments.length >= 5000) break
  }
  return segments
}

/** Merge consecutive segments of one speaker into readable paragraphs. */
function mergeSegments(segments, maxGapMs) {
  const gap = Number.isFinite(Number(maxGapMs)) ? Math.max(0, Number(maxGapMs)) : 4000
  const merged = []
  for (const segment of segments) {
    const text = String(segment.text ?? '').trim()
    if (text === '') continue
    const last = merged[merged.length - 1]
    if (last !== undefined
      && last.speaker === segment.speaker
      && segment.start - last.end <= gap
      && last.text.length + text.length <= 1600) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, ' ').trim()
      last.end = Math.max(last.end, segment.end)
      continue
    }
    merged.push({ ...segment, text })
  }
  return merged
}

/** Render the vocabulary as a readable Markdown document for the agent and the user. */
function vocabularyMarkdown(data) {
  const words = Array.isArray(data.words) ? data.words : []
  const wordEntries = words.filter((entry) => entry.kind === 'word')
  const sentenceEntries = words.filter((entry) => entry.kind === 'sentence')
  const lines = ['# 英语生词本', '', `共 ${words.length} 条（单词 ${wordEntries.length}，句子 ${sentenceEntries.length}）`, '']
  lines.push('## 单词', '')
  for (const entry of wordEntries) {
    const head = entry.ipa ? `### ${entry.word} ${entry.ipa}` : `### ${entry.word}`
    lines.push(head)
    for (const meaning of entry.meanings ?? []) {
      lines.push(`- ${meaning.pos ? `${meaning.pos} ` : ''}${meaning.zh}`)
    }
    if (Array.isArray(entry.family) && entry.family.length > 0) {
      lines.push(`- 词形：${entry.family.map((item) => `${item.label ? `${item.label} ` : ''}${item.form}`).join('；')}`)
    }
    if (entry.etymology && (entry.etymology.explanation || (Array.isArray(entry.etymology.parts) && entry.etymology.parts.length > 0))) {
      const parts = Array.isArray(entry.etymology.parts)
        ? entry.etymology.parts.map((part) => `${part.part}${part.meaning ? `（${part.meaning}）` : ''}`).join(' + ')
        : ''
      lines.push(`- 词源：${[entry.etymology.language, parts].filter(Boolean).join(' · ')}`)
      if (entry.etymology.explanation) lines.push(`  - ${entry.etymology.explanation}`)
    }
    if (entry.sentence) lines.push(`- 例句：${entry.sentence}`)
    if (entry.sentenceZh) lines.push(`- 例句翻译：${entry.sentenceZh}`)
    if (entry.source?.title) lines.push(`- 来源：${entry.source.title}${entry.source.speaker ? ` · Speaker ${entry.source.speaker}` : ''}${entry.source.startMs ? ` · ${formatClock(entry.source.startMs)}` : ''}`)
    if (entry.status === 'pending') lines.push('- 状态：待补全')
    lines.push('')
  }
  lines.push('## 句子', '')
  for (const entry of sentenceEntries) {
    lines.push(`- ${entry.text}`)
    if (entry.translation) lines.push(`  - 翻译：${entry.translation}`)
    if (entry.source?.title) lines.push(`  - 来源：${entry.source.title}${entry.source.speaker ? ` · Speaker ${entry.source.speaker}` : ''}${entry.source.startMs ? ` · ${formatClock(entry.source.startMs)}` : ''}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function apply(ctx) {
  /** Running ASR jobs of this plugin instance. */
  const jobs = new Map()
  /** Per-workspace mutation queue. */
  const queues = new Map()
  /** Per-workspace config cache (mtime-free, short TTL). */
  const configCache = new Map()

  function serialize(root, task) {
    const previous = queues.get(root) ?? Promise.resolve()
    const next = previous.then(task, task)
    queues.set(root, next.catch(() => undefined))
    return next
  }

  async function workspaceOf(agent, signal) {
    if (!agent) throw new Error('此操作需要一个会话（agent）上下文')
    const directory = await ctx.workingDirectory.ensure(agent, signal)
    if (typeof directory !== 'string' || directory === '') throw new Error('无法解析会话工作区')
    return directory
  }

  async function loadConfig(root) {
    const cached = configCache.get(root)
    const now = Date.now()
    if (cached !== undefined && now - cached.at < 2000) return cached.value
    let raw = {}
    try {
      raw = JSON.parse(await readFile(join(root, CONFIG_REL), 'utf8'))
    } catch {
      raw = {}
    }
    const value = deepMerge(DEFAULT_CONFIG, isRecord(raw) ? raw : {})
    configCache.set(root, { at: now, value })
    return value
  }

  async function ensureDirs(root, config) {
    const recordings = resolveInWorkspace(root, config.dirs.recordings)
    const transcripts = resolveInWorkspace(root, config.dirs.transcripts)
    await mkdir(recordings, { recursive: true })
    await mkdir(transcripts, { recursive: true })
    await mkdir(join(transcripts, '.jobs'), { recursive: true })
    await mkdir(join(root, dirname(VOCAB_REL)), { recursive: true })
    await mkdir(join(root, '.dsh-english'), { recursive: true })
    return { recordings, transcripts, jobs: join(transcripts, '.jobs') }
  }

  async function atomicWrite(path, text) {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, path)
  }

  async function readJson(path, fallback) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return fallback
    }
  }

  async function readVocab(root) {
    const data = await readJson(join(root, VOCAB_REL), { version: 1, words: [] })
    if (!isRecord(data) || !Array.isArray(data.words)) return { version: 1, words: [] }
    return { version: 1, words: data.words.filter(isRecord) }
  }

  async function writeVocab(root, data) {
    await atomicWrite(join(root, VOCAB_REL), JSON.stringify(data, null, 2) + '\n')
    await atomicWrite(join(root, VOCAB_MD_REL), vocabularyMarkdown(data))
  }

  async function readCache(root) {
    const data = await readJson(join(root, CACHE_REL), { entries: {} })
    if (!isRecord(data) || !isRecord(data.entries)) return { entries: {} }
    return data
  }

  async function writeCache(root, data, key, value) {
    data.entries[key] = { ...value, version: LOOKUP_VERSION, at: new Date().toISOString() }
    const keys = Object.keys(data.entries)
    if (keys.length > CACHE_LIMIT) {
      keys.sort((a, b) => String(data.entries[a].at).localeCompare(String(data.entries[b].at)))
      for (const stale of keys.slice(0, keys.length - CACHE_LIMIT)) delete data.entries[stale]
    }
    await atomicWrite(join(root, CACHE_REL), JSON.stringify(data, null, 2) + '\n')
  }

  async function lookupView(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const kind = input?.kind === 'sentence' ? 'sentence' : 'word'
    const text = String(input?.text ?? '').trim()
    if (text === '') throw new Error('没有选中任何文字')
    if (text.length > MAX_TEXT) throw new Error('选中的文字太长，请选择单词或一句话')
    if (kind === 'word' && text.length > MAX_WORD) throw new Error('选中的文字太长，请选择单词或短语')
    const rawSentence = String(input?.sentence ?? '').trim()
    const sentence = rawSentence.length > 500 ? `${rawSentence.slice(0, 500).replace(/\s+\S*$/, '')}…` : rawSentence
    const config = await loadConfig(root)
    const backend = config.lookup.backend
    if (backend === 'off') return { ok: false, kind, text, code: 'lookup-off', message: '查词后端已关闭' }

    if (kind === 'sentence') {
      try {
        const result = await translateSentence(root, config, text, signal)
        return { ok: true, cached: result.cached, kind, text, translation: result.translation }
      } catch (error) {
        return { ok: false, kind, text, code: 'lookup-failed', message: messageOf(error) }
      }
    }

    const cacheKey = `w:${text.toLowerCase()}`
    const cache = await readCache(root)
    const cached = cache.entries[cacheKey]
    let value
    let cachedHit = false
    if (isRecord(cached) && cached.version === LOOKUP_VERSION && Array.isArray(cached.meanings)) {
      value = {
        kind: 'word',
        ipa: typeof cached.ipa === 'string' ? cached.ipa : '',
        meanings: cached.meanings,
        family: Array.isArray(cached.family) ? cached.family : [],
        etymology: cached.etymology,
      }
      cachedHit = true
    } else {
      const prompt = buildLookupPrompt('word', text, '')
      const request = () => (backend === 'bl'
        ? lookupViaBl(root, config, prompt, signal)
        : lookupViaDs(config, prompt, signal))
      let raw
      try {
        raw = await request()
      } catch (error) {
        return { ok: false, kind, text, code: 'lookup-failed', message: messageOf(error) }
      }
      try {
        value = normalizeLookup('word', raw)
      } catch (error) {
        return { ok: false, kind, text, code: 'lookup-invalid', message: messageOf(error) }
      }
      await writeCache(root, cache, cacheKey, { ...value, sentenceZh: '' })
    }

    return { ok: true, cached: cachedHit, kind, text, ...value }
  }

  async function translateSentence(root, config, sentence, signal) {
    const text = String(sentence ?? '').trim()
    if (text === '') throw new Error('句子为空')
    const key = `s:${sha1(text)}`
    const cache = await readCache(root)
    const cached = cache.entries[key]
    if (isRecord(cached) && cached.version === LOOKUP_VERSION && typeof cached.translation === 'string') {
      return { translation: cached.translation, cached: true }
    }
    const prompt = buildLookupPrompt('sentence', text, '')
    const raw = config.lookup.backend === 'bl'
      ? await lookupViaBl(root, config, prompt, signal)
      : await lookupViaDs(config, prompt, signal)
    const value = normalizeLookup('sentence', raw)
    await writeCache(root, cache, key, value)
    return { translation: value.translation, cached: false }
  }

  async function lookupViaDs(config, prompt, signal) {
    const llm = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    if (llm === undefined || defaultModel === undefined) throw new Error('当前没有可用的 DSH 模型，已不能查词')
    const selection = defaultModel.currentSelection()
    const provider = config.lookup.provider || selection?.provider
    const model = config.lookup.model || selection?.model
    if (!provider || !model) throw new Error('没有配置默认模型')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('查词超时')), Math.max(1000, Number(config.lookup.timeoutMs) || 20000))
    const onAbort = () => controller.abort(signal?.reason)
    if (signal !== undefined) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    let text = ''
    let finishKind = ''
    const options = {
      provider,
      model,
      system: LOOKUP_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      temperature: 0.2,
      maxTokens: 3000,
      signal: controller.signal,
    }
    try {
      let stream
      if (typeof llm.prepareCall === 'function') {
        try {
          const prepared = await llm.prepareCall({ provider, model }, controller.signal, (controls, info) => {
            const least = info?.reasoning?.efforts?.[0]
            return least === undefined ? controls : { ...controls, reasoningEffort: least.id }
          })
          stream = prepared.stream(options)
        } catch {
          stream = llm.stream(options)
        }
      } else {
        stream = llm.stream(options)
      }
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') {
          finishKind = chunk.reason.kind
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            throw new Error(chunk.reason.failure?.message ?? '模型请求失败')
          }
        }
      }
    } finally {
      clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    }
    try {
      return parseJsonObject(text)
    } catch (error) {
      if (finishKind === 'max-tokens') throw new Error('模型输出被截断，请重试')
      throw error
    }
  }

  async function lookupViaBl(root, config, prompt, signal) {
    const args = ['text', 'chat', '--output', 'json', '--enable-search', 'false', '--temperature', '0.2', '--system', LOOKUP_SYSTEM, '--message', prompt]
    if (config.lookup.model) args.splice(2, 0, '--model', config.lookup.model)
    const result = await runCommand(config.blPath, args, root, signal, Number(config.lookup.timeoutMs) || 15000)
    const document = JSON.parse(result.stdout)
    return parseJsonObject(extractCliText(document))
  }

  function runCommand(command, args, cwd, signal, timeoutMs, onChild) {
    const attempt = (executable) => new Promise((resolvePromise, reject) => {
      let settled = false
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer)
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      }
      const finish = (error, value) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolvePromise(value)
      }
      let stdout = ''
      let stderr = ''
      const child = spawn(executable, args, {
        cwd,
        windowsHide: true,
        env: {
          ...process.env,
          BAILIAN_CALLER_TYPE: 'script',
          BAILIAN_CALLER_NAME: 'dsh',
        },
      })
      onChild?.(child)
      const timer = timeoutMs > 0 ? setTimeout(() => {
        try { child.kill() } catch { /* already gone */ }
        finish(new Error(`命令超时（${Math.round(timeoutMs / 1000)}s）`))
      }, timeoutMs) : undefined
      const onAbort = () => {
        try { child.kill() } catch { /* already gone */ }
        finish(new Error('已取消'))
      }
      if (signal !== undefined) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      child.stdout?.on('data', (chunk) => {
        stdout = (stdout + chunk.toString()).slice(-131072)
      })
      child.stderr?.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-65536)
      })
      child.on('error', (error) => {
        if (error?.code === 'ENOENT') {
          const missing = new Error(`找不到可执行文件 ${executable}`)
          missing.notFound = true
          finish(missing)
          return
        }
        finish(error)
      })
      child.on('close', (code) => {
        if (code === 0) finish(undefined, { stdout, stderr })
        else finish(new Error(`命令失败（exit ${code}）：${stderr.trim().slice(-600) || stdout.trim().slice(-600) || 'no output'}`))
      })
    })
    return attempt(command).catch((error) => {
      if (error?.notFound && process.platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(command)) return attempt(`${command}.exe`)
      throw error
    })
  }

  function jobPath(root, config, jobId) {
    return join(resolveInWorkspace(root, config.dirs.transcripts), '.jobs', `${jobId}.json`)
  }

  async function writeJob(root, config, jobId, state) {
    await atomicWrite(jobPath(root, config, jobId), JSON.stringify(state, null, 2) + '\n')
  }

  async function startTranscription(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const dirs = await ensureDirs(root, config)
    const audioPath = resolveAnyPath(root, input?.audio)
    const extension = extname(audioPath).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension)) throw new Error(`不是支持的音频文件：${extension || basename(audioPath)}`)
    const audioStat = await stat(audioPath).catch(() => undefined)
    if (audioStat === undefined || !audioStat.isFile()) throw new Error(`找不到音频文件：${input?.audio}`)
    const baseName = uniqueName(basename(audioPath, extension)).replace(/[^\p{L}\p{N}_-]+/gu, '-')
    const transcriptsDir = resolveInWorkspace(root, config.dirs.transcripts)
    let stem = baseName
    let suffix = 2
    while (true) {
      try {
        await readFile(join(transcriptsDir, `${stem}.json`))
        stem = `${baseName}-${suffix++}`
      } catch {
        break
      }
    }
    const jobId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
    const relativeAudio = within(root, audioPath) ? normalizedPath(relative(root, audioPath)) : audioPath
    const state = {
      jobId,
      state: 'queued',
      audio: relativeAudio,
      transcript: `${config.dirs.transcripts}/${stem}.json`,
      model: input?.model || config.asr.model,
      fallbackModel: config.asr.fallbackModel,
      speakers: input?.speakers ?? null,
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      warnings: [],
    }
    await writeJob(root, config, jobId, state)
    const job = {
      id: jobId,
      root,
      config,
      state,
      rawPath: join(dirs.jobs, `${jobId}.raw.json`),
      transcriptPath: join(transcriptsDir, `${stem}.json`),
      child: undefined,
      heartbeat: undefined,
      waiters: [],
      settled: false,
    }
    jobs.set(jobId, job)
    void executeJob(job, {
      audioPath,
      language: input?.language || config.asr.language,
      speakers: input?.speakers,
      model: input?.model || config.asr.model,
    })
    return { jobId, transcript: state.transcript }
  }

  async function executeJob(job, request) {
    const config = job.config
    const maxMinutes = Math.max(1, Number(config.asr.maxJobMinutes) || 30)
    const deadline = Date.now() + maxMinutes * 60 * 1000
    job.state = { ...job.state, state: 'running', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }
    await writeJob(job.root, config, job.id, job.state).catch(() => undefined)
    job.heartbeat = setInterval(() => {
      job.state = { ...job.state, heartbeatAt: new Date().toISOString() }
      void writeJob(job.root, config, job.id, job.state).catch(() => undefined)
    }, 15000)
    const warnings = []
    let usedModel = request.model
    try {
      const run = (model) => {
        const args = [
          'speech', 'recognize',
          '--url', request.audioPath,
          '--model', model,
          '--language', request.language,
          '--diarization',
          '--out', job.rawPath,
          '--poll-interval', String(Number(config.asr.pollIntervalSeconds) || 2),
        ]
        if (Number.isFinite(Number(request.speakers)) && Number(request.speakers) > 0) {
          args.push('--speaker-count', String(Math.round(Number(request.speakers))))
        }
        return runCommand(config.blPath, args, job.root, undefined, Math.max(1000, deadline - Date.now()), (child) => {
          job.child = child
        })
      }
      try {
        await run(usedModel)
      } catch (error) {
        if (config.asr.fallbackModel && usedModel !== config.asr.fallbackModel) {
          warnings.push(`模型 ${usedModel} 失败，已回退 ${config.asr.fallbackModel}`)
          usedModel = config.asr.fallbackModel
          await run(usedModel)
        } else {
          throw error
        }
      }
      const raw = JSON.parse(await readFile(job.rawPath, 'utf8'))
      const transcript = normalizeTranscript(raw, {
        audio: job.state.audio,
        model: usedModel,
        warnings,
        mergeGapMs: config.asr.mergeGapMs,
      })
      await atomicWrite(job.transcriptPath, JSON.stringify(transcript, null, 2) + '\n')
      job.state = {
        ...job.state,
        state: 'done',
        model: usedModel,
        warnings,
        finishedAt: new Date().toISOString(),
        segments: transcript.segments.length,
        speakers: transcript.speakers.length,
        durationMs: transcript.durationMs,
      }
    } catch (error) {
      job.state = {
        ...job.state,
        state: 'failed',
        model: usedModel,
        warnings,
        finishedAt: new Date().toISOString(),
        error: messageOf(error),
      }
    } finally {
      if (job.heartbeat !== undefined) clearInterval(job.heartbeat)
      job.heartbeat = undefined
      job.child = undefined
      await writeJob(job.root, config, job.id, job.state).catch(() => undefined)
      job.settled = true
      for (const waiter of job.waiters.splice(0)) waiter(job.state)
    }
  }

  function waitJob(job, signal) {
    if (job.settled) return Promise.resolve(job.state)
    return new Promise((resolvePromise, reject) => {
      const waiter = (state) => {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        resolvePromise(state)
      }
      const onAbort = () => {
        const index = job.waiters.indexOf(waiter)
        if (index >= 0) job.waiters.splice(index, 1)
        reject(new Error('已取消等待（转写仍在后台继续）'))
      }
      job.waiters.push(waiter)
      if (signal !== undefined) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  async function jobStatus(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const jobId = String(input?.id ?? input?.jobId ?? '').trim()
    if (jobId === '') throw new Error('缺少任务 id')
    const live = jobs.get(jobId)
    if (live !== undefined) return live.state
    const stored = await readJson(jobPath(root, config, jobId), undefined)
    if (!isRecord(stored)) return { jobId, state: 'missing' }
    if (stored.state === 'running' || stored.state === 'queued') {
      const age = Date.now() - Date.parse(String(stored.heartbeatAt ?? stored.startedAt ?? ''))
      if (!Number.isFinite(age) || age > 60000) {
        const interrupted = {
          ...stored,
          state: 'failed',
          error: '转写进程已中断（DSH 重启或任务超时），请重新转写',
          finishedAt: new Date().toISOString(),
        }
        await writeJob(root, config, jobId, interrupted).catch(() => undefined)
        return interrupted
      }
    }
    return stored
  }

  async function listTranscripts(agent, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const directory = resolveInWorkspace(root, config.dirs.transcripts)
    let entries = []
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
      .reverse()
    const transcripts = []
    for (const file of files) {
      const document = await readJson(join(directory, file), undefined)
      if (!isRecord(document) || !Array.isArray(document.segments)) continue
      transcripts.push({
        file,
        title: basename(file, '.json'),
        audio: document.audio ?? '',
        createdAt: document.createdAt ?? '',
        durationMs: document.durationMs ?? 0,
        speakers: Array.isArray(document.speakers) ? document.speakers : [],
        segments: document.segments.length,
        model: document.model ?? '',
      })
    }
    transcripts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return transcripts
  }

  async function listRecordings(agent, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const directory = resolveInWorkspace(root, config.dirs.recordings)
    let entries = []
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
    return entries
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, path: `${config.dirs.recordings}/${entry.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function normalizeEntry(kind, entry) {
    if (kind === 'sentence') {
      const text = String(entry?.text ?? entry?.sentence ?? '').trim()
      if (text === '') throw new Error('句子为空')
      if (text.length > MAX_TEXT) throw new Error('句子太长')
      return {
        kind,
        text,
        normalized: sha1(text),
        translation: String(entry?.translation ?? '').trim(),
        status: entry?.status === 'pending' || entry?.translation === '' ? 'pending' : 'done',
      }
    }
    const word = String(entry?.word ?? entry?.text ?? '').trim()
    if (word === '') throw new Error('单词为空')
    if (word.length > MAX_WORD) throw new Error('单词太长')
    const ipa = String(entry?.ipa ?? '').trim()
    const meanings = Array.isArray(entry?.meanings)
      ? entry.meanings.filter((item) => isRecord(item) && typeof item.zh === 'string').map((item) => ({
          pos: String(item.pos ?? '').trim(),
          zh: item.zh.trim(),
        }))
      : []
    const family = Array.isArray(entry?.family)
      ? entry.family
        .filter((item) => isRecord(item) && typeof item.form === 'string' && item.form.trim() !== '')
        .map((item) => ({ label: String(item.label ?? '').trim(), form: item.form.trim() }))
        .slice(0, 8)
      : []
    let etymology
    if (isRecord(entry?.etymology)) {
      const parts = Array.isArray(entry.etymology.parts)
        ? entry.etymology.parts
          .filter((part) => isRecord(part) && typeof part.part === 'string' && part.part.trim() !== '')
          .map((part) => ({ part: part.part.trim(), meaning: String(part.meaning ?? '').trim() }))
          .slice(0, 6)
        : []
      const candidate = {
        language: String(entry.etymology.language ?? '').trim(),
        parts,
        explanation: String(entry.etymology.explanation ?? '').trim(),
      }
      if (candidate.language !== '' || parts.length > 0 || candidate.explanation !== '') etymology = candidate
    }
    return {
      kind,
      word,
      normalized: word.toLowerCase(),
      ipa,
      meanings,
      family,
      etymology,
      sentence: String(entry?.sentence ?? '').trim(),
      sentenceZh: String(entry?.sentenceZh ?? '').trim(),
      status: entry?.status === 'pending' || (ipa === '' && meanings.length === 0) ? 'pending' : 'done',
    }
  }

  function cleanSource(source) {
    if (!isRecord(source)) return {}
    const start = Number(source.startMs)
    return {
      transcript: String(source.transcript ?? '').trim(),
      title: String(source.title ?? '').trim(),
      speaker: String(source.speaker ?? '').trim(),
      startMs: Number.isFinite(start) && start >= 0 ? Math.round(start) : 0,
    }
  }

  async function vocabAdd(agent, entry, signal) {
    const root = await workspaceOf(agent, signal)
    const kind = entry?.kind === 'sentence' ? 'sentence' : 'word'
    return serialize(root, async () => {
      const data = await readVocab(root)
      const normalized = normalizeEntry(kind, entry)
      if (kind === 'word' && normalized.sentence !== '' && normalized.sentenceZh === '') {
        try {
          const config = await loadConfig(root)
          const translated = await translateSentence(root, config, normalized.sentence, signal)
          normalized.sentenceZh = translated.translation
        } catch {
          normalized.sentenceZh = ''
        }
      }
      const duplicate = data.words.find((item) => item.kind === normalized.kind && item.normalized === normalized.normalized)
      if (duplicate !== undefined) return { duplicate: true, id: duplicate.id, entry: duplicate }
      const now = new Date().toISOString()
      const item = {
        id: randomUUID(),
        ...normalized,
        source: cleanSource(entry?.source),
        createdAt: now,
        updatedAt: now,
      }
      data.words.unshift(item)
      await writeVocab(root, data)
      return { duplicate: false, id: item.id, entry: item }
    })
  }

  async function vocabUpdate(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const entries = Array.isArray(input?.entries) ? input.entries : isRecord(input?.entry) ? [input.entry] : []
    if (entries.length === 0) throw new Error('没有要更新的词条')
    return serialize(root, async () => {
      const data = await readVocab(root)
      const updated = []
      for (const patch of entries) {
        if (!isRecord(patch) || typeof patch.id !== 'string') continue
        const target = data.words.find((item) => item.id === patch.id)
        if (target === undefined) continue
        if (typeof patch.ipa === 'string') target.ipa = patch.ipa.trim()
        if (Array.isArray(patch.meanings)) {
          target.meanings = patch.meanings
            .filter((item) => isRecord(item) && typeof item.zh === 'string' && item.zh.trim() !== '')
            .map((item) => ({ pos: String(item.pos ?? '').trim(), zh: item.zh.trim() }))
        }
        if (typeof patch.sentenceZh === 'string') target.sentenceZh = patch.sentenceZh.trim()
        if (typeof patch.translation === 'string') target.translation = patch.translation.trim()
        if (Array.isArray(patch.family)) {
          target.family = patch.family
            .filter((item) => isRecord(item) && typeof item.form === 'string' && item.form.trim() !== '')
            .map((item) => ({ label: String(item.label ?? '').trim(), form: item.form.trim() }))
            .slice(0, 8)
        }
        if (isRecord(patch.etymology)) {
          const parts = Array.isArray(patch.etymology.parts)
            ? patch.etymology.parts
              .filter((part) => isRecord(part) && typeof part.part === 'string' && part.part.trim() !== '')
              .map((part) => ({ part: part.part.trim(), meaning: String(part.meaning ?? '').trim() }))
              .slice(0, 6)
            : []
          const candidate = {
            language: String(patch.etymology.language ?? '').trim(),
            parts,
            explanation: String(patch.etymology.explanation ?? '').trim(),
          }
          target.etymology = candidate.language !== '' || parts.length > 0 || candidate.explanation !== '' ? candidate : undefined
        }
        target.status = patch.status === 'pending' ? 'pending' : (target.kind === 'sentence' ? (target.translation ? 'done' : 'pending') : (target.ipa === '' && target.meanings.length === 0 ? 'pending' : 'done'))
        target.updatedAt = new Date().toISOString()
        updated.push(target)
      }
      await writeVocab(root, data)
      return { updated: updated.length, entries: updated }
    })
  }

  async function enrichVocabEntry(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const id = String(input?.id ?? '').trim()
    if (id === '') throw new Error('缺少词条 id')
    const data = await readVocab(root)
    const target = data.words.find((item) => item.id === id)
    if (target === undefined) throw new Error('词条不存在')
    if (target.kind === 'sentence') throw new Error('句子条目没有词形/词源')
    // Word forms and etymology do not need the podcast sentence; a short prompt avoids
    // output truncation and keeps the entry's existing example translation intact.
    const result = await lookupView(agent, { kind: 'word', text: target.word, sentence: '' }, signal)
    if (!result.ok) throw new Error(result.message ?? '查词失败')
    return serialize(root, async () => {
      const latest = await readVocab(root)
      const entry = latest.words.find((item) => item.id === id)
      if (entry === undefined) throw new Error('词条不存在')
      const hasIpa = typeof entry.ipa === 'string' && entry.ipa !== ''
      const hasMeanings = Array.isArray(entry.meanings) && entry.meanings.length > 0
      if (!hasIpa && typeof result.ipa === 'string' && result.ipa !== '') entry.ipa = result.ipa
      if (!hasMeanings && Array.isArray(result.meanings) && result.meanings.length > 0) entry.meanings = result.meanings
      if (Array.isArray(result.family)) entry.family = result.family
      if (result.etymology !== undefined) entry.etymology = result.etymology
      entry.status = entry.ipa === '' && (Array.isArray(entry.meanings) ? entry.meanings.length === 0 : true) ? 'pending' : 'done'
      entry.updatedAt = new Date().toISOString()
      await writeVocab(root, latest)
      return { id, entry }
    })
  }

  async function vocabRemove(agent, input, signal) {    const root = await workspaceOf(agent, signal)
    const ids = Array.isArray(input?.ids) ? input.ids.map((id) => String(id)) : []
    if (ids.length === 0) throw new Error('没有要删除的词条')
    return serialize(root, async () => {
      const data = await readVocab(root)
      const before = data.words.length
      data.words = data.words.filter((item) => !ids.includes(item.id))
      await writeVocab(root, data)
      return { removed: before - data.words.length }
    })
  }

  async function vocabList(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const data = await readVocab(root)
    const status = String(input?.status ?? 'pending')
    const query = String(input?.query ?? '').trim().toLowerCase()
    const rows = data.words.filter((item) => {
      if (status === 'pending' && item.status !== 'pending') return false
      if (status === 'done' && item.status !== 'done') return false
      if (query !== '') {
        const haystack = [item.word, item.text, item.sentence, item.translation, ...(item.meanings ?? []).map((meaning) => meaning.zh)]
          .filter((value) => typeof value === 'string')
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
    return {
      total: data.words.length,
      pending: data.words.filter((item) => item.status === 'pending').length,
      words: data.words.filter((item) => item.kind === 'word').length,
      sentences: data.words.filter((item) => item.kind === 'sentence').length,
      entries: rows,
    }
  }

  async function vocabExport(agent, signal) {
    const root = await workspaceOf(agent, signal)
    const data = await readVocab(root)
    await atomicWrite(join(root, VOCAB_MD_REL), vocabularyMarkdown(data))
    return { path: VOCAB_MD_REL }
  }

  ctx.tools.register({
    name: 'english_transcribe',
    description:
      'Transcribe a podcast recording with speaker diarization via the Bailian `bl speech recognize` CLI, ' +
      'then store the normalized transcript in the current workspace under transcripts/. Wait for the job to finish and return the file name together with segment and speaker counts.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        audio: {
          type: 'string',
          description: 'Audio path: relative to the session workspace (e.g. recordings/ep12.m4a) or absolute.',
        },
        speakers: {
          type: 'integer',
          description: 'Expected number of speakers (optional; requires diarization, which is always on).',
        },
        model: {
          type: 'string',
          description: 'ASR model override, for example qwen-audio-3.1-asr-flash-filetrans (the default) or fun-asr.',
        },
        language: {
          type: 'string',
          description: 'Language hint such as en (default) or zh.',
        },
      },
      required: ['audio'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          jobId: { type: 'string' },
          transcript: { type: 'string' },
          segments: { type: 'integer' },
          speakers: { type: 'integer' },
          durationMs: { type: 'integer' },
          model: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
          state: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `转写完成：${value.transcript}（${value.segments} 段，${value.speakers} 位说话人，时长 ${formatClock(value.durationMs)}）${Array.isArray(value.warnings) && value.warnings.length > 0 ? `；注意：${value.warnings.join('；')}` : ''}`
          : `转写失败：${value.error ?? '未知错误'}（任务 ${value.jobId ?? '-'}）`,
      }],
    },
    timeoutMs: 31 * 60 * 1000,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('english_transcribe 需要一个会话上下文')
      const { jobId } = await startTranscription(exec.agent, args, exec.signal)
      const job = jobs.get(jobId)
      if (job === undefined) throw new Error('转写任务没有启动')
      try {
        const state = await waitJob(job, exec.signal)
        if (state.state === 'done') {
          return {
            ok: true,
            jobId,
            transcript: state.transcript,
            segments: state.segments ?? 0,
            speakers: state.speakers ?? 0,
            durationMs: state.durationMs ?? 0,
            model: state.model ?? '',
            warnings: state.warnings ?? [],
            state: state.state,
          }
        }
        return { ok: false, jobId, transcript: state.transcript, state: state.state, error: state.error ?? '未知错误' }
      } catch (error) {
        return { ok: false, jobId, transcript: jobs.get(jobId)?.state.transcript, state: 'running', error: messageOf(error) }
      }
    },
  })

  ctx.tools.register({
    name: 'english_vocab',
    description:
      'Read and edit the English wordbook in the current workspace (vocab/vocabulary.json). ' +
      'Actions: list (defaults to pending entries), lookup (dictionary lookup: ipa, meanings, example translation, word forms, etymology), ' +
      'add, update (fill ipa/meanings/translation/family/etymology for entries the assistant resolved itself), ' +
      'enrich (re-query one entry by id and merge its word forms and etymology), remove, export (rewrites vocab/生词本.md).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'lookup', 'add', 'update', 'enrich', 'remove', 'export'],
          description: 'What to do.',
        },
        status: { type: 'string', enum: ['pending', 'done', 'all'], description: 'Filter for list.' },
        query: { type: 'string', description: 'Search text for list.' },
        kind: { type: 'string', enum: ['word', 'sentence'], description: 'Entry kind for lookup/add.' },
        text: { type: 'string', description: 'Selected word or sentence for lookup.' },
        sentence: { type: 'string', description: 'Containing sentence for a word lookup.' },
        entry: { type: 'object', additionalProperties: true, description: 'One entry for add.' },
        entries: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Entries for update.' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Entry ids for remove.' },
        id: { type: 'string', description: 'Entry id for enrich.' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          total: { type: 'integer' },
          pending: { type: 'integer' },
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
          path: { type: 'string' },
          duplicate: { type: 'boolean' },
        },
      },
      render: (_args, value) => {
        if (value.ok === false) return [{ type: 'text', text: `生词本操作失败：${value.error ?? '未知错误'}` }]
        if (value.result !== undefined) {
          const result = value.result
          if (!result || result.ok === false) return [{ type: 'text', text: `查词失败：${result?.message ?? '未知错误'}` }]
          if (result.kind === 'sentence') return [{ type: 'text', text: `翻译：${result.translation}` }]
          const meanings = Array.isArray(result.meanings) ? result.meanings.map((meaning) => `${meaning.pos ? `${meaning.pos} ` : ''}${meaning.zh}`).join('\n') : ''
          const forms = Array.isArray(result.family) && result.family.length > 0
            ? `\n词形：${result.family.map((item) => `${item.label ? `${item.label} ` : ''}${item.form}`).join('；')}`
            : ''
          const roots = result.etymology && Array.isArray(result.etymology.parts) && result.etymology.parts.length > 0
            ? `\n词源：${[result.etymology.language, result.etymology.parts.map((part) => `${part.part}${part.meaning ? `（${part.meaning}）` : ''}`).join(' + ')].filter(Boolean).join(' · ')}${result.etymology.explanation ? `\n${result.etymology.explanation}` : ''}`
            : ''
          return [{
            type: 'text',
            text: `${result.text ?? ''} ${result.ipa ?? ''}${result.cached ? '（缓存）' : ''}\n${meanings}${result.sentenceZh ? `\n例句翻译：${result.sentenceZh}` : ''}${forms}${roots}`,
          }]
        }
        if (Array.isArray(value.entries)) {
          const lines = value.entries.slice(0, 20).map((entry) => (entry.kind === 'sentence'
            ? `- [句子] ${entry.text ?? ''}（${entry.status}）`
            : `- [单词] ${entry.word ?? ''} ${entry.ipa ?? ''}（${entry.status}）`))
          return [{
            type: 'text',
            text: `生词本：共 ${value.total ?? 0} 条（单词 ${value.words ?? 0}，句子 ${value.sentences ?? 0}），待补全 ${value.pending ?? 0} 条\n${lines.join('\n')}`,
          }]
        }
        if (value.duplicate !== undefined) return [{ type: 'text', text: value.duplicate ? '该词条已在生词本中。' : '已加入生词本。' }]
        if (value.removed !== undefined) return [{ type: 'text', text: `已删除 ${value.removed} 条。` }]
        if (value.updated !== undefined) return [{ type: 'text', text: `已更新 ${value.updated} 条。` }]
        if (value.path !== undefined) return [{ type: 'text', text: `已导出 ${value.path}。` }]
        return [{
          type: 'text',
          text: `生词本：共 ${value.total ?? 0} 条，待补全 ${value.pending ?? 0} 条。${value.path ? `已导出 ${value.path}。` : ''}`,
        }]
      },
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('english_vocab 需要一个会话上下文')
      try {
        switch (args.action) {
          case 'list': {
            const result = await vocabList(exec.agent, args, exec.signal)
            return { ok: true, ...result }
          }
          case 'lookup': {
            const kind = args.kind === 'sentence' ? 'sentence' : 'word'
            const result = await lookupView(exec.agent, { kind, text: args.text, sentence: args.sentence }, exec.signal)
            return { ok: true, result }
          }
          case 'add': {
            const result = await vocabAdd(exec.agent, { kind: args.kind, ...(args.entry ?? {}) }, exec.signal)
            return { ok: true, ...result, total: (await readVocab(await workspaceOf(exec.agent, exec.signal))).words.length }
          }
          case 'update': {
            const result = await vocabUpdate(exec.agent, { entries: args.entries }, exec.signal)
            return { ok: true, ...result }
          }
          case 'enrich': {
            const result = await enrichVocabEntry(exec.agent, { id: args.id }, exec.signal)
            return { ok: true, ...result }
          }
          case 'remove': {
            const result = await vocabRemove(exec.agent, { ids: args.ids }, exec.signal)
            return { ok: true, ...result }
          }
          case 'export': {
            const result = await vocabExport(exec.agent, exec.signal)
            return { ok: true, ...result }
          }
          default:
            return { ok: false, error: `未知操作：${String(args.action)}` }
        }
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    },
  })

  const API_PATH = '/dsh-english/api'

  function readRequestBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > limit) {
          reject(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  async function dispatchHttp(agent, action, payload) {
    switch (action) {
      case 'transcripts.list': return listTranscripts(agent)
      case 'transcripts.merge': return mergeTranscript(agent, payload)
      case 'transcripts.import': return importTranscript(agent, payload)
      case 'transcripts.delete': return deleteTranscript(agent, payload)
      case 'recordings.list': return listRecordings(agent)
      case 'browse.list': return browseAudio(payload)
      case 'models.list': return modelsList(agent)
      case 'lookup': return lookupView(agent, payload)
      case 'vocab.add': return vocabAdd(agent, payload)
      case 'vocab.enrich': return enrichVocabEntry(agent, payload)
      case 'vocab.remove': return vocabRemove(agent, { ids: payload.ids })
      case 'transcribe': return startTranscription(agent, payload)
      case 'job': return jobStatus(agent, { id: payload.id })
      default: throw new Error(`未知操作：${action}`)
    }
  }

  const ASR_MODELS = [
    'qwen-audio-3.1-asr-flash-filetrans',
    'qwen-audio-3.0-asr-flash-filetrans',
    'fun-asr',
    'paraformer-v2',
  ]

  async function modelsList(agent, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const models = [...new Set([config.asr.model, ...ASR_MODELS])].filter((model) => typeof model === 'string' && model !== '')
    return { defaultModel: config.asr.model, fallbackModel: config.asr.fallbackModel, models }
  }

  async function mergeTranscript(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const file = String(input?.file ?? '').trim()
    if (file === '' || /[\\/]/.test(file)) throw new Error('文稿文件名无效')
    const path = join(resolveInWorkspace(root, config.dirs.transcripts), file)
    const document = await readJson(path, undefined)
    if (!isRecord(document) || !Array.isArray(document.segments)) throw new Error('文稿不存在或格式无效')
    if (document.imported === true) return { file, before: document.segments.length, after: document.segments.length, changed: false }
    const merged = mergeSegments(
      document.segments.map((segment, index) => ({ ...segment, i: index })),
      Number(config.asr.mergeGapMs) || 4000,
    )
    const next = { ...document, segments: merged.map((segment, index) => ({ ...segment, i: index })) }
    if (merged.length !== document.segments.length) {
      await atomicWrite(path, JSON.stringify(next, null, 2) + '\n')
    }
    return { file, before: document.segments.length, after: merged.length, changed: merged.length !== document.segments.length }
  }

  async function importTranscript(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const name = String(input?.name ?? '').trim() || 'imported.txt'
    const extension = extname(name).toLowerCase()
    if (!IMPORT_EXTENSIONS.has(extension)) throw new Error(`不支持的文稿格式：${extension || '(无扩展名)'}`)
    let text = ''
    let pdfDocument
    if (extension === '.pdf') {
      const base64 = String(input?.contentBase64 ?? '').replace(/\s+/g, '')
      if (base64 === '') throw new Error('缺少 PDF 文件内容')
      if (base64.length > 28 * 1024 * 1024) throw new Error('PDF 太大（超过 20MB）')
      const buffer = Buffer.from(base64, 'base64')
      if (buffer.length === 0) throw new Error('PDF 内容无效')
      pdfDocument = await renderPdfPages(root, config, buffer)
    } else {
      const content = String(input?.content ?? '')
      if (content.trim() === '') throw new Error('文稿内容为空')
      if (content.length > 3 * 1024 * 1024) throw new Error('文稿太大（超过 3MB）')
      text = content
      if (extension === '.html' || extension === '.htm') text = stripHtml(text)
      else if (extension === '.md' || extension === '.markdown') text = stripMarkdown(text)
      else if (extension === '.tex') text = stripTex(text)
    }
    const segments = pdfDocument === undefined ? paragraphsFromText(text) : []
    if (pdfDocument === undefined && segments.length === 0) throw new Error('没有解析出任何文本段落')
    const transcriptsDir = resolveInWorkspace(root, config.dirs.transcripts)
    const baseName = (uniqueName(basename(name, extension)).replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'imported')
    let stem = baseName
    let suffix = 2
    while (true) {
      try {
        await readFile(join(transcriptsDir, `${stem}.json`))
        stem = `${baseName}-${suffix++}`
      } catch {
        break
      }
    }
    const document = {
      version: 1,
      audio: '',
      createdAt: new Date().toISOString(),
      model: pdfDocument === undefined ? 'import' : 'pdf',
      imported: true,
      durationMs: 0,
      warnings: [],
      speakers: [],
      segments,
      ...(pdfDocument === undefined ? {} : { pdf: true, pdfId: pdfDocument.id, pdfPath: pdfDocument.pdfPath, pages: pdfDocument.pages }),
    }
    await atomicWrite(join(transcriptsDir, `${stem}.json`), JSON.stringify(document, null, 2) + '\n')
    return { file: `${stem}.json`, segments: segments.length, pages: pdfDocument === undefined ? 0 : pdfDocument.pages.length }
  }

  async function renderPdfPages(root, config, buffer) {
    const id = randomUUID()
    const baseDir = join(root, '.dsh-english', 'pdfs', id)
    await mkdir(baseDir, { recursive: true })
    const pdfPath = join(baseDir, 'source.pdf')
    await writeFile(pdfPath, buffer)
    const pdfToPpm = String(config.import?.pdfToPpmPath ?? 'pdftoppm')
    const pdfToText = String(config.import?.pdfToTextPath ?? 'pdftotext')
    try {
      await runCommand(pdfToPpm, ['-png', '-r', '100', '-l', '120', pdfPath, join(baseDir, 'page')], root, undefined, 180000)
      await runCommand(pdfToText, ['-bbox', pdfPath, join(baseDir, 'words.xml')], root, undefined, 120000)
      const xml = await readFile(join(baseDir, 'words.xml'), 'utf8')
      const layout = parsePdfLayout(xml)
      const entries = await readdir(baseDir)
      const images = entries
        .filter((entry) => /^page-\d+\.png$/.test(entry))
        .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
      const pages = []
      for (let index = 0; index < layout.length && index < images.length; index += 1) {
        const page = layout[index]
        pages.push({
          page: index + 1,
          width: page.width,
          height: page.height,
          image: normalizedPath(relative(root, join(baseDir, images[index]))),
          lines: groupPdfLines(page.words),
        })
      }
      if (pages.length === 0) throw new Error('没有渲染出任何 PDF 页面')
      return { id, pdfPath: normalizedPath(relative(root, pdfPath)), pages }
    } catch (error) {
      await rm(baseDir, { recursive: true, force: true }).catch(() => undefined)
      throw new Error(`PDF 渲染失败：${messageOf(error)}`)
    }
  }

  async function deleteTranscript(agent, input, signal) {
    const root = await workspaceOf(agent, signal)
    const config = await loadConfig(root)
    const file = String(input?.file ?? '').trim()
    if (file === '' || /[\\/]/.test(file)) throw new Error('文稿文件名无效')
    const transcriptsDir = resolveInWorkspace(root, config.dirs.transcripts)
    const path = join(transcriptsDir, file)
    const info = await stat(path).catch(() => undefined)
    if (info === undefined || !info.isFile()) throw new Error('文稿不存在')
    const document = await readJson(path, undefined)
    await unlink(path)
    if (isRecord(document) && typeof document.pdfId === 'string' && document.pdfId !== '') {
      await rm(join(root, '.dsh-english', 'pdfs', document.pdfId), { recursive: true, force: true }).catch(() => undefined)
    }
    // Best effort: drop job records that produced this transcript.
    const target = normalizedPath(relative(root, path))
    try {
      const jobsDir = join(transcriptsDir, '.jobs')
      const entries = await readdir(jobsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.raw.json')) continue
        const job = await readJson(join(jobsDir, entry.name), undefined)
        if (isRecord(job) && normalizedPath(String(job.transcript ?? '')) === target) {
          const jobId = entry.name.replace(/\.json$/, '')
          await unlink(join(jobsDir, entry.name)).catch(() => undefined)
          await unlink(join(jobsDir, `${jobId}.raw.json`)).catch(() => undefined)
        }
      }
    } catch {
      // the jobs directory may not exist; the transcript is already gone
    }
    return { file, deleted: true }
  }

  async function browseAudio(input) {
    const target = String(input?.path ?? '').trim()
    if (target === '') throw new Error('请输入文件夹或音频文件路径')
    if (!isAbsolute(target)) throw new Error('请输入绝对路径，例如 D:\\Podcasts\\ep12.m4a')
    const info = await stat(target).catch(() => undefined)
    if (info === undefined) throw new Error('路径不存在')
    if (info.isFile()) {
      if (!AUDIO_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('这个文件不是支持的音频格式')
      return { kind: 'file', dir: dirname(target), files: [{ name: basename(target), path: target }] }
    }
    if (!info.isDirectory()) throw new Error('这个路径既不是文件夹也不是音频文件')
    const entries = await readdir(target, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, path: join(target, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 500)
    return { kind: 'dir', dir: target, files }
  }

  async function handleHttp(req, res) {
    const send = (status, body) => {
      if (res.headersSent) return
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method !== 'POST') {
        send(405, { ok: false, error: '只支持 POST' })
        return
      }
      const remoteAddress = String(req.socket?.remoteAddress ?? '')
      const loopback = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
      if (!loopback) {
        send(403, { ok: false, error: '只允许本机访问' })
        return
      }
      if (req.headers['x-english-practice'] !== '1') {
        send(403, { ok: false, error: '请求被拒绝' })
        return
      }
      const origin = req.headers.origin
      if (typeof origin === 'string' && origin !== '') {
        let originHostname = ''
        try {
          originHostname = new URL(origin).hostname
        } catch {
          originHostname = ''
        }
        const localOrigin = originHostname === '127.0.0.1' || originHostname === 'localhost' || originHostname === '::1' || originHostname === '[::1]'
        if (!localOrigin) {
          send(403, { ok: false, error: '请求来源被拒绝' })
          return
        }
      }
      const body = JSON.parse(await readRequestBody(req, 32 << 20))
      const sessionId = String(body?.sessionId ?? '')
      const agents = ctx.get('agents')
      let agent = agents?.get(sessionId)
      if (!agent && !sessionId.startsWith('session-') && sessionId !== '') agent = agents?.get(`session-${sessionId}`)
      if (!agent && sessionId.startsWith('session-')) agent = agents?.get(sessionId.slice('session-'.length))
      if (!agent) {
        send(409, { ok: false, error: '会话不在运行中，请刷新页面再试' })
        return
      }
      const action = String(body?.action ?? '')
      const payload = isRecord(body?.payload) ? body.payload : {}
      const value = await dispatchHttp(agent, action, payload)
      send(200, { ok: true, value: value ?? null })
    } catch (error) {
      send(400, { ok: false, error: messageOf(error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler: handleHttp }), 'english-practice: http api')

  ctx.effect(() => () => {
    for (const job of jobs.values()) {
      if (job.heartbeat !== undefined) clearInterval(job.heartbeat)
      try { job.child?.kill() } catch { /* already gone */ }
    }
    jobs.clear()
  }, 'english-practice: jobs')
}

// Kept for readability of the helpers above; exported for tests in a source checkout.
export const internals = {
  normalizeTranscript,
  normalizeLookup,
  extractCliText,
  parseJsonObject,
  mergeSegments,
  stripHtml,
  stripMarkdown,
  stripTex,
  paragraphsFromText,
  vocabularyMarkdown,
  formatClock,
  speakerLabel,
  resolveInWorkspace,
  DEFAULT_CONFIG,
}
