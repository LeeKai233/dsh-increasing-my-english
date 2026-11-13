import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
  ANALYSIS_DEFAULTS,
  MAX_BATCH_WORDS,
  createAnalysisService,
  resolveAnalysisOptions,
} from '../host/analysis.js'
import { DomainError, isRecord } from '../host/paths.js'
import {
  ANALYSIS_VERSION,
  analysisFingerprint,
  buildCorpus,
  corpusSignature,
} from '../host/senses.js'

const ROOT = resolve('analysis-test-workspace')

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

function makeConfig(overrides = {}) {
  return {
    analysis: {
      enabled: true,
      idleMinutes: 3,
      batchWords: 2,
      maxContexts: 6,
      maxContextChars: 240,
      timeoutMs: 30000,
      retryMinutes: 10,
      ...(overrides.analysis ?? {}),
    },
    lookup: { backend: 'ds', ...(overrides.lookup ?? {}) },
    dirs: { transcripts: 'transcripts', recordings: 'recordings' },
  }
}

function baseWord(overrides = {}) {
  return {
    id: 'w1',
    kind: 'word',
    word: 'example',
    normalized: 'example',
    ipa: '',
    meanings: [{ pos: 'n.', zh: '例子' }],
    family: [],
    sentence: '',
    sentenceZh: '',
    status: 'done',
    ...overrides,
  }
}

/** Three sentences containing "example" across two transcripts. */
function makeDocuments() {
  return [
    {
      file: 'a.json',
      title: 'Podcast A',
      document: {
        createdAt: '2026-01-01T00:00:00.000Z',
        segments: [
          { start: 0, speaker: '1', text: 'This is one example of the problem.' },
          { start: 5000, speaker: '2', text: 'Another example follows right here.' },
        ],
      },
    },
    {
      file: 'b.json',
      title: 'Podcast B',
      document: {
        createdAt: '2026-01-02T00:00:00.000Z',
        segments: [{ start: 0, speaker: '1', text: 'A clear example shows up in this episode.' }],
      },
    },
  ]
}

function createHarness(overrides = {}) {
  const state = {
    now: Date.parse('2026-02-01T00:00:00.000Z'),
    root: overrides.root ?? ROOT,
    documents: overrides.documents ?? makeDocuments(),
    words: overrides.words ?? [baseWord()],
    config: overrides.config ?? makeConfig(),
    lookups: [],
    applyCalls: [],
    corpusLoads: 0,
    configLoads: [],
    filterCalls: [],
    warnings: [],
  }
  state.advance = (ms) => {
    state.now += ms
  }
  state.signature = () => corpusSignature(state.documents)

  const vocab = {
    async read() {
      return { version: 1, words: state.words }
    },
    async applyAnalysis(root, id, patch) {
      state.applyCalls.push({ root, id, patch })
      const entry = state.words.find((item) => item.id === id)
      if (entry === undefined) throw new Error('词条不存在：' + id)
      if (Array.isArray(patch?.meanings)) entry.meanings = patch.meanings.map((meaning) => ({ ...meaning }))
      if (isRecord(patch?.analysis)) entry.analysis = { ...patch.analysis }
      return { id, entry: { ...entry } }
    },
  }

  const lookup = {
    async askJson(root, config, input, signal) {
      state.lookups.push({ root, config, input, signal })
      if (typeof overrides.askJson === 'function') {
        return overrides.askJson(state, { root, config, input, signal })
      }
      return { value: { senses: [{ pos: 'n.', zh: '例子', contexts: [1] }] }, cached: false }
    },
  }

  const loadCorpus = async () => {
    state.corpusLoads += 1
    const documents = state.documents
    return { documents, corpus: buildCorpus(documents), signature: corpusSignature(documents) }
  }

  const ctx = overrides.ctx ?? {
    get(name) {
      if (name === 'agents') return { list: () => [{ session: { id: 'session-1' } }] }
      if (name === 'workingDirectory') return { get: () => state.root }
      return undefined
    },
  }

  const configLoader = overrides.configLoader ?? {
    async load(root) {
      state.configLoads.push(root)
      return { config: state.config, warnings: [] }
    },
  }

  const rootFilter = overrides.rootFilter ?? (async (root) => {
    state.filterCalls.push(root)
    return true
  })

  const service = createAnalysisService({
    ctx,
    store: overrides.store ?? { readJsonFile: async () => ({ value: undefined, missing: true, corrupted: false }) },
    vocab,
    lookup,
    configLoader,
    now: () => state.now,
    intervalMs: 60000,
    logger: { warn: (...args) => state.warnings.push(args) },
    loadCorpus,
    rootFilter,
    ...(overrides.serviceOptions ?? {}),
  })

  return { state, service, vocab, lookup }
}

test('resolveAnalysisOptions applies defaults and hard caps', () => {
  const defaults = resolveAnalysisOptions({})
  assert.equal(defaults.enabled, true)
  assert.equal(defaults.idleMinutes, ANALYSIS_DEFAULTS.idleMinutes)
  assert.equal(defaults.batchWords, ANALYSIS_DEFAULTS.batchWords)
  assert.equal(defaults.timeoutMs, ANALYSIS_DEFAULTS.timeoutMs)
  const capped = resolveAnalysisOptions({
    analysis: { batchWords: 99, maxContexts: 0, maxContextChars: 5, timeoutMs: 1, retryMinutes: -5, enabled: false },
  })
  assert.equal(capped.batchWords, MAX_BATCH_WORDS)
  assert.equal(capped.maxContexts, 1)
  assert.equal(capped.maxContextChars, 40)
  assert.equal(capped.timeoutMs, 10)
  assert.equal(capped.retryMinutes, 0)
  assert.equal(capped.enabled, false)
})

test('analyzeStale merges new senses, persists the analysis record and reports counters', async () => {
  const word = baseWord()
  const { state, service } = createHarness({
    words: [word],
    askJson: () => ({
      value: {
        senses: [
          { pos: 'n.', zh: '例子', contexts: [1] },
          { pos: 'v.', zh: '以…为例', contexts: [2, 3] },
        ],
      },
      cached: false,
    }),
  })
  const result = await service.analyzeStale(ROOT, state.config, { id: word.id })
  assert.equal(result.analyzed, 1)
  assert.equal(result.updated, 1)
  assert.equal(result.added, 1)
  assert.equal(result.skipped, 0)
  assert.equal(result.failed, 0)
  assert.equal(result.remaining, 0)
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].id, word.id)
  assert.equal(result.entries[0].kind, 'word')
  assert.deepEqual(word.meanings.map((meaning) => meaning.zh), ['例子', '以…为例'])
  assert.equal(state.corpusLoads, 1)
  assert.equal(state.lookups.length, 1)
  assert.match(state.lookups[0].input.prompt, /example/)
  assert.ok(state.lookups[0].input.key.startsWith('senses:'))
  assert.equal(state.lookups[0].input.timeoutMs, 30000)
  assert.ok(state.lookups[0].signal instanceof AbortSignal)
  assert.equal(state.applyCalls.length, 1)
  assert.equal(state.applyCalls[0].patch.analysis.status, 'done')
  assert.equal(state.applyCalls[0].patch.analysis.version, ANALYSIS_VERSION)
  assert.equal(state.applyCalls[0].patch.analysis.added, 1)
  assert.equal(state.applyCalls[0].patch.analysis.contexts, 3)
  assert.equal(state.applyCalls[0].patch.analysis.transcripts, 2)
  assert.equal(typeof state.applyCalls[0].patch.analysis.fingerprint, 'string')
  assert.equal(word.analysis.status, 'done')
  assert.equal(word.analysis.added, 1)
})

test('fewer than two contexts is persisted as skipped, without a model call, and is not retried', async () => {
  const word = baseWord()
  const documents = [
    {
      file: 'only.json',
      title: 'Only',
      document: {
        createdAt: '2026-01-01T00:00:00.000Z',
        segments: [{ start: 0, speaker: '1', text: 'A single example lives here.' }],
      },
    },
  ]
  const { state, service } = createHarness({ words: [word], documents })
  const first = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(first.analyzed, 1)
  assert.equal(first.skipped, 1)
  assert.equal(first.added, 0)
  assert.equal(first.updated, 0)
  assert.equal(state.lookups.length, 0)
  assert.equal(word.analysis.status, 'skipped')
  assert.equal(word.analysis.added, 0)
  assert.equal(word.analysis.contexts, 1)
  const second = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(second.analyzed, 0)
  assert.equal(second.skipped, 0)
  assert.equal(state.lookups.length, 0)
})

test('a changed corpus signature (or analysis version) makes a done analysis stale again', async () => {
  const word = baseWord()
  const { state, service } = createHarness({ words: [word] })
  await service.analyzeStale(ROOT, state.config, { id: word.id })
  assert.equal(word.analysis.status, 'done')
  word.analysis = {
    version: ANALYSIS_VERSION,
    at: new Date(state.now).toISOString(),
    status: 'done',
    fingerprint: analysisFingerprint(word, corpusSignature(state.documents)),
    contexts: 3,
    transcripts: 2,
    added: 0,
  }
  const skipped = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(skipped.analyzed, 0)
  state.documents = [
    ...state.documents,
    {
      file: 'c.json',
      title: 'Podcast C',
      document: {
        createdAt: '2026-01-03T00:00:00.000Z',
        segments: [{ start: 0, speaker: '1', text: 'Yet another example turns up.' }],
      },
    },
  ]
  const stale = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(stale.analyzed, 1)
  word.analysis.version = 999
  const versionStale = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(versionStale.analyzed, 1)
})

test('failed analyses are retried only after retryMinutes', async () => {
  const word = baseWord()
  const config = makeConfig({ analysis: { retryMinutes: 30 } })
  const { state, service } = createHarness({
    words: [word],
    config,
    askJson: () => {
      throw new Error('模型返回了坏数据')
    },
  })
  const first = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(first.analyzed, 1)
  assert.equal(first.failed, 1)
  assert.equal(word.analysis.status, 'failed')
  assert.match(word.analysis.error, /坏数据/)
  state.advance(29 * 60 * 1000)
  assert.equal((await service.analyzeStale(ROOT, state.config, {})).analyzed, 0)
  state.advance(2 * 60 * 1000)
  const retried = await service.analyzeStale(ROOT, state.config, {})
  assert.equal(retried.analyzed, 1)
  assert.equal(retried.failed, 1)
})

test('a slow model call times out and is persisted as failed', async () => {
  const word = baseWord()
  const config = makeConfig({ analysis: { timeoutMs: 20 } })
  const { state, service } = createHarness({
    words: [word],
    config,
    askJson: () => new Promise(() => {}),
  })
  const result = await service.analyzeStale(ROOT, state.config, { id: word.id })
  assert.equal(result.analyzed, 1)
  assert.equal(result.failed, 1)
  assert.equal(word.analysis.status, 'failed')
  assert.match(word.analysis.error, /超时/)
})

test('a failed analysis keeps its persisted error under 300 characters', async () => {
  const word = baseWord()
  const { state, service } = createHarness({
    words: [word],
    askJson: () => {
      throw new Error('x'.repeat(600))
    },
  })
  await service.analyzeStale(ROOT, state.config, {})
  assert.equal(word.analysis.status, 'failed')
  assert.ok(word.analysis.error.length <= 301)
  assert.ok(word.analysis.error.startsWith('x'.repeat(300)))
})

test('lookup.backend = off fails with analysis/disabled before analysing', async () => {
  const { state, service } = createHarness({ config: makeConfig({ lookup: { backend: 'off' } }) })
  await assert.rejects(() => service.analyzeStale(ROOT, state.config, {}), (error) => codeOf(error) === 'analysis/disabled')
  await assert.rejects(() => service.analyzeEntry(ROOT, state.config, 'w1'), (error) => codeOf(error) === 'analysis/disabled')
  assert.equal(state.lookups.length, 0)
})

test('an explicit id is analysed even when its fingerprint is current', async () => {
  const word = baseWord()
  const { state, service } = createHarness({ words: [word] })
  word.analysis = {
    version: ANALYSIS_VERSION,
    at: new Date(state.now).toISOString(),
    status: 'done',
    fingerprint: analysisFingerprint(word, corpusSignature(state.documents)),
    contexts: 3,
    transcripts: 2,
    added: 0,
  }
  assert.equal((await service.analyzeStale(ROOT, state.config, {})).analyzed, 0)
  const forced = await service.analyzeStale(ROOT, state.config, { id: word.id })
  assert.equal(forced.analyzed, 1)
  assert.equal(state.lookups.length, 1)
})

test('forced analysis validates the entry id and kind', async () => {
  const sentence = { id: 's1', kind: 'sentence', text: 'Hello.', translation: '你好。' }
  const { state, service } = createHarness({ words: [sentence] })
  await assert.rejects(
    () => service.analyzeStale(ROOT, state.config, { id: 'missing' }),
    (error) => codeOf(error) === 'vocab/not-found',
  )
  await assert.rejects(
    () => service.analyzeStale(ROOT, state.config, { id: 's1' }),
    (error) => codeOf(error) === 'vocab/invalid-entry',
  )
})

test('analyzeEntry reports a single-word failure without throwing', async () => {
  const good = createHarness({})
  const done = await good.service.analyzeEntry(ROOT, good.state.config, 'w1')
  assert.equal(done.status, 'done')
  assert.equal(done.added, 0)

  const bad = createHarness({
    askJson: () => {
      throw new Error('bad model')
    },
  })
  const failed = await bad.service.analyzeEntry(ROOT, bad.state.config, 'w1')
  assert.equal(failed.status, 'failed')
  assert.match(failed.error, /bad model/)
})

test('tick waits for an idle workspace and then runs a background batch', async () => {
  const { state, service } = createHarness({})
  service.noteActivity(ROOT)
  const active = await service.tick()
  assert.equal(active.ran, false)
  assert.equal(state.lookups.length, 0)
  state.advance(10 * 60 * 1000)
  const idle = await service.tick()
  assert.equal(idle.ran, true)
  assert.equal(idle.root, ROOT)
  assert.equal(idle.result.analyzed, 1)
  assert.equal(state.lookups.length, 1)
  assert.ok(state.filterCalls.includes(ROOT))
})

test('tick spaces retries while work remains and rescans slowly when finished', async () => {
  const words = [baseWord({ id: 'w1' }), baseWord({ id: 'w2' })]
  const config = makeConfig({ analysis: { batchWords: 1 } })
  const { state, service } = createHarness({ words, config })
  const first = await service.tick()
  assert.equal(first.ran, true)
  assert.equal(first.result.analyzed, 1)
  assert.equal(first.result.remaining, 1)
  assert.equal((await service.tick()).ran, false)
  state.advance(20000)
  const second = await service.tick()
  assert.equal(second.ran, true)
  assert.equal(second.result.analyzed, 1)
  assert.equal(second.result.remaining, 0)
  assert.equal((await service.tick()).ran, false)
  state.advance(600000)
  const third = await service.tick()
  assert.equal(third.ran, true)
  assert.equal(third.result.analyzed, 0)
})

test('tick skips disabled analysis, closed lookup and non-plugin roots', async () => {
  const disabled = createHarness({ config: makeConfig({ analysis: { enabled: false } }) })
  assert.equal((await disabled.service.tick()).ran, false)
  assert.equal(disabled.state.corpusLoads, 0)
  assert.equal(disabled.state.lookups.length, 0)

  const filtered = createHarness({ rootFilter: async () => false })
  assert.equal((await filtered.service.tick()).ran, false)
  assert.equal(filtered.state.corpusLoads, 0)

  const closed = createHarness({ config: makeConfig({ lookup: { backend: 'off' } }) })
  assert.equal((await closed.service.tick()).ran, false)
  assert.equal(closed.state.corpusLoads, 0)
})

test('background mode stops after the current word when the workspace becomes active', async () => {
  const words = [baseWord({ id: 'w1' }), baseWord({ id: 'w2' }), baseWord({ id: 'w3' })]
  let notify = () => {}
  const { state, service } = createHarness({
    words,
    askJson: () => {
      notify()
      return { value: { senses: [{ pos: 'n.', zh: '例子', contexts: [1] }] }, cached: false }
    },
  })
  notify = () => service.noteActivity(ROOT)
  const result = await service.analyzeStale(ROOT, state.config, { limit: 3, background: true })
  assert.equal(result.analyzed, 1)
  assert.equal(result.remaining, 2)
  assert.equal(state.lookups.length, 1)
})

test('noteActivity records activity and clears the pending run time', async () => {
  const words = [baseWord({ id: 'w1' }), baseWord({ id: 'w2' })]
  const config = makeConfig({ analysis: { batchWords: 1 } })
  const { state, service } = createHarness({ words, config })
  await service.tick()
  const before = service.status(ROOT)
  assert.equal(before.tracked, true)
  assert.equal(typeof before.nextRunAt, 'number')
  service.noteActivity(ROOT)
  const after = service.status(ROOT)
  assert.equal(after.nextRunAt, null)
  assert.equal(after.lastActivityAt, state.now)
})

test('tick maps workspaces to one shared root and reset clears scheduler state', async () => {
  const ctx = {
    get(name) {
      if (name === 'agents') return { list: () => [{ session: 'a' }, { session: 'b' }] }
      if (name === 'workingDirectory') return { get: (session) => (session === 'a' ? 'A' : 'B') }
      return undefined
    },
  }
  const { state, service } = createHarness({
    ctx,
    serviceOptions: { resolveRoot: async () => ROOT },
  })
  state.advance(10 * 60 * 1000)
  const result = await service.tick()
  assert.equal(result.ran, true)
  assert.equal(result.root, ROOT)
  assert.equal(state.corpusLoads, 1)
  assert.equal(state.lookups.length, 1)
  service.reset()
  assert.equal(service.status(ROOT).tracked, false)
})

test('tick tolerates stub contexts that expose no agent list or workspace getter', async () => {
  const ctx = {
    get(name) {
      if (name === 'agents') return {}
      if (name === 'workingDirectory') return {}
      return undefined
    },
  }
  const { state, service } = createHarness({ ctx })
  service.noteActivity(ROOT)
  state.advance(10 * 60 * 1000)
  const result = await service.tick()
  assert.equal(result.ran, true)
  assert.equal(result.root, ROOT)

  const empty = createHarness({ ctx: {} })
  assert.equal((await empty.service.tick()).ran, false)
})

test('an externally aborted request rejects instead of persisting a failure', async () => {
  const word = baseWord()
  const { state, service } = createHarness({
    words: [word],
    askJson: () => new Promise(() => {}),
  })
  const controller = new AbortController()
  controller.abort(new Error('用户取消'))
  await assert.rejects(
    () => service.analyzeStale(ROOT, state.config, {}, controller.signal),
    /用户取消/,
  )
  assert.equal(word.analysis, undefined)
})

test('dispose aborts an in-flight analysis instead of persisting it', async () => {
  const word = baseWord()
  const { state, service } = createHarness({
    words: [word],
    askJson: () => new Promise(() => {}),
  })
  const pending = service.analyzeStale(ROOT, state.config, { id: word.id })
  service.dispose()
  await assert.rejects(() => pending)
  assert.equal(word.analysis, undefined)
})

test('start and dispose are idempotent and dispose stops the scheduler', async () => {
  const { state, service } = createHarness({})
  const timer = service.start()
  assert.notEqual(timer, undefined)
  assert.equal(service.start(), timer)
  assert.equal(service.status(ROOT).started, true)
  service.dispose()
  service.dispose()
  assert.equal(service.status(ROOT).disposed, true)
  assert.equal(service.status(ROOT).started, false)
  assert.equal((await service.tick()).ran, false)
  assert.equal(state.lookups.length, 0)
})