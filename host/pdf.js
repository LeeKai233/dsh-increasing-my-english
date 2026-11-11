/**
 * Poppler integration: pdftotext -bbox parsing, line grouping, availability
 * probing and page rendering into .dsh-english/pdfs/<uuid>/.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, relative } from 'node:path'
import { DomainError, fail, normalizedPath, PDFS_REL, safeRemoveInside } from './paths.js'
import { stripBom } from './json-store.js'
import { decodeXmlEntities } from './text.js'

/** PDF payload ceiling after base64 decoding (mirrors the 28MB base64 cap). */
export const PDF_MAX_BYTES = 20 * 1024 * 1024

/** Actionable install hint for the current platform. */
export const POPPLER_INSTALL_HINT = process.platform === 'win32'
  ? 'winget install -e --id oschwartz10612.Poppler'
  : process.platform === 'darwin'
    ? 'brew install poppler'
    : 'sudo apt install poppler-utils'

export function parsePdfLayout(xml) {
  const pages = []
  const pageRegex = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
  let pageMatch
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const width = Number(pageMatch[1])
    const height = Number(pageMatch[2])
    const words = []
    const wordRegex = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g
    let wordMatch
    while ((wordMatch = wordRegex.exec(pageMatch[3])) !== null) {
      const text = decodeXmlEntities(wordMatch[5]).trim()
      if (text === '') continue
      const x = Number(wordMatch[1])
      const y = Number(wordMatch[2])
      words.push({ t: text, x, y, w: Number(wordMatch[3]) - x, h: Number(wordMatch[4]) - y })
    }
    pages.push({ width, height, words })
  }
  return pages
}

export function groupPdfLines(words) {
  const lines = []
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const word of sorted) {
    const last = lines[lines.length - 1]
    if (last !== undefined && Math.abs(last.y - word.y) <= 3) {
      last.words.push(word)
      last.text = `${last.text} ${word.t}`.trim()
      last.y = Math.min(last.y, word.y)
    } else {
      lines.push({ y: word.y, text: word.t, words: [word] })
    }
  }
  return lines
}
function firstVersionLine(text) {
  const match = String(text ?? '').match(/(\d+\.\d+(?:\.\d+)?)/)
  return match === null ? '' : match[1]
}

/**
 * Probe pdftoppm/pdftotext. A spawn that produced an exit code means the
 * executable exists even when it exits non-zero for -v/-h.
 */
export async function probePoppler(runCommand, executables, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 10000
  const cwd = options.cwd ?? process.cwd()
  const missing = []
  const versions = {}
  for (const key of ['pdftoppm', 'pdftotext']) {
    const command = executables[key]
    let present = false
    for (const args of [['-v'], ['-h']]) {
      try {
        const result = await runCommand(command, args, { cwd, timeoutMs })
        present = true
        versions[key] = firstVersionLine(result.stdout) || firstVersionLine(result.stderr)
        break
      } catch (error) {
        if (error?.notFound) break
        present = true
        versions[key] = firstVersionLine(error?.stdout) || firstVersionLine(error?.stderr)
        break
      }
    }
    if (!present) missing.push(command)
  }
  if (missing.length > 0) {
    return {
      present: false,
      tool: executables.pdftoppm,
      message: '未找到 poppler 工具（' + missing.join(', ') + '）。请先安装：' + POPPLER_INSTALL_HINT,
    }
  }
  const version = versions.pdftoppm || versions.pdftotext
  return {
    present: true,
    tool: executables.pdftoppm,
    version,
    message: version === undefined || version === '' ? undefined : 'poppler ' + version,
  }
}

/** Throw pdf/poppler-missing when the import pipeline cannot run. */
export async function ensurePoppler(runCommand, executables, options = {}) {
  const probe = await probePoppler(runCommand, executables, options)
  if (!probe.present) fail('pdf/poppler-missing', probe.message)
  return probe
}

function pageImages(entries) {
  return entries
    .filter((entry) => /^page-\d+\.png$/.test(entry))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
}

/**
 * Render a PDF into page PNGs + bbox words and return the frozen transcript
 * "pdf" payload ({ id, pdfPath, pages }).
 */
export async function renderPdfPages(options) {
  const root = options.root
  const config = options.config ?? {}
  const buffer = options.buffer
  const executables = options.executables
  const runCommand = options.runCommand
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('import/empty', 'PDF 内容为空')
  if (buffer.length > PDF_MAX_BYTES) fail('pdf/too-large', 'PDF 太大（超过 20MB）')
  await ensurePoppler(runCommand, executables, { cwd: root })
  const dpi = Math.min(300, Math.max(50, Math.round(Number(config.import?.dpi) || 100)))
  const maxPages = Math.min(1000, Math.max(1, Math.round(Number(config.import?.maxPdfPages) || 120)))
  const id = randomUUID()
  const pdfsRoot = join(root, PDFS_REL)
  const baseDir = join(pdfsRoot, id)
  const pdfPath = join(baseDir, 'source.pdf')
  const wordsXmlPath = join(baseDir, 'words.xml')
  try {
    await mkdir(baseDir, { recursive: true })
    await writeFile(pdfPath, buffer)
    await runCommand(executables.pdftoppm, ['-png', '-r', String(dpi), '-l', String(maxPages), pdfPath, join(baseDir, 'page')], { cwd: root, timeoutMs: 180000 })
    await runCommand(executables.pdftotext, ['-bbox', pdfPath, wordsXmlPath], { cwd: root, timeoutMs: 120000 })
    const xml = stripBom(await readFile(wordsXmlPath, 'utf8'))
    const layout = parsePdfLayout(xml)
    const images = pageImages(await readdir(baseDir))
    const pages = []
    for (let index = 0; index < layout.length && index < images.length; index += 1) {
      const page = layout[index]
      pages.push({
        page: index + 1,
        width: page.width,
        height: page.height,
        image: normalizedPath(relative(root, join(baseDir, images[index]))),
        lines: groupPdfLines(page.words),
      })
    }
    if (pages.length === 0) fail('pdf/render-failed', '没有渲染出任何 PDF 页面')
    return { id, pdfPath: normalizedPath(relative(root, pdfPath)), pages }
  } catch (error) {
    if (error?.stderr) console.error('[english-practice] poppler stderr：', String(error.stderr).slice(-4000))
    await safeRemoveInside(pdfsRoot, baseDir).catch(() => undefined)
    if (error instanceof DomainError) throw error
    if (error?.notFound) fail('pdf/poppler-missing', '未找到 poppler 工具（pdftoppm / pdftotext）。请先安装：' + POPPLER_INSTALL_HINT)
    console.error('[english-practice] PDF 渲染失败：', error)
    fail('pdf/render-failed', 'PDF 渲染失败，请确认文件是有效的 PDF')
  }
}
