import { MAX_AMOUNT, type BillCategory } from './finance'

export type InterpretMode = 'bills' | 'income'

export interface ExtractedBillItem {
  name: string
  amount: number
  dueDay: number
  category: BillCategory
  note: string
}

export interface BillsInterpretation {
  mode: 'bills'
  summary: string
  model: string
  items: ExtractedBillItem[]
}

export interface IncomeInterpretation {
  mode: 'income'
  summary: string
  model: string
  personName?: string
  takeHome: number
  essentials: number
  payFrequency: string
  notes: string[]
}

export type DocumentInterpretation = BillsInterpretation | IncomeInterpretation

const VALID_CATEGORIES = new Set<BillCategory>(['housing', 'utilities', 'food', 'transport', 'other'])

function clampMoney(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,\s]/g, ''))
  if (!Number.isFinite(num) || num < 0) return fallback
  return Math.round(Math.min(num, MAX_AMOUNT) * 100) / 100
}

function clampDueDay(value: unknown, fallback = 1): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(1, Math.min(31, Math.round(num)))
}

export function inferCategory(label: string): BillCategory {
  const lower = label.toLowerCase()
  if (/\b(rent|lease|mortgage|hoa|housing|apartment)\b/.test(lower)) return 'housing'
  if (/\b(utilit|electric|pg&e|pge|power|gas|water|sewer|trash|garbage|internet|wifi|wi-fi|broadband|fiber|comcast|xfinity|at&t|verizon)\b/.test(lower)) {
    return 'utilities'
  }
  if (/\b(grocer|food|market|trader joe|whole foods|safeway|costco|kroger|aldi|produce|household supplies|dining)\b/.test(lower)) {
    return 'food'
  }
  if (/\b(parking|garage|transit|bart|muni|uber|lyft|fuel|car|commute|pass)\b/.test(lower)) {
    return 'transport'
  }
  return 'other'
}

export function scrubSensitivePdfText(rawText: string): string {
  return rawText
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED-ACCT]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED-EMAIL]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
}

function decodePdfLiteralString(input: string): string {
  let out = ''
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch !== '\\') {
      out += ch
      i += 1
      continue
    }
    const next = input[i + 1] ?? ''
    if (next === 'n') {
      out += '\n'
      i += 2
    } else if (next === 'r') {
      out += '\r'
      i += 2
    } else if (next === 't') {
      out += '\t'
      i += 2
    } else if (/[0-7]/.test(next)) {
      const octal = input.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? next
      out += String.fromCharCode(parseInt(octal, 8))
      i += 1 + octal.length
    } else {
      out += next
      i += 2
    }
  }
  return out
}

function decodePdfHexString(hexInput: string): string {
  const clean = hexInput.replace(/[^0-9a-fA-F]/g, '')
  if (!clean) return ''
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean
  const bytes = new Uint8Array(padded.length / 2)
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
    }
    return text
  }
  let text = ''
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) text += String.fromCharCode(byte)
    else if (byte === 10 || byte === 13 || byte === 9) text += ' '
  }
  return text
}

function extractTextFromStreamContent(streamText: string): string[] {
  const chunks: string[] = []

  // Match TJ arrays: [(Hello) -20 (World)] TJ
  const tjArrayRegex = /\[((?:\\.|[^\]])*)\]\s*TJ/g
  let match: RegExpExecArray | null = tjArrayRegex.exec(streamText)
  while (match !== null) {
    const inner = match[1] ?? ''
    let line = ''
    const tokenRegex = /\(((?:\\.|[^\\)])*)\)|<([0-9a-fA-F\s]+)>/g
    let tok: RegExpExecArray | null = tokenRegex.exec(inner)
    while (tok !== null) {
      if (tok[1] !== undefined) line += decodePdfLiteralString(tok[1])
      else if (tok[2] !== undefined) line += decodePdfHexString(tok[2])
      tok = tokenRegex.exec(inner)
    }
    if (line.trim()) chunks.push(line.trim())
    match = tjArrayRegex.exec(streamText)
  }

  // Match single literal strings: (Hello world) Tj or ' or "
  const literalRegex = /\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g
  match = literalRegex.exec(streamText)
  while (match !== null) {
    const decoded = decodePdfLiteralString(match[1] ?? '').trim()
    if (decoded) chunks.push(decoded)
    match = literalRegex.exec(streamText)
  }

  // Match hex strings: <48656C6C6F> Tj
  const hexRegex = /<([0-9a-fA-F\s]+)>\s*Tj/g
  match = hexRegex.exec(streamText)
  while (match !== null) {
    const decoded = decodePdfHexString(match[1] ?? '').trim()
    if (decoded) chunks.push(decoded)
    match = hexRegex.exec(streamText)
  }

  return chunks
}

async function tryInflateStream(rawBytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(format)
      const writer = ds.writable.getWriter()
      const writePromise = writer.write(rawBytes).then(() => writer.close())
      const response = new Response(ds.readable)
      const buffer = await response.arrayBuffer()
      await writePromise
      return new TextDecoder('latin1').decode(new Uint8Array(buffer))
    } catch {
      // Try next decompression format
    }
  }
  return null
}

export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  const rawLatin1 = new TextDecoder('latin1').decode(bytes)

  // If it's not a PDF header, treat as plain UTF-8 text (e.g. .txt / .csv)
  if (!rawLatin1.startsWith('%PDF-')) {
    return new TextDecoder('utf-8').decode(bytes).trim()
  }

  const extractedSegments: string[] = []
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null = streamRegex.exec(rawLatin1)

  while (match !== null) {
    const bodyLatin1 = match[1] ?? ''
    const directChunks = extractTextFromStreamContent(bodyLatin1)
    if (directChunks.length > 0) {
      extractedSegments.push(...directChunks)
    } else {
      const streamBytes = new Uint8Array(bodyLatin1.length)
      for (let i = 0; i < bodyLatin1.length; i += 1) {
        streamBytes[i] = bodyLatin1.charCodeAt(i) & 0xff
      }
      const inflated = await tryInflateStream(streamBytes)
      if (inflated) {
        const inflatedChunks = extractTextFromStreamContent(inflated)
        if (inflatedChunks.length > 0) extractedSegments.push(...inflatedChunks)
      }
    }
    match = streamRegex.exec(rawLatin1)
  }

  if (extractedSegments.length === 0) {
    extractedSegments.push(...extractTextFromStreamContent(rawLatin1))
  }

  // Fallback: also scan readable parenthesized strings if no BT/ET operators matched
  if (extractedSegments.length === 0) {
    const fallbackParen = /\(([A-Za-z0-9$,.:/\-\s]{4,120})\)/g
    let fallbackMatch: RegExpExecArray | null = fallbackParen.exec(rawLatin1)
    while (fallbackMatch !== null) {
      extractedSegments.push(decodePdfLiteralString(fallbackMatch[1] ?? '').trim())
      fallbackMatch = fallbackParen.exec(rawLatin1)
    }
  }

  return extractedSegments.join('\n').replace(/\r\n/g, '\n').trim()
}

export function interpretDocumentLocally(mode: InterpretMode, rawText: string): DocumentInterpretation {
  const cleanText = rawText.replace(/\r/g, '\n')
  const lines = cleanText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (mode === 'bills') {
    const items: ExtractedBillItem[] = []
    const seenNames = new Set<string>()
    let globalDueDay = 1
    const dueMatch = cleanText.match(/\bdue(?:\s+date|\s+on|\s+day)?[:\s]+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i)
      ?? cleanText.match(/\b(\d{1,2})\/(\d{1,2})\/\d{2,4}\b/)
    if (dueMatch) {
      const parsedDay = Number(dueMatch[2] ?? dueMatch[1])
      if (parsedDay >= 1 && parsedDay <= 31) globalDueDay = parsedDay
    }

    const lineItemPatterns: Array<{ regex: RegExp; defaultName: string; category: BillCategory; defaultDue: number }> = [
      { regex: /\b(base\s+rent|monthly\s+rent|apartment\s+rent|rent)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Rent', category: 'housing', defaultDue: 1 },
      { regex: /\b(electric(?:ity)?(?:\s*&\s*gas)?|pg&e|power\s+bill|energy\s+charge)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Electric & Gas', category: 'utilities', defaultDue: 12 },
      { regex: /\b(water(?:\s*&\s*sewer)?|trash(?:\s*&\s*water)?|utilities|utility\s+fee)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Water & Trash', category: 'utilities', defaultDue: 15 },
      { regex: /\b(fiber\s+internet|internet|wi-?fi|broadband|xfinity|comcast)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Internet & Wi-Fi', category: 'utilities', defaultDue: 18 },
      { regex: /\b(groceries|grocery\s+total|trader\s+joe'?s|whole\s+foods|costco\s+wholesale|safeway|market\s+receipt)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Groceries', category: 'food', defaultDue: 20 },
      { regex: /\b(parking(?:\s+spot)?|transit\s+pass|shared\s+car)\b[^$\d\n]{0,40}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i, defaultName: 'Parking & Transit', category: 'transport', defaultDue: 1 },
    ]

    for (const pattern of lineItemPatterns) {
      const m = cleanText.match(pattern.regex)
      if (m) {
        const amount = clampMoney(m[2], 0)
        if (amount > 0 && !seenNames.has(pattern.defaultName.toLowerCase())) {
          seenNames.add(pattern.defaultName.toLowerCase())
          items.push({
            name: pattern.defaultName,
            amount,
            dueDay: globalDueDay !== 1 ? globalDueDay : pattern.defaultDue,
            category: pattern.category,
            note: `Extracted from "${m[1].trim()}"`,
          })
        }
      }
    }

    // Also parse generic "Label: $123.45" or "Label ... $123.45 (Due 15th)" lines
    for (const line of lines) {
      if (/\b(total\s+income|take-?home|net\s+pay|gross\s+pay|account\s+number|balance\s+forward)\b/i.test(line)) continue
      const matchLine = line.match(/^([A-Za-z][A-Za-z0-9\s&/'-]{2,32}?)\s*[:\-–]?\s*\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*\(?due\s+(\d{1,2})(?:st|nd|rd|th)?\)?)?/i)
      if (!matchLine) continue
      const rawName = matchLine[1].trim()
      if (/^(total|subtotal|amount\s+due|balance)$/i.test(rawName) && items.length > 0) continue
      const amount = clampMoney(matchLine[2], 0)
      if (amount <= 0) continue
      const normalizedKey = rawName.toLowerCase()
      if (seenNames.has(normalizedKey)) continue
      const cat = inferCategory(rawName)
      if ([...seenNames].some((existing) => existing.includes(normalizedKey) || normalizedKey.includes(existing))) continue
      seenNames.add(normalizedKey)
      items.push({
        name: rawName.slice(0, 34),
        amount,
        dueDay: matchLine[3] ? clampDueDay(matchLine[3], globalDueDay) : globalDueDay,
        category: cat,
        note: 'Parsed from document line item',
      })
    }

    // If still empty, look for a single statement total
    if (items.length === 0) {
      const totalMatch = cleanText.match(/\b(?:total\s+amount\s+due|amount\s+due|total\s+due|statement\s+total|total)\b[^$\d\n]{0,30}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i)
        ?? cleanText.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/)
      const fallbackAmount = totalMatch ? clampMoney(totalMatch[1], 0) : 0
      if (fallbackAmount > 0) {
        const inferredCat = inferCategory(cleanText)
        const inferredName = inferredCat === 'housing'
          ? 'Monthly Rent'
          : inferredCat === 'utilities'
            ? 'Utility Statement'
            : inferredCat === 'food'
              ? 'Groceries Receipt'
              : 'Shared Expense'
        items.push({
          name: inferredName,
          amount: fallbackAmount,
          dueDay: globalDueDay,
          category: inferredCat,
          note: 'Extracted statement total',
        })
      }
    }

    const totalExtracted = items.reduce((sum, item) => sum + item.amount, 0)
    return {
      mode: 'bills',
      summary: items.length > 0
        ? `Identified ${items.length} shared ${items.length === 1 ? 'expense' : 'expenses'} totaling $${totalExtracted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`
        : 'Could not find dollar amounts in this document. Try a PDF with selectable text.',
      model: 'Margin Document Interpreter',
      items: items.slice(0, 12),
    }
  }

  // mode === 'income'
  let payFrequency = 'Monthly'
  let multiplier = 1
  if (/\b(bi-?weekly|every\s+two\s+weeks|26\s+pay\s+periods)\b/i.test(cleanText)) {
    payFrequency = 'Biweekly (×26 / 12)'
    multiplier = 26 / 12
  } else if (/\b(semi-?monthly|twice\s+a\s+month|24\s+pay\s+periods)\b/i.test(cleanText)) {
    payFrequency = 'Semi-monthly (×2)'
    multiplier = 2
  } else if (/\b(weekly|52\s+pay\s+periods)\b/i.test(cleanText)) {
    payFrequency = 'Weekly (×52 / 12)'
    multiplier = 52 / 12
  }

  const nameMatch = cleanText.match(/\b(?:employee|roommate|prepared[ \t]+for|name)[ \t]*:[ \t]*([A-Za-z]+(?:[ \t]+[A-Za-z]+)?)/i)
  const personName = nameMatch?.[1]?.trim()

  const monthlyTakeHomeMatch = cleanText.match(/\b(?:monthly\s+take-?home|monthly\s+net\s+pay|net\s+monthly\s+income)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i)
  const periodNetMatch = cleanText.match(/\b(?:net\s+pay|take-?home\s+pay|net\s+deposit|direct\s+deposit\s+amount)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i)
  const grossMatch = cleanText.match(/\b(?:gross\s+pay|monthly\s+gross)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i)

  const notes: string[] = []
  let takeHome = 0
  if (monthlyTakeHomeMatch) {
    takeHome = clampMoney(monthlyTakeHomeMatch[1], 0)
    notes.push(`Monthly net take-home pay read directly: $${takeHome.toLocaleString('en-US')}`)
  } else if (periodNetMatch) {
    const rawNet = clampMoney(periodNetMatch[1], 0)
    takeHome = clampMoney(Math.round(rawNet * multiplier), 0)
    if (multiplier !== 1) {
      notes.push(`Converted ${payFrequency.toLowerCase()} net pay ($${rawNet.toLocaleString('en-US')}) to monthly take-home: $${takeHome.toLocaleString('en-US')}`)
    } else {
      notes.push(`Net take-home pay identified: $${takeHome.toLocaleString('en-US')}`)
    }
  } else if (grossMatch) {
    const rawGross = clampMoney(grossMatch[1], 0)
    takeHome = clampMoney(Math.round(rawGross * multiplier * 0.74), 0)
    notes.push(`Estimated monthly net take-home (74% of gross $${rawGross.toLocaleString('en-US')}): $${takeHome.toLocaleString('en-US')}`)
  }

  const directEssentialsMatch = cleanText.match(/\b(?:total\s+personal\s+essentials|monthly\s+essentials|personal\s+essentials)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i)
  let essentials = 0
  if (directEssentialsMatch) {
    essentials = clampMoney(directEssentialsMatch[1], 0)
    notes.push(`Personal essentials total read directly: $${essentials.toLocaleString('en-US')}`)
  } else {
    const essentialCategories = [
      { label: 'Student loan', regex: /\b(student\s+loan|tuition)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i },
      { label: 'Car & transit', regex: /\b(auto\s+loan|car\s+payment|car\s+insurance|commute|transit)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i },
      { label: 'Health & medical', regex: /\b(health\s+insurance|medical|dental|therapy|pharmacy)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i },
      { label: 'Personal groceries & phone', regex: /\b(personal\s+groceries|phone\s+bill|mobile\s+plan|gym|personal\s+bills)\b[^$\d\n]{0,35}\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i },
    ]
    for (const item of essentialCategories) {
      const m = cleanText.match(item.regex)
      if (m) {
        const amt = clampMoney(m[2], 0)
        if (amt > 0) {
          essentials = clampMoney(essentials + amt, 0)
          notes.push(`${item.label}: $${amt.toLocaleString('en-US')}`)
        }
      }
    }
  }

  const available = Math.max(0, takeHome - essentials)
  return {
    mode: 'income',
    summary: takeHome > 0
      ? `Calculated $${takeHome.toLocaleString('en-US')}/mo take-home pay and $${essentials.toLocaleString('en-US')}/mo personal essentials ($${available.toLocaleString('en-US')}/mo available margin).`
      : 'Could not automatically find net pay in this file. Check that the PDF contains selectable text.',
    model: 'Margin Document Interpreter',
    personName,
    takeHome,
    essentials,
    payFrequency,
    notes,
  }
}

export function sanitizeInterpretationPayload(mode: InterpretMode, raw: unknown, fallbackText: string): DocumentInterpretation {
  const localFallback = interpretDocumentLocally(mode, fallbackText)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return localFallback
  const record = raw as Record<string, unknown>

  if (mode === 'bills') {
    const rawItems = Array.isArray(record.items) ? record.items : []
    const items: ExtractedBillItem[] = rawItems
      .map((entry): ExtractedBillItem | null => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
        const item = entry as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, 36) : ''
        const amount = clampMoney(item.amount, 0)
        if (!name || amount <= 0) return null
        const rawCat = typeof item.category === 'string' ? item.category.toLowerCase() as BillCategory : inferCategory(name)
        const category = VALID_CATEGORIES.has(rawCat) ? rawCat : inferCategory(name)
        const dueDay = clampDueDay(item.dueDay, 1)
        const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim().slice(0, 90) : 'Interpreted by AI'
        return { name, amount, dueDay, category, note }
      })
      .filter((item): item is ExtractedBillItem => item !== null)
      .slice(0, 12)

    if (items.length === 0) return localFallback
    const summary = typeof record.summary === 'string' && record.summary.trim()
      ? record.summary.trim().slice(0, 260)
      : (localFallback as BillsInterpretation).summary
    const model = typeof record.model === 'string' && record.model.trim() ? record.model.trim() : 'Google Gemma 4'
    return { mode: 'bills', summary, model, items }
  }

  const fallbackIncome = localFallback as IncomeInterpretation
  const takeHome = clampMoney(record.takeHome, fallbackIncome.takeHome)
  const essentials = clampMoney(record.essentials, fallbackIncome.essentials)
  if (takeHome <= 0 && fallbackIncome.takeHome > 0) return fallbackIncome
  const payFrequency = typeof record.payFrequency === 'string' && record.payFrequency.trim()
    ? record.payFrequency.trim().slice(0, 40)
    : fallbackIncome.payFrequency
  const notes = Array.isArray(record.notes)
    ? record.notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim().slice(0, 110)).slice(0, 6)
    : fallbackIncome.notes
  const summary = typeof record.summary === 'string' && record.summary.trim()
    ? record.summary.trim().slice(0, 260)
    : fallbackIncome.summary
  const model = typeof record.model === 'string' && record.model.trim() ? record.model.trim() : 'Google Gemma 4'
  return {
    mode: 'income',
    summary,
    model,
    personName: typeof record.personName === 'string' ? record.personName.trim().slice(0, 28) : fallbackIncome.personName,
    takeHome,
    essentials,
    payFrequency,
    notes: notes.length > 0 ? notes : fallbackIncome.notes,
  }
}

export function buildSamplePdfBytes(kind: 'lease-bills' | 'grocery-utility' | 'paystub-income'): Uint8Array<ArrayBuffer> {
  const linesByKind: Record<typeof kind, string[]> = {
    'lease-bills': [
      'SHARED HOME MONTHLY LEASE & UTILITY STATEMENT',
      'Billing Period: November 2026 | Due Date: 1st of the month',
      'Apartment Rent: $2,100.00 (Due 1st)',
      'Electric & Gas (PG&E): $185.00 (Due 14th)',
      'Fiber Internet (Sonic Wi-Fi): $75.00 (Due 18th)',
      'Water & Trash Service: $65.00 (Due 15th)',
      'Total Shared Household Statement: $2,425.00',
    ],
    'grocery-utility': [
      'HOUSEHOLD GROCERIES & SUPPLIES RECEIPT',
      'Store: Trader Joe\'s & Costco Shared Run',
      'Groceries: $310.00 (Due 20th)',
      'Electric & Gas: $140.00 (Due 12th)',
    ],
    'paystub-income': [
      'EMPLOYEE EARNINGS & PERSONAL ESSENTIALS STATEMENT',
      'Prepared for: Maya',
      'Pay Frequency: Bi-weekly (26 pay periods)',
      'Net Pay (Direct Deposit Amount): $1,500.00',
      'Monthly Take-Home Pay: $3,250.00',
      'Student Loan Payment: $380.00',
      'Car Payment & Transit Pass: $420.00',
      'Health Insurance & Medical: $250.00',
      'Personal Groceries & Phone Bill: $550.00',
      'Total Personal Essentials: $1,600.00',
    ],
  }

  const lines = linesByKind[kind]
  const contentStreamLines = [
    'BT',
    '/F1 12 Tf',
    '48 740 Td',
    '18 TL',
    ...lines.map((line, idx) => {
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
      return idx === 0 ? `(${escaped}) Tj` : `T* (${escaped}) Tj`
    }),
    'ET',
  ]
  const streamBody = contentStreamLines.join('\n')
  const pdfText = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n')

  return new TextEncoder().encode(pdfText)
}
