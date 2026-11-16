import { describe, expect, it } from 'vitest'
import {
  buildSamplePdfBytes,
  extractTextFromPdfBuffer,
  interpretDocumentLocally,
  scrubSensitivePdfText,
} from './pdfInterpreter'

describe('PDF extraction and AI document interpreter', () => {
  it('extracts text from generated lease & utility PDF and interprets shared bills', async () => {
    const pdfBytes = buildSamplePdfBytes('lease-bills')
    const extracted = await extractTextFromPdfBuffer(pdfBytes.buffer)

    expect(extracted).toContain('Apartment Rent: $2,100.00')
    expect(extracted).toContain('Electric & Gas')

    const interpreted = interpretDocumentLocally('bills', extracted)
    expect(interpreted.mode).toBe('bills')
    if (interpreted.mode === 'bills') {
      expect(interpreted.items.length).toBeGreaterThanOrEqual(3)
      const rent = interpreted.items.find((item) => item.category === 'housing')
      expect(rent?.amount).toBe(2100)
    }
  })

  it('extracts text from generated biweekly paystub PDF and calculates monthly take-home and essentials', async () => {
    const pdfBytes = buildSamplePdfBytes('paystub-income')
    const extracted = await extractTextFromPdfBuffer(pdfBytes.buffer)

    const interpreted = interpretDocumentLocally('income', extracted)
    expect(interpreted.mode).toBe('income')
    if (interpreted.mode === 'income') {
      expect(interpreted.personName).toBe('Maya')
      expect(interpreted.takeHome).toBe(3250)
      expect(interpreted.essentials).toBe(1600)
    }
  })

  it('redacts SSNs, long account numbers, and emails before sending to cloud AI', () => {
    const raw = 'SSN 123-45-6789 Account 4532015112830366 email maya@example.com Rent: $1,800'
    const scrubbed = scrubSensitivePdfText(raw)
    expect(scrubbed).not.toContain('123-45-6789')
    expect(scrubbed).not.toContain('4532015112830366')
    expect(scrubbed).not.toContain('maya@example.com')
    expect(scrubbed).toContain('Rent: $1,800')
  })
})
