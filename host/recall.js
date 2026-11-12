/**
 * Recall (背记) — active-recall practice built on top of the wordbook.
 *
 * Data file: `<workspace>/.dsh-english/recall.json` (version 1, private to this
 * module; see AGENTS.md). `words` holds one state per wordbook word entry
 * (mastery 0..5 + SRS counters), `days` holds the last MAX_DAY_RECORDS daily
 * rounds: the items planned for that local day plus the graded results.
 *
 * Key rules:
 * - Dates are the HOST LOCAL calendar day (`YYYY-MM-DD`); never UTC dates.
 *   `addDays()` does arithmetic on UTC date components so DST never shifts a
 *   local day.
 * - The day's round is planned once: only when `days[today]` is missing or its
 *   `items` are empty. Reopening the panel on the same day never reshuffles or
 *   appends; a word added to the wordbook after the round was planned joins a
 *   later day.
 * - Grading clamps mastery to 0..MAX_MASTERY and schedules
 *   `nextAt = today + max(1, INTERVAL_DAYS[mastery])`, so a wrong word comes
 *   back at the earliest tomorrow (never twice on the same day).
 * - Wordbook deletions are lazily cleaned on the next read: states of entries
 *   that are gone (or are not `kind === 'word'`) are dropped together with
 *   their day item/result references. Capped day history is pruned to the most
 *   recent MAX_DAY_RECORDS dates. Invalid stored fields are repaired or
 *   dropped, never thrown — a broken progress file must not block reading.
 *
 * Only `node:path` and `./paths.js` are imported (avoid cycles with the other
 * host modules). All read-modify-write cycles run inside `store.locked()` on
 * the recall file; the wordbook is only ever read via `vocab.read(root)`.
 */
import { join } from 'node:path'
import { fail, isRecord, RECALL_REL } from './paths.js'

export const MAX_MASTERY = 5
export const GRADES = Object.freeze(['again', 'hard', 'good', 'easy'])
export const GRADE_DELTA = Object.freeze({ again: -2, hard: -1, good: 1, easy: 2 })
export const INTERVAL_DAYS = Object.freeze([1, 1, 2, 4, 7, 15])
export const HISTORY_DAYS = 14
export const MAX_DAY_RECORDS = 180

/** Panel practice modes: mix alternates en→zh / zh→en; the two concrete modes are stored on results. */
export const RECALL_MODES = Object.freeze(['mix', 'en-zh', 'zh-en'])
const ITEM_MODES = Object.freeze(['en-zh', 'zh-en'])

/** Duplicated (not imported) from config.js on purpose: recall.js must not import host modules. */
const DEFAULT_RECALL = Object.freeze({ newPerDay: 10, dailyLimit: 30, mode: 'mix' })
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDate(year, month, day) {
  return String(year).padStart(4, '0') + '-' + pad2(month) + '-' + pad2(day)
}

function toInteger(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function toMastery(value) {
  return clampNumber(toInteger(value, 0), 0, MAX_MASTERY)
}

function toCount(value) {
  return Math.max(0, toInteger(value, 0))
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value === '') return false
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false
  return Number.isFinite(Date.parse(value))
}

function parseDateString(text) {
  if (typeof text !== 'string') return null
  const match = DATE_RE.exec(text)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day }
}

/** True for a real calendar day in `YYYY-MM-DD` form (rejects 2026-02-30, 2026-1-1, non strings). */
export function isDateString(text) {
  return parseDateString(text) !== null
}

/** The host-local calendar day of a Date (never the UTC day). */
export function localDateOf(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return formatDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
}

/** Add whole days to a `YYYY-MM-DD` day using UTC date components (DST/timezone safe). */
export function addDays(dateString, days) {
  const parts = parseDateString(dateString)
  if (parts === null) return ''
  const amount = Math.trunc(Number(days))
  if (!Number.isFinite(amount)) return ''
  const time = Date.UTC(parts.year, parts.month - 1, parts.day) + amount * 86400000
  const date = new Date(time)
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/** Normalized recall settings (falls back to the config defaults for missing/invalid values). */
export function recallConfig(config) {
  const raw = isRecord(config?.recall) ? config.recall : {}
  const newPerDay = raw.newPerDay === undefined
    ? DEFAULT_RECALL.newPerDay
    : clampNumber(toInteger(raw.newPerDay, DEFAULT_RECALL.newPerDay), 0, 100)
  const dailyLimit = raw.dailyLimit === undefined
    ? DEFAULT_RECALL.dailyLimit
    : clampNumber(toInteger(raw.dailyLimit, DEFAULT_RECALL.dailyLimit), 1, 200)
  const mode = RECALL_MODES.includes(raw.mode) ? raw.mode : DEFAULT_RECALL.mode
  return { newPerDay, dailyLimit, mode }
}

function isWordEntry(entry) {
  return isRecord(entry) && entry.kind === 'word' && typeof entry.id === 'string' && entry.id !== ''
}

function hasMeanings(entry) {
  if (!Array.isArray(entry?.meanings)) return false
  return entry.meanings.some((meaning) => isRecord(meaning) && typeof meaning.zh === 'string' && meaning.zh.trim() !== '')
}

/** A word entry can be practiced only when it has a word and at least one Chinese meaning. */
function isPlayableEntry(entry) {
  return isWordEntry(entry) && String(entry.word ?? '').trim() !== '' && hasMeanings(entry)
}

/** Deterministic case-insensitive word order ("字典序", stable across locales). */
function compareWords(left, right) {
  const a = String(left ?? '').toLowerCase()
  const b = String(right ?? '').toLowerCase()
  if (a < b) return -1
  if (a > b) return 1
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** A learned word is due when its next review day is today or already past. */
function isDueState(state, today) {
  if (!isRecord(state)) return false
  if (!isDateString(state.nextAt)) return true
  return state.nextAt <= today
}

function sanitizeState(key, raw) {
  if (!isRecord(raw)) return null
  const fallbackId = typeof key === 'string' ? key.trim() : ''
  const id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : fallbackId
  if (id === '') return null
  // Spec §1: an untrustworthy stored date drops the whole state (it re-enters as a new word).
  if (raw.nextAt !== undefined && raw.nextAt !== null && !isDateString(raw.nextAt)) return null
  if (raw.createdAt !== undefined && raw.createdAt !== null && !isDateString(raw.createdAt)) return null
  if (raw.lastAt !== undefined && raw.lastAt !== null && !isIsoTimestamp(raw.lastAt)) return null
  return {
    id,
    word: typeof raw.word === 'string' ? raw.word.trim() : '',
    mastery: toMastery(raw.mastery),
    reviews: toCount(raw.reviews),
    correct: toCount(raw.correct),
    streak: toCount(raw.streak),
    lapses: toCount(raw.lapses),
    lastGrade: GRADES.includes(raw.lastGrade) ? raw.lastGrade : null,
    lastMode: ITEM_MODES.includes(raw.lastMode) ? raw.lastMode : null,
    lastAt: isIsoTimestamp(raw.lastAt) ? raw.lastAt : null,
    nextAt: isDateString(raw.nextAt) ? raw.nextAt : null,
    createdAt: isDateString(raw.createdAt) ? raw.createdAt : null,
  }
}

function sanitizeResult(raw) {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '' || !GRADES.includes(raw.grade)) return null
  return {
    id,
    grade: raw.grade,
    mode: ITEM_MODES.includes(raw.mode) ? raw.mode : '',
    at: isIsoTimestamp(raw.at) ? raw.at : '',
  }
}

function sanitizeDay(key, raw) {
  if (!isRecord(raw)) return null
  const date = isDateString(raw.date) ? raw.date : isDateString(key) ? key : null
  if (date === null) return null
  const items = []
  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (typeof item !== 'string') continue
      const id = item.trim()
      if (id === '' || items.includes(id)) continue
      items.push(id)
    }
  }
  const results = []
  if (Array.isArray(raw.results)) {
    const seen = new Set()
    for (const item of raw.results) {
      const result = sanitizeResult(item)
      if (result === null || seen.has(result.id)) continue
      seen.add(result.id)
      results.push(result)
    }
  }
  if (items.length === 0 && results.length === 0) return null
  return {
    date,
    createdAt: isIsoTimestamp(raw.createdAt) ? raw.createdAt : null,
    items,
    results,
  }
}

/**
 * Normalize a raw recall.json document; never throws.
 * Invalid scalar fields are clamped/repaired, invalid days/results and empty
 * day records are dropped. Always returns `{ version: 1, words, days }`.
 */
export function sanitizeRecallData(raw) {
  const data = { version: 1, words: {}, days: {} }
  if (!isRecord(raw)) return data
  if (isIsoTimestamp(raw.updatedAt)) data.updatedAt = raw.updatedAt
  if (isRecord(raw.words)) {
    for (const [key, value] of Object.entries(raw.words)) {
      const state = sanitizeState(key, value)
      if (state !== null) data.words[state.id] = state
    }
  }
  if (isRecord(raw.days)) {
    for (const [key, value] of Object.entries(raw.days)) {
      const day = sanitizeDay(key, value)
      if (day !== null) data.days[day.date] = day
    }
  }
  return data
}

/**
 * Apply one grade to a word state (pure). `options = { now, today, id, word, mode }`.
 * A missing previous state starts from `{ mastery: 0, reviews: 0, correct: 0, streak: 0, lapses: 0 }`,
 * so a brand-new word graded "good" becomes mastery 1 and is reviewed tomorrow.
 */
export function applyGrade(previousState, grade, options = {}) {
  const delta = GRADE_DELTA[grade]
  if (delta === undefined) fail('recall/invalid', '评分必须是 again / hard / good / easy')
  const previous = isRecord(previousState) ? previousState : {}
  const rawNow = options.now === undefined ? new Date() : options.now instanceof Date ? options.now : new Date(options.now)
  const now = Number.isNaN(rawNow.getTime()) ? new Date() : rawNow
  const today = isDateString(options.today) ? options.today : localDateOf(now)
  const mastery = clampNumber(toMastery(previous.mastery) + delta, 0, MAX_MASTERY)
  const interval = Math.max(1, INTERVAL_DAYS[mastery] ?? 1)
  const id = typeof options.id === 'string' && options.id !== '' ? options.id : typeof previous.id === 'string' ? previous.id : null
  const word = typeof options.word === 'string' ? options.word.trim() : typeof previous.word === 'string' ? previous.word : ''
  const mode = ITEM_MODES.includes(options.mode) ? options.mode : ITEM_MODES.includes(previous.lastMode) ? previous.lastMode : null
  const passed = grade === 'good' || grade === 'easy'
  const lapse = grade === 'again' && toMastery(previous.mastery) >= 3 ? 1 : 0
  return {
    id,
    word,
    mastery,
    reviews: toCount(previous.reviews) + 1,
    correct: toCount(previous.correct) + (passed ? 1 : 0),
    streak: passed ? toCount(previous.streak) + 1 : 0,
    lapses: toCount(previous.lapses) + lapse,
    lastGrade: grade,
    lastMode: mode,
    lastAt: now.toISOString(),
    nextAt: addDays(today, interval),
    createdAt: isDateString(previous.createdAt) ? previous.createdAt : today,
  }
}

/**
 * Plan today's round (pure). Returns `[{ entryId, status: 'new' | 'due' }]`.
 * Due words first (oldest nextAt, then lowest mastery, then word order), then
 * up to `newPerDay` never-seen words (newest wordbook additions first), then
 * truncated to `dailyLimit`.
 */
export function planRound(wordEntries, states, today, config) {
  const settings = recallConfig(config)
  const date = isDateString(today) ? today : localDateOf()
  const stateMap = isRecord(states) ? states : {}
  const due = []
  const fresh = []
  for (const entry of Array.isArray(wordEntries) ? wordEntries : []) {
    if (!isPlayableEntry(entry)) continue
    const state = isRecord(stateMap[entry.id]) ? stateMap[entry.id] : undefined
    if (state === undefined) fresh.push(entry)
    else if (isDueState(state, date)) due.push({ entry, state })
  }
  due.sort((left, right) => {
    const leftNext = isDateString(left.state.nextAt) ? left.state.nextAt : ''
    const rightNext = isDateString(right.state.nextAt) ? right.state.nextAt : ''
    if (leftNext !== rightNext) return leftNext < rightNext ? -1 : 1
    const leftMastery = toMastery(left.state.mastery)
    const rightMastery = toMastery(right.state.mastery)
    if (leftMastery !== rightMastery) return leftMastery - rightMastery
    return compareWords(left.entry.word, right.entry.word)
  })
  fresh.sort((left, right) => {
    const leftCreated = typeof left.createdAt === 'string' ? left.createdAt : ''
    const rightCreated = typeof right.createdAt === 'string' ? right.createdAt : ''
    if (leftCreated !== rightCreated) return leftCreated < rightCreated ? 1 : -1
    return compareWords(left.word, right.word)
  })
  const plan = due.map(({ entry }) => ({ entryId: entry.id, status: 'due' }))
  for (const entry of fresh.slice(0, settings.newPerDay)) plan.push({ entryId: entry.id, status: 'new' })
  return plan.slice(0, settings.dailyLimit)
}

function overviewWords(entries, states) {
  return entries
    .map((entry) => {
      const state = isRecord(states[entry.id]) ? states[entry.id] : null
      return {
        entryId: entry.id,
        word: String(entry.word ?? ''),
        mastery: state === null ? 0 : toMastery(state.mastery),
        learned: state !== null,
        nextAt: state !== null && isDateString(state.nextAt) ? state.nextAt : null,
        reviews: state === null ? 0 : toCount(state.reviews),
        correct: state === null ? 0 : toCount(state.correct),
        streak: state === null ? 0 : toCount(state.streak),
        lastGrade: state !== null && GRADES.includes(state.lastGrade) ? state.lastGrade : null,
      }
    })
    .sort((left, right) => left.mastery - right.mastery || compareWords(left.word, right.word))
}

function streakDaysOf(data, today) {
  const days = isRecord(data.days) ? data.days : {}
  const hasResults = (date) => {
    const day = days[date]
    return isRecord(day) && Array.isArray(day.results) && day.results.length > 0
  }
  let cursor = hasResults(today) ? today : addDays(today, -1)
  let count = 0
  while (cursor !== '' && hasResults(cursor)) {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

function buildHistory(data, today) {
  const days = isRecord(data.days) ? data.days : {}
  const start = addDays(today, -(HISTORY_DAYS - 1))
  const rows = []
  for (const [date, day] of Object.entries(days)) {
    if (!isDateString(date) || date > today || date < start) continue
    if (!isRecord(day)) continue
    const items = Array.isArray(day.items) ? day.items : []
    const results = Array.isArray(day.results) ? day.results : []
    rows.push({
      date,
      total: items.length,
      done: results.length,
      correct: results.filter((result) => result.grade === 'good' || result.grade === 'easy').length,
    })
  }
  rows.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
  return rows
}

/**
 * Read-only Overview view (pure) over already planned + persisted data.
 * Fields are the frozen Host↔Client contract; see spec §3.2.
 */
export function buildOverview(data, wordEntries, config, today) {
  const settings = recallConfig(config)
  const date = isDateString(today) ? today : localDateOf()
  const doc = isRecord(data) ? data : { version: 1, words: {}, days: {} }
  const entries = (Array.isArray(wordEntries) ? wordEntries : []).filter(isWordEntry)
  const playable = entries.filter(isPlayableEntry)
  const states = isRecord(doc.words) ? doc.words : {}
  const day = isRecord(doc.days) && isRecord(doc.days[date]) ? doc.days[date] : null
  const resultById = new Map()
  for (const result of Array.isArray(day?.results) ? day.results : []) {
    if (isRecord(result) && typeof result.id === 'string') resultById.set(result.id, result)
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  const items = []
  for (const entryId of Array.isArray(day?.items) ? day.items : []) {
    const entry = entryById.get(entryId)
    if (entry === undefined) continue
    const result = resultById.get(entryId)
    const state = isRecord(states[entryId]) ? states[entryId] : null
    items.push({
      entryId,
      word: String(entry.word ?? ''),
      ipa: typeof entry.ipa === 'string' ? entry.ipa : '',
      meanings: Array.isArray(entry.meanings)
        ? entry.meanings
          .filter((meaning) => isRecord(meaning) && typeof meaning.zh === 'string' && meaning.zh.trim() !== '')
          .map((meaning) => ({ pos: String(meaning.pos ?? ''), zh: meaning.zh.trim() }))
        : [],
      family: Array.isArray(entry.family)
        ? entry.family
          .filter((form) => isRecord(form) && typeof form.form === 'string' && form.form.trim() !== '')
          .map((form) => ({ label: String(form.label ?? ''), form: form.form.trim() }))
        : [],
      sentence: typeof entry.sentence === 'string' ? entry.sentence : '',
      sentenceZh: typeof entry.sentenceZh === 'string' ? entry.sentenceZh : '',
      mastery: state === null ? 0 : toMastery(state.mastery),
      status: state === null ? 'new' : 'due',
      done: result !== undefined,
      result: result === undefined
        ? null
        : {
          grade: result.grade,
          mode: typeof result.mode === 'string' ? result.mode : '',
          at: typeof result.at === 'string' ? result.at : '',
        },
    })
  }
  const stateOf = (entry) => (isRecord(states[entry.id]) ? states[entry.id] : null)
  const results = Array.isArray(day?.results) ? day.results : []
  const correct = results.filter((result) => result.grade === 'good' || result.grade === 'easy').length
  const wrong = results.filter((result) => result.grade === 'again' || result.grade === 'hard').length
  let nextAt = null
  for (const entry of entries) {
    const state = stateOf(entry)
    if (state === null || !isDateString(state.nextAt) || state.nextAt <= date) continue
    if (nextAt === null || state.nextAt < nextAt) nextAt = state.nextAt
  }
  const summary = {
    words: entries.length,
    eligible: playable.length,
    new: playable.filter((entry) => stateOf(entry) === null).length,
    learning: playable.filter((entry) => {
      const state = stateOf(entry)
      if (state === null) return false
      const mastery = toMastery(state.mastery)
      return mastery >= 1 && mastery <= 3
    }).length,
    mastered: playable.filter((entry) => {
      const state = stateOf(entry)
      return state !== null && toMastery(state.mastery) >= 4
    }).length,
    due: playable.filter((entry) => {
      const state = stateOf(entry)
      return state !== null && isDueState(state, date)
    }).length,
    roundTotal: items.length,
    roundDone: items.filter((item) => item.done).length,
    correct,
    wrong,
    streakDays: streakDaysOf(doc, date),
    nextAt,
  }
  return {
    date,
    config: { newPerDay: settings.newPerDay, dailyLimit: settings.dailyLimit, mode: settings.mode },
    summary,
    items,
    words: overviewWords(entries, states),
    history: buildHistory(doc, date),
  }
}

/**
 * Drop states for wordbook entries that no longer exist (or are sentences) and
 * their references inside `days`, then cap `days` to the latest
 * MAX_DAY_RECORDS dates. Returns `{ data, changed }`.
 */
function cleanupData(data, entries, today) {
  const doc = isRecord(data) ? data : { version: 1, words: {}, days: {} }
  const valid = new Map((Array.isArray(entries) ? entries : []).filter(isWordEntry).map((entry) => [entry.id, entry]))
  let changed = false
  const words = {}
  for (const [id, state] of Object.entries(isRecord(doc.words) ? doc.words : {})) {
    if (!valid.has(id)) {
      changed = true
      continue
    }
    words[id] = state
  }
  const days = {}
  for (const [date, day] of Object.entries(isRecord(doc.days) ? doc.days : {})) {
    if (!isRecord(day)) {
      changed = true
      continue
    }
    const items = []
    for (const id of Array.isArray(day.items) ? day.items : []) {
      if (!valid.has(id)) {
        changed = true
        continue
      }
      items.push(id)
    }
    const results = []
    for (const result of Array.isArray(day.results) ? day.results : []) {
      if (!isRecord(result) || !valid.has(result.id)) {
        changed = true
        continue
      }
      results.push(result)
    }
    if (items.length === 0 && results.length === 0) {
      changed = true
      continue
    }
    days[date] = { ...day, items, results }
  }
  const dates = Object.keys(days).sort()
  if (dates.length > MAX_DAY_RECORDS) {
    changed = true
    for (const date of dates.slice(0, dates.length - MAX_DAY_RECORDS)) delete days[date]
  }
  const cleaned = { version: 1, words, days }
  if (isIsoTimestamp(doc.updatedAt)) cleaned.updatedAt = doc.updatedAt
  return { data: cleaned, changed }
}

function hasDayRound(data, today) {
  return isRecord(data.days) && isRecord(data.days[today]) && Array.isArray(data.days[today].items) && data.days[today].items.length > 0
}

/**
 * Plan and store today's round when `days[today]` is missing or has no items.
 * An empty plan writes nothing (an empty wordbook must not create the file).
 */
function ensureRound(data, entries, config, today, iso) {
  if (hasDayRound(data, today)) return { data, planned: false }
  const plan = planRound(entries, data.words, today, config)
  if (plan.length === 0) return { data, planned: false }
  return {
    data: {
      ...data,
      version: 1,
      updatedAt: iso,
      days: {
        ...data.days,
        [today]: {
          date: today,
          createdAt: iso,
          items: plan.map((item) => item.entryId),
          results: [],
        },
      },
    },
    planned: true,
  }
}

/**
 * Recall service. `now` is injectable for tests (`() => Date`); every
 * read-modify-write cycle is serialized through `store.locked(recallPath)`.
 */
export function createRecallService(options) {
  const store = options.store
  const vocab = options.vocab
  const now = typeof options.now === 'function' ? options.now : () => new Date()

  function recallPath(root) {
    return join(String(root), RECALL_REL)
  }

  function current() {
    const raw = now()
    const date = raw instanceof Date ? raw : new Date(raw)
    const safe = Number.isNaN(date.getTime()) ? new Date() : date
    return { now: safe, today: localDateOf(safe), iso: safe.toISOString() }
  }

  /** Unlocked wordbook read: only the `kind === 'word'` entries are recalled. */
  async function readWordEntries(root) {
    const data = await vocab.read(root)
    const words = Array.isArray(data?.words) ? data.words : []
    return words.filter(isWordEntry)
  }

  async function readUnlocked(root) {
    const detail = await store.readJsonFile(recallPath(root), undefined)
    return { data: sanitizeRecallData(detail.value), missing: detail.missing === true, corrupted: detail.corrupted === true }
  }

  function writeUnlocked(root, data) {
    return store.atomicWriteText(recallPath(root), JSON.stringify(data, null, 2) + '\n')
  }

  /** Public read of the sanitized progress (tests / future tooling); serialized with writers. */
  async function read(root) {
    return store.locked(recallPath(root), async () => (await readUnlocked(root)).data)
  }

  async function overview(root, config) {
    const { today, iso } = current()
    return store.locked(recallPath(root), async () => {
      const entries = await readWordEntries(root)
      const loaded = await readUnlocked(root)
      const cleaned = cleanupData(loaded.data, entries, today)
      const ensured = ensureRound(cleaned.data, entries, config, today, iso)
      const data = ensured.planned || cleaned.changed ? { ...ensured.data, updatedAt: iso } : ensured.data
      if (ensured.planned || cleaned.changed) await writeUnlocked(root, data)
      return buildOverview(data, entries, config, today)
    })
  }

  async function grade(root, config, input) {
    const entryId = typeof input?.entryId === 'string' ? input.entryId.trim() : ''
    if (entryId === '') fail('recall/invalid', '缺少词条 id（entryId），请重新打开背记后再试')
    const gradeValue = input?.grade
    if (!GRADES.includes(gradeValue)) fail('recall/invalid', '评分必须是 again / hard / good / easy')
    const rawMode = input?.mode
    if (rawMode !== undefined && !ITEM_MODES.includes(rawMode)) fail('recall/invalid', '练习方式只能是 en-zh 或 zh-en')
    const { now: nowDate, today, iso } = current()
    return store.locked(recallPath(root), async () => {
      const entries = await readWordEntries(root)
      const entry = entries.find((item) => item.id === entryId)
      if (entry === undefined) fail('recall/not-found', '这个词已不在生词本中，请刷新背记再试')
      const loaded = await readUnlocked(root)
      const cleaned = cleanupData(loaded.data, entries, today)
      const ensured = ensureRound(cleaned.data, entries, config, today, iso)
      let data = ensured.data
      const previous = isRecord(data.words[entryId]) ? data.words[entryId] : undefined
      const day = isRecord(data.days[today]) && Array.isArray(data.days[today].items)
        ? data.days[today]
        : { date: today, createdAt: iso, items: [], results: [] }
      const existing = day.results.find((result) => result.id === entryId)
      const mode = rawMode !== undefined
        ? rawMode
        : existing !== undefined && ITEM_MODES.includes(existing.mode)
          ? existing.mode
          : ITEM_MODES.includes(previous?.lastMode)
            ? previous.lastMode
            : ''
      const state = applyGrade(previous, gradeValue, {
        now: nowDate,
        today,
        id: entryId,
        word: entry.word,
        mode: mode === '' ? undefined : mode,
      })
      const result = { id: entryId, grade: gradeValue, mode, at: state.lastAt }
      const items = day.items.includes(entryId) ? day.items : [...day.items, entryId]
      const results = existing === undefined
        ? [...day.results, result]
        : day.results.map((item) => (item.id === entryId ? result : item))
      data = {
        version: 1,
        updatedAt: iso,
        words: { ...data.words, [entryId]: state },
        days: { ...data.days, [today]: { date: today, createdAt: day.createdAt, items, results } },
      }
      await writeUnlocked(root, data)
      return buildOverview(data, entries, config, today)
    })
  }

  async function reset(root, config, input) {
    const all = input?.all === true
    const entryId = typeof input?.entryId === 'string' ? input.entryId.trim() : ''
    if (!all && entryId === '') fail('recall/invalid', '缺少词条 id（entryId），或传 all: true 清空全部进度')
    const { today, iso } = current()
    return store.locked(recallPath(root), async () => {
      const entries = await readWordEntries(root)
      if (!all && !entries.some((entry) => entry.id === entryId)) fail('recall/not-found', '这个词已不在生词本中，请刷新背记再试')
      const loaded = await readUnlocked(root)
      const cleaned = cleanupData(loaded.data, entries, today)
      let data
      if (all) {
        const replanned = ensureRound({ version: 1, words: {}, days: {} }, entries, config, today, iso)
        data = { ...replanned.data, version: 1, updatedAt: iso }
      } else {
        const words = { ...cleaned.data.words }
        delete words[entryId]
        const days = { ...cleaned.data.days }
        const day = isRecord(days[today]) && Array.isArray(days[today].items) ? days[today] : null
        if (day !== null) {
          const results = day.results.filter((result) => result.id !== entryId)
          const items = day.items.includes(entryId) ? day.items : [...day.items, entryId]
          days[today] = { ...day, items, results }
        }
        data = { version: 1, updatedAt: iso, words, days }
      }
      await writeUnlocked(root, data)
      return buildOverview(data, entries, config, today)
    })
  }

  return { overview, grade, reset, recallPath, read }
}
