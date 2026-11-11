import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'
import { DomainError, ensureWorkspaceDirs } from '../host/paths.js'
import { createJobManager, safeJobError } from '../host/asr.js'

const CONFIG = normalizeConfig({ asr: { maxJobMinutes: 1 } }).config
const DEFAULT_MODEL = 'qwen-audio-3.1-asr-flash-filetrans'
const FALLBACK_MODEL = 'fun-asr'

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

function envelope(text) {
  return { output: { transcripts: [{ sentences: [{ begin_time: 0, end_time: 1000, speaker_id: 0, text: text ?? 'Hello world.' }] }] } }
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-asr-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

async function setup(t) {
  const root = await tempDir(t)
  await ensureWorkspaceDirs(root, CONFIG)
  return root
}

function makeRunner(options = {}) {
  const calls = []
  const failModels = options.failModels ?? []
  const raw = options.raw
  const never = options.never === true
  const run = async (command, args, runOptions = {}) => {
    calls.push({ command, args: [...args], timeoutMs: runOptions.timeoutMs })
    if (never) return new Promise(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1))
    const model = args[args.indexOf('--model') + 1]
    if (failModels.includes(model)) {
      throw Object.assign(new Error('命令失败（exit 1）'), { exitCode: 1, stderr: 'mock stderr' })
    }
    const out = args[args.indexOf('--out') + 1]
    await writeFile(out, typeof raw === 'string' ? raw : JSON.stringify(raw ?? envelope()))
    return { stdout: '', stderr: '' }
  }
  return { run, calls }
}

function makeManager(run) {
  return createJobManager({ store: createWorkspaceStore(), runCommand: run, env: {} })
}

async function startJob(manager, root, input = {}) {
  const audioPath = join(root, 'recordings', 'ep.mp3')
  const { jobId, transcript } = await manager.start(root, CONFIG, { model: DEFAULT_MODEL, language: 'en', ...input }, audioPath)
  return { jobId, transcript }
}

test('happy path: queued -> running -> done with persisted state and transcript', async (t) => {
  const root = await setup(t)
  const runner = makeRunner()
  const manager = makeManager(runner.run)
  const { jobId, transcript } = await startJob(manager, root, { speakers: 2 })
  assert.equal(transcript, 'transcripts/ep.json')
  const state = await manager.wait(jobId, undefined)
  assert.equal(state.state, 'done')
  assert.equal(state.model, DEFAULT_MODEL)
  assert.equal(state.segments, 1)
  assert.equal(state.speakers, 1)
  assert.equal(state.durationMs, 1000)
  assert.equal(runner.calls.length, 1)
  assert.equal(runner.calls[0].timeoutMs, 36000)
  assert.ok(runner.calls[0].args.includes('--speaker-count'))
  const storedTranscript = JSON.parse(await readFile(join(root, 'transcripts', 'ep.json'), 'utf8'))
  assert.equal(storedTranscript.version, 1)
  assert.equal(storedTranscript.segments[0].text, 'Hello world.')
  const jobsDir = join(root, 'transcripts', '.jobs')
  const jobFiles = (await readdir(jobsDir)).filter((name) => name.endsWith('.json') && !name.endsWith('.raw.json'))
  assert.deepEqual(jobFiles, [jobId + '.json'])
  const storedState = JSON.parse(await readFile(join(jobsDir, jobId + '.json'), 'utf8'))
  assert.equal(storedState.state, 'done')
  assert.equal(storedState.jobId, jobId)
  assert.equal(typeof storedState.heartbeatAt, 'string')
})

test('fallback model gets its own independent deadline', async (t) => {
  const root = await setup(t)
  const runner = makeRunner({ failModels: [DEFAULT_MODEL] })
  const manager = makeManager(runner.run)
  const { jobId } = await startJob(manager, root)
  const state = await manager.wait(jobId, undefined)
  assert.equal(state.state, 'done')
  assert.equal(state.model, FALLBACK_MODEL)
  assert.equal(state.warnings.length, 1)
  assert.match(state.warnings[0], /回退/)
  assert.equal(runner.calls.length, 2)
  assert.equal(runner.calls[0].timeoutMs, 36000)
  assert.equal(runner.calls[1].timeoutMs, 24000)
})

test('both models failing ends in failed with a safe error', async (t) => {
  const root = await setup(t)
  const runner = makeRunner({ failModels: [DEFAULT_MODEL, FALLBACK_MODEL] })
  const manager = makeManager(runner.run)
  const { jobId } = await startJob(manager, root)
  const state = await manager.wait(jobId, undefined)
  assert.equal(state.state, 'failed')
  assert.match(state.error, /命令失败/)
  assert.equal(runner.calls.length, 2)
  const storedState = JSON.parse(await readFile(join(root, 'transcripts', '.jobs', jobId + '.json'), 'utf8'))
  assert.equal(storedState.state, 'failed')
})

test('invalid ASR output fails the job and backs up the raw file', async (t) => {
  const root = await setup(t)
  const runner = makeRunner({ raw: '{ not json' })
  const manager = makeManager(runner.run)
  const { jobId } = await startJob(manager, root)
  const state = await manager.wait(jobId, undefined)
  assert.equal(state.state, 'failed')
  assert.match(state.error, /ASR 输出不是有效 JSON/)
  const originalError = console.error
  console.error = () => undefined
  const dir = join(root, 'transcripts', '.jobs')
  const names = await readdir(dir)
  console.error = originalError
  assert.ok(names.some((name) => name.includes('.corrupt-')))
})

test('job/not-found for unknown ids and job/not-found on empty id', async (t) => {
  const root = await setup(t)
  const manager = makeManager(makeRunner().run)
  await assert.rejects(() => manager.status(root, CONFIG, { id: 'nope' }), (error) => codeOf(error) === 'job/not-found')
  await assert.rejects(() => manager.status(root, CONFIG, {}), (error) => codeOf(error) === 'job/not-found')
  assert.throws(() => manager.wait('nope'), (error) => codeOf(error) === 'job/not-found')
})

test('stale running records are marked failed on read (heartbeat > 90s)', async (t) => {
  const root = await setup(t)
  const jobsDir = join(root, 'transcripts', '.jobs')
  const stale = {
    jobId: 'stale-job',
    state: 'running',
    transcript: 'transcripts/stale.json',
    startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    heartbeatAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  }
  await writeFile(join(jobsDir, 'stale-job.json'), JSON.stringify(stale), 'utf8')
  const manager = makeManager(makeRunner().run)
  const state = await manager.status(root, CONFIG, { id: 'stale-job' })
  assert.equal(state.state, 'failed')
  assert.match(state.error, /中断/)
  const stored = JSON.parse(await readFile(join(jobsDir, 'stale-job.json'), 'utf8'))
  assert.equal(stored.state, 'failed')
})

test('a fresh queued record from another instance is left alone until stale', async (t) => {
  const root = await setup(t)
  const jobsDir = join(root, 'transcripts', '.jobs')
  const fresh = {
    jobId: 'fresh-job',
    state: 'running',
    transcript: 'transcripts/fresh.json',
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  }
  await writeFile(join(jobsDir, 'fresh-job.json'), JSON.stringify(fresh), 'utf8')
  const manager = makeManager(makeRunner().run)
  const state = await manager.status(root, CONFIG, { id: 'fresh-job' })
  assert.equal(state.state, 'running')
})

test('dispose fails live jobs, kills the tree and releases reservations', async (t) => {
  const root = await setup(t)
  let childPid = 0
  const run = async (command, args, runOptions) => {
    runOptions.onChild?.({ pid: 999999, kill() {} })
    childPid = 999999
    return new Promise(() => undefined)
  }
  const manager = makeManager(run)
  const { jobId } = await startJob(manager, root)
  const waiting = manager.wait(jobId, undefined)
  await new Promise((resolve) => setTimeout(resolve, 20))
  await manager.dispose()
  const state = await waiting
  assert.equal(state.state, 'failed')
  assert.match(state.error, /卸载/)
  assert.equal(childPid, 999999)
  const names = await readdir(join(root, 'transcripts'))
  assert.equal(names.filter((name) => name.endsWith('.part')).length, 0)
  const stored = JSON.parse(await readFile(join(root, 'transcripts', '.jobs', jobId + '.json'), 'utf8'))
  assert.equal(stored.state, 'failed')
  await assert.rejects(() => manager.start(root, CONFIG, { model: DEFAULT_MODEL }, join(root, 'recordings', 'ep.mp3')), (error) => codeOf(error) === 'internal')
})

test('settled jobs are capped at the 50 most recent', async (t) => {
  const root = await setup(t)
  const runner = makeRunner()
  const manager = makeManager(runner.run)
  const ids = []
  for (let index = 0; index < 52; index += 1) {
    const { jobId } = await startJob(manager, root, { model: DEFAULT_MODEL })
    ids.push(jobId)
    await manager.wait(jobId, undefined)
  }
  assert.equal(manager.get(ids[0]), undefined)
  assert.equal(manager.get(ids[1]), undefined)
  assert.notEqual(manager.get(ids[2]), undefined)
  assert.notEqual(manager.get(ids[51]), undefined)
})

test('safeJobError strips absolute paths and line breaks', () => {
  const message = safeJobError(new Error('failed at C:\\Users\\me\\secret.txt\nand /home/me/secret.txt'))
  assert.doesNotMatch(message, /C:\\Users/)
  assert.doesNotMatch(message, /\/home\/me/)
  assert.doesNotMatch(message, /\n/)
})
