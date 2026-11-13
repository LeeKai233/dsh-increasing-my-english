import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHost } from '../host/api.js'

function createStub(rootRef) {
  const agents = new Map([['session-test', { id: 'session-test' }]])
  const ctx = {
    workingDirectory: {
      async ensure(agent) {
        if (!agent) throw new Error('missing agent')
        return rootRef.value
      },
    },
    get(name) {
      if (name === 'agents') return { get: (id) => agents.get(id) }
      return undefined
    },
  }
  return { ctx, agents }
}

async function makeHost(rootRef, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'english-library-int-'))
  return {
    root,
    host: createHost(createStub(rootRef).ctx, {
      env: {},
      librarySettingsPath: join(root, 'dsh-home', 'english-practice.json'),
      ...options,
    }),
  }
}

function transcriptDocument(text) {
  return {
    version: 1,
    audio: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    model: 'import',
    imported: true,
    durationMs: 0,
    warnings: [],
    speakers: [],
    segments: [{ i: 0, start: 0, end: 0, speaker: '0', text }],
  }
}

test('shared library: A data is visible and writable from B, and switching off restores B', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'english-library-int-'))
  const rootA = join(root, 'a')
  const rootB = join(root, 'b')
  await mkdir(join(rootA, 'transcripts'), { recursive: true })
  await mkdir(join(rootA, 'vocab'), { recursive: true })
  await mkdir(rootB, { recursive: true })
  await writeFile(join(rootA, 'transcripts', 'shared.json'), JSON.stringify(transcriptDocument('Hello shared world.')), 'utf8')
  const rootRef = { value: rootA }
  const created = await makeHost(rootRef, { env: { DSH_ENGLISH_BL: '__missing_bl__', DSH_ENGLISH_PDFTOPPM: '__missing_poppler__', DSH_ENGLISH_PDFTOTEXT: '__missing_poppler__' } })
  const host = created.host
  const agent = { id: 'session-test' }
  t.after(async () => {
    await host.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(created.root, { recursive: true, force: true })
  })

  const enabled = await host.dispatch(agent, 'library.set', { enabled: true })
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.root, rootA)
  assert.equal(enabled.usingShared, true)

  rootRef.value = rootB
  const status = await host.dispatch(agent, 'library.status', {})
  assert.equal(status.enabled, true)
  assert.equal(status.root, rootA)
  assert.equal(status.usingShared, false)
  assert.equal(status.exists, true)

  const list = await host.dispatch(agent, 'transcripts.list', {})
  assert.equal(list.length, 1)
  assert.equal(list[0].file, 'shared.json')
  const read = await host.dispatch(agent, 'transcripts.read', { file: 'shared.json' })
  assert.match(read.text, /Hello shared world/)
  await assert.rejects(stat(join(rootB, 'transcripts')), (error) => error.code === 'ENOENT')

  const added = await host.dispatch(agent, 'vocab.add', {
    kind: 'word',
    word: 'shared',
    ipa: '/ʃeəd/',
    meanings: [{ pos: 'adj.', zh: '共享的' }],
  })
  assert.equal(added.duplicate, false)
  const bVocab = await host.dispatch(agent, 'vocab.read', {})
  assert.match(bVocab.text, /shared/)
  rootRef.value = rootA
  const aVocab = await host.dispatch(agent, 'vocab.read', {})
  assert.match(aVocab.text, /shared/)

  const id = randomUUID()
  const pageDir = join(rootA, '.dsh-english', 'pdfs', id)
  await mkdir(pageDir, { recursive: true })
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
  await writeFile(join(pageDir, 'page-01.png'), bytes)
  rootRef.value = rootB
  const page = await host.dispatch(agent, 'pdf.page', { path: '.dsh-english/pdfs/' + id + '/page-01.png' })
  assert.equal(Buffer.from(page.data, 'base64').toString('hex'), bytes.toString('hex'))

  const envCheck = await host.dispatch(agent, 'env.check', {})
  assert.equal(envCheck.workspace.root, rootB)
  assert.equal(envCheck.library.enabled, true)
  assert.equal(envCheck.library.root, rootA)
  assert.equal(envCheck.library.exists, true)

  const disabled = await host.dispatch(agent, 'library.set', { enabled: false })
  assert.equal(disabled.enabled, false)
  const empty = await host.dispatch(agent, 'transcripts.list', {})
  assert.deepEqual(empty, [])
  assert.equal((await stat(join(rootA, 'transcripts', 'shared.json'))).isFile(), true)
})

test('shared library: a missing root fails data actions but still allows switching off', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'english-library-missing-'))
  const rootA = join(root, 'a')
  const rootB = join(root, 'b')
  await mkdir(join(rootA, 'transcripts'), { recursive: true })
  await mkdir(rootB, { recursive: true })
  await writeFile(join(rootA, 'transcripts', 'keep.json'), JSON.stringify(transcriptDocument('Keep me.')), 'utf8')
  const rootRef = { value: rootA }
  const created = await makeHost(rootRef)
  const host = created.host
  const agent = { id: 'session-test' }
  t.after(async () => {
    await host.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(created.root, { recursive: true, force: true })
  })

  await host.dispatch(agent, 'library.set', { enabled: true })
  await rm(rootA, { recursive: true, force: true })
  rootRef.value = rootB
  await assert.rejects(host.dispatch(agent, 'transcripts.list', {}), (error) => error.code === 'library/unavailable')
  const status = await host.dispatch(agent, 'library.status', {})
  assert.equal(status.exists, false)
  const disabled = await host.dispatch(agent, 'library.set', { enabled: false })
  assert.equal(disabled.enabled, false)
  const local = await host.dispatch(agent, 'transcripts.list', {})
  assert.deepEqual(local, [])
})

test('shared library: switching is rejected while a transcription is running', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'english-library-busy-'))
  const rootA = join(root, 'a')
  await mkdir(join(rootA, 'recordings'), { recursive: true })
  await writeFile(join(rootA, 'recordings', 'audio.mp3'), 'fake-audio', 'utf8')
  const rootRef = { value: rootA }
  const runCommand = async (command, args) => {
    if (Array.isArray(args) && args.includes('--version')) return { stdout: 'bl 9.9.9', stderr: '' }
    if (Array.isArray(args) && args[0] === 'auth') return { stdout: JSON.stringify({ authenticated: true }), stderr: '' }
    if (Array.isArray(args) && args[0] === 'speech') return new Promise(() => {})
    const error = new Error('missing')
    error.notFound = true
    throw error
  }
  const created = await makeHost(rootRef, { runCommand })
  const host = created.host
  const agent = { id: 'session-test' }
  t.after(async () => {
    await host.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(created.root, { recursive: true, force: true })
  })

  await host.startTranscription(agent, { audio: 'recordings/audio.mp3' })
  await assert.rejects(host.dispatch(agent, 'library.set', { enabled: true }), (error) => error.code === 'library/busy')
})
