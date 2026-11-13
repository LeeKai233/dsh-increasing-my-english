/**
 * Environment layer: the single subprocess runner used by pdf/asr/lookup, the
 * process-tree killer, external tool detection (Bailian CLI + poppler) and the
 * env.check report.
 *
 * runCommand captures stdout/stderr through StringDecoder so multi-byte UTF-8
 * sequences split across chunks are never replaced with U+FFFD, and keeps the
 * HEAD of stdout (diagnostic, not just the tail).
 */
import { spawn } from 'node:child_process'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { resolveExecutables } from './config.js'
import { stripBom } from './json-store.js'
import { probePoppler } from './pdf.js'
import { DATA_DIR, fail, isRecord, messageOf, resolveInWorkspace, VOCAB_REL } from './paths.js'

/** stdout/stderr head limited; diagnostics only, JSON payloads use files. */
export const MAX_STDOUT_CHARS = 512 * 1024
export const MAX_STDERR_CHARS = 64 * 1024

const BAILIAN_ENV = Object.freeze({
  BAILIAN_CALLER_TYPE: 'script',
  BAILIAN_CALLER_NAME: 'dsh',
})

/** Failure of an external command; message is safe, stderr stays off the wire. */
export class CommandError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'CommandError'
    this.exitCode = details.exitCode
    this.signal = details.signal
    this.stdout = details.stdout ?? ''
    this.stderr = details.stderr ?? ''
    this.timedOut = details.timedOut === true
    this.notFound = details.notFound === true
    this.cancelled = details.cancelled === true
  }
}

/** Kill a process and its children: taskkill on Windows, process group on POSIX. */
export function killTree(target) {
  const pid = typeof target === 'number' ? target : target?.pid
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) return
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => undefined)
    } catch {
      // taskkill missing: nothing else we can do
    }
    return
  }
  try {
    process.kill(-Number(pid), 'SIGKILL')
  } catch {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {
      // already gone
    }
  }
}

function appendHead(current, text, max) {
  if (current.length >= max) return current
  return current + String(text).slice(0, max - current.length)
}

/**
 * Run one executable (never through a shell) and resolve with
 * { stdout, stderr }. Rejects with CommandError; on ENOENT the Windows
 * ".exe" suffix retry is applied once.
 */
export function runCommand(command, args, options = {}) {
  const attempt = (executable) => new Promise((resolvePromise, reject) => {
    const commandText = String(executable ?? '')
    if (commandText.trim() === '' || /[\u0000-\u001f]/.test(commandText) || /\s/.test(commandText) || /[&|;<>()$`"']/.test(commandText)) {
      reject(new CommandError('可执行文件命令无效', { notFound: true }))
      return
    }
    let settled = false
    let timer
    let child
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let stdout = ''
    let stderr = ''
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      if (options.signal !== undefined) options.signal.removeEventListener('abort', onAbort)
    }
    const finish = (error, value) => {
      if (settled) return
      settled = true
      cleanup()
      if (error !== undefined) reject(error)
      else resolvePromise(value)
    }
    const onAbort = () => {
      killTree(child)
      finish(new CommandError('已取消', { cancelled: true }))
    }
    try {
      child = spawn(commandText, Array.isArray(args) ? args : [], {
        cwd: options.cwd,
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: { ...process.env, ...BAILIAN_ENV },
      })
    } catch (error) {
      finish(error)
      return
    }
    options.onChild?.(child)
    const timeoutMs = Number(options.timeoutMs)
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        killTree(child)
        const seconds = Math.max(1, Math.round(timeoutMs / 1000))
        finish(new CommandError('命令超时（' + seconds + 's）', { timedOut: true }))
      }, timeoutMs)
    }
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        onAbort()
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout?.on('data', (chunk) => {
      stdout = appendHead(stdout, stdoutDecoder.write(chunk), MAX_STDOUT_CHARS)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = appendHead(stderr, stderrDecoder.write(chunk), MAX_STDERR_CHARS)
    })
    child.stdout?.on('end', () => {
      stdout = appendHead(stdout, stdoutDecoder.end(), MAX_STDOUT_CHARS)
    })
    child.stderr?.on('end', () => {
      stderr = appendHead(stderr, stderrDecoder.end(), MAX_STDERR_CHARS)
    })
    child.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        finish(new CommandError('找不到可执行文件', { notFound: true, stdout, stderr }))
        return
      }
      finish(error)
    })
    child.on('close', (code, signal) => {
      if (code === 0) {
        finish(undefined, { stdout, stderr })
        return
      }
      finish(new CommandError('命令失败（exit ' + String(code) + '）', { exitCode: code, signal, stdout, stderr }))
    })
  })
  return attempt(command).catch((error) => {
    if (error?.notFound && process.platform === 'win32' && !/\.[A-Za-z0-9]+$/.test(String(command))) return attempt(String(command) + '.exe')
    throw error
  })
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(stripBom(String(text ?? '').trim()))
  } catch {
    return undefined
  }
}

function authFromText(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (/API key \(model\):/i.test(line)) return !/not configured/i.test(line)
    if (/Console gateway:/i.test(line)) return !/not configured/i.test(line)
  }
  return undefined
}

export const BL_INSTALL_HINT = 'npm i -g bailian-cli --registry=https://registry.npmmirror.com'
export const BL_LOGIN_HINT = 'bl auth login --console'

/** Probe the Bailian CLI: presence, version, login state. */
export async function detectBl(runCommandFn, executables, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const command = executables.bl
  let versionResult
  try {
    versionResult = await runCommandFn(command, ['--version'], { cwd, timeoutMs: 10000 })
  } catch (error) {
    if (error?.notFound) {
      return {
        present: false,
        message: '未找到 Bailian CLI（' + command + '）。请先安装：' + BL_INSTALL_HINT + '，然后运行：' + BL_LOGIN_HINT,
      }
    }
    console.error('[english-practice] bl --version 失败：', error)
    return { present: false, message: '无法运行 Bailian CLI（' + command + '），请检查命令与环境后重试' }
  }
  const versionMatch = /(\d+\.\d+(?:\.\d+)?)/.exec(String(versionResult.stdout) + '\n' + String(versionResult.stderr))
  const version = versionMatch === null ? '' : versionMatch[1]
  let authenticated
  let message
  try {
    const statusResult = await runCommandFn(command, ['auth', 'status', '--output', 'json'], { cwd, timeoutMs: 10000 })
    const document = parseJsonSafe(statusResult.stdout)
    if (isRecord(document) && typeof document.authenticated === 'boolean') authenticated = document.authenticated
    else authenticated = authFromText(statusResult.stdout) ?? authFromText(statusResult.stderr)
    if (authenticated === undefined) message = '无法确认 Bailian CLI 登录状态，请运行：' + BL_LOGIN_HINT
  } catch (error) {
    console.error('[english-practice] bl auth status 失败：', error)
    message = '无法确认 Bailian CLI 登录状态，请运行：' + BL_LOGIN_HINT
  }
  if (authenticated === false) message = 'Bailian CLI 未登录，请运行：' + BL_LOGIN_HINT
  const bl = { present: true }
  if (version !== '') bl.version = version
  if (typeof authenticated === 'boolean') bl.authenticated = authenticated
  if (message !== undefined) bl.message = message
  return bl
}

export async function probeWritable(path) {
  try {
    await mkdir(path, { recursive: true })
    const probe = join(path, '.probe-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
    await writeFile(probe, 'ok')
    await unlink(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Environment service (one per plugin instance). Detection results are cached
 * for a minute so english_transcribe / PDF import preflights stay cheap.
 */
export function createEnvService(options) {
  const run = options.runCommand
  const env = options.env ?? process.env
  const ttlMs = Number(options.ttlMs) || 60000
  let blCache
  let pdfCache

  async function bl(cwd) {
    if (blCache !== undefined && Date.now() - blCache.at < ttlMs) return blCache.value
    const { executables } = resolveExecutables(env)
    const value = await detectBl(run, executables, { cwd })
    blCache = { at: Date.now(), value }
    return value
  }

  async function poppler(cwd) {
    if (pdfCache !== undefined && Date.now() - pdfCache.at < ttlMs) return pdfCache.value
    const { executables } = resolveExecutables(env)
    const value = await probePoppler(run, executables, { cwd })
    pdfCache = { at: Date.now(), value }
    return value
  }

  async function preflightBl(cwd) {
    const probe = await bl(cwd)
    if (!probe.present) {
      fail('bl/missing', '未找到 Bailian CLI（bl）。请先安装：' + BL_INSTALL_HINT + '，然后运行：' + BL_LOGIN_HINT)
    }
    if (probe.authenticated !== true) {
      fail('bl/not-authenticated', 'Bailian CLI 未登录或登录状态无法确认。请运行：' + BL_LOGIN_HINT + '；若尚未安装：' + BL_INSTALL_HINT)
    }
    return probe
  }

  async function check(request) {
    const root = String(request.root)
    const config = request.config ?? {}
    const warnings = [...(request.warnings ?? [])]
    const { executables, warnings: executableWarnings } = resolveExecutables(env)
    warnings.push(...executableWarnings)
    const workspace = { root, writable: await probeWritable(join(root, DATA_DIR)), transcripts: false, vocab: false, recordings: false }
    try {
      workspace.transcripts = await probeWritable(resolveInWorkspace(root, config.dirs?.transcripts ?? 'transcripts'))
      workspace.recordings = await probeWritable(resolveInWorkspace(root, config.dirs?.recordings ?? 'recordings'))
      workspace.vocab = await probeWritable(dirname(join(root, VOCAB_REL)))
    } catch (error) {
      console.error('[english-practice] 工作区目录检查失败：', error)
      warnings.push('工作区目录不可写或不可用')
    }
    const [blProbe, pdfProbe] = await Promise.all([
      bl(root).catch((error) => {
        console.error('[english-practice] bl 检测失败：', error)
        return { present: false, message: 'Bailian CLI 检测失败，请重试' }
      }),
      poppler(root).catch((error) => {
        console.error('[english-practice] poppler 检测失败：', error)
        return { present: false, tool: executables.pdftoppm, message: 'poppler 检测失败，请重试' }
      }),
    ])
    const blReport = { present: blProbe.present === true }
    if (typeof blProbe.version === 'string' && blProbe.version !== '') blReport.version = blProbe.version
    if (typeof blProbe.authenticated === 'boolean') blReport.authenticated = blProbe.authenticated
    if (typeof blProbe.message === 'string' && blProbe.message !== '') blReport.message = blProbe.message
    const pdfReport = { present: pdfProbe.present === true, tool: String(pdfProbe.tool ?? executables.pdftoppm) }
    if (typeof pdfProbe.message === 'string' && pdfProbe.message !== '') pdfReport.message = pdfProbe.message
    return { workspace, bl: blReport, pdf: pdfReport, warnings }
  }

  function invalidate() {
    blCache = undefined
    pdfCache = undefined
  }

  return { bl, poppler, preflightBl, check, invalidate }
}
