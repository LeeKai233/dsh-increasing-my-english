/**
 * Plugin configuration: defaults, validation/clamping, legacy-key detection and
 * executable resolution.
 *
 * Executables are NOT configurable through .dsh-english/config.json (that file
 * is workspace-writable). Only the read-only environment variables below may
 * override them, and a value must be an absolute path or a plain command name.
 */
import { isAbsolute, join } from 'node:path'
import { CONFIG_REL, fail, isRecord, isSafeRelativeDir, normalizedPath } from './paths.js'

export const EXECUTABLE_ENV = Object.freeze({
  bl: 'DSH_ENGLISH_BL',
  pdftoppm: 'DSH_ENGLISH_PDFTOPPM',
  pdftotext: 'DSH_ENGLISH_PDFTOTEXT',
})

export const DEFAULT_EXECUTABLES = Object.freeze({
  bl: 'bl',
  pdftoppm: 'pdftoppm',
  pdftotext: 'pdftotext',
})

/** Removed config.json keys -> replacement environment variable. */
export const LEGACY_CONFIG_KEYS = Object.freeze({
  blPath: EXECUTABLE_ENV.bl,
  'import.pdfToPpmPath': EXECUTABLE_ENV.pdftoppm,
  'import.pdfToTextPath': EXECUTABLE_ENV.pdftotext,
})

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

export const DEFAULT_CONFIG = deepFreeze({
  asr: {
    model: 'qwen-audio-3.1-asr-flash-filetrans',
    fallbackModel: 'fun-asr',
    language: 'en',
    maxJobMinutes: 30,
    pollIntervalSeconds: 2,
    mergeGapMs: 4000,
    toolTimeoutMinutes: 32,
  },
  lookup: {
    backend: 'ds',
    provider: null,
    model: null,
    timeoutMs: 20000,
  },
  import: {
    maxPdfPages: 120,
    dpi: 100,
  },
  recall: {
    newPerDay: 10,
    dailyLimit: 30,
    mode: 'mix',
  },
  analysis: {
    enabled: true,
    idleMinutes: 3,
    batchWords: 2,
    maxContexts: 6,
    maxContextChars: 240,
    timeoutMs: 30000,
    retryMinutes: 10,
  },
  dirs: {
    recordings: 'recordings',
    transcripts: 'transcripts',
  },
})

/** Deep merge for plain objects (arrays and scalars replace). */
export function deepMerge(base, extra) {
  if (!isRecord(base) || !isRecord(extra)) return extra === undefined ? base : extra
  const out = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    out[key] = isRecord(value) && isRecord(base[key]) ? deepMerge(base[key], value) : value
  }
  return out
}

function pickString(raw, fallback, label, warnings, options = {}) {
  const max = options.max ?? 200
  const allowEmpty = options.allowEmpty === true
  if (raw === undefined) return fallback
  if (typeof raw !== 'string') {
    warnings.push(label + ' 必须是字符串，已回退默认值')
    return fallback
  }
  const value = raw.trim()
  if ((!allowEmpty && value === '') || value.length > max) {
    warnings.push(label + ' 无效，已回退默认值')
    return fallback
  }
  return value
}

function pickNumber(raw, fallback, label, warnings, options = {}) {
  if (raw === undefined) return fallback
  const value = Number(raw)
  const min = options.min ?? Number.NEGATIVE_INFINITY
  const max = options.max ?? Number.POSITIVE_INFINITY
  if (!Number.isFinite(value)) {
    warnings.push(label + ' 必须是数字，已回退默认值')
    return fallback
  }
  const integer = options.integer === true
  const rounded = integer ? Math.round(value) : value
  if (rounded < min || rounded > max) {
    warnings.push(label + ' 超出允许范围（' + min + ' ~ ' + max + '），已回退默认值')
    return fallback
  }
  return rounded
}

function pickBackend(raw, warnings) {
  if (raw === undefined) return DEFAULT_CONFIG.lookup.backend
  if (raw === 'ds' || raw === 'bl' || raw === 'off') return raw
  warnings.push('lookup.backend 只能是 ds / bl / off，已回退默认值')
  return DEFAULT_CONFIG.lookup.backend
}

function pickRecallMode(raw, warnings) {
  if (raw === undefined) return DEFAULT_CONFIG.recall.mode
  if (raw === 'mix' || raw === 'en-zh' || raw === 'zh-en') return raw
  warnings.push('recall.mode 只能是 mix / en-zh / zh-en，已回退默认值')
  return DEFAULT_CONFIG.recall.mode
}

function pickBoolean(raw, fallback, label, warnings) {
  if (raw === undefined) return fallback
  if (typeof raw === 'boolean') return raw
  warnings.push(label + ' 必须是布尔值，已回退默认值')
  return fallback
}

function pickNullableString(raw, label, warnings) {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    warnings.push(label + ' 必须是字符串或 null，已回退默认值')
    return null
  }
  const value = raw.trim()
  return value === '' ? null : value
}

function collectUnknownKeys(raw, warnings) {
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in DEFAULT_CONFIG)) {
      if (key in LEGACY_CONFIG_KEYS) continue
      warnings.push('配置键 "' + key + '" 未知，已忽略')
      continue
    }
    if (isRecord(value)) {
      const known = DEFAULT_CONFIG[key]
      for (const child of Object.keys(value)) {
        const dotted = key + '.' + child
        if (child in known) continue
        if (dotted in LEGACY_CONFIG_KEYS) continue
        warnings.push('配置键 "' + dotted + '" 未知，已忽略')
      }
    }
  }
}

function collectLegacyKeys(raw, warnings) {
  if (raw.blPath !== undefined) {
    warnings.push('配置键 "blPath" 已不再支持，已忽略；如需自定义请使用环境变量 ' + LEGACY_CONFIG_KEYS.blPath)
  }
  if (isRecord(raw.import)) {
    if (raw.import.pdfToPpmPath !== undefined) {
      warnings.push('配置键 "import.pdfToPpmPath" 已不再支持，已忽略；如需自定义请使用环境变量 ' + LEGACY_CONFIG_KEYS['import.pdfToPpmPath'])
    }
    if (raw.import.pdfToTextPath !== undefined) {
      warnings.push('配置键 "import.pdfToTextPath" 已不再支持，已忽略；如需自定义请使用环境变量 ' + LEGACY_CONFIG_KEYS['import.pdfToTextPath'])
    }
  }
}

/**
 * Validate a raw config.json document and return { config, warnings }.
 * Invalid values fall back to defaults with a human readable warning; unknown
 * and removed keys are ignored (surfaced by env.check).
 */
export function normalizeConfig(raw) {
  const warnings = []
  const document = isRecord(raw) ? raw : {}
  if (!isRecord(raw)) warnings.push('配置文件根必须是对象，已忽略')
  collectUnknownKeys(document, warnings)
  collectLegacyKeys(document, warnings)

  const asrRaw = isRecord(document.asr) ? document.asr : {}
  if (document.asr !== undefined && !isRecord(document.asr)) warnings.push('asr 必须是对象，已回退默认值')
  const maxJobMinutes = pickNumber(asrRaw.maxJobMinutes, DEFAULT_CONFIG.asr.maxJobMinutes, 'asr.maxJobMinutes', warnings, { min: 1, max: 600 })
  const toolTimeout = pickNumber(asrRaw.toolTimeoutMinutes, Math.max(DEFAULT_CONFIG.asr.toolTimeoutMinutes, maxJobMinutes + 1), 'asr.toolTimeoutMinutes', warnings, { min: 1, max: 600 })
  const toolTimeoutMinutes = Math.max(toolTimeout, maxJobMinutes + 1)
  if (toolTimeoutMinutes !== toolTimeout) warnings.push('asr.toolTimeoutMinutes 必须大于 asr.maxJobMinutes，已提高到 ' + toolTimeoutMinutes)

  const lookupRaw = isRecord(document.lookup) ? document.lookup : {}
  if (document.lookup !== undefined && !isRecord(document.lookup)) warnings.push('lookup 必须是对象，已回退默认值')

  const importRaw = isRecord(document.import) ? document.import : {}
  if (document.import !== undefined && !isRecord(document.import)) warnings.push('import 必须是对象，已回退默认值')

  const recallRaw = isRecord(document.recall) ? document.recall : {}
  if (document.recall !== undefined && !isRecord(document.recall)) warnings.push('recall 必须是对象，已回退默认值')

  const analysisRaw = isRecord(document.analysis) ? document.analysis : {}
  if (document.analysis !== undefined && !isRecord(document.analysis)) warnings.push('analysis 必须是对象，已回退默认值')

  const dirsRaw = isRecord(document.dirs) ? document.dirs : {}
  if (document.dirs !== undefined && !isRecord(document.dirs)) warnings.push('dirs 必须是对象，已回退默认值')

  const dir = (key) => {
    const value = dirsRaw[key]
    if (value === undefined) return DEFAULT_CONFIG.dirs[key]
    if (!isSafeRelativeDir(value)) {
      warnings.push('dirs.' + key + ' 必须是工作区内的相对目录，已回退默认值')
      return DEFAULT_CONFIG.dirs[key]
    }
    return normalizedPath(value.trim())
  }

  const config = {
    asr: {
      model: pickString(asrRaw.model, DEFAULT_CONFIG.asr.model, 'asr.model', warnings, { max: 120 }),
      fallbackModel: pickString(asrRaw.fallbackModel, DEFAULT_CONFIG.asr.fallbackModel, 'asr.fallbackModel', warnings, { max: 120, allowEmpty: true }),
      language: pickString(asrRaw.language, DEFAULT_CONFIG.asr.language, 'asr.language', warnings, { max: 16 }),
      maxJobMinutes,
      pollIntervalSeconds: pickNumber(asrRaw.pollIntervalSeconds, DEFAULT_CONFIG.asr.pollIntervalSeconds, 'asr.pollIntervalSeconds', warnings, { min: 1, max: 60 }),
      mergeGapMs: pickNumber(asrRaw.mergeGapMs, DEFAULT_CONFIG.asr.mergeGapMs, 'asr.mergeGapMs', warnings, { min: 0, max: 60000 }),
      toolTimeoutMinutes,
    },
    lookup: {
      backend: pickBackend(lookupRaw.backend, warnings),
      provider: pickNullableString(lookupRaw.provider, 'lookup.provider', warnings),
      model: pickNullableString(lookupRaw.model, 'lookup.model', warnings),
      timeoutMs: pickNumber(lookupRaw.timeoutMs, DEFAULT_CONFIG.lookup.timeoutMs, 'lookup.timeoutMs', warnings, { min: 1000, max: 120000 }),
    },
    import: {
      maxPdfPages: pickNumber(importRaw.maxPdfPages, DEFAULT_CONFIG.import.maxPdfPages, 'import.maxPdfPages', warnings, { min: 1, max: 1000, integer: true }),
      dpi: pickNumber(importRaw.dpi, DEFAULT_CONFIG.import.dpi, 'import.dpi', warnings, { min: 50, max: 300, integer: true }),
    },
    recall: {
      newPerDay: pickNumber(recallRaw.newPerDay, DEFAULT_CONFIG.recall.newPerDay, 'recall.newPerDay', warnings, { min: 0, max: 100, integer: true }),
      dailyLimit: pickNumber(recallRaw.dailyLimit, DEFAULT_CONFIG.recall.dailyLimit, 'recall.dailyLimit', warnings, { min: 1, max: 200, integer: true }),
      mode: pickRecallMode(recallRaw.mode, warnings),
    },
    analysis: {
      enabled: pickBoolean(analysisRaw.enabled, DEFAULT_CONFIG.analysis.enabled, 'analysis.enabled', warnings),
      idleMinutes: pickNumber(analysisRaw.idleMinutes, DEFAULT_CONFIG.analysis.idleMinutes, 'analysis.idleMinutes', warnings, { min: 0.5, max: 120 }),
      batchWords: pickNumber(analysisRaw.batchWords, DEFAULT_CONFIG.analysis.batchWords, 'analysis.batchWords', warnings, { min: 1, max: 20, integer: true }),
      maxContexts: pickNumber(analysisRaw.maxContexts, DEFAULT_CONFIG.analysis.maxContexts, 'analysis.maxContexts', warnings, { min: 1, max: 12, integer: true }),
      maxContextChars: pickNumber(analysisRaw.maxContextChars, DEFAULT_CONFIG.analysis.maxContextChars, 'analysis.maxContextChars', warnings, { min: 60, max: 1000, integer: true }),
      timeoutMs: pickNumber(analysisRaw.timeoutMs, DEFAULT_CONFIG.analysis.timeoutMs, 'analysis.timeoutMs', warnings, { min: 5000, max: 120000, integer: true }),
      retryMinutes: pickNumber(analysisRaw.retryMinutes, DEFAULT_CONFIG.analysis.retryMinutes, 'analysis.retryMinutes', warnings, { min: 1, max: 1440, integer: true }),
    },
    dirs: {
      recordings: dir('recordings'),
      transcripts: dir('transcripts'),
    },
  }
  return { config, warnings }
}

/** Explain why an executable override value is unusable (undefined = valid). */
export function executableProblem(value) {
  const text = String(value ?? '')
  if (text.length === 0) return '值为空'
  if (text.length > 400) return '路径过长'
  if (/[\u0000-\u001f]/.test(text)) return '包含非法控制字符'
  if (/\s/.test(text)) return '不能包含空格（不支持带参数或多段命令）'
  if (/[&|;<>()$`"']/.test(text)) return '包含 Shell 元字符'
  if (/[\\/]/.test(text)) {
    if (!isAbsolute(text)) return '相对路径不受支持，请使用绝对路径或纯命令名'
    return undefined
  }
  if (!/^[A-Za-z0-9._-]+$/.test(text)) return '命令名包含非法字符'
  return undefined
}

/** Resolve one executable: env override (validated) or built-in default. */
export function resolveExecutable(kind, env = process.env) {
  const envName = EXECUTABLE_ENV[kind]
  if (envName === undefined) throw new Error('unknown executable kind: ' + String(kind))
  const fallback = DEFAULT_EXECUTABLES[kind]
  const raw = env?.[envName]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { command: fallback, source: 'default', warning: undefined }
  }
  const value = String(raw).trim()
  const problem = executableProblem(value)
  if (problem !== undefined) {
    return {
      command: fallback,
      source: 'default',
      warning: '环境变量 ' + envName + ' 无效（' + problem + '），已回退 "' + fallback + '"',
    }
  }
  return { command: value, source: 'env', warning: undefined }
}

/** Resolve all three executables plus any env-override warnings. */
export function resolveExecutables(env = process.env) {
  const executables = {}
  const warnings = []
  for (const kind of Object.keys(DEFAULT_EXECUTABLES)) {
    const resolved = resolveExecutable(kind, env)
    executables[kind] = resolved.command
    if (resolved.warning !== undefined) warnings.push(resolved.warning)
  }
  return { executables, warnings }
}

/**
 * Per-workspace config loader with a short TTL (picks up manual edits ~2s).
 * load() always returns { config, warnings }; a corrupt file is backed up by
 * the store and reported as a warning.
 */
export function createConfigLoader(options) {
  const store = options.store
  const ttlMs = options.ttlMs === undefined ? 2000 : Math.max(0, Number(options.ttlMs) || 0)
  const cache = new Map()

  async function load(root) {
    const key = String(root)
    const cached = cache.get(key)
    if (cached !== undefined && Date.now() - cached.at < ttlMs) return cached.value
    const file = join(key, CONFIG_REL)
    let detail
    try {
      detail = await store.readJsonFile(file, undefined)
    } catch (error) {
      console.error('[english-practice] 读取配置失败：', error)
      fail('config/invalid', '无法读取插件配置')
    }
    const warnings = []
    let raw = {}
    if (detail.corrupted) {
      warnings.push('配置文件 JSON 损坏，已备份为 *.corrupt-<时间戳>，本次使用默认配置')
    } else if (!detail.missing) {
      if (isRecord(detail.value)) raw = detail.value
      else warnings.push('配置文件根必须是对象，已忽略')
    }
    const normalized = normalizeConfig(raw)
    warnings.push(...normalized.warnings)
    const value = { config: normalized.config, warnings }
    cache.set(key, { at: Date.now(), value })
    return value
  }

  function invalidate(root) {
    if (root === undefined) cache.clear()
    else cache.delete(String(root))
  }

  return { load, invalidate }
}
