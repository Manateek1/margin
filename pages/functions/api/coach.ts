import worker from '../../../src/worker'

// Reuse the same validated AI endpoint on the shorter Pages address.
export function onRequest(context: { request: Request; env: Parameters<typeof worker.fetch>[1] }) {
  return worker.fetch(context.request, context.env)
}
