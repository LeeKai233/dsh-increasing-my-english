/**
 * Atomic JSON/text persistence for the workspace.
 *
 * - one serial promise-chain lock per file (read-modify-write safety)
 * - atomic write via sibling temp file + rename
 * - corrupt JSON is renamed to *.corrupt-<ts> and reported, never silently lost
 * - every read strips a UTF-8 BOM
 */
import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

function stripBom(text) {
  const value = String(text ?? '')
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

function corruptStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Create the store used by every host module (one instance per plugin instance). */
export function createWorkspaceStore() {
  const locks = new Map()

  /** Run task exclusively for key, chaining behind the previous holder. */
  function locked(key, task) {
    const previous = locks.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(() => undefined, () => undefined)
    locks.set(key, tail)
    tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key)
    })
    return run
  }

  /** Windows may briefly lock the destination (AV / indexer); retry a few times. */
  async function renameWithRetry(from, to) {
    let lastError
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rename(from, to)
        return
      } catch (error) {
        lastError = error
        if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'EBUSY') throw error
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)))
      }
    }
    throw lastError
  }

  async function atomicWriteText(file, text) {
    const target = String(file)
    await mkdir(dirname(target), { recursive: true })
    const temporary = target + '.' + process.pid + '.' + randomBytes(6).toString('hex') + '.tmp'
    try {
      await writeFile(temporary, String(text), 'utf8')
      await renameWithRetry(temporary, target)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  /** Read raw text (BOM stripped); fallback on ENOENT. */
  async function readTextFile(file, fallback) {
    try {
      return stripBom(await readFile(String(file), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return fallback
      throw error
    }
  }

  /** Rename a corrupt file out of the way so the next write starts clean. */
  async function backupCorrupt(file) {
    const target = String(file)
    const backup = target + '.corrupt-' + corruptStamp()
    try {
      await rename(target, backup)
    } catch (error) {
      console.error('[english-practice] 无法备份损坏的数据文件：', basename(target), error?.code ?? error)
      return undefined
    }
    console.error('[english-practice] 数据文件损坏，已备份：', basename(target), '->', basename(backup))
    return backup
  }

  /** Unlocked JSON read with BOM strip + corrupt backup. Never throws on bad JSON. */
  async function readJsonFile(file, fallback) {
    let text
    try {
      text = stripBom(await readFile(String(file), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return { value: fallback, missing: true, corrupted: false }
      throw error
    }
    try {
      return { value: JSON.parse(text), missing: false, corrupted: false }
    } catch {
      await backupCorrupt(file)
      return { value: fallback, missing: false, corrupted: true }
    }
  }

  /** Locked JSON read; corrupt files are backed up and fallback is returned. */
  async function readJson(file, fallback) {
    return locked(String(file), async () => (await readJsonFile(file, fallback)).value)
  }

  /** Locked JSON write. */
  async function writeJson(file, value) {
    const text = JSON.stringify(value, null, 2) + '\n'
    return locked(String(file), () => atomicWriteText(file, text))
  }

  /** Locked raw text write (used for the markdown wordbook). */
  async function writeText(file, text) {
    return locked(String(file), () => atomicWriteText(file, text))
  }

  /** Locked raw text read. */
  async function readText(file, fallback) {
    return locked(String(file), () => readTextFile(file, fallback))
  }

  return {
    locked,
    atomicWriteText,
    readTextFile,
    readJsonFile,
    readJson,
    writeJson,
    writeText,
    readText,
    backupCorrupt,
    stripBom,
  }
}

/** Exposed for tests / config loader. */
export { stripBom }
