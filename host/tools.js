/**
 * The two agent tools (english_transcribe / english_vocab): schemas, renderers
 * and execution adapters over the host services.
 *
 * The transcribe tool's harness timeout follows asr.toolTimeoutMinutes: the
 * definition object is kept registered and its timeoutMs is updated whenever a
 * workspace config loads (the timeout policy reads it per call).
 */
import { messageOf } from './paths.js'
import { formatClock } from './text.js'

export const TOOL_NAMES = Object.freeze(['english_transcribe', 'english_vocab'])

export function registerTools(ctx, host) {
  const services = host.services
  const workspaceOf = services.workspaceOf
  const jobs = { get: (jobId) => services.jobs.get(jobId) }

  async function startTranscription(agent, input, signal) {
    return host.startTranscription(agent, input, signal)
  }

  function waitJob(job, signal) {
    return services.jobs.wait(job.id, signal)
  }

  async function readVocab(root) {
    return services.vocab.read(root)
  }

  async function vocabList(agent, input, signal) {
    const { root } = await services.workspaceConfig(agent, signal)
    return services.vocab.list(root, input)
  }

  async function lookupView(agent, input, signal) {
    const { root, config } = await services.workspaceConfig(agent, signal)
    return services.lookup.view(root, config, input, signal)
  }

  async function vocabAdd(agent, entry, signal) {
    const { root, config } = await services.workspaceConfig(agent, signal)
    return services.vocab.add(root, config, entry, signal)
  }

  async function vocabUpdate(agent, input, signal) {
    const { root } = await services.workspaceConfig(agent, signal)
    return services.vocab.update(root, input)
  }

  async function enrichVocabEntry(agent, input, signal) {
    const { root, config } = await services.workspaceConfig(agent, signal)
    return services.vocab.enrich(root, config, input, signal)
  }

  async function vocabRemove(agent, input, signal) {
    const { root } = await services.workspaceConfig(agent, signal)
    return services.vocab.remove(root, input)
  }

  async function vocabExport(agent, signal) {
    const { root } = await services.workspaceConfig(agent, signal)
    return services.vocab.exportMarkdown(root)
  }

  const transcribeDefinition = {
    name: 'english_transcribe',
    description:
      'Transcribe a podcast recording with speaker diarization via the Bailian `bl speech recognize` CLI, ' +
      'then store the normalized transcript in the current workspace under transcripts/. Wait for the job to finish and return the file name together with segment and speaker counts.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        audio: {
          type: 'string',
          description: 'Audio path: relative to the session workspace (e.g. recordings/ep12.m4a) or absolute.',
        },
        speakers: {
          type: 'integer',
          description: 'Expected number of speakers (optional; requires diarization, which is always on).',
        },
        model: {
          type: 'string',
          description: 'ASR model override, for example qwen-audio-3.1-asr-flash-filetrans (the default) or fun-asr.',
        },
        language: {
          type: 'string',
          description: 'Language hint such as en (default) or zh.',
        },
      },
      required: ['audio'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          jobId: { type: 'string' },
          transcript: { type: 'string' },
          segments: { type: 'integer' },
          speakers: { type: 'integer' },
          durationMs: { type: 'integer' },
          model: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
          state: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `转写完成：${value.transcript}（${value.segments} 段，${value.speakers} 位说话人，时长 ${formatClock(value.durationMs)}）${Array.isArray(value.warnings) && value.warnings.length > 0 ? `；注意：${value.warnings.join('；')}` : ''}`
          : `转写失败：${value.error ?? '未知错误'}（任务 ${value.jobId ?? '-'}）`,
      }],
    },
    timeoutMs: host.getToolTimeoutMs(),
    async execute(args, exec) {
      if (!exec.agent) throw new Error('english_transcribe 需要一个会话上下文')
      let jobId = ''
      try {
        jobId = (await startTranscription(exec.agent, args, exec.signal)).jobId
      } catch (error) {
        return { ok: false, jobId: '', transcript: '', state: 'failed', error: messageOf(error) }
      }
      const job = jobs.get(jobId)
      if (job === undefined) throw new Error('转写任务没有启动')
      try {
        const state = await waitJob(job, exec.signal)
        if (state.state === 'done') {
          return {
            ok: true,
            jobId,
            transcript: state.transcript,
            segments: state.segments ?? 0,
            speakers: state.speakers ?? 0,
            durationMs: state.durationMs ?? 0,
            model: state.model ?? '',
            warnings: state.warnings ?? [],
            state: state.state,
          }
        }
        return { ok: false, jobId, transcript: state.transcript, state: state.state, error: state.error ?? '未知错误' }
      } catch (error) {
        return { ok: false, jobId, transcript: jobs.get(jobId)?.state.transcript, state: 'running', error: messageOf(error) }
      }
    },
  }

  const vocabDefinition = {
    name: 'english_vocab',
    description:
      'Read and edit the English wordbook in the current workspace (vocab/vocabulary.json). ' +
      'Actions: list (defaults to pending entries), lookup (dictionary lookup: ipa, meanings, example translation, word forms, etymology), ' +
      'add, update (fill ipa/meanings/translation/family/etymology for entries the assistant resolved itself), ' +
      'analyze (compare every transcript for the word\'s other meanings and append them to the entry), ' +
      'enrich (re-query one entry by id and merge its word forms and etymology), remove, export (rewrites vocab/生词本.md).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'lookup', 'add', 'update', 'enrich', 'analyze', 'remove', 'export'],
          description: 'What to do.',
        },
        status: { type: 'string', enum: ['pending', 'done', 'all'], description: 'Filter for list.' },
        query: { type: 'string', description: 'Search text for list.' },
        kind: { type: 'string', enum: ['word', 'sentence'], description: 'Entry kind for lookup/add.' },
        text: { type: 'string', description: 'Selected word or sentence for lookup.' },
        sentence: { type: 'string', description: 'Containing sentence for a word lookup.' },
        entry: { type: 'object', additionalProperties: true, description: 'One entry for add.' },
        entries: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Entries for update.' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Entry ids for remove.' },
        id: { type: 'string', description: 'Entry id for enrich / analyze.' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          total: { type: 'integer' },
          pending: { type: 'integer' },
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
          path: { type: 'string' },
          duplicate: { type: 'boolean' },
          result: { type: 'object', additionalProperties: true },
          words: { type: 'integer' },
          sentences: { type: 'integer' },
          removed: { type: 'integer' },
          updated: { type: 'integer' },
          analyzed: { type: 'integer' },
          added: { type: 'integer' },
          skipped: { type: 'integer' },
          failed: { type: 'integer' },
          remaining: { type: 'integer' },
        },
      },
      render: (_args, value) => {
        if (value.ok === false) return [{ type: 'text', text: `生词本操作失败：${value.error ?? '未知错误'}` }]
        if (value.result !== undefined) {
          const result = value.result
          if (!result || result.ok === false) return [{ type: 'text', text: `查词失败：${result?.message ?? '未知错误'}` }]
          if (result.kind === 'sentence') return [{ type: 'text', text: `翻译：${result.translation}` }]
          const meanings = Array.isArray(result.meanings) ? result.meanings.map((meaning) => `${meaning.pos ? `${meaning.pos} ` : ''}${meaning.zh}`).join('\n') : ''
          const forms = Array.isArray(result.family) && result.family.length > 0
            ? `\n词形：${result.family.map((item) => `${item.label ? `${item.label} ` : ''}${item.form}`).join('；')}`
            : ''
          const roots = result.etymology && Array.isArray(result.etymology.parts) && result.etymology.parts.length > 0
            ? `\n词源：${[result.etymology.language, result.etymology.parts.map((part) => `${part.part}${part.meaning ? `（${part.meaning}）` : ''}`).join(' + ')].filter(Boolean).join(' · ')}${result.etymology.explanation ? `\n${result.etymology.explanation}` : ''}`
            : ''
          return [{
            type: 'text',
            text: `${result.text ?? ''} ${result.ipa ?? ''}${result.cached ? '（缓存）' : ''}\n${meanings}${result.sentenceZh ? `\n例句翻译：${result.sentenceZh}` : ''}${forms}${roots}`,
          }]
        }
        if (value.analyzed !== undefined) {
          const lines = [
            `多义分析：分析 ${value.analyzed ?? 0} 个词，新增 ${value.added ?? 0} 条释义（${value.updated ?? 0} 个词有更新），跳过 ${value.skipped ?? 0} 个，失败 ${value.failed ?? 0} 个，剩余 ${value.remaining ?? 0} 个待分析。`,
          ]
          for (const entry of Array.isArray(value.entries) ? value.entries.slice(0, 20) : []) {
            const meanings = Array.isArray(entry.meanings) ? entry.meanings.map((meaning) => `${meaning.pos ? `${meaning.pos} ` : ''}${meaning.zh}`).join('；') : ''
            lines.push(`- ${entry.word ?? ''}：${meanings}`)
          }
          return [{ type: 'text', text: lines.join('\n') }]
        }
        if (Array.isArray(value.entries)) {
          const lines = value.entries.slice(0, 20).map((entry) => (entry.kind === 'sentence'
            ? `- [句子] ${entry.text ?? ''}（${entry.status}）`
            : `- [单词] ${entry.word ?? ''} ${entry.ipa ?? ''}（${entry.status}）`))
          return [{
            type: 'text',
            text: `生词本：共 ${value.total ?? 0} 条（单词 ${value.words ?? 0}，句子 ${value.sentences ?? 0}），待补全 ${value.pending ?? 0} 条\n${lines.join('\n')}`,
          }]
        }
        if (value.duplicate !== undefined) return [{ type: 'text', text: value.duplicate ? '该词条已在生词本中。' : '已加入生词本。' }]
        if (value.removed !== undefined) return [{ type: 'text', text: `已删除 ${value.removed} 条。` }]
        if (value.updated !== undefined) return [{ type: 'text', text: `已更新 ${value.updated} 条。` }]
        if (value.path !== undefined) return [{ type: 'text', text: `已导出 ${value.path}。` }]
        return [{
          type: 'text',
          text: `生词本：共 ${value.total ?? 0} 条，待补全 ${value.pending ?? 0} 条。${value.path ? `已导出 ${value.path}。` : ''}`,
        }]
      },
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('english_vocab 需要一个会话上下文')
      try {
        switch (args.action) {
          case 'list': {
            const result = await vocabList(exec.agent, args, exec.signal)
            return { ok: true, ...result }
          }
          case 'lookup': {
            const kind = args.kind === 'sentence' ? 'sentence' : 'word'
            const result = await lookupView(exec.agent, { kind, text: args.text, sentence: args.sentence }, exec.signal)
            return { ok: true, result }
          }
          case 'add': {
            const result = await vocabAdd(exec.agent, { kind: args.kind, ...(args.entry ?? {}) }, exec.signal)
            return { ok: true, ...result, total: (await readVocab(await workspaceOf(exec.agent, exec.signal))).words.length }
          }
          case 'update': {
            const result = await vocabUpdate(exec.agent, { entries: args.entries }, exec.signal)
            return { ok: true, ...result }
          }
          case 'enrich': {
            const result = await enrichVocabEntry(exec.agent, { id: args.id }, exec.signal)
            return { ok: true, ...result }
          }
          case 'analyze': {
            const { root, config } = await services.workspaceConfig(exec.agent, exec.signal)
            const result = await services.analysis.analyzeStale(root, config, { id: args.id }, exec.signal)
            return { ok: true, ...result }
          }
          case 'remove': {
            const result = await vocabRemove(exec.agent, { ids: args.ids }, exec.signal)
            return { ok: true, ...result }
          }
          case 'export': {
            const result = await vocabExport(exec.agent, exec.signal)
            return { ok: true, ...result }
          }
          default:
            return { ok: false, error: `未知操作：${String(args.action)}` }
        }
      } catch (error) {
        return { ok: false, error: messageOf(error) }
      }
    },
  }

  ctx.tools.register(transcribeDefinition)
  ctx.tools.register(vocabDefinition)
  host.setToolTimeoutListener((ms) => {
    transcribeDefinition.timeoutMs = ms
  })
}
