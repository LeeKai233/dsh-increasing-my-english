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
  assert.deepEqual(DEFAULT_CONFIG.recall, { newPerDay: 10, dailyLimit: 30, mode: 'mix' })
  assert.deepEqual(DEFAULT_CONFIG.analysis, { enabled: true, idleMinutes: 3, batchWords: 2, maxContexts: 6, maxContextChars: 240, timeoutMs: 30000, retryMinutes: 10 })
  assert.deepEqual(DEFAULT_CONFIG.dirs, { recordings: 'recordings', transcripts: 'transcripts' })
  assert.equal('blPath' in DEFAULT_CONFIG, false)
  assert.equal('pdfToPpmPath' in DEFAULT_CONFIG.import, false)
  assert.equal('pdfToTextPath' in DEFAULT_CONFIG.import, false)
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.recall))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.analysis))
})

test('recall config: defaults, legal overrides and invalid fallbacks', () => {
  const empty = normalizeConfig({})
  assert.deepEqual(empty.config.recall, { newPerDay: 10, dailyLimit: 30, mode: 'mix' })
  assert.deepEqual(empty.warnings, [])

  const custom = normalizeConfig({ recall: { newPerDay: 0, dailyLimit: 5, mode: 'zh-en' } })
  assert.deepEqual(custom.config.recall, { newPerDay: 0, dailyLimit: 5, mode: 'zh-en' })
  assert.deepEqual(custom.warnings, [])

  const coerced = normalizeConfig({ recall: { newPerDay: '7', dailyLimit: 30.4, mode: 'en-zh' } }).config.recall
  assert.deepEqual(coerced, { newPerDay: 7, dailyLimit: 30, mode: 'en-zh' })

  const invalid = normalizeConfig({ recall: { newPerDay: -1, dailyLimit: 500, mode: 'nope' } })
  assert.deepEqual(invalid.config.recall, DEFAULT_CONFIG.recall)
  const invalidWarnings = invalid.warnings.join('\n')
  assert.match(invalidWarnings, /recall\.newPerDay/)
  assert.match(invalidWarnings, /recall\.dailyLimit/)
  assert.match(invalidWarnings, /recall\.mode/)

  const wrongTypes = normalizeConfig({ recall: { newPerDay: 'abc', dailyLimit: null } })
  assert.deepEqual(wrongTypes.config.recall, DEFAULT_CONFIG.recall)
  assert.ok(wrongTypes.warnings.length >= 2)

  const nonObject = normalizeConfig({ recall: 'nope' })
  assert.deepEqual(nonObject.config.recall, DEFAULT_CONFIG.recall)
  assert.match(nonObject.warnings.join('\n'), /recall 必须是对象/)
})

test('analysis config: defaults, legal overrides and invalid fallbacks', () => {
  const empty = normalizeConfig({})
  assert.deepEqual(empty.config.analysis, DEFAULT_CONFIG.analysis)
  assert.deepEqual(empty.warnings, [])

  const custom = normalizeConfig({ analysis: { enabled: false, idleMinutes: 1.5, batchWords: 5, timeoutMs: 45000 } })
  assert.deepEqual(custom.config.analysis, { ...DEFAULT_CONFIG.analysis, enabled: false, idleMinutes: 1.5, batchWords: 5, timeoutMs: 45000 })
  assert.deepEqual(custom.warnings, [])

  const invalid = normalizeConfig({ analysis: { enabled: 'yes', idleMinutes: 0, batchWords: 0, maxContexts: 99, maxContextChars: 1, timeoutMs: 1, retryMinutes: 0 } })
  assert.deepEqual(invalid.config.analysis, DEFAULT_CONFIG.analysis)
  const joined = invalid.warnings.join('\n')
  for (const key of ['enabled', 'idleMinutes', 'batchWords', 'maxContexts', 'maxContextChars', 'timeoutMs', 'retryMinutes']) {
    assert.match(joined, new RegExp('analysis\\.' + key))
  }

  const nonObject = normalizeConfig({ analysis: 'nope' })
  assert.deepEqual(nonObject.config.analysis, DEFAULT_CONFIG.analysis)
  assert.match(nonObject.warnings.join('\n'), /analysis 必须是对象/)
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
  if (process.platform === 'win32') {
    assert.equal(executableProblem('C:\\tools\\bl.exe'), undefined)
  } else {
    // A Windows drive path is just a relative file name on POSIX, so it must
    // be rejected instead of being handed to spawn() as an executable.
    assert.match(executableProblem('C:\\tools\\bl.exe'), /相对路径/)
  }
  assert.notEqual(executableProblem('bl --flag'), undefined)
  assert.notEqual(executableProblem('bl && calc'), undefined)
  assert.notEqual(executableProblem('C:\\Program Files\\bl.exe'), undefined)
  assert.notEqual(executableProblem('./bl'), undefined)
  assert.notEqual(executableProblem(''), undefined)
  assert.notEqual(executableProblem('$(whoami)'), undefined)
})

test('resolveExecutable prefers a valid env override and falls back otherwise', () => {
  assert.deepEqual(resolveExecutable('bl', {}), { command: 'bl', source: 'default', warning: undefined })
  // Use an override that is absolute on the host running the tests.
  const absolutePath = process.platform === 'win32' ? 'C:\\tools\\bl.exe' : '/usr/local/bin/bl'
  const absolute = resolveExecutable('bl', { DSH_ENGLISH_BL: absolutePath })
  assert.equal(absolute.command, absolutePath)
  assert.equal(absolute.source, 'env')
  if (process.platform !== 'win32') {
    const foreign = resolveExecutable('bl', { DSH_ENGLISH_BL: 'C:\\tools\\bl.exe' })
    assert.equal(foreign.command, 'bl')
    assert.match(foreign.warning, /DSH_ENGLISH_BL/)
  }
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
