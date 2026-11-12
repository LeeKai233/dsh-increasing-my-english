/**
 * Workspace path safety: normalization + containment checks, Windows-safe file
 * names, atomic filename reservation (no TOCTOU), and safe recursive removal.
 *
 * Also homes the shared domain-error primitives. Keeping them here (instead of
 * a separate errors.js) preserves the frozen file layout in AGENTS.md.
 */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rm, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const DATA_DIR = '.dsh-english'
export const CONFIG_REL = join(DATA_DIR, 'config.json')
export const CACHE_REL = join(DATA_DIR, 'lookup-cache.json')
export const PDFS_REL = join(DATA_DIR, 'pdfs')
export const RECALL_REL = join(DATA_DIR, 'recall.json')
export const VOCAB_REL = join('vocab', 'vocabulary.json')
export const VOCAB_MD_REL = join('vocab', '生词本.md')

/** Matches the ids renderPdfPages() generates; never accept anything else as a directory name. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Windows device names are reserved even when they carry an extension. */
const RESERVED_STEM_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** A domain error carries the frozen wire error code from AGENTS.md. */
export class DomainError extends Error {
  constructor(code, message, params) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    if (params !== undefined) this.params = params
  }
}

/** Throw a coded domain error. */
export function fail(code, message, params) {
  throw new DomainError(code, message, params)
}

/** Message of an unknown thrown value. */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Convert Windows separators for the data files (frozen format uses '/'). */
export function normalizedPath(path) {
  return String(path ?? '').replace(/\\/g, '/')
}

/** True when target is root itself or lives below it. */
export function within(root, target) {
  const base = resolve(String(root))
  const absolute = resolve(String(target))
  const rel = relative(base, absolute)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))
}

/** Resolve a path that must stay inside the workspace; throws coded errors. */
export function resolveInWorkspace(root, value) {
  const text = String(value ?? '').trim()
  if (text === '') fail('path/invalid', '路径为空')
  if (text.includes('\u0000')) fail('path/invalid', '路径包含非法字符')
  const base = resolve(String(root))
  const absolute = isAbsolute(text) ? resolve(text) : resolve(base, text)
  if (!within(base, absolute)) fail('path/outside-workspace', '路径不在当前工作区内')
  return absolute
}

/** Resolve an absolute path freely, or a relative one inside the workspace. */
export function resolveAnyPath(root, value) {
  const text = String(value ?? '').trim()
  if (text === '') fail('path/invalid', '路径为空')
  return isAbsolute(text) ? resolve(text) : resolveInWorkspace(root, text)
}

/** True when a config value is a safe workspace-relative directory. */
export function isSafeRelativeDir(value) {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (text === '' || text.length > 200) return false
  if (/[\u0000-\u001f<>:"|?*]/.test(text)) return false
  if (isAbsolute(text) || /^[A-Za-z]:/.test(text)) return false
  const parts = normalizedPath(text).split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

/**
 * Validate a user supplied file name (transcripts.merge / delete / import).
 * Returns { file, stem, extension } or throws the requested error code.
 */
export function validateBaseFileName(value, options = {}) {
  const code = options.code ?? 'transcript/invalid-name'
  const extensions = options.extensions
  const text = String(value ?? '').trim()
  if (text === '' || text.length > 200) fail(code, '文件名无效')
  if (/[\u0000-\u001f]/.test(text)) fail(code, '文件名包含非法字符')
  if (text.startsWith('.') || text === '.' || text === '..') fail(code, '文件名不能以点开头')
  if (text.includes('..')) fail(code, '文件名不能包含 “..”')
  if (/[\\/]/.test(text)) fail(code, '文件名不能包含路径分隔符')
  if (/[. ]$/.test(text)) fail(code, '文件名不能以点或空格结尾')
  const dot = text.lastIndexOf('.')
  const stem = dot > 0 ? text.slice(0, dot) : text
  const extension = dot > 0 ? text.slice(dot).toLowerCase() : ''
  if (RESERVED_STEM_RE.test(stem)) fail(code, '文件名不能使用 Windows 保留名')
  if (extensions !== undefined && !extensions.includes(extension)) {
    fail(code, '不支持的文件格式：' + (extension || '(无扩展名)'))
  }
  return { file: text, stem, extension }
}

/** Turn an arbitrary label into a safe file stem (never throws). */
export function sanitizeStem(raw, fallback = 'transcript') {
  let stem = String(raw ?? '')
    .replace(/^\.+/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80)
    .replace(/^[-_]+|[-_]+$/g, '')
  if (stem === '') stem = fallback
  if (RESERVED_STEM_RE.test(stem)) stem = 'file-' + stem
  return stem
}

/**
 * Atomically reserve a file name inside dir using open(..., 'wx') on a sibling
 * ".part" file. Two racing callers can never receive the same final name.
 * Returns { file, stem, path, reservationPath }; call releaseReservation().
 */
export async function reserveFileName(dir, baseStem, extension, options = {}) {
  const attempts = Number.isFinite(Number(options.maxAttempts)) ? Math.max(1, Number(options.maxAttempts)) : 1000
  const stemBase = sanitizeStem(baseStem)
  await mkdir(dir, { recursive: true })
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const stem = attempt === 0 ? stemBase : stemBase + '-' + (attempt + 1)
    const file = stem + extension
    const filePath = join(dir, file)
    const reservationPath = filePath + '.part'
    let handle
    try {
      handle = await open(reservationPath, 'wx')
    } catch (error) {
      if (error?.code === 'EEXIST') continue
      throw error
    }
    await handle.close()
    const existing = await lstat(filePath).catch(() => undefined)
    if (existing === undefined) return { file, stem, path: filePath, reservationPath }
    await unlink(reservationPath).catch(() => undefined)
  }
  fail('internal', '无法分配文稿文件名')
}

/** Drop the reservation marker for a name that will not be used. */
export async function releaseReservation(reservation) {
  if (!reservation?.reservationPath) return
  await unlink(reservation.reservationPath).catch(() => undefined)
}

/**
 * Recursively remove target, which must be a real (non symlink) directory that
 * resolves inside container. Missing targets are a no-op. Never follows links.
 */
export async function safeRemoveInside(container, target) {
  const base = resolve(String(container))
  const absolute = resolve(String(target))
  if (absolute === base || !within(base, absolute)) fail('path/outside-workspace', '拒绝删除：目标不在允许的目录内')
  const info = await lstat(absolute).catch(() => undefined)
  if (info === undefined) return false
  if (info.isSymbolicLink() || !info.isDirectory()) fail('path/invalid', '拒绝删除：目标不是真实目录')
  try {
    await rm(absolute, { recursive: true, force: true, maxRetries: 3 })
  } catch (error) {
    console.error('[english-practice] 删除目录失败：', messageOf(error))
    fail('path/invalid', '删除目录失败')
  }
  return true
}

/** Create the standard workspace data directories and return their absolute paths. */
export async function ensureWorkspaceDirs(root, config) {
  const workspace = resolve(String(root))
  const recordings = resolveInWorkspace(workspace, config?.dirs?.recordings ?? 'recordings')
  const transcripts = resolveInWorkspace(workspace, config?.dirs?.transcripts ?? 'transcripts')
  const jobs = join(transcripts, '.jobs')
  const data = join(workspace, DATA_DIR)
  const vocabDir = dirname(join(workspace, VOCAB_REL))
  await mkdir(recordings, { recursive: true })
  await mkdir(transcripts, { recursive: true })
  await mkdir(jobs, { recursive: true })
  await mkdir(data, { recursive: true })
  await mkdir(vocabDir, { recursive: true })
  return { root: workspace, recordings, transcripts, jobs, data, vocabDir }
}

/** Fresh id for PDF page directories / job records. */
export function newId() {
  return randomUUID()
}
