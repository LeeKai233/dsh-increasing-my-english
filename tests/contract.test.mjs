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

// Spec §5.2: the recall feature must ship these keys in BOTH dictionaries.
// (The set-equality test above only proves zh/en stay in sync; this list also
// catches a key deleted from both languages by accident.)
const REQUIRED_RECALL_KEYS = [
  'mode.recall',
  'recall.loading', 'recall.failed', 'recall.retry', 'recall.refresh',
  'recall.progress', 'recall.remaining', 'recall.due', 'recall.newWords',
  'recall.mastered', 'recall.streak', 'recall.mode', 'recall.modeMix',
  'recall.modeEnZh', 'recall.modeZhEn', 'recall.cardNew', 'recall.cardDue',
  'recall.promptEnZh', 'recall.promptZhEn', 'recall.placeholderEnZh',
  'recall.placeholderZhEn', 'recall.submit', 'recall.skip', 'recall.answer',
  'recall.correctAnswer', 'recall.verdictCorrect', 'recall.verdictClose',
  'recall.verdictWrong', 'recall.verdictHint', 'recall.gradeAgain',
  'recall.gradeHard', 'recall.gradeGood', 'recall.gradeEasy', 'recall.gradeHint',
  'recall.doneTitle', 'recall.doneSummary', 'recall.doneHint',
  'recall.noWordbook', 'recall.noMeanings', 'recall.noRound', 'recall.nextReview',
  'recall.masteryTitle', 'recall.mastery0', 'recall.mastery1', 'recall.mastery2',
  'recall.mastery3', 'recall.mastery4', 'recall.mastery5', 'recall.level',
  'recall.nextToday', 'recall.nextTomorrow', 'recall.nextDate',
  'recall.resetWord', 'recall.resetAll', 'recall.resetAllConfirm',
  'recall.resetYes', 'recall.resetNo', 'recall.historyTitle', 'recall.pageTabs',
  'error.recallInvalid', 'error.recallNotFound',
]

// Spec: the multi-sense analysis UI must ship these keys in BOTH dictionaries.
const REQUIRED_ANALYSIS_KEYS = [
  'vocab.analyze', 'vocab.analyzing', 'vocab.analyzeHint', 'vocab.analysisDone',
  'vocab.analysisSkipped', 'vocab.analysisFailed', 'vocab.senseExample',
  'toast.analyzed', 'toast.analyzeSkipped', 'toast.analyzeFailed', 'error.analysisDisabled',
]

/**
 * Statically extract one flat i18n dictionary from client.js — no evaluation of
 * the plugin bundle (no eval / new Function / vm, and no import of client.js).
 *
 * The two dictionaries are declared as `const zh = { ... }` / `const en = { ... }`
 * and hold only string values, so brace matching has to skip quoted strings
 * (many values contain `{placeholder}` braces). After locating the matching
 * closing brace, top-level keys are collected from the indented `'key':` lines.
 * If the dictionary formatting changes enough for this parser to stop working,
 * the test fails loudly (truncated/unbalanced) instead of silently passing.
 */
function extractDictionary(source, name) {
  const marker = 'const ' + name + ' = {'
  const markerIndex = source.indexOf(marker)
  assert.ok(markerIndex >= 0, 'client.js must declare the ' + name + ' dictionary')
  const open = source.indexOf('{', markerIndex)
  let index = open + 1
  let depth = 1
  let quote = ''
  for (; index < source.length; index += 1) {
    const char = source[index]
    if (quote !== '') {
      if (char === '\\') index += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  assert.equal(depth, 0, 'unbalanced braces while extracting the ' + name + ' dictionary')
  const block = source.slice(open, index + 1)
  const keys = [...block.matchAll(/^[ \t]+'([^']+)':/gm)].map((match) => match[1])
  assert.ok(keys.length >= 100, 'the ' + name + ' dictionary looks truncated (' + keys.length + ' keys)')
  assert.equal(new Set(keys).size, keys.length, 'the ' + name + ' dictionary has duplicate keys')
  return keys
}

test('client.js zh / en i18n dictionaries have exactly the same keys', async () => {
  const client = await readText('client.js')
  const zh = extractDictionary(client, 'zh')
  const en = extractDictionary(client, 'en')
  assert.deepEqual([...zh].sort(), [...en].sort())
  for (const key of REQUIRED_RECALL_KEYS) {
    assert.ok(zh.includes(key), 'missing zh key: ' + key)
    assert.ok(en.includes(key), 'missing en key: ' + key)
  }
  for (const key of REQUIRED_ANALYSIS_KEYS) {
    assert.ok(zh.includes(key), 'missing zh key: ' + key)
    assert.ok(en.includes(key), 'missing en key: ' + key)
  }
})

test('release metadata is consistent: package.json, whalepicks.json and CHANGELOG', async () => {
  const pkg = JSON.parse(await readText('package.json'))
  const manifest = JSON.parse(await readText('whalepicks.json'))
  assert.equal(manifest.id, pkg.name)
  assert.equal(manifest.name, pkg.name)
  assert.equal(manifest.version, pkg.version)
  assert.equal(manifest.install?.spec, pkg.name)
  assert.equal(manifest.runtime?.dsh, pkg.engines.dsh)
  const manifestBundle = String(manifest.patches?.bundle ?? '').replace('./', '')
  const packageBundle = String(pkg.dsh?.bundle?.patch ?? '').replace('./', '')
  assert.equal(manifestBundle, packageBundle)
  const changelog = await readText('CHANGELOG.md')
  const heading = '## [' + pkg.version + '] - '
  const released = changelog.split('\n').some((line) => {
    if (!line.startsWith(heading)) return false
    const date = line.slice(heading.length)
    return date.length === 10 && date[4] === '-' && date[7] === '-'
  })
  assert.ok(released, 'CHANGELOG must contain a dated ' + pkg.version + ' section')
})
