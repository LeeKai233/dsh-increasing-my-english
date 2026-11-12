/**
 * Host half of the English practice bundle — assembly only.
 *
 * The implementation lives under ./host/ (config, paths, json-store, text, pdf,
 * transcript, asr, lookup, vocab, senses, analysis, recall, env, api, tools). This module only
 * declares the plugin identity/injections and wires the HTTP route + agent tools.
 */
import { API_PATH, createHost } from './host/api.js'
import { registerTools } from './host/tools.js'

export const name = 'english-practice'
export const inject = ['tools', 'workingDirectory', 'webServer']

export function apply(ctx) {
  const host = createHost(ctx)
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API_PATH, handler: host.handleHttp }), 'english-practice: http api')
  registerTools(ctx, host)
  ctx.effect(() => {
    host.startBackground()
    return () => host.dispose()
  }, 'english-practice: background analysis + dispose host')
}
