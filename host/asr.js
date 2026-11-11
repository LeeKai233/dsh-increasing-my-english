/**
 * ASR job state machine: queued -> running -> done | failed.
 *
 * - every transition is persisted to transcripts/.jobs/<id>.json
 * - heartbeat every 15s; a queued/running record older than 90s is dead
 *   (checked on startup recovery and on every read)
 * - settled jobs stay in memory for the 50 most recent runs
 * - the primary and fallback model each get an independent deadline
 *   (60% / 40% of asr.maxJobMinutes)
 * - dispose() marks live jobs failed and kills their process trees
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import { resolveExecutable } from './config.js'
import { killTree } from './env.js'
import {
  fail,
  isRecord,
  messageOf,
  normalizedPath,
  releaseReservation,
  reserveFileName,
  resolveInWorkspace,
  sanitizeStem,
  within,
} from './paths.js'
import { normalizeTranscript } from './transcript.js'

export const HEARTBEAT_MS = 15000
export const STALE_MS = 90000
export const MAX_SETTLED = 50
export const MAIN_BUDGET_RATIO = 0.6

/** Strip absolute paths / control chars before persisting a user-facing error. */
export function safeJobError(error) {
  const raw = messageOf(error)
  const cleaned = raw
    .replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>')
    .replace(/\/(?:[^\s/]+\/)+[^\s/]*/g, '<path>')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
  return cleaned.length > 300 ? cleaned.slice(0, 300) + '…' : cleaned
}

function jobFailureMessage(error) {
  if (error?.timedOut === true) return '转写超时（' + messageOf(error) + '）'
  if (error?.cancelled === true) return '转写已取消'
  if (error?.notFound === true) return '找不到 Bailian CLI（bl），请先安装并登录后再试'
  if (error?.exitCode !== undefined && error?.exitCode !== null) return messageOf(error)
  return '转写失败：' + safeJobError(error)
}

/** Create the ASR job manager (store + runCommand injected). */
export function createJobManager(options) {
  const store = options.store
  const runCommand = options.runCommand
  const env = options.env ?? process.env
  const now = options.now ?? (() => Date.now())
  const jobs = new Map()
  const settledOrder = []
  const recoveredRoots = new Set()
  let disposed = false

  function jobPath(root, config, jobId) {
    return join(resolveInWorkspace(root, config.dirs.transcripts), '.jobs', jobId + '.json')
  }

  /** Serialize state writes; each queued write snapshots the latest state. */
  function persist(job) {
    job.persistChain = (job.persistChain ?? Promise.resolve())
      .then(() => store.writeJson(job.statePath, job.state))
      .catch((error) => {
        console.error('[english-practice] 写入转写任务状态失败：', job.id, error?.code ?? error)
      })
    return job.persistChain
  }

  async function finish(job, stateName, patch) {
    if (job.heartbeat !== undefined) clearInterval(job.heartbeat)
    job.heartbeat = undefined
    job.child = undefined
    job.state = {
      ...job.state,
      ...patch,
      state: stateName,
      finishedAt: new Date().toISOString(),
    }
    await persist(job)
    await releaseReservation(job.reservation)
    job.settled = true
    const snapshot = job.state
    for (const waiter of job.waiters.splice(0)) waiter(snapshot)
    settledOrder.push(job.id)
    while (settledOrder.length > MAX_SETTLED) {
      const staleId = settledOrder.shift()
      const stale = jobs.get(staleId)
      if (stale !== undefined && stale.settled) jobs.delete(staleId)
    }
  }

  async function execute(job, request) {
    if (disposed) {
      await finish(job, 'failed', { error: '插件已卸载，转写已中断' })
      return
    }
    const config = job.config
    const maxMinutes = Math.max(1, Number(config.asr.maxJobMinutes) || 30)
    const budgetMs = maxMinutes * 60 * 1000
    const mainBudgetMs = Math.max(1000, Math.floor(budgetMs * MAIN_BUDGET_RATIO))
    const fallbackBudgetMs = Math.max(1000, budgetMs - mainBudgetMs)
    job.state = { ...job.state, state: 'running', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }
    await persist(job)
    job.heartbeat = setInterval(() => {
      if (job.settled) return
      job.state = { ...job.state, heartbeatAt: new Date().toISOString() }
      void persist(job)
    }, HEARTBEAT_MS)
    job.heartbeat.unref?.()
    const warnings = []
    let usedModel = request.model
    try {
      const executable = resolveExecutable('bl', env)
      const run = (model, timeoutMs) => {
        const args = [
          'speech', 'recognize',
          '--url', request.audioPath,
          '--model', model,
          '--language', request.language,
          '--diarization',
          '--out', job.rawPath,
          '--poll-interval', String(Number(config.asr.pollIntervalSeconds) || 2),
        ]
        if (Number.isFinite(Number(request.speakers)) && Number(request.speakers) > 0) {
          args.push('--speaker-count', String(Math.round(Number(request.speakers))))
        }
        return runCommand(executable.command, args, {
          cwd: job.root,
          timeoutMs: Math.max(1000, Math.round(timeoutMs)),
          onChild: (child) => { job.child = child },
        })
      }
      try {
        await run(usedModel, mainBudgetMs)
      } catch (error) {
        if (error?.stderr) console.error('[english-practice] bl stderr：', String(error.stderr).slice(-4000))
        if (config.asr.fallbackModel && usedModel !== config.asr.fallbackModel) {
          warnings.push('模型 ' + usedModel + ' 失败，已回退 ' + config.asr.fallbackModel)
          usedModel = config.asr.fallbackModel
          await run(usedModel, fallbackBudgetMs)
        } else {
          throw error
        }
      }
      const raw = await store.readJsonFile(job.rawPath, undefined)
      if (!isRecord(raw.value)) throw new Error('ASR 输出不是有效 JSON')
      const transcript = normalizeTranscript(raw.value, {
        audio: job.state.audio,
        model: usedModel,
        warnings,
        mergeGapMs: config.asr.mergeGapMs,
      })
      await store.writeJson(job.transcriptPath, transcript)
      await finish(job, 'done', {
        model: usedModel,
        warnings,
        segments: transcript.segments.length,
        speakers: transcript.speakers.length,
        durationMs: transcript.durationMs,
      })
    } catch (error) {
      if (error?.stderr) console.error('[english-practice] bl stderr：', String(error.stderr).slice(-4000))
      await finish(job, 'failed', { model: usedModel, warnings, error: jobFailureMessage(error) })
    }
  }

  /** Start a background transcription; returns { jobId, transcript }. */
  async function start(root, config, input, audioPath) {
    if (disposed) fail('internal', '插件正在卸载，无法开始转写')
    await recover(root, config)
    const transcriptsDir = resolveInWorkspace(root, config.dirs.transcripts)
    const jobsDir = join(transcriptsDir, '.jobs')
    await mkdir(jobsDir, { recursive: true })
    const rawExtension = extname(audioPath)
    const audioBase = basename(audioPath)
    const baseName = sanitizeStem(audioBase.slice(0, audioBase.length - rawExtension.length), 'audio')
    const reservation = await reserveFileName(transcriptsDir, baseName, '.json')
    const jobId = now().toString(36) + '-' + randomUUID().slice(0, 8)
    const relativeAudio = within(root, audioPath) ? normalizedPath(relative(root, audioPath)) : audioPath
    const state = {
      jobId,
      state: 'queued',
      audio: relativeAudio,
      transcript: normalizedPath(relative(resolve(root), reservation.path)),
      model: input?.model || config.asr.model,
      fallbackModel: config.asr.fallbackModel,
      speakers: input?.speakers ?? null,
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      warnings: [],
    }
    const job = {
      id: jobId,
      root: resolve(root),
      config,
      state,
      transcriptPath: reservation.path,
      statePath: jobPath(root, config, jobId),
      rawPath: join(jobsDir, jobId + '.raw.json'),
      reservation,
      child: undefined,
      heartbeat: undefined,
      waiters: [],
      settled: false,
      persistChain: Promise.resolve(),
    }
    jobs.set(jobId, job)
    await persist(job)
    void execute(job, {
      audioPath,
      language: input?.language || config.asr.language,
      speakers: input?.speakers,
      model: input?.model || config.asr.model,
    })
    return { jobId, transcript: state.transcript }
  }

  /** Read the public job value; missing ids are job/not-found. */
  async function status(root, config, input) {
    const jobId = String(input?.id ?? input?.jobId ?? '').trim()
    if (jobId === '') fail('job/not-found', '缺少任务 id')
    const live = jobs.get(jobId)
    if (live !== undefined) return live.state
    await recover(root, config)
    const stored = await store.readJsonFile(jobPath(root, config, jobId), undefined)
    if (!isRecord(stored.value)) fail('job/not-found', '转写任务不存在')
    const value = stored.value
    if (value.state === 'running' || value.state === 'queued') {
      const age = now() - Date.parse(String(value.heartbeatAt ?? value.startedAt ?? ''))
      if (!Number.isFinite(age) || age > STALE_MS) {
        const interrupted = {
          ...value,
          state: 'failed',
          error: '转写进程已中断（DSH 重启或任务超时），请重新转写',
          finishedAt: new Date().toISOString(),
        }
        await store.writeJson(jobPath(root, config, jobId), interrupted)
        return interrupted
      }
    }
    return value
  }

  /** Wait for a live job; resolves with its final state. */
  function wait(jobId, signal) {
    const job = jobs.get(String(jobId))
    if (job === undefined) fail('job/not-found', '转写任务不存在或已结束')
    if (job.settled) return Promise.resolve(job.state)
    return new Promise((resolvePromise, reject) => {
      const waiter = (state) => {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        resolvePromise(state)
      }
      const onAbort = () => {
        const index = job.waiters.indexOf(waiter)
        if (index >= 0) job.waiters.splice(index, 1)
        reject(new Error('已取消等待（转写仍在后台继续）'))
      }
      job.waiters.push(waiter)
      if (signal !== undefined) {
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  /** Startup recovery: mark stale queued/running records as failed (once per root). */
  async function recover(root, config) {
    const key = resolve(String(root))
    if (recoveredRoots.has(key)) return
    recoveredRoots.add(key)
    const dir = join(resolveInWorkspace(key, config.dirs.transcripts), '.jobs')
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.raw.json')) continue
      const file = join(dir, entry.name)
      const detail = await store.readJsonFile(file, undefined)
      if (!isRecord(detail.value)) continue
      const value = detail.value
      if (value.state !== 'running' && value.state !== 'queued') continue
      const jobId = String(value.jobId ?? entry.name.replace(/\.json$/, ''))
      if (jobs.has(jobId)) continue
      const age = now() - Date.parse(String(value.heartbeatAt ?? value.startedAt ?? ''))
      if (Number.isFinite(age) && age <= STALE_MS) continue
      await store.writeJson(file, {
        ...value,
        state: 'failed',
        error: '转写进程已中断（DSH 重启或任务超时），请重新转写',
        finishedAt: new Date().toISOString(),
      })
    }
  }

  /** Plugin unload: fail live jobs, kill trees, release reservations. */
  async function dispose() {
    if (disposed) return
    disposed = true
    const pending = []
    for (const job of jobs.values()) {
      if (job.settled) continue
      if (job.heartbeat !== undefined) clearInterval(job.heartbeat)
      job.heartbeat = undefined
      if (job.child !== undefined) {
        killTree(job.child)
        job.child = undefined
      }
      job.state = { ...job.state, state: 'failed', finishedAt: new Date().toISOString(), error: '插件已卸载，转写已中断' }
      job.settled = true
      const snapshot = job.state
      for (const waiter of job.waiters.splice(0)) waiter(snapshot)
      pending.push(persist(job).then(() => releaseReservation(job.reservation)))
    }
    jobs.clear()
    settledOrder.length = 0
    await Promise.all(pending)
  }

  /** Live job object (used by the agent tool to read intermediate state). */
  function get(jobId) {
    return jobs.get(String(jobId))
  }

  return { start, status, wait, get, recover, dispose }
}
