/**
 * Graph (图谱) — the read-only relation graph between transcripts and wordbook
 * words. It answers two questions the panel's fourth view shows:
 *
 *   - which transcript a word comes from / where it actually occurs
 *     (transcript <-> word edges), and
 *   - how words relate to each other: used in the same sentence (cooccur),
 *     sharing a word root / word family (morph), or sharing a Chinese meaning
 *     fragment (sense).
 *
 * Design rules (frozen, see AGENTS.md):
 * - Everything is derived from local data on every call: `transcripts/*.json`,
 *   `vocab/vocabulary.json` and the optional `.dsh-english/recall.json`
 *   mastery map. Nothing is persisted, no model is called, no config key is
 *   added, and no data format changes.
 * - The builder is pure and deterministic (no timers, no IO, no Date): the
 *   service only loads the inputs and stamps `generatedAt`. Tests freeze the
 *   inputs to prove they are never mutated.
 * - Matching is whole-token: the headword and its family forms are tokenized
 *   with the same tokenizer as the documents, so `cat` never matches
 *   `cattle`, while case, apostrophes and hyphens are normalized
 *   (`don't` / `don’t`, `well-known` / `well known`).
 * - Word <-> word co-occurrence is counted per SENTENCE only. Measuring it per
 *   document (or per paragraph) would turn one dense transcript into a clique
 *   and say nothing about how the words are actually used.
 * - Morphology only links real roots: normalized part length >= 4 and not in
 *   AFFIX_STOPLIST (`ad-`, `in-`, `-ed`, ... would otherwise link unrelated
 *   words).
 *
 * Only `node:path`, `node:fs/promises`, ./paths.js, ./text.js and ./senses.js
 * are imported; `transcriptUnits` / `entryVariants` are reused from senses.js
 * so the sentence split and the word-form list stay identical to the multi-sense
 * analysis, and `meaningAtoms` / `collapseMeanings` are reused from text.js so
 * the shared-meaning fragments and the folded meanings follow the wordbook rule.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isRecord, resolveInWorkspace } from './paths.js'
import { entryVariants, transcriptUnits } from './senses.js'
import { collapseMeanings, meaningAtoms } from './text.js'

/** Payload schema version (independent of the frozen data-file versions). */
export const GRAPH_VERSION = 1

/** Node / link caps. They keep one HTTP action bounded on a large workspace. */
export const MAX_WORDS = 400
export const MAX_DOCUMENTS = 80
export const MAX_SCAN_CHARS = 2000000
export const MAX_APPEARS_PER_WORD = 12
export const MAX_COOCCUR_PER_WORD = 8
export const MAX_ENTRIES_PER_UNIT = 30
export const MAX_PAIRS = 200000
export const MAX_LINKS = 8000

/** Morphology: only roots at least this long count (drops "ad", "in"...). */
export const MIN_ROOT_PART = 4
/** Longest word form in tokens (multi-word phrases are still matched). */
export const MAX_NGRAM = 4
/** Longest evidence sentence kept on an origin edge. */
export const MAX_SAMPLE_CHARS = 240
/** Prefix / suffix units that are not meaningful roots for a word-word link. */
export const AFFIX_STOPLIST = new Set([
  'inter', 'trans', 'super', 'extra', 'intra', 'ultra', 'micro', 'macro',
  'hyper', 'hypo', 'over', 'under', 'fore', 'semi', 'mono', 'poly', 'anti',
  'post', 'auto', 'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ical',
  'ally', 'ated', 'ation', 'ance', 'ence', 'ize', 'ise', 'ing', 'est',
  'ful', 'less', 'ous', 'ive',
])

const LINK_RANK = Object.freeze({ appears: 0, cooccur: 1, morph: 2, sense: 3 })

function compareText(left, right) {
  const a = String(left ?? '')
  const b = String(right ?? '')
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function collapse(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function fileStem(file) {
  const base = String(file ?? '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.json$/i, '')
}

/** Collapse whitespace and clip prose to `max` characters with an ellipsis. */
function clipText(value, max) {
  const text = collapse(value)
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** The last path segment of a stored transcript reference ("a/b/x.json" -> "x.json"). */
export function fileNameOf(value) {
  const text = String(value ?? '').trim()
  if (text === '') return ''
  return text.split(/[\\/]/).pop() ?? ''
}

/** True when two stored transcript references name the same file (case-insensitive). */
export function sameFileName(left, right) {
  const a = fileNameOf(left).toLowerCase()
  const b = fileNameOf(right).toLowerCase()
  return a !== '' && a === b
}

/**
 * Tokenize text for whole-word matching: lowercase, normalize curly apostrophes,
 * then split on everything that is not a letter, a digit or an inner apostrophe.
 * Hyphens therefore split (`well-known` -> ["well","known"]) and a variant
 * tokenized the same way compares equal to the document text.
 */
export function tokenize(text) {
  const value = String(text ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'")
  const match = value.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)
  return match === null ? [] : match
}

/** Normalize one etymology part ("-alis" -> "alis"); empty when nothing is left. */
export function normalizePart(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .trim()
}

/**
 * Split a Chinese meaning list into comparable fragments ("傲慢；自大" -> ["傲慢","自大"]).
 * Single characters are dropped: they are too noisy for a word-word link.
 */
export function senseAtoms(zh) {
  return meaningAtoms(zh).filter((atom) => atom.length >= 2)
}

/** Every (tokenized) search key of one wordbook entry, longest first. */
function variantKeys(entry) {
  const keys = []
  const seen = new Set()
  for (const variant of entryVariants(entry)) {
    const tokens = tokenize(variant)
    if (tokens.length === 0 || tokens.length > MAX_NGRAM) continue
    const key = tokens.join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    keys.push({ key, tokens: tokens.length })
  }
  keys.sort((left, right) => right.tokens - left.tokens || compareText(left.key, right.key))
  return keys
}

function masteryOf(states, id) {
  const state = isRecord(states) && isRecord(states[id]) ? states[id] : undefined
  const value = Number(state?.mastery)
  if (!Number.isFinite(value)) return 0
  return Math.min(5, Math.max(0, Math.trunc(value)))
}

function meaningsOf(entry) {
  const meanings = []
  // Same folding rule as the wordbook card/markdown: stale duplicates from an
  // older dictionary + analysis pair must not show up twice in the detail panel.
  for (const meaning of collapseMeanings(entry?.meanings)) {
    const zh = collapse(meaning.zh)
    if (zh === '') continue
    meanings.push({ pos: collapse(meaning.pos), zh })
  }
  return meanings
}

function sampleOf(entry, originFile, originTitle) {
  const sentence = collapse(entry?.sentence)
  if (sentence === '') return undefined
  const source = isRecord(entry?.source) ? entry.source : {}
  const startMs = Number(source.startMs)
  const sample = {
    text: clipText(sentence, MAX_SAMPLE_CHARS),
    startMs: Number.isFinite(startMs) && startMs > 0 ? Math.round(startMs) : 0,
    speaker: String(source.speaker ?? '').trim(),
  }
  if (originFile !== undefined) sample.transcript = originFile
  if (originTitle !== undefined) sample.title = originTitle
  return sample
}

/**
 * Build the graph payload from already loaded data (pure, deterministic).
 *
 * `input = { documents, words, states, options, documentsTruncated }`
 *   - documents: [{ file, title, document }] where document is a transcripts/*.json value
 *   - words: wordbook entries (only `kind === 'word'` are used)
 *   - states: optional { [entryId]: { mastery } } recall progress
 *   - options: test / internal overrides of the caps (maxWords, maxDocuments,
 *     maxScanChars, maxAppearsPerWord, maxCooccurPerWord)
 *   - documentsTruncated: transcript files the loader never read (directory cap);
 *     it is added to the builder's own truncation so the panel can report both
 *
 * `appears.count` is a whole-token occurrence count (not a sentence count), so
 * "alpha alpha" in one sentence counts 2.
 *
 * Never mutates its inputs; always returns the frozen shape
 * `{ version, summary, nodes, links }`.
 */
export function buildGraph(input = {}) {
  const source = isRecord(input) ? input : {}
  const options = isRecord(source.options) ? source.options : {}
  const maxWords = clampInt(options.maxWords, MAX_WORDS, 0, MAX_WORDS)
  const maxDocuments = clampInt(options.maxDocuments, MAX_DOCUMENTS, 0, MAX_DOCUMENTS)
  const maxScanChars = clampInt(options.maxScanChars, MAX_SCAN_CHARS, 0, MAX_SCAN_CHARS)
  const maxAppears = clampInt(options.maxAppearsPerWord, MAX_APPEARS_PER_WORD, 0, MAX_APPEARS_PER_WORD)
  const maxCooccur = clampInt(options.maxCooccurPerWord, MAX_COOCCUR_PER_WORD, 0, MAX_COOCCUR_PER_WORD)
  const states = isRecord(source.states) ? source.states : {}
  const documentsTruncated = Math.max(0, Math.trunc(Number(source.documentsTruncated) || 0))

  // ── 1. Candidates: word entries and documents (stable order) ─────────────
  const entries = []
  for (const entry of Array.isArray(source.words) ? source.words : []) {
    if (!isRecord(entry) || entry.kind !== 'word') continue
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    const word = collapse(entry.word)
    if (id === '' || word === '') continue
    entries.push({ id, entry, word })
  }
  const documents = []
  for (const item of Array.isArray(source.documents) ? source.documents : []) {
    if (!isRecord(item)) continue
    const file = String(item.file ?? '').trim()
    if (file === '' || !isRecord(item.document)) continue
    documents.push({ file, title: collapse(item.title) || fileStem(file), document: item.document })
  }
  documents.sort((left, right) => compareText(left.file, right.file))

  // ── 2. Variant index (headword + family forms, whole tokens) ─────────────
  const index = new Map()
  let maxN = 1
  for (const item of entries) {
    for (const variant of variantKeys(item.entry)) {
      maxN = Math.max(maxN, variant.tokens)
      let list = index.get(variant.key)
      if (list === undefined) {
        list = []
        index.set(variant.key, list)
      }
      if (!list.includes(item.id)) list.push(item.id)
    }
  }

  // ── 3. One pass over every document (bounded by maxScanChars) ────────────
  /** file -> Map(entryId -> count) */
  const docCounts = new Map()
  const totalCount = new Map()
  /** entryId -> Set(file) */
  const docPresence = new Map()
  /** "a\u0000b" -> shared sentences */
  const pairSentences = new Map()
  /** "a\u0000b" -> shared documents */
  const pairDocs = new Map()
  const used = []
  let scannedChars = 0
  let truncatedTranscripts = documentsTruncated
  for (const doc of documents) {
    if (used.length >= maxDocuments) {
      truncatedTranscripts = documentsTruncated + documents.length - used.length
      break
    }
    const units = transcriptUnits(doc.document)
    let docChars = 0
    for (const unit of units) docChars += String(unit.text ?? '').length
    if (used.length > 0 && scannedChars + docChars > maxScanChars) {
      truncatedTranscripts = documentsTruncated + documents.length - used.length
      break
    }
    const counts = new Map()
    const docPairs = new Set()
    for (const unit of units) {
      const tokens = tokenize(unit.text)
      if (tokens.length === 0) continue
      const ids = new Set()
      const hits = new Map()
      for (let position = 0; position < tokens.length; position += 1) {
        const limit = Math.min(maxN, tokens.length - position)
        let matched = 0
        for (let length = limit; length >= 1; length -= 1) {
          const key = length === 1 ? tokens[position] : tokens.slice(position, position + length).join(' ')
          const found = index.get(key)
          if (found === undefined) continue
          for (const id of found) {
            ids.add(id)
            hits.set(id, (hits.get(id) ?? 0) + 1)
          }
          matched = length
          break
        }
        if (matched > 0) position += matched - 1
      }
      if (ids.size === 0) continue
      // One sentence can repeat a word: count every whole-token hit.
      for (const [id, hit] of hits) counts.set(id, (counts.get(id) ?? 0) + hit)
      if (ids.size > MAX_ENTRIES_PER_UNIT) continue
      const list = [...ids].sort(compareText)
      for (let a = 0; a < list.length; a += 1) {
        for (let b = a + 1; b < list.length; b += 1) {
          const key = list[a] + '\u0000' + list[b]
          if (pairSentences.size >= MAX_PAIRS && !pairSentences.has(key)) continue
          pairSentences.set(key, (pairSentences.get(key) ?? 0) + 1)
          docPairs.add(key)
        }
      }
    }
    used.push(doc)
    scannedChars += docChars
    if (counts.size === 0) continue
    docCounts.set(doc.file, counts)
    for (const [id, count] of counts) {
      totalCount.set(id, (totalCount.get(id) ?? 0) + count)
      let seen = docPresence.get(id)
      if (seen === undefined) {
        seen = new Set()
        docPresence.set(id, seen)
      }
      seen.add(doc.file)
    }
    for (const key of docPairs) pairDocs.set(key, (pairDocs.get(key) ?? 0) + 1)
  }

  // ── 4. Keep the most connected words when the vocabulary is huge ─────────
  const ranked = entries
    .map((item) => ({
      item,
      docs: docPresence.get(item.id)?.size ?? 0,
      total: totalCount.get(item.id) ?? 0,
    }))
    .sort((left, right) => (
      (right.docs - left.docs)
      || (right.total - left.total)
      || compareText(left.item.word, right.item.word)
      || compareText(left.item.id, right.item.id)
    ))
  const selected = ranked.slice(0, maxWords).map((row) => row.item)
  const truncatedWords = Math.max(0, entries.length - selected.length)
  const selectedIds = new Set(selected.map((item) => item.id))

  // ── 5. Transcript <-> word edges ────────────────────────────────────────
  const wordLinks = []
  for (const item of selected) {
    const sourceInfo = isRecord(item.entry.source) ? item.entry.source : {}
    const originRef = String(sourceInfo.transcript ?? '').trim()
    const rows = []
    for (const doc of used) {
      const count = docCounts.get(doc.file)?.get(item.id) ?? 0
      const origin = originRef !== '' && sameFileName(doc.file, originRef)
      if (count === 0 && !origin) continue
      rows.push({ doc, count, origin })
    }
    rows.sort((left, right) => (
      Number(right.origin) - Number(left.origin)
      || (right.count - left.count)
      || compareText(left.doc.file, right.doc.file)
    ))
    // The origin edge is mandatory and counts against MAX_APPEARS_PER_WORD;
    // a hard zero cap still keeps that one source edge.
    const origins = rows.filter((row) => row.origin).length
    const extrasBudget = Math.max(0, maxAppears - origins)
    let extras = 0
    for (const row of rows) {
      if (!row.origin) {
        if (extras >= extrasBudget) continue
        extras += 1
      }
      const nodeId = 't:' + row.doc.file
      const link = {
        id: 'appears:' + nodeId + '|w:' + item.id,
        kind: 'appears',
        source: nodeId,
        target: 'w:' + item.id,
        count: row.count,
        origin: row.origin,
      }
      if (row.origin) {
        const sample = sampleOf(item.entry, row.doc.file, row.doc.title)
        if (sample !== undefined) link.sample = sample
      }
      wordLinks.push(link)
    }
  }

  // ── 6. Word <-> word: same-sentence co-occurrence ───────────────────────
  const cooccurCandidates = []
  for (const [key, sentences] of pairSentences) {
    const parts = key.split('\u0000')
    const left = parts[0]
    const right = parts[1]
    if (!selectedIds.has(left) || !selectedIds.has(right)) continue
    cooccurCandidates.push({
      left,
      right,
      sentences,
      docs: pairDocs.get(key) ?? 0,
    })
  }
  cooccurCandidates.sort((a, b) => (
    (b.sentences - a.sentences)
    || (b.docs - a.docs)
    || compareText(a.left, b.left)
    || compareText(a.right, b.right)
  ))
  const cooccurDegree = new Map()
  const cooccurLinks = []
  for (const candidate of cooccurCandidates) {
    if ((cooccurDegree.get(candidate.left) ?? 0) >= maxCooccur) continue
    if ((cooccurDegree.get(candidate.right) ?? 0) >= maxCooccur) continue
    cooccurDegree.set(candidate.left, (cooccurDegree.get(candidate.left) ?? 0) + 1)
    cooccurDegree.set(candidate.right, (cooccurDegree.get(candidate.right) ?? 0) + 1)
    cooccurLinks.push({
      id: 'cooccur:w:' + candidate.left + '|w:' + candidate.right,
      kind: 'cooccur',
      source: 'w:' + candidate.left,
      target: 'w:' + candidate.right,
      sentences: candidate.sentences,
      docs: candidate.docs,
    })
  }

  // ── 7. Word <-> word: shared root or shared word form ───────────────────
  const morphByPair = new Map()
  function addMorph(left, right, reason, detail) {
    if (left === right) return
    const first = left < right ? left : right
    const second = left < right ? right : left
    const key = first + '\u0000' + second
    const current = morphByPair.get(key)
    if (current === undefined) {
      morphByPair.set(key, { first, second, reason, detail })
      return
    }
    // A shared form is stronger evidence than a shared root: keep it.
    if (current.reason === 'root' && reason === 'family') {
      morphByPair.set(key, { first, second, reason, detail })
    }
  }
  const rootIndex = new Map()
  for (const item of selected) {
    const parts = Array.isArray(item.entry.etymology?.parts) ? item.entry.etymology.parts : []
    for (const part of parts) {
      if (!isRecord(part)) continue
      const normalized = normalizePart(part.part)
      if (normalized.length < MIN_ROOT_PART || AFFIX_STOPLIST.has(normalized)) continue
      let list = rootIndex.get(normalized)
      if (list === undefined) {
        list = []
        rootIndex.set(normalized, list)
      }
      if (!list.includes(item.id)) list.push(item.id)
    }
  }
  for (const [part, list] of rootIndex) {
    const sorted = [...list].sort(compareText)
    for (let a = 0; a < sorted.length; a += 1) {
      for (let b = a + 1; b < sorted.length; b += 1) addMorph(sorted[a], sorted[b], 'root', part)
    }
  }
  const formIndex = new Map()
  for (const item of selected) {
    const forms = [item.word, ...(Array.isArray(item.entry.family)
      ? item.entry.family.map((form) => (isRecord(form) ? form.form : ''))
      : [])]
    for (const raw of forms) {
      // Normalize like the matcher does, so "well known" and "well-known"
      // are the same word form instead of two unrelated keys.
      const form = tokenize(raw).join(' ')
      if (form === '') continue
      let list = formIndex.get(form)
      if (list === undefined) {
        list = []
        formIndex.set(form, list)
      }
      if (!list.includes(item.id)) list.push(item.id)
    }
  }
  for (const [form, list] of formIndex) {
    const sorted = [...list].sort(compareText)
    for (let a = 0; a < sorted.length; a += 1) {
      for (let b = a + 1; b < sorted.length; b += 1) addMorph(sorted[a], sorted[b], 'family', form)
    }
  }
  const morphLinks = [...morphByPair.values()]
    .sort((left, right) => compareText(left.first, right.first) || compareText(left.second, right.second))
    .map((pair) => ({
      id: 'morph:w:' + pair.first + '|w:' + pair.second,
      kind: 'morph',
      source: 'w:' + pair.first,
      target: 'w:' + pair.second,
      reason: pair.reason,
      detail: pair.detail,
    }))

  // ── 8. Word <-> word: shared Chinese meaning fragment ───────────────────
  const atomIndex = new Map()
  for (const item of selected) {
    for (const meaning of meaningsOf(item.entry)) {
      for (const atom of senseAtoms(meaning.zh)) {
        let list = atomIndex.get(atom)
        if (list === undefined) {
          list = []
          atomIndex.set(atom, list)
        }
        if (!list.includes(item.id)) list.push(item.id)
      }
    }
  }
  const senseByPair = new Map()
  const atoms = [...atomIndex.keys()].sort(compareText)
  for (const atom of atoms) {
    const sorted = [...(atomIndex.get(atom) ?? [])].sort(compareText)
    for (let a = 0; a < sorted.length; a += 1) {
      for (let b = a + 1; b < sorted.length; b += 1) {
        const key = sorted[a] + '\u0000' + sorted[b]
        if (senseByPair.has(key)) continue
        senseByPair.set(key, { left: sorted[a], right: sorted[b], atom })
      }
    }
  }
  const senseLinks = [...senseByPair.values()]
    .sort((left, right) => compareText(left.left, right.left) || compareText(left.right, right.right))
    .map((pair) => ({
      id: 'sense:w:' + pair.left + '|w:' + pair.right,
      kind: 'sense',
      source: 'w:' + pair.left,
      target: 'w:' + pair.right,
      detail: pair.atom,
    }))

  // ── 9. Nodes, degree and the final sorted payload ───────────────────────
  const transcriptIds = new Set()
  for (const link of wordLinks) transcriptIds.add(link.source)
  const wordNodes = [...selected]
    .sort((left, right) => compareText(left.word, right.word) || compareText(left.id, right.id))
    .map((item) => ({
      id: 'w:' + item.id,
      kind: 'word',
      entryId: item.id,
      word: item.word,
      ipa: collapse(item.entry.ipa),
      meanings: meaningsOf(item.entry).slice(0, 8),
      mastery: masteryOf(states, item.id),
      sentence: clipText(item.entry.sentence, MAX_SAMPLE_CHARS),
      degree: 0,
    }))
  const transcriptNodes = []
  for (const doc of used) {
    const nodeId = 't:' + doc.file
    if (!transcriptIds.has(nodeId)) continue
    const counts = docCounts.get(doc.file)
    transcriptNodes.push({
      id: nodeId,
      kind: 'transcript',
      file: doc.file,
      title: doc.title,
      segments: Array.isArray(doc.document.segments) ? doc.document.segments.length : 0,
      durationMs: Number.isFinite(Number(doc.document.durationMs)) ? Math.max(0, Math.round(Number(doc.document.durationMs))) : 0,
      speakers: Array.isArray(doc.document.speakers) ? doc.document.speakers.length : 0,
      matchedWords: counts === undefined ? 0 : counts.size,
      degree: 0,
    })
  }
  transcriptNodes.sort((left, right) => compareText(left.file, right.file))
  const nodes = [...wordNodes, ...transcriptNodes]

  const allLinks = [...wordLinks, ...cooccurLinks, ...morphLinks, ...senseLinks]
  allLinks.sort((left, right) => (
    (LINK_RANK[left.kind] ?? 99) - (LINK_RANK[right.kind] ?? 99)
    || compareText(left.id, right.id)
  ))
  const links = allLinks.length > MAX_LINKS ? allLinks.slice(0, MAX_LINKS) : allLinks
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  for (const link of links) {
    const sourceNode = nodeById.get(link.source)
    const targetNode = nodeById.get(link.target)
    if (sourceNode !== undefined) sourceNode.degree += 1
    if (targetNode !== undefined) targetNode.degree += 1
  }

  const linkedWords = wordNodes.filter((node) => node.degree > 0).length
  const linkedTranscripts = transcriptNodes.filter((node) => node.degree > 0).length
  const count = (kind) => links.filter((link) => link.kind === kind).length
  return {
    version: GRAPH_VERSION,
    summary: {
      words: wordNodes.length,
      transcripts: used.length,
      linkedWords,
      linkedTranscripts,
      isolatedWords: wordNodes.length - linkedWords,
      links: {
        appears: count('appears'),
        cooccur: count('cooccur'),
        morph: count('morph'),
        sense: count('sense'),
        total: links.length,
      },
      truncated: { words: truncatedWords, transcripts: truncatedTranscripts },
    },
    nodes,
    links,
  }
}

/**
 * Read every readable `*.json` transcript document (same shape analysis.js loads).
 * Returns `{ documents, truncated }`: the directory listing is capped at
 * MAX_DOCUMENTS so the builder's own document cap can never hide the rest
 * silently; `truncated` is the number of files that were never attempted.
 */
async function loadDocuments(store, root, config) {
  const empty = () => ({ documents: [], truncated: 0 })
  if (store === undefined || store === null || typeof store.readJsonFile !== 'function') return empty()
  let directory
  try {
    directory = resolveInWorkspace(root, config?.dirs?.transcripts ?? 'transcripts')
  } catch {
    return empty()
  }
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return empty()
  }
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name)
    .sort(compareText)
  const selected = files.slice(0, MAX_DOCUMENTS)
  const documents = []
  for (const file of selected) {
    let detail
    try {
      detail = await store.readJsonFile(join(directory, file), undefined)
    } catch {
      continue
    }
    if (!isRecord(detail?.value)) continue
    const document = detail.value
    documents.push({
      file,
      title: collapse(document.title) || fileStem(file),
      document,
    })
  }
  return { documents, truncated: Math.max(0, files.length - selected.length) }
}

/**
 * Graph service: loads the workspace inputs and delegates to buildGraph().
 * Read-only — it never writes, never locks and never sorts with a locale.
 * `now` is injectable for tests.
 */
export function createGraphService(options = {}) {
  const store = options.store
  const vocab = options.vocab
  const recall = options.recall
  const now = typeof options.now === 'function' ? options.now : () => new Date()

  async function readStates(root) {
    if (recall === undefined || recall === null || typeof recall.read !== 'function') return {}
    try {
      const data = await recall.read(root)
      return isRecord(data?.words) ? data.words : {}
    } catch {
      // A broken recall progress file must never break the graph.
      return {}
    }
  }

  async function overview(root, config) {
    const data = await vocab.read(root)
    const words = Array.isArray(data?.words) ? data.words : []
    const states = await readStates(root)
    const loaded = await loadDocuments(store, root, config)
    const stamp = now()
    const date = stamp instanceof Date && !Number.isNaN(stamp.getTime()) ? stamp : new Date()
    return {
      ...buildGraph({ documents: loaded.documents, documentsTruncated: loaded.truncated, words, states }),
      generatedAt: date.toISOString(),
    }
  }

  return { overview }
}
