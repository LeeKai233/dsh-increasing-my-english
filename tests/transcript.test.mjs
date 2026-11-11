import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'
import { DomainError, ensureWorkspaceDirs } from '../host/paths.js'
import { createTranscriptService, MAX_IMPORT_TEXT_CHARS, normalizeTranscript } from '../host/transcript.js'

const CONFIG = normalizeConfig({}).config
const PDF_ID = '2eec2c76-9196-4000-a01a-6f3e86e82a26'

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-transcript-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

async function setup(t) {
  const root = await tempDir(t)
  await ensureWorkspaceDirs(root, CONFIG)
  return root
}

function pdfRenderer() {
  return async () => ({
    id: PDF_ID,
    pdfPath: '.dsh-english/pdfs/' + PDF_ID + '/source.pdf',
    pages: [{ page: 1, width: 612, height: 792, image: '.dsh-english/pdfs/' + PDF_ID + '/page-01.png', lines: [] }],
  })
}

function createService(renderPdf = pdfRenderer()) {
  const store = createWorkspaceStore()
  return { store, service: createTranscriptService({ store, renderPdf }) }
}

test('normalizeTranscript handles ASR envelopes, speakers and merging', () => {
  const raw = {
    output: {
      transcripts: [{
        sentences: [
          { begin_time: 0, end_time: 1000, speaker_id: 0, text: 'Hello world.' },
          { begin_time: 1200, end_time: 2000, speaker_id: 0, text: 'How are you?' },
          { begin_time: 3000, end_time: 4000, speaker_id: 1, text: 'Fine, thanks.' },
          { begin_time: 5000, end_time: 5000, speaker_id: 1, text: '   ' },
        ],
      }],
    },
  }
  const transcript = normalizeTranscript(raw, { audio: 'recordings/ep.mp3', model: 'fun-asr', warnings: [], mergeGapMs: 4000 })
  assert.equal(transcript.version, 1)
  assert.equal(transcript.audio, 'recordings/ep.mp3')
  assert.equal(transcript.model, 'fun-asr')
  assert.equal(transcript.segments.length, 2)
  assert.equal(transcript.segments[0].text, 'Hello world. How are you?')
  assert.equal(transcript.segments[0].i, 0)
  assert.deepEqual(transcript.speakers, [{ id: '0', label: 'Speaker 1' }, { id: '1', label: 'Speaker 2' }])
  assert.equal(transcript.durationMs, 4000)
})

test('normalizeTranscript falls back to one whole-text segment', () => {
  const transcript = normalizeTranscript({ text: ' Just one block. ' }, { audio: '', model: 'm', warnings: ['w'], mergeGapMs: 1000 })
  assert.equal(transcript.segments.length, 1)
  assert.equal(transcript.segments[0].text, 'Just one block.')
  assert.equal(transcript.warnings.length, 2)
  assert.equal(transcript.warnings[1], 'ASR 结果没有分句，已把整段文本作为一条记录')
})

test('import / list / merge / delete roundtrip for a text transcript', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  const imported = await service.importTranscript(root, CONFIG, { name: 'Sample Episode.txt', content: 'Hello world.\n\nSecond paragraph.' })
  assert.deepEqual(imported, { file: 'Sample-Episode.json', segments: 2, pages: 0 })
  const files = await readdir(join(root, 'transcripts'))
  assert.deepEqual(files, ['.jobs', 'Sample-Episode.json'])
  const document = JSON.parse(await readFile(join(root, 'transcripts', 'Sample-Episode.json'), 'utf8'))
  assert.equal(document.version, 1)
  assert.equal(document.imported, true)
  assert.equal(document.model, 'import')
  const list = await service.list(root, CONFIG)
  assert.equal(list.length, 1)
  assert.equal(list[0].file, 'Sample-Episode.json')
  assert.equal(list[0].segments, 2)
  assert.equal(list[0].imported, true)
  const merged = await service.merge(root, CONFIG, { file: 'Sample-Episode.json' })
  assert.deepEqual(merged, { file: 'Sample-Episode.json', before: 2, after: 2, changed: false })
  assert.deepEqual(await service.remove(root, CONFIG, { file: 'Sample-Episode.json' }), { file: 'Sample-Episode.json', deleted: true })
  assert.deepEqual(await service.list(root, CONFIG), [])
})

test('import allocates unique names atomically', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  const first = await service.importTranscript(root, CONFIG, { name: 'same.txt', content: 'one' })
  const second = await service.importTranscript(root, CONFIG, { name: 'same.txt', content: 'two' })
  assert.equal(first.file, 'same.json')
  assert.equal(second.file, 'same-2.json')
  const third = await service.importTranscript(root, CONFIG, { name: 'same.txt', content: 'three' })
  assert.equal(third.file, 'same-3.json')
  assert.equal((await readdir(join(root, 'transcripts'))).filter((name) => name.endsWith('.part')).length, 0)
})

test('import strips HTML and Markdown', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  await service.importTranscript(root, CONFIG, { name: 'page.html', content: '<html><body><p>Hello <b>world</b>.</p></body></html>' })
  await service.importTranscript(root, CONFIG, { name: 'notes.md', content: '# Title\n\nSome **bold** text.' })
  const documents = await Promise.all([
    readFile(join(root, 'transcripts', 'page.json'), 'utf8'),
    readFile(join(root, 'transcripts', 'notes.json'), 'utf8'),
  ])
  assert.match(documents[0], /Hello world/)
  assert.match(documents[1], /Some bold text/)
})

test('import validates format, size, name and emptiness', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'doc.docx', content: 'x' }), (error) => codeOf(error) === 'import/unsupported-format')
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'empty.txt', content: '   ' }), (error) => codeOf(error) === 'import/empty')
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: '..\\evil.txt', content: 'x' }), (error) => codeOf(error) === 'transcript/invalid-name')
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'CON.txt', content: 'x' }), (error) => codeOf(error) === 'transcript/invalid-name')
  const huge = 'a'.repeat(MAX_IMPORT_TEXT_CHARS + 1)
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'huge.txt', content: huge }), (error) => codeOf(error) === 'import/too-large')
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'whitespace.txt', content: '\n\n\n' }), (error) => codeOf(error) === 'import/empty')
})

test('import PDF stores page payload and rejects empty base64', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  const imported = await service.importTranscript(root, CONFIG, { name: 'paper.pdf', contentBase64: Buffer.from('%PDF-1.4').toString('base64') })
  assert.equal(imported.file, 'paper.json')
  assert.equal(imported.pages, 1)
  const document = JSON.parse(await readFile(join(root, 'transcripts', 'paper.json'), 'utf8'))
  assert.equal(document.pdf, true)
  assert.equal(document.pdfId, PDF_ID)
  assert.equal(document.pages.length, 1)
  assert.equal(document.model, 'pdf')
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'empty.pdf', contentBase64: '' }), (error) => codeOf(error) === 'import/empty')
})

test('import PDF propagates poppler-missing and cleans up', async (t) => {
  const root = await setup(t)
  const broken = async () => {
    throw new DomainError('pdf/poppler-missing', '未找到 poppler 工具')
  }
  const { service } = createService(broken)
  await assert.rejects(() => service.importTranscript(root, CONFIG, { name: 'paper.pdf', contentBase64: Buffer.from('%PDF-1.4').toString('base64') }), (error) => codeOf(error) === 'pdf/poppler-missing')
  assert.deepEqual(await service.list(root, CONFIG), [])
})

test('delete rejects invalid file names and missing transcripts', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  await assert.rejects(() => service.remove(root, CONFIG, { file: '..\\evil.json' }), (error) => codeOf(error) === 'transcript/invalid-name')
  await assert.rejects(() => service.remove(root, CONFIG, { file: '../evil.json' }), (error) => codeOf(error) === 'transcript/invalid-name')
  await assert.rejects(() => service.remove(root, CONFIG, { file: 'missing.json' }), (error) => codeOf(error) === 'transcript/not-found')
})

test('delete P0: a traversal pdfId refuses the delete and never touches outside paths', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  const outside = await mkdtemp(join(tmpdir(), 'english-outside-'))
  t.after(async () => {
    await rm(outside, { recursive: true, force: true })
  })
  await writeFile(join(outside, 'keep.txt'), 'keep')
  const transcriptPath = join(root, 'transcripts', 'evil.json')
  const escapedName = '../../' + outside.split(/[\\/]/).pop()
  await writeFile(transcriptPath, JSON.stringify({ version: 1, segments: [], pdfId: escapedName, pdf: true }), 'utf8')
  await assert.rejects(() => service.remove(root, CONFIG, { file: 'evil.json' }), (error) => codeOf(error) === 'path/invalid')
  assert.equal((await readdir(join(root, 'transcripts'))).includes('evil.json'), true)
  assert.deepEqual(await readdir(outside), ['keep.txt'])
  await writeFile(transcriptPath, JSON.stringify({ version: 1, segments: [], pdfId: 'not-a-uuid', pdf: true }), 'utf8')
  await assert.rejects(() => service.remove(root, CONFIG, { file: 'evil.json' }), (error) => codeOf(error) === 'path/invalid')
  assert.equal((await readdir(join(root, 'transcripts'))).includes('evil.json'), true)
})

test('delete removes a valid PDF payload directory', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  const pdfDir = join(root, '.dsh-english', 'pdfs', PDF_ID)
  await mkdir(pdfDir, { recursive: true })
  await writeFile(join(pdfDir, 'source.pdf'), '%PDF')
  await writeFile(join(root, 'transcripts', 'paper.json'), JSON.stringify({ version: 1, segments: [], pdf: true, pdfId: PDF_ID }), 'utf8')
  assert.deepEqual(await service.remove(root, CONFIG, { file: 'paper.json' }), { file: 'paper.json', deleted: true })
  assert.deepEqual(await readdir(join(root, '.dsh-english', 'pdfs')), [])
  assert.equal((await readdir(join(root, 'transcripts'))).includes('paper.json'), false)
})

test('list skips corrupt transcript JSON and backs it up', async (t) => {
  const root = await setup(t)
  const { service } = createService()
  await writeFile(join(root, 'transcripts', 'bad.json'), '{ not json', 'utf8')
  const originalError = console.error
  console.error = () => undefined
  t.after(() => {
    console.error = originalError
  })
  const list = await service.list(root, CONFIG)
  console.error = originalError
  assert.deepEqual(list, [])
  const names = await readdir(join(root, 'transcripts'))
  assert.ok(names.some((name) => name.startsWith('bad.json.corrupt-')))
})
