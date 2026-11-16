import { describe, expect, it, vi } from 'vitest'
import worker from '../worker'

let requestId = 0

function makeRequest(body: unknown, method = 'POST', ip?: string) {
  requestId += 1
  return new Request('https://margin.test/api/coach', {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip ?? `test-${requestId}` },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
}

function makeEnvironment(response: unknown = { response: 'Could we review a split together?' }) {
  const run = vi.fn(async (_model: string, _input: {
    messages: Array<{ role: 'system' | 'user'; content: string }>
    max_completion_tokens: number
    temperature: number
    store: boolean
    chat_template_kwargs: { enable_thinking: false }
  }) => response)

  return {
    run,
    env: {
      AI: { run },
      ASSETS: { fetch: async () => new Response('asset') },
    },
  }
}

describe('Margin AI Worker route', () => {
  it('asks the model for a short tone-specific opener without household values', async () => {
    const { env, run } = makeEnvironment()
    const response = await worker.fetch(makeRequest({ tone: 'warm', goal: 'review-split' }), env)
    const payload = await response.json() as { message: string; model: string }

    expect(response.status).toBe(200)
    expect(payload.message).toBe('Could we review a split together?')
    expect(payload.model).toBe('Google Gemma 4')
    expect(run).toHaveBeenCalledOnce()
    const [, input] = run.mock.calls[0]
    const prompt = input.messages.map((message) => message.content).join(' ')
    expect(prompt).toContain('warm and reassuring')
    expect(prompt).toContain('review whether their shared-cost split still feels fair')
    expect(prompt).not.toContain('Maya')
    expect(prompt).not.toContain('Leo')
    expect(prompt).not.toContain('1200')
    expect(input.store).toBe(false)
    expect(input.chat_template_kwargs).toEqual({ enable_thinking: false })
  })

  it('rejects names and amounts in the request body before calling AI', async () => {
    const { env, run } = makeEnvironment()
    const response = await worker.fetch(makeRequest({ tone: 'warm', goal: 'start-talk', name: 'Maya', amount: 1200 }), env)
    const payload = await response.json() as { error: string }

    expect(response.status).toBe(400)
    expect(payload.error).toContain('tone and conversation goal')
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects unknown tone values and non-POST requests', async () => {
    const { env, run } = makeEnvironment()
    const invalidTone = await worker.fetch(makeRequest({ tone: 'angry', goal: 'start-talk' }), env)
    const invalidGoal = await worker.fetch(makeRequest({ tone: 'warm', goal: 'financial-advice' }), env)
    const wrongMethod = await worker.fetch(makeRequest(undefined, 'GET'), env)

    expect(invalidTone.status).toBe(400)
    expect(invalidGoal.status).toBe(400)
    expect(wrongMethod.status).toBe(405)
    expect(run).not.toHaveBeenCalled()
  })

  it('extracts text blocks from chat responses and ignores hidden reasoning blocks', async () => {
    const { env } = makeEnvironment({
      choices: [{
        message: {
          content: [
            { type: 'thinking', text: 'Do not expose this.' },
            { type: 'text', text: 'Could we look at the plan together?' },
          ],
        },
      }],
    })
    const response = await worker.fetch(makeRequest({ tone: 'direct', goal: 'start-talk' }), env)
    const payload = await response.json() as { message: string }

    expect(response.status).toBe(200)
    expect(payload.message).toBe('Could we look at the plan together?')
  })

  it('caps request bodies even when the client omits Content-Length', async () => {
    const { env, run } = makeEnvironment()
    const response = await worker.fetch(new Request('https://margin.test/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'oversize-test' },
      body: `{"tone":"warm","extra":"${'x'.repeat(520)}"}`,
    }), env)

    expect(response.status).toBe(413)
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects model responses that invent numbers or percentages', async () => {
    const { env, run } = makeEnvironment({ response: 'Could we talk about $600?' })
    const response = await worker.fetch(makeRequest({ tone: 'direct', goal: 'talk-change' }), env)

    expect(response.status).toBe(502)
    expect(run).toHaveBeenCalledOnce()
  })

  it('limits repeated drafts for one client and advertises a retry window', async () => {
    const { env, run } = makeEnvironment()
    let lastResponse: Response | undefined
    for (let index = 0; index < 21; index += 1) {
      lastResponse = await worker.fetch(makeRequest({ tone: 'warm', goal: 'monthly-checkin' }, 'POST', 'rate-limit-test'), env)
    }

    expect(lastResponse?.status).toBe(429)
    expect(lastResponse?.headers.get('Retry-After')).toBe('600')
    expect(run).toHaveBeenCalledTimes(20)
  })
})
