/**
 * Host tests for the graph (图谱) module: the pure builder, its matching rules,
 * the caps and the read-only service.
 *
 * Zero dependencies: node:test + node:assert/strict; the service test uses a
 * temp workspace and a stub vocab / recall so no model, no network and no DSH
 * process are needed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AFFIX_STOPLIST,
  GRAPH_VERSION,
  MAX_APPEARS_PER_WORD,
  MAX_COOCCUR_PER_WORD,
  MAX_DOCUMENTS,
  MAX_ENTRIES_PER_UNIT,
  MAX_LINKS,
  MAX_PAIRS,
  MAX_SAMPLE_CHARS,
  MAX_SCAN_CHARS,
  MAX_WORDS,
  buildGraph,
  createGraphService,
  fileNameOf,
  normalizePart,
  sameFileName,
  senseAtoms,
  tokenize,
} from '../host/graph.js'
import { createWorkspaceStore } from '../host/json-store.js'

/** A wordbook word entry with sensible defaults (only the fields the graph reads matter). */
function wordEntry(id, word, extra = {}) {
  return {
    id,
    kind: 'word',
    word,
    normalized: word.toLowerCase(),
    ipa: '/' + word + '/',
    meanings: [{ pos: 'n.', zh: word + ' 的中文' }],
    family: [],
    status: 'done',
    ...extra,
  }
}

/** One transcript document built from segment texts (each segment may hold several sentences). */
function transcript(file, texts, extra = {}) {
  return {
    file,
    title: extra.title ?? file.replace(/\.json$/i, ''),
    document: {
      version: 1,
      segments: texts.map((text, index) => ({ start: index * 1000, end: index * 1000 + 900, speaker: '0', text })),
      durationMs: texts.length * 1000,
      speakers: [{ id: '0', label: 'Speaker 1' }],
      ...extra.document,
    },
  }
}

function linksOf(graph, kind) {
  return graph.links.filter((link) => link.kind === kind)
}

function nodeOf(graph, id) {
  return graph.nodes.find((node) => node.id === id)
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'english-graph-'))
  t.after(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

// ── 1. Empty input ────────────────────────────────────────────────────────

test('empty input returns the frozen empty payload', () => {
  const graph = buildGraph()
  assert.equal(graph.version, GRAPH_VERSION)
  assert.deepEqual(graph.summary, {
    words: 0,
    transcripts: 0,
    linkedWords: 0,
    linkedTranscripts: 0,
    isolatedWords: 0,
    links: { appears: 0, cooccur: 0, morph: 0, sense: 0, total: 0 },
    truncated: { words: 0, transcripts: 0 },
  })
  assert.deepEqual(graph.nodes, [])
  assert.deepEqual(graph.links, [])
  assert.deepEqual(Object.keys(buildGraph({ words: 'nope', documents: 'nope', states: 'nope' })).sort(), ['links', 'nodes', 'summary', 'version'])
})

// ── 2. Basic transcript <-> word edges ────────────────────────────────────

test('appears edges, origin flag, node kinds and stable order', () => {
  const words = [
    wordEntry('w-decision', 'decision'),
    wordEntry('w-decide', 'decide', {
      source: { transcript: 'podcast.json', title: 'Podcast', speaker: '0', startMs: 1200 },
      sentence: 'We had to decide quickly.',
    }),
  ]
  const documents = [
    transcript('podcast.json', ['We had to decide quickly.', 'The decision was hard.'], { title: 'Podcast' }),
    transcript('paper.json', ['The decision was made.']),
  ]
  const graph = buildGraph({ words, documents, states: { 'w-decide': { mastery: 3 } } })

  assert.equal(graph.summary.words, 2)
  assert.equal(graph.summary.transcripts, 2)
  const appears = linksOf(graph, 'appears')
  assert.equal(appears.length, 3)
  const decideOrigin = appears.find((link) => link.target === 'w:w-decide')
  assert.equal(decideOrigin.source, 't:podcast.json')
  assert.equal(decideOrigin.count, 1)
  assert.equal(decideOrigin.origin, true)
  assert.equal(decideOrigin.sample.startMs, 1200)
  assert.equal(decideOrigin.sample.transcript, 'podcast.json')
  assert.equal(decideOrigin.sample.title, 'Podcast')
  const decisionInPodcast = appears.find((link) => link.target === 'w:w-decision' && link.source === 't:podcast.json')
  assert.equal(decisionInPodcast.count, 1)
  assert.equal(decisionInPodcast.origin, false)
  assert.equal(decisionInPodcast.sample, undefined)
  const decisionInPaper = appears.find((link) => link.target === 'w:w-decision' && link.source === 't:paper.json')
  assert.equal(decisionInPaper.count, 1)

  // Word nodes come first (alphabetical), transcript nodes after (by file).
  assert.deepEqual(graph.nodes.map((node) => node.id), [
    'w:w-decide', 'w:w-decision', 't:paper.json', 't:podcast.json',
  ])
  assert.equal(nodeOf(graph, 'w:w-decide').mastery, 3)
  assert.equal(nodeOf(graph, 'w:w-decision').mastery, 0)
  assert.equal(nodeOf(graph, 'w:w-decide').degree, 1)
  assert.equal(nodeOf(graph, 't:podcast.json').matchedWords, 2)
  assert.equal(nodeOf(graph, 't:podcast.json').segments, 2)
  assert.equal(nodeOf(graph, 't:podcast.json').durationMs, 2000)
  assert.equal(nodeOf(graph, 't:podcast.json').speakers, 1)

  // Every link id starts with its kind and points at existing nodes.
  const ids = new Set(graph.nodes.map((node) => node.id))
  for (const link of graph.links) {
    assert.ok(link.id.startsWith(link.kind + ':'))
    assert.ok(ids.has(link.source), 'missing source node: ' + link.source)
    assert.ok(ids.has(link.target), 'missing target node: ' + link.target)
  }
})

test('node and link field sets are the frozen contract', () => {
  const graph = buildGraph({
    words: [wordEntry('a', 'alpha'), wordEntry('b', 'beta', { etymology: { language: 'Latin', parts: [{ part: 'beta', meaning: 'x' }] } })],
    documents: [transcript('one.json', ['Alpha beta together.'])],
  })
  const word = graph.nodes.find((node) => node.kind === 'word')
  assert.deepEqual(Object.keys(word).sort(), [
    'degree', 'entryId', 'id', 'ipa', 'kind', 'mastery', 'meanings', 'sentence', 'word',
  ])
  const doc = graph.nodes.find((node) => node.kind === 'transcript')
  assert.deepEqual(Object.keys(doc).sort(), [
    'degree', 'durationMs', 'file', 'id', 'kind', 'matchedWords', 'segments', 'speakers', 'title',
  ])
  const appears = linksOf(graph, 'appears')[0]
  assert.deepEqual(Object.keys(appears).sort(), ['count', 'id', 'kind', 'origin', 'source', 'target'])
  const cooccur = linksOf(graph, 'cooccur')[0]
  assert.deepEqual(Object.keys(cooccur).sort(), ['docs', 'id', 'kind', 'sentences', 'source', 'target'])
})

// ── 3. Whole-token matching ───────────────────────────────────────────────

test('whole-token matching: boundaries, case, apostrophes, hyphens, phrases', () => {
  const words = [
    wordEntry('cat', 'cat'),
    wordEntry('dont', "don't"),
    wordEntry('well', 'well-known'),
    wordEntry('look', 'look forward to'),
  ]
  const documents = [
    transcript('a.json', ['The cattle and concat are not cats.', 'Cat.', 'I don’t care.', 'A well known fact.', 'We look forward to it.']),
  ]
  const graph = buildGraph({ words, documents })
  const countOf = (id) => linksOf(graph, 'appears').find((link) => link.target === 'w:' + id)?.count ?? 0
  assert.equal(countOf('cat'), 1, 'only the standalone "Cat." counts')
  assert.equal(countOf('dont'), 1)
  assert.equal(countOf('well'), 1)
  assert.equal(countOf('look'), 1)
})

test('family forms count as an occurrence of the headword', () => {
  const words = [wordEntry('d', 'decide', { family: [{ label: '名词', form: 'decision' }] })]
  const graph = buildGraph({ words, documents: [transcript('a.json', ['The decision was hard.'])] })
  const link = linksOf(graph, 'appears')[0]
  assert.equal(link.count, 1)
  assert.equal(link.target, 'w:d')
})

test('appears count is a whole-token occurrence count, not a sentence count', () => {
  const words = [wordEntry('a', 'alpha')]
  const documents = [transcript('one.json', ['Alpha alpha, alpha!', 'Alpha again.'])]
  const graph = buildGraph({ words, documents })
  const link = linksOf(graph, 'appears')[0]
  assert.equal(link.count, 4)
  assert.equal(nodeOf(graph, 't:one.json').matchedWords, 1)
})

// ── 4. Origin ─────────────────────────────────────────────────────────────

test('origin matches file names and absolute paths and survives a zero count', () => {
  const words = [
    wordEntry('abs', 'alpha', { source: { transcript: 'C:\\podcasts\\episode.json', startMs: 0 }, sentence: 'Alpha here, nothing else.' }),
    wordEntry('zero', 'zeta', { source: { transcript: 'episode.json' }, sentence: 'Zeta is not in the text.' }),
    wordEntry('gone', 'omega', { source: { transcript: 'deleted.json' } }),
  ]
  const documents = [transcript('episode.json', ['Alpha here, nothing else.'])]
  const graph = buildGraph({ words, documents })
  const alpha = linksOf(graph, 'appears').find((link) => link.target === 'w:abs')
  assert.equal(alpha.origin, true)
  assert.equal(alpha.count, 1)
  // The origin document is in the workspace but the word was edited out: keep the edge.
  const zeta = linksOf(graph, 'appears').find((link) => link.target === 'w:zero')
  assert.ok(zeta, 'origin edge must be kept even with count 0')
  assert.equal(zeta.count, 0)
  assert.equal(zeta.origin, true)
  assert.equal(zeta.sample.text, 'Zeta is not in the text.')
  // A deleted origin transcript cannot become an edge.
  assert.equal(linksOf(graph, 'appears').some((link) => link.target === 'w:gone'), false)
  assert.equal(linksOf(graph, 'appears').length, 2)
  assert.equal(alpha.count, 1)
  assert.equal(linksOf(graph, 'appears').find((link) => link.target === 'w:abs').sample.transcript, 'episode.json')
})

test('long node sentences and origin samples are clipped with an ellipsis', () => {
  const long = 'alpha '.repeat(100).trim()
  const words = [wordEntry('a', 'alpha', { sentence: long, source: { transcript: 'a.json' } })]
  const documents = [transcript('a.json', [long])]
  const graph = buildGraph({ words, documents })
  const node = nodeOf(graph, 'w:a')
  assert.ok(node.sentence.length <= MAX_SAMPLE_CHARS + 1)
  assert.ok(node.sentence.endsWith('…'))
  const link = linksOf(graph, 'appears')[0]
  assert.ok(link.sample.text.length <= MAX_SAMPLE_CHARS + 1)
  assert.ok(link.sample.text.endsWith('…'))
})

test('file name comparison ignores directories and case', () => {
  assert.equal(fileNameOf('C:\\a\\b\\X.JSON'), 'X.JSON')
  assert.equal(fileNameOf('a/b/x.json'), 'x.json')
  assert.equal(fileNameOf('   '), '')
  assert.equal(sameFileName('C:\\a\\Ep.json', 'c:/z/ep.json'), true)
  assert.equal(sameFileName('one.json', 'two.json'), false)
  assert.equal(sameFileName('', ''), false)
})

// ── 5. Co-occurrence ─────────────────────────────────────────────────────

test('cooccur links only same-sentence words and counts documents', () => {
  const words = [wordEntry('a', 'alpha'), wordEntry('b', 'beta'), wordEntry('g', 'gamma')]
  const documents = [
    transcript('one.json', ['Alpha and beta share this sentence.', 'Gamma sits alone.', 'Alpha and beta again.']),
    transcript('two.json', ['Alpha and beta in another transcript.']),
  ]
  const graph = buildGraph({ words, documents })
  const cooccur = linksOf(graph, 'cooccur')
  assert.equal(cooccur.length, 1)
  const [link] = cooccur
  assert.equal(link.source, 'w:a')
  assert.equal(link.target, 'w:b')
  assert.equal(link.sentences, 3)
  assert.equal(link.docs, 2)
})

test('cooccur degree cap is per word and deterministic', () => {
  const words = ['w0', 'w1', 'w2', 'w3', 'w4'].map((id) => wordEntry(id, id))
  const documents = [transcript('one.json', ['w0 w1 w2 w3 w4 together.'])]
  const graph = buildGraph({ words, documents, options: { maxCooccurPerWord: 2 } })
  const degree = new Map()
  for (const link of linksOf(graph, 'cooccur')) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
  }
  for (const id of ['w:w0', 'w:w1', 'w:w2', 'w:w3', 'w:w4']) {
    assert.ok((degree.get(id) ?? 0) <= 2, id + ' exceeds the cooccur cap')
  }
  assert.equal(linksOf(graph, 'cooccur').length, 4)
  const again = buildGraph({ words, documents, options: { maxCooccurPerWord: 2 } })
  assert.deepEqual(again, graph)
})

test('a sentence with more than MAX_ENTRIES_PER_UNIT words does not explode pairs', () => {
  const words = Array.from({ length: 40 }, (_, index) => wordEntry('w' + String(index).padStart(2, '0'), 'w' + String(index).padStart(2, '0')))
  const text = words.map((entry) => entry.word).join(' ') + '.'
  const graph = buildGraph({ words, documents: [transcript('one.json', [text])] })
  assert.equal(linksOf(graph, 'cooccur').length, 0)
  assert.equal(linksOf(graph, 'appears').length, 40)
})

// ── 6. Morphology ────────────────────────────────────────────────────────

test('word-family links normalize hyphens and spaces like the matcher', () => {
  const words = [wordEntry('a', 'well-known'), wordEntry('b', 'well known')]
  const graph = buildGraph({ words })
  const morph = linksOf(graph, 'morph')
  assert.equal(morph.length, 1)
  assert.equal(morph[0].reason, 'family')
  assert.equal(morph[0].detail, 'well known')
})

test('morph links need a long, meaningful shared root', () => {
  const words = [
    wordEntry('allegations', 'allegations', { etymology: { language: 'Latin', parts: [{ part: 'ad-' }, { part: 'legare' }] } }),
    wordEntry('alleged', 'alleged', { etymology: { language: 'Latin', parts: [{ part: 'ad-' }, { part: 'legare' }, { part: '-ed' }] } }),
    wordEntry('intervene', 'intervene', { etymology: { parts: [{ part: 'inter-' }, { part: 'venire' }] } }),
    wordEntry('internal', 'internal', { etymology: { parts: [{ part: 'inter-' }] } }),
    wordEntry('act', 'act', { etymology: { parts: [{ part: 'act' }] } }),
    wordEntry('acted', 'acted', { etymology: { parts: [{ part: 'act' }] } }),
  ]
  const graph = buildGraph({ words })
  const morph = linksOf(graph, 'morph')
  assert.equal(morph.length, 1, 'only legare is a real root link')
  const [link] = morph
  assert.equal(link.reason, 'root')
  assert.equal(link.detail, 'legare')
  assert.equal(link.source, 'w:allegations')
  assert.equal(link.target, 'w:alleged')
  // "ad" / "inter" / "act" are either in the stoplist or too short.
  assert.ok(AFFIX_STOPLIST.has('inter'))
  assert.equal(normalizePart('-Ed'), 'ed')
  assert.equal(normalizePart('  '), '')
})

test('morph links a shared word form and prefers family over root', () => {
  const words = [
    wordEntry('decide', 'decide', { family: [{ label: 'n.', form: 'decision' }], etymology: { parts: [{ part: 'decidere' }] } }),
    wordEntry('decision', 'decision', { etymology: { parts: [{ part: 'decidere' }] } }),
    wordEntry('other', 'other', { family: [{ label: 'n.', form: 'decision' }] }),
  ]
  const graph = buildGraph({ words })
  const pairs = linksOf(graph, 'morph').map((link) => link.source + '|' + link.target + '|' + link.reason + '|' + link.detail)
  assert.ok(pairs.includes('w:decide|w:other|family|decision'))
  // decide <-> decision shares a root AND the form "decision": family wins, one edge only.
  assert.ok(pairs.includes('w:decide|w:decision|family|decision'))
  assert.ok(pairs.includes('w:decision|w:other|family|decision'))
  assert.equal(linksOf(graph, 'morph').length, 3)
  for (const link of linksOf(graph, 'morph')) assert.equal(link.reason, 'family')
})

// ── 7. Sense ─────────────────────────────────────────────────────────────

test('word nodes fold duplicate meanings like the wordbook', () => {
  const words = [wordEntry('a', 'affair', {
    meanings: [
      { pos: 'n.', zh: '风流韵事；婚外情' },
      { pos: 'n.', zh: '婚外情；风流韵事', example: 'Their affair was brief.' },
    ],
  })]
  const graph = buildGraph({ words })
  assert.deepEqual(nodeOf(graph, 'w:a').meanings, [{ pos: 'n.', zh: '风流韵事；婚外情' }])
})

test('sense links share a Chinese meaning fragment', () => {
  const words = [
    wordEntry('a', 'decide', { meanings: [{ pos: 'v.', zh: '决定；裁决' }] }),
    wordEntry('b', 'determine', { meanings: [{ pos: 'v.', zh: '确定；决定' }] }),
    wordEntry('c', 'tiny', { meanings: [{ pos: 'adj.', zh: '小的' }] }),
    wordEntry('d', 'small', { meanings: [{ pos: 'adj.', zh: '小的' }] }),
    wordEntry('e', 'single', { meanings: [{ pos: 'adj.', zh: '单' }] }),
    wordEntry('f', 'only', { meanings: [{ pos: 'adj.', zh: '单' }] }),
    wordEntry('g', 'affair', { meanings: [{ pos: 'n.', zh: '风流韵事；婚外情' }] }),
    wordEntry('h', 'fling', { meanings: [{ pos: 'n.', zh: '婚外情；风流韵事' }] }),
  ]
  const graph = buildGraph({ words })
  const sense = linksOf(graph, 'sense')
  const detailOf = (source, target) => sense.find((link) => (link.source === source && link.target === target) || (link.source === target && link.target === source))?.detail
  assert.equal(detailOf('w:a', 'w:b'), '决定')
  assert.equal(detailOf('w:c', 'w:d'), '小的')
  assert.equal(detailOf('w:g', 'w:h'), '婚外情', 'the smallest fragment wins deterministically')
  assert.equal(detailOf('w:e', 'w:f'), undefined, 'single characters never link')
  assert.deepEqual(senseAtoms('傲慢；自大，狂妄/other'), ['傲慢', '自大', '狂妄', 'other'])
  assert.deepEqual(senseAtoms(' ；; '), [])
})

// ── 8. Caps and truncation ───────────────────────────────────────────────

test('word and document caps truncate deterministically and are reported', () => {
  const words = [
    wordEntry('a', 'alpha'),
    wordEntry('b', 'beta'),
    wordEntry('c', 'gamma'),
  ]
  const documents = [
    transcript('one.json', ['Alpha beta.']),
    transcript('two.json', ['Alpha beta.']),
    transcript('three.json', ['Gamma only.']),
  ]
  const graph = buildGraph({ words, documents, options: { maxWords: 2, maxDocuments: 2 } })
  assert.equal(graph.summary.words, 2)
  assert.equal(graph.summary.truncated.words, 1)
  assert.equal(graph.summary.transcripts, 2)
  assert.equal(graph.summary.truncated.transcripts, 1)
  // alpha and beta are connected to two documents; gamma only to one.
  assert.deepEqual(graph.nodes.filter((node) => node.kind === 'word').map((node) => node.word), ['alpha', 'beta'])
})

test('the scan character budget stops after the first document', () => {
  const words = [wordEntry('a', 'alpha')]
  const documents = [
    transcript('one.json', ['Alpha one.']),
    transcript('two.json', ['Alpha two.']),
  ]
  const graph = buildGraph({ words, documents, options: { maxScanChars: 1 } })
  assert.equal(graph.summary.transcripts, 1)
  assert.equal(graph.summary.truncated.transcripts, 1)
  assert.equal(linksOf(graph, 'appears').length, 1)
  assert.equal(linksOf(graph, 'appears')[0].source, 't:one.json')
})

test('the graph caps are the frozen contract', () => {
  assert.equal(MAX_WORDS, 400)
  assert.equal(MAX_DOCUMENTS, 80)
  assert.equal(MAX_SCAN_CHARS, 2000000)
  assert.equal(MAX_APPEARS_PER_WORD, 12)
  assert.equal(MAX_COOCCUR_PER_WORD, 8)
  assert.equal(MAX_ENTRIES_PER_UNIT, 30)
  assert.equal(MAX_PAIRS, 200000)
  assert.equal(MAX_LINKS, 8000)
})

test('appears edges cap includes the mandatory origin edge', () => {
  const words = [wordEntry('a', 'alpha', { source: { transcript: 'd0.json' } })]
  const documents = Array.from({ length: 6 }, (_, index) => transcript('d' + index + '.json', ['Alpha here.']))
  const graph = buildGraph({ words, documents, options: { maxAppearsPerWord: 3 } })
  const appears = linksOf(graph, 'appears')
  assert.equal(appears.length, 3)
  assert.equal(appears.filter((link) => link.origin).length, 1)
  assert.equal(appears.filter((link) => !link.origin).length, 2)
  // A hard zero cap still keeps the one source edge.
  const zero = buildGraph({ words, documents, options: { maxAppearsPerWord: 0 } })
  assert.equal(linksOf(zero, 'appears').length, 1)
  assert.equal(linksOf(zero, 'appears')[0].origin, true)
})

test('documentsTruncated is added to the builder truncation', () => {
  const words = [wordEntry('a', 'alpha')]
  const documents = ['one.json', 'two.json', 'three.json'].map((file) => transcript(file, ['Alpha.']))
  const graph = buildGraph({ words, documents, documentsTruncated: 5, options: { maxDocuments: 2 } })
  assert.equal(graph.summary.transcripts, 2)
  assert.equal(graph.summary.truncated.transcripts, 6)
})

// ── 9. Isolation, determinism, immutability ──────────────────────────────

test('words that never occur stay as isolated nodes', () => {
  const words = [wordEntry('a', 'alpha'), wordEntry('b', 'never')]
  const graph = buildGraph({ words, documents: [transcript('one.json', ['Alpha only.'])] })
  assert.equal(graph.summary.isolatedWords, 1)
  const lonely = nodeOf(graph, 'w:b')
  assert.equal(lonely.degree, 0)
  assert.equal(graph.nodes.filter((node) => node.kind === 'transcript').length, 1)
})

test('buildGraph is deterministic and never mutates its input', () => {
  const words = deepFreeze([
    wordEntry('a', 'alpha', { meanings: [{ pos: 'v.', zh: '甲；乙' }], family: [{ label: 'n.', form: 'alphas' }] }),
    wordEntry('b', 'beta', { meanings: [{ pos: 'v.', zh: '乙' }] }),
  ])
  const documents = deepFreeze([
    transcript('one.json', ['Alpha and beta and the alphas.']),
    transcript('two.json', ['Beta alone.']),
  ])
  const states = deepFreeze({ a: { mastery: 2 }, b: { mastery: 5 } })
  const first = buildGraph({ words, documents, states })
  const second = buildGraph({ words, documents, states })
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.equal(first.summary.links.total, first.links.length)
  assert.equal(nodeOf(first, 'w:a').mastery, 2)
  assert.equal(nodeOf(first, 'w:b').mastery, 5)
})

test('tokenize and helpers normalize punctuation', () => {
  assert.deepEqual(tokenize("Don’t stop, well-known!"), ["don't", 'stop', 'well', 'known'])
  assert.deepEqual(tokenize(''), [])
  assert.deepEqual(tokenize(null), [])
})

// ── 10. Service ──────────────────────────────────────────────────────────

test('createGraphService loads transcripts, tolerates a broken recall file and stamps generatedAt', async (t) => {
  const root = await tempDir(t)
  await mkdir(join(root, 'transcripts'), { recursive: true })
  await writeFile(join(root, 'transcripts', 'one.json'), JSON.stringify({
    version: 1,
    createdAt: '2026-11-12T00:00:00.000Z',
    durationMs: 1000,
    speakers: [{ id: '0' }],
    segments: [{ start: 0, end: 900, speaker: '0', text: 'Alpha beta in one sentence.' }],
  }), 'utf8')
  await writeFile(join(root, 'transcripts', 'bad.json'), '{ not json', 'utf8')
  const store = createWorkspaceStore()
  const vocab = { read: async () => ({ version: 1, words: [wordEntry('a', 'alpha'), wordEntry('b', 'beta')] }) }
  const recall = { read: async () => { throw new Error('broken progress') } }
  const service = createGraphService({ store, vocab, recall, now: () => new Date('2026-11-12T12:00:00.000Z') })
  const graph = await service.overview(root, { dirs: { transcripts: 'transcripts' } })
  assert.equal(graph.generatedAt, '2026-11-12T12:00:00.000Z')
  assert.equal(graph.version, GRAPH_VERSION)
  assert.equal(graph.summary.transcripts, 1)
  assert.equal(graph.summary.links.appears, 2)
  assert.equal(nodeOf(graph, 'w:a').mastery, 0)
  // The corrupt file is backed up by the store and skipped, never fatal.
  assert.equal(graph.nodes.filter((node) => node.kind === 'transcript').length, 1)
})

test('createGraphService reports transcripts skipped by the directory cap', async (t) => {
  const root = await tempDir(t)
  await mkdir(join(root, 'transcripts'), { recursive: true })
  for (let index = 0; index <= MAX_DOCUMENTS; index += 1) {
    const file = 't' + String(index).padStart(3, '0') + '.json'
    await writeFile(join(root, 'transcripts', file), JSON.stringify({
      version: 1,
      segments: [{ start: 0, end: 1, speaker: '0', text: 'Alpha.' }],
    }), 'utf8')
  }
  const service = createGraphService({
    store: createWorkspaceStore(),
    vocab: { read: async () => ({ version: 1, words: [wordEntry('a', 'alpha')] }) },
    recall: { read: async () => ({ words: {} }) },
    now: () => new Date('2026-11-12T12:00:00.000Z'),
  })
  const graph = await service.overview(root, { dirs: { transcripts: 'transcripts' } })
  assert.equal(graph.summary.transcripts, MAX_DOCUMENTS)
  assert.equal(graph.summary.truncated.transcripts, 1)
})

test('createGraphService returns an empty graph when the transcripts directory is missing', async (t) => {
  const root = await tempDir(t)
  const store = createWorkspaceStore()
  const service = createGraphService({
    store,
    vocab: { read: async () => ({ version: 1, words: [wordEntry('a', 'alpha')] }) },
    recall: { read: async () => ({ words: {} }) },
    now: () => new Date('2026-11-12T12:00:00.000Z'),
  })
  const graph = await service.overview(root, { dirs: { transcripts: 'transcripts' } })
  assert.equal(graph.summary.words, 1)
  assert.equal(graph.summary.transcripts, 0)
  assert.equal(graph.summary.links.total, 0)
})
