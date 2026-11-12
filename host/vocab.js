/**
 * Wordbook: the single entry-normalization implementation (word / sentence,
 * meanings, forms, etymology and status rule), CRUD over the locked JSON store
 * and Markdown export.
 *
 * Status rule (one place, see statusOf):
 *   sentence -> done when a translation exists; word -> done when ipa or a
 *   Chinese meaning exists.
 */
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fail, isRecord, normalizedPath, VOCAB_MD_REL, VOCAB_REL } from './paths.js'
import { formatClock } from './text.js'

export const MAX_LOOKUP_TEXT = 400
export const MAX_WORD = 120
export const MAX_MEANINGS = 8
export const MAX_FAMILY = 8
const MAX_PARTS = 6
const EMPTY_VOCAB = Object.freeze({ version: 1, words: [] })

function sha1(text) {
  return createHash('sha1').update(text).digest('hex')
}

/** Longest evidence example kept on a meaning (optional field, frozen format). */
const MAX_EXAMPLE = 400

/** Key used to merge meanings that only differ in pos casing. */
function meaningKey(pos, zh) {
  return pos.toLowerCase() + '\u0000' + zh
}

/** Extract the optional {example?, source?} evidence from a raw meaning item. */
function meaningEvidence(item) {
  const evidence = {}
  if (typeof item.example === 'string') {
    const example = item.example.trim()
    if (example !== '') evidence.example = example.length > MAX_EXAMPLE ? example.slice(0, MAX_EXAMPLE) : example
  }
  if (isRecord(item.source)) {
    const source = cleanSource(item.source)
    if (source.transcript !== '' || source.title !== '' || source.speaker !== '' || source.startMs > 0) evidence.source = source
  }
  return evidence
}

/** True when the normalized meaning already carries that evidence field. */
function hasEvidence(meaning, field) {
  if (field === 'example') return typeof meaning.example === 'string' && meaning.example !== ''
  return isRecord(meaning.source)
}

/** Normalize an array of {pos, zh, example?, source?} meanings (deduplicated, capped). */
export function normalizeMeanings(raw, options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 3
  if (!Array.isArray(raw)) return []
  const meanings = []
  const seen = new Map()
  for (const item of raw) {
    if (!isRecord(item) || typeof item.zh !== 'string' || item.zh.trim() === '') continue
    const pos = String(item.pos ?? '').trim()
    const zh = item.zh.trim()
    const evidence = meaningEvidence(item)
    const key = meaningKey(pos, zh)
    const index = seen.get(key)
    if (index === undefined) {
      seen.set(key, meanings.length)
      meanings.push({ pos, zh, ...evidence })
      continue
    }
    // Duplicate (pos case-insensitively, zh): keep the first occurrence and
    // backfill any evidence only the duplicate carries.
    const existing = meanings[index]
    if (!hasEvidence(existing, 'example') && evidence.example !== undefined) existing.example = evidence.example
    if (!hasEvidence(existing, 'source') && evidence.source !== undefined) existing.source = evidence.source
  }
  return meanings.slice(0, limit)
}

/** Normalize an array of {label, form} word forms (deduplicated, capped). */
export function normalizeFamily(raw, options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : MAX_FAMILY
  if (!Array.isArray(raw)) return []
  const family = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const form = typeof item.form === 'string' ? item.form.trim() : ''
    if (form === '') continue
    if (family.some((existing) => existing.form.toLowerCase() === form.toLowerCase())) continue
    family.push({ label: String(item.label ?? '').trim(), form })
    if (family.length >= limit) break
  }
  return family
}

/** Normalize an etymology object; empty etymologies become undefined. */
export function normalizeEtymology(raw) {
  if (!isRecord(raw)) return undefined
  const parts = Array.isArray(raw.parts)
    ? raw.parts
      .filter((part) => isRecord(part) && typeof part.part === 'string' && part.part.trim() !== '')
      .map((part) => ({ part: part.part.trim(), meaning: String(part.meaning ?? '').trim() }))
      .slice(0, MAX_PARTS)
    : []
  const candidate = {
    language: String(raw.language ?? '').trim(),
    parts,
    explanation: String(raw.explanation ?? '').trim(),
  }
  if (candidate.language !== '' || parts.length > 0 || candidate.explanation !== '') return candidate
  return undefined
}

/** The one status rule shared by add / update / enrich / markdown. */
export function statusOf(entry) {
  if (!isRecord(entry)) return 'pending'
  if (entry.kind === 'sentence') return String(entry.translation ?? '').trim() === '' ? 'pending' : 'done'
  const ipa = String(entry.ipa ?? '').trim()
  const meanings = Array.isArray(entry.meanings) ? entry.meanings : []
  return ipa !== '' || meanings.length > 0 ? 'done' : 'pending'
}

/** Normalize a new wordbook entry from an API/tool payload. */
export function normalizeEntry(kind, entry) {
  const source = isRecord(entry) ? entry : {}
  if (kind === 'sentence') {
    const text = String(source.text ?? source.sentence ?? '').trim()
    if (text === '') fail('vocab/invalid-entry', '句子为空')
    if (text.length > MAX_LOOKUP_TEXT) fail('vocab/invalid-entry', '句子太长')
    const normalized = { kind: 'sentence', text, normalized: sha1(text), translation: String(source.translation ?? '').trim() }
    normalized.status = statusOf(normalized)
    return normalized
  }
  const word = String(source.word ?? source.text ?? '').trim()
  if (word === '') fail('vocab/invalid-entry', '单词为空')
  if (word.length > MAX_WORD) fail('vocab/invalid-entry', '单词太长')
  const normalized = {
    kind: 'word',
    word,
    normalized: word.toLowerCase(),
    ipa: String(source.ipa ?? '').trim(),
    meanings: normalizeMeanings(source.meanings, { limit: MAX_MEANINGS }),
    family: normalizeFamily(source.family, { limit: MAX_FAMILY }),
    etymology: normalizeEtymology(source.etymology),
    sentence: String(source.sentence ?? '').trim(),
    sentenceZh: String(source.sentenceZh ?? '').trim(),
  }
  normalized.status = statusOf(normalized)
  return normalized
}

/** Apply a partial entry patch in place (update / enrich) and refresh status. */
export function applyVocabPatch(target, patch) {
  if (!isRecord(target) || !isRecord(patch)) return false
  if (typeof patch.ipa === 'string') target.ipa = patch.ipa.trim()
  if (Array.isArray(patch.meanings)) {
    const evidence = new Map()
    for (const meaning of Array.isArray(target.meanings) ? target.meanings : []) {
      if (!isRecord(meaning) || typeof meaning.zh !== 'string') continue
      const zh = meaning.zh.trim()
      if (zh === '') continue
      const key = meaningKey(String(meaning.pos ?? '').trim(), zh)
      const kept = evidence.get(key) ?? {}
      const item = meaningEvidence(meaning)
      if (kept.example === undefined && item.example !== undefined) kept.example = item.example
      if (kept.source === undefined && item.source !== undefined) kept.source = item.source
      evidence.set(key, kept)
    }
    const merged = patch.meanings.map((item) => {
      if (!isRecord(item) || typeof item.zh !== 'string') return item
      const previous = evidence.get(meaningKey(String(item.pos ?? '').trim(), item.zh.trim()))
      if (previous === undefined) return item
      const next = { ...item }
      if (!hasEvidence(next, 'example') && previous.example !== undefined) next.example = previous.example
      if (!hasEvidence(next, 'source') && previous.source !== undefined) next.source = previous.source
      return next
    })
    target.meanings = normalizeMeanings(merged, { limit: MAX_MEANINGS })
  }
  if (typeof patch.sentenceZh === 'string') target.sentenceZh = patch.sentenceZh.trim()
  if (typeof patch.translation === 'string') target.translation = patch.translation.trim()
  if (Array.isArray(patch.family)) target.family = normalizeFamily(patch.family, { limit: MAX_FAMILY })
  if (isRecord(patch.etymology)) target.etymology = normalizeEtymology(patch.etymology)
  target.status = statusOf(target)
  return true
}

/** Normalize the {transcript,title,speaker,startMs} provenance record. */
export function cleanSource(source) {
  if (!isRecord(source)) return {}
  const start = Number(source.startMs)
  return {
    transcript: String(source.transcript ?? '').trim(),
    title: String(source.title ?? '').trim(),
    speaker: String(source.speaker ?? '').trim(),
    startMs: Number.isFinite(start) && start >= 0 ? Math.round(start) : 0,
  }
}

function analysisCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const ANALYSIS_STATUSES = new Set(['done', 'skipped', 'failed'])
const MAX_FINGERPRINT = 200
const MAX_ANALYSIS_ERROR = 300

function analysisAt(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (ISO_DATETIME_RE.test(text) && !Number.isNaN(Date.parse(text))) return text
  }
  return new Date().toISOString()
}

/**
 * Normalize the persisted 多义分析 record (optional field on word entries only;
 * version stays 1 because the frozen data format only gains optional fields).
 */
export function normalizeAnalysis(raw) {
  if (!isRecord(raw)) return undefined
  const status = typeof raw.status === 'string' ? raw.status.trim() : ''
  if (!ANALYSIS_STATUSES.has(status)) return undefined
  const fingerprint = typeof raw.fingerprint === 'string' ? raw.fingerprint.trim() : ''
  if (fingerprint === '' || fingerprint.length > MAX_FINGERPRINT) return undefined
  const analysis = {
    version: 1,
    at: analysisAt(raw.at),
    status,
    fingerprint,
    contexts: analysisCount(raw.contexts),
    transcripts: analysisCount(raw.transcripts),
    added: status === 'done' ? analysisCount(raw.added) : 0,
  }
  if (status === 'failed') {
    const message = typeof raw.error === 'string' ? raw.error.trim() : ''
    if (message !== '') analysis.error = message.length > MAX_ANALYSIS_ERROR ? message.slice(0, MAX_ANALYSIS_ERROR) : message
  }
  return analysis
}

/** Render the vocabulary as a readable Markdown document for the agent and the user. */
export function vocabularyMarkdown(data) {
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
      const example = typeof meaning.example === 'string' ? meaning.example.trim() : ''
      if (example !== '') {
        const title = typeof meaning.source?.title === 'string' ? meaning.source.title.trim() : ''
        lines.push(`  - 例：${example}${title !== '' ? `（${title}）` : ''}`)
      }
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
    if (isRecord(entry.analysis) && entry.analysis.status === 'done') {
      lines.push(`  - 多义分析：${analysisCount(entry.analysis.contexts)} 处 · ${analysisCount(entry.analysis.transcripts)} 篇文稿`)
    } else if (isRecord(entry.analysis) && entry.analysis.status === 'skipped') {
      lines.push('  - 多义分析：没有更多上下文')
    } else if (isRecord(entry.analysis) && entry.analysis.status === 'failed') {
      const error = typeof entry.analysis.error === 'string' ? entry.analysis.error.trim() : ''
      lines.push(`  - 多义分析：失败${error !== '' ? `（${error}）` : ''}`)
    }
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
/** Create the wordbook service (store + lookup service injected). */
export function createVocabService(options) {
  const store = options.store
  const lookup = options.lookup

  function vocabPath(root) {
    return join(root, VOCAB_REL)
  }

  function vocabMdPath(root) {
    return join(root, VOCAB_MD_REL)
  }

  function sanitize(data) {
    if (!isRecord(data) || !Array.isArray(data.words)) return { version: 1, words: [] }
    return { version: 1, words: data.words.filter(isRecord) }
  }

  /** Unlocked read: callers inside store.locked() must not re-enter the lock. */
  async function read(root) {
    const detail = await store.readJsonFile(vocabPath(root), EMPTY_VOCAB)
    return sanitize(detail.value)
  }

  /** Must be called while holding the vocabulary lock. */
  async function writeUnlocked(root, data) {
    await store.atomicWriteText(vocabPath(root), JSON.stringify(data, null, 2) + '\n')
    await store.atomicWriteText(vocabMdPath(root), vocabularyMarkdown(data))
  }

  async function add(root, config, entry, signal) {
    const kind = entry?.kind === 'sentence' ? 'sentence' : 'word'
    const normalized = normalizeEntry(kind, entry)
    if (kind === 'word' && normalized.sentence !== '' && normalized.sentenceZh === '') {
      try {
        const translated = await lookup.translate(root, config, normalized.sentence, signal)
        normalized.sentenceZh = translated.translation
      } catch {
        normalized.sentenceZh = ''
      }
    }
    return store.locked(vocabPath(root), async () => {
      const data = await read(root)
      const duplicate = data.words.find((item) => item.kind === normalized.kind && item.normalized === normalized.normalized)
      if (duplicate !== undefined) return { duplicate: true, id: duplicate.id, entry: duplicate }
      const now = new Date().toISOString()
      const item = { id: randomUUID(), ...normalized, source: cleanSource(entry?.source), createdAt: now, updatedAt: now }
      data.words.unshift(item)
      await writeUnlocked(root, data)
      return { duplicate: false, id: item.id, entry: item }
    })
  }

  async function update(root, input) {
    const entries = Array.isArray(input?.entries) ? input.entries : isRecord(input?.entry) ? [input.entry] : []
    if (entries.length === 0) fail('vocab/invalid-entry', '没有要更新的词条')
    return store.locked(vocabPath(root), async () => {
      const data = await read(root)
      const updated = []
      for (const patch of entries) {
        if (!isRecord(patch) || typeof patch.id !== 'string') continue
        const target = data.words.find((item) => item.id === patch.id)
        if (target === undefined) continue
        applyVocabPatch(target, patch)
        target.updatedAt = new Date().toISOString()
        updated.push(target)
      }
      await writeUnlocked(root, data)
      return { updated: updated.length, entries: updated }
    })
  }

  async function remove(root, input) {
    const ids = Array.isArray(input?.ids) ? input.ids.map((id) => String(id)) : []
    if (ids.length === 0) fail('vocab/invalid-entry', '没有要删除的词条')
    return store.locked(vocabPath(root), async () => {
      const data = await read(root)
      const before = data.words.length
      data.words = data.words.filter((item) => !ids.includes(item.id))
      await writeUnlocked(root, data)
      return { removed: before - data.words.length }
    })
  }

  async function list(root, input) {
    const data = await read(root)
    const status = String(input?.status ?? 'pending')
    const query = String(input?.query ?? '').trim().toLowerCase()
    const rows = data.words.filter((item) => {
      if (status === 'pending' && item.status !== 'pending') return false
      if (status === 'done' && item.status !== 'done') return false
      if (query !== '') {
        const haystack = [item.word, item.text, item.sentence, item.translation]
          .concat(Array.isArray(item.meanings) ? item.meanings.map((meaning) => meaning.zh) : [])
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

  async function exportMarkdown(root) {
    return store.locked(vocabPath(root), async () => {
      const data = await read(root)
      await store.atomicWriteText(vocabMdPath(root), vocabularyMarkdown(data))
      return { path: normalizedPath(VOCAB_MD_REL) }
    })
  }

  async function enrich(root, config, input, signal) {
    const id = String(input?.id ?? '').trim()
    if (id === '') fail('vocab/invalid-entry', '缺少词条 id')
    const data = await read(root)
    const target = data.words.find((item) => item.id === id)
    if (target === undefined) fail('vocab/not-found', '词条不存在')
    if (target.kind === 'sentence') fail('vocab/invalid-entry', '句子条目没有词形/词源')
    const result = await lookup.view(root, config, { kind: 'word', text: target.word, sentence: '' }, signal)
    if (!result || result.ok !== true) fail('lookup/failed', result?.message ?? '查词失败')
    return store.locked(vocabPath(root), async () => {
      const latest = await read(root)
      const entry = latest.words.find((item) => item.id === id)
      if (entry === undefined) fail('vocab/not-found', '词条不存在')
      const hasIpa = typeof entry.ipa === 'string' && entry.ipa !== ''
      const hasMeanings = Array.isArray(entry.meanings) && entry.meanings.length > 0
      const patch = {}
      if (!hasIpa && typeof result.ipa === 'string' && result.ipa !== '') patch.ipa = result.ipa
      if (!hasMeanings && Array.isArray(result.meanings) && result.meanings.length > 0) patch.meanings = result.meanings
      if (Array.isArray(result.family)) patch.family = result.family
      if (result.etymology !== undefined) patch.etymology = result.etymology
      applyVocabPatch(entry, patch)
      entry.updatedAt = new Date().toISOString()
      await writeUnlocked(root, latest)
      return { id, entry }
    })
  }

  /** Persist a 多义分析 result (analysis service) and refresh derived fields. */
  async function applyAnalysis(root, id, patch) {
    const entryId = String(id ?? '').trim()
    if (entryId === '') fail('vocab/invalid-entry', '缺少词条 id')
    const input = isRecord(patch) ? patch : {}
    return store.locked(vocabPath(root), async () => {
      const data = await read(root)
      const target = data.words.find((item) => item.id === entryId)
      if (target === undefined) fail('vocab/not-found', '词条不存在')
      if (target.kind === 'sentence') fail('vocab/invalid-entry', '句子条目没有多义分析')
      if (Array.isArray(input.meanings)) target.meanings = normalizeMeanings(input.meanings, { limit: MAX_MEANINGS })
      const analysis = normalizeAnalysis(input.analysis)
      if (analysis !== undefined) target.analysis = analysis
      target.status = statusOf(target)
      target.updatedAt = new Date().toISOString()
      await writeUnlocked(root, data)
      return { id: entryId, entry: target }
    })
  }

  return { read, add, update, remove, list, exportMarkdown, enrich, applyAnalysis, vocabPath, vocabMdPath }
}
