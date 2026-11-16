import type { CoachGoal, Tone } from './lib/finance'

interface AIService {
  run(
    model: string,
    input: {
      messages: Array<{ role: 'system' | 'user'; content: string }>
      max_completion_tokens: number
      temperature: number
      store: boolean
      chat_template_kwargs: { enable_thinking: false }
    },
  ): Promise<unknown>
}

interface WorkerEnv {
  AI: AIService
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const tones: Record<Tone, string> = {
  warm: 'warm and reassuring',
  direct: 'clear, direct, and respectful',
  'low-pressure': 'gentle, low-pressure, and collaborative',
}
const goals: Record<CoachGoal, string> = {
  'start-talk': 'open a calm conversation about sharing household costs without blame',
  'review-split': 'invite the roommates to review whether their shared-cost split still feels fair',
  'talk-change': 'bring up a new shared expense or change and ask to make a plan together',
  'monthly-checkin': 'start a brief monthly check-in about what is working and what should change',
}

const requestWindows = new Map<string, { startedAt: number; count: number }>()
const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 20
const MAX_TRACKED_CLIENTS = 2048
const MAX_BODY_BYTES = 512

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '600' } : {}),
    },
  })
}

function extractText(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => extractText(part, depth + 1))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  if (typeof record.type === 'string' && /analysis|thinking|reasoning/i.test(record.type)) return ''
  for (const key of ['response', 'result', 'output_text', 'choices', 'message', 'content', 'text', 'output', 'data']) {
    const text = extractText(record[key], depth + 1)
    if (text) return text
  }
  return ''
}

function allowRequest(request: Request): boolean {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  const now = Date.now()

  for (const [knownIp, window] of requestWindows) {
    if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(knownIp)
  }

  const current = requestWindows.get(ip)

  if (!current || now - current.startedAt >= WINDOW_MS) {
    if (requestWindows.size >= MAX_TRACKED_CLIENTS) {
      const oldestIp = requestWindows.keys().next().value
      if (oldestIp) requestWindows.delete(oldestIp)
    }
    requestWindows.set(ip, { startedAt: now, count: 1 })
    return true
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false
  current.count += 1
  return true
}

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function handleCoach(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST for the coach.' }, 405)

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return jsonResponse({ error: 'Send the conversation tone as JSON.' }, 415)
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: 'That request is too large.' }, 413)
  }
  if (!allowRequest(request)) return jsonResponse({ error: 'Please wait before drafting another message.' }, 429)

  let body: unknown
  try {
    const requestBody = await readLimitedBody(request)
    if (requestBody === null) return jsonResponse({ error: 'That request is too large.' }, 413)
    body = JSON.parse(requestBody)
  } catch {
    return jsonResponse({ error: 'The request was not valid JSON.' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Choose a conversation tone to continue.' }, 400)
  }

  const requestData = body as Record<string, unknown>
  const entries = Object.keys(requestData)
  if (entries.length !== 2 || !entries.includes('tone') || !entries.includes('goal')) {
    return jsonResponse({ error: 'Choose a tone and conversation goal.' }, 400)
  }

  const tone = requestData.tone
  if (typeof tone !== 'string' || !Object.hasOwn(tones, tone)) {
    return jsonResponse({ error: 'Choose Warm, Direct, or Low-pressure.' }, 400)
  }
  const goal = requestData.goal
  if (typeof goal !== 'string' || !Object.hasOwn(goals, goal)) {
    return jsonResponse({ error: 'Choose a supported conversation goal.' }, 400)
  }

  try {
    const output = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content: `You are Margin's conversation coach for shared homes. Write one natural first-person message that will be easy to say aloud. The goal is to ${goals[goal as CoachGoal]}. Use a ${tones[tone as Tone]} voice. Keep it under 75 words and at most three sentences. Do not invent names, dollar amounts, percentages, facts, or outcomes. Avoid blame, shame, pressure, and financial product advice. Return only the message.`,
        },
        {
          role: 'user',
          content: 'Draft the opener. Keep it practical, respectful, and specific to the selected goal.',
        },
      ],
      max_completion_tokens: 180,
      temperature: 0.65,
      store: false,
      chat_template_kwargs: { enable_thinking: false },
    })

    const message = extractText(output)
      .replace(/\s+/g, ' ')
      .replace(/^['"“”]+|['"“”]+$/g, '')
      .trim()
      .slice(0, 600)

    if (!message) return jsonResponse({ error: 'The coach did not return a message.' }, 502)
    if (/(?:[$€£]\s*\d|\b\d[\d,]*(?:\.\d+)?\s*%|\b\d{2,}\b)/.test(message)) {
      return jsonResponse({ error: 'The coach returned details that should stay private. Please try again.' }, 502)
    }
    return jsonResponse({ message, model: 'Google Gemma 4' })
  } catch {
    return jsonResponse({ error: 'The AI service is temporarily unavailable.' }, 503)
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/coach') return handleCoach(request, env)
    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'Not found.' }, 404)
    return env.ASSETS.fetch(request)
  },
}
