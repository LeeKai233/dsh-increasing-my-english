/**
 * Host unit/service tests for the recall (背记) module.
 * Zero dependencies: node:test + node:assert/strict + a temp workspace.
 * The clock is injectable, so the daily-round rules are tested deterministically.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'
import { DomainError, RECALL_REL } from '../host/paths.js'
import {
  GRADE_DELTA,
  GRADES,
  HISTORY_DAYS,
  INTERVAL_DAYS,
  MAX_DAY_RECORDS,
  MAX_MASTERY,
  addDays,
  applyGrade,
  buildOverview,
  createRecallService,
  isDateString,
  localDateOf,
  planRound,
  sanitizeRecallData,
} from '../host/recall.js'
import { createVocabService } from '../host/vocab.js'

const CONFIG = normalizeConfig({}).config
const DAY = '2026-11-12'
const NEXT_DAY = '2026-11-13'

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-recall-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

function stubLookup() {
  return {
    async translate() {
      return { translation: '这是一句例句翻译。', cached: false }
    },
    async view() {
      return {
        ok: true,
        cached: false,
        kind: 'word',
        text: 'example',
        ipa: '/igˈzɑːmpəl/',
        meanings: [{ pos: 'n.', zh: '例子' }],
        family: [{ label: '复数', form: 'examples' }],
        etymology: undefined,
      }
    },
  }
}

/** Real vocab service + recall service sharing one store, with an injectable local clock. */
function createHarness(root, options = {}) {
  const store = createWorkspaceStore()
  const vocab = createVocabService({ store, lookup: options.lookup ?? stubLookup() })
  const clock = { value: options.now ?? new Date(2026, 10, 12, 10, 0, 0) }
  const recall = createRecallService({ store, vocab, now: () => clock.value })
  return { root, store, vocab, recall, clock }
}

async function addWord(harness, word, meanings) {
  const added = await harness.vocab.add(harness.root, CONFIG, {
    kind: 'word',
    word,
    ipa: '/' + word + '/',
    meanings: meanings ?? [{ pos: 'n.', zh: word + ' 的中文' }],
  })
  return added.id
}

async function readRecallFile(root) {
  return JSON.parse(await readFile(join(root, RECALL_REL), 'utf8'))
}

function vocabEntry(id, word, overrides = {}) {
  return {
    id,
    kind: 'word',
    word,
    ipa: '/' + word + '/',
    meanings: [{ pos: 'n.', zh: word + ' 释义' }],
    family: [],
    sentence: '',
    sentenceZh: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------------

test('localDateOf returns the host-local calendar day, not the UTC day', () => {
  assert.equal(localDateOf(new Date(2026, 0, 5, 0, 0, 0)), '2026-01-05')
  assert.equal(localDateOf(new Date(2026, 10, 12, 10, 30, 0)), '2026-11-12')
  assert.equal(localDateOf(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31')
})

test('addDays crosses months, years and leap days (UTC date-component math)', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-11-12', 1), '2026-11-13')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addDays('2024-02-29', 1), '2024-03-01')
  assert.equal(addDays('2025-02-28', 1), '2025-03-01')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-01-01', 365), '2027-01-01')
  assert.equal(addDays('2026-01-01', 366), '2027-01-02')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2026-03-01', 0), '2026-03-01')
  assert.equal(addDays('2026-11-12', 15), '2026-11-27')
  assert.equal(addDays('2026-01-15', -20), '2025-12-26')
  // "spring forward" style days never shift the local calendar day
  assert.equal(addDays('2026-03-08', 1), '2026-03-09')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('', 1), '')
  assert.equal(addDays('2026-13-01', 1), '')
  assert.equal(addDays('not-a-day', 1), '')
})

test('isDateString only accepts real canonical calendar days', () => {
  assert.equal(isDateString('2026-11-12'), true)
  assert.equal(isDateString('2024-02-29'), true)
  assert.equal(isDateString('2026-02-29'), false)
  assert.equal(isDateString('2026-02-30'), false)
  assert.equal(isDateString('2026-13-01'), false)
  assert.equal(isDateString('2026-00-10'), false)
  assert.equal(isDateString('2026-1-1'), false)
  assert.equal(isDateString('2026-11-12T00:00:00Z'), false)
  assert.equal(isDateString(''), false)
  assert.equal(isDateString(20261112), false)
  assert.equal(isDateString(null), false)
})

test('exposed constants match the frozen contract', () => {
  assert.equal(MAX_MASTERY, 5)
  assert.deepEqual([...GRADES], ['again', 'hard', 'good', 'easy'])
  assert.deepEqual({ ...GRADE_DELTA }, { again: -2, hard: -1, good: 1, easy: 2 })
  assert.deepEqual([...INTERVAL_DAYS], [1, 1, 2, 4, 7, 15])
  assert.equal(HISTORY_DAYS, 14)
  assert.equal(MAX_DAY_RECORDS, 180)
})

// ---------------------------------------------------------------------------
// applyGrade
// ---------------------------------------------------------------------------

test('applyGrade: a brand new word graded good starts at mastery 1 and returns tomorrow', () => {
  const now = new Date(2026, 10, 12, 10, 0, 0)
  const state = applyGrade(undefined, 'good', { now, today: DAY, id: 'id-1', word: 'example', mode: 'en-zh' })
  assert.equal(state.id, 'id-1')
  assert.equal(state.word, 'example')
  assert.equal(state.mastery, 1)
  assert.equal(state.reviews, 1)
  assert.equal(state.correct, 1)
  assert.equal(state.streak, 1)
  assert.equal(state.lapses, 0)
  assert.equal(state.lastGrade, 'good')
  assert.equal(state.lastMode, 'en-zh')
  assert.equal(state.lastAt, now.toISOString())
  assert.equal(state.nextAt, NEXT_DAY) // interval of mastery 1 = 1 day
  assert.equal(state.createdAt, DAY)
})

test('applyGrade: each grade moves mastery by the frozen delta and reschedules from the new interval', () => {
  const now = new Date(2026, 10, 12, 10, 0, 0)
  const previous = {
    id: 'id',
    word: 'word',
    mastery: 3,
    reviews: 4,
    correct: 2,
    streak: 2,
    lapses: 1,
    lastGrade: 'hard',
    lastMode: 'zh-en',
    lastAt: '2026-11-01T00:00:00.000Z',
    nextAt: DAY,
    createdAt: '2026-10-01',
  }
  const again = applyGrade(previous, 'again', { now, today: DAY, id: 'id', word: 'word', mode: 'zh-en' })
  assert.equal(again.mastery, 1) // 3 - 2
  assert.equal(again.nextAt, addDays(DAY, INTERVAL_DAYS[1]))
  assert.equal(again.streak, 0)
  assert.equal(again.correct, 2) // unchanged
  assert.equal(again.reviews, 5)
  assert.equal(again.lapses, 2) // previous mastery 3 => lapse recorded

  const hard = applyGrade(previous, 'hard', { now, today: DAY, id: 'id', word: 'word', mode: 'zh-en' })
  assert.equal(hard.mastery, 2)
  assert.equal(hard.nextAt, addDays(DAY, INTERVAL_DAYS[2])) // 2 days
  assert.equal(hard.streak, 0)
  assert.equal(hard.lapses, 1)
  assert.equal(hard.correct, 2)

  const good = applyGrade(previous, 'good', { now, today: DAY, id: 'id', word: 'word', mode: 'zh-en' })
  assert.equal(good.mastery, 4)
  assert.equal(good.nextAt, addDays(DAY, INTERVAL_DAYS[4])) // 7 days
  assert.equal(good.streak, 3)
  assert.equal(good.correct, 3)

  const easy = applyGrade(previous, 'easy', { now, today: DAY, id: 'id', word: 'word', mode: 'zh-en' })
  assert.equal(easy.mastery, 5)
  assert.equal(easy.nextAt, addDays(DAY, INTERVAL_DAYS[5])) // 15 days
  assert.equal(easy.streak, 3)
  assert.equal(easy.correct, 3)
})

test('applyGrade: mastery clamps to 0..MAX_MASTERY and lapses need a previous mastery >= 3', () => {
  const now = new Date(2026, 10, 12, 10, 0, 0)
  const againAtZero = applyGrade(
    { id: 'a', word: 'a', mastery: 0, reviews: 1, correct: 0, streak: 0, lapses: 2 },
    'again',
    { now, today: DAY, id: 'a', word: 'a' },
  )
  assert.equal(againAtZero.mastery, 0) // 0 - 2 clamps to 0
  assert.equal(againAtZero.lapses, 2) // previous mastery < 3 => no new lapse
  assert.equal(againAtZero.nextAt, NEXT_DAY) // minimum 1 day

  const maxed = applyGrade(
    { id: 'b', word: 'b', mastery: 5, reviews: 9, correct: 9, streak: 9, lapses: 0 },
    'easy',
    { now, today: DAY, id: 'b', word: 'b' },
  )
  assert.equal(maxed.mastery, 5) // clamp at 5
  assert.equal(maxed.nextAt, addDays(DAY, 15))
  assert.equal(maxed.streak, 10)

  const lapse = applyGrade(
    { id: 'c', word: 'c', mastery: 4, reviews: 3, correct: 3, streak: 3, lapses: 0 },
    'again',
    { now, today: DAY, id: 'c', word: 'c' },
  )
  assert.equal(lapse.mastery, 2)
  assert.equal(lapse.lapses, 1)

  const presets = applyGrade(
    { id: 'id', word: 'word', mastery: 2, reviews: 1, correct: 1, streak: 1, lapses: 0, lastAt: '2026-11-01T00:00:00.000Z', nextAt: DAY, createdAt: '2026-10-01' },
    'good',
    { now, today: DAY },
  )
  assert.equal(presets.id, 'id') // id / word / createdAt are preserved
  assert.equal(presets.word, 'word')
  assert.equal(presets.createdAt, '2026-10-01')
})

test('applyGrade rejects an unknown grade with recall/invalid', () => {
  assert.throws(
    () => applyGrade(undefined, 'amazing', { today: DAY }),
    (error) => codeOf(error) === 'recall/invalid',
  )
})

// ---------------------------------------------------------------------------
// planRound
// ---------------------------------------------------------------------------

test('planRound: due words first, ordered by nextAt, mastery then word; then new words', () => {
  const entries = [
    vocabEntry('a', 'apple'),
    vocabEntry('b', 'banana'),
    vocabEntry('c', 'cherry'),
    vocabEntry('d', 'date'),
    vocabEntry('e', 'elder'),
  ]
  const states = {
    a: { id: 'a', mastery: 4, nextAt: DAY },
    b: { id: 'b', mastery: 2, nextAt: '2026-11-10' },
    c: { id: 'c', mastery: 0, nextAt: DAY },
    d: { id: 'd', mastery: 1, nextAt: '2026-12-01' }, // not due yet
  }
  const config = { recall: { newPerDay: 2, dailyLimit: 30, mode: 'mix' } }
  const plan = planRound(entries, states, DAY, config)
  assert.deepEqual(plan.map((item) => item.entryId), ['b', 'c', 'a', 'e'])
  assert.deepEqual(plan.map((item) => item.status), ['due', 'due', 'due', 'new'])
})

test('planRound: newPerDay caps new words (newest additions first) and dailyLimit truncates', () => {
  const entries = [
    vocabEntry('due1', 'oldest', { createdAt: '2025-12-01T00:00:00.000Z' }),
    vocabEntry('newA', 'aaa', { createdAt: '2026-01-01T00:00:00.000Z' }),
    vocabEntry('newB', 'bbb', { createdAt: '2026-01-03T00:00:00.000Z' }),
    vocabEntry('newC', 'ccc', { createdAt: '2026-01-02T00:00:00.000Z' }),
  ]
  const states = { due1: { id: 'due1', mastery: 1, nextAt: '2026-11-11' } }
  const plan = planRound(entries, states, DAY, { recall: { newPerDay: 2, dailyLimit: 30, mode: 'mix' } })
  assert.deepEqual(plan.map((item) => item.entryId), ['due1', 'newB', 'newC'])
  assert.deepEqual(plan.map((item) => item.status), ['due', 'new', 'new'])

  const limited = planRound(entries, states, DAY, { recall: { newPerDay: 2, dailyLimit: 2, mode: 'mix' } })
  assert.deepEqual(limited.map((item) => item.entryId), ['due1', 'newB'])

  const oneNew = planRound(entries, states, DAY, { recall: { newPerDay: 1, dailyLimit: 30, mode: 'mix' } })
  assert.deepEqual(oneNew.map((item) => item.entryId), ['due1', 'newB'])

  const reviewOnly = planRound(entries, states, DAY, { recall: { newPerDay: 0, dailyLimit: 30, mode: 'mix' } })
  assert.deepEqual(reviewOnly.map((item) => item.entryId), ['due1'])
})

test('planRound: only word entries with a word and a Chinese meaning are playable', () => {
  const entries = [
    vocabEntry('word', 'word'),
    vocabEntry('sentence', 'ignored', { kind: 'sentence' }),
    vocabEntry('noMeanings', 'bare', { meanings: [] }),
    vocabEntry('emptyWord', ''),
    vocabEntry('emptyZh', 'foreign', { meanings: [{ pos: 'n.', zh: '  ' }] }),
    vocabEntry('future', 'future'),
  ]
  const states = { future: { id: 'future', mastery: 3, nextAt: '2026-12-01' } }
  const plan = planRound(entries, states, DAY, CONFIG)
  assert.deepEqual(plan.map((item) => item.entryId), ['word'])
  assert.deepEqual(planRound([], {}, DAY, CONFIG), [])
})

// ---------------------------------------------------------------------------
// sanitizeRecallData
// ---------------------------------------------------------------------------

test('sanitizeRecallData: non-objects and junk become an empty version 1 document', () => {
  for (const raw of [undefined, null, 42, 'x', [], true]) {
    assert.deepEqual(sanitizeRecallData(raw), { version: 1, words: {}, days: {} })
  }
  const stamp = '2026-11-12T03:00:00.000Z'
  assert.equal(sanitizeRecallData({ updatedAt: stamp }).updatedAt, stamp)
  assert.equal(sanitizeRecallData({ updatedAt: 'nope' }).updatedAt, undefined)
})

test('sanitizeRecallData: repairs scalars, drops invalid days/results and empty day records', () => {
  const data = sanitizeRecallData({
    version: 99,
    updatedAt: 'not-a-date',
    words: {
      good: {
        id: 'good',
        word: ' GoodWord ',
        mastery: 9,
        reviews: -3,
        correct: '2',
        streak: -1,
        lapses: 1.9,
        lastGrade: 'nope',
        lastMode: 'mix',
        lastAt: '2026-11-11T00:00:00.000Z',
        nextAt: '2026-11-12',
        createdAt: '2026-01-02',
        extra: true,
      },
      badDate: { id: 'badDate', word: 'x', nextAt: '2026-02-30', createdAt: 'yesterday' },
      badLastAt: { id: 'badLastAt', word: 'y', nextAt: '2026-11-20', lastAt: 'garbage' },
      notObject: 'nope',
      orphan: { mastery: 2, nextAt: '2026-11-20' },
    },
    days: {
      '2026-11-12': {
        date: '2026-11-12',
        createdAt: '2026-11-12T03:00:00.000Z',
        items: ['good', 7, 'good', '', 'badDate'],
        results: [
          { id: 'good', grade: 'good', mode: 'en-zh', at: '2026-11-12T03:01:00.000Z' },
          { id: 'good', grade: 'easy', mode: 'zh-en', at: '2026-11-12T03:02:00.000Z' },
          { id: 'good', grade: 'nope', mode: 'en-zh', at: '2026-11-12T03:03:00.000Z' },
          { id: 'badDate', grade: 'hard' },
          'junk',
        ],
      },
      nope: { date: 'nope', items: ['good'] },
      '2026-11-10': { date: '2026-11-10', items: [], results: [] },
      '2026-11-11': {
        date: '2026-11-11',
        items: [],
        results: [{ id: 'orphan', grade: 'good', mode: 'en-zh', at: '2026-11-11T00:00:00.000Z' }],
      },
    },
    other: 'junk',
  })
  assert.equal(data.version, 1)
  assert.equal(data.updatedAt, undefined)
  // a state carrying an untrustworthy date is dropped entirely (spec §1)
  assert.deepEqual(Object.keys(data.words).sort(), ['good', 'orphan'])
  assert.equal(data.words.badDate, undefined)
  assert.equal(data.words.badLastAt, undefined)
  assert.equal(data.words.good.mastery, 5)
  assert.equal(data.words.good.reviews, 0)
  assert.equal(data.words.good.correct, 2)
  assert.equal(data.words.good.streak, 0)
  assert.equal(data.words.good.lapses, 1)
  assert.equal(data.words.good.word, 'GoodWord')
  assert.equal(data.words.good.lastGrade, null)
  assert.equal(data.words.good.lastMode, null)
  assert.equal(data.words.good.lastAt, '2026-11-11T00:00:00.000Z')
  assert.equal(data.words.good.nextAt, '2026-11-12')
  assert.equal(data.words.good.createdAt, '2026-01-02')
  assert.equal(data.words.good.extra, undefined)
  assert.equal(data.words.orphan.id, 'orphan')
  assert.equal(data.words.orphan.mastery, 2)

  assert.deepEqual(data.days['2026-11-12'].items, ['good', 'badDate'])
  assert.equal(data.days['2026-11-12'].results.length, 2)
  assert.deepEqual(data.days['2026-11-12'].results[0], {
    id: 'good',
    grade: 'good',
    mode: 'en-zh',
    at: '2026-11-12T03:01:00.000Z',
  })
  assert.deepEqual(data.days['2026-11-12'].results[1], { id: 'badDate', grade: 'hard', mode: '', at: '' })
  assert.deepEqual(Object.keys(data.days).sort(), ['2026-11-11', '2026-11-12'])
  assert.deepEqual(data.days['2026-11-11'].items, [])
  assert.equal(data.days['2026-11-11'].results.length, 1)
})

// ---------------------------------------------------------------------------
// buildOverview (pure read view, frozen §3.2 shape)
// ---------------------------------------------------------------------------

test('buildOverview: frozen field names and summary/history math', () => {
  const entries = [
    vocabEntry('a', 'apple', {
      ipa: '/ˈæpəl/',
      meanings: [{ pos: 'n.', zh: '苹果' }],
      family: [{ label: '复数', form: 'apples' }],
      sentence: 'An apple.',
      sentenceZh: '一个苹果。',
    }),
    vocabEntry('b', 'banana'),
    vocabEntry('c', 'cherry'),
    vocabEntry('d', 'date'),
    { id: 's', kind: 'sentence', text: 'A full sentence.', translation: '一句话。' },
  ]
  const data = {
    version: 1,
    words: {
      a: { id: 'a', word: 'apple', mastery: 4, reviews: 5, correct: 4, streak: 2, lapses: 0, lastGrade: 'easy', lastMode: 'en-zh', lastAt: '2026-11-11T00:00:00.000Z', nextAt: DAY, createdAt: '2026-11-01' },
      b: { id: 'b', word: 'banana', mastery: 1, reviews: 1, correct: 1, streak: 1, lapses: 0, lastGrade: 'good', lastMode: 'zh-en', lastAt: '2026-11-12T01:00:00.000Z', nextAt: NEXT_DAY, createdAt: '2026-11-12' },
      d: { id: 'd', word: 'date', mastery: 5, reviews: 6, correct: 6, streak: 3, lapses: 0, lastGrade: 'easy', lastMode: 'en-zh', lastAt: '2026-11-12T02:00:00.000Z', nextAt: '2026-11-27', createdAt: '2026-10-01' },
    },
    days: {
      '2026-11-12': {
        date: '2026-11-12',
        createdAt: '2026-11-12T03:00:00.000Z',
        items: ['b', 'c', 'a'],
        results: [
          { id: 'b', grade: 'good', mode: 'zh-en', at: '2026-11-12T03:01:00.000Z' },
          { id: 'a', grade: 'again', mode: 'en-zh', at: '2026-11-12T03:02:00.000Z' },
        ],
      },
      '2026-11-11': {
        date: '2026-11-11',
        createdAt: '2026-11-11T03:00:00.000Z',
        items: ['a', 'd'],
        results: [
          { id: 'a', grade: 'hard', mode: 'en-zh', at: '2026-11-11T03:01:00.000Z' },
          { id: 'd', grade: 'good', mode: 'en-zh', at: '2026-11-11T03:02:00.000Z' },
        ],
      },
      '2026-10-01': { date: '2026-10-01', createdAt: '2026-10-01T03:00:00.000Z', items: ['a'], results: [] },
      '2026-11-20': { date: '2026-11-20', createdAt: '2026-11-20T03:00:00.000Z', items: ['a'], results: [] },
    },
  }
  const overview = buildOverview(data, entries, CONFIG, DAY)
  assert.deepEqual(Object.keys(overview).sort(), ['config', 'date', 'history', 'items', 'summary', 'words'])
  assert.equal(overview.date, DAY)
  assert.deepEqual(overview.config, { newPerDay: 10, dailyLimit: 30, mode: 'mix' })
  assert.deepEqual(
    Object.keys(overview.summary).sort(),
    ['correct', 'due', 'eligible', 'learning', 'mastered', 'new', 'nextAt', 'roundDone', 'roundTotal', 'streakDays', 'words', 'wrong'],
  )
  assert.equal(overview.summary.words, 4) // sentence entries never count
  assert.equal(overview.summary.eligible, 4)
  assert.equal(overview.summary.new, 1) // cherry has no state
  assert.equal(overview.summary.learning, 1) // banana mastery 1
  assert.equal(overview.summary.mastered, 2) // apple 4, date 5
  assert.equal(overview.summary.due, 1) // apple nextAt = today
  assert.equal(overview.summary.roundTotal, 3)
  assert.equal(overview.summary.roundDone, 2)
  assert.equal(overview.summary.correct, 1)
  assert.equal(overview.summary.wrong, 1)
  assert.equal(overview.summary.streakDays, 2) // today + yesterday have results
  assert.equal(overview.summary.nextAt, NEXT_DAY)

  assert.deepEqual(overview.items.map((item) => item.entryId), ['b', 'c', 'a'])
  assert.deepEqual(Object.keys(overview.items[0]).sort(), [
    'done', 'entryId', 'family', 'ipa', 'mastery', 'meanings', 'result', 'sentence', 'sentenceZh', 'status', 'word',
  ])
  assert.deepEqual(overview.items[0].meanings, [{ pos: 'n.', zh: 'banana 释义' }])
  assert.equal(overview.items[1].status, 'new')
  assert.equal(overview.items[1].done, false)
  assert.equal(overview.items[1].result, null)
  assert.equal(overview.items[2].status, 'due')
  assert.deepEqual(overview.items[2].result, { grade: 'again', mode: 'en-zh', at: '2026-11-12T03:02:00.000Z' })
  assert.equal(overview.items[2].mastery, 4)
  assert.equal(overview.items[2].ipa, '/ˈæpəl/')
  assert.deepEqual(overview.items[2].family, [{ label: '复数', form: 'apples' }])
  assert.equal(overview.items[2].sentence, 'An apple.')
  assert.equal(overview.items[2].sentenceZh, '一个苹果。')

  assert.deepEqual(overview.words.map((item) => item.word), ['cherry', 'banana', 'apple', 'date'])
  assert.deepEqual(Object.keys(overview.words[0]).sort(), [
    'correct', 'entryId', 'lastGrade', 'learned', 'mastery', 'nextAt', 'reviews', 'streak', 'word',
  ])
  assert.equal(overview.words[0].learned, false)
  assert.equal(overview.words[0].mastery, 0)
  assert.equal(overview.words[0].nextAt, null)
  assert.equal(overview.words[1].learned, true)
  assert.equal(overview.words[1].lastGrade, 'good')

  assert.deepEqual(overview.history, [
    { date: '2026-11-11', total: 2, done: 2, correct: 1 },
    { date: '2026-11-12', total: 3, done: 2, correct: 1 },
  ])
})

test('buildOverview: empty data and a day without a round are valid Overviews', () => {
  const overview = buildOverview({ version: 1, words: {}, days: {} }, [], CONFIG, DAY)
  assert.equal(overview.date, DAY)
  assert.deepEqual(overview.items, [])
  assert.deepEqual(overview.words, [])
  assert.deepEqual(overview.history, [])
  assert.equal(overview.summary.words, 0)
  assert.equal(overview.summary.eligible, 0)
  assert.equal(overview.summary.roundTotal, 0)
  assert.equal(overview.summary.roundDone, 0)
  assert.equal(overview.summary.streakDays, 0)
  assert.equal(overview.summary.nextAt, null)
  assert.equal(buildOverview(null, [], CONFIG, DAY).summary.words, 0)
})

// ---------------------------------------------------------------------------
// createRecallService
// ---------------------------------------------------------------------------

test('service: first overview plans the round, persists recall.json and is stable all day', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  assert.equal(harness.recall.recallPath(root), join(root, RECALL_REL))

  // empty wordbook: nothing to plan, and no empty progress file is created
  const empty = await harness.recall.overview(root, CONFIG)
  assert.equal(empty.date, DAY)
  assert.deepEqual(empty.items, [])
  assert.equal(empty.summary.words, 0)
  assert.equal(empty.summary.roundTotal, 0)
  assert.equal(existsSync(join(root, RECALL_REL)), false)

  const alphaId = await addWord(harness, 'alpha')
  const betaId = await addWord(harness, 'beta')
  const first = await harness.recall.overview(root, CONFIG)
  assert.equal(first.date, DAY)
  assert.equal(first.items.length, 2)
  assert.deepEqual(first.items.map((item) => item.entryId).sort(), [alphaId, betaId].sort())
  assert.equal(first.summary.words, 2)
  assert.equal(first.summary.eligible, 2)
  assert.equal(first.summary.new, 2)
  assert.equal(first.summary.roundTotal, 2)
  assert.equal(first.summary.roundDone, 0)
  assert.deepEqual(first.items.map((item) => item.status), ['new', 'new'])
  assert.deepEqual(first.items.map((item) => item.done), [false, false])
  assert.deepEqual(first.items.map((item) => item.result), [null, null])

  const file = await readRecallFile(root)
  assert.equal(file.version, 1)
  assert.deepEqual(file.words, {})
  assert.deepEqual(file.days[DAY].items, first.items.map((item) => item.entryId))
  assert.equal(typeof file.days[DAY].createdAt, 'string')
  assert.deepEqual(file.days[DAY].results, [])
  const persisted = await harness.recall.read(root)
  assert.equal(persisted.version, 1)
  assert.deepEqual(persisted.days[DAY].items, file.days[DAY].items)

  // Same day: the round is stable; a word added later only joins a future day.
  const gammaId = await addWord(harness, 'gamma')
  const second = await harness.recall.overview(root, CONFIG)
  assert.deepEqual(second.items.map((item) => item.entryId), first.items.map((item) => item.entryId))
  assert.equal(second.items.some((item) => item.entryId === gammaId), false)
  assert.equal(second.summary.words, 3)
  assert.equal(second.summary.eligible, 3)
  assert.equal(second.summary.new, 3)
  assert.equal(second.summary.roundTotal, 2)
  assert.deepEqual(second.words.map((item) => item.word), ['alpha', 'beta', 'gamma'])
})

test('service: grading updates mastery/nextAt/results; retries overwrite the day result', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const entryId = await addWord(harness, 'example')
  await harness.recall.overview(root, CONFIG)

  const good = await harness.recall.grade(root, CONFIG, { entryId, grade: 'good', mode: 'en-zh' })
  assert.equal(good.items[0].entryId, entryId)
  assert.equal(good.items[0].done, true)
  assert.deepEqual(good.items[0].result, { grade: 'good', mode: 'en-zh', at: harness.clock.value.toISOString() })
  assert.equal(good.items[0].mastery, 1)
  assert.equal(good.summary.roundDone, 1)
  assert.equal(good.summary.correct, 1)
  assert.equal(good.summary.wrong, 0)
  assert.equal(good.summary.learning, 1)
  assert.equal(good.summary.new, 0)
  assert.equal(good.summary.mastered, 0)
  // status is the dynamic "has a recall state" flag: after grading the new word shows due.
  assert.equal(good.items[0].status, 'due')

  let file = await readRecallFile(root)
  assert.equal(file.version, 1)
  assert.equal(file.words[entryId].mastery, 1)
  assert.equal(file.words[entryId].reviews, 1)
  assert.equal(file.words[entryId].correct, 1)
  assert.equal(file.words[entryId].nextAt, NEXT_DAY)
  assert.equal(file.words[entryId].lastGrade, 'good')
  assert.equal(file.words[entryId].lastMode, 'en-zh')
  assert.equal(file.days[DAY].results.length, 1)

  // Retry the same word: one result only, summary recomputed, state keeps counting reviews.
  const retry = await harness.recall.grade(root, CONFIG, { entryId, grade: 'again', mode: 'zh-en' })
  assert.deepEqual(retry.items[0].result, { grade: 'again', mode: 'zh-en', at: harness.clock.value.toISOString() })
  assert.equal(retry.items[0].mastery, 0)
  assert.equal(retry.summary.roundDone, 1)
  assert.equal(retry.summary.correct, 0)
  assert.equal(retry.summary.wrong, 1)
  file = await readRecallFile(root)
  assert.equal(file.days[DAY].results.length, 1)
  assert.equal(file.words[entryId].reviews, 2)
  assert.equal(file.words[entryId].mastery, 0)
  assert.equal(file.words[entryId].lastGrade, 'again')
  assert.equal(file.words[entryId].nextAt, NEXT_DAY) // interval for mastery 0 is still 1 day

  // Grading without mode keeps the previously seen practice mode on the result.
  const noMode = await harness.recall.grade(root, CONFIG, { entryId, grade: 'hard' })
  assert.equal(noMode.items[0].result.mode, 'zh-en')
  assert.equal(noMode.summary.wrong, 1)
  assert.equal(noMode.summary.roundDone, 1)
})

test('service: tomorrow plans again by nextAt and history keeps every past day', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const entryId = await addWord(harness, 'solo')
  await harness.recall.overview(root, CONFIG)
  await harness.recall.grade(root, CONFIG, { entryId, grade: 'good', mode: 'en-zh' })

  harness.clock.value = new Date(2026, 10, 13, 9, 0, 0)
  const second = await harness.recall.overview(root, CONFIG)
  assert.equal(second.date, NEXT_DAY)
  assert.equal(second.items.length, 1)
  assert.equal(second.items[0].entryId, entryId)
  assert.equal(second.items[0].status, 'due')
  assert.equal(second.items[0].done, false)
  assert.equal(second.items[0].result, null)
  assert.equal(second.summary.roundDone, 0)
  assert.equal(second.summary.correct, 0)
  assert.equal(second.summary.words, 1)
  assert.equal(second.summary.learning, 1)
  assert.deepEqual(second.history.map((row) => row.date), [DAY, NEXT_DAY])
  assert.deepEqual(second.history[0], { date: DAY, total: 1, done: 1, correct: 1 })
  assert.deepEqual(second.history[1], { date: NEXT_DAY, total: 1, done: 0, correct: 0 })

  const file = await readRecallFile(root)
  assert.deepEqual(file.days[DAY].items, [entryId])
  assert.deepEqual(file.days[NEXT_DAY].items, [entryId])
  assert.deepEqual(file.days[NEXT_DAY].results, [])
})

test('service: deleting a wordbook entry lazily cleans states and day references', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const keepId = await addWord(harness, 'keeper')
  const dropId = await addWord(harness, 'dropped')
  await harness.recall.overview(root, CONFIG)
  await harness.recall.grade(root, CONFIG, { entryId: keepId, grade: 'good', mode: 'en-zh' })
  await harness.recall.grade(root, CONFIG, { entryId: dropId, grade: 'again', mode: 'en-zh' })

  let file = await readRecallFile(root)
  assert.equal(Object.keys(file.words).length, 2)
  assert.equal(file.days[DAY].items.length, 2)

  const removed = await harness.vocab.remove(root, { ids: [dropId] })
  assert.equal(removed.removed, 1)
  const overview = await harness.recall.overview(root, CONFIG)
  assert.equal(overview.summary.words, 1)
  assert.equal(overview.items.length, 1)
  assert.equal(overview.items[0].entryId, keepId)
  assert.equal(overview.items[0].done, true)
  assert.equal(overview.summary.roundDone, 1)
  assert.equal(overview.summary.correct, 1)
  assert.equal(overview.summary.wrong, 0)

  file = await readRecallFile(root)
  assert.equal(file.words[dropId], undefined)
  assert.deepEqual(Object.keys(file.words), [keepId])
  assert.deepEqual(file.days[DAY].items, [keepId])
  assert.deepEqual(file.days[DAY].results.map((result) => result.id), [keepId])

  // Removing the last word leaves no day records at all (no empty rounds are written).
  await harness.vocab.remove(root, { ids: [keepId] })
  const gone = await harness.recall.overview(root, CONFIG)
  assert.deepEqual(gone.items, [])
  assert.equal(gone.summary.words, 0)
  file = await readRecallFile(root)
  assert.deepEqual(file.words, {})
  assert.deepEqual(file.days, {})
})

test('service: reset one word drops state and today result; reset all clears progress and replans', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const alphaId = await addWord(harness, 'alpha')
  const betaId = await addWord(harness, 'beta')
  await harness.recall.overview(root, CONFIG)
  await harness.recall.grade(root, CONFIG, { entryId: alphaId, grade: 'good', mode: 'en-zh' })
  await harness.recall.grade(root, CONFIG, { entryId: betaId, grade: 'easy', mode: 'zh-en' })

  const one = await harness.recall.reset(root, CONFIG, { entryId: alphaId })
  assert.equal(one.words.find((item) => item.entryId === alphaId).learned, false)
  assert.equal(one.words.find((item) => item.entryId === alphaId).mastery, 0)
  assert.equal(one.words.find((item) => item.entryId === betaId).learned, true)
  assert.equal(one.summary.new, 1)
  assert.equal(one.summary.roundTotal, 2)
  assert.equal(one.summary.roundDone, 1)
  assert.equal(one.summary.correct, 1)
  assert.equal(one.items.find((item) => item.entryId === alphaId).done, false)
  assert.equal(one.items.find((item) => item.entryId === betaId).done, true)
  let file = await readRecallFile(root)
  assert.equal(file.words[alphaId], undefined)
  assert.deepEqual(file.days[DAY].results.map((result) => result.id), [betaId])

  const all = await harness.recall.reset(root, CONFIG, { all: true })
  assert.equal(all.summary.words, 2)
  assert.equal(all.summary.new, 2)
  assert.equal(all.summary.mastered, 0)
  assert.equal(all.summary.learning, 0)
  assert.equal(all.summary.roundTotal, 2)
  assert.equal(all.summary.roundDone, 0)
  assert.deepEqual(all.items.map((item) => item.done), [false, false])
  file = await readRecallFile(root)
  assert.equal(file.version, 1)
  assert.deepEqual(file.words, {})
  assert.deepEqual(file.days[DAY].results, [])
  assert.equal(file.days[DAY].items.length, 2)

  await assert.rejects(
    () => harness.recall.reset(root, CONFIG, {}),
    (error) => codeOf(error) === 'recall/invalid',
  )
  await assert.rejects(
    () => harness.recall.reset(root, CONFIG, { entryId: 'not-in-wordbook' }),
    (error) => codeOf(error) === 'recall/not-found',
  )
})

test('service: resetting a word before today\'s round leaves the planning to the next overview', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const entryId = await addWord(harness, 'solo')
  await harness.recall.overview(root, CONFIG)
  await harness.recall.grade(root, CONFIG, { entryId, grade: 'good', mode: 'en-zh' })

  harness.clock.value = new Date(2026, 10, 13, 9, 0, 0)
  const reset = await harness.recall.reset(root, CONFIG, { entryId })
  assert.deepEqual(reset.items, [])
  assert.equal(reset.summary.words, 1)
  assert.equal(reset.summary.new, 1)
  assert.equal(reset.summary.roundTotal, 0)
  let file = await readRecallFile(root)
  assert.equal(file.days[NEXT_DAY], undefined)

  const next = await harness.recall.overview(root, CONFIG)
  assert.equal(next.items.length, 1)
  assert.equal(next.items[0].status, 'new')
  file = await readRecallFile(root)
  assert.deepEqual(file.days[NEXT_DAY].items, [entryId])
})

test('service: concurrent grades serialize on the recall lock and lose no updates', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const ids = []
  for (const word of ['one', 'two', 'three', 'four', 'five']) ids.push(await addWord(harness, word))
  const planned = await harness.recall.overview(root, CONFIG)
  assert.equal(planned.items.length, 5)

  await Promise.all(ids.map((entryId) => harness.recall.grade(root, CONFIG, { entryId, grade: 'good', mode: 'en-zh' })))

  const file = await readRecallFile(root)
  assert.equal(Object.keys(file.words).length, 5)
  for (const entryId of ids) {
    assert.equal(file.words[entryId].reviews, 1)
    assert.equal(file.words[entryId].mastery, 1)
    assert.equal(file.words[entryId].correct, 1)
    assert.equal(file.words[entryId].nextAt, NEXT_DAY)
  }
  assert.equal(file.days[DAY].results.length, 5)
  assert.equal(new Set(file.days[DAY].results.map((result) => result.id)).size, 5)
  const after = await harness.recall.overview(root, CONFIG)
  assert.equal(after.summary.roundDone, 5)
  assert.equal(after.summary.correct, 5)
})

test('service: recall config caps new words and can disable new words entirely', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  for (const word of ['aa', 'bb', 'cc', 'dd', 'ee']) await addWord(harness, word)
  const capped = await harness.recall.overview(root, { ...CONFIG, recall: { newPerDay: 2, dailyLimit: 3, mode: 'en-zh' } })
  assert.equal(capped.items.length, 2)
  assert.deepEqual(capped.config, { newPerDay: 2, dailyLimit: 3, mode: 'en-zh' })
  assert.equal(capped.summary.new, 5)

  harness.clock.value = new Date(2026, 10, 13, 9, 0, 0)
  const reviewOnly = await harness.recall.overview(root, { ...CONFIG, recall: { newPerDay: 0, dailyLimit: 3, mode: 'mix' } })
  assert.deepEqual(reviewOnly.items, [])
  assert.equal(reviewOnly.summary.words, 5)
  assert.equal(reviewOnly.summary.new, 5)
  assert.equal(reviewOnly.summary.roundTotal, 0)
  const file = await readRecallFile(root)
  assert.equal(file.days[NEXT_DAY], undefined)
})

test('service: corrupt recall.json is backed up and read as empty progress', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const entryId = await addWord(harness, 'recover')
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(join(root, RECALL_REL), '{ this is not json', 'utf8')
  const originalError = console.error
  console.error = () => undefined
  t.after(() => {
    console.error = originalError
  })
  const overview = await harness.recall.overview(root, CONFIG)
  console.error = originalError
  assert.equal(overview.items.length, 1)
  assert.equal(overview.items[0].entryId, entryId)
  const names = await readdir(join(root, '.dsh-english'))
  assert.ok(names.some((name) => name.startsWith('recall.json.corrupt-')))
  const fresh = await readRecallFile(root)
  assert.equal(fresh.version, 1)
})

test('service: day records are capped to the latest MAX_DAY_RECORDS dates', async (t) => {
  const root = await tempDir(t)
  const harness = createHarness(root)
  const entryId = await addWord(harness, 'history')
  const days = {}
  let cursor = DAY
  for (let index = 0; index < MAX_DAY_RECORDS + 20; index += 1) {
    days[cursor] = { date: cursor, createdAt: cursor + 'T00:00:00.000Z', items: [entryId], results: [] }
    cursor = addDays(cursor, -1)
  }
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(join(root, RECALL_REL), JSON.stringify({ version: 1, words: {}, days }), 'utf8')

  await harness.recall.overview(root, CONFIG)
  const file = await readRecallFile(root)
  const kept = Object.keys(file.days).sort()
  assert.equal(kept.length, MAX_DAY_RECORDS)
  assert.equal(kept[kept.length - 1], DAY)
  // the surviving window is contiguous: oldest kept = today - (MAX_DAY_RECORDS - 1)
  assert.equal(kept[0], addDays(DAY, -(MAX_DAY_RECORDS - 1)))
})
