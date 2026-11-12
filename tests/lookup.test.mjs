import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'
import { DomainError } from '../host/paths.js'
import { LOOKUP_VERSION, createLookupService, normalizeLookup, parseJsonObject } from '../host/lookup.js'

const CONFIG = normalizeConfig({}).config
const JSON_TEXT = '{"senses":[{"pos":"n.","zh":"例子"}]}'
const CACHE_REL = join('.dsh-english', 'lookup-cache.json')

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-lookup-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * Fake plugin context: the DSH model stream yields the supplied model text and
 * the Bailian CLI runner is stubbed out (backend ds must never call it).
 */
function createService(modelText, options = {}) {
  const state = { streamCalls: 0, runCommandCalls: 0, options: [] }
  const llm = {
    async *stream(streamOptions) {
      state.streamCalls += 1
      state.options.push(streamOptions)
      if (options.gate !== undefined) await options.gate
      yield { type: 'text-delta', text: modelText }
      yield {
        type: 'finish',
        reason: { kind: options.finishKind ?? 'stop', failure: { message: options.finishMessage ?? '' } },
      }
    },
  }
  const ctx = {
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
      return undefined
    },
  }
  const service = createLookupService({
    ctx,
    store: createWorkspaceStore(),
    runCommand: async () => {
      state.runCommandCalls += 1
      throw new Error('runCommand must not be used with the ds backend')
    },
  })
  return { service, state }
}

test('parseJsonObject accepts bare, fenced and surrounded JSON', () => {
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 })
  assert.deepEqual(parseJsonObject('\u0060\u0060\u0060json\n{"a":1}\n\u0060\u0060\u0060'), { a: 1 })
  assert.deepEqual(parseJsonObject('好的，结果如下：{"a":{"b":2}} 以上。'), { a: { b: 2 } })
  assert.throws(() => parseJsonObject('not json'), /模型没有返回可解析的 JSON/)
  assert.throws(() => parseJsonObject('[1,2]'), /模型没有返回可解析的 JSON/)
  assert.throws(() => parseJsonObject(''), /模型没有返回可解析的 JSON/)
})

test('normalizeLookup keeps the frozen result shape and evidence fields', () => {
  const word = normalizeLookup('word', {
    ipa: ' /x/ ',
    meanings: [{ pos: 'n.', zh: '例子', example: ' An example. ', source: { title: 'Podcast', startMs: 1200 } }],
    family: [{ label: '复数', form: 'examples' }],
    etymology: { language: 'Latin', parts: [{ part: 'exemplum', meaning: '样本' }], explanation: '来自拉丁语' },
  })
  assert.equal(word.kind, 'word')
  assert.equal(word.ipa, '/x/')
  assert.equal(word.sentenceZh, '')
  assert.deepEqual(word.meanings, [
    { pos: 'n.', zh: '例子', example: 'An example.', source: { transcript: '', title: 'Podcast', speaker: '', startMs: 1200 } },
  ])
  assert.deepEqual(word.family, [{ label: '复数', form: 'examples' }])
  assert.equal(word.etymology.language, 'Latin')
  assert.deepEqual(normalizeLookup('sentence', { translation: ' 你好 ' }), { kind: 'sentence', translation: '你好' })
  assert.throws(() => normalizeLookup('word', { meanings: [] }), (error) => codeOf(error) === 'lookup/failed')
  assert.throws(() => normalizeLookup('sentence', {}), (error) => codeOf(error) === 'lookup/failed')
})

test('askJson caches parsed JSON per key and only calls the model once', async (t) => {
  const root = await tempDir(t)
  const { service, state } = createService(JSON_TEXT)
  const first = await service.askJson(root, CONFIG, { key: 'senses:abc', prompt: '分析 example 的多义' })
  assert.equal(first.cached, false)
  assert.deepEqual(first.value, { senses: [{ pos: 'n.', zh: '例子' }] })
  const second = await service.askJson(root, CONFIG, { key: 'senses:abc', prompt: '分析 example 的多义' })
  assert.equal(second.cached, true)
  assert.deepEqual(second.value, first.value)
  assert.equal(state.streamCalls, 1)
  assert.equal(state.runCommandCalls, 0)
  assert.equal(state.options[0].provider, 'p')
  assert.equal(state.options[0].model, 'm')

  const cache = JSON.parse(await readFile(join(root, CACHE_REL), 'utf8'))
  assert.equal(cache.entries['j:senses:abc'].version, LOOKUP_VERSION)
  assert.deepEqual(cache.entries['j:senses:abc'].value, { senses: [{ pos: 'n.', zh: '例子' }] })

  const other = await service.askJson(root, CONFIG, { key: 'senses:def', prompt: '另一个词' })
  assert.equal(other.cached, false)
  assert.equal(state.streamCalls, 2)
  assert.deepEqual(other.value, { senses: [{ pos: 'n.', zh: '例子' }] })
})

test('askJson ignores stale-version and non-object cache values', async (t) => {
  const root = await tempDir(t)
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  const cache = {
    entries: {
      'j:stale': { value: { senses: [] }, version: LOOKUP_VERSION - 1, at: '2026-01-01T00:00:00.000Z' },
      'j:not-object': { value: 'nope', version: LOOKUP_VERSION, at: '2026-01-01T00:00:00.000Z' },
    },
  }
  await writeFile(join(root, CACHE_REL), JSON.stringify(cache), 'utf8')
  const { service, state } = createService(JSON_TEXT)
  assert.equal((await service.askJson(root, CONFIG, { key: 'stale', prompt: 'x' })).cached, false)
  assert.equal((await service.askJson(root, CONFIG, { key: 'not-object', prompt: 'x' })).cached, false)
  assert.equal(state.streamCalls, 2)
  const rewritten = JSON.parse(await readFile(join(root, CACHE_REL), 'utf8'))
  assert.equal(rewritten.entries['j:stale'].version, LOOKUP_VERSION)
  assert.equal(rewritten.entries['j:not-object'].version, LOOKUP_VERSION)
  assert.deepEqual(rewritten.entries['j:stale'].value, { senses: [{ pos: 'n.', zh: '例子' }] })
})

test('askJson rejects an empty prompt before touching the cache', async (t) => {
  const root = await tempDir(t)
  const { service, state } = createService(JSON_TEXT)
  await assert.rejects(() => service.askJson(root, CONFIG, { key: 'k', prompt: '   ' }), /缺少提示词/)
  await assert.rejects(() => service.askJson(root, CONFIG, {}), /缺少提示词/)
  assert.equal(state.streamCalls, 0)
  await assert.rejects(
    () => readFile(join(root, CACHE_REL), 'utf8'),
    (error) => error.code === 'ENOENT',
  )
})

test('askJson surfaces the parse error when the model does not return JSON', async (t) => {
  const root = await tempDir(t)
  const { service, state } = createService('这不是 JSON')
  await assert.rejects(
    () => service.askJson(root, CONFIG, { key: 'bad', prompt: 'x' }),
    /模型没有返回可解析的 JSON/,
  )
  assert.equal(state.streamCalls, 1)
  assert.equal(state.runCommandCalls, 0)
  await assert.rejects(
    () => readFile(join(root, CACHE_REL), 'utf8'),
    (error) => error.code === 'ENOENT',
  )
})

test('askJson rethrows model stream failures without caching', async (t) => {
  const root = await tempDir(t)
  const { service } = createService('', { finishKind: 'error', finishMessage: '模型炸了' })
  await assert.rejects(
    () => service.askJson(root, CONFIG, { key: 'err', prompt: 'x' }),
    /模型炸了/,
  )
  await assert.rejects(
    () => readFile(join(root, CACHE_REL), 'utf8'),
    (error) => error.code === 'ENOENT',
  )
})

test('askJson does not hold the cache lock while the model call is pending', async (t) => {
  const root = await tempDir(t)
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(join(root, CACHE_REL), JSON.stringify({
    entries: {
      'w:example': {
        version: LOOKUP_VERSION,
        at: '2026-01-01T00:00:00.000Z',
        kind: 'word',
        ipa: '/igˈzɑːmpəl/',
        meanings: [{ pos: 'n.', zh: '例子' }],
        family: [],
        sentenceZh: '',
      },
    },
  }), 'utf8')
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { service } = createService(JSON_TEXT, { gate })
  const pending = service.askJson(root, CONFIG, { key: 'senses:lock', prompt: '分析 example' })
  try {
    const started = Date.now()
    const fast = await Promise.race([
      service.word(root, CONFIG, 'example'),
      new Promise((resolve) => setTimeout(() => resolve('BLOCKED'), 500)),
    ])
    assert.notEqual(fast, 'BLOCKED', 'a cached lookup must not wait for the pending analysis model call')
    assert.equal(fast.ok, true)
    assert.equal(fast.cached, true)
    assert.ok(Date.now() - started < 500)
  } finally {
    release()
    const done = await pending
    assert.equal(done.cached, false)
  }
})

test('askJson forwards an explicit timeout override to the bl backend', async (t) => {
  const root = await tempDir(t)
  const timeouts = []
  const service = createLookupService({
    ctx: { get: () => undefined },
    store: createWorkspaceStore(),
    env: {},
    runCommand: async (_command, _args, options) => {
      timeouts.push(options?.timeoutMs)
      return { stdout: JSON.stringify({ output: { text: '{"senses":[]}' } }) }
    },
  })
  const config = { ...CONFIG, lookup: { ...CONFIG.lookup, backend: 'bl' } }
  const first = await service.askJson(root, config, { key: 'senses:timeout', prompt: 'x', timeoutMs: 45000 })
  assert.equal(first.cached, false)
  assert.deepEqual(first.value, { senses: [] })
  assert.deepEqual(timeouts, [45000])
  await service.askJson(root, config, { key: 'senses:default', prompt: 'x' })
  assert.deepEqual(timeouts, [45000, CONFIG.lookup.timeoutMs])
})
