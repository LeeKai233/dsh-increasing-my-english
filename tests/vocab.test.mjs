import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'
import { DomainError } from '../host/paths.js'
import {
  MAX_FAMILY,
  MAX_MEANINGS,
  applyVocabPatch,
  cleanSource,
  createVocabService,
  normalizeAnalysis,
  normalizeEntry,
  normalizeEtymology,
  normalizeFamily,
  normalizeMeanings,
  statusOf,
  vocabularyMarkdown,
} from '../host/vocab.js'

const CONFIG = normalizeConfig({}).config

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-vocab-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

function stubLookup(overrides = {}) {
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
        etymology: { language: 'Latin', parts: [{ part: 'exemplum', meaning: '样本' }], explanation: '来自拉丁语 exemplum' },
      }
    },
    ...overrides,
  }
}

function createService(lookup = stubLookup()) {
  const store = createWorkspaceStore()
  return { store, service: createVocabService({ store, lookup }) }
}

test('statusOf is the single status rule', () => {
  assert.equal(statusOf({ kind: 'sentence', translation: '' }), 'pending')
  assert.equal(statusOf({ kind: 'sentence' }), 'pending')
  assert.equal(statusOf({ kind: 'sentence', translation: '你好' }), 'done')
  assert.equal(statusOf({ kind: 'word', ipa: '', meanings: [] }), 'pending')
  assert.equal(statusOf({ kind: 'word', ipa: '/x/', meanings: [] }), 'done')
  assert.equal(statusOf({ kind: 'word', ipa: '', meanings: [{ zh: '例子' }] }), 'done')
  assert.equal(statusOf(null), 'pending')
})

test('normalizeEntry: a sentence with a translation is never stuck pending', () => {
  assert.equal(normalizeEntry('sentence', { text: 'Hello world.', translation: '你好世界。' }).status, 'done')
  assert.equal(normalizeEntry('sentence', { text: 'Hello world.' }).status, 'pending')
  assert.equal(normalizeEntry('sentence', { sentence: 'Hi.', translation: '嗨。' }).text, 'Hi.')
})

test('normalizeEntry: word normalization shares meanings/family/etymology helpers', () => {
  const entry = normalizeEntry('word', {
    word: 'Example',
    ipa: ' /ig/ ',
    meanings: [{ pos: 'n.', zh: '例子' }, { pos: 'v.', zh: '   ' }, { zh: 3 }],
    family: [{ label: '复数', form: 'examples' }, { label: 'dupe', form: 'EXAMPLES' }, { form: '  ' }],
    etymology: { language: 'Latin', parts: [{ part: 'exemplum', meaning: '样本' }], explanation: 'x' },
    sentence: ' An example. ',
    sentenceZh: ' 一个例子。 ',
  })
  assert.equal(entry.kind, 'word')
  assert.equal(entry.word, 'Example')
  assert.equal(entry.normalized, 'example')
  assert.equal(entry.ipa, '/ig/')
  assert.deepEqual(entry.meanings, [{ pos: 'n.', zh: '例子' }])
  assert.deepEqual(entry.family, [{ label: '复数', form: 'examples' }])
  assert.equal(entry.etymology.language, 'Latin')
  assert.equal(entry.sentence, 'An example.')
  assert.equal(entry.sentenceZh, '一个例子。')
  assert.equal(entry.status, 'done')
  assert.equal(normalizeFamily(Array.from({ length: 20 }, (_value, index) => ({ form: 'f' + index }))).length, MAX_FAMILY)
  assert.deepEqual(normalizeMeanings(null), [])
  assert.equal(normalizeEtymology({ language: '', parts: [], explanation: '' }), undefined)
})

test('normalizeEntry rejects empty / oversized entries with vocab/invalid-entry', () => {
  assert.throws(() => normalizeEntry('word', {}), (error) => codeOf(error) === 'vocab/invalid-entry')
  assert.throws(() => normalizeEntry('sentence', { text: '   ' }), (error) => codeOf(error) === 'vocab/invalid-entry')
  assert.throws(() => normalizeEntry('word', { word: 'x'.repeat(200) }), (error) => codeOf(error) === 'vocab/invalid-entry')
  assert.throws(() => normalizeEntry('sentence', { text: 'x'.repeat(500) }), (error) => codeOf(error) === 'vocab/invalid-entry')
})

test('applyVocabPatch recomputes status from content only', () => {
  const sentence = { kind: 'sentence', text: 'Hi.', translation: '' }
  applyVocabPatch(sentence, { translation: '嗨。', status: 'pending' })
  assert.equal(sentence.translation, '嗨。')
  assert.equal(sentence.status, 'done')
  const word = { kind: 'word', word: 'x', ipa: '', meanings: [] }
  applyVocabPatch(word, { ipa: '/x/' })
  assert.equal(word.status, 'done')
  applyVocabPatch(word, { meanings: [{ pos: 'n.', zh: '测试' }] })
  assert.deepEqual(word.meanings, [{ pos: 'n.', zh: '测试' }])
})

test('cleanSource normalizes provenance', () => {
  assert.deepEqual(cleanSource({ transcript: 't.json', title: ' T ', speaker: 0, startMs: 1500.6 }), { transcript: 't.json', title: 'T', speaker: '0', startMs: 1501 })
  assert.deepEqual(cleanSource(null), {})
})

test('vocabularyMarkdown renders words and sentences', () => {
  const markdown = vocabularyMarkdown({
    words: [
      {
        kind: 'word',
        word: 'example',
        ipa: '/ig/',
        meanings: [{ pos: 'n.', zh: '例子' }],
        family: [{ label: '复数', form: 'examples' }],
        etymology: { language: 'Latin', parts: [{ part: 'exemplum', meaning: '样本' }], explanation: '来自拉丁语' },
        sentence: 'An example.',
        sentenceZh: '一个例子。',
        source: { title: 'Podcast', speaker: '0', startMs: 65000 },
        status: 'done',
      },
      { kind: 'sentence', text: 'Hello world.', translation: '你好世界。', status: 'done' },
    ],
  })
  assert.match(markdown, /# 英语生词本/)
  assert.match(markdown, /### example \/ig\//)
  assert.match(markdown, /词形：复数 examples/)
  assert.match(markdown, /词源：Latin/)
  assert.match(markdown, /来源：Podcast · Speaker 0 · 01:05/)
  assert.match(markdown, /## 句子/)
  assert.match(markdown, /Hello world\./)
})

test('wordbook CRUD writes vocabulary.json and 生词本.md', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  const added = await service.add(root, CONFIG, {
    kind: 'word',
    word: 'example',
    ipa: '/ig/',
    meanings: [{ pos: 'n.', zh: '例子' }],
    sentence: 'This is an example.',
    source: { title: 'Podcast', speaker: '1', startMs: 1000 },
  })
  assert.equal(added.duplicate, false)
  assert.equal(added.entry.status, 'done')
  assert.equal(added.entry.sentenceZh, '这是一句例句翻译。')
  const stored = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.equal(stored.words.length, 1)
  const markdown = await readFile(join(root, 'vocab', '生词本.md'), 'utf8')
  assert.match(markdown, /example/)
  const duplicate = await service.add(root, CONFIG, { kind: 'word', word: 'Example' })
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.id, added.id)
  assert.equal((await service.list(root, { status: 'all' })).total, 1)
  const removed = await service.remove(root, { ids: [added.id] })
  assert.equal(removed.removed, 1)
  assert.equal((await service.list(root, { status: 'all' })).total, 0)
})

test('sentence entries become done after their translation is filled in', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  const pending = await service.add(root, CONFIG, { kind: 'sentence', text: 'Hello world.' })
  assert.equal(pending.entry.status, 'pending')
  const updated = await service.update(root, { entries: [{ id: pending.id, translation: '你好世界。' }] })
  assert.equal(updated.updated, 1)
  assert.equal(updated.entries[0].status, 'done')
  assert.equal((await service.list(root, { status: 'pending' })).entries.length, 0)
  assert.equal((await service.list(root, { status: 'done' })).entries.length, 1)
})

test('concurrent adds do not lose updates', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  await Promise.all(Array.from({ length: 10 }, (_value, index) => service.add(root, CONFIG, { kind: 'word', word: 'word' + index })))
  assert.equal((await service.list(root, { status: 'all' })).total, 10)
})

test('enrich merges forms and etymology and refreshes status', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  const added = await service.add(root, CONFIG, { kind: 'word', word: 'example', sentence: '', sentenceZh: '例句翻译' })
  assert.equal(added.entry.status, 'pending')
  const enriched = await service.enrich(root, CONFIG, { id: added.id })
  assert.equal(enriched.entry.ipa, '/igˈzɑːmpəl/')
  assert.equal(enriched.entry.status, 'done')
  assert.equal(enriched.entry.sentenceZh, '例句翻译')
})

test('export writes the markdown and returns a stable path', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  await service.add(root, CONFIG, { kind: 'word', word: 'exported', ipa: '/x/' })
  const result = await service.exportMarkdown(root)
  assert.equal(result.path, 'vocab/生词本.md')
  assert.match(await readFile(join(root, 'vocab', '生词本.md'), 'utf8'), /exported/)
})

test('update and remove validate their inputs', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  await assert.rejects(() => service.update(root, {}), (error) => codeOf(error) === 'vocab/invalid-entry')
  await assert.rejects(() => service.remove(root, { ids: [] }), (error) => codeOf(error) === 'vocab/invalid-entry')
  const added = await service.add(root, CONFIG, { kind: 'word', word: 'temp' })
  await service.remove(root, { ids: [added.id] })
  await assert.rejects(() => service.enrich(root, CONFIG, { id: 'missing' }), (error) => codeOf(error) === 'vocab/not-found')
})

test('normalizeMeanings keeps evidence fields and merges duplicates', () => {
  const meanings = normalizeMeanings([
    { pos: 'n.', zh: '例子' },
    { pos: 'N.', zh: ' 例子 ', example: ' An example. ', source: { transcript: 't.json', title: 'Podcast', speaker: '0', startMs: 1200.4 } },
    { pos: 'v.', zh: '举例', example: 'x'.repeat(500) },
    { pos: 'n.', zh: '例子', example: 'ignored duplicate example' },
    { pos: 'n.', zh: '例子', source: { transcript: '', title: '', speaker: '', startMs: 0 } },
  ])
  assert.equal(meanings.length, 2)
  assert.deepEqual(meanings[0], {
    pos: 'n.',
    zh: '例子',
    example: 'An example.',
    source: { transcript: 't.json', title: 'Podcast', speaker: '0', startMs: 1200 },
  })
  assert.equal(meanings[1].example.length, 400)
  assert.equal('source' in meanings[1], false)
  // Empty / all-default provenance is dropped instead of persisted as noise.
  assert.deepEqual(normalizeMeanings([{ pos: 'n.', zh: '空', source: { transcript: '', title: '', speaker: '', startMs: 0 } }]), [{ pos: 'n.', zh: '空' }])
  // Default limit is still 3; the new exported ceiling is 8.
  assert.equal(normalizeMeanings(Array.from({ length: 6 }, (_value, index) => ({ pos: 'n.', zh: '义' + index }))).length, 3)
  assert.equal(normalizeMeanings(Array.from({ length: 12 }, (_value, index) => ({ pos: 'n.', zh: '义' + index })), { limit: MAX_MEANINGS }).length, 8)
  assert.equal(MAX_MEANINGS, 8)
})

test('normalizeMeanings folds senses that explain the same thing', () => {
  const meanings = normalizeMeanings([
    { pos: 'v.', zh: '介入；干预；调停' },
    { pos: 'v.', zh: '介入；干预', example: 'The UN intervened.' },
    { pos: 'n.', zh: '干预；介入', example: 'A brief intervention.' },
  ], { limit: MAX_MEANINGS })
  assert.equal(meanings.length, 1)
  assert.equal(meanings[0].pos, 'v.')
  assert.equal(meanings[0].zh, '介入；干预；调停')
  assert.equal(meanings[0].example, 'The UN intervened.')
  // Equal wording with a different POS survives (n. 增加 / v. 增加 are two senses).
  const increase = normalizeMeanings([{ pos: 'n.', zh: '增加' }, { pos: 'v.', zh: '增加' }], { limit: MAX_MEANINGS })
  assert.equal(increase.length, 2)
  // Neighbouring but different meanings are untouched.
  const intrigue = normalizeMeanings([
    { pos: 'v.', zh: '阴谋；密谋' },
    { pos: 'v.', zh: '激起兴趣；密谋' },
  ], { limit: MAX_MEANINGS })
  assert.equal(intrigue.length, 2)
})

test('applyVocabPatch backfills meaning evidence when meanings are replaced', () => {
  const target = {
    kind: 'word',
    word: 'example',
    ipa: '/ig/',
    status: 'done',
    meanings: [
      {
        pos: 'n.',
        zh: '例子',
        example: 'An example.',
        source: { transcript: 't.json', title: 'Podcast', speaker: '', startMs: 0 },
      },
    ],
  }
  applyVocabPatch(target, {
    meanings: [
      { pos: 'N.', zh: '例子' },
      { pos: 'v.', zh: '举例' },
    ],
  })
  assert.equal(target.status, 'done')
  assert.deepEqual(target.meanings[0], {
    pos: 'N.',
    zh: '例子',
    example: 'An example.',
    source: { transcript: 't.json', title: 'Podcast', speaker: '', startMs: 0 },
  })
  assert.deepEqual(target.meanings[1], { pos: 'v.', zh: '举例' })
  // Evidence supplied by the patch itself always wins over the old evidence.
  applyVocabPatch(target, { meanings: [{ pos: 'n.', zh: '例子', example: '新例句' }] })
  assert.equal(target.meanings[0].example, '新例句')
  assert.equal('source' in target.meanings[0], true)
})

test('normalizeAnalysis validates and cleans the analysis record', () => {
  assert.equal(normalizeAnalysis(null), undefined)
  assert.equal(normalizeAnalysis({}), undefined)
  assert.equal(normalizeAnalysis({ status: 'weird', fingerprint: 'abc' }), undefined)
  assert.equal(normalizeAnalysis({ status: 'done', fingerprint: '   ' }), undefined)
  assert.equal(normalizeAnalysis({ status: 'done', fingerprint: 'x'.repeat(201) }), undefined)

  const done = normalizeAnalysis({
    version: 99,
    at: '2026-01-02T03:04:05.000Z',
    status: 'done',
    fingerprint: ' fp-1 ',
    contexts: '5',
    transcripts: 2.4,
    added: '3',
    error: 'ignored outside failed',
  })
  assert.deepEqual(done, {
    version: 1,
    at: '2026-01-02T03:04:05.000Z',
    status: 'done',
    fingerprint: 'fp-1',
    contexts: 5,
    transcripts: 2,
    added: 3,
  })
  assert.equal('error' in done, false)

  const skipped = normalizeAnalysis({ status: 'skipped', fingerprint: 'fp', at: 'not-a-date', contexts: -2, added: 9 })
  assert.equal(skipped.added, 0)
  assert.equal(skipped.contexts, 0)
  assert.equal(skipped.transcripts, 0)
  assert.match(skipped.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

  const failed = normalizeAnalysis({ status: 'failed', fingerprint: 'fp', error: '错'.repeat(400), added: 7 })
  assert.equal(failed.added, 0)
  assert.equal(failed.error.length, 300)
  assert.equal(normalizeAnalysis({ status: 'failed', fingerprint: 'fp' }).error, undefined)
})

test('applyAnalysis persists meanings and analysis and rewrites the markdown', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  const added = await service.add(root, CONFIG, {
    kind: 'word',
    word: 'example',
    ipa: '/ig/',
    meanings: [
      { pos: 'n.', zh: '例子', example: 'An example.', source: { transcript: 't.json', title: 'Podcast', speaker: '0', startMs: 1200 } },
    ],
    source: { title: 'Podcast', speaker: '0', startMs: 65000 },
  })
  const result = await service.applyAnalysis(root, added.id, {
    meanings: [
      { pos: 'n.', zh: '例子', example: 'An example.', source: { transcript: 't.json', title: 'Podcast', speaker: '0', startMs: 1200 } },
      { pos: 'v.', zh: '举例', example: 'Example it.' },
    ],
    analysis: { status: 'done', fingerprint: 'fp-1', at: '2026-01-02T03:04:05.000Z', contexts: 4, transcripts: 2, added: 1 },
  })
  assert.equal(result.id, added.id)
  assert.equal(result.entry.analysis.status, 'done')
  assert.equal(result.entry.analysis.version, 1)
  assert.equal(result.entry.meanings.length, 2)

  const stored = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.deepEqual(stored.words[0].analysis, {
    version: 1,
    at: '2026-01-02T03:04:05.000Z',
    status: 'done',
    fingerprint: 'fp-1',
    contexts: 4,
    transcripts: 2,
    added: 1,
  })
  assert.equal(stored.words[0].meanings[1].example, 'Example it.')

  const markdown = await readFile(join(root, 'vocab', '生词本.md'), 'utf8')
  assert.match(markdown, /  - 例：An example\.（Podcast）/)
  assert.match(markdown, /  - 例：Example it\./)
  assert.match(markdown, /  - 多义分析：4 处 · 2 篇文稿/)
  assert.ok(markdown.indexOf('- 来源：') < markdown.indexOf('- 多义分析：'))
})

test('applyAnalysis rejects sentence entries and unknown ids', async (t) => {
  const root = await tempDir(t)
  const { service } = createService()
  const sentence = await service.add(root, CONFIG, { kind: 'sentence', text: 'Hello world.', translation: '你好世界。' })
  await assert.rejects(
    () => service.applyAnalysis(root, sentence.id, { analysis: { status: 'skipped', fingerprint: 'fp' } }),
    (error) => codeOf(error) === 'vocab/invalid-entry',
  )
  await assert.rejects(
    () => service.applyAnalysis(root, 'missing', { analysis: { status: 'skipped', fingerprint: 'fp' } }),
    (error) => codeOf(error) === 'vocab/not-found',
  )
})

test('vocabularyMarkdown renders example evidence and all analysis states', () => {
  const base = {
    kind: 'word',
    word: 'sense',
    ipa: '/sens/',
    status: 'done',
    meanings: [
      { pos: 'n.', zh: '感觉', example: 'A sense of wonder.' },
      { pos: 'v.', zh: '感觉到', example: 'I sense it.', source: { title: 'Talk' } },
    ],
  }
  const done = vocabularyMarkdown({
    words: [
      {
        ...base,
        source: { title: 'Podcast', speaker: '0', startMs: 65000 },
        analysis: { version: 1, at: '2026-01-02T03:04:05.000Z', status: 'done', fingerprint: 'fp', contexts: 3, transcripts: 2, added: 1 },
      },
    ],
  })
  assert.match(done, /  - 例：A sense of wonder\.\n/)
  assert.match(done, /  - 例：I sense it\.（Talk）/)
  assert.match(done, /  - 多义分析：3 处 · 2 篇文稿/)
  assert.ok(done.indexOf('- 来源：') < done.indexOf('- 多义分析：'))

  const skipped = vocabularyMarkdown({
    words: [{ ...base, analysis: { version: 1, at: '2026-01-02T03:04:05.000Z', status: 'skipped', fingerprint: 'fp', contexts: 1, transcripts: 1, added: 0 } }],
  })
  assert.match(skipped, /多义分析：没有更多上下文/)

  const failed = vocabularyMarkdown({
    words: [{ ...base, analysis: { version: 1, at: '2026-01-02T03:04:05.000Z', status: 'failed', fingerprint: 'fp', contexts: 0, transcripts: 0, added: 0, error: '模型超时' } }],
  })
  assert.match(failed, /多义分析：失败（模型超时）/)

  assert.equal(vocabularyMarkdown({ words: [base] }).includes('多义分析'), false)
})
