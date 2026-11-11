import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspaceStore, stripBom } from '../host/json-store.js'

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-store-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

test('stripBom removes a UTF-8 BOM only', () => {
  assert.equal(stripBom('\uFEFF{"a":1}'), '{"a":1}')
  assert.equal(stripBom('{"a":1}'), '{"a":1}')
  assert.equal(stripBom(''), '')
})

test('writeJson is atomic and readable back', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'nested', 'data.json')
  await store.writeJson(file, { version: 1, words: ['a'] })
  assert.deepEqual(await store.readJson(file, null), { version: 1, words: ['a'] })
  const raw = await readFile(file, 'utf8')
  assert.equal(raw, JSON.stringify({ version: 1, words: ['a'] }, null, 2) + '\n')
  const leftovers = (await readdir(join(dir, 'nested'))).filter((name) => name.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
})

test('readJson strips a BOM from the file', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'bom.json')
  await writeFile(file, '\uFEFF{"ok":true}', 'utf8')
  assert.deepEqual(await store.readJson(file, null), { ok: true })
})

test('missing files return the fallback and flag missing', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const detail = await store.readJsonFile(join(dir, 'nope.json'), { fallback: true })
  assert.equal(detail.missing, true)
  assert.equal(detail.corrupted, false)
  assert.deepEqual(detail.value, { fallback: true })
})

test('corrupt JSON is backed up as *.corrupt-<ts> and fallback returned', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'broken.json')
  await writeFile(file, '{ definitely not json', 'utf8')
  const originalError = console.error
  console.error = () => undefined
  t.after(() => {
    console.error = originalError
  })
  const detail = await store.readJsonFile(file, undefined)
  console.error = originalError
  assert.equal(detail.corrupted, true)
  assert.equal(detail.value, undefined)
  const names = await readdir(dir)
  const backups = names.filter((name) => name.startsWith('broken.json.corrupt-'))
  assert.equal(backups.length, 1)
  assert.equal(names.includes('broken.json'), false)
  assert.equal(await readFile(join(dir, backups[0]), 'utf8'), '{ definitely not json')
})

test('locked read-modify-write serializes concurrent updates', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'counter.json')
  await store.writeJson(file, { value: 0 })
  await Promise.all(Array.from({ length: 25 }, () => store.locked(file, async () => {
    const data = await store.readJsonFile(file, { value: 0 })
    await new Promise((resolve) => setTimeout(resolve, 1))
    await store.atomicWriteText(file, JSON.stringify({ value: data.value.value + 1 }))
  })))
  assert.deepEqual(await store.readJson(file, null), { value: 25 })
})

test('concurrent writeJson calls end with one complete document', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'many.json')
  await Promise.all(Array.from({ length: 40 }, (_value, index) => store.writeJson(file, { index, payload: 'x'.repeat(100) })))
  const data = await store.readJson(file, null)
  assert.equal(typeof data.index, 'number')
  assert.equal(data.payload.length, 100)
})

test('writeText / readText roundtrip and lock cleanup', async (t) => {
  const dir = await tempDir(t)
  const store = createWorkspaceStore()
  const file = join(dir, 'note.md')
  await store.writeText(file, '# hi')
  assert.equal(await store.readText(file, ''), '# hi')
  assert.equal(await store.readText(join(dir, 'missing.md'), 'fallback'), 'fallback')
})
