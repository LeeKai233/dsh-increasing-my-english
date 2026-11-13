/**
 * Cross-project shared library.
 *
 * A single global setting points every project at one DSH workspace that stores
 * the English-practice data (transcripts, vocab, recall, lookup cache, PDFs and
 * recordings). The setting lives outside every workspace, so a project file can
 * never redirect the plugin; only the host writes it from the `library.set`
 * action, which always uses the current session workspace.
 *
 * Settings file (version 1):
 *   { "version": 1, "sharedRoot": "G:/Increasing My English" | null }
 */
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { probeWritable } from './env.js'
import {
  DATA_DIR,
  fail,
  isRecord,
  messageOf,
  resolveInWorkspace,
  VOCAB_REL,
} from './paths.js'

export const SETTINGS_VERSION = 1
export const SETTINGS_FILE_NAME = 'english-practice.json'

/** DSH home: DSH_HOME when the launcher sets it, otherwise ~/.dsh. */
export function resolveDshHome(env = process.env) {
  const raw = typeof env?.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  if (raw !== '') return resolve(raw)
  return join(homedir(), '.dsh')
}

function samePath(left, right) {
  const a = resolve(String(left))
  const b = resolve(String(right))
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase()
  return a === b
}

/** Only an absolute, non-empty string may become a shared root. */
function usableRoot(value) {
  return typeof value === 'string' && value.trim() !== '' && isAbsolute(value.trim())
}

/**
 * Create the shared-library service (one per plugin instance).
 *
 * `loadConfig` is injected so status() can report the library directory layout
 * without importing the config loader (and without creating a cycle).
 */
export function createLibraryService(options = {}) {
  const store = options.store
  const env = options.env ?? process.env
  const loadConfig = typeof options.loadConfig === 'function'
    ? options.loadConfig
    : async () => ({ config: {}, warnings: [] })
  const settingsPath = options.settingsPath !== undefined
    ? resolve(String(options.settingsPath))
    : join(resolveDshHome(env), SETTINGS_FILE_NAME)
  const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Math.max(0, Number(options.ttlMs)) : 1000
  let cache

  /** Read + validate the settings document (cached briefly; set() invalidates). */
  async function readSettings() {
    if (cache !== undefined && Date.now() - cache.at < ttlMs) return cache.value
    let detail
    try {
      detail = await store.readJsonFile(settingsPath, undefined)
    } catch (error) {
      const value = {
        enabled: false,
        root: null,
        warnings: ['无法读取共享库设置：' + messageOf(error)],
        settingsPath,
      }
      cache = { at: Date.now(), value }
      return value
    }
    const warnings = []
    let raw = {}
    if (detail.corrupted) {
      warnings.push('共享库设置文件损坏，已备份为 *.corrupt-<时间戳>，本次按关闭处理')
    } else if (!detail.missing) {
      if (isRecord(detail.value)) raw = detail.value
      else warnings.push('共享库设置文件根必须是对象，已按关闭处理')
    }
    let root = null
    if (raw.sharedRoot !== undefined && raw.sharedRoot !== null) {
      if (usableRoot(raw.sharedRoot)) root = resolve(raw.sharedRoot.trim())
      else warnings.push('sharedRoot 必须是绝对路径，已按关闭处理')
    }
    const value = { enabled: root !== null, root, warnings, settingsPath }
    cache = { at: Date.now(), value }
    return value
  }

  /**
   * Resolve the effective data root for a workspace.
   * Missing shared roots are reported as problem: 'missing' (never silently
   * falls back to the project, otherwise data would appear to vanish).
   */
  async function resolveRoot(workspaceRoot) {
    const workspace = resolve(String(workspaceRoot))
    const settings = await readSettings()
    if (!settings.enabled) {
      return {
        root: workspace,
        enabled: false,
        usingShared: false,
        warnings: settings.warnings,
        settingsPath,
      }
    }
    const root = resolve(settings.root)
    let info
    try {
      info = await stat(root)
    } catch {
      info = undefined
    }
    const problem = info !== undefined && info.isDirectory() ? undefined : 'missing'
    return {
      root,
      enabled: true,
      usingShared: samePath(root, workspace),
      problem,
      warnings: settings.warnings,
      settingsPath,
    }
  }

  /** Public status for the top-bar switch and env.check. Never throws for a missing root. */
  async function status(workspaceRoot, statusOptions = {}) {
    const workspace = resolve(String(workspaceRoot))
    const settings = await readSettings()
    const base = {
      enabled: settings.enabled,
      root: settings.enabled ? resolve(settings.root) : null,
      workspaceRoot: workspace,
      usingShared: false,
      settingsPath,
      exists: false,
      warnings: [...settings.warnings],
    }
    if (!settings.enabled) return base
    base.usingShared = samePath(base.root, workspace)
    let info
    try {
      info = await stat(base.root)
    } catch {
      info = undefined
    }
    base.exists = info !== undefined && info.isDirectory()
    if (!base.exists) {
      base.warnings.push(info === undefined ? '共享库路径不存在' : '共享库路径不是目录')
      return base
    }
    if (statusOptions.probe === true) {
      let loaded = { config: {}, warnings: [] }
      try {
        loaded = await loadConfig(base.root)
      } catch (error) {
        base.warnings.push('无法读取共享库配置：' + messageOf(error))
      }
      const config = loaded?.config ?? {}
      if (Array.isArray(loaded?.warnings)) base.warnings.push(...loaded.warnings)
      const probe = async (task) => {
        try {
          return await task()
        } catch {
          return false
        }
      }
      base.writable = await probe(() => probeWritable(join(base.root, DATA_DIR)))
      base.directories = {
        transcripts: await probe(() => probeWritable(resolveInWorkspace(base.root, config?.dirs?.transcripts ?? 'transcripts'))),
        vocab: await probe(() => probeWritable(dirname(join(base.root, VOCAB_REL)))),
        recordings: await probe(() => probeWritable(resolveInWorkspace(base.root, config?.dirs?.recordings ?? 'recordings'))),
      }
    }
    return base
  }

  /**
   * Enable (current workspace becomes the library) or disable (sharedRoot =
   * null). The workspace is validated here; callers cannot pass an arbitrary
   * path because the HTTP action derives it from the live session.
   */
  async function set(enabled, workspaceRoot) {
    if (typeof enabled !== 'boolean') fail('library/invalid', 'enabled 必须是布尔值')
    const workspace = resolve(String(workspaceRoot ?? ''))
    if (!isAbsolute(String(workspaceRoot ?? ''))) fail('library/invalid', '当前工作区路径无效')
    let sharedRoot = null
    if (enabled) {
      const info = await stat(workspace).catch(() => undefined)
      if (info === undefined || !info.isDirectory()) {
        fail('library/unavailable', '当前工作区不是一个可用目录', { path: workspace })
      }
      sharedRoot = workspace
    }
    try {
      await store.locked(settingsPath, async () => {
        const detail = await store.readJsonFile(settingsPath, undefined)
        const current = isRecord(detail.value) ? detail.value : {}
        const document = { ...current, version: SETTINGS_VERSION, sharedRoot }
        await store.atomicWriteText(settingsPath, JSON.stringify(document, null, 2) + '\n')
      })
    } catch (error) {
      console.error('[english-practice] 写入共享库设置失败：', error)
      fail('library/settings-failed', '无法保存共享库设置，请检查用户目录是否可写')
    }
    cache = undefined
    return status(workspace)
  }

  return { readSettings, resolveRoot, status, set, settingsPath }
}
