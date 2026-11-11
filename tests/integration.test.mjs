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
  return { ctx, tools, routes, disposers }
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
    assert.deepEqual(Object.keys(value).sort(), ['bl', 'pdf', 'warnings', 'workspace'])
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
    const removed = await call({ action: 'vocab.remove', sessionId: 'session-test', payload: { ids: [added.json.value.id] } })
    assert.equal(removed.status, 200)
    assert.equal(removed.json.value.removed, 1)
    const afterRemove = JSON.parse(await readFile(join(root, 'vocab', 'vocabulary.json'), 'utf8'))
    assert.deepEqual(afterRemove.words, [])
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
