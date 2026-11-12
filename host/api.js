/**
 * Action dispatch table + the same-origin HTTP gateway.
 *
 * Gateway hardening kept from the published contract: loopback only, Origin /
 * Host local, x-english-practice header, live session required, per-action body
 * limits (overall 32MB), per-action request timeout (60s default, 300s for
 * transcripts.import PDF rendering, 180s for vocab.analyze), per-action token bucket (30 req/s, burst
 * 60) and desensitized wire errors { ok:false, code, message }.
 */
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { createAnalysisService } from './analysis.js'
import { createJobManager } from './asr.js'
import { createConfigLoader, DEFAULT_CONFIG, resolveExecutables } from './config.js'
import { createEnvService, runCommand as defaultRunCommand } from './env.js'
import { createGraphService } from './graph.js'
import { createWorkspaceStore } from './json-store.js'
import { createLookupService } from './lookup.js'
import {
  DomainError,
  ensureWorkspaceDirs,
  fail,
  isRecord,
  resolveAnyPath,
  resolveInWorkspace,
} from './paths.js'
import { renderPdfPages } from './pdf.js'
import { createRecallService } from './recall.js'
import { AUDIO_EXTENSIONS, createTranscriptService, MAX_IMPORT_PDF_BASE64_CHARS, MAX_IMPORT_TEXT_CHARS } from './transcript.js'
import { createVocabService } from './vocab.js'

export const API_PATH = '/dsh-english/api'

/** The frozen action set (kept in sync with client.js by tests/contract.test.mjs). */
export const ACTION_NAMES = Object.freeze([
  'transcripts.list',
  'transcripts.merge',
  'transcripts.import',
  'transcripts.delete',
  'recordings.list',
  'browse.list',
  'models.list',
  'lookup',
  'vocab.add',
  'vocab.remove',
  'vocab.enrich',
  'vocab.analyze',
  'recall.overview',
  'recall.grade',
  'recall.reset',
  'graph.overview',
  'transcribe',
  'job',
  'env.check',
])

const ASR_MODELS = [
  'qwen-audio-3.1-asr-flash-filetrans',
  'qwen-audio-3.0-asr-flash-filetrans',
  'fun-asr',
  'paraformer-v2',
]

/** Transport limits. */
export const BODY_LIMIT_BYTES = 32 * 1024 * 1024
export const ACTION_LIMIT_BYTES = 1 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 60000
/** transcripts.import renders PDF pages (pdftoppm 180s + pdftotext 120s = 300s worst case), so the gateway must not cut it at 60s. */
export const ACTION_TIMEOUT_MS = Object.freeze({
  'transcripts.import': 300000,
  'vocab.analyze': 180000,
  // Graph builds are pure and capped (~1s worst case); 30s leaves room for a
  // slow disk without letting a stuck request hang the panel for a minute.
  'graph.overview': 30000,
})
export const RATE_PER_SECOND = 30
export const RATE_BURST = 60

/** Per-action gateway timeout: default 60s, see ACTION_TIMEOUT_MS. */
export function getRequestTimeoutMs(action) {
  const override = ACTION_TIMEOUT_MS[String(action)]
  return override === undefined ? REQUEST_TIMEOUT_MS : override
}

function statusForCode(code) {
  const exact = {
    'http/forbidden': 403,
    'http/origin': 403,
    'session/unavailable': 409,
    'http/rate-limited': 429,
    'internal': 500,
  }
  if (exact[code] !== undefined) return exact[code]
  if (code.endsWith('/not-found')) return 404
  if (code.endsWith('/too-large')) return 413
  return 400
}

/** Never leak stderr text or absolute host paths to the browser. */
export function sanitizeClientMessage(message, code) {
  if (code === 'internal') return '内部错误，请查看宿主日志后重试'
  let text = String(message ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim()
  text = text.replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>')
  text = text.replace(/\/(?:[^\s/]+\/)+[^\s/]*/g, '<path>')
  if (text === '') return '请求失败'
  return text.length > 300 ? text.slice(0, 300) + '…' : text
}

/** Create the host assembly (one per plugin instance; apply() is a thin adapter). */
export function createHost(ctx, overrides = {}) {
  const store = createWorkspaceStore()
  const runCommand = overrides.runCommand ?? defaultRunCommand
  const env = overrides.env ?? process.env
  const configLoader = createConfigLoader({ store })
  const envService = createEnvService({ runCommand, env })
  const lookup = createLookupService({ ctx, store, runCommand, env })
  const vocab = createVocabService({ store, lookup })
  const recall = createRecallService({ store, vocab })
  const graph = createGraphService({ store, vocab, recall })
  const analysis = createAnalysisService({ ctx, store, vocab, lookup, configLoader })
  const transcripts = createTranscriptService({
    store,
    renderPdf: (args) => renderPdfPages({ ...args, executables: resolveExecutables(env).executables, runCommand }),
  })
  const jobs = createJobManager({ store, runCommand, env })
  const toolTimeoutListeners = new Set()
  let toolTimeoutMs = DEFAULT_CONFIG.asr.toolTimeoutMinutes * 60000
  const buckets = new Map()
  let disposed = false

  async function workspaceOf(agent, signal) {
    if (!agent) fail('internal', '此操作需要一个会话（agent）上下文')
    const directory = await ctx.workingDirectory.ensure(agent, signal)
    if (typeof directory !== 'string' || directory === '') fail('internal', '无法解析会话工作区')
    return directory
  }

  function notifyToolTimeout(minutes) {
    const ms = Math.max(1000, Math.round((Number(minutes) || DEFAULT_CONFIG.asr.toolTimeoutMinutes) * 60000))
    if (ms === toolTimeoutMs) return
    toolTimeoutMs = ms
    for (const listener of toolTimeoutListeners) {
      try {
        listener(ms)
      } catch (error) {
        console.error('[english-practice] tool timeout listener failed:', error)
      }
    }
  }

  /** The tools module uses this to keep english_transcribe's harness timeout in sync. */
  function setToolTimeoutListener(listener) {
    toolTimeoutListeners.add(listener)
    try {
      listener(toolTimeoutMs)
    } catch (error) {
      console.error('[english-practice] tool timeout listener failed:', error)
    }
    return () => toolTimeoutListeners.delete(listener)
  }

  async function workspaceConfig(agent, signal) {
    const root = await workspaceOf(agent, signal)
    analysis.noteActivity(root)
    const loaded = await configLoader.load(root)
    notifyToolTimeout(loaded.config.asr.toolTimeoutMinutes)
    return { root, config: loaded.config, warnings: loaded.warnings }
  }

  async function startTranscription(agent, input, signal) {
    const { root, config } = await workspaceConfig(agent, signal)
    await ensureWorkspaceDirs(root, config)
    const audioPath = resolveAnyPath(root, input?.audio)
    const extension = extname(audioPath).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension)) {
      fail('path/invalid', '不是支持的音频格式：' + (extension || basename(audioPath)))
    }
    const info = await stat(audioPath).catch(() => undefined)
    if (info === undefined || !info.isFile()) fail('path/invalid', '找不到音频文件：' + basename(audioPath))
    await envService.preflightBl(root)
    return jobs.start(root, config, input, audioPath)
  }

  async function listRecordings(agent, signal) {
    const { root, config } = await workspaceConfig(agent, signal)
    const directory = resolveInWorkspace(root, config.dirs.recordings)
    let entries = []
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
    return entries
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, path: config.dirs.recordings + '/' + entry.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function browseAudio(input) {
    const target = String(input?.path ?? '').trim()
    if (target === '') fail('path/invalid', '请输入文件夹或音频文件路径')
    if (!isAbsolute(target)) fail('path/invalid', '请输入绝对路径，例如 D:\\Podcasts\\ep12.m4a')
    const info = await stat(target).catch(() => undefined)
    if (info === undefined) fail('path/invalid', '路径不存在')
    if (info.isFile()) {
      if (!AUDIO_EXTENSIONS.has(extname(target).toLowerCase())) fail('path/invalid', '这个文件不是支持的音频格式')
      return { kind: 'file', dir: dirname(target), files: [{ name: basename(target), path: target }] }
    }
    if (!info.isDirectory()) fail('path/invalid', '这个路径既不是文件夹也不是音频文件')
    const entries = await readdir(target, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: entry.name, path: join(target, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 500)
    return { kind: 'dir', dir: target, files }
  }

  async function modelsList(agent, signal) {
    const { config } = await workspaceConfig(agent, signal)
    const models = [...new Set([config.asr.model, ...ASR_MODELS])].filter((model) => typeof model === 'string' && model !== '')
    return { defaultModel: config.asr.model, fallbackModel: config.asr.fallbackModel, models }
  }

  async function envCheck(agent, signal) {
    const root = await workspaceOf(agent, signal)
    const loaded = await configLoader.load(root)
    notifyToolTimeout(loaded.config.asr.toolTimeoutMinutes)
    return envService.check({ root, config: loaded.config, warnings: loaded.warnings })
  }

  const handlers = {
    'transcripts.list': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return transcripts.list(root, config)
    },
    'transcripts.merge': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return transcripts.merge(root, config, payload)
    },
    'transcripts.import': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      await ensureWorkspaceDirs(root, config)
      return transcripts.importTranscript(root, config, payload)
    },
    'transcripts.delete': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return transcripts.remove(root, config, payload)
    },
    'recordings.list': (agent, payload, signal) => listRecordings(agent, signal),
    'browse.list': (agent, payload) => browseAudio(payload),
    'models.list': (agent, payload, signal) => modelsList(agent, signal),
    'lookup': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return lookup.view(root, config, payload, signal)
    },
    'vocab.add': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return vocab.add(root, config, payload, signal)
    },
    'vocab.remove': async (agent, payload) => {
      const { root } = await workspaceConfig(agent)
      return vocab.remove(root, { ids: payload?.ids })
    },
    'vocab.enrich': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return vocab.enrich(root, config, payload, signal)
    },
    'recall.overview': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return recall.overview(root, config)
    },
    'recall.grade': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return recall.grade(root, config, payload)
    },
    'recall.reset': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return recall.reset(root, config, payload)
    },
    'graph.overview': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return graph.overview(root, config)
    },
    'vocab.analyze': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return analysis.analyzeStale(root, config, { id: payload?.id, limit: payload?.limit }, signal)
    },
    'transcribe': (agent, payload, signal) => startTranscription(agent, payload, signal),
    'job': async (agent, payload, signal) => {
      const { root, config } = await workspaceConfig(agent, signal)
      return jobs.status(root, config, payload)
    },
    'env.check': (agent, payload, signal) => envCheck(agent, signal),
  }

  function consumeToken(action) {
    const key = String(action)
    const current = Date.now()
    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = { tokens: RATE_BURST, at: current }
      buckets.set(key, bucket)
    }
    const elapsed = Math.max(0, current - bucket.at)
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (elapsed / 1000) * RATE_PER_SECOND)
    bucket.at = current
    if (bucket.tokens < 1) fail('http/rate-limited', '请求过于频繁，请稍后再试')
    bucket.tokens -= 1
  }

  function enforceActionLimit(action, bodyBytes, payload) {
    if (action === 'transcripts.import') {
      const base64 = typeof payload?.contentBase64 === 'string' ? payload.contentBase64 : ''
      if (base64 !== '') {
        if (base64.replace(/\s+/g, '').length > MAX_IMPORT_PDF_BASE64_CHARS) fail('pdf/too-large', 'PDF 太大（超过 20MB）')
        return
      }
      const text = typeof payload?.content === 'string' ? payload.content : ''
      if (text.length > MAX_IMPORT_TEXT_CHARS) fail('import/too-large', '文稿太大（超过 3MB）')
      return
    }
    if (bodyBytes > ACTION_LIMIT_BYTES) fail('http/too-large', '请求体过大')
  }

  function readRequestBody(req) {
    return new Promise((resolvePromise, reject) => {
      let size = 0
      let settled = false
      const chunks = []
      const finish = (error, value) => {
        if (settled) return
        settled = true
        if (error !== undefined) reject(error)
        else resolvePromise(value)
      }
      req.on('data', (chunk) => {
        if (settled) return
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        size += buffer.length
        if (size > BODY_LIMIT_BYTES) {
          finish(new DomainError('http/too-large', '请求体过大'))
          try {
            req.destroy()
          } catch {
            // the socket may already be gone
          }
          return
        }
        chunks.push(buffer)
      })
      req.on('end', () => finish(undefined, Buffer.concat(chunks).toString('utf8')))
      req.on('error', (error) => finish(error))
    })
  }

  function withTimeout(promise, ms) {
    let timer
    const timeout = new Promise((resolvePromise, reject) => {
      timer = setTimeout(() => reject(new DomainError('internal', '请求处理超时')), ms)
      timer.unref?.()
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  function resolveAgent(sessionId) {
    const agents = ctx.get('agents')
    if (!agents || sessionId === '') return undefined
    let agent = agents.get(sessionId)
    if (!agent && !sessionId.startsWith('session-')) agent = agents.get('session-' + sessionId)
    if (!agent && sessionId.startsWith('session-')) agent = agents.get(sessionId.slice('session-'.length))
    return agent
  }

  function isLocalOrigin(origin) {
    let hostname = ''
    try {
      hostname = new URL(origin).hostname
    } catch {
      hostname = ''
    }
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]'
  }

  async function dispatch(agent, action, payload, signal) {
    const handler = handlers[action]
    if (handler === undefined) fail('action/unknown', '未知操作：' + (String(action) === '' ? '(空)' : action))
    return handler(agent, payload, signal)
  }

  async function handleHttp(req, res) {
    const send = (status, body) => {
      try {
        if (res.headersSent) return
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(body))
      } catch (error) {
        console.error('[english-practice] 响应写入失败：', error)
      }
    }
    try {
      if (req.method !== 'POST') fail('http/method', '只支持 POST')
      const remoteAddress = String(req.socket?.remoteAddress ?? '')
      const loopback = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
      if (!loopback) fail('http/forbidden', '只允许本机访问')
      if (req.headers?.['x-english-practice'] !== '1') fail('http/forbidden', '请求被拒绝')
      const origin = req.headers?.origin
      if (typeof origin === 'string' && origin !== '' && !isLocalOrigin(origin)) fail('http/origin', '请求来源被拒绝')
      const text = await readRequestBody(req)
      let body
      try {
        body = JSON.parse(text)
      } catch {
        fail('http/bad-json', '请求体不是有效 JSON')
      }
      if (!isRecord(body)) fail('http/bad-json', '请求体必须是对象')
      const action = String(body.action ?? '')
      const payload = isRecord(body.payload) ? body.payload : {}
      consumeToken(action)
      enforceActionLimit(action, Buffer.byteLength(text), payload)
      const agent = resolveAgent(String(body.sessionId ?? ''))
      if (agent === undefined) fail('session/unavailable', '会话不在运行中，请刷新页面再试')
      const value = await withTimeout(dispatch(agent, action, payload), getRequestTimeoutMs(action))
      send(200, { ok: true, value: value ?? null })
    } catch (error) {
      let domain = error
      if (!(domain instanceof DomainError)) {
        console.error('[english-practice] 未处理错误：', error)
        domain = new DomainError('internal', '内部错误，请查看宿主日志后重试')
      }
      const body = { ok: false, code: domain.code, message: sanitizeClientMessage(domain.message, domain.code) }
      if (domain.params !== undefined) body.params = domain.params
      send(statusForCode(domain.code), body)
    }
  }

  async function dispose() {
    if (disposed) return
    disposed = true
    await analysis.dispose()
    await jobs.dispose()
  }

  const services = {
    ctx,
    store,
    configLoader,
    workspaceOf,
    workspaceConfig,
    lookup,
    vocab,
    recall,
    graph,
    analysis,
    transcripts,
    jobs,
    env: envService,
  }

  return {
    handleHttp,
    dispatch,
    dispose,
    services,
    setToolTimeoutListener,
    startTranscription,
    startBackground: () => analysis.start(),
    getToolTimeoutMs: () => toolTimeoutMs,
  }
}
