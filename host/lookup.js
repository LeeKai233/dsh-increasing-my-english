/**
 * Word lookup: prompts, JSON extraction, the DSH-model backend and the Bailian
 * text backend, result normalization (shared helpers from vocab.js), cache and
 * full-sentence translation.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { DEFAULT_CONFIG, resolveExecutable } from './config.js'
import { BL_INSTALL_HINT, BL_LOGIN_HINT } from './env.js'
import { stripBom } from './json-store.js'
import { CACHE_REL, fail, isRecord, messageOf } from './paths.js'
import { MAX_FAMILY, normalizeEtymology, normalizeFamily, normalizeMeanings } from './vocab.js'

export const CACHE_LIMIT = 2000
export const LOOKUP_VERSION = 2
export const MAX_LOOKUP_TEXT = 400
export const MAX_WORD = 120

const LOOKUP_SYSTEM =
  'You are a precise English-Chinese dictionary and translator for a Chinese learner of English. ' +
  'Reply with strict JSON only: no markdown fences, no commentary, no extra keys.'

export function parseJsonObject(text) {
  const source = String(text ?? '').trim()
  const unfenced = source.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const candidates = [unfenced]
  const first = unfenced.indexOf('{')
  const last = unfenced.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(unfenced.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      // try the next candidate
    }
  }
  throw new Error('模型没有返回可解析的 JSON')
}

function collectStrings(value, out) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out)
  else if (isRecord(value)) for (const item of Object.values(value)) collectStrings(item, out)
}

/** Find the model text inside a Bailian CLI JSON envelope. */
function extractCliText(document) {
  if (typeof document === 'string') return document
  if (!isRecord(document)) return ''
  const direct = [
    document.output?.text,
    document.text,
    document.result?.text,
    document.data?.text,
  ].find((value) => typeof value === 'string' && value.trim() !== '')
  if (typeof direct === 'string') return direct
  const content = document.output?.choices?.[0]?.message?.content ?? document.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const joined = content.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('')
    if (joined.trim() !== '') return joined
  }
  const strings = []
  collectStrings(document, strings)
  const withJson = strings.filter((value) => value.includes('{') && value.includes('}')).sort((a, b) => b.length - a.length)
  return withJson[0] ?? strings.sort((a, b) => b.length - a.length)[0] ?? ''
}

function buildLookupPrompt(kind, text, sentence) {
  if (kind === 'sentence') {
    return [
      `Sentence: ${text}`,
      'Return exactly: {"translation":"<a natural Simplified Chinese translation>"}',
    ].join('\n')
  }
  const lines = [
    `Word or phrase: ${text}`,
    'Return exactly: {"ipa":"/<phonetic transcription>/","meanings":[{"pos":"<n.|v.|adj.|adv.|...>","zh":"<brief Simplified Chinese meaning>"}],"family":[{"label":"<名词|动词|形容词|副词|过去式|过去分词|复数|比较级|最高级|现在分词|第三人称单数>","form":"<the other form>"}],"etymology":{"language":"<source language, e.g. Greek/Latin/Old English/French>","parts":[{"part":"<root/prefix/suffix>","meaning":"<its meaning in Simplified Chinese>"}],"explanation":"<1-3 sentences in Simplified Chinese explaining how the parts form the word>"}}',
    'Rules: give 1 to 3 meanings and keep zh short; ipa may be "". family lists the word\'s other parts of speech and irregular inflections only when they exist and differ from the headword (max ' + MAX_FAMILY + ' items, Chinese labels, no duplicates). etymology is best-effort: when the origin is unknown return {"language":"","parts":[],"explanation":""}; keep the explanation under 120 Chinese characters.',
  ]
  return lines.join('\n')
}


/** Normalize a raw model object into the frozen lookup result shape. */
export function normalizeLookup(kind, raw) {
  const source = isRecord(raw) ? raw : {}
  if (kind === 'sentence') {
    const translation = typeof source.translation === 'string' ? source.translation.trim() : ''
    if (translation === '') fail('lookup/failed', '模型没有返回句子翻译')
    return { kind, translation }
  }
  const ipa = typeof source.ipa === 'string' ? source.ipa.trim() : ''
  const meanings = normalizeMeanings(source.meanings, { limit: 3 })
  if (meanings.length === 0) fail('lookup/failed', '模型没有返回释义')
  return {
    kind,
    ipa,
    meanings,
    sentenceZh: '',
    family: normalizeFamily(source.family, { limit: MAX_FAMILY }),
    etymology: normalizeEtymology(source.etymology),
  }
}

function sha1(text) {
  return createHash('sha1').update(text).digest('hex')
}


/** Create the lookup service (one per plugin instance). */
export function createLookupService(options) {
  const ctx = options.ctx
  const store = options.store
  const runCommand = options.runCommand
  const env = options.env ?? process.env

  /** Read the cache document (the caller holds the file lock). */
  async function readCacheData(file) {
    const detail = await store.readJsonFile(file, { entries: {} })
    return isRecord(detail.value) && isRecord(detail.value.entries) ? detail.value : { entries: {} }
  }

  async function withCache(root, task) {
    const file = join(root, CACHE_REL)
    return store.locked(file, async () => task(await readCacheData(file), file))
  }

  function remember(data, key, value) {
    data.entries[key] = { ...value, version: LOOKUP_VERSION, at: new Date().toISOString() }
    const keys = Object.keys(data.entries)
    if (keys.length > CACHE_LIMIT) {
      keys.sort((a, b) => String(data.entries[a]?.at).localeCompare(String(data.entries[b]?.at)))
      for (const stale of keys.slice(0, keys.length - CACHE_LIMIT)) delete data.entries[stale]
    }
  }

  async function saveCache(file, data) {
    await store.atomicWriteText(file, JSON.stringify(data, null, 2) + '\n')
  }

  function wordCacheValue(cached) {
    if (!isRecord(cached) || cached.version !== LOOKUP_VERSION || !Array.isArray(cached.meanings)) return undefined
    return {
      kind: 'word',
      ipa: typeof cached.ipa === 'string' ? cached.ipa : '',
      meanings: cached.meanings,
      family: Array.isArray(cached.family) ? cached.family : [],
      etymology: cached.etymology,
    }
  }

  async function request(root, config, prompt, signal) {
    return config.lookup.backend === 'bl'
      ? lookupViaBl(root, config, prompt, signal)
      : lookupViaDs(config, prompt, signal)
  }

  async function word(root, config, text, signal) {
    const cacheKey = 'w:' + text.toLowerCase()
    return withCache(root, async (cache, file) => {
      const cached = wordCacheValue(cache.entries[cacheKey])
      if (cached !== undefined) return { ok: true, cached: true, kind: 'word', text, ...cached }
      let raw
      try {
        raw = await request(root, config, buildLookupPrompt('word', text, ''), signal)
      } catch (error) {
        return { ok: false, kind: 'word', text, code: 'lookup-failed', message: messageOf(error) }
      }
      let value
      try {
        value = normalizeLookup('word', raw)
      } catch (error) {
        return { ok: false, kind: 'word', text, code: 'lookup-invalid', message: messageOf(error) }
      }
      remember(cache, cacheKey, { ...value, sentenceZh: '' })
      await saveCache(file, cache)
      return { ok: true, cached: false, kind: 'word', text, ...value }
    })
  }

  async function translate(root, config, sentence, signal) {
    const text = String(sentence ?? '').trim()
    if (text === '') fail('lookup/failed', '句子为空')
    const key = 's:' + sha1(text)
    return withCache(root, async (cache, file) => {
      const cached = cache.entries[key]
      if (isRecord(cached) && cached.version === LOOKUP_VERSION && typeof cached.translation === 'string') {
        return { translation: cached.translation, cached: true }
      }
      const raw = await request(root, config, buildLookupPrompt('sentence', text, ''), signal)
      const value = normalizeLookup('sentence', raw)
      remember(cache, key, value)
      await saveCache(file, cache)
      return { translation: value.translation, cached: false }
    })
  }

  /**
   * Cached generic JSON completion used by the 多义分析 pipeline: the caller owns
   * prompt construction and caching key, request() already returns parsed JSON.
   */
  async function askJson(root, config, input, signal) {
    const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : ''
    if (prompt === '') throw new Error('缺少提示词')
    const cacheKey = 'j:' + String(input?.key ?? '')
    const file = join(root, CACHE_REL)
    // Keep the cache lock short: holding it across the model call would block an
    // interactive lookup on the same file while a sense analysis is pending.
    const cached = await store.locked(file, async () => {
      const data = await readCacheData(file)
      const entry = data.entries[cacheKey]
      return isRecord(entry) && entry.version === LOOKUP_VERSION && isRecord(entry.value) ? entry.value : undefined
    })
    if (cached !== undefined) return { value: cached, cached: true }
    const timeoutMs = Number(input?.timeoutMs)
    const requestConfig = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? { ...config, lookup: { ...(isRecord(config?.lookup) ? config.lookup : {}), timeoutMs } }
      : config
    const value = await request(root, requestConfig, prompt, signal)
    // Re-read under the lock so a concurrent cache write is preserved.
    await store.locked(file, async () => {
      const data = await readCacheData(file)
      remember(data, cacheKey, { value })
      await saveCache(file, data)
    })
    return { value, cached: false }
  }

  async function view(root, config, input, signal) {
    const kind = input?.kind === 'sentence' ? 'sentence' : 'word'
    const text = String(input?.text ?? '').trim()
    if (text === '') fail('lookup/failed', '没有选中任何文字')
    if (text.length > MAX_LOOKUP_TEXT) fail('lookup/failed', '选中的文字太长，请选择单词或一句话')
    if (kind === 'word' && text.length > MAX_WORD) fail('lookup/failed', '选中的文字太长，请选择单词或短语')
    const backend = config?.lookup?.backend ?? 'ds'
    if (backend === 'off') return { ok: false, kind, text, code: 'lookup-off', message: '查词后端已关闭' }
    if (kind === 'sentence') {
      try {
        const result = await translate(root, config, text, signal)
        return { ok: true, cached: result.cached, kind, text, translation: result.translation }
      } catch (error) {
        return { ok: false, kind, text, code: 'lookup-failed', message: messageOf(error) }
      }
    }
    return word(root, config, text, signal)
  }

  async function lookupViaDs(config, prompt, signal) {
    const llm = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    if (llm === undefined || defaultModel === undefined) throw new Error('当前没有可用的 DSH 模型，已不能查词')
    const selection = defaultModel.currentSelection()
    const provider = config.lookup.provider || selection?.provider
    const model = config.lookup.model || selection?.model
    if (!provider || !model) throw new Error('没有配置默认模型')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('查词超时')), Math.max(1000, Number(config.lookup.timeoutMs) || DEFAULT_CONFIG.lookup.timeoutMs))
    const onAbort = () => controller.abort(signal?.reason)
    if (signal !== undefined) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    let text = ''
    let finishKind = ''
    const options = {
      provider,
      model,
      system: LOOKUP_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      temperature: 0.2,
      maxTokens: 3000,
      signal: controller.signal,
    }
    try {
      let stream
      if (typeof llm.prepareCall === 'function') {
        try {
          const prepared = await llm.prepareCall({ provider, model }, controller.signal, (controls, info) => {
            const least = info?.reasoning?.efforts?.[0]
            return least === undefined ? controls : { ...controls, reasoningEffort: least.id }
          })
          stream = prepared.stream(options)
        } catch {
          stream = llm.stream(options)
        }
      } else {
        stream = llm.stream(options)
      }
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') {
          finishKind = chunk.reason.kind
          if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            throw new Error(chunk.reason.failure?.message ?? '模型请求失败')
          }
        }
      }
    } finally {
      clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    }
    try {
      return parseJsonObject(text)
    } catch (error) {
      if (finishKind === 'max-tokens') throw new Error('模型输出被截断，请重试')
      throw error
    }
  }

  async function lookupViaBl(root, config, prompt, signal) {
    const args = ['text', 'chat', '--output', 'json', '--enable-search', 'false', '--temperature', '0.2', '--system', LOOKUP_SYSTEM, '--message', prompt]
    if (config.lookup.model) args.splice(2, 0, '--model', config.lookup.model)
    const { command } = resolveExecutable('bl', env)
    let result
    try {
      result = await runCommand(command, args, { cwd: root, signal, timeoutMs: Number(config.lookup.timeoutMs) || DEFAULT_CONFIG.lookup.timeoutMs })
    } catch (error) {
      if (error?.notFound) throw new Error('未找到 Bailian CLI（bl）。请先安装：' + BL_INSTALL_HINT + '，并运行：' + BL_LOGIN_HINT)
      if (error?.timedOut) throw new Error('查词超时，请重试')
      throw error
    }
    const document = JSON.parse(stripBom(result.stdout))
    return parseJsonObject(extractCliText(document))
  }

  return { view, word, translate, askJson }
}
