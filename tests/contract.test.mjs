import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTION_NAMES } from '../host/api.js'
import { TOOL_NAMES } from '../host/tools.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

async function readText(name) {
  return readFile(join(ROOT, name), 'utf8')
}

test('client.js call() action literals match the host dispatch table', async () => {
  const client = await readText('client.js')
  const actions = new Set()
  for (const match of client.matchAll(/call\('([^']+)'/g)) actions.add(match[1])
  assert.deepEqual([...actions].sort(), [...ACTION_NAMES].sort())
  assert.equal(actions.size, ACTION_NAMES.length)
  assert.equal(new Set(ACTION_NAMES).size, ACTION_NAMES.length)
})

test('client loader id and PKG match package.json#name (and the patch entry)', async () => {
  const client = await readText('client.js')
  const pkg = JSON.parse(await readText('package.json'))
  const loader = /window\.__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/.exec(client)
  assert.ok(loader, 'client.js must declare the loader id')
  assert.equal(loader[1], pkg.name)
  const pkgConst = /const PKG = '([^']+)'/.exec(client)
  assert.ok(pkgConst, 'client.js must declare PKG')
  assert.equal(pkgConst[1], pkg.name)
  const patch = await readText('cordis.patch.yml')
  const patchName = /name:\s*'([^']+)'/.exec(patch)
  assert.ok(patchName, 'cordis.patch.yml must declare the package name')
  assert.equal(patchName[1], pkg.name)
})

test('agent tool names are frozen', () => {
  assert.deepEqual([...TOOL_NAMES], ['english_transcribe', 'english_vocab'])
})
