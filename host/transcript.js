/**
 * Transcript documents: ASR result normalization, listing, paragraph merge,
 * text/PDF import, and safe deletion (the PDF payload directory is guarded by
 * a UUID + workspace containment + a real-directory lstat check).
 */
import { lstat, readdir, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  UUID_RE,
  fail,
  isRecord,
  normalizedPath,
  PDFS_REL,
  releaseReservation,
  reserveFileName,
  resolveInWorkspace,
  safeRemoveInside,
  sanitizeStem,
  validateBaseFileName,
} from './paths.js'
import { mergeSegments, paragraphsFromText, stripHtml, stripMarkdown, stripTex } from './text.js'

/** Audio formats accepted by recordings.list / browse.list / transcribe. */
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.amr', '.wma', '.mp4', '.webm'])

/** Document formats accepted by transcripts.import. */
export const IMPORT_EXTENSIONS = new Set(['.txt', '.text', '.md', '.markdown', '.html', '.htm', '.tex', '.rst', '.log', '.pdf'])

/** Frozen caps: 3MB of text, 28MB of base64 PDF (20MB decoded). */
export const MAX_IMPORT_TEXT_CHARS = 3 * 1024 * 1024
export const MAX_IMPORT_PDF_BASE64_CHARS = 28 * 1024 * 1024

export function normalizeSegment(entry) {
  if (!isRecord(entry)) return undefined
  const text = typeof entry.text === 'string' ? entry.text : typeof entry.sentence === 'string' ? entry.sentence : ''
  if (text.trim() === '') return undefined
  if (!/[A-Za-z0-9\u00C0-\u024F\u4E00-\u9FFF]/.test(text)) return undefined
  const start = Number(entry.begin_time ?? entry.start_time ?? entry.start ?? entry.startMs ?? entry.begin ?? 0)
  const end = Number(entry.end_time ?? entry.end ?? entry.endMs ?? entry.finish ?? start)
  const speaker = entry.speaker_id ?? entry.speaker ?? entry.speakerId ?? entry.channel_id ?? '0'
  return {
    start: Number.isFinite(start) ? Math.max(0, Math.round(start)) : 0,
    end: Number.isFinite(end) ? Math.max(0, Math.round(end)) : 0,
    speaker: String(speaker),
    text: text.trim(),
  }
}

/** Tolerant normalization of whatever the ASR model returned. */
export function normalizeTranscript(raw, meta) {
  const root = isRecord(raw) ? raw : {}
  const output = isRecord(root.output) ? root.output : isRecord(root.data) ? root.data : root
  const warnings = Array.isArray(meta.warnings) ? [...meta.warnings] : []
  let list = output.transcripts ?? output.result?.transcripts ?? output.results
  if (!Array.isArray(list)) list = []

  const segments = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const sentences = item.sentences ?? item.sentence_list ?? item.segments
    if (Array.isArray(sentences) && sentences.length > 0) {
      for (const sentence of sentences) {
        const segment = normalizeSegment(sentence)
        if (segment !== undefined) segments.push(segment)
      }
      continue
    }
    const whole = normalizeSegment(item)
    if (whole !== undefined) segments.push(whole)
  }
  if (segments.length === 0 && typeof output.text === 'string' && output.text.trim() !== '') {
    segments.push({ start: 0, end: 0, speaker: '0', text: output.text.trim() })
    warnings.push('ASR 结果没有分句，已把整段文本作为一条记录')
  }
  segments.sort((a, b) => a.start - b.start)
  const merged = mergeSegments(segments, meta.mergeGapMs)
  const speakers = []
  const seen = new Set()
  for (const segment of merged) {
    if (seen.has(segment.speaker)) continue
    seen.add(segment.speaker)
    speakers.push({ id: segment.speaker, label: `Speaker ${speakers.length + 1}` })
  }
  const durationMs = merged.reduce((max, segment) => Math.max(max, segment.end), 0)
  return {
    version: 1,
    audio: meta.audio,
    createdAt: new Date().toISOString(),
    model: meta.model,
    durationMs,
    warnings,
    speakers,
    segments: merged.map((segment, index) => ({ i: index, ...segment })),
  }
}
function transcriptDir(root, config) {
  return resolveInWorkspace(root, config?.dirs?.transcripts ?? 'transcripts')
}

function extensionOf(name) {
  const dot = String(name ?? '').lastIndexOf('.')
  return dot > 0 ? String(name).slice(dot).toLowerCase() : ''
}

function jobRecordsPath(root, config) {
  return join(transcriptDir(root, config), '.jobs')
}

/** Create the transcript service (store + injected PDF renderer). */
export function createTranscriptService(options) {
  const store = options.store
  const renderPdf = options.renderPdf

  /** List transcript summaries (newest first). Corrupt files are skipped. */
  async function list(root, config) {
    const directory = transcriptDir(root, config)
    let entries = []
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
      .reverse()
    const transcripts = []
    for (const file of files) {
      const document = await store.readJson(join(directory, file), undefined)
      if (!isRecord(document) || !Array.isArray(document.segments)) continue
      const row = {
        file,
        title: basename(file, '.json'),
        audio: document.audio ?? '',
        createdAt: document.createdAt ?? '',
        durationMs: document.durationMs ?? 0,
        speakers: Array.isArray(document.speakers) ? document.speakers : [],
        segments: document.segments.length,
        model: document.model ?? '',
      }
      if (document.imported === true) row.imported = true
      if (document.pdf === true) row.pdf = true
      transcripts.push(row)
    }
    transcripts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    return transcripts
  }

  /** Merge adjacent segments in one transcript document. */
  async function merge(root, config, input) {
    const directory = transcriptDir(root, config)
    const validated = validateBaseFileName(input?.file, { extensions: ['.json'] })
    const path = join(directory, validated.file)
    const info = await lstat(path).catch(() => undefined)
    if (info === undefined || info.isSymbolicLink() || !info.isFile()) fail('transcript/not-found', '文稿不存在')
    const document = await store.readJson(path, undefined)
    if (!isRecord(document) || !Array.isArray(document.segments)) fail('transcript/invalid-format', '文稿格式无效')
    if (document.imported === true) {
      return { file: validated.file, before: document.segments.length, after: document.segments.length, changed: false }
    }
    const merged = mergeSegments(
      document.segments.map((segment, index) => ({ ...segment, i: index })),
      Number(config?.asr?.mergeGapMs) || 4000,
    )
    const changed = merged.length !== document.segments.length
    if (changed) {
      const next = { ...document, segments: merged.map((segment, index) => ({ ...segment, i: index })) }
      await store.writeJson(path, next)
    }
    return { file: validated.file, before: document.segments.length, after: merged.length, changed }
  }

  /** Import a plain text / HTML / Markdown / TeX / PDF document. */
  async function importTranscript(root, config, input) {
    const rawName = String(input?.name ?? '').trim() || 'imported.txt'
    const extension = extensionOf(rawName)
    if (!IMPORT_EXTENSIONS.has(extension)) fail('import/unsupported-format', '不支持的文稿格式：' + (extension || '(无扩展名)'))
    validateBaseFileName(rawName, { code: 'transcript/invalid-name' })
    let text = ''
    let pdfDocument
    if (extension === '.pdf') {
      const base64 = String(input?.contentBase64 ?? '').replace(/\s+/g, '')
      if (base64 === '') fail('import/empty', '缺少 PDF 文件内容')
      if (base64.length > MAX_IMPORT_PDF_BASE64_CHARS) fail('pdf/too-large', 'PDF 太大（超过 20MB）')
      let buffer
      try {
        buffer = Buffer.from(base64, 'base64')
      } catch {
        fail('transcript/invalid-format', 'PDF 内容无效')
      }
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('import/empty', 'PDF 内容为空')
      pdfDocument = await renderPdf({ root, config, buffer })
    } else {
      const content = String(input?.content ?? '')
      if (content.trim() === '') fail('import/empty', '文稿内容为空')
      if (content.length > MAX_IMPORT_TEXT_CHARS) fail('import/too-large', '文稿太大（超过 3MB）')
      text = content
      if (extension === '.html' || extension === '.htm') text = stripHtml(text)
      else if (extension === '.md' || extension === '.markdown') text = stripMarkdown(text)
      else if (extension === '.tex') text = stripTex(text)
    }
    const segments = pdfDocument === undefined ? paragraphsFromText(text) : []
    if (pdfDocument === undefined && segments.length === 0) fail('transcript/empty', '没有解析出任何文本段落')
    const directory = transcriptDir(root, config)
    const stemSource = extension === '' ? rawName : rawName.slice(0, rawName.length - extension.length)
    const baseStem = sanitizeStem(basename(stemSource), 'imported')
    const reservation = await reserveFileName(directory, baseStem, '.json')
    const document = {
      version: 1,
      audio: '',
      createdAt: new Date().toISOString(),
      model: pdfDocument === undefined ? 'import' : 'pdf',
      imported: true,
      durationMs: 0,
      warnings: [],
      speakers: [],
      segments,
    }
    if (pdfDocument !== undefined) {
      document.pdf = true
      document.pdfId = pdfDocument.id
      document.pdfPath = pdfDocument.pdfPath
      document.pages = pdfDocument.pages
    }
    try {
      await store.writeJson(reservation.path, document)
    } catch (error) {
      if (pdfDocument !== undefined) {
        const pdfsRoot = join(root, PDFS_REL)
        await safeRemoveInside(pdfsRoot, join(pdfsRoot, pdfDocument.id)).catch(() => undefined)
      }
      throw error
    } finally {
      await releaseReservation(reservation)
    }
    return { file: reservation.file, segments: segments.length, pages: pdfDocument === undefined ? 0 : pdfDocument.pages.length }
  }

  /** Best effort: drop job records that produced this transcript. */
  async function dropJobRecords(root, config, targetRelative) {
    const jobsDir = jobRecordsPath(root, config)
    let entries = []
    try {
      entries = await readdir(jobsDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.raw.json')) continue
      const job = await store.readJson(join(jobsDir, entry.name), undefined)
      if (isRecord(job) && normalizedPath(String(job.transcript ?? '')) === targetRelative) {
        const jobId = entry.name.replace(/\.json$/, '')
        await unlink(join(jobsDir, entry.name)).catch(() => undefined)
        await unlink(join(jobsDir, jobId + '.raw.json')).catch(() => undefined)
      }
    }
  }

  /**
   * Delete a transcript. When the document references rendered PDF pages the
   * pdfId MUST be a UUID and the directory MUST be a real directory inside
   * .dsh-english/pdfs; otherwise the whole delete is refused before any unlink.
   */
  async function remove(root, config, input) {
    const directory = transcriptDir(root, config)
    const validated = validateBaseFileName(input?.file, { extensions: ['.json'] })
    const path = join(directory, validated.file)
    const info = await lstat(path).catch(() => undefined)
    if (info === undefined || info.isSymbolicLink() || !info.isFile()) fail('transcript/not-found', '文稿不存在')
    const document = await store.readJson(path, undefined)
    if (isRecord(document)) {
      const pdfId = document.pdfId
      if (pdfId !== undefined && pdfId !== null && pdfId !== '') {
        if (typeof pdfId !== 'string' || !UUID_RE.test(pdfId)) {
          fail('path/invalid', '文稿的 PDF 关联标识无效，已拒绝删除')
        }
        const pdfsRoot = join(root, PDFS_REL)
        await safeRemoveInside(pdfsRoot, join(pdfsRoot, pdfId))
      }
    }
    await unlink(path).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    await dropJobRecords(root, config, normalizedPath(join(config?.dirs?.transcripts ?? 'transcripts', validated.file)))
    return { file: validated.file, deleted: true }
  }

  return { list, merge, importTranscript, remove, dropJobRecords }
}
