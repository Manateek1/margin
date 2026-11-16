export type Tone = 'warm' | 'direct' | 'low-pressure'
export type CoachGoal = 'start-talk' | 'review-split' | 'talk-change' | 'monthly-checkin'
export type SplitMode = 'proportional' | 'equal'
export type BillCategory = 'housing' | 'utilities' | 'food' | 'transport' | 'other'

export interface Person {
  id: string
  avatar: number
  name: string
  takeHome: number
  essentials: number
}

export interface Bill {
  id: string
  name: string
  amount: number
  dueDay: number
  category: BillCategory
  paidMonths: string[]
}

export interface HouseholdPlan {
  people: Person[]
  bills: Bill[]
  splitMode: SplitMode
}

export interface SplitResult {
  total: number
  available: number[]
  totalAvailable: number
  evenShares: number[]
  marginShares: number[] | null
  contributionPercent: number | null
  shortfall: number
}

export const MAX_AMOUNT = 999_999_999.99
export const MAX_PEOPLE = 12
// Forty costs plus one temporary scenario remain far below Number's safe integer limit in cents.
export const MAX_TOTAL = MAX_AMOUNT * 41

export const DEFAULT_PLAN: HouseholdPlan = {
  people: [
    { id: 'maya', avatar: 2, name: 'Maya', takeHome: 2800, essentials: 1600 },
    { id: 'leo', avatar: 0, name: 'Leo', takeHome: 4800, essentials: 2400 },
  ],
  bills: [
    { id: 'rent', name: 'Rent', amount: 1200, dueDay: 1, category: 'housing', paidMonths: [] },
    { id: 'utilities', name: 'Utilities', amount: 350, dueDay: 12, category: 'utilities', paidMonths: [] },
    { id: 'groceries', name: 'Groceries', amount: 250, dueDay: 18, category: 'food', paidMonths: [] },
  ],
  splitMode: 'proportional',
}

export function parseCurrencyInput(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, '')
  if (!normalized || normalized === '.') return 0
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return null

  const [wholePart = '0', fractionalPart = ''] = normalized.split('.')
  if (wholePart.length > 9) return null
  const cents = BigInt(wholePart || '0') * 100n + BigInt(fractionalPart.padEnd(2, '0') || '0')
  if (cents > 99_999_999_999n) return null
  return Number(cents) / 100
}

export function cloneDefaultPlan(): HouseholdPlan {
  return {
    people: DEFAULT_PLAN.people.map((person) => ({ ...person })),
    bills: DEFAULT_PLAN.bills.map((bill) => ({ ...bill, paidMonths: [...bill.paidMonths] })),
    splitMode: DEFAULT_PLAN.splitMode,
  }
}

function toCents(amount: number, maximum = MAX_AMOUNT): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0

  const value = Math.min(amount, maximum)
  const [coefficient = '0', exponentText = '0'] = value.toString().toLowerCase().split('e')
  const [wholePart = '0', fractionalPart = ''] = coefficient.split('.')
  const digits = BigInt(`${wholePart}${fractionalPart}` || '0')
  const centExponent = Number(exponentText) + 2 - fractionalPart.length

  if (centExponent >= 0) return Number(digits * 10n ** BigInt(centExponent))
  const divisor = 10n ** BigInt(-centExponent)
  return Number((digits + divisor / 2n) / divisor)
}

function fromCents(cents: number): number {
  return cents / 100
}

function splitEvenly(totalCents: number, count: number): number[] {
  if (count === 0) return []
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count
  return Array.from({ length: count }, (_, index) => fromCents(base + (index < remainder ? 1 : 0)))
}

export function calculateSplit(people: readonly Pick<Person, 'takeHome' | 'essentials'>[], total: number): SplitResult {
  const totalCents = toCents(total, MAX_TOTAL)
  const availableCents = people.map((person) =>
    Math.max(0, toCents(person.takeHome) - toCents(person.essentials)),
  )
  const totalAvailableCents = availableCents.reduce((sum, amount) => sum + amount, 0)
  const evenShares = splitEvenly(totalCents, people.length)

  if (availableCents.some((amount) => amount <= 0) || totalAvailableCents <= 0) {
    return {
      total: fromCents(totalCents),
      available: availableCents.map(fromCents),
      totalAvailable: fromCents(totalAvailableCents),
      evenShares,
      marginShares: null,
      contributionPercent: null,
      shortfall: Math.max(0, fromCents(totalCents - totalAvailableCents)),
    }
  }

  const denominator = BigInt(totalAvailableCents)
  // Allocate whole cents first, then give remaining cents to the largest remainders.
  // Stable index ordering resolves ties and guarantees every cent is accounted for.
  const allocations = availableCents.map((available, index) => {
    const numerator = BigInt(totalCents) * BigInt(available)
    return { index, cents: Number(numerator / denominator), remainder: numerator % denominator }
  })
  const remaining = totalCents - allocations.reduce((sum, item) => sum + item.cents, 0)
  const ranked = [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
  for (let index = 0; index < remaining; index += 1) ranked[index].cents += 1
  const contributionPercent = (totalCents / totalAvailableCents) * 100

  return {
    total: fromCents(totalCents),
    available: availableCents.map(fromCents),
    totalAvailable: fromCents(totalAvailableCents),
    evenShares,
    marginShares: allocations.map((item) => fromCents(item.cents)),
    contributionPercent: Math.round(contributionPercent * 10) / 10,
    shortfall: Math.max(0, fromCents(totalCents - totalAvailableCents)),
  }
}

function csvCell(value: string | number): string {
  const text = String(value)
  const safeText = /^[=+@-]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

export function buildPlanCsv(plan: HouseholdPlan, monthId: string): string {
  const rows: Array<Array<string | number>> = [
    ['Margin shared home plan', monthId],
    [],
    ['People', 'Take-home', 'Essentials', 'Available after essentials'],
    ...plan.people.map((person) => [
      person.name,
      person.takeHome.toFixed(2),
      person.essentials.toFixed(2),
      Math.max(0, person.takeHome - person.essentials).toFixed(2),
    ]),
    [],
    ['Shared cost', 'Category', 'Amount', 'Due day', 'Status'],
    ...[...plan.bills]
      .sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name))
      .map((bill) => [
        bill.name,
        bill.category,
        bill.amount.toFixed(2),
        bill.dueDay,
        bill.paidMonths.includes(monthId) ? 'Paid' : 'Planned',
      ]),
  ]

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0)
}

export function formatNumber(amount: number): string {
  return numberFormatter.format(Number.isFinite(amount) ? amount : 0)
}
