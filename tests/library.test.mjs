import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createLibraryService, resolveDshHome } from '../host/library.js'
import { createWorkspaceStore } from '../host/json-store.js'

async function makeService(options = {}) {
  return createLibraryService({
    store: createWorkspaceStore(),
    env: {},
    ttlMs: 0,
    loadConfig: async () => ({
      config: { dirs: { transcripts: 'transcripts', recordings: 'recordings' } },
      warnings: [],
    }),
    ...options,
  })
}

async function withTemp(t) {
  const root = await mkdtemp(join(tmpdir(), 'english-library-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('settings are off by default and resolve to the current project', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  await mkdir(workspace, { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  const library = await makeService({ settingsPath })
  const status = await library.status(workspace)
  assert.equal(status.enabled, false)
  assert.equal(status.root, null)
  assert.equal(status.usingShared, false)
  assert.equal(status.exists, false)
  const resolved = await library.resolveRoot(workspace)
  assert.equal(resolved.enabled, false)
  assert.equal(resolved.root, resolve(workspace))
})

test('set(true) stores the current workspace and set(false) clears it', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  const other = join(root, 'other')
  await mkdir(workspace, { recursive: true })
  await mkdir(other, { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  const library = await makeService({ settingsPath })

  const enabled = await library.set(true, workspace)
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.root, resolve(workspace))
  assert.equal(enabled.usingShared, true)
  assert.equal(enabled.exists, true)
  const raw = JSON.parse(await readFile(settingsPath, 'utf8'))
  assert.equal(raw.version, 1)
  assert.equal(raw.sharedRoot, resolve(workspace))

  const fromOther = await library.resolveRoot(other)
  assert.equal(fromOther.enabled, true)
  assert.equal(fromOther.root, resolve(workspace))
  assert.equal(fromOther.usingShared, false)
  assert.equal(fromOther.problem, undefined)
  if (process.platform === 'win32') {
    const upper = await library.resolveRoot(workspace.toUpperCase())
    assert.equal(upper.usingShared, true)
  }

  const disabled = await library.set(false, other)
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.root, null)
  const rawOff = JSON.parse(await readFile(settingsPath, 'utf8'))
  assert.equal(rawOff.sharedRoot, null)
})

test('a corrupt settings file is backed up and treated as off', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  await mkdir(workspace, { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, '{broken', 'utf8')
  const library = await makeService({ settingsPath })
  const status = await library.status(workspace)
  assert.equal(status.enabled, false)
  assert.ok(status.warnings.some((warning) => warning.includes('损坏')))
  const files = await readdir(dirname(settingsPath))
  assert.ok(files.some((name) => name.includes('.corrupt-')), 'corrupt settings must be backed up')
})

test('a relative sharedRoot is rejected and treated as off', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  await mkdir(workspace, { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, JSON.stringify({ version: 1, sharedRoot: 'relative/dir' }), 'utf8')
  const library = await makeService({ settingsPath })
  const status = await library.status(workspace)
  assert.equal(status.enabled, false)
  assert.equal(status.root, null)
  assert.ok(status.warnings.some((warning) => warning.includes('绝对路径')))
})

test('a configured but missing root is reported, not silently ignored', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  const other = join(root, 'other')
  await mkdir(workspace, { recursive: true })
  await mkdir(other, { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  const library = await makeService({ settingsPath })
  await library.set(true, workspace)
  await rm(workspace, { recursive: true, force: true })

  const resolved = await library.resolveRoot(other)
  assert.equal(resolved.enabled, true)
  assert.equal(resolved.root, resolve(workspace))
  assert.equal(resolved.problem, 'missing')
  const status = await library.status(other)
  assert.equal(status.enabled, true)
  assert.equal(status.exists, false)
  assert.ok(status.warnings.some((warning) => warning.includes('不存在')))
})

test('status({ probe: true }) checks dirs and writability without counts', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  await mkdir(join(workspace, 'transcripts'), { recursive: true })
  await mkdir(join(workspace, 'vocab'), { recursive: true })
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  const library = await makeService({ settingsPath })
  await library.set(true, workspace)
  const status = await library.status(workspace, { probe: true })
  assert.equal(status.enabled, true)
  assert.equal(status.exists, true)
  assert.equal(status.writable, true)
  assert.equal(status.directories.transcripts, true)
  assert.equal(status.directories.vocab, true)
  assert.equal(status.directories.recordings, true)
  assert.equal(status.counts, undefined)
})

test('set validates its inputs and reports write failures', async (t) => {
  const root = await withTemp(t)
  const workspace = join(root, 'project')
  const file = join(root, 'not-a-dir.txt')
  await mkdir(workspace, { recursive: true })
  await writeFile(file, 'x', 'utf8')
  const settingsPath = join(root, 'dsh-home', 'english-practice.json')
  const library = await makeService({ settingsPath })

  await assert.rejects(library.set('yes', workspace), (error) => error.code === 'library/invalid')
  await assert.rejects(library.set(true, 'relative/path'), (error) => error.code === 'library/invalid')
  await assert.rejects(library.set(true, file), (error) => error.code === 'library/unavailable')

  const blocker = join(root, 'blocker')
  await writeFile(blocker, 'x', 'utf8')
  const broken = await makeService({ settingsPath: join(blocker, 'nested', 'settings.json') })
  await assert.rejects(broken.set(true, workspace), (error) => error.code === 'library/settings-failed')
})

test('resolveDshHome prefers DSH_HOME and falls back to ~/.dsh', () => {
  const custom = resolveDshHome({ DSH_HOME: '  /tmp/dsh-home  ' })
  assert.equal(custom, resolve('/tmp/dsh-home'))
  const fallback = resolveDshHome({})
  assert.ok(fallback.endsWith('.dsh'))
})
