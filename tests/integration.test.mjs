/**
 * End-to-end host test with a stub DSH context: apply(ctx) must be fully
 * injectable (workingDirectory / tools / webServer / get / effect).
 * No DSH process, no network, no external CLI: the bl/poppler env overrides
 * point at deliberately missing commands.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { apply } from '../index.js'
import { ACTION_NAMES, ACTION_TIMEOUT_MS, getRequestTimeoutMs } from '../host/api.js'

function createStubContext(root) {
  const tools = new Map()
  const routes = new Map()
  const disposers = []
  const agents = new Map([['session-test', { id: 'session-test' }]])
  const llmCalls = []
  const ctx = {
    workingDirectory: {
      async ensure(agent) {
        if (!agent) throw new Error('missing agent')
        return root
      },
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    webServer: {
      register({ path, handler }) {
        routes.set(path, handler)
        return () => routes.delete(path)
      },
    },
    get(name) {
      if (name === 'agents') return { get: (id) => agents.get(id) }
      if (name === 'llm') {
        return {
          async *stream(options) {
            llmCalls.push(options)
            yield { type: 'text-delta', text: JSON.stringify({ senses: [{ pos: 'n.', zh: '例子', contexts: [1] }, { pos: 'v.', zh: '举例', contexts: [2] }] }) }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      }
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'stub-provider', model: 'stub-model' }) }
      return undefined
    },
    effect(fn) {
      const disposer = fn()
      if (typeof disposer === 'function') disposers.push(disposer)
      return () => {
        if (typeof disposer === 'function') disposer()
      }
    },
  }
  return { ctx, tools, routes, disposers, llmCalls }
}

/** Keep the shared-library setting inside the test workspace, never the real DSH home. */
function isolateDshHome(root) {
  const saved = process.env.DSH_HOME
  process.env.DSH_HOME = join(root, '.dsh-home')
  return () => {
    if (saved === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = saved
  }
}

function callHttp(handler, body, options = {}) {
  const text = typeof options.raw === 'string' ? options.raw : JSON.stringify(body)
  const req = new EventEmitter()
  req.method = options.method ?? 'POST'
  req.headers = options.headers ?? { 'content-type': 'application/json', 'x-english-practice': '1', origin: 'http://127.0.0.1:20052' }
  req.socket = { remoteAddress: options.remoteAddress ?? '127.0.0.1' }
  req.destroy = () => undefined
  const response = {
    headersSent: false,
    statusCode: 0,
    body: '',
    writeHead(status) {
      this.statusCode = status
      this.headersSent = true
    },
    end(chunk) {
      this.body += String(chunk ?? '')
    },
  }
  const done = handler(req, response)
  process.nextTick(() => {
    req.emit('data', Buffer.from(text))
    req.emit('end')
  })
  return done.then(() => ({
    status: response.statusCode,
    json: response.body === '' ? undefined : JSON.parse(response.body),
  }))
}

test('gateway timeout budget: 60s default, 300s for transcripts.import', () => {
  assert.equal(getRequestTimeoutMs('transcripts.list'), 60000)
  assert.equal(getRequestTimeoutMs('env.check'), 60000)
  assert.equal(getRequestTimeoutMs('vocab.add'), 60000)
  assert.equal(getRequestTimeoutMs('vocab.analyze'), 180000)
  assert.equal(getRequestTimeoutMs('graph.overview'), 30000)
  assert.equal(getRequestTimeoutMs('transcripts.import'), 300000)
  assert.equal(ACTION_TIMEOUT_MS['transcripts.import'], 300000)
  for (const action of ACTION_NAMES) {
    assert.equal(typeof getRequestTimeoutMs(action), 'number')
  }
})

test('host integration over a stub context (no DSH process)', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'english-int-'))
  const siblingName = 'english-outside-' + randomUUID().slice(0, 8)
  const outside = join(dirname(root), siblingName)
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'keep.txt'), 'keep')
  const savedEnv = {
    DSH_ENGLISH_BL: process.env.DSH_ENGLISH_BL,
    DSH_ENGLISH_PDFTOPPM: process.env.DSH_ENGLISH_PDFTOPPM,
    DSH_ENGLISH_PDFTOTEXT: process.env.DSH_ENGLISH_PDFTOTEXT,
  }
  process.env.DSH_ENGLISH_BL = '__missing_bl__'
  process.env.DSH_ENGLISH_PDFTOPPM = '__missing_pdftoppm__'
  process.env.DSH_ENGLISH_PDFTOTEXT = '__missing_pdftotext__'
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(join(root, '.dsh-english', 'config.json'), JSON.stringify({ asr: { toolTimeoutMinutes: 45 }, blPath: 'C:\\evil\\bl.exe', someFutureKey: true }), 'utf8')
  const stub = createStubContext(root)
  const restoreDshHome = isolateDshHome(root)
  apply(stub.ctx)
  t.after(async () => {
    for (const disposer of [...stub.disposers].reverse()) {
      try {
        await disposer()
      } catch {
        // best effort
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restoreDshHome()
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })
  const handler = stub.routes.get('/dsh-english/api')
  assert.equal(typeof handler, 'function')
  assert.deepEqual([...stub.tools.keys()].sort(), ['english_transcribe', 'english_vocab'])
  assert.equal(stub.tools.get('english_transcribe').timeoutMs, 32 * 60 * 1000)

  async function call(body, options) {
    return callHttp(handler, body, options)
  }

  await t.test('env.check returns the frozen shape with actionable messages', async () => {
    const result = await call({ action: 'env.check', sessionId: 'session-test', payload: {} })
    assert.equal(result.status, 200)
    assert.equal(result.json.ok, true)
    const value = result.json.value
    assert.deepEqual(Object.keys(value).sort(), ['bl', 'library', 'pdf', 'warnings', 'workspace'])
    assert.equal(value.library.enabled, false)
    assert.equal(value.library.exists, false)
    assert.equal(value.library.root, null)
    assert.equal(value.workspace.root, root)
    for (const key of ['writable', 'transcripts', 'vocab', 'recordings']) assert.equal(typeof value.workspace[key], 'boolean')
    assert.equal(value.workspace.writable, true)
    assert.equal(value.bl.present, false)
    assert.match(value.bl.message, /npm i -g bailian-cli/)
    assert.match(value.bl.message, /bl auth login --console/)
    assert.equal(value.pdf.present, false)
    assert.equal(value.pdf.tool, '__missing_pdftoppm__')
    assert.match(value.pdf.message, /poppler/)
    assert.ok(Array.isArray(value.warnings))
    const warnings = value.warnings.join('\n')
    assert.match(warnings, /blPath/)
    assert.match(warnings, /DSH_ENGLISH_BL/)
    assert.match(warnings, /someFutureKey/)
    // asr.toolTimeoutMinutes is applied to the registered english_transcribe tool.
    assert.equal(stub.tools.get('english_transcribe').timeoutMs, 45 * 60 * 1000)
  })

  await t.test('transcripts import -> list -> merge -> delete', async () => {
    const imported = await call({
      action: 'transcripts.import',
      sessionId: 'session-test',
      payload: { name: 'sample.txt', content: 'Hello world.\n\nSecond paragraph.' },
    })
    assert.equal(imported.status, 200)
    assert.deepEqual(imported.json.value, { file: 'sample.json', segments: 2, pages: 0 })
    const listed = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} })
    assert.equal(listed.status, 200)
    assert.equal(listed.json.value.length, 1)
    assert.equal(listed.json.value[0].file, 'sample.json')
    const read = await call({ action: 'transcripts.read', sessionId: 'session-test', payload: { file: 'sample.json' } })
    assert.equal(read.status, 200)
    assert.match(read.json.value.text, /Hello world/)
    const readBad = await call({ action: 'transcripts.read', sessionId: 'session-test', payload: { file: '../evil.json' } })
    assert.equal(readBad.status, 400)
    assert.equal(readBad.json.code, 'transcript/invalid-name')
    const merged = await call({ action: 'transcripts.merge', sessionId: 'session-test', payload: { file: 'sample.json' } })
    assert.equal(merged.status, 200)
    assert.deepEqual(merged.json.value, { file: 'sample.json', before: 2, after: 2, changed: false })
    const deleted = await call({ action: 'transcripts.delete', sessionId: 'session-test', payload: { file: 'sample.json' } })
    assert.equal(deleted.status, 200)
    assert.deepEqual(deleted.json.value, { file: 'sample.json', deleted: true })
    const afterDelete = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} })
    assert.deepEqual(afterDelete.json.value, [])
  })

  await t.test('vocab.add -> vocabulary.json + 生词本.md -> vocab.remove', async () => {
    const emptyVocab = await call({ action: 'vocab.read', sessionId: 'session-test', payload: {} })
    assert.equal(emptyVocab.status, 200)
    assert.equal(emptyVocab.json.value.text, null)
    const added = await call({
      action: 'vocab.add',
      sessionId: 'session-test',
      payload: {
        kind: 'word',
        word: 'example',
        ipa: '/ig/',
        meanings: [{ pos: 'n.', zh: '例子' }],
        sentence: 'This is an example.',
        sentenceZh: '这是一个例句。',
        source: { title: 'Podcast', speaker: '1', startMs: 1000 },
      },
    })
    assert.equal(added.status, 200)
    assert.equal(added.json.value.duplicate, false)
    assert.equal(typeof added.json.value.id, 'string')
    const stored = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
    assert.equal(stored.version, 1)
    assert.equal(stored.words.length, 1)
    assert.equal(stored.words[0].word, 'example')
    const markdown = await readFile(join(root, 'vocab', '生词本.md'), 'utf8')
    assert.match(markdown, /example/)
    const vocabText = await call({ action: 'vocab.read', sessionId: 'session-test', payload: {} })
    assert.equal(vocabText.status, 200)
    assert.match(vocabText.json.value.text, /example/)
    const removed = await call({ action: 'vocab.remove', sessionId: 'session-test', payload: { ids: [added.json.value.id] } })
    assert.equal(removed.status, 200)
    assert.equal(removed.json.value.removed, 1)
    const afterRemove = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
    assert.deepEqual(afterRemove.words, [])
  })

  await t.test('vocab.analyze appends senses found across transcripts and records evidence', async () => {
    const imported = await call({
      action: 'transcripts.import',
      sessionId: 'session-test',
      payload: { name: 'senses.txt', content: 'This is an example.\n\nThe example is simple.' },
    })
    assert.equal(imported.status, 200)
    const added = await call({
      action: 'vocab.add',
      sessionId: 'session-test',
      payload: {
        kind: 'word',
        word: 'example',
        meanings: [{ pos: 'n.', zh: '例子' }],
        sentence: 'This is an example.',
        source: { transcript: 'senses.json', title: 'senses', speaker: '', startMs: 0 },
      },
    })
    assert.equal(added.status, 200)
    assert.equal(added.json.value.duplicate, false)
    const before = stub.llmCalls.length
    const analyzed = await call({ action: 'vocab.analyze', sessionId: 'session-test', payload: { id: added.json.value.id } })
    assert.equal(analyzed.status, 200)
    assert.equal(analyzed.json.ok, true)
    assert.equal(analyzed.json.value.analyzed, 1)
    assert.ok(analyzed.json.value.added >= 1)
    assert.ok(stub.llmCalls.length > before, 'analysis must call the model backend')
    const stored = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
    const entry = stored.words.find((item) => item.word === 'example')
    assert.equal(entry.analysis.status, 'done')
    assert.ok(entry.analysis.fingerprint.length > 0)
    assert.ok(entry.meanings.some((meaning) => meaning.zh === '举例'))
    const evidence = entry.meanings.find((meaning) => meaning.zh === '例子')
    assert.equal(typeof evidence.example, 'string')
    const markdown = await readFile(join(root, 'vocab', '生词本.md'), 'utf8')
    assert.match(markdown, /多义分析/)
    const removed = await call({ action: 'vocab.remove', sessionId: 'session-test', payload: { ids: [added.json.value.id] } })
    assert.equal(removed.status, 200)
    await call({ action: 'transcripts.delete', sessionId: 'session-test', payload: { file: 'senses.json' } })
  })

  await t.test('job with an unknown id is job/not-found (404)', async () => {
    const result = await call({ action: 'job', sessionId: 'session-test', payload: { id: 'does-not-exist' } })
    assert.equal(result.status, 404)
    assert.equal(result.json.ok, false)
    assert.equal(result.json.code, 'job/not-found')
  })

  await t.test('P0: a traversal pdfId refuses deletion and keeps the outside file', async () => {
    const created = await mkdir(join(root, 'transcripts'), { recursive: true })
    assert.equal(created, undefined)
    const pdfId = '../../../' + siblingName
    await writeFile(join(root, 'transcripts', 'evil.json'), JSON.stringify({ version: 1, segments: [], pdf: true, pdfId }), 'utf8')
    const result = await call({ action: 'transcripts.delete', sessionId: 'session-test', payload: { file: 'evil.json' } })
    assert.equal(result.status, 400)
    assert.equal(result.json.code, 'path/invalid')
    assert.equal((await stat(join(root, 'transcripts', 'evil.json'))).isFile(), true)
    assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep')
  })

  await t.test('P0: traversal transcript file names are rejected', async () => {
    const result = await call({ action: 'transcripts.delete', sessionId: 'session-test', payload: { file: '..\\evil.json' } })
    assert.equal(result.status, 400)
    assert.equal(result.json.code, 'transcript/invalid-name')
    const listed = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} })
    assert.equal(listed.json.ok, true)
  })

  await t.test('pdf.page returns a rendered page and rejects traversal', async () => {
    const id = randomUUID()
    const directory = join(root, '.dsh-english', 'pdfs', id)
    await mkdir(directory, { recursive: true })
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    await writeFile(join(directory, 'page-01.png'), bytes)
    const relativePath = '.dsh-english/pdfs/' + id + '/page-01.png'
    const ok = await call({ action: 'pdf.page', sessionId: 'session-test', payload: { path: relativePath } })
    assert.equal(ok.status, 200)
    assert.equal(Buffer.from(ok.json.value.data, 'base64').toString('hex'), bytes.toString('hex'))
    const bad = await call({ action: 'pdf.page', sessionId: 'session-test', payload: { path: '../evil.png' } })
    assert.equal(bad.status, 400)
    assert.equal(bad.json.code, 'path/invalid')
  })

  await t.test('auth: missing header, non-loopback peer and foreign Origin are rejected', async () => {
    const missing = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} }, {
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(missing.status, 403)
    assert.equal(missing.json.code, 'http/forbidden')
    const remote = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} }, { remoteAddress: '10.1.2.3' })
    assert.equal(remote.status, 403)
    assert.equal(remote.json.code, 'http/forbidden')
    const foreign = await call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} }, {
      headers: { 'content-type': 'application/json', 'x-english-practice': '1', origin: 'https://evil.example.com' },
    })
    assert.equal(foreign.status, 403)
    assert.equal(foreign.json.code, 'http/origin')
    const unknown = await call({ action: 'nope.nope', sessionId: 'session-test', payload: {} })
    assert.equal(unknown.status, 400)
    assert.equal(unknown.json.code, 'action/unknown')
    const offline = await call({ action: 'transcripts.list', sessionId: 'session-ghost', payload: {} })
    assert.equal(offline.status, 409)
    assert.equal(offline.json.code, 'session/unavailable')
  })

  await t.test('agent tools: english_vocab works and english_transcribe preflights bl', async () => {
    const vocabTool = stub.tools.get('english_vocab')
    const listed = await vocabTool.execute({ action: 'list' }, { agent: { id: 'session-test' }, signal: new AbortController().signal })
    assert.equal(listed.ok, true)
    assert.equal(listed.total, 0)
    assert.deepEqual(listed.entries, [])
    const analyzed = await vocabTool.execute({ action: 'analyze' }, { agent: { id: 'session-test' }, signal: new AbortController().signal })
    assert.equal(analyzed.ok, true)
    assert.equal(typeof analyzed.analyzed, 'number')
    assert.equal(typeof analyzed.remaining, 'number')
    const added = await vocabTool.execute({ action: 'add', kind: 'word', entry: { word: 'toolword', ipa: '/tuːl/' } }, { agent: { id: 'session-test' }, signal: new AbortController().signal })
    assert.equal(added.ok, true)
    assert.equal(added.duplicate, false)
    await writeFile(join(root, 'recordings', 'audio.mp3'), 'fake-audio')
    const transcribeTool = stub.tools.get('english_transcribe')
    const result = await transcribeTool.execute({ audio: 'recordings/audio.mp3' }, { agent: { id: 'session-test' }, signal: new AbortController().signal })
    assert.equal(result.ok, false)
    assert.match(result.error, /npm i -g bailian-cli/)
    assert.match(result.error, /bl auth login --console/)
  })

  await t.test('transport: 1MB per-action body cap and rate limiting', async () => {
    const big = await call({
      action: 'vocab.add',
      sessionId: 'session-test',
      payload: { kind: 'word', word: 'x', padding: 'a'.repeat(1024 * 1024 + 16) },
    })
    assert.equal(big.status, 413)
    assert.equal(big.json.code, 'http/too-large')
    const burst = await Promise.all(Array.from({ length: 120 }, () => call({ action: 'transcripts.list', sessionId: 'session-test', payload: {} })))
    const limited = burst.filter((result) => result.status === 429)
    assert.ok(limited.length > 0, 'expected at least one 429 in a 120-request burst')
    assert.equal(limited[0].json.code, 'http/rate-limited')
  })
})

/**
 * 背记（recall）HTTP 子测试：真实 host 组装（apply + stub context + 临时工作区），
 * 全程只走 HTTP action 分发表，逐字段核对 spec §3.2 的 Overview 契约与 §3.1 的错误码。
 *
 * 期望日期一律用 host/recall.js 导出的 localDateOf/addDays 计算（宿主本地日期），
 * 不写死 UTC 日期，避免时区脆弱。模块用动态 import 取，保持对本文件的「追加」式增量，
 * 不动上方共享 import 区（该文件另有并发 workstream 在改）。
 */
test('recall HTTP: overview / grade / reset over a stub context', async (t) => {
  const { localDateOf, addDays } = await import('../host/recall.js')
  const root = await mkdtemp(join(tmpdir(), 'english-recall-int-'))
  const stub = createStubContext(root)
  const restoreDshHome = isolateDshHome(root)
  apply(stub.ctx)
  t.after(async () => {
    for (const disposer of [...stub.disposers].reverse()) {
      try {
        await disposer()
      } catch {
        // best effort
      }
    }
    restoreDshHome()
    await rm(root, { recursive: true, force: true })
  })
  const handler = stub.routes.get('/dsh-english/api')
  assert.equal(typeof handler, 'function')
  const call = (action, payload) => callHttp(handler, { action, sessionId: 'session-test', payload })
  const recallPath = join(root, '.dsh-english', 'recall.json')

  // ── 1. vocab.add 两个可练习单词（kind=word + 中文释义）──
  const wordSpecs = [
    {
      word: 'serendipity',
      ipa: '/ˌserənˈdɪpəti/',
      meanings: [{ pos: 'n.', zh: '意外发现珍奇事物的能力' }],
      family: [{ label: 'adv.', form: 'serendipitously' }],
      sentence: 'Serendipity found us.',
      sentenceZh: '机缘让我们相遇。',
    },
    {
      word: 'ephemeral',
      ipa: '/ɪˈfemərəl/',
      meanings: [{ pos: 'adj.', zh: '短暂的' }],
    },
  ]
  const added = []
  for (const spec of wordSpecs) {
    const result = await call('vocab.add', { kind: 'word', ...spec })
    assert.equal(result.status, 200)
    assert.equal(result.json.ok, true)
    assert.equal(result.json.value.duplicate, false)
    assert.equal(result.json.value.entry.word, spec.word)
    added.push(result.json.value)
  }
  const [firstId, secondId] = added.map((item) => item.id)

  // ── 2. 首次 overview：today 轮次规划、形状、落盘 ──
  const firstOverview = await call('recall.overview', {})
  assert.equal(firstOverview.status, 200)
  assert.equal(firstOverview.json.ok, true)
  const overview = firstOverview.json.value
  const today = overview.date
  assert.equal(today, localDateOf())
  const tomorrow = addDays(today, 1)
  assert.deepEqual(Object.keys(overview).sort(), ['config', 'date', 'history', 'items', 'summary', 'words'])
  assert.deepEqual(overview.config, { newPerDay: 10, dailyLimit: 30, mode: 'mix' })
  assert.deepEqual(Object.keys(overview.summary).sort(), [
    'correct', 'due', 'eligible', 'learning', 'mastered', 'new',
    'nextAt', 'roundDone', 'roundTotal', 'streakDays', 'words', 'wrong',
  ])
  assert.equal(overview.summary.words, 2)
  assert.equal(overview.summary.eligible, 2)
  assert.equal(overview.summary.new, 2)
  for (const counter of ['learning', 'mastered', 'due', 'correct', 'wrong', 'streakDays']) {
    assert.equal(overview.summary[counter], 0)
  }
  assert.equal(overview.summary.roundTotal, 2)
  assert.equal(overview.summary.roundDone, 0)
  assert.equal(overview.summary.nextAt, null)
  assert.equal(overview.items.length, 2)
  const plannedIds = overview.items.map((item) => item.entryId)
  assert.deepEqual([...plannedIds].sort(), [firstId, secondId].sort())
  for (const item of overview.items) {
    assert.deepEqual(Object.keys(item).sort(), [
      'done', 'entryId', 'family', 'ipa', 'mastery', 'meanings',
      'result', 'sentence', 'sentenceZh', 'status', 'word',
    ])
    assert.equal(item.mastery, 0)
    assert.equal(item.status, 'new')
    assert.equal(item.done, false)
    assert.equal(item.result, null)
    assert.ok(Array.isArray(item.meanings) && item.meanings.length > 0)
    assert.ok(item.meanings.every((meaning) => typeof meaning.pos === 'string' && typeof meaning.zh === 'string'))
    assert.ok(Array.isArray(item.family))
    assert.equal(typeof item.word, 'string')
    assert.equal(typeof item.ipa, 'string')
    assert.equal(typeof item.sentence, 'string')
    assert.equal(typeof item.sentenceZh, 'string')
  }
  const plannedFirst = overview.items.find((item) => item.entryId === firstId)
  assert.equal(plannedFirst.word, 'serendipity')
  assert.equal(plannedFirst.ipa, '/ˌserənˈdɪpəti/')
  assert.deepEqual(plannedFirst.meanings, [{ pos: 'n.', zh: '意外发现珍奇事物的能力' }])
  assert.deepEqual(plannedFirst.family, [{ label: 'adv.', form: 'serendipitously' }])
  assert.equal(plannedFirst.sentence, 'Serendipity found us.')
  assert.equal(plannedFirst.sentenceZh, '机缘让我们相遇。')
  // words[]：当前生词本全部单词条目，排序 mastery 升序 → word 升序
  assert.ok(Array.isArray(overview.words))
  assert.equal(overview.words.length, 2)
  assert.deepEqual(overview.words.map((word) => word.word), ['ephemeral', 'serendipity'])
  for (const word of overview.words) {
    assert.deepEqual(Object.keys(word).sort(), [
      'correct', 'entryId', 'lastGrade', 'learned', 'mastery', 'nextAt', 'reviews', 'streak', 'word',
    ])
    assert.equal(word.learned, false)
    assert.equal(word.mastery, 0)
    assert.equal(word.nextAt, null)
    assert.equal(word.reviews, 0)
    assert.equal(word.correct, 0)
    assert.equal(word.streak, 0)
    assert.equal(word.lastGrade, null)
  }
  // history[]：今天已规划（有 items、无 results）就应出现一行
  assert.ok(Array.isArray(overview.history))
  assert.deepEqual(overview.history, [{ date: today, total: 2, done: 0, correct: 0 }])
  // 落盘：.dsh-english/recall.json version 1，当天 items = 今日轮次顺序
  const plannedFile = JSON.parse(await readFile(recallPath, 'utf8'))
  assert.equal(plannedFile.version, 1)
  assert.equal(typeof plannedFile.updatedAt, 'string')
  assert.deepEqual(plannedFile.days[today].items, plannedIds)
  assert.deepEqual(plannedFile.days[today].results, [])
  assert.deepEqual(plannedFile.words, {})

  // ── 3. grade good（en-zh）：mastery=1、nextAt=明天、roundDone=1、落盘 ──
  const graded = await call('recall.grade', { entryId: firstId, grade: 'good', mode: 'en-zh' })
  assert.equal(graded.status, 200)
  const afterGrade = graded.json.value
  assert.equal(afterGrade.date, today)
  assert.equal(afterGrade.summary.roundTotal, 2)
  assert.equal(afterGrade.summary.roundDone, 1)
  assert.equal(afterGrade.summary.correct, 1)
  assert.equal(afterGrade.summary.wrong, 0)
  assert.equal(afterGrade.summary.learning, 1)
  assert.equal(afterGrade.summary.new, 1)
  assert.equal(afterGrade.summary.mastered, 0)
  assert.equal(afterGrade.summary.nextAt, tomorrow)
  const gradedItem = afterGrade.items.find((item) => item.entryId === firstId)
  assert.equal(gradedItem.done, true)
  assert.equal(gradedItem.mastery, 1)
  assert.equal(gradedItem.status, 'due')
  assert.equal(gradedItem.result.grade, 'good')
  assert.equal(gradedItem.result.mode, 'en-zh')
  assert.match(gradedItem.result.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const gradedWord = afterGrade.words.find((word) => word.entryId === firstId)
  assert.equal(gradedWord.learned, true)
  assert.equal(gradedWord.mastery, 1)
  assert.equal(gradedWord.nextAt, tomorrow)
  assert.equal(gradedWord.reviews, 1)
  assert.equal(gradedWord.correct, 1)
  assert.equal(gradedWord.streak, 1)
  assert.equal(gradedWord.lastGrade, 'good')
  assert.deepEqual(afterGrade.history, [{ date: today, total: 2, done: 1, correct: 1 }])
  const gradedFile = JSON.parse(await readFile(recallPath, 'utf8'))
  assert.equal(gradedFile.version, 1)
  assert.equal(gradedFile.words[firstId].mastery, 1)
  assert.equal(gradedFile.words[firstId].nextAt, tomorrow)
  assert.equal(gradedFile.words[firstId].createdAt, today)
  assert.equal(gradedFile.words[firstId].lastGrade, 'good')
  assert.equal(gradedFile.words[firstId].lastMode, 'en-zh')
  assert.equal(gradedFile.words[firstId].lastAt, gradedItem.result.at)
  assert.equal(gradedFile.words[secondId], undefined)
  assert.deepEqual(gradedFile.days[today].results, [
    { id: firstId, grade: 'good', mode: 'en-zh', at: gradedItem.result.at },
  ])

  // ── 4. 同一天再次 overview：轮次不重排、完成状态保留 ──
  const reopened = await call('recall.overview', {})
  assert.equal(reopened.status, 200)
  const reopenedValue = reopened.json.value
  assert.equal(reopenedValue.date, today)
  assert.deepEqual(reopenedValue.items.map((item) => item.entryId), plannedIds)
  assert.equal(reopenedValue.summary.roundTotal, 2)
  assert.equal(reopenedValue.summary.roundDone, 1)
  assert.equal(reopenedValue.items.find((item) => item.entryId === firstId).done, true)
  assert.equal(reopenedValue.items.find((item) => item.entryId === secondId).done, false)

  // ── 5. 错误码：未知 entryId → 404 recall/not-found；非法参数 → 400 recall/invalid ──
  const unknownId = await call('recall.grade', { entryId: randomUUID(), grade: 'good' })
  assert.equal(unknownId.status, 404)
  assert.equal(unknownId.json.ok, false)
  assert.equal(unknownId.json.code, 'recall/not-found')
  const invalidGrade = await call('recall.grade', { entryId: secondId, grade: 'nope' })
  assert.equal(invalidGrade.status, 400)
  assert.equal(invalidGrade.json.ok, false)
  assert.equal(invalidGrade.json.code, 'recall/invalid')
  assert.equal(typeof invalidGrade.json.message, 'string')
  const invalidMode = await call('recall.grade', { entryId: secondId, grade: 'good', mode: 'auto' })
  assert.equal(invalidMode.status, 400)
  assert.equal(invalidMode.json.code, 'recall/invalid')
  const missingEntryId = await call('recall.grade', { grade: 'good' })
  assert.equal(missingEntryId.status, 400)
  assert.equal(missingEntryId.json.code, 'recall/invalid')
  // 失败不应写盘
  const afterErrors = JSON.parse(await readFile(recallPath, 'utf8'))
  assert.equal(afterErrors.days[today].results.length, 1)
  assert.equal(afterErrors.words[secondId], undefined)

  // ── 6. reset all：清空进度、当天轮次重新规划（所有词按新词处理）──
  const reset = await call('recall.reset', { all: true })
  assert.equal(reset.status, 200)
  const afterReset = reset.json.value
  assert.equal(afterReset.date, today)
  assert.equal(afterReset.summary.roundTotal, 2)
  assert.equal(afterReset.summary.roundDone, 0)
  assert.equal(afterReset.summary.new, 2)
  assert.equal(afterReset.summary.nextAt, null)
  for (const counter of ['learning', 'mastered', 'due', 'correct', 'wrong', 'streakDays']) {
    assert.equal(afterReset.summary[counter], 0)
  }
  assert.deepEqual(afterReset.items.map((item) => item.entryId).sort(), [...plannedIds].sort())
  for (const item of afterReset.items) {
    assert.equal(item.mastery, 0)
    assert.equal(item.status, 'new')
    assert.equal(item.done, false)
    assert.equal(item.result, null)
  }
  for (const word of afterReset.words) {
    assert.equal(word.learned, false)
    assert.equal(word.mastery, 0)
    assert.equal(word.nextAt, null)
    assert.equal(word.reviews, 0)
  }
  assert.deepEqual(afterReset.history, [{ date: today, total: 2, done: 0, correct: 0 }])
  const resetFile = JSON.parse(await readFile(recallPath, 'utf8'))
  assert.equal(resetFile.version, 1)
  assert.deepEqual(resetFile.words, {})
  assert.deepEqual(resetFile.days[today].results, [])
  assert.deepEqual(resetFile.days[today].items, plannedIds)
})

/**
 * 图谱（graph）HTTP 子测试：真实 host 组装（apply + stub context + 临时工作区），
 * 只走 HTTP action 分发表，核对 graph.overview 的 payload 契约、来源边与删稿后的收敛。
 */
test('graph HTTP: overview exposes transcript-word and word-word relations', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'english-graph-int-'))
  const stub = createStubContext(root)
  const restoreDshHome = isolateDshHome(root)
  apply(stub.ctx)
  t.after(async () => {
    for (const disposer of [...stub.disposers].reverse()) {
      try {
        await disposer()
      } catch {
        // best effort
      }
    }
    restoreDshHome()
    await rm(root, { recursive: true, force: true })
  })
  const handler = stub.routes.get('/dsh-english/api')
  assert.equal(typeof handler, 'function')
  const call = (action, payload) => callHttp(handler, { action, sessionId: 'session-test', payload })

  // 空工作区：200 + 空图（不是错误）
  const empty = await call('graph.overview', {})
  assert.equal(empty.status, 200)
  assert.equal(empty.json.ok, true)
  const emptyValue = empty.json.value
  assert.deepEqual(Object.keys(emptyValue).sort(), ['generatedAt', 'links', 'nodes', 'summary', 'version'])
  assert.equal(emptyValue.version, 1)
  assert.equal(emptyValue.summary.words, 0)
  assert.equal(emptyValue.summary.transcripts, 0)
  assert.equal(emptyValue.summary.links.total, 0)
  assert.match(emptyValue.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

  // 一篇文稿 + 三个词（alpha 带来源文稿与例句）
  const imported = await call('transcripts.import', {
    name: 'graph.txt',
    content: 'Alpha beta share one sentence.\n\nGamma sits alone.',
  })
  assert.equal(imported.status, 200)
  const file = imported.json.value.file
  const specs = [
    {
      word: 'alpha',
      meanings: [{ pos: 'v.', zh: '甲' }],
      sentence: 'Alpha beta share one sentence.',
      source: { transcript: file, title: 'graph', speaker: '0', startMs: 0 },
    },
    { word: 'beta', meanings: [{ pos: 'v.', zh: '乙' }] },
    { word: 'gamma', meanings: [{ pos: 'v.', zh: '丙' }] },
  ]
  const ids = {}
  for (const spec of specs) {
    const added = await call('vocab.add', { kind: 'word', ...spec })
    assert.equal(added.status, 200)
    assert.equal(added.json.value.duplicate, false)
    ids[spec.word] = added.json.value.id
  }

  const graph = await call('graph.overview', {})
  assert.equal(graph.status, 200)
  assert.equal(graph.json.ok, true)
  const value = graph.json.value
  assert.equal(value.summary.words, 3)
  assert.equal(value.summary.transcripts, 1)
  assert.equal(value.summary.linkedWords, 3)
  assert.equal(value.summary.isolatedWords, 0)
  assert.equal(value.summary.links.appears, 3)
  assert.equal(value.summary.links.cooccur, 1)
  assert.equal(value.summary.links.morph, 0)
  assert.equal(value.summary.links.sense, 0)
  assert.deepEqual(value.summary.truncated, { words: 0, transcripts: 0 })
  assert.equal(value.nodes.length, 4)

  const transcriptNode = value.nodes.find((node) => node.kind === 'transcript')
  assert.equal(transcriptNode.id, 't:' + file)
  assert.equal(transcriptNode.file, file)
  assert.equal(transcriptNode.matchedWords, 3)
  assert.equal(transcriptNode.segments, 2)
  const alphaNode = value.nodes.find((node) => node.id === 'w:' + ids.alpha)
  assert.equal(alphaNode.word, 'alpha')
  assert.equal(alphaNode.degree, 2)
  assert.deepEqual(alphaNode.meanings, [{ pos: 'v.', zh: '甲' }])

  const origin = value.links.find((link) => link.kind === 'appears' && link.target === 'w:' + ids.alpha)
  assert.equal(origin.origin, true)
  assert.equal(origin.count, 1)
  assert.equal(origin.sample.text, 'Alpha beta share one sentence.')
  assert.equal(origin.sample.transcript, file)
  assert.equal(origin.sample.startMs, 0)
  assert.equal(origin.sample.speaker, '0')
  const gamma = value.links.find((link) => link.kind === 'appears' && link.target === 'w:' + ids.gamma)
  assert.equal(gamma.origin, false)
  assert.equal(gamma.sample, undefined)

  const cooccur = value.links.find((link) => link.kind === 'cooccur')
  assert.deepEqual([cooccur.source, cooccur.target].sort(), ['w:' + ids.alpha, 'w:' + ids.beta].sort())
  assert.equal(cooccur.sentences, 1)
  assert.equal(cooccur.docs, 1)

  // 删除文稿后：文稿节点与全部边消失，词回到孤立状态
  const deleted = await call('transcripts.delete', { file })
  assert.equal(deleted.status, 200)
  const after = await call('graph.overview', {})
  assert.equal(after.status, 200)
  assert.equal(after.json.value.summary.transcripts, 0)
  assert.equal(after.json.value.summary.links.total, 0)
  assert.equal(after.json.value.summary.isolatedWords, 3)
  assert.equal(after.json.value.nodes.filter((node) => node.kind === 'transcript').length, 0)
  assert.equal(after.json.value.nodes.filter((node) => node.kind === 'word').length, 3)
})
