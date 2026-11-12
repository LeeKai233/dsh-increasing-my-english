/**
 * Pure text helpers (zero dependencies, no filesystem access):
 * XML entity decoding, HTML / Markdown / TeX cleanup, paragraph splitting,
 * transcript segment merging, clock formatting and wordbook meaning folding.
 */

export function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = Math.floor(total % 60)
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export function stripHtml(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote|pre|table|ul|ol)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
}

export function stripMarkdown(text) {
  return String(text)
    .replace(/^```.*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '')
}

const TEX_SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼', propto: '∝', equiv: '≡', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', oint: '∮', sqrt: '√', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', angle: '∠', degree: '°', circ: '°', percent: '%', ldots: '…', cdots: '…', dots: '…', textendash: '–', textemdash: '—', quad: ' ', qquad: ' ',
}

export function stripTex(text) {
  let value = String(text)
  value = value.replace(/(^|[^\\])%.*$/gm, '$1')
  // Preamble/definition lines carry no prose.
  value = value.replace(/^[ \t]*\\(documentclass|documentstyle|usepackage|bibliographystyle|setlength|addtolength|setcounter|linespread|newcommand|renewcommand|providecommand|def|DeclareMathOperator|newtheorem|titleformat|hypersetup|geometry|graphicspath|definecolor|pagestyle|thispagestyle|maketitle)\b.*$/gm, '')
  // Non-prose environments disappear entirely.
  value = value.replace(/\\begin\{(algorithm\*?|algorithmic|table\*?|figure\*?|tikzpicture|longtable)\}[\s\S]*?\\end\{\1\}/g, '\n')
  // Display-math environments carry no `$` delimiters; keep them as $$…$$ blocks.
  value = value.replace(/\\begin\{(equation\*?|displaymath|align\*?|aligned|gather\*?|multline\*?|eqnarray\*?|array)\}([\s\S]*?)\\end\{\1\}/g, (match, environment, body) => body
    .split(/\\\\/)
    .map((row) => row.replace(/&/g, ' ').replace(/\\label\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim())
    .filter((row) => row !== '')
    .map((row) => `$$${row}$$`)
    .join('\n\n'))
  value = value.replace(/\\begin\{(math)\}([\s\S]*?)\\end\{\1\}/g, (match, environment, body) => `$${body.replace(/\s+/g, ' ').trim()}$`)
  value = value.replace(/\\(begin|end)\{[^}]*\}/g, '\n')
  // Structural commands whose arguments are not prose.
  value = value.replace(/\\(label|ref|eqref|pageref|cite|citep|citet|nocite)(\[[^\]]*\])?\{[^{}]*\}/g, '')
  value = value.replace(/\\(vspace|hspace|vskip|hskip)(\[[^\]]*\])?\{[^{}]*\}/g, '')
  // Keep math spans intact for the client-side formula renderer.
  const maths = []
  value = value.replace(/\$\$([\s\S]*?)\$\$|\$([^$]*?)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g, (match, display, inline, bracket, paren) => {
    const rawBody = display ?? inline ?? bracket ?? paren ?? ''
    const body = rawBody.replace(/\s+/g, ' ').trim()
    const isDisplay = display !== undefined || bracket !== undefined
    maths.push({ body, isDisplay })
    return `\u0001M${maths.length - 1}\u0001`
  })
  value = value.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
  value = value.replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
  value = value.replace(/\\\\(?=\s|$)/g, '\n')
  value = value.replace(/\\([a-zA-Z]+)(\[[^\]]*\])?/g, (match, name) => TEX_SYMBOLS[name] ?? '')
  value = value.replace(/\\[\\&%$#_{}]/g, (match) => match.slice(1))
  value = value.replace(/\\([@,;:!])/g, ' ')
  value = value.replace(/\\[()[\]]/g, '')
  value = value.replace(/\$\$?/g, '')
  value = value.replace(/~+/g, ' ')
  value = value.replace(/\\\\/g, '\n')
  value = value.replace(/[{}]/g, '')
  value = value.replace(/\u0001M(\d+)\u0001/g, (match, index) => {
    const math = maths[Number(index)]
    if (math === undefined) return ''
    return math.isDisplay ? `$$${math.body}$$` : `$${math.body}$`
  })
  return value
}

export function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

/** Turn plain text into reader paragraphs (blank lines first, then single lines for line-based files). */
export function paragraphsFromText(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (normalized === '') return []
  let blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  if (blocks.length === 1) {
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 3) blocks = lines
  }
  const segments = []
  for (const block of blocks) {
    const value = block.replace(/[ \t]+/g, ' ').trim()
    if (value === '') continue
    segments.push({ i: segments.length, start: 0, end: 0, speaker: '0', text: value })
    if (segments.length >= 5000) break
  }
  return segments
}

/** Merge consecutive segments of one speaker into readable paragraphs. */
export function mergeSegments(segments, maxGapMs) {
  const gap = Number.isFinite(Number(maxGapMs)) ? Math.max(0, Number(maxGapMs)) : 4000
  const merged = []
  for (const segment of segments) {
    const text = String(segment.text ?? '').trim()
    if (text === '') continue
    const last = merged[merged.length - 1]
    if (last !== undefined
      && last.speaker === segment.speaker
      && segment.start - last.end <= gap
      && last.text.length + text.length <= 1600) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, ' ').trim()
      last.end = Math.max(last.end, segment.end)
      continue
    }
    merged.push({ ...segment, text })
  }
  return merged
}

/**
 * Meaning folding for the wordbook: split one Chinese meaning list into
 * comparison fragments and merge two meanings that explain the same thing.
 *
 * This lives in the pure text helpers (no imports) so both host/vocab.js and
 * host/senses.js can share it without pulling in any IO module; client.js has a
 * mirrored copy in §3 for display-only folding.
 */

/** Separators inside one Chinese meaning list ("介入；干预；调停"). */
const MEANING_ATOM_SPLIT = /[；;，,、/]/

function isMeaningRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasMeaningExample(meaning) {
  return typeof meaning.example === 'string' && meaning.example !== ''
}

function hasMeaningSource(meaning) {
  return isMeaningRecord(meaning.source)
}

/** Fragments of one Chinese meaning list, trimmed and deduplicated. */
export function meaningAtoms(zh) {
  const atoms = []
  const seen = new Set()
  for (const piece of String(zh ?? '').split(MEANING_ATOM_SPLIT)) {
    const atom = piece.trim()
    if (atom === '' || seen.has(atom)) continue
    seen.add(atom)
    atoms.push(atom)
  }
  return atoms
}

/**
 * True when one fragment is the same wording as another, or a narrower one
 * ("丑闻" inside "丑闻（尤指性丑闻）"). Single characters never match by
 * containment, so "跑" and "跑步" stay separate senses.
 */
function atomCoveredBy(atom, cover) {
  if (atom === cover) return true
  return atom.length >= 2 && cover.includes(atom)
}

/** True when every target fragment is covered by at least one cover fragment. */
function atomsCover(coverAtoms, targetAtoms) {
  if (targetAtoms.length === 0 || coverAtoms.length === 0) return false
  return targetAtoms.every((atom) => coverAtoms.some((cover) => atomCoveredBy(atom, cover)))
}

/** True when smaller has strictly fewer fragments and all of them are covered. */
function atomsStrictlyContain(biggerAtoms, smallerAtoms) {
  return smallerAtoms.length < biggerAtoms.length && atomsCover(biggerAtoms, smallerAtoms)
}

/**
 * Merge two meanings that explain the same thing, or return null.
 *
 * "The same thing" = the Chinese fragments of one cover all fragments of the
 * other. The richer explanation wins (a superset of fragments, or the earlier
 * row on a tie) and the dropped row only backfills missing example/source
 * evidence; an existing zh is never overwritten. Parts of speech must match,
 * except when one fragment set strictly contains the other — that folds
 * "v. 介入；干预；调停" + "n. 干预；介入" but keeps "n. 增加" + "v. 增加".
 *
 * Pure: neither input is mutated; the returned object is a new meaning.
 */
export function mergeMeaningPair(left, right) {
  if (!isMeaningRecord(left) || !isMeaningRecord(right)) return null
  const leftZh = String(left.zh ?? '').trim()
  const rightZh = String(right.zh ?? '').trim()
  if (leftZh === '' || rightZh === '') return null
  const leftAtoms = meaningAtoms(leftZh)
  const rightAtoms = meaningAtoms(rightZh)
  const leftCovers = atomsCover(leftAtoms, rightAtoms)
  const rightCovers = atomsCover(rightAtoms, leftAtoms)
  if (!leftCovers && !rightCovers) return null
  const leftPos = String(left.pos ?? '').trim()
  const rightPos = String(right.pos ?? '').trim()
  if (leftPos !== '' && rightPos !== '' && leftPos.toLowerCase() !== rightPos.toLowerCase()) {
    if (!atomsStrictlyContain(leftAtoms, rightAtoms) && !atomsStrictlyContain(rightAtoms, leftAtoms)) return null
  }
  const keepRight = rightCovers && !leftCovers
  const keep = keepRight ? right : left
  const drop = keepRight ? left : right
  const merged = {
    ...keep,
    pos: String(keep.pos ?? '').trim() || String(drop.pos ?? '').trim(),
    zh: String(keep.zh ?? '').trim(),
  }
  if (!hasMeaningExample(merged) && hasMeaningExample(drop)) merged.example = drop.example
  if (!hasMeaningSource(merged) && hasMeaningSource(drop)) merged.source = drop.source
  return merged
}

/**
 * Collapse meanings that explain the same thing (see mergeMeaningPair).
 *
 * Used by the write paths (normalizeMeanings / mergeSenses) and by the
 * display/export paths, so duplicate senses from an older dictionary entry and
 * the multi-sense analysis are folded into one readable line. Order is the
 * first occurrence order; evidence is preserved; the input is never mutated.
 */
export function collapseMeanings(raw) {
  const items = []
  for (const meaning of Array.isArray(raw) ? raw : []) {
    if (!isMeaningRecord(meaning)) continue
    const zh = String(meaning.zh ?? '').trim()
    if (zh === '') continue
    items.push({ ...meaning, pos: String(meaning.pos ?? '').trim(), zh })
  }
  let changed = true
  while (changed) {
    changed = false
    for (let index = 0; index < items.length && !changed; index += 1) {
      for (let other = index + 1; other < items.length; other += 1) {
        const merged = mergeMeaningPair(items[index], items[other])
        if (merged === null) continue
        items[index] = merged
        items.splice(other, 1)
        changed = true
        break
      }
    }
  }
  return items
}
