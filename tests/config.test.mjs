import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createConfigLoader,
  DEFAULT_CONFIG,
  executableProblem,
  normalizeConfig,
  resolveExecutable,
  resolveExecutables,
} from '../host/config.js'
import { createWorkspaceStore } from '../host/json-store.js'

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-config-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

test('DEFAULT_CONFIG matches the frozen contract and carries no executable paths', () => {
  assert.equal(DEFAULT_CONFIG.asr.model, 'qwen-audio-3.1-asr-flash-filetrans')
  assert.equal(DEFAULT_CONFIG.asr.fallbackModel, 'fun-asr')
  assert.equal(DEFAULT_CONFIG.asr.language, 'en')
  assert.equal(DEFAULT_CONFIG.asr.maxJobMinutes, 30)
  assert.equal(DEFAULT_CONFIG.asr.pollIntervalSeconds, 2)
  assert.equal(DEFAULT_CONFIG.asr.mergeGapMs, 4000)
  assert.equal(DEFAULT_CONFIG.asr.toolTimeoutMinutes, 32)
  assert.deepEqual(DEFAULT_CONFIG.lookup, { backend: 'ds', provider: null, model: null, timeoutMs: 20000 })
  assert.deepEqual(DEFAULT_CONFIG.import, { maxPdfPages: 120, dpi: 100 })
  assert.deepEqual(DEFAULT_CONFIG.dirs, { recordings: 'recordings', transcripts: 'transcripts' })
  assert.equal('blPath' in DEFAULT_CONFIG, false)
  assert.equal('pdfToPpmPath' in DEFAULT_CONFIG.import, false)
  assert.equal('pdfToTextPath' in DEFAULT_CONFIG.import, false)
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
})

test('empty config equals the defaults', () => {
  const { config, warnings } = normalizeConfig({})
  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.deepEqual(warnings, [])
})

test('legacy executable config keys are ignored with env-var hints', () => {
  const { config, warnings } = normalizeConfig({
    blPath: 'C:\\evil\\bl.exe',
    import: { pdfToPpmPath: 'evil-ppm', pdfToTextPath: 'evil-txt', dpi: 120 },
  })
  assert.equal('blPath' in config, false)
  assert.equal('pdfToPpmPath' in config.import, false)
  assert.equal('pdfToTextPath' in config.import, false)
  assert.equal(config.import.dpi, 120)
  const joined = warnings.join('\n')
  assert.match(joined, /blPath/)
  assert.match(joined, /DSH_ENGLISH_BL/)
  assert.match(joined, /DSH_ENGLISH_PDFTOPPM/)
  assert.match(joined, /DSH_ENGLISH_PDFTOTEXT/)
})

test('unknown config keys are reported and ignored', () => {
  const { warnings } = normalizeConfig({ nope: 1, asr: { whatever: true } })
  assert.match(warnings.join('\n'), /"nope"/)
  assert.match(warnings.join('\n'), /"asr.whatever"/)
})

test('invalid values fall back to defaults with warnings', () => {
  const { config, warnings } = normalizeConfig({
    asr: { maxJobMinutes: -5, model: 123, pollIntervalSeconds: 999 },
    lookup: { backend: 'nope', timeoutMs: 1 },
    import: { dpi: 10, maxPdfPages: 0 },
    dirs: { transcripts: '../escape', recordings: 'C:\\absolute' },
  })
  assert.equal(config.asr.maxJobMinutes, 30)
  assert.equal(config.asr.model, DEFAULT_CONFIG.asr.model)
  assert.equal(config.asr.pollIntervalSeconds, 2)
  assert.equal(config.lookup.backend, 'ds')
  assert.equal(config.lookup.timeoutMs, 20000)
  assert.equal(config.import.dpi, 100)
  assert.equal(config.import.maxPdfPages, 120)
  assert.equal(config.dirs.transcripts, 'transcripts')
  assert.equal(config.dirs.recordings, 'recordings')
  assert.ok(warnings.length >= 7)
})

test('toolTimeoutMinutes always exceeds maxJobMinutes', () => {
  const { config, warnings } = normalizeConfig({ asr: { maxJobMinutes: 60, toolTimeoutMinutes: 10 } })
  assert.equal(config.asr.toolTimeoutMinutes, 61)
  assert.match(warnings.join('\n'), /toolTimeoutMinutes/)
  const custom = normalizeConfig({ asr: { maxJobMinutes: 30, toolTimeoutMinutes: 40 } }).config
  assert.equal(custom.asr.toolTimeoutMinutes, 40)
})

test('executableProblem rejects multi-segment commands and relative paths', () => {
  assert.equal(executableProblem('bl'), undefined)
  assert.equal(executableProblem('/usr/local/bin/bl'), undefined)
  assert.equal(executableProblem('C:\\tools\\bl.exe'), undefined)
  assert.notEqual(executableProblem('bl --flag'), undefined)
  assert.notEqual(executableProblem('bl && calc'), undefined)
  assert.notEqual(executableProblem('C:\\Program Files\\bl.exe'), undefined)
  assert.notEqual(executableProblem('./bl'), undefined)
  assert.notEqual(executableProblem(''), undefined)
  assert.notEqual(executableProblem('$(whoami)'), undefined)
})

test('resolveExecutable prefers a valid env override and falls back otherwise', () => {
  assert.deepEqual(resolveExecutable('bl', {}), { command: 'bl', source: 'default', warning: undefined })
  const absolute = resolveExecutable('bl', { DSH_ENGLISH_BL: 'C:\\tools\\bl.exe' })
  assert.equal(absolute.command, 'C:\\tools\\bl.exe')
  assert.equal(absolute.source, 'env')
  const invalid = resolveExecutable('bl', { DSH_ENGLISH_BL: 'bl | calc' })
  assert.equal(invalid.command, 'bl')
  assert.equal(invalid.source, 'default')
  assert.match(invalid.warning, /DSH_ENGLISH_BL/)
  const blank = resolveExecutable('pdftoppm', { DSH_ENGLISH_PDFTOPPM: '   ' })
  assert.equal(blank.command, 'pdftoppm')
  const all = resolveExecutables({ DSH_ENGLISH_PDFTOTEXT: 'pdftotext-2' })
  assert.deepEqual(all.executables, { bl: 'bl', pdftoppm: 'pdftoppm', pdftotext: 'pdftotext-2' })
  assert.deepEqual(all.warnings, [])
})

test('config loader: missing file uses defaults without warnings', async (t) => {
  const root = await tempDir(t)
  const loader = createConfigLoader({ store: createWorkspaceStore() })
  const { config, warnings } = await loader.load(root)
  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.deepEqual(warnings, [])
})

test('config loader: BOM config, legacy keys and short TTL cache', async (t) => {
  const root = await tempDir(t)
  const file = join(root, '.dsh-english', 'config.json')
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(file, '\uFEFF' + JSON.stringify({ blPath: 'x', asr: { maxJobMinutes: 5 } }), 'utf8')
  const store = createWorkspaceStore()
  const loader = createConfigLoader({ store })
  const first = await loader.load(root)
  assert.equal(first.config.asr.maxJobMinutes, 5)
  assert.match(first.warnings.join('\n'), /blPath/)
  await writeFile(file, JSON.stringify({ asr: { maxJobMinutes: 6 } }), 'utf8')
  const cached = await loader.load(root)
  assert.equal(cached.config.asr.maxJobMinutes, 5)
  const fresh = createConfigLoader({ store, ttlMs: 0 })
  assert.equal((await fresh.load(root)).config.asr.maxJobMinutes, 6)
})

test('config loader: corrupt JSON is backed up and defaults are used', async (t) => {
  const root = await tempDir(t)
  const file = join(root, '.dsh-english', 'config.json')
  await mkdir(join(root, '.dsh-english'), { recursive: true })
  await writeFile(file, '{ nope', 'utf8')
  const originalError = console.error
  console.error = () => undefined
  t.after(() => {
    console.error = originalError
  })
  const loader = createConfigLoader({ store: createWorkspaceStore() })
  const { config, warnings } = await loader.load(root)
  console.error = originalError
  assert.deepEqual(config, DEFAULT_CONFIG)
  assert.match(warnings.join('\n'), /损坏/)
  const names = await readdir(join(root, '.dsh-english'))
  assert.ok(names.some((name) => name.startsWith('config.json.corrupt-')))
})
