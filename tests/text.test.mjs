import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeXmlEntities,
  formatClock,
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
