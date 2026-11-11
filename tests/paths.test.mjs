import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DomainError,
  ensureWorkspaceDirs,
  fail,
  isSafeRelativeDir,
  releaseReservation,
  reserveFileName,
  resolveAnyPath,
  resolveInWorkspace,
  safeRemoveInside,
  sanitizeStem,
  validateBaseFileName,
  within,
} from '../host/paths.js'

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-paths-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

function codeOf(error) {
  return error instanceof DomainError ? error.code : String(error?.code ?? error)
}

test('resolveInWorkspace normalizes .. and stays inside', async (t) => {
  const root = await tempDir(t)
  assert.equal(resolveInWorkspace(root, 'a/../b.txt'), join(root, 'b.txt'))
  assert.equal(resolveInWorkspace(root, './x/./y.txt'), join(root, 'x', 'y.txt'))
  assert.equal(resolveInWorkspace(root, join(root, 'sub', 'f.txt')), join(root, 'sub', 'f.txt'))
  assert.throws(() => resolveInWorkspace(root, '../escape.txt'), (error) => codeOf(error) === 'path/outside-workspace')
  assert.throws(() => resolveInWorkspace(root, 'a/../../escape.txt'), (error) => codeOf(error) === 'path/outside-workspace')
  assert.throws(() => resolveInWorkspace(root, ''), (error) => codeOf(error) === 'path/invalid')
  assert.throws(() => resolveInWorkspace(root, '\u0000bad'), (error) => codeOf(error) === 'path/invalid')
})

test('resolveAnyPath allows absolute audio outside the workspace', async (t) => {
  const root = await tempDir(t)
  const outside = await tempDir(t)
  assert.equal(resolveAnyPath(root, join(outside, 'ep.mp3')), join(outside, 'ep.mp3'))
  assert.equal(resolveAnyPath(root, 'recordings/ep.mp3'), join(root, 'recordings', 'ep.mp3'))
})

test('within is a real path-containment check, not a string prefix', async (t) => {
  const root = await tempDir(t)
  assert.equal(within(root, root), true)
  assert.equal(within(root, join(root, 'child', 'f')), true)
  assert.equal(within(root, join(root, '..')), false)
  assert.equal(within(root, root + '-sibling'), false)
})

test('isSafeRelativeDir validates config dirs', () => {
  assert.equal(isSafeRelativeDir('recordings'), true)
  assert.equal(isSafeRelativeDir('data/audio'), true)
  assert.equal(isSafeRelativeDir('../escape'), false)
  assert.equal(isSafeRelativeDir('C:\\absolute'), false)
  assert.equal(isSafeRelativeDir('/abs'), false)
  assert.equal(isSafeRelativeDir(''), false)
  assert.equal(isSafeRelativeDir('a\u0000b'), false)
})

test('validateBaseFileName rejects traversal, reserved names and trailing dots', () => {
  assert.deepEqual(validateBaseFileName('episode-1.json', { extensions: ['.json'] }), { file: 'episode-1.json', stem: 'episode-1', extension: '.json' })
  for (const bad of ['../evil.json', '..\\evil.json', 'a/b.json', 'CON.json', 'nul.json', 'COM7.json', 'a..b.json', 'name. ', '.hidden.json', 'x'.repeat(201), '']) {
    assert.throws(() => validateBaseFileName(bad, { extensions: ['.json'] }), (error) => codeOf(error) === 'transcript/invalid-name', String(bad))
  }
  assert.throws(() => validateBaseFileName('ep.txt', { extensions: ['.json'] }), (error) => codeOf(error) === 'transcript/invalid-name')
  assert.throws(() => validateBaseFileName('a/b.txt', { code: 'import/unsupported-format' }), (error) => codeOf(error) === 'import/unsupported-format')
})

test('sanitizeStem produces safe stems', () => {
  assert.equal(sanitizeStem('Episode 12 - Intro!!'), 'Episode-12-Intro')
  assert.equal(sanitizeStem('CON'), 'file-CON')
  assert.equal(sanitizeStem('???'), 'transcript')
  assert.equal(sanitizeStem('  '), 'transcript')
  assert.equal(sanitizeStem('a'.repeat(200)).length, 80)
  assert.equal(sanitizeStem('../../etc/passwd'), 'etc-passwd')
})

test('reserveFileName is atomic: concurrent callers get unique names', async (t) => {
  const dir = await tempDir(t)
  const reservations = await Promise.all(Array.from({ length: 25 }, () => reserveFileName(dir, 'episode', '.json')))
  const names = new Set(reservations.map((item) => item.file))
  assert.equal(names.size, 25)
  const entries = await readdir(dir)
  assert.equal(entries.filter((name) => name.endsWith('.part')).length, 25)
  for (const reservation of reservations) await releaseReservation(reservation)
  assert.equal((await readdir(dir)).length, 0)
})

test('reserveFileName skips existing final files', async (t) => {
  const dir = await tempDir(t)
  await writeFile(join(dir, 'episode.json'), '{}')
  await writeFile(join(dir, 'episode-2.json'), '{}')
  const reservation = await reserveFileName(dir, 'episode', '.json')
  assert.equal(reservation.file, 'episode-3.json')
  await releaseReservation(reservation)
})

test('safeRemoveInside removes a real directory inside the container', async (t) => {
  const root = await tempDir(t)
  const container = join(root, '.dsh-english', 'pdfs')
  const target = join(container, '2eec2c76-9196-4000-a01a-6f3e86e82a26')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'source.pdf'), '%PDF')
  assert.equal(await safeRemoveInside(container, target), true)
  assert.deepEqual(await readdir(container), [])
  assert.equal(await safeRemoveInside(container, join(container, 'missing-id')), false)
})

test('safeRemoveInside never escapes the container', async (t) => {
  const root = await tempDir(t)
  const container = join(root, '.dsh-english', 'pdfs')
  const outside = join(root, 'outside')
  await mkdir(container, { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'keep.txt'), 'keep')
  await assert.rejects(() => safeRemoveInside(container, outside), (error) => codeOf(error) === 'path/outside-workspace')
  assert.deepEqual(await readdir(outside), ['keep.txt'])
  await assert.rejects(() => safeRemoveInside(container, join(container, '..', 'outside')), (error) => codeOf(error) === 'path/outside-workspace')
})

test('safeRemoveInside refuses symlinks and plain files', async (t) => {
  const root = await tempDir(t)
  const container = join(root, '.dsh-english', 'pdfs')
  const outside = join(root, 'outside')
  await mkdir(container, { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'keep.txt'), 'keep')
  const link = join(container, '2eec2c76-9196-4000-a01a-6f3e86e82a26')
  let linked = false
  try {
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    linked = true
  } catch {
    linked = false
  }
  if (linked) {
    await assert.rejects(() => safeRemoveInside(container, link), (error) => codeOf(error) === 'path/invalid')
    assert.deepEqual(await readdir(outside), ['keep.txt'])
  } else {
    t.skip('symlink creation is not permitted on this machine')
  }
  const file = join(container, 'not-a-dir')
  await writeFile(file, 'x')
  await assert.rejects(() => safeRemoveInside(container, file), (error) => codeOf(error) === 'path/invalid')
  assert.equal(await readFile(file, 'utf8'), 'x')
})

test('ensureWorkspaceDirs creates the frozen workspace layout', async (t) => {
  const root = await tempDir(t)
  const dirs = await ensureWorkspaceDirs(root, { dirs: { recordings: 'recordings', transcripts: 'transcripts' } })
  assert.equal(dirs.transcripts, join(root, 'transcripts'))
  assert.equal(dirs.jobs, join(root, 'transcripts', '.jobs'))
  assert.deepEqual(await readdir(dirs.recordings), [])
  assert.deepEqual(await readdir(dirs.transcripts), ['.jobs'])
  assert.deepEqual(await readdir(dirs.jobs), [])
  assert.deepEqual(await readdir(dirs.data), [])
  assert.deepEqual(await readdir(dirs.vocabDir), [])
})

test('fail throws a DomainError with a code', () => {
  assert.throws(() => fail('path/invalid', 'nope'), (error) => error instanceof DomainError && error.code === 'path/invalid' && error.message === 'nope')
})
