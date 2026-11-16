import { describe, expect, it } from 'vitest'
import { buildPlanCsv, calculateSplit, cloneDefaultPlan, parseCurrencyInput } from './finance'

describe('calculateSplit', () => {
  it('allocates the sample costs by disposable funds and keeps both percentages equal', () => {
    const plan = cloneDefaultPlan()
    const result = calculateSplit(plan.people, 1800)

    expect(result.available).toEqual([1200, 2400])
    expect(result.evenShares).toEqual([900, 900])
    expect(result.marginShares).toEqual([600, 1200])
    expect(result.contributionPercent).toBe(50)
  })

  it('keeps the total exact when cents do not divide evenly', () => {
    const people = [
      { name: 'A', takeHome: 1000, essentials: 500 },
      { name: 'B', takeHome: 1000, essentials: 500 },
    ] as const
    const result = calculateSplit(people, 10.01)

    expect(result.marginShares).toEqual([5.01, 5])
    const [firstShare, secondShare] = result.marginShares ?? [0, 0]
    expect(firstShare + secondShare).toBe(10.01)
  })

  it('uses a neutral even split as reference when either person has no available funds', () => {
    const people = [
      { name: 'A', takeHome: 1000, essentials: 1000 },
      { name: 'B', takeHome: 1000, essentials: 500 },
    ] as const
    const result = calculateSplit(people, 200)

    expect(result.marginShares).toBeNull()
    expect(result.evenShares).toEqual([100, 100])
    expect(result.shortfall).toBe(0)
  })

  it('reports a shortfall when shared costs exceed available funds', () => {
    const plan = cloneDefaultPlan()
    const result = calculateSplit(plan.people, 4000)

    expect(result.marginShares).toEqual([1333.33, 2666.67])
    expect(result.shortfall).toBe(400)
  })

  it('adds a one-time surprise bill to the same proportional calculation', () => {
    const plan = cloneDefaultPlan()
    const result = calculateSplit(plan.people, 1920)

    expect(result.marginShares).toEqual([640, 1280])
    expect(result.contributionPercent).toBe(53.3)
  })

  it('splits among three roommates and distributes rounding cents without losing money', () => {
    const people = [
      { takeHome: 1000, essentials: 0 },
      { takeHome: 2000, essentials: 0 },
      { takeHome: 3000, essentials: 0 },
    ]
    const result = calculateSplit(people, 100.01)
    expect(result.available).toEqual([1000, 2000, 3000])
    expect(result.evenShares).toEqual([33.34, 33.34, 33.33])
    expect(result.marginShares).toEqual([16.67, 33.34, 50])
    expect(result.marginShares?.reduce((cents, amount) => cents + Math.round(amount * 100), 0)).toBe(10001)
  })

  it('handles a full home and falls back clearly when one roommate has no available funds', () => {
    const people = Array.from({ length: 12 }, (_, index) => ({ takeHome: index === 4 ? 0 : 100, essentials: 0 }))
    const result = calculateSplit(people, 0.13)
    expect(result.marginShares).toBeNull()
    expect(result.evenShares).toHaveLength(12)
    expect(result.evenShares.reduce((cents, amount) => cents + Math.round(amount * 100), 0)).toBe(13)
  })

  it('does not silently cap the combined total when several large bills are entered', () => {
    const people = [
      { takeHome: 999_999_999.99, essentials: 0 },
      { takeHome: 999_999_999.99, essentials: 0 },
    ]
    const result = calculateSplit(people, 1_500_000_000)
    expect(result.total).toBe(1_500_000_000)
    expect(result.evenShares).toEqual([750_000_000, 750_000_000])
  })

  it('rounds decimal half-cents predictably and conserves every cent', () => {
    const people = [
      { name: 'A', takeHome: 10, essentials: 0 },
      { name: 'B', takeHome: 10, essentials: 0 },
    ] as const
    const result = calculateSplit(people, 1.005)

    expect(result.total).toBe(1.01)
    expect(result.marginShares).toEqual([0.51, 0.5])
  })

  it('keeps large splits cent-exact without floating-point share drift', () => {
    const people = [
      { name: 'A', takeHome: 999_999_999.99, essentials: 0 },
      { name: 'B', takeHome: 999_999_999.99, essentials: 0 },
    ] as const
    const result = calculateSplit(people, 999_999_999.99)

    expect(result.marginShares).toEqual([500_000_000, 499_999_999.99])
  })

  it('parses currency text to cents and rejects malformed or over-precise input', () => {
    expect(parseCurrencyInput('$1,234.56')).toBe(1234.56)
    expect(parseCurrencyInput('1.2')).toBe(1.2)
    expect(parseCurrencyInput('1.234')).toBeNull()
    expect(parseCurrencyInput('abc')).toBeNull()
    expect(parseCurrencyInput('1000000000')).toBeNull()
  })

  it('exports the month-specific plan with escaped user text and paid statuses', () => {
    const plan = cloneDefaultPlan()
    plan.bills[0] = { ...plan.bills[0], name: '=HYPERLINK("bad")', paidMonths: ['2026-11'] }
    const novemberCsv = buildPlanCsv(plan, '2026-11')
    const decemberCsv = buildPlanCsv(plan, '2026-12')

    expect(novemberCsv).toContain("'=HYPERLINK(\"\"bad\"\")")
    expect(novemberCsv).toContain('"Paid"')
    expect(novemberCsv).toContain('"Utilities","utilities","350.00","12","Planned"')
    expect(novemberCsv.startsWith('\uFEFF')).toBe(true)
    expect(decemberCsv).toContain('"1","Planned"')
  })
})
