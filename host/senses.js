/**
 * Multi-sense analysis: the pure logic core behind the wordbook "多义分析"
 * feature. It turns the user's documents into sentence contexts, finds the
 * contexts where a word (and its forms) appears, builds the model prompt,
 * normalizes/merges the returned senses and derives the cache key and stale
 * fingerprint.
 *
 * Pure by contract: no filesystem, no timers, no network. The only imports are
 * node:crypto (sha1 keys) and ./text.js (formatClock plus the meaning-folding
 * helpers collapseMeanings / mergeMeaningPair). host/analysis.js owns all IO,
 * the model call and the background scheduling.
 */
import { createHash } from 'node:crypto'
import { collapseMeanings, formatClock, mergeMeaningPair } from './text.js'

/** Bumped whenever the prompt/context/merge semantics change; part of the fingerprint. */
export const ANALYSIS_VERSION = 1

const MAX_MEANINGS = 8
const MAX_SENSES = 8
const MAX_VARIANTS = 12
const DEFAULT_MAX_CONTEXTS = 6
const MAX_CONTEXTS = 12
const DEFAULT_MAX_CONTEXT_CHARS = 240
const MIN_MAX_CONTEXT_CHARS = 40
const MAX_MAX_CONTEXT_CHARS = 2000
const MAX_EXAMPLE_CHARS = 400

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'no', 'nos',
  'fig', 'figs', 'vol', 'vols', 'ch', 'sec', 'pp', 'ca', 'cf', 'al', 'eds', 'ed',
  'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'approx', 'esp', 'hon', 'pres', 'gov',
  'sgt', 'capt', 'gen', 'rev', 'ave', 'blvd', 'rd', 'univ', 'assn', 'e.g', 'i.e',
])

function sha1(value) {
  return createHash('sha1').update(String(value)).digest('hex')
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function fileStem(file) {
  const base = String(file ?? '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.json$/i, '')
}

function startOf(segment) {
  for (const key of ['start', 'startMs', 'begin_time', 'begin']) {
    const value = Number(segment?.[key])
    if (Number.isFinite(value) && value >= 0) return Math.round(value)
  }
  return 0
}

function speakerOf(segment) {
  if (!isRecord(segment)) return ''
  const value = segment.speaker ?? segment.speaker_id ?? segment.speakerId
  return value === undefined || value === null ? '' : String(value)
}

function endsWithAbbreviation(fragment) {
  const trimmed = String(fragment).replace(/[)"'”’\]]+$/, '').trim()
  const match = /([A-Za-z][A-Za-z.]*)\.$/.exec(trimmed)
  if (match === null) return false
  const token = match[1].toLowerCase()
  if (token.includes('.')) return true
  if (token.length === 1) return true
  return ABBREVIATIONS.has(token)
}

/**
 * Split one block of prose into sentences. Whitespace is collapsed first (PDF
 * lines are already joined with spaces), then every terminator followed by
 * whitespace ends a sentence, except inside common abbreviations and initials.
 */
export function splitSentences(text) {
  const normalized = collapse(text)
  if (normalized === '') return []
  const fragments = normalized.split(/(?<=[.!?…。！？](?:["'”’)\]]{0,3}))\s+/)
  const sentences = []
  let buffer = ''
  for (const fragment of fragments) {
    const piece = fragment.trim()
    if (piece === '') continue
    buffer = buffer === '' ? piece : buffer + ' ' + piece
    if (endsWithAbbreviation(buffer)) continue
    sentences.push(buffer)
    buffer = ''
  }
  if (buffer !== '') sentences.push(buffer)
  return sentences
}

/** Flatten one transcript/PDF document into sentence units with provenance. */
export function transcriptUnits(document) {
  const source = isRecord(document) ? document : {}
  const units = []
  if (Array.isArray(source.segments) && source.segments.length > 0) {
    for (const segment of source.segments) {
      if (!isRecord(segment)) continue
      const startMs = startOf(segment)
      const speaker = speakerOf(segment)
      for (const sentence of splitSentences(segment.text)) {
        units.push({ text: sentence, startMs, speaker })
      }
    }
    return units
  }
  if (Array.isArray(source.pages) && source.pages.length > 0) {
    for (let index = 0; index < source.pages.length; index += 1) {
      const page = source.pages[index]
      if (!isRecord(page)) continue
      const lines = Array.isArray(page.lines) ? page.lines : []
      const text = lines
        .map((line) => (isRecord(line) && typeof line.text === 'string' ? line.text : ''))
        .join(' ')
      const number = Number(page.page)
      const pageNumber = Number.isFinite(number) && number > 0 ? Math.round(number) : index + 1
      for (const sentence of splitSentences(text)) {
        units.push({ text: sentence, startMs: 0, speaker: '', page: pageNumber })
      }
    }
    return units
  }
  return []
}

/** Build the searchable corpus from [{file,title,document}] (empty documents are dropped). */
export function buildCorpus(documents) {
  const corpus = []
  for (const item of Array.isArray(documents) ? documents : []) {
    if (!isRecord(item)) continue
    const document = isRecord(item.document) ? item.document : {}
    const units = transcriptUnits(document)
    if (units.length === 0) continue
    const file = String(item.file ?? '')
    const title = collapse(item.title) || fileStem(file)
    corpus.push({ file, title, units })
  }
  return corpus
}

/** Stable sha1 of the sorted file|createdAt|segments|pages rows (document order does not matter). */
export function corpusSignature(documents) {
  const rows = []
  for (const item of Array.isArray(documents) ? documents : []) {
    if (!isRecord(item)) continue
    const document = isRecord(item.document) ? item.document : {}
    const segments = Array.isArray(document.segments) ? document.segments.length : 0
    const pages = Array.isArray(document.pages) ? document.pages.length : 0
    rows.push([String(item.file ?? ''), String(document.createdAt ?? ''), String(segments), String(pages)].join('|'))
  }
  rows.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  return sha1(rows.join('\n'))
}

/** The headword plus every known form, deduplicated case-insensitively (max 12). */
export function entryVariants(entry) {
  const source = isRecord(entry) ? entry : {}
  const variants = []
  const seen = new Set()
  function add(value) {
    const form = collapse(value)
    if (form === '') return
    const key = form.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    variants.push(form)
  }
  add(source.word)
  const family = Array.isArray(source.family) ? source.family : []
  for (const item of family) {
    add(isRecord(item) ? item.form : '')
    if (variants.length >= MAX_VARIANTS) break
  }
  return variants.slice(0, MAX_VARIANTS)
}

/**
 * Fingerprint of everything a cached analysis depends on: the headword, its
 * forms, the seeded example sentence and the corpus signature. Editing an
 * existing meaning deliberately does not change it (merging senses is stable).
 */
export function analysisFingerprint(entry, signature) {
  const source = isRecord(entry) ? entry : {}
  const variants = entryVariants(source).map((form) => form.toLowerCase()).sort()
  const payload = [
    String(ANALYSIS_VERSION),
    collapse(source.word).toLowerCase(),
    variants.join('\u0001'),
    collapse(source.sentence),
    String(signature ?? ''),
  ]
  return sha1(payload.join('\u0000'))
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matcherSource(variants) {
  const forms = []
  const seen = new Set()
  for (const value of Array.isArray(variants) ? variants : []) {
    const form = collapse(value)
    if (form === '') continue
    const key = form.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    forms.push(form)
  }
  if (forms.length === 0) return ''
  forms.sort((left, right) => right.length - left.length)
  return forms.map((form) => escapeRegExp(form).replace(/\s+/g, '\\s+')).join('|')
}

/**
 * A case-insensitive whole-word matcher for every variant. "Whole word" means
 * the neighbours are not \p{L}/\p{N}, so "cat" never matches "cattle" or
 * "concat", while "ice cream" matches "ice   cream".
 */
function matcherFor(variants) {
  const source = matcherSource(variants)
  if (source === '') return undefined
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, 'giu')
}

function countWith(regex, text) {
  if (regex === undefined) return 0
  const value = String(text ?? '')
  regex.lastIndex = 0
  let count = 0
  while (regex.exec(value) !== null) count += 1
  regex.lastIndex = 0
  return count
}

function firstMatch(regex, text) {
  if (regex === undefined) return undefined
  regex.lastIndex = 0
  const match = regex.exec(String(text ?? ''))
  regex.lastIndex = 0
  if (match === null) return undefined
  return { index: match.index, length: match[0].length }
}

/** Count case-insensitive whole-word occurrences of any variant in text. */
export function countOccurrences(text, variants) {
  return countWith(matcherFor(variants), text)
}

/** Clip around the first occurrence of the word, keeping the total length within limit. */
function clipContext(text, regex, limit) {
  if (text.length <= limit) return text
  const found = firstMatch(regex, text)
  if (found === undefined) return text.slice(0, Math.max(0, limit - 1)) + '…'
  let start = Math.max(0, found.index - Math.floor((limit - found.length) / 2))
  if (start + limit > text.length) start = Math.max(0, text.length - limit)
  let end = Math.min(text.length, start + limit)
  let prefix = start > 0
  let suffix = end < text.length
  const overhead = (prefix ? 1 : 0) + (suffix ? 1 : 0)
  if (overhead > 0) {
    const budget = Math.max(4, limit - overhead)
    start = Math.max(0, found.index - Math.floor((budget - found.length) / 2))
    if (start + budget > text.length) start = Math.max(0, text.length - budget)
    end = Math.min(text.length, start + budget)
    prefix = start > 0
    suffix = end < text.length
  }
  return (prefix ? '…' : '') + text.slice(start, end) + (suffix ? '…' : '')
}

function contextList(contexts) {
  if (Array.isArray(contexts)) return contexts
  if (isRecord(contexts) && Array.isArray(contexts.contexts)) return contexts.contexts
  return []
}

function contextOf(unit, document) {
  const context = {
    text: collapse(unit.text),
    title: document.title,
    speaker: unit.speaker === undefined || unit.speaker === null ? '' : String(unit.speaker),
    startMs: Number.isFinite(Number(unit.startMs)) && Number(unit.startMs) >= 0 ? Math.round(Number(unit.startMs)) : 0,
    transcript: document.file,
  }
  if (unit.page !== undefined) context.page = unit.page
  return context
}

/**
 * Collect the numbered sentence contexts for one wordbook entry.
 *
 * The entry's own sentence (from entry.source) is always context #1, then the
 * corpus is scanned document by document in round-robin order so one long
 * document cannot crowd out the others. Sentences are deduplicated by text,
 * long ones are clipped around the first occurrence and the total is capped by
 * options.maxContexts (default 6, clamped 1..12); options.maxContextChars
 * defaults to 240 and is clamped 40..2000. occurrences counts every match in
 * the scanned corpus (the seeded entry.sentence is not counted twice);
 * transcripts is the number of distinct documents represented in the result.
 */
export function collectContexts(entry, corpus, options = {}) {
  const source = isRecord(entry) ? entry : {}
  const settings = isRecord(options) ? options : {}
  const variants = entryVariants(source)
  const maxContexts = clampInt(settings.maxContexts, 1, MAX_CONTEXTS, DEFAULT_MAX_CONTEXTS)
  const maxContextChars = clampInt(settings.maxContextChars, MIN_MAX_CONTEXT_CHARS, MAX_MAX_CONTEXT_CHARS, DEFAULT_MAX_CONTEXT_CHARS)
  const regex = matcherFor(variants)
  const contexts = []
  const seenText = new Set()

  function pushContext(candidate) {
    if (contexts.length >= maxContexts) return false
    const text = collapse(candidate.text)
    if (text === '') return false
    const key = text.toLowerCase()
    if (seenText.has(key)) return false
    seenText.add(key)
    contexts.push({ ...candidate, text: clipContext(text, regex, maxContextChars) })
    return true
  }

  // 1. The sentence saved with the wordbook entry is always context #1.
  const sentence = collapse(source.sentence)
  if (sentence !== '') {
    const origin = isRecord(source.source) ? source.source : {}
    pushContext({
      text: sentence,
      title: collapse(origin.title),
      speaker: origin.speaker === undefined || origin.speaker === null ? '' : String(origin.speaker),
      startMs: Number.isFinite(Number(origin.startMs)) && Number(origin.startMs) >= 0 ? Math.round(Number(origin.startMs)) : 0,
      transcript: collapse(origin.transcript),
    })
  }

  // 2. Scan the corpus once, counting every match and bucketing matching units by document.
  let occurrences = 0
  const buckets = []
  for (const item of Array.isArray(corpus) ? corpus : []) {
    if (!isRecord(item)) continue
    const units = Array.isArray(item.units) ? item.units : []
    const matches = []
    for (const unit of units) {
      if (!isRecord(unit)) continue
      const text = collapse(unit.text)
      if (text === '') continue
      const found = countWith(regex, text)
      if (found === 0) continue
      occurrences += found
      matches.push(contextOf(unit, { file: String(item.file ?? ''), title: collapse(item.title) || fileStem(item.file) }))
    }
    buckets.push(matches)
  }

  // 3. Round-robin across documents so several transcripts are represented early.
  const cursors = buckets.map(() => 0)
  let progressed = true
  while (contexts.length < maxContexts && progressed) {
    progressed = false
    for (let index = 0; index < buckets.length && contexts.length < maxContexts; index += 1) {
      const bucket = buckets[index]
      while (cursors[index] < bucket.length) {
        const candidate = bucket[cursors[index]]
        cursors[index] += 1
        progressed = true
        if (pushContext(candidate)) break
      }
    }
  }

  const transcripts = new Set()
  for (const context of contexts) {
    const name = collapse(context.transcript)
    if (name !== '') transcripts.add(name.toLowerCase())
  }
  return { contexts, occurrences, transcripts: transcripts.size }
}

function promptContextLabel(context) {
  const title = collapse(context?.title)
  const start = Number(context?.startMs)
  const parts = []
  if (title !== '') parts.push(title)
  if (Number.isFinite(start) && start > 0) parts.push(formatClock(start))
  return parts.join(' · ')
}

/** Build the English multi-sense prompt (strict JSON answer, 1-based context numbers). */
export function buildSensePrompt(entry, contexts) {
  const source = isRecord(entry) ? entry : {}
  const list = contextList(contexts)
  const variants = entryVariants(source)
  const word = collapse(source.word) || variants[0] || 'word'
  const lines = [
    `You are analyzing the different meanings of the English word "${word}" in the user's own documents.`,
  ]
  if (variants.length > 1) {
    lines.push(`Word forms to treat as the same word: ${variants.join(', ')}.`)
  }
  const existing = []
  for (const meaning of collapseMeanings(source.meanings)) {
    const zh = collapse(meaning.zh)
    if (zh === '') continue
    const pos = collapse(meaning.pos)
    existing.push(pos === '' ? zh : `${pos} ${zh}`)
    if (existing.length >= MAX_MEANINGS) break
  }
  if (existing.length > 0) {
    lines.push(`Existing dictionary meanings (reference only, do not drop them and do not repeat one unless its context is listed below): ${existing.join('; ')}.`)
  }
  lines.push('', 'Contexts:')
  list.forEach((context, index) => {
    const label = promptContextLabel(context)
    const text = collapse(context?.text)
    lines.push(`${index + 1}. ${label === '' ? '' : `[${label}] `}${text}`)
  })
  lines.push(
    '',
    'Task: identify every distinct meaning of the word that these contexts actually show, including senses the existing list is missing. Do not invent meanings that no context supports.',
    'Return strict JSON only, no markdown fences and no commentary:',
    '{"senses":[{"pos":"<n.|v.|adj.|adv.|...>","zh":"<concise Simplified Chinese meaning>","contexts":[1,3]}]}',
    'Rules:',
    '- 1 to 8 senses, most common first.',
    '- "contexts" lists the 1-based numbers of the contexts that show this sense; it must not be empty.',
    '- "pos" is a short part-of-speech tag such as n., v., adj., adv.; "zh" is a concise Simplified Chinese meaning.',
    '- Answer with the JSON object only: no explanations, no markdown fences, no extra keys.',
  )
  return lines.join('\n')
}

/** Deterministic cache key over the word, its forms and the numbered context texts. */
export function senseCacheKey(entry, contexts) {
  const source = isRecord(entry) ? entry : {}
  const payload = {
    v: ANALYSIS_VERSION,
    word: collapse(source.word).toLowerCase(),
    variants: entryVariants(source).map((form) => form.toLowerCase()).sort(),
    contexts: contextList(contexts).map((context) => collapse(context?.text)),
  }
  return 'senses:' + sha1(JSON.stringify(payload))
}

/**
 * Normalize the model answer into [{pos,zh,contexts}] (1-based, sorted, unique).
 * Empty zh, senses without a single valid context number, invalid/duplicate
 * numbers are dropped; duplicates by pos+zh merge their contexts; max 8 senses.
 */
export function normalizeSenseResult(raw, contextCount) {
  const count = Number.isFinite(Number(contextCount)) ? Math.max(0, Math.trunc(Number(contextCount))) : 0
  const source = isRecord(raw) ? raw : {}
  const list = Array.isArray(source.senses) ? source.senses : Array.isArray(raw) ? raw : []
  const senses = []
  const index = new Map()
  for (const item of list) {
    if (!isRecord(item)) continue
    const zh = collapse(item.zh)
    if (zh === '') continue
    const pos = collapse(item.pos)
    const valid = []
    const seen = new Set()
    for (const value of Array.isArray(item.contexts) ? item.contexts : []) {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isInteger(number) || number < 1 || number > count || seen.has(number)) continue
      seen.add(number)
      valid.push(number)
    }
    if (valid.length === 0) continue
    valid.sort((left, right) => left - right)
    const key = pos.toLowerCase() + '\u0000' + zh
    const existing = index.get(key)
    if (existing !== undefined) {
      for (const number of valid) {
        if (!existing.contexts.includes(number)) existing.contexts.push(number)
      }
      existing.contexts.sort((left, right) => left - right)
      continue
    }
    if (senses.length >= MAX_SENSES) continue
    const sense = { pos, zh, contexts: valid }
    index.set(key, sense)
    senses.push(sense)
  }
  return senses
}

function cleanSource(raw) {
  const source = isRecord(raw) ? raw : {}
  const start = Number(source.startMs)
  const clean = {
    transcript: collapse(source.transcript),
    title: collapse(source.title),
    speaker: collapse(source.speaker),
    startMs: Number.isFinite(start) && start > 0 ? Math.round(start) : 0,
  }
  const empty = clean.transcript === '' && clean.title === '' && clean.speaker === '' && clean.startMs === 0
  return empty ? undefined : clean
}

function evidenceOf(context) {
  if (!isRecord(context)) return undefined
  const text = collapse(context.text)
  const example = text === '' ? undefined : text.slice(0, MAX_EXAMPLE_CHARS)
  const source = cleanSource({
    transcript: context.transcript,
    title: context.title,
    speaker: context.speaker,
    startMs: context.startMs,
  })
  if (example === undefined && source === undefined) return undefined
  const evidence = {}
  if (example !== undefined) evidence.example = example
  if (source !== undefined) evidence.source = source
  return evidence
}

function senseKey(pos, zh) {
  return collapse(pos).toLowerCase() + '\u0000' + collapse(zh)
}

/**
 * Merge normalized senses into the entry's existing meanings.
 *
 * Existing meanings are preserved and enriched with the missing evidence.
 * A sense that explains the same thing as an existing meaning is folded into
 * that row instead of appending a near-duplicate (see mergeMeaningPair): the
 * richer wording wins, POS survives when only one row has one, and evidence is
 * backfilled. Only genuinely new senses are appended, up to MAX_MEANINGS (8).
 * Existing near-duplicates are folded as well (a stale dictionary + analysis
 * pair cleans itself up on the next analysis). The result is idempotent.
 */
export function mergeSenses(entry, senses, contexts) {
  const source = isRecord(entry) ? entry : {}
  const meanings = (Array.isArray(source.meanings) ? source.meanings : [])
    .filter((meaning) => isRecord(meaning))
    .map((meaning) => ({ ...meaning }))
  const list = contextList(contexts)
  let added = 0
  for (const sense of Array.isArray(senses) ? senses : []) {
    if (!isRecord(sense)) continue
    const zh = collapse(sense.zh)
    if (zh === '') continue
    const pos = collapse(sense.pos)
    let evidence
    for (const number of Array.isArray(sense.contexts) ? sense.contexts : []) {
      const context = list[Number(number) - 1]
      const candidate = evidenceOf(context)
      if (candidate !== undefined) {
        evidence = candidate
        break
      }
    }
    const key = senseKey(pos, zh)
    const existing = meanings.find((meaning) => senseKey(meaning.pos, meaning.zh) === key)
    if (existing !== undefined) {
      if (existing.example === undefined && evidence?.example !== undefined) existing.example = evidence.example
      if (existing.source === undefined && evidence?.source !== undefined) existing.source = evidence.source
      continue
    }
    const candidate = { pos, zh }
    if (evidence?.example !== undefined) candidate.example = evidence.example
    if (evidence?.source !== undefined) candidate.source = evidence.source
    let mergedIndex = -1
    let mergedMeaning
    for (let index = 0; index < meanings.length; index += 1) {
      const merged = mergeMeaningPair(meanings[index], candidate)
      if (merged === null) continue
      mergedIndex = index
      mergedMeaning = merged
      break
    }
    if (mergedIndex >= 0 && mergedMeaning !== undefined) {
      meanings[mergedIndex] = mergedMeaning
      continue
    }
    if (meanings.length >= MAX_MEANINGS) continue
    meanings.push(candidate)
    added += 1
  }
  const collapsed = collapseMeanings(meanings)
  return { meanings: collapsed, added, total: collapsed.length }
}
