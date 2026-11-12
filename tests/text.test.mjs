import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collapseMeanings,
  decodeXmlEntities,
  formatClock,
  meaningAtoms,
  mergeMeaningPair,
  mergeSegments,
  paragraphsFromText,
  stripHtml,
  stripMarkdown,
  stripTex,
} from '../host/text.js'

test('stripHtml removes scripts/styles and decodes entities', () => {
  const html = '<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><p>Hello&nbsp;world &amp; goodbye</p><p>Second<br>line</p></body></html>'
  const text = stripHtml(html)
  assert.match(text, /Hello world & goodbye/)
  assert.match(text, /Second\s+line/)
  assert.doesNotMatch(text, /alert/)
  assert.doesNotMatch(text, /color:red/)
  assert.equal(stripHtml('&lt;tag&gt; &quot;q&quot; &#39;s&#39; &#65;'), '<tag> "q" \'s\' A')
})

test('stripMarkdown keeps prose and drops syntax', () => {
  const markdown = '# Title\n\n> quote\n\n- item\n\n**bold** and *italic* and \`code\`\n\n[link](https://example.com) ![alt](img.png)\n\n\`\`\`js\nconst x = 1\n\`\`\`\n\n---'
  const text = stripMarkdown(markdown)
  assert.doesNotMatch(text, /^#/m)
  assert.doesNotMatch(text, /\`\`\`/)
  assert.match(text, /Title/)
  assert.match(text, /bold and italic and code/)
  assert.match(text, /link alt/)
  assert.match(text, /const x = 1/)
})

test('stripTex removes preamble and converts math/symbols', () => {
  const tex = '\\documentclass{article}\n\\begin{document}\nHello $x^2$ world and \\frac{a}{b} plus \\alpha.\n% comment\n\\begin{equation}\nE = mc^2\n\\end{equation}\n\\end{document}'
  const text = stripTex(tex)
  assert.doesNotMatch(text, /documentclass/)
  assert.doesNotMatch(text, /begin\{/)
  assert.match(text, /Hello \$x\^2\$ world/)
  assert.match(text, /\(a\)\/\(b\)/)
  assert.match(text, /α/)
  assert.match(text, /\$\$E = mc\^2\$\$/)
  assert.doesNotMatch(text, /comment/)
})

test('decodeXmlEntities handles named and numeric entities', () => {
  assert.equal(decodeXmlEntities('&lt;a&gt; &amp; &#65; &quot;q&quot; &apos;s&apos;'), '<a> & A "q" \'s\'')
})

test('paragraphsFromText splits on blank lines and keeps under the cap', () => {
  assert.deepEqual(paragraphsFromText('first\n\nsecond\n\nthird').map((segment) => segment.text), ['first', 'second', 'third'])
  const manyLines = Array.from({ length: 6 }, (_value, index) => 'line ' + (index + 1)).join('\n')
  assert.deepEqual(paragraphsFromText(manyLines).map((segment) => segment.text), ['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6'])
  assert.deepEqual(paragraphsFromText('   \n\n  '), [])
  const long = Array.from({ length: 5100 }, (_value, index) => 'p' + index).join('\n\n')
  assert.equal(paragraphsFromText(long).length, 5000)
})

test('mergeSegments merges only same-speaker close segments', () => {
  const segments = [
    { start: 0, end: 1000, speaker: '0', text: 'one' },
    { start: 2000, end: 3000, speaker: '0', text: 'two' },
    { start: 9000, end: 10000, speaker: '0', text: 'three' },
    { start: 11000, end: 12000, speaker: '1', text: 'four' },
  ]
  const merged = mergeSegments(segments, 4000)
  assert.equal(merged.length, 3)
  assert.equal(merged[0].text, 'one two')
  assert.equal(merged[1].text, 'three')
  assert.equal(merged[2].speaker, '1')
  assert.deepEqual(mergeSegments([{ start: 0, end: 0, speaker: '0', text: '  spaced   out  ' }], 0).map((segment) => segment.text), ['spaced   out'])
  assert.deepEqual(mergeSegments([{ start: 0, end: 0, speaker: '0', text: '   ' }], 1000), [])
})

test('formatClock renders mm:ss and h:mm:ss', () => {
  assert.equal(formatClock(0), '00:00')
  assert.equal(formatClock(65000), '01:05')
  assert.equal(formatClock(-500), '00:00')
  assert.equal(formatClock(3661000), '1:01:01')
})

test('meaningAtoms splits a Chinese meaning list into fragments', () => {
  assert.deepEqual(meaningAtoms('介入；干预；调停'), ['介入', '干预', '调停'])
  assert.deepEqual(meaningAtoms('傲慢，狂妄、自大/other'), ['傲慢', '狂妄', '自大', 'other'])
  assert.deepEqual(meaningAtoms('  介入 ； 介入 '), ['介入'])
  assert.deepEqual(meaningAtoms(''), [])
  assert.deepEqual(meaningAtoms(null), [])
})

test('collapseMeanings folds duplicates, keeps the richer wording and the evidence', () => {
  // Same fragments in a different order + evidence only on the second row.
  const affair = collapseMeanings([
    { pos: 'n.', zh: '风流韵事；婚外情' },
    { pos: 'n.', zh: '婚外情；风流韵事', example: 'Their affair was brief.', source: { transcript: 'a.json', title: 'A', speaker: '0', startMs: 10 } },
  ])
  assert.equal(affair.length, 1)
  assert.equal(affair[0].zh, '风流韵事；婚外情')
  assert.equal(affair[0].example, 'Their affair was brief.')
  assert.equal(affair[0].source.title, 'A')

  // Subset + superset: the superset wording wins and gets the missing evidence.
  const intervene = collapseMeanings([
    { pos: 'v.', zh: '介入；干预；调停' },
    { pos: 'v.', zh: '介入；干预', example: 'The UN intervened.' },
  ])
  assert.equal(intervene.length, 1)
  assert.equal(intervene[0].zh, '介入；干预；调停')
  assert.equal(intervene[0].example, 'The UN intervened.')

  // A narrower wording inside one fragment ("丑闻" ⊂ "丑闻（尤指性丑闻）").
  const scandal = collapseMeanings([
    { pos: 'n.', zh: '丑闻' },
    { pos: 'n.', zh: '丑闻（尤指性丑闻）', example: 'A sex scandal.' },
  ])
  assert.equal(scandal.length, 1)
  assert.equal(scandal[0].zh, '丑闻（尤指性丑闻）')
  assert.equal(scandal[0].example, 'A sex scandal.')
})

test('collapseMeanings only folds across parts of speech for a strict containment', () => {
  // Equal wording with different POS: both are real senses.
  const increase = collapseMeanings([
    { pos: 'n.', zh: '增加' },
    { pos: 'v.', zh: '增加' },
  ])
  assert.deepEqual(increase.map((meaning) => meaning.pos), ['n.', 'v.'])

  // Strict subset: the narrower noun sense adds nothing new.
  const intervene = collapseMeanings([
    { pos: 'v.', zh: '介入；干预；调停' },
    { pos: 'n.', zh: '干预；介入' },
  ])
  assert.equal(intervene.length, 1)
  assert.equal(intervene[0].pos, 'v.')
})

test('collapseMeanings keeps different senses, the original order and never mutates', () => {
  const input = [
    Object.freeze({ pos: 'n.', zh: '事务；事件' }),
    Object.freeze({ pos: 'n.', zh: '风流韵事；婚外情' }),
    Object.freeze({ pos: 'adj.', zh: '迷人的' }),
  ]
  const frozen = Object.freeze(input)
  const collapsed = collapseMeanings(frozen)
  assert.deepEqual(collapsed.map((meaning) => meaning.zh), ['事务；事件', '风流韵事；婚外情', '迷人的'])
  assert.notEqual(collapsed[0], input[0])
  assert.deepEqual(input[0], { pos: 'n.', zh: '事务；事件' })
  assert.deepEqual(collapseMeanings(null), [])
  assert.deepEqual(collapseMeanings([{ pos: 'n.', zh: '   ' }, null, 3]), [])
})

test('mergeMeaningPair returns null for unrelated senses and keeps inputs intact', () => {
  assert.equal(mergeMeaningPair(null, { zh: 'x' }), null)
  assert.equal(mergeMeaningPair({ zh: '' }, { zh: 'x' }), null)
  assert.equal(mergeMeaningPair({ pos: 'n.', zh: '丑闻' }, { pos: 'n.', zh: '丑事的细节' }), null)
  const left = { pos: 'n.', zh: '丑闻' }
  const right = { pos: 'n.', zh: '丑闻（尤指性丑闻）' }
  const merged = mergeMeaningPair(left, right)
  assert.equal(merged.zh, '丑闻（尤指性丑闻）')
  assert.deepEqual(left, { pos: 'n.', zh: '丑闻' })
  assert.deepEqual(right, { pos: 'n.', zh: '丑闻（尤指性丑闻）' })
})
