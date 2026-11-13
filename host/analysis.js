/**
 * Background idle scheduler + the per-word polysemy analysis pipeline.
 *
 * Two entry points share one pipeline:
 *   - analyzeStale(): manual / batch analysis (the english_vocab "analyze"
 *     action and the panel's "分析多义" button);
 *   - tick(): the background scheduler that only analyses a workspace that has
 *     been idle for config.analysis.idleMinutes and re-scans silently every
 *     ten minutes afterwards.
 *
 * The pipeline itself is a composition of the pure helpers in host/senses.js
 * (corpus building, context collection, prompt, normalization, merge) plus
 * injected services: store (workspace transcripts), vocab.read /
 * vocab.applyAnalysis and lookup.askJson (the shared lookup cache). This
 * module never talks to a model or the file system directly, so it is fully
 * stub-testable.
 *
 * Analysis records persisted on the entry (vocabulary.json, version 1):
 *   { version, at, status: 'done'|'skipped'|'failed', fingerprint, contexts,
 *     transcripts, added, error? }
 */
import { access, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DATA_DIR, fail, isRecord, messageOf, resolveInWorkspace, VOCAB_REL } from './paths.js'
import {
  ANALYSIS_VERSION,
  analysisFingerprint,
  buildCorpus,
  buildSensePrompt,
  collectContexts,
  corpusSignature,
  mergeSenses,
  normalizeSenseResult,
  senseCacheKey,
} from './senses.js'

/** Fallbacks used when config.analysis is missing (config.js owns the real defaults). */
export const ANALYSIS_DEFAULTS = Object.freeze({
  enabled: true,
  idleMinutes: 3,
  batchWords: 2,
  maxContexts: 6,
  maxContextChars: 240,
  timeoutMs: 30000,
  retryMinutes: 10,
})

/** Hard caps that keep a background batch / corpus load bounded. */
export const MAX_CORPUS_DOCUMENTS = 200
export const MAX_BATCH_WORDS = 20
export const DEFAULT_TICK_INTERVAL_MS = 15000
/** Re-check sooner while stale words remain after a batch. */
export const BACKGROUND_RETRY_MS = 20000
/** Quiet re-scan interval once a workspace has no stale words left. */
export const BACKGROUND_RESCAN_MS = 600000
const MAX_ERROR_CHARS = 300

function clampNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Resolve config.analysis to concrete numbers, applying defaults and caps. */
export function resolveAnalysisOptions(config) {
  const raw = isRecord(config?.analysis) ? config.analysis : {}
  return {
    enabled: raw.enabled !== false,
    idleMinutes: clampNumber(raw.idleMinutes, ANALYSIS_DEFAULTS.idleMinutes, 0, 24 * 60),
    batchWords: Math.round(clampNumber(raw.batchWords, ANALYSIS_DEFAULTS.batchWords, 1, MAX_BATCH_WORDS)),
    maxContexts: Math.round(clampNumber(raw.maxContexts, ANALYSIS_DEFAULTS.maxContexts, 1, 12)),
    maxContextChars: Math.round(clampNumber(raw.maxContextChars, ANALYSIS_DEFAULTS.maxContextChars, 40, 2000)),
    timeoutMs: Math.round(clampNumber(raw.timeoutMs, ANALYSIS_DEFAULTS.timeoutMs, 10, 600000)),
    retryMinutes: clampNumber(raw.retryMinutes, ANALYSIS_DEFAULTS.retryMinutes, 0, 10080),
  }
}

/** Persistable error text: no control characters, at most 300 characters. */
function truncatedError(error) {
  const text = messageOf(error).replace(/[\u0000-\u001f]+/g, ' ').trim()
  return text.length > MAX_ERROR_CHARS ? text.slice(0, MAX_ERROR_CHARS) + '…' : text
}

/** Combine abort signals, preferring the native implementation when present. */
function combineSignals(signals) {
  const list = signals.filter((signal) => signal !== undefined && signal !== null)
  if (list.length === 0) return undefined
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list)
  const controller = new AbortController()
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

/** Absolute key for the per-root scheduler state. */
function rootKey(root) {
  const text = String(root ?? '').trim()
  if (text === '') return ''
  return resolve(text)
}

/** Default root filter: only touch directories that already look like a plugin workspace. */
async function defaultRootFilter(root) {
  for (const candidate of [join(root, VOCAB_REL), join(root, DATA_DIR)]) {
    try {
      await access(candidate)
      return true
    } catch {
      // try the next marker
    }
  }
  return false
}

/** Default corpus loader: the non-hidden *.json transcripts, at most 200, sorted by name. */
async function loadCorpusFromDisk(store, root, config) {
  const empty = () => ({ documents: [], corpus: buildCorpus([]), signature: corpusSignature([]) })
  if (store === undefined || store === null || typeof store.readJsonFile !== 'function') return empty()
  let directory
  try {
    directory = resolveInWorkspace(root, config?.dirs?.transcripts ?? 'transcripts')
  } catch {
    return empty()
  }
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return empty()
  }
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
  const documents = []
  for (const entry of files) {
    if (documents.length >= MAX_CORPUS_DOCUMENTS) break
    let detail
    try {
      detail = await store.readJsonFile(join(directory, entry.name), undefined)
    } catch {
      continue
    }
    if (!isRecord(detail?.value)) continue
    const title = String(detail.value.title ?? '').trim() || entry.name.replace(/\.json$/i, '')
    documents.push({ file: entry.name, title, document: detail.value })
  }
  return { documents, corpus: buildCorpus(documents), signature: corpusSignature(documents) }
}

function emptyStats() {
  return { analyzed: 0, updated: 0, added: 0, skipped: 0, failed: 0, remaining: 0, entries: [] }
}

/** Fold one analyzeOne() result into the batch counters. */
function tally(stats, result) {
  stats.analyzed += 1
  if (result.status === 'skipped') {
    stats.skipped += 1
    return
  }
  if (result.status === 'failed') {
    stats.failed += 1
    return
  }
  stats.added += result.added
  if (result.added > 0) {
    stats.updated += 1
    if (result.entry !== undefined) stats.entries.push(result.entry)
  }
}

/** Create the analysis service (one per plugin instance; dispose() on unload). */
export function createAnalysisService(options = {}) {
  const ctx = options.ctx
  const store = options.store
  const vocab = options.vocab
  const lookup = options.lookup
  const configLoader = options.configLoader
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const logger = options.logger ?? console
  const intervalMs = Number.isFinite(Number(options.intervalMs)) && Number(options.intervalMs) > 0
    ? Number(options.intervalMs)
    : DEFAULT_TICK_INTERVAL_MS
  const loadCorpus = typeof options.loadCorpus === 'function'
    ? options.loadCorpus
    : (root, config) => loadCorpusFromDisk(store, root, config)
  const rootFilter = typeof options.rootFilter === 'function' ? options.rootFilter : defaultRootFilter
  const resolveRoot = typeof options.resolveRoot === 'function' ? options.resolveRoot : async (root) => root

  /** effective root -> { root, lastActivityAt?, lastRunAt?, nextRunAt? } */
  const tracked = new Map()
  /** workspace roots that have seen activity (resolved to an effective root each tick). */
  const trackedWorkspaces = new Set()
  const lifecycle = new AbortController()
  let timer
  let running = false
  let disposed = false

  function stateOf(root) {
    const key = rootKey(root)
    if (key === '') return undefined
    let state = tracked.get(key)
    if (state === undefined) {
      state = { root: key }
      tracked.set(key, state)
    }
    return state
  }

  function isIdle(root, analysisCfg) {
    const key = rootKey(root)
    const state = key === '' ? undefined : tracked.get(key)
    if (state === undefined || state.lastActivityAt === undefined) return true
    return now() - state.lastActivityAt >= analysisCfg.idleMinutes * 60000
  }

  /** A cancellation from outside the pipeline is re-thrown, not persisted as failed. */
  function isExternalCancellation(signal) {
    if (disposed || lifecycle.signal.aborted) return true
    return signal !== undefined && signal !== null && signal.aborted === true
  }

  /** True when the persisted analysis record is missing / outdated / due for a retry. */
  function shouldAnalyze(entry, signature, analysisCfg) {
    if (!isRecord(entry) || entry.kind !== 'word') return false
    const analysis = isRecord(entry.analysis) ? entry.analysis : undefined
    if (analysis === undefined) return true
    if (analysis.version !== ANALYSIS_VERSION) return true
    const fingerprint = typeof analysis.fingerprint === 'string' ? analysis.fingerprint : ''
    if (fingerprint === '' || fingerprint !== analysisFingerprint(entry, signature)) return true
    if (analysis.status === 'failed') {
      const at = typeof analysis.at === 'string' ? Date.parse(analysis.at) : Number.NaN
      if (!Number.isFinite(at)) return true
      return now() - at >= analysisCfg.retryMinutes * 60000
    }
    return false
  }

  /** Ask the model once, racing the injected signal, the plugin lifecycle signal and the timeout. */
  async function callModel(root, config, entry, contexts, prompt, key, analysisCfg, signal) {
    const controller = new AbortController()
    const combined = combineSignals([controller.signal, signal, lifecycle.signal])
    if (combined.aborted) throw combined.reason instanceof Error ? combined.reason : new Error('多义分析已取消')
    const timeoutError = new Error('多义分析超时（' + Math.max(1, Math.round(analysisCfg.timeoutMs / 1000)) + ' 秒）')
    let timer
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(timeoutError)
        reject(timeoutError)
      }, analysisCfg.timeoutMs)
      // Deliberately NOT unref()'d: this timeout is the only thing that settles
      // the model call when the backend hangs, and an unref'd timer lets the
      // event loop exit (or a one-shot runner cancel the test) before it fires.
    })
    let onAbort
    const cancelled = new Promise((_resolve, reject) => {
      if (combined.aborted) {
        reject(combined.reason ?? new Error('多义分析已取消'))
        return
      }
      onAbort = () => reject(combined.reason ?? new Error('多义分析已取消'))
      combined.addEventListener('abort', onAbort, { once: true })
    })
    // The losing branch of the race may reject later (e.g. a timeout after a
    // normal completion); swallow that so it never becomes unhandled.
    cancelled.catch(() => {})
    try {
      return await Promise.race([
        Promise.resolve(lookup.askJson(root, config, { key, prompt, timeoutMs: analysisCfg.timeoutMs }, combined)),
        timeout,
        cancelled,
      ])
    } finally {
      clearTimeout(timer)
      if (onAbort !== undefined) combined.removeEventListener('abort', onAbort)
    }
  }

  /** Persist a failed analysis record and report the failure without throwing. */
  async function recordFailure(root, entry, base, error) {
    const message = truncatedError(error)
    try {
      await vocab.applyAnalysis(root, entry.id, { analysis: { ...base, status: 'failed', error: message } })
    } catch (persistError) {
      logger.warn?.('[english-practice] 多义分析失败状态写入失败：', messageOf(persistError))
    }
    return { status: 'failed', added: 0, updated: false, error: message }
  }

  /** The one-word pipeline: contexts -> prompt -> model -> merge -> persist. */
  async function analyzeOne(root, config, entry, analysisCfg, loaded, signal) {
    const corpus = Array.isArray(loaded?.corpus) ? loaded.corpus : []
    const signature = typeof loaded?.signature === 'string' ? loaded.signature : ''
    const fingerprint = analysisFingerprint(entry, signature)
    const collected = collectContexts(entry, corpus, {
      maxContexts: analysisCfg.maxContexts,
      maxContextChars: analysisCfg.maxContextChars,
    })
    const contexts = Array.isArray(collected?.contexts) ? collected.contexts : []
    const transcripts = Number.isFinite(Number(collected?.transcripts))
      ? Math.max(0, Math.round(Number(collected.transcripts)))
      : 0
    const base = {
      version: ANALYSIS_VERSION,
      at: new Date(now()).toISOString(),
      fingerprint,
      contexts: contexts.length,
      transcripts,
      added: 0,
    }
    if (contexts.length < 2) {
      try {
        await vocab.applyAnalysis(root, entry.id, { analysis: { ...base, status: 'skipped' } })
      } catch (error) {
        if (isExternalCancellation(signal)) throw error
        return recordFailure(root, entry, base, error)
      }
      return { status: 'skipped', added: 0, updated: false }
    }
    try {
      const prompt = buildSensePrompt(entry, contexts)
      const key = senseCacheKey(entry, contexts)
      const answer = await callModel(root, config, entry, contexts, prompt, key, analysisCfg, signal)
      const senses = normalizeSenseResult(answer?.value, contexts.length)
      const merged = mergeSenses(entry, senses, contexts)
      const meanings = Array.isArray(merged?.meanings) ? merged.meanings : entry.meanings
      const added = Number.isFinite(Number(merged?.added)) ? Math.max(0, Math.round(Number(merged.added))) : 0
      const applied = await vocab.applyAnalysis(root, entry.id, {
        meanings,
        analysis: { ...base, status: 'done', added },
      })
      const updatedEntry = isRecord(applied?.entry) ? applied.entry : { ...entry, meanings, analysis: { ...base, status: 'done', added } }
      return { status: 'done', added, updated: added > 0, entry: updatedEntry }
    } catch (error) {
      if (isExternalCancellation(signal)) throw error
      return recordFailure(root, entry, base, error)
    }
  }

  /** Analyse one explicit word by id (used by the panel button / english_vocab analyze id). */
  async function analyzeEntry(root, config, id, signal) {
    if (config?.lookup?.backend === 'off') fail('analysis/disabled', '查词后端已关闭（lookup.backend = off），无法分析多义')
    const entryId = String(id ?? '').trim()
    if (entryId === '') fail('vocab/invalid-entry', '缺少词条 id')
    const data = await vocab.read(root)
    const words = Array.isArray(data?.words) ? data.words.filter(isRecord) : []
    const entry = words.find((item) => item.id === entryId)
    if (entry === undefined) fail('vocab/not-found', '词条不存在')
    if (entry.kind === 'sentence') fail('vocab/invalid-entry', '句子条目没有多义分析')
    const analysisCfg = resolveAnalysisOptions(config)
    const loaded = await loadCorpus(root, config)
    return analyzeOne(root, config, entry, analysisCfg, loaded, signal)
  }

  /**
   * Analyse stale words (or one forced id). Never throws on a single-word model
   * failure; only disabled backend / missing entry / sentence entry throw.
   * Returns { analyzed, updated, added, skipped, failed, remaining, entries }.
   */
  async function analyzeStale(root, config, input, signal) {
    if (config?.lookup?.backend === 'off') {
      fail('analysis/disabled', '查词后端已关闭（lookup.backend = off），无法分析多义')
    }
    const analysisCfg = resolveAnalysisOptions(config)
    const data = await vocab.read(root)
    const words = Array.isArray(data?.words) ? data.words.filter(isRecord) : []
    const stats = emptyStats()
    const id = typeof input?.id === 'string' ? input.id.trim() : ''
    if (id !== '') {
      tally(stats, await analyzeEntry(root, config, id, signal))
      return stats
    }
    const loaded = await loadCorpus(root, config)
    const signature = typeof loaded?.signature === 'string' ? loaded.signature : ''
    const stale = words.filter((entry) => shouldAnalyze(entry, signature, analysisCfg))
    const limit = Math.round(clampNumber(input?.limit, analysisCfg.batchWords, 1, MAX_BATCH_WORDS))
    const batch = stale.slice(0, limit)
    const background = input?.background === true
    for (const entry of batch) {
      if (background && (disposed || !isIdle(root, analysisCfg))) break
      tally(stats, await analyzeOne(root, config, entry, analysisCfg, loaded, signal))
      if (disposed) break
    }
    stats.remaining = Math.max(0, stale.length - stats.analyzed)
    return stats
  }

  /** Tracked roots plus every session workspace the host can currently resolve. */
  async function knownRoots() {
    const roots = new Set(trackedWorkspaces)
    try {
      const agents = typeof ctx?.get === 'function' ? ctx.get('agents') : undefined
      let list = agents?.list?.()
      if (list !== undefined && list !== null && typeof list.then === 'function') list = await list
      const workingDirectory = typeof ctx?.get === 'function' ? ctx.get('workingDirectory') : undefined
      if (Array.isArray(list) && workingDirectory !== undefined && workingDirectory !== null && typeof workingDirectory.get === 'function') {
        for (const agent of list) {
          try {
            let root = workingDirectory.get(agent?.session)
            if (root !== undefined && root !== null && typeof root.then === 'function') root = await root
            const key = rootKey(root)
            if (key !== '') roots.add(key)
          } catch {
            // a session without a workspace is normal; skip it
          }
        }
      }
    } catch {
      // stub / partial contexts do not implement get() or list(); treat as no sessions
    }
    return [...roots]
  }

  /** One scheduler pass: the first idle, allowed workspace gets a background batch. */
  async function tick() {
    if (disposed || running) return { ran: false }
    running = true
    try {
      let workspaceRoots
      try {
        workspaceRoots = await knownRoots()
      } catch (error) {
        logger.warn?.('[english-practice] 多义分析调度失败：', messageOf(error))
        return { ran: false }
      }
      const seen = new Set()
      for (const workspaceRoot of workspaceRoots) {
        if (disposed) return { ran: false }
        let root
        try {
          root = await resolveRoot(workspaceRoot)
        } catch {
          root = undefined
        }
        const key = rootKey(root)
        if (key === '' || seen.has(key)) continue
        seen.add(key)
        try {
          const loaded = await configLoader.load(key)
          const config = loaded?.config
          if (!isRecord(config)) continue
          const analysisCfg = resolveAnalysisOptions(config)
          if (analysisCfg.enabled === false) continue
          if (config.lookup?.backend === 'off') continue
          const state = stateOf(key)
          if (state === undefined) continue
          if (!isIdle(key, analysisCfg)) continue
          const current = now()
          if (state.nextRunAt !== undefined && current < state.nextRunAt) continue
          let usable = false
          try {
            usable = await rootFilter(key)
          } catch {
            usable = false
          }
          if (usable !== true) continue
          const result = await analyzeStale(key, config, { limit: analysisCfg.batchWords, background: true })
          if (disposed) return { ran: false }
          state.lastRunAt = now()
          state.nextRunAt = result.remaining > 0 ? now() + BACKGROUND_RETRY_MS : now() + BACKGROUND_RESCAN_MS
          return { ran: true, root: key, result }
        } catch (error) {
          logger.warn?.('[english-practice] 多义分析调度失败：', messageOf(error))
        }
      }
      return { ran: false }
    } finally {
      running = false
    }
  }

  /**
   * Record user activity for a workspace: track the workspace, clear the
   * pending background slot on its effective (possibly shared) root.
   * The second argument keeps single-argument callers working.
   */
  function noteActivity(workspaceRoot, effectiveRoot) {
    const workspace = rootKey(workspaceRoot)
    if (workspace !== '') trackedWorkspaces.add(workspace)
    const state = stateOf(effectiveRoot ?? workspaceRoot)
    if (state === undefined) return
    state.lastActivityAt = now()
    state.nextRunAt = undefined
  }

  /** Clear scheduler state when the shared library changes. */
  function reset() {
    tracked.clear()
    trackedWorkspaces.clear()
  }

  /** Start the background interval (idempotent; the timer is unref'ed). */
  function start() {
    if (disposed || timer !== undefined) return timer
    timer = setInterval(() => {
      void tick().catch((error) => logger.warn?.('[english-practice] 多义分析调度失败：', messageOf(error)))
    }, intervalMs)
    timer.unref?.()
    return timer
  }

  /** Plugin unload: stop the timer, abort in-flight analysis. Idempotent. */
  function dispose() {
    if (disposed) return
    disposed = true
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    lifecycle.abort(new Error('插件已卸载，多义分析已停止'))
  }

  /** Scheduler snapshot for env.check / diagnostics. */
  function status(root) {
    const key = rootKey(root)
    const state = key === '' ? undefined : tracked.get(key)
    return {
      root: key,
      tracked: state !== undefined,
      lastActivityAt: state?.lastActivityAt ?? null,
      lastRunAt: state?.lastRunAt ?? null,
      nextRunAt: state?.nextRunAt ?? null,
      running,
      started: timer !== undefined,
      disposed,
    }
  }

  return { noteActivity, analyzeStale, analyzeEntry, tick, start, reset, dispose, status }
}
