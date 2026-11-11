import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeConfig } from '../host/config.js'
import { DomainError } from '../host/paths.js'
import { PDF_MAX_BYTES, groupPdfLines, parsePdfLayout, probePoppler, renderPdfPages } from '../host/pdf.js'

const CONFIG = normalizeConfig({}).config
const EXECUTABLES = { pdftoppm: 'pdftoppm', pdftotext: 'pdftotext' }
const XML = '<?xml version="1.0"?><pdf2xml>' +
  '<page width="612" height="792">' +
  '<word xMin="10" yMin="20" xMax="30" yMax="32">Hello</word>' +
  '<word xMin="40" yMin="20" xMax="60" yMax="32">&amp;world</word>' +
  '<word xMin="10" yMin="50" xMax="40" yMax="62">Second</word>' +
  '</page>' +
  '<page width="612" height="792"><word xMin="5" yMin="5" xMax="25" yMax="17">Page2</word></page>' +
  '</pdf2xml>'

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-pdf-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

test('parsePdfLayout extracts pages, words and decoded entities', () => {
  const layout = parsePdfLayout(XML)
  assert.equal(layout.length, 2)
  assert.equal(layout[0].width, 612)
  assert.equal(layout[0].words.length, 3)
  assert.deepEqual(layout[0].words[1], { t: '&world', x: 40, y: 20, w: 20, h: 12 })
  assert.equal(layout[1].words[0].t, 'Page2')
  assert.deepEqual(parsePdfLayout('not xml'), [])
})

test('groupPdfLines groups by vertical position and sorts by x', () => {
  const layout = parsePdfLayout(XML)
  const lines = groupPdfLines(layout[0].words)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].text, 'Hello &world')
  assert.equal(lines[0].words.length, 2)
  assert.equal(lines[1].text, 'Second')
})

test('probePoppler detects both tools and reports the version', async () => {
  const run = async (command) => ({ stdout: command + ' version 25.02.0\nCopyright', stderr: '' })
  const probe = await probePoppler(run, EXECUTABLES, { cwd: process.cwd() })
  assert.equal(probe.present, true)
  assert.equal(probe.tool, 'pdftoppm')
  assert.equal(probe.version, '25.02.0')
  assert.match(probe.message, /poppler 25\.02\.0/)
})

test('probePoppler reports missing tools with an install hint', async () => {
  const run = async () => {
    throw Object.assign(new Error('找不到可执行文件'), { notFound: true })
  }
  const probe = await probePoppler(run, EXECUTABLES, { cwd: process.cwd() })
  assert.equal(probe.present, false)
  assert.match(probe.message, /未找到 poppler/)
  assert.match(probe.message, /winget|brew|apt/)
})

test('probePoppler treats a non-zero exit as an existing binary', async () => {
  const run = async (command, args) => {
    if (args[0] === '-v') throw Object.assign(new Error('命令失败（exit 1）'), { exitCode: 1, stdout: '', stderr: 'pdftoppm version 25.02.0' })
    return { stdout: '', stderr: '' }
  }
  const probe = await probePoppler(run, EXECUTABLES, { cwd: process.cwd() })
  assert.equal(probe.present, true)
})

function successRunner() {
  return async (command, args) => {
    if (args[0] === '-v' || args[0] === '-h') return { stdout: command + ' version 25.02.0', stderr: '' }
    if (args[0] === '-png') {
      const prefix = args[args.length - 1]
      await writeFile(prefix + '-01.png', 'png1')
      await writeFile(prefix + '-02.png', 'png2')
      return { stdout: '', stderr: '' }
    }
    if (args[0] === '-bbox') {
      await writeFile(args[2], XML)
      return { stdout: '', stderr: '' }
    }
    throw new Error('unexpected command: ' + args.join(' '))
  }
}

test('renderPdfPages writes page images + bbox words and returns the frozen payload', async (t) => {
  const root = await tempDir(t)
  const result = await renderPdfPages({
    root,
    config: CONFIG,
    buffer: Buffer.from('%PDF-1.4 fake'),
    executables: EXECUTABLES,
    runCommand: successRunner(),
  })
  assert.match(result.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(result.pdfPath, '.dsh-english/pdfs/' + result.id + '/source.pdf')
  assert.equal(result.pages.length, 2)
  assert.equal(result.pages[0].image, '.dsh-english/pdfs/' + result.id + '/page-01.png')
  assert.equal(result.pages[0].width, 612)
  assert.equal(result.pages[0].lines.length, 2)
  await stat(join(root, '.dsh-english', 'pdfs', result.id, 'source.pdf'))
  await stat(join(root, '.dsh-english', 'pdfs', result.id, 'page-02.png'))
})

test('renderPdfPages rejects oversized buffers and missing poppler', async (t) => {
  const root = await tempDir(t)
  const missing = async () => {
    throw Object.assign(new Error('找不到可执行文件'), { notFound: true })
  }
  await assert.rejects(() => renderPdfPages({
    root,
    config: CONFIG,
    buffer: Buffer.alloc(PDF_MAX_BYTES + 1),
    executables: EXECUTABLES,
    runCommand: missing,
  }), (error) => codeOf(error) === 'pdf/too-large')
  await assert.rejects(() => renderPdfPages({
    root,
    config: CONFIG,
    buffer: Buffer.from('%PDF'),
    executables: EXECUTABLES,
    runCommand: missing,
  }), (error) => codeOf(error) === 'pdf/poppler-missing')
})

test('renderPdfPages cleans up the page directory on failure', async (t) => {
  const root = await tempDir(t)
  const failing = async (command, args) => {
    if (args[0] === '-v' || args[0] === '-h') return { stdout: command + ' version 25.02.0', stderr: '' }
    throw Object.assign(new Error('命令失败（exit 1）'), { exitCode: 1, stderr: 'boom' })
  }
  const originalError = console.error
  console.error = () => undefined
  t.after(() => {
    console.error = originalError
  })
  await assert.rejects(() => renderPdfPages({
    root,
    config: CONFIG,
    buffer: Buffer.from('%PDF'),
    executables: EXECUTABLES,
    runCommand: failing,
  }), (error) => codeOf(error) === 'pdf/render-failed')
  console.error = originalError
  const entries = await readdir(join(root, '.dsh-english', 'pdfs'))
  assert.deepEqual(entries, [])
})
