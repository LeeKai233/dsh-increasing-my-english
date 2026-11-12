/**
 * Host unit tests for the pure multi-sense core (host/senses.js).
 * Zero dependencies: node:test + node:assert/strict.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ANALYSIS_VERSION,
  analysisFingerprint,
  buildCorpus,
  buildSensePrompt,
  collectContexts,
  corpusSignature,
  countOccurrences,
  entryVariants,
  mergeSenses,
  normalizeSenseResult,
  senseCacheKey,
  splitSentences,
  transcriptUnits,
} from '../host/senses.js'

const HEX = /^[0-9a-f]{40}$/

const ENTRY = {
  word: 'run',
  family: [{ label: '过去式', form: 'ran' }],
  sentence: 'I run at dawn.',
  source: { transcript: 'seed.json', title: 'Seed', speaker: '1', startMs: 5000 },
  meanings: [{ pos: 'n.', zh: '跑步' }],
}

const CORPUS = [
  {
    file: 'a.json',
    title: 'A',
    units: [
      { text: 'I run fast.', startMs: 1000, speaker: '0' },
      { text: 'She ran home.', startMs: 2000, speaker: '0' },
      { text: 'Unrelated sentence.', startMs: 3000, speaker: '0' },
      { text: 'I run fast.', startMs: 1000, speaker: '0' },
    ],
  },
  {
    file: 'b.json',
    title: 'B',
    units: [
      { text: 'We run together.', startMs: 1000, speaker: '1' },
      { text: 'They ran away.', startMs: 2000, speaker: '1' },
    ],
  },
]

function documentOf(file, title, document) {
  return { file, title, document }
}

test('host/senses.js stays pure: only node:crypto and ./text.js are imported', async () => {
  const source = await readFile(new URL('../host/senses.js', import.meta.url), 'utf8')
  const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((match) => match[1])
  assert.deepEqual(imports.sort(), ['./text.js', 'node:crypto'])
  assert.doesNotMatch(source, /\bsetTimeout\b|\bsetInterval\b|\bfetch\b/)
})

test('ANALYSIS_VERSION is the frozen analysis version', () => {
  assert.equal(ANALYSIS_VERSION, 1)
})

test('splitSentences splits trimmed prose on terminators', () => {
  assert.deepEqual(splitSentences('  Hello world.   How are you?  '), ['Hello world.', 'How are you?'])
  assert.deepEqual(splitSentences('One\nTwo\r\nThree'), ['One Two Three'])
  assert.deepEqual(splitSentences('Really?! Yes. And… done'), ['Really?!', 'Yes.', 'And…', 'done'])
  assert.deepEqual(splitSentences('No terminator at all'), ['No terminator at all'])
  assert.deepEqual(splitSentences('"Hello." She left. Fine.'), ['"Hello."', 'She left.', 'Fine.'])
  assert.deepEqual(splitSentences(''), [])
  assert.deepEqual(splitSentences('   '), [])
  assert.deepEqual(splitSentences(null), [])
})

test('splitSentences keeps abbreviations, initials and decimals together', () => {
  assert.deepEqual(splitSentences('Dr. Smith arrived at 9. He was late.'), ['Dr. Smith arrived at 9.', 'He was late.'])
  assert.deepEqual(splitSentences('Use e.g. this one. Then stop.'), ['Use e.g. this one.', 'Then stop.'])
  assert.deepEqual(splitSentences('J. K. Rowling wrote it. Yes.'), ['J. K. Rowling wrote it.', 'Yes.'])
  assert.deepEqual(splitSentences('Pi is 3.14 exactly. OK.'), ['Pi is 3.14 exactly.', 'OK.'])
})

test('transcriptUnits prefers segments and splits each into sentences', () => {
  const units = transcriptUnits({
    segments: [
      { start: 1500, speaker: '1', text: 'Hello there. How are you?' },
      { startMs: 4000, speaker: 0, text: '  Fine.  ' },
      { text: '   ', speaker: '2' },
    ],
    pages: [{ page: 1, lines: [{ text: 'ignored' }] }],
  })
  assert.deepEqual(units, [
    { text: 'Hello there.', startMs: 1500, speaker: '1' },
    { text: 'How are you?', startMs: 1500, speaker: '1' },
    { text: 'Fine.', startMs: 4000, speaker: '0' },
  ])
})

test('transcriptUnits falls back to PDF pages (joined lines, startMs 0)', () => {
  const units = transcriptUnits({
    pages: [
      { page: 1, lines: [{ text: 'The cat sat.' }, { text: 'It was happy.' }] },
      { lines: [{ text: 'No dots here' }] },
    ],
  })
  assert.deepEqual(units, [
    { text: 'The cat sat.', startMs: 0, speaker: '', page: 1 },
    { text: 'It was happy.', startMs: 0, speaker: '', page: 1 },
    { text: 'No dots here', startMs: 0, speaker: '', page: 2 },
  ])
  assert.deepEqual(transcriptUnits({}), [])
  assert.deepEqual(transcriptUnits(null), [])
})

test('buildCorpus maps documents to {file,title,units} and drops empty ones', () => {
  const corpus = buildCorpus([
    documentOf('pod.json', ' Podcast ', { segments: [{ start: 0, text: 'One.' }] }),
    documentOf('sub/notes.pdf.json', '', { pages: [{ page: 1, lines: [{ text: 'Two.' }] }] }),
    documentOf('empty.json', 'Empty', { segments: [] }),
  ])
  assert.equal(corpus.length, 2)
  assert.deepEqual(corpus[0], { file: 'pod.json', title: 'Podcast', units: [{ text: 'One.', startMs: 0, speaker: '' }] })
  assert.equal(corpus[1].file, 'sub/notes.pdf.json')
  assert.equal(corpus[1].title, 'notes.pdf')
  assert.equal(corpus[1].units[0].page, 1)
  assert.deepEqual(buildCorpus(null), [])
})

test('corpusSignature is order-independent and reacts to document metadata', () => {
  const documents = [
    documentOf('b.json', 'B', { createdAt: '2026-01-02', segments: [{ text: 'B one.' }] }),
    documentOf('a.json', 'A', { createdAt: '2026-01-01', segments: [{ text: 'A one.' }, { text: 'A two.' }] }),
  ]
  const signature = corpusSignature(documents)
  assert.match(signature, HEX)
  assert.equal(signature, corpusSignature([...documents].reverse()))
  assert.notEqual(signature, corpusSignature([documents[0]]))
  assert.notEqual(
    signature,
    corpusSignature([documentOf('b.json', 'B', { createdAt: '2026-02-01', segments: [{ text: 'B one.' }] }), documents[1]]),
  )
  assert.notEqual(
    signature,
    corpusSignature([documentOf('b.json', 'B', { createdAt: '2026-01-02', segments: [{ text: 'B one.' }, { text: 'B two.' }] }), documents[1]]),
  )
  assert.notEqual(
    signature,
    corpusSignature([documentOf('b.json', 'B', { createdAt: '2026-01-02', segments: [{ text: 'B one.' }], pages: [{ page: 1 }] }), documents[1]]),
  )
  assert.match(corpusSignature(undefined), HEX)
})

test('entryVariants includes the headword and family forms, deduped case-insensitively', () => {
  assert.deepEqual(
    entryVariants({ word: 'Run', family: [{ form: 'ran' }, { form: 'RUN' }, { form: 'running' }, { label: 'x' }, { form: '  ' }] }),
    ['Run', 'ran', 'running'],
  )
  const variants = entryVariants({ word: 'w', family: Array.from({ length: 20 }, (_value, index) => ({ form: 'f' + index })) })
  assert.equal(variants.length, 12)
  assert.equal(variants[0], 'w')
  assert.equal(variants[11], 'f10')
  assert.deepEqual(entryVariants(null), [])
})

test('countOccurrences matches case-insensitively on whole-word boundaries', () => {
  const variants = entryVariants({ word: 'run', family: [{ form: 'ran' }] })
  assert.equal(countOccurrences('Run! I ran. Running is fun; run.', variants), 3)
  assert.equal(countOccurrences('The cat sat; cat. Cattle concat catlike cat', ['cat']), 3)
  assert.equal(countOccurrences('An ice   cream, an ICE CREAM.', ['ice cream']), 2)
  assert.equal(countOccurrences('A catalog of cats.', ['cat']), 0)
  assert.equal(countOccurrences('x-ray and X-Ray.', ['x-ray']), 2)
  assert.equal(countOccurrences('nothing here', []), 0)
  assert.equal(countOccurrences(null, ['x']), 0)
})

test('analysisFingerprint tracks word, forms, sentence and corpus signature', () => {
  const entry = { word: 'Run', family: [{ form: 'ran' }], sentence: 'I run.' }
  const fingerprint = analysisFingerprint(entry, 'sig')
  assert.match(fingerprint, HEX)
  assert.equal(fingerprint, analysisFingerprint({ ...entry }, 'sig'))
  assert.notEqual(fingerprint, analysisFingerprint(entry, 'sig2'))
  assert.notEqual(fingerprint, analysisFingerprint({ ...entry, family: [{ form: 'running' }] }, 'sig'))
  assert.notEqual(fingerprint, analysisFingerprint({ ...entry, sentence: 'We ran.' }, 'sig'))
  assert.notEqual(fingerprint, analysisFingerprint({ ...entry, word: 'walk' }, 'sig'))
})

test('collectContexts seeds the entry sentence, dedupes and rotates documents', () => {
  const result = collectContexts(ENTRY, CORPUS, {})
  assert.deepEqual(result.contexts.map((context) => context.text), [
    'I run at dawn.',
    'I run fast.',
    'We run together.',
    'She ran home.',
    'They ran away.',
  ])
  assert.equal(result.occurrences, 5)
  assert.equal(result.transcripts, 3)
  assert.deepEqual(result.contexts[0], {
    text: 'I run at dawn.',
    title: 'Seed',
    speaker: '1',
    startMs: 5000,
    transcript: 'seed.json',
  })
  assert.equal(result.contexts[1].transcript, 'a.json')
  assert.equal(result.contexts[2].title, 'B')
})

test('collectContexts does not seed without entry.sentence and clamps maxContexts', () => {
  const corpus = [
    { file: 'a.json', title: 'A', units: Array.from({ length: 10 }, (_value, index) => ({ text: 'run a' + index + '.', startMs: index, speaker: '0' })) },
    { file: 'b.json', title: 'B', units: Array.from({ length: 10 }, (_value, index) => ({ text: 'run b' + index + '.', startMs: index, speaker: '1' })) },
  ]
  assert.equal(collectContexts({ word: 'run' }, corpus).contexts.length, 6)
  assert.equal(collectContexts({ word: 'run' }, corpus, { maxContexts: 0 }).contexts.length, 1)
  assert.equal(collectContexts({ word: 'run' }, corpus, { maxContexts: 99 }).contexts.length, 12)
  assert.equal(collectContexts({ word: 'run' }, corpus, { maxContexts: 'junk' }).contexts.length, 6)
  assert.deepEqual(collectContexts({ word: 'run' }, corpus, { maxContexts: 2 }).contexts.map((context) => context.text), ['run a0.', 'run b0.'])
})

test('collectContexts clips long sentences around the first occurrence', () => {
  const long = 'The quick brown fox jumps over the lazy dog again and again. '.repeat(3)
    + 'We run every morning before breakfast.'
    + ' and then continue'.repeat(8)
  const clipped = collectContexts({ word: 'run' }, [{ file: 'x.json', title: 'X', units: [{ text: long, startMs: 0, speaker: '0' }] }], { maxContexts: 1, maxContextChars: 40 }).contexts[0]
  assert.ok(clipped.text.length <= 40)
  assert.match(clipped.text, /run/)
  assert.ok(clipped.text.startsWith('…'))
  assert.ok(clipped.text.endsWith('…'))
  const short = collectContexts({ word: 'run' }, [{ file: 'y.json', title: 'Y', units: [{ text: 'I run.' }] }], { maxContextChars: 5 }).contexts[0]
  assert.equal(short.text, 'I run.')
  const huge = collectContexts({ word: 'run' }, [{ file: 'z.json', title: 'Z', units: [{ text: 'run ' + 'word '.repeat(1000) }] }], { maxContexts: 1, maxContextChars: 9999 }).contexts[0]
  assert.ok(huge.text.length <= 2000)
  assert.ok(huge.text.endsWith('…'))
})

test('buildSensePrompt numbers contexts with title/time and asks for strict JSON', () => {
  const prompt = buildSensePrompt(ENTRY, [
    { text: 'I run at dawn.', title: 'Seed', startMs: 5000, speaker: '1', transcript: 'seed.json' },
    { text: 'She ran home.', title: '', startMs: 0, speaker: '', transcript: 'a.json' },
  ])
  assert.match(prompt, /"run"/)
  assert.match(prompt, /n\. 跑步/)
  assert.match(prompt, /1\. \[Seed · 00:05\] I run at dawn\./)
  assert.match(prompt, /^2\. She ran home\.$/m)
  assert.match(prompt, /strict JSON/)
  assert.match(prompt, /no markdown fences/)
  assert.match(prompt, /"senses":\[\{"pos"/)
  assert.match(prompt, /1 to 8 senses/)
  assert.match(prompt, /must not be empty/)
  assert.match(prompt, /1-based/)
  const bare = buildSensePrompt({ word: 'walk' }, [{ text: 'I walk.' }])
  assert.doesNotMatch(bare, /Existing dictionary meanings/)
  assert.doesNotMatch(bare, /Word forms/)
  assert.match(bare, /1\. I walk\./)
})

test('senseCacheKey is deterministic, prefixed and context-sensitive', () => {
  const contexts = [{ text: 'I run.' }, { text: 'We run.' }]
  const key = senseCacheKey(ENTRY, contexts)
  assert.match(key, /^senses:[0-9a-f]{40}$/)
  assert.equal(key, senseCacheKey({ ...ENTRY }, [{ text: 'I run.' }, { text: 'We run.' }]))
  assert.notEqual(key, senseCacheKey(ENTRY, [{ text: 'We run.' }, { text: 'I run.' }]))
  assert.notEqual(key, senseCacheKey({ ...ENTRY, word: 'walk' }, contexts))
  assert.notEqual(key, senseCacheKey(ENTRY, contexts.slice(0, 1)))
})

test('normalizeSenseResult filters senses, contexts and duplicates', () => {
  const raw = {
    senses: [
      { pos: 'v.', zh: '跑', contexts: [2, 1, 1, 0, 9, 'x', 2.5] },
      { pos: 'V.', zh: ' 跑 ', contexts: [3] },
      { pos: 'n.', zh: '   ', contexts: [1] },
      { pos: 'n.', zh: '奔跑', contexts: [99] },
      { pos: 'adj.', zh: '用尽的', contexts: [4] },
      null,
      'junk',
    ],
  }
  assert.deepEqual(normalizeSenseResult(raw, 4), [
    { pos: 'v.', zh: '跑', contexts: [1, 2, 3] },
    { pos: 'adj.', zh: '用尽的', contexts: [4] },
  ])
  assert.deepEqual(normalizeSenseResult({}, 4), [])
  assert.deepEqual(normalizeSenseResult(null, 4), [])
  assert.deepEqual(normalizeSenseResult([{ pos: 'v.', zh: '跑', contexts: [1] }], 1), [{ pos: 'v.', zh: '跑', contexts: [1] }])
  assert.deepEqual(normalizeSenseResult({ senses: [{ pos: 'v.', zh: '跑', contexts: [1] }] }, 0), [])
  const many = Array.from({ length: 12 }, (_value, index) => ({ pos: 'n.', zh: '义' + index, contexts: [1] }))
  assert.equal(normalizeSenseResult({ senses: many }, 1).length, 8)
})

test('mergeSenses preserves existing meanings, adds evidence and appends new senses', () => {
  const entry = {
    word: 'run',
    meanings: [
      { pos: 'n.', zh: '跑步', example: 'An old example.' },
      { pos: 'v.', zh: '跑' },
    ],
  }
  const contexts = [
    { text: 'I run fast.', title: 'A', speaker: '0', startMs: 1000, transcript: 'a.json' },
    { text: 'We run together.', title: 'B', speaker: '1', startMs: 2000, transcript: 'b.json' },
  ]
  const senses = [
    { pos: 'v.', zh: '跑', contexts: [1] },
    { pos: 'n.', zh: '跑步', contexts: [2] },
    { pos: 'v.', zh: '经营', contexts: [2] },
  ]
  const merged = mergeSenses(entry, senses, contexts)
  assert.equal(merged.added, 1)
  assert.equal(merged.total, 3)
  assert.deepEqual(merged.meanings[0], {
    pos: 'n.',
    zh: '跑步',
    example: 'An old example.',
    source: { transcript: 'b.json', title: 'B', speaker: '1', startMs: 2000 },
  })
  assert.deepEqual(merged.meanings[1], {
    pos: 'v.',
    zh: '跑',
    example: 'I run fast.',
    source: { transcript: 'a.json', title: 'A', speaker: '0', startMs: 1000 },
  })
  assert.deepEqual(merged.meanings[2], {
    pos: 'v.',
    zh: '经营',
    example: 'We run together.',
    source: { transcript: 'b.json', title: 'B', speaker: '1', startMs: 2000 },
  })
  // the input entry is never mutated
  assert.deepEqual(entry.meanings[1], { pos: 'v.', zh: '跑' })
})

test('mergeSenses is idempotent and caps the meaning list at 8', () => {
  const entry = { word: 'run', meanings: [{ pos: 'n.', zh: '跑步' }] }
  const contexts = [{ text: 'I run.', title: 'A', speaker: '0', startMs: 1000, transcript: 'a.json' }]
  const senses = [{ pos: 'v.', zh: '跑', contexts: [1] }]
  const first = mergeSenses(entry, senses, contexts)
  assert.equal(first.added, 1)
  const second = mergeSenses({ ...entry, meanings: first.meanings }, senses, contexts)
  assert.equal(second.added, 0)
  assert.equal(second.total, 2)
  assert.deepEqual(second.meanings, first.meanings)
  const full = { word: 'run', meanings: Array.from({ length: 8 }, (_value, index) => ({ pos: 'n.', zh: '义' + index })) }
  const capped = mergeSenses(full, [{ pos: 'v.', zh: '跑', contexts: [1] }], contexts)
  assert.equal(capped.added, 0)
  assert.equal(capped.total, 8)
  const noEvidence = mergeSenses({ word: 'run', meanings: [] }, [{ pos: 'v.', zh: '跑', contexts: [7] }], contexts)
  assert.deepEqual(noEvidence.meanings, [{ pos: 'v.', zh: '跑' }])
})

test('mergeSenses folds a near-duplicate sense instead of appending it', () => {
  const contexts = [
    { text: 'Police intervened at noon.', title: 'A', speaker: '0', startMs: 1000, transcript: 'a.json' },
  ]
  const entry = {
    word: 'intervene',
    meanings: [
      { pos: 'v.', zh: '介入；干预；调停' },
      { pos: 'n.', zh: '干预；介入' },
    ],
  }
  const merged = mergeSenses(entry, [{ pos: 'v.', zh: '介入；干预', contexts: [1] }], contexts)
  assert.equal(merged.added, 0)
  assert.equal(merged.total, 1)
  assert.equal(merged.meanings[0].zh, '介入；干预；调停')
  assert.equal(merged.meanings[0].example, 'Police intervened at noon.')
  // The input entry is never mutated.
  assert.equal(entry.meanings.length, 2)
  // Folding is idempotent.
  const again = mergeSenses({ ...entry, meanings: merged.meanings }, [{ pos: 'v.', zh: '介入；干预', contexts: [1] }], contexts)
  assert.equal(again.added, 0)
  assert.deepEqual(again.meanings, merged.meanings)
})

test('mergeSenses folds stale duplicate meanings even without new senses', () => {
  const entry = {
    word: 'affair',
    meanings: [
      { pos: 'n.', zh: '风流韵事；婚外情' },
      { pos: 'n.', zh: '婚外情；风流韵事', example: 'Their affair was brief.' },
    ],
  }
  const merged = mergeSenses(entry, [], [])
  assert.equal(merged.added, 0)
  assert.equal(merged.total, 1)
  assert.equal(merged.meanings[0].zh, '风流韵事；婚外情')
  assert.equal(merged.meanings[0].example, 'Their affair was brief.')
})

test('the pure pipeline composes: corpus -> contexts -> prompt -> normalize -> merge', () => {
  const documents = [
    documentOf('a.json', 'Podcast A', {
      createdAt: '2026-01-01',
      segments: [
        { start: 65000, speaker: '0', text: 'The bank raised its rates. We run a small business.' },
        { start: 72000, speaker: '1', text: 'I run every day.' },
      ],
    }),
    documentOf('b.pdf.json', 'Lecture', {
      createdAt: '2026-01-02',
      pages: [{ page: 1, lines: [{ text: 'Bank of the river.' }, { text: 'They ran away.' }] }],
    }),
  ]
  const entry = { word: 'run', family: [{ form: 'ran' }], meanings: [{ pos: 'v.', zh: '跑' }] }
  const corpus = buildCorpus(documents)
  assert.equal(corpus.length, 2)
  const signature = corpusSignature(documents)
  assert.match(analysisFingerprint(entry, signature), HEX)
  const collected = collectContexts(entry, corpus, { maxContexts: 6, maxContextChars: 240 })
  assert.equal(collected.occurrences, 3)
  assert.equal(collected.transcripts, 2)
  assert.deepEqual(collected.contexts.map((context) => context.text), [
    'We run a small business.',
    'They ran away.',
    'I run every day.',
  ])
  const prompt = buildSensePrompt(entry, collected)
  assert.match(prompt, /"run"/)
  assert.match(prompt, /3\. \[Podcast A · 01:12\] I run every day\./)
  const raw = { senses: [{ pos: 'v.', zh: '跑', contexts: [1, 2, 3] }, { pos: 'n.', zh: '银行', contexts: [] }] }
  const senses = normalizeSenseResult(raw, collected.contexts.length)
  assert.equal(senses.length, 1)
  const merged = mergeSenses(entry, senses, collected)
  assert.equal(merged.added, 0)
  assert.equal(merged.total, 1)
  assert.equal(merged.meanings[0].example, 'We run a small business.')
  assert.deepEqual(merged.meanings[0].source, { transcript: 'a.json', title: 'Podcast A', speaker: '0', startMs: 65000 })
  assert.match(senseCacheKey(entry, collected), /^senses:[0-9a-f]{40}$/)
})
