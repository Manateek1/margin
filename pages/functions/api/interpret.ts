import worker from '../../../src/worker'

// Reuse the same validated AI document interpreter endpoint on Cloudflare Pages.
export function onRequest(context: { request: Request; env: Parameters<typeof worker.fetch>[1] }) {
  return worker.fetch(context.request, context.env)
}
