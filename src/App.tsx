import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Download,
  House,
  Layers3,
  LockKeyhole,
  MessageCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import {
  buildPlanCsv,
  calculateSplit,
  cloneDefaultPlan,
  formatCurrency,
  formatNumber,
  MAX_AMOUNT,
  MAX_PEOPLE,
  MAX_TOTAL,
  parseCurrencyInput,
  type Bill,
  type BillCategory,
  type CoachGoal,
  type HouseholdPlan,
  type Person,
  type SplitMode,
  type Tone,
} from './lib/finance'
import { usePlanVault } from './lib/usePlanVault'
import { MIN_PASSWORD_LENGTH } from './lib/vault'
import { DocumentInterpreterCard, QuickDivvyStudio } from './DocumentInterpreterCard'
import { LandingPage } from './LandingPage'
import './App.css'

const STORAGE_KEY = 'margin-plan-v3'
const PREVIOUS_STORAGE_KEY = 'margin-plan-v2'
const LEGACY_STORAGE_KEY = 'margin-household-v1'
const MAX_BILLS = 40
const CATEGORIES: { value: BillCategory; label: string }[] = [
  { value: 'housing', label: 'Housing' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]
const TONES: { value: Tone; label: string; helper: string }[] = [
  { value: 'warm', label: 'Warm', helper: 'Kind and reassuring' },
  { value: 'direct', label: 'Clear', helper: 'Short and straightforward' },
  { value: 'low-pressure', label: 'Gentle', helper: 'Easy, no-pressure start' },
]
const GOALS: { value: CoachGoal; label: string; description: string }[] = [
  { value: 'start-talk', label: 'Start the conversation', description: 'Open a calm conversation about shared costs.' },
  { value: 'review-split', label: 'Review our split', description: 'Ask if the current contribution still feels fair.' },
  { value: 'talk-change', label: 'Talk about a change', description: 'Bring up a new bill or an unexpected expense.' },
  { value: 'monthly-checkin', label: 'Monthly check-in', description: 'Make space to adjust the plan together.' },
]

type Page = 'overview' | 'plan' | 'people' | 'scenarios' | 'coach' | 'security'
type ScenarioKind = 'expense' | 'credit'

const NAV_ITEMS: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'overview', label: 'Overview', icon: House },
  { id: 'plan', label: 'Monthly plan', icon: CalendarDays },
  { id: 'people', label: 'Roommates', icon: Users },
  { id: 'scenarios', label: 'Scenarios', icon: Layers3 },
  { id: 'coach', label: 'AI coach', icon: MessageCircle },
  { id: 'security', label: 'Security', icon: ShieldCheck },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeAmount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, MAX_AMOUNT)
    : fallback
}

function sanitizePeople(value: unknown): Person[] {
  const defaults = cloneDefaultPlan().people
  const source = Array.isArray(value) && value.length ? value.slice(0, MAX_PEOPLE) : defaults
  const usedIds = new Set<string>()
  return source.map((entry, index) => {
    const person = isRecord(entry) ? entry : {}
    const fallback = defaults[index] ?? { id: `person-${index}`, avatar: index % 12, name: `Roommate ${index + 1}`, takeHome: 0, essentials: 0 }
    const requestedId = typeof person.id === 'string' && person.id.length > 0 && person.id.length <= 80 ? person.id : fallback.id
    const id = usedIds.has(requestedId) ? `${fallback.id}-${index}` : requestedId
    usedIds.add(id)
    return {
      id,
      avatar: typeof person.avatar === 'number' && Number.isInteger(person.avatar) && person.avatar >= 0 && person.avatar < 12 ? person.avatar : fallback.avatar,
      name: typeof person.name === 'string' ? person.name.trim().slice(0, 28) : fallback.name,
      takeHome: safeAmount(person.takeHome, fallback.takeHome),
      essentials: safeAmount(person.essentials, fallback.essentials),
    }
  })
}

function sanitizeBill(value: unknown, index: number): Bill {
  const fallback = cloneDefaultPlan().bills[index % 3]
  const bill = isRecord(value) ? value : {}
  const validCategory = CATEGORIES.some((category) => category.value === bill.category)
  const name = typeof bill.name === 'string' ? bill.name.trim().slice(0, 36) : ''
  const rawPaidMonths = Array.isArray(bill.paidMonths)
    ? bill.paidMonths
    : typeof bill.paidForMonth === 'string' ? [bill.paidForMonth] : []
  const paidMonths = [...new Set(rawPaidMonths.filter((paidMonth): paidMonth is string =>
    typeof paidMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(paidMonth),
  ))].slice(-60)
  return {
    id: typeof bill.id === 'string' && bill.id.length <= 80 ? bill.id : `saved-${index}`,
    name: name || fallback.name,
    amount: safeAmount(bill.amount, 0),
    dueDay: typeof bill.dueDay === 'number' && Number.isFinite(bill.dueDay)
      ? Math.max(1, Math.min(31, Math.floor(bill.dueDay)))
      : fallback.dueDay,
    category: validCategory ? bill.category as BillCategory : fallback.category,
    paidMonths,
  }
}

function sanitizeStoredPlan(value: unknown): HouseholdPlan | null {
  if (!isRecord(value) || !Array.isArray(value.people) || value.people.length === 0 || !Array.isArray(value.bills)) return null
  return {
    people: sanitizePeople(value.people),
    bills: value.bills.slice(0, MAX_BILLS).map(sanitizeBill),
    splitMode: value.splitMode === 'equal' ? 'equal' : 'proportional',
  }
}

function readPlan(): HouseholdPlan {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (isRecord(parsed)) {
        const bills = Array.isArray(parsed.bills) ? parsed.bills.slice(0, MAX_BILLS).map(sanitizeBill) : []
        return {
          people: sanitizePeople(parsed.people),
          bills,
          splitMode: parsed.splitMode === 'equal' ? 'equal' : 'proportional',
        }
      }
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy)
      if (isRecord(parsed)) {
        const defaults = cloneDefaultPlan()
        const oldCosts = isRecord(parsed.costs) ? parsed.costs : {}
        return {
          people: sanitizePeople(parsed.people),
          bills: defaults.bills.map((bill) => ({
            ...bill,
            amount: safeAmount(oldCosts[bill.id], bill.amount),
          })),
          splitMode: 'proportional',
        }
      }
    }
  } catch {
    return cloneDefaultPlan()
  }
  return cloneDefaultPlan()
}

function currentMonthId(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(monthId: string, amount: number): string {
  const [year, month] = monthId.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1)
  return currentMonthId(date)
}

function formatMonth(monthId: string): string {
  const [year, month] = monthId.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function ordinal(day: number): string {
  const remainder = day % 100
  if (remainder >= 11 && remainder <= 13) return `${day}th`
  if (day % 10 === 1) return `${day}st`
  if (day % 10 === 2) return `${day}nd`
  if (day % 10 === 3) return `${day}rd`
  return `${day}th`
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sumBills(bills: Bill[]): number {
  const cents = bills.reduce((sum, bill) => sum + Math.round(bill.amount * 100), 0)
  return cents / 100
}

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(formatNumber(value))

  return (
    <label className="money-field">
      <span className="field-label">{label}</span>
      <span className="money-input-wrap">
        <span aria-hidden="true">$</span>
        <input
          aria-label={label}
          autoComplete="off"
          inputMode="decimal"
          maxLength={16}
          type="text"
          value={editing ? draft : formatNumber(value)}
          onFocus={() => {
            setEditing(true)
            setDraft(value === 0 ? '' : String(value))
          }}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            const parsed = parseCurrencyInput(next)
            if (parsed !== null) onChange(parsed)
          }}
          onBlur={() => {
            const parsed = parseCurrencyInput(draft)
            if (parsed !== null) onChange(parsed)
            setDraft(formatNumber(parsed ?? value))
            setEditing(false)
          }}
        />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function Brand({ onClick }: { onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" className="brand-lockup brand-lockup--button" onClick={onClick} title="Back to landing page">
        <span className="brand-mark"><House size={20} strokeWidth={2.4} aria-hidden="true" /></span>
        <span>Margin</span>
      </button>
    )
  }
  return (
    <div className="brand-lockup">
      <span className="brand-mark"><House size={20} strokeWidth={2.4} aria-hidden="true" /></span>
      <span>Margin</span>
    </div>
  )
}

function RoommateAvatar({ person, className = '' }: { person: Person; className?: string }) {
  const x = (person.avatar % 4) * 100 / 3
  const y = Math.floor(person.avatar / 4) * 50
  return <span className={`roommate-avatar ${className}`} style={{ backgroundPosition: `${x}% ${y}%` }} aria-hidden="true" />
}

function LockScreen({ busy, message, onUnlock }: { busy: boolean; message: string; onUnlock: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await onUnlock(password)) setPassword('')
  }
  return <main className="lock-screen">
    <div className="lock-screen-brand"><Brand /></div>
    <section className="lock-screen-card" aria-labelledby="unlock-title">
      <span className="security-hero-icon"><LockKeyhole size={24} aria-hidden="true" /></span>
      <h1 id="unlock-title">Welcome back.</h1>
      <p>Enter your password to unlock the plan saved on this device.</p>
      <form onSubmit={submit} className="security-form">
        <label className="security-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required autoFocus /></label>
        {message && <p className="security-message" role="alert">{message}</p>}
        <button className="button button--primary security-submit" type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock plan'} <ArrowRight size={16} /></button>
      </form>
      <div className="security-note"><ShieldCheck size={17} /><span>Your password stays on this device. There is no password reset, so keep it somewhere safe.</span></div>
    </section>
  </main>
}

function App() {
  const { plan, setPlan, status: vaultStatus, saveState, busy: vaultBusy, message: vaultMessage, setMessage: setVaultMessage, enable: enableVault, unlock: unlockProtectedPlan, lock: lockVault, disable: disableVault } = usePlanVault(readPlan, sanitizeStoredPlan, cloneDefaultPlan)
  const [showLanding, setShowLanding] = useState(true)
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState(currentMonthId)
  const [scenarioAmount, setScenarioAmount] = useState(120)
  const [scenarioKind, setScenarioKind] = useState<ScenarioKind>('expense')
  const [scenarioApplied, setScenarioApplied] = useState(false)
  const [newBillOpen, setNewBillOpen] = useState(false)
  const [newBillName, setNewBillName] = useState('')
  const [newBillAmount, setNewBillAmount] = useState('')
  const [newBillDueDay, setNewBillDueDay] = useState('1')
  const [newBillCategory, setNewBillCategory] = useState<BillCategory>('other')
  const [billError, setBillError] = useState('')
  const [tone, setTone] = useState<Tone>('warm')
  const [goal, setGoal] = useState<CoachGoal>('start-talk')
  const [coachMessage, setCoachMessage] = useState('')
  const [coachModel, setCoachModel] = useState('')
  const [coachBusy, setCoachBusy] = useState(false)
  const [coachError, setCoachError] = useState('')
  const [copyMessageError, setCopyMessageError] = useState('')
  const [notice, setNotice] = useState('')
  const [undoBill, setUndoBill] = useState<Bill | null>(null)
  const [undoPerson, setUndoPerson] = useState<{ person: Person; index: number } | null>(null)
  const [vaultPassword, setVaultPassword] = useState('')
  const [vaultConfirmation, setVaultConfirmation] = useState('')
  const [vaultFormError, setVaultFormError] = useState('')

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (vaultStatus !== 'locked') return undefined
    const timer = window.setTimeout(() => {
      setPage('overview')
      setCoachMessage('')
      setCoachModel('')
      setCoachError('')
      setUndoBill(null)
      setUndoPerson(null)
      setNotice('')
      setNewBillName('')
      setNewBillAmount('')
      setNewBillOpen(false)
      setVaultPassword('')
      setVaultConfirmation('')
      setVaultFormError('')
      setScenarioApplied(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [vaultStatus])

  const baseTotal = useMemo(() => sumBills(plan.bills), [plan.bills])
  const scenarioDelta = scenarioKind === 'expense' ? scenarioAmount : -scenarioAmount
  const currentTotal = Math.min(MAX_TOTAL, Math.max(0, baseTotal + (scenarioApplied ? scenarioDelta : 0)))
  const baselineSplit = useMemo(() => calculateSplit(plan.people, baseTotal), [plan.people, baseTotal])
  const split = useMemo(() => calculateSplit(plan.people, currentTotal), [plan.people, currentTotal])
  const selectedShares = plan.splitMode === 'equal' || !split.marginShares ? split.evenShares : split.marginShares
  const availableAfterPlan = Math.max(0, split.totalAvailable - split.total)
  const billCount = plan.bills.length
  const paidCount = plan.bills.filter((bill) => bill.paidMonths.includes(month)).length
  const allPaid = billCount > 0 && paidCount === billCount
  const pageCopy: Record<Page, { title: string; subtitle: string }> = {
    overview: { title: 'Your home, in sync.', subtitle: 'A little more clarity for life with roommates.' },
    plan: { title: 'Know what is due and what is done.', subtitle: 'Keep recurring costs in one place and mark them off as the month moves along.' },
    people: { title: 'A little room for everyone.', subtitle: 'Add your roommates and build a split that works for your home.' },
    scenarios: { title: 'Try the change before it lands.', subtitle: 'Preview a surprise cost or credit and see exactly how much it shifts the plan.' },
    coach: { title: 'Find a better way to bring it up.', subtitle: 'Draft a kind, specific opener for the conversation you actually need to have.' },
    security: { title: 'Your space, protected.', subtitle: 'Choose how this browser protects your roommate plan.' },
  }

  const updatePerson = (id: string, patch: Partial<Person>) => {
    setPlan((current) => ({
      ...current,
      people: current.people.map((person) => person.id === id ? { ...person, ...patch } : person),
    }))
  }

  const addPerson = () => {
    if (plan.people.length >= MAX_PEOPLE) return
    setPlan((current) => ({ ...current, people: [...current.people, { id: newId(), avatar: current.people.length % 12, name: `Roommate ${current.people.length + 1}`, takeHome: 0, essentials: 0 }] }))
    setNotice('Roommate added. Enter their income and essentials to update the split.')
  }

  const removePerson = (person: Person) => {
    if (plan.people.length <= 1) return
    setUndoBill(null)
    setUndoPerson({ person, index: plan.people.findIndex((item) => item.id === person.id) })
    setPlan((current) => ({ ...current, people: current.people.filter((item) => item.id !== person.id) }))
    setNotice(`${person.name || 'Roommate'} removed from the plan.`)
  }

  const undoRemovePerson = () => {
    if (!undoPerson) return
    if (plan.people.length >= MAX_PEOPLE || plan.people.some((person) => person.id === undoPerson.person.id)) {
      setNotice('Could not restore the roommate because the plan is full.')
      setUndoPerson(null)
      return
    }
    setPlan((current) => {
      const people = [...current.people]
      people.splice(undoPerson.index, 0, undoPerson.person)
      return { ...current, people }
    })
    setNotice(`${undoPerson.person.name || 'Roommate'} restored.`)
    setUndoPerson(null)
  }

  const updateBill = (id: string, patch: Partial<Bill>) => {
    setPlan((current) => ({
      ...current,
      bills: current.bills.map((bill) => bill.id === id ? { ...bill, ...patch } : bill),
    }))
  }

  const togglePaid = (bill: Bill) => {
    const paid = bill.paidMonths.includes(month)
    updateBill(bill.id, {
      paidMonths: paid
        ? bill.paidMonths.filter((paidMonth) => paidMonth !== month)
        : [...bill.paidMonths, month].slice(-60),
    })
  }

  const handleAddBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = parseCurrencyInput(newBillAmount)
    const dueDay = Number(newBillDueDay)
    if (!newBillName.trim()) {
      setBillError('Give this cost a name first.')
      return
    }
    if (plan.bills.length >= MAX_BILLS) {
      setBillError(`A plan can hold up to ${MAX_BILLS} shared costs. Remove one to add another.`)
      return
    }
    if (amount === null || amount <= 0) {
      setBillError('Enter an amount greater than $0, with up to two decimal places.')
      return
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setBillError('Choose a due day between 1 and 31.')
      return
    }
    const bill: Bill = {
      id: newId(),
      name: newBillName.trim().slice(0, 36),
      amount,
      dueDay,
      category: newBillCategory,
      paidMonths: [],
    }
    setPlan((current) => ({ ...current, bills: [...current.bills, bill] }))
    setNewBillName('')
    setNewBillAmount('')
    setNewBillDueDay('1')
    setNewBillCategory('other')
    setNewBillOpen(false)
    setBillError('')
    setNotice(`${bill.name} added to your monthly plan.`)
  }

  const removeBill = (bill: Bill) => {
    setUndoPerson(null)
    setUndoBill(bill)
    setPlan((current) => ({ ...current, bills: current.bills.filter((item) => item.id !== bill.id) }))
    setNotice(`${bill.name} removed.`)
  }

  const undoRemoveBill = () => {
    if (!undoBill) return
    if (plan.bills.length >= MAX_BILLS || plan.bills.some((bill) => bill.id === undoBill.id)) {
      setNotice('Could not restore the cost because the plan is full.')
      setUndoBill(null)
      return
    }
    setPlan((current) => ({ ...current, bills: [...current.bills, undoBill] }))
    setNotice(`${undoBill.name} restored.`)
    setUndoBill(null)
  }

  const resetDemo = () => {
    if (!window.confirm('Reset this device to the example plan? Your current local plan will be replaced.')) return
    setPlan(cloneDefaultPlan())
    setScenarioAmount(120)
    setScenarioKind('expense')
    setScenarioApplied(false)
    setCoachMessage('')
    setCoachModel('')
    setCoachError('')
    setUndoPerson(null)
    setUndoBill(null)
    setNotice('Example plan restored.')
  }

  const exportCsv = () => {
    const blob = new Blob([buildPlanCsv(plan, month)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `margin-plan-${month}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Your CSV plan is ready.')
  }

  const copySummary = async () => {
    const summary = [
      `${formatMonth(month)} shared home plan`,
      `Shared costs: ${formatCurrency(currentTotal)}`,
      ...plan.people.map((person, index) => `${person.name || `Person ${index + 1}`}: ${formatCurrency(selectedShares[index])}`),
      `Split: ${plan.splitMode === 'equal' ? 'equal amount' : split.marginShares ? 'same share of available funds' : 'equal reference (available funds incomplete)'}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(summary)
      setNotice('Summary copied. Share it wherever you like.')
    } catch {
      setNotice('Copy is unavailable here. Use Export CSV to save the plan instead.')
    }
  }

  const draftConversation = async () => {
    setCoachBusy(true)
    setCoachError('')
    setCopyMessageError('')
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only two non-personal option values leave this browser.
        body: JSON.stringify({ tone, goal }),
      })
      let payload: { message?: unknown; model?: unknown; error?: unknown }
      try {
        payload = await response.json() as typeof payload
      } catch {
        throw new Error('The AI service returned an unreadable response.')
      }
      if (!response.ok || typeof payload.message !== 'string' || !payload.message.trim()) {
        if (response.status === 429) throw new Error('The free AI coach has reached its short-term limit. Try again in a few minutes; your plan still works.')
        if (response.status === 503) throw new Error('Cloudflare AI is temporarily unavailable. Please try again in a moment.')
        throw new Error(typeof payload.error === 'string' ? payload.error : 'The coach could not reply just now.')
      }
      setCoachMessage(payload.message.trim())
      setCoachModel(typeof payload.model === 'string' ? payload.model : 'Cloudflare Workers AI')
    } catch (error) {
      setCoachMessage('')
      setCoachModel('')
      setCoachError(error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : 'Could not reach the AI coach. Check your connection, then try again.')
    } finally {
      setCoachBusy(false)
    }
  }

  const selectedGoal = GOALS.find((item) => item.value === goal) ?? GOALS[0]
  const privateContext = useMemo(() => {
    if (split.shortfall > 0) {
      return `The plan is ${formatCurrency(split.shortfall)} above what is left after essentials. A first step could be reviewing costs or timing together before agreeing.`
    }
    if (plan.splitMode === 'proportional' && !split.marginShares) {
      return `A proportional split needs everyone to have some money left after essentials. An equal split is shown as a starting point.`
    }
    const shares = plan.splitMode === 'equal' ? split.evenShares : split.marginShares ?? split.evenShares
    const summary = plan.people.map((person, index) => `${person.name || `Person ${index + 1}`}: ${formatCurrency(shares[index])}`).join('. ')
    return `${summary}. ${plan.splitMode === 'equal' ? 'The cost is shared equally.' : `Each contributes about ${formatNumber(split.contributionPercent ?? 0)}% of what remains after essentials.`}`
  }, [plan.people, plan.splitMode, split])

  const copyCoachDraft = async () => {
    const text = `${coachMessage}\n\n${privateContext}`
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessageError('')
      setNotice('Your conversation draft is copied.')
    } catch {
      setCopyMessageError('Clipboard access is unavailable in this browser. The draft is still visible to select and copy.')
    }
  }

  const handleEnableVault = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setVaultFormError('')
    setVaultMessage('')
    if (vaultPassword !== vaultConfirmation) {
      setVaultFormError('Those passwords do not match.')
      return
    }
    if (await enableVault(vaultPassword)) {
      setVaultPassword('')
      setVaultConfirmation('')
      setNotice('Password lock is on for this browser.')
    }
  }

  const handleDisableVault = async () => {
    if (!window.confirm('Turn off the password lock? The current plan will be saved unencrypted on this device. An encrypted backup will remain.')) return
    if (await disableVault()) setNotice('Password lock turned off for this browser.')
  }

  const goToPage = (nextPage: Page) => {
    if (vaultBusy) return
    if (page === 'security' && nextPage !== 'security') {
      setVaultPassword('')
      setVaultConfirmation('')
      setVaultFormError('')
      setVaultMessage('')
    }
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const splitFor = (mode: SplitMode, result = split) =>
    mode === 'equal' || !result.marginShares ? result.evenShares : result.marginShares

  const handleAddQuickBill = (name: string, amount: number, category: BillCategory) => {
    if (plan.bills.length >= MAX_BILLS) return
    const created: Bill = {
      id: newId(),
      name: name.slice(0, 36),
      amount,
      dueDay: 1,
      category,
      paidMonths: [],
    }
    setPlan((current) => ({ ...current, bills: [...current.bills, created] }))
    setNotice(`${created.name} added and divvied up.`)
  }

  const handleAddBillsFromPdf = (extractedBills: Bill[], replaceExisting: boolean) => {
    setPlan((current) => ({
      ...current,
      bills: replaceExisting
        ? extractedBills.slice(0, MAX_BILLS)
        : [...current.bills, ...extractedBills].slice(0, MAX_BILLS),
    }))
    setNotice(
      replaceExisting
        ? `Replaced plan with ${extractedBills.length} AI-extracted costs.`
        : `Added ${extractedBills.length} AI-extracted costs to your plan.`,
    )
  }

  const handleApplyIncomeFromPdf = (
    targetPersonId: string | 'new',
    takeHome: number,
    essentials: number,
    suggestedName?: string,
  ) => {
    if (targetPersonId === 'new') {
      if (plan.people.length >= MAX_PEOPLE) return
      const nextIndex = plan.people.length + 1
      const newPerson: Person = {
        id: newId(),
        avatar: (nextIndex * 3) % 12,
        name: suggestedName?.trim() || `Roommate ${nextIndex}`,
        takeHome,
        essentials,
      }
      setPlan((current) => ({ ...current, people: [...current.people, newPerson] }))
      setNotice(`Added ${newPerson.name} from PDF statement.`)
    } else {
      updatePerson(targetPersonId, {
        takeHome,
        essentials,
        ...(suggestedName ? { name: suggestedName } : {}),
      })
      setNotice('Updated roommate income & essentials from PDF.')
    }
  }

  const contentHeader = pageCopy[page]
  const [today] = useState(() => new Date())
  const todayIsActiveMonth = month === currentMonthId(today)
  const sortedBills = [...plan.bills].sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name))

  if (vaultStatus === 'locked') return <LockScreen busy={vaultBusy} message={vaultMessage} onUnlock={unlockProtectedPlan} />

  if (showLanding) {
    return (
      <LandingPage
        plan={plan}
        onOpenPlanner={(targetPage) => {
          if (targetPage) setPage(targetPage)
          setShowLanding(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        onUpdateBillAmount={(billId, amount) => updateBill(billId, { amount })}
        onAddQuickBill={handleAddQuickBill}
        onRemoveBill={(billId) => {
          const target = plan.bills.find((b) => b.id === billId)
          if (target) removeBill(target)
        }}
        onChangeSplitMode={(splitMode) => setPlan((current) => ({ ...current, splitMode }))}
        onAddBillsFromPdf={handleAddBillsFromPdf}
        onApplyIncomeFromPdf={handleApplyIncomeFromPdf}
      />
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand onClick={() => { setShowLanding(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        <div className="workspace-label">YOUR SHARED HOME</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item${page === id ? ' nav-item--active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              disabled={vaultBusy}
              onClick={() => goToPage(id)}
            >
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
              {id === 'coach' && <span className="nav-ai-dot" aria-label="AI feature" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className={`privacy-card${vaultStatus === 'unlocked' ? ' privacy-card--locked' : ''}`} onClick={() => goToPage('security')} disabled={vaultBusy}>
            <span className="privacy-icon">{vaultStatus === 'unlocked' ? <LockKeyhole size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}</span>
            {vaultStatus === 'unlocked'
              ? <span className="privacy-copy"><strong>Password lock on</strong><span>Plan is encrypted</span></span>
              : <span className="privacy-copy"><strong>Add a password</strong><span>Lock this plan</span></span>}
            <ChevronRight size={15} className="privacy-arrow" aria-hidden="true" />
          </button>
          <button type="button" className="reset-link" onClick={resetDemo} disabled={vaultBusy}>
            <RotateCcw size={14} aria-hidden="true" /> Reset example plan
          </button>
          <div className="sidebar-version">MADE FOR LIFE TOGETHER</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button type="button" className="crumb-home-link" onClick={() => { setShowLanding(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Home</button>
            <span className="crumb-separator">/</span>
            <strong>{NAV_ITEMS.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button type="button" className="icon-button top-copy" aria-label="Copy plan summary" title="Copy plan summary" onClick={copySummary}>
              <Copy size={16} aria-hidden="true" />
            </button>
            <button type="button" className="top-roommates" aria-label="Manage roommates" title="Manage roommates" onClick={() => goToPage('people')}>
              {plan.people.slice(0, 3).map((person) => <RoommateAvatar key={person.id} person={person} />)}
              {plan.people.length > 3 && <span className="avatar-more">+{plan.people.length - 3}</span>}
            </button>
          </div>
        </header>

        <div className="page-wrap">
          {saveState === 'error' && <div className="save-error-banner" role="alert"><AlertTriangle size={17} /><span>Your latest changes could not be saved. Keep this tab open and check browser storage.</span></div>}
          <section className="page-intro">
            <div>
              <h1>{contentHeader.title}</h1>
              <p>{contentHeader.subtitle}</p>
            </div>
            {page !== 'security' && <div className="month-control" aria-label="Select planning month">
              <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth((current) => shiftMonth(current, -1))}><ChevronLeft size={17} /></button>
              <div><CalendarDays size={15} aria-hidden="true" /><span>{formatMonth(month)}</span></div>
              <button type="button" className="icon-button" aria-label="Next month" onClick={() => setMonth((current) => shiftMonth(current, 1))}><ChevronRight size={17} /></button>
              {!todayIsActiveMonth && <button type="button" className="this-month-button" onClick={() => setMonth(currentMonthId())}>This month</button>}
            </div>}
          </section>

          {page === 'overview' && (
            <>
              <section className="home-summary" aria-label="Monthly plan summary">
                <div className="home-summary-metric">
                  <span><Wallet size={18} aria-hidden="true" /> Shared monthly costs</span>
                  <strong>{formatCurrency(currentTotal)}</strong>
                  <small>{scenarioApplied ? 'Includes your what-if preview' : `${billCount} recurring ${billCount === 1 ? 'cost' : 'costs'}`}</small>
                </div>
                <div className="home-summary-metric">
                  <span><Layers3 size={18} aria-hidden="true" /> Room after the plan</span>
                  <strong>{split.shortfall > 0 ? `−${formatCurrency(split.shortfall)}` : formatCurrency(availableAfterPlan)}</strong>
                  <small>{split.shortfall > 0 ? 'Costs exceed available funds' : `${formatCurrency(split.totalAvailable)} available after essentials`}</small>
                </div>
              </section>

              <div className="overview-layout">
              <section className="card split-section" aria-labelledby="split-title">
                <div className="card-heading-row">
                  <div><h2 id="split-title">Your roommates</h2><p>See what each person pays this month.</p></div>
                  <button type="button" className="button button--secondary button--small" onClick={() => goToPage('people')}>Edit <ArrowRight size={14} /></button>
                </div>
                <div className="split-mode-control" role="group" aria-label="How to split costs">
                  <button type="button" aria-pressed={plan.splitMode === 'equal'} onClick={() => setPlan((current) => ({ ...current, splitMode: 'equal' }))}>Split equally</button>
                  <button type="button" aria-pressed={plan.splitMode === 'proportional'} onClick={() => setPlan((current) => ({ ...current, splitMode: 'proportional' }))}>By available income</button>
                </div>
                <div className="roommate-contributions">
                  {plan.people.map((person, index) => {
                    const percent = split.available[index] > 0 ? (selectedShares[index] / split.available[index]) * 100 : 0
                    return <div className="roommate-contribution" key={person.id}>
                      <RoommateAvatar person={person} />
                      <div><strong>{person.name || `Roommate ${index + 1}`}</strong><span>{formatCurrency(split.available[index])} available</span></div>
                      <div className="roommate-share"><strong>{formatCurrency(selectedShares[index])}</strong><span>{split.available[index] > 0 ? `${formatNumber(percent)}% of available` : 'Equal reference'}</span></div>
                    </div>
                  })}
                </div>
                {plan.splitMode === 'proportional' && !split.marginShares && <p className="inline-alert"><AlertTriangle size={15} /> Enter available income for every roommate to calculate a proportional split. An equal split is shown for now.</p>}
                {split.shortfall > 0 && <p className="inline-alert inline-alert--danger"><AlertTriangle size={15} /> Shared costs are {formatCurrency(split.shortfall)} above the combined amount left after essentials.</p>}
              </section>

              <div className="overview-grid">
                <section className="card bills-preview" aria-labelledby="bills-preview-title">
                  <div className="card-heading-row">
                    <div><h2 id="bills-preview-title">Monthly costs</h2><p>{allPaid ? 'You’ve checked off every cost this month.' : `${paidCount} of ${billCount} marked paid for ${formatMonth(month)}.`}</p></div>
                    <button type="button" className="button button--secondary button--small" onClick={() => goToPage('plan')}>Manage costs <ArrowRight size={14} /></button>
                  </div>
                  {sortedBills.length > 0 ? <div className="bill-preview-list">
                    {sortedBills.slice(0, 4).map((bill) => {
                      const paid = bill.paidMonths.includes(month)
                      const overdue = todayIsActiveMonth && !paid && bill.dueDay < today.getDate()
                      return <div className="bill-preview-row" key={bill.id}>
                        <span className={`bill-category-icon bill-category-icon--${bill.category}`}><ReceiptText size={16} aria-hidden="true" /></span>
                        <div className="bill-preview-name"><strong>{bill.name}</strong><span>Due {ordinal(bill.dueDay)} · {CATEGORIES.find((category) => category.value === bill.category)?.label}</span></div>
                        <strong className="bill-preview-amount">{formatCurrency(bill.amount)}</strong>
                        <button type="button" className={`status-pill${paid ? ' status-pill--paid' : overdue ? ' status-pill--late' : ''}`} aria-pressed={paid} onClick={() => togglePaid(bill)}>
                          {paid ? <Check size={12} /> : null}{paid ? 'Paid' : overdue ? 'Overdue' : 'Mark paid'}
                        </button>
                      </div>
                    })}
                    {sortedBills.length > 4 && <button type="button" className="see-all-link" onClick={() => goToPage('plan')}>See all {billCount} costs <ArrowRight size={14} /></button>}
                  </div> : <div className="empty-state"><ReceiptText size={22} /><strong>No shared costs yet</strong><span>Add a bill to start your monthly plan.</span><button type="button" className="button button--primary button--small" onClick={() => { setNewBillOpen(true); goToPage('plan') }}><Plus size={14} /> Add your first cost</button></div>}
                </section>

                <div className="overview-side-stack">
                  <section className="card scenario-quick-card" aria-labelledby="scenario-quick-title">
                    <div className="card-heading-row card-heading-row--compact">
                      <div><div className="section-kicker">PLAN FOR A CHANGE</div><h2 id="scenario-quick-title">What if something shifts?</h2><p>Preview a one-time cost or credit.</p></div>
                      <span className="round-icon round-icon--gold"><Zap size={17} aria-hidden="true" /></span>
                    </div>
                    <div className="quick-scenario-controls">
                      <label className="scenario-amount-field"><span>$</span><input aria-label="Scenario amount" type="number" min="0" max={MAX_AMOUNT} step="0.01" value={scenarioAmount} onChange={(event) => setScenarioAmount(Math.max(0, Math.min(MAX_AMOUNT, Number(event.target.value) || 0)))} /></label>
                      <div className="segmented-control" aria-label="Scenario type"><button type="button" aria-pressed={scenarioKind === 'expense'} onClick={() => setScenarioKind('expense')}>Cost</button><button type="button" aria-pressed={scenarioKind === 'credit'} onClick={() => setScenarioKind('credit')}>Credit</button></div>
                      <button type="button" className={`button ${scenarioApplied ? 'button--secondary' : 'button--primary'} button--small`} aria-pressed={scenarioApplied} onClick={() => setScenarioApplied((active) => !active)}>{scenarioApplied ? 'Clear preview' : 'Preview'} <ArrowRight size={14} /></button>
                    </div>
                    <div className={`scenario-result${scenarioApplied ? ' scenario-result--active' : ''}`} aria-live="polite">
                      {scenarioApplied ? <><CheckCircle2 size={15} /><span>New shared total: <strong>{formatCurrency(currentTotal)}</strong>. See everyone’s share above.</span></> : <><span className="scenario-result-dot" /><span>Try it here; your monthly plan stays unchanged.</span></>}
                    </div>
                  </section>

                  <section className="coach-teaser" aria-labelledby="coach-teaser-title">
                    <div className="coach-teaser-glow" />
                    <div className="coach-teaser-top"><span className="coach-mark"><Sparkles size={17} aria-hidden="true" /></span><span className="ai-live-label"><span /> AI COACH</span></div>
                    <h2 id="coach-teaser-title">The numbers are easy.<br /><em>The words can be too.</em></h2>
                    <p>Get a thoughtful opener for a real conversation about your shared plan.</p>
                    <button type="button" className="button button--dark" onClick={() => goToPage('coach')}>Talk it through <ArrowRight size={15} /></button>
                  </section>
                </div>
              </div>
              </div>

              <section className="tip-strip"><span className="tip-icon"><CircleDollarSign size={16} /></span><div><strong>A fair split doesn’t have to mean equal dollars.</strong><span>Margin compares what each person has left after essentials, so the plan can feel more balanced.</span></div><button type="button" aria-label="Learn about people and available funds" onClick={() => goToPage('people')}><ArrowRight size={16} /></button></section>

              <QuickDivvyStudio
                plan={plan}
                onUpdateBillAmount={(billId, amount) => updateBill(billId, { amount })}
                onAddQuickBill={handleAddQuickBill}
                onRemoveBill={(billId) => {
                  const target = plan.bills.find((b) => b.id === billId)
                  if (target) removeBill(target)
                }}
                onChangeSplitMode={(splitMode) => setPlan((current) => ({ ...current, splitMode }))}
              />

              <DocumentInterpreterCard
                defaultMode="bills"
                plan={plan}
                onAddBills={handleAddBillsFromPdf}
                onApplyIncome={handleApplyIncomeFromPdf}
              />
            </>
          )}

          {page === 'plan' && (
            <>
              <section className="plan-summary-row">
                <div className="mini-stat"><span>Total shared costs</span><strong>{formatCurrency(baseTotal)}</strong><small>For {formatMonth(month)}</small></div>
                <div className="mini-stat"><span>Paid this month</span><strong>{paidCount} <small>of {billCount}</small></strong><div className="mini-progress"><span style={{ width: `${billCount ? (paidCount / billCount) * 100 : 0}%` }} /></div></div>
                <div className="mini-stat mini-stat--note"><span><LockKeyhole size={14} /> Private plan</span><strong>Saved on this device</strong><small>No account or bank connection.</small></div>
              </section>

              <DocumentInterpreterCard
                defaultMode="bills"
                plan={plan}
                onAddBills={handleAddBillsFromPdf}
                onApplyIncome={handleApplyIncomeFromPdf}
              />
              <section className="card full-plan-card" aria-labelledby="monthly-costs-heading">
                <div className="card-heading-row">
                  <div><div className="section-kicker">RECURRING AND SHARED</div><h2 id="monthly-costs-heading">Your shared costs</h2><p>Track amounts, due dates, and paid status for each month.</p></div>
                  <div className="button-row"><button type="button" className="button button--secondary button--small" onClick={exportCsv}><Download size={15} /> Export CSV</button><button type="button" className="button button--primary button--small" onClick={() => { setNewBillOpen((open) => !open); setBillError('') }}>{newBillOpen ? <X size={15} /> : <Plus size={15} />}{newBillOpen ? 'Close' : 'Add a cost'}</button></div>
                </div>

                {newBillOpen && <form className="add-bill-form" onSubmit={handleAddBill}>
                  <div className="add-form-heading"><span className="add-form-icon"><Plus size={17} /></span><div><strong>Add a recurring cost</strong><span>Saved with your household plan on this device.</span></div></div>
                  <div className="add-form-fields">
                    <label><span>Cost name</span><input autoFocus maxLength={36} placeholder="e.g. Internet" value={newBillName} onChange={(event) => setNewBillName(event.target.value)} /></label>
                    <label><span>Monthly amount</span><span className="text-money-input"><b>$</b><input inputMode="decimal" placeholder="0.00" value={newBillAmount} onChange={(event) => setNewBillAmount(event.target.value)} /></span></label>
                    <label><span>Due day</span><input type="number" min="1" max="31" value={newBillDueDay} onChange={(event) => setNewBillDueDay(event.target.value)} /></label>
                    <label><span>Category</span><select value={newBillCategory} onChange={(event) => setNewBillCategory(event.target.value as BillCategory)}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
                    <button className="button button--primary" type="submit"><Plus size={15} /> Add to plan</button>
                  </div>
                  {billError && <p className="form-error" role="alert">{billError}</p>}
                </form>}

                {plan.bills.length > 0 ? <>
                  <div className="bill-list-header"><span>Cost</span><span>Monthly amount</span><span>Due date</span><span>Status for {formatMonth(month)}</span><span className="sr-only">Actions</span></div>
                  <div className="bill-list">
                    {sortedBills.map((bill) => {
                      const paid = bill.paidMonths.includes(month)
                      const overdue = todayIsActiveMonth && !paid && bill.dueDay < today.getDate()
                      return <article className="bill-row" key={bill.id}>
                        <div className="bill-edit-name"><span className={`bill-category-icon bill-category-icon--${bill.category}`}><ReceiptText size={16} /></span><div><input aria-label={`${bill.name} cost name`} maxLength={36} value={bill.name} onChange={(event) => updateBill(bill.id, { name: event.target.value })} /><select aria-label={`${bill.name} category`} value={bill.category} onChange={(event) => updateBill(bill.id, { category: event.target.value as BillCategory })}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div></div>
                        <MoneyField key={bill.id} label="Monthly amount" value={bill.amount} onChange={(amount) => updateBill(bill.id, { amount })} />
                        <label className="due-day-field"><span className="field-label">Due day</span><span><input aria-label={`${bill.name} due day`} type="number" min="1" max="31" value={bill.dueDay} onChange={(event) => { const day = Number(event.target.value); if (Number.isInteger(day) && day >= 1 && day <= 31) updateBill(bill.id, { dueDay: day }) }} /> <small>of the month</small></span></label>
                        <button type="button" className={`status-pill status-pill--row${paid ? ' status-pill--paid' : overdue ? ' status-pill--late' : ''}`} aria-pressed={paid} onClick={() => togglePaid(bill)}>{paid ? <Check size={13} /> : null}{paid ? 'Paid' : overdue ? 'Overdue · mark paid' : 'Mark paid'}</button>
                        <button type="button" className="remove-bill-button" aria-label={`Remove ${bill.name}`} title={`Remove ${bill.name}`} onClick={() => removeBill(bill)}><Trash2 size={16} /></button>
                      </article>
                    })}
                  </div>
                  <div className="bill-list-footer"><span><CheckCircle2 size={15} /> {paidCount} costs marked paid for {formatMonth(month)}</span><strong>Total <span>{formatCurrency(baseTotal)}</span></strong></div>
                </> : <div className="empty-state empty-state--large"><ReceiptText size={24} /><strong>Your plan is ready for its first cost.</strong><span>Add rent, utilities, subscriptions, groceries, or anything else you share.</span><button type="button" className="button button--primary" onClick={() => setNewBillOpen(true)}><Plus size={15} /> Add a cost</button></div>}
              </section>
              <section className="info-strip"><span className="info-strip-icon"><CalendarDays size={17} /></span><div><strong>Paid status is month-specific.</strong><span>When you switch to another month, each cost starts unmarked. Your saved history stays in this browser.</span></div></section>
            </>
          )}

          {page === 'people' && (
            <>
              <div className="roommates-toolbar"><div><strong>{plan.people.length} {plan.people.length === 1 ? 'roommate' : 'roommates'} in your plan</strong><span>Add up to {MAX_PEOPLE} roommates. Your plan is saved on this device.</span></div><button type="button" className="button button--primary" onClick={addPerson} disabled={plan.people.length >= MAX_PEOPLE}><Plus size={16} /> Add roommate</button></div>

              <DocumentInterpreterCard
                defaultMode="income"
                plan={plan}
                onAddBills={handleAddBillsFromPdf}
                onApplyIncome={handleApplyIncomeFromPdf}
              />
              <div className="people-hero-card"><span className="people-hero-icon"><Users size={19} /></span><div><strong>Start with what’s already spoken for.</strong><span>Add each roommate’s take-home pay and essentials to compare a fair split. Tap a face to choose another avatar.</span></div><span className="local-only-tag"><LockKeyhole size={13} /> DEVICE ONLY</span></div>
              <section className="people-edit-grid" aria-label="Edit roommates">
                {plan.people.map((person, index) => {
                  const available = baselineSplit.available[index]
                  return <article className="person-card" key={person.id}>
                    <div className="person-card-top"><button type="button" className="avatar-picker" aria-label={`Change avatar for ${person.name || `roommate ${index + 1}`}`} title="Change avatar" onClick={() => updatePerson(person.id, { avatar: (person.avatar + 1) % 12 })}><RoommateAvatar person={person} /><span>Change</span></button><div><span className="section-kicker">ROOMMATE {index + 1}</span><strong>{person.name || `Roommate ${index + 1}`}</strong></div><button type="button" className="remove-person-button" aria-label={`Remove ${person.name || `roommate ${index + 1}`}`} title={plan.people.length <= 1 ? 'Keep at least one roommate' : 'Remove roommate'} disabled={plan.people.length <= 1} onClick={() => removePerson(person)}><Trash2 size={17} /></button></div>
                    <label className="name-field"><span>Name</span><input maxLength={28} value={person.name} onChange={(event) => updatePerson(person.id, { name: event.target.value })} placeholder={`Roommate ${index + 1}`} /></label>
                    <div className="money-field-grid"><MoneyField label="Monthly take-home" value={person.takeHome} onChange={(takeHome) => updatePerson(person.id, { takeHome })} hint="After tax and deductions" /><MoneyField label="Monthly essentials" value={person.essentials} onChange={(essentials) => updatePerson(person.id, { essentials })} hint="Personal bills and necessities" /></div>
                    <div className="available-summary"><div><span>Left after essentials</span><strong>{formatCurrency(available)}</strong></div><span className="available-summary-icon"><TrendingUp size={17} /></span></div>
                    {person.essentials > person.takeHome && <p className="inline-alert inline-alert--danger"><AlertTriangle size={14} /> Essentials are higher than take-home income.</p>}
                  </article>
                })}
              </section>
              <section className="card method-card"><div className="method-card-icon"><Sparkles size={18} /></div><div><div className="section-kicker">HOW MARGIN CALCULATES FAIR</div><h2>Share the effort, not just the bill.</h2><p>The available-income split asks each person to contribute the same percentage of their own funds after essentials. You can compare it with an equal-dollar split and choose what feels right.</p></div><button type="button" className="button button--secondary" onClick={() => goToPage('overview')}>Compare splits <ArrowRight size={15} /></button></section>
            </>
          )}

          {page === 'scenarios' && (
            <>
              <div className="scenario-layout">
                <section className="card scenario-builder-card" aria-labelledby="scenario-builder-title">
                  <div className="card-heading-row"><div><div className="section-kicker">ONE CHANGE AT A TIME</div><h2 id="scenario-builder-title">Build a what-if</h2><p>Adjust this preview without changing your saved monthly costs.</p></div><span className="round-icon round-icon--gold"><Zap size={18} /></span></div>
                  <div className="scenario-kind-picker" role="group" aria-label="Choose a change type"><button type="button" className={scenarioKind === 'expense' ? 'is-selected' : ''} aria-pressed={scenarioKind === 'expense'} onClick={() => setScenarioKind('expense')}><span className="change-icon change-icon--cost"><TrendingUp size={16} /></span><span><strong>New cost</strong><small>Extra shared expense</small></span></button><button type="button" className={scenarioKind === 'credit' ? 'is-selected' : ''} aria-pressed={scenarioKind === 'credit'} onClick={() => setScenarioKind('credit')}><span className="change-icon change-icon--credit"><CircleDollarSign size={16} /></span><span><strong>Credit or savings</strong><small>Reduce the monthly total</small></span></button></div>
                  <MoneyField label={scenarioKind === 'expense' ? 'One-time expense' : 'One-time credit'} value={scenarioAmount} onChange={setScenarioAmount} hint="This preview isn’t added to recurring costs." />
                  <div className="preset-row"><span>Quick try</span>{[50, 120, 300].map((amount) => <button type="button" key={amount} className={scenarioAmount === amount ? 'is-selected' : ''} onClick={() => setScenarioAmount(amount)}>{formatCurrency(amount)}</button>)}</div>
                  <button type="button" className={`button ${scenarioApplied ? 'button--secondary' : 'button--primary'} scenario-apply-button`} aria-pressed={scenarioApplied} onClick={() => setScenarioApplied((active) => !active)}>{scenarioApplied ? <X size={16} /> : <Zap size={16} />}{scenarioApplied ? 'Clear what-if preview' : 'Apply what-if preview'}</button>
                  <p className="scenario-privacy-note"><LockKeyhole size={14} /> This is a temporary preview. Your saved monthly plan stays unchanged.</p>
                </section>

                <section className="card scenario-results-card" aria-labelledby="scenario-results-title">
                  <div className="results-label"><span className="results-label-icon"><Layers3 size={15} /></span> YOUR PLAN, SIDE BY SIDE</div>
                  <h2 id="scenario-results-title">See the difference</h2>
                  <p className="scenario-results-subtitle">{scenarioApplied ? 'Your preview is included in the new split below.' : 'Apply your change to preview an updated split.'}</p>
                  <div className="scenario-compare-box">
                    <div><span>Current shared costs</span><strong>{formatCurrency(baseTotal)}</strong></div><ArrowRight size={16} /><div><span>With this change</span><strong className={scenarioApplied ? 'scenario-highlight' : ''}>{formatCurrency(currentTotal)}</strong></div>
                  </div>
                  <div className="scenario-person-results">
                    {plan.people.map((person, index) => {
                      const currentShare = splitFor(plan.splitMode, baselineSplit)[index]
                      const proposedShare = selectedShares[index]
                      const delta = proposedShare - currentShare
                      return <div className="scenario-person-result" key={person.id}><RoommateAvatar person={person} /><div className="scenario-person-result-main"><strong>{person.name || `Roommate ${index + 1}`}</strong><span>{formatCurrency(currentShare)} <ArrowRight size={12} /> {formatCurrency(proposedShare)}</span></div><span className={`delta-pill${!scenarioApplied || Math.abs(delta) < 0.005 ? '' : delta > 0 ? ' delta-pill--up' : ' delta-pill--down'}`}>{!scenarioApplied ? 'No change' : Math.abs(delta) < 0.005 ? 'No change' : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`}</span></div>
                    })}
                  </div>
                  <div className={`scenario-footnote${split.shortfall > 0 ? ' scenario-footnote--warn' : ''}`}><span>{split.shortfall > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}</span><p>{split.shortfall > 0 ? `This plan is ${formatCurrency(split.shortfall)} above the combined amount available after essentials.` : `After this plan, ${formatCurrency(availableAfterPlan)} remains across the home.`}</p></div>
                </section>
              </div>
              <section className="scenario-next-step"><span className="scenario-next-icon"><MessageCircle size={17} /></span><div><strong>Want help talking it through?</strong><span>Get an AI-drafted opener for a new bill, a plan review, or a monthly check-in.</span></div><button type="button" className="button button--secondary button--small" onClick={() => { setGoal('talk-change'); goToPage('coach') }}>Open AI coach <ArrowRight size={14} /></button></section>
            </>
          )}

          {page === 'coach' && (
            <section className="coach-page-grid">
              <div className="card coach-config-card">
                <div className="coach-page-mark"><span className="coach-mark coach-mark--large"><Sparkles size={20} /></span><span className="ai-live-label"><span /> LIVE AI · FREE MODEL</span></div>
                <div className="section-kicker">FIRST, WHAT’S THE MOMENT?</div>
                <h2>Pick what you want to say.</h2>
                <p className="coach-config-intro">The coach writes a fresh opener based on your goal and tone. Your names, income, bills, and split stay right here in your browser.</p>
                <div className="goal-list" role="group" aria-label="Conversation goal">
                  {GOALS.map((item) => <button type="button" key={item.value} disabled={coachBusy} className={`goal-option${goal === item.value ? ' goal-option--selected' : ''}`} aria-pressed={goal === item.value} onClick={() => { setGoal(item.value); setCoachMessage(''); setCoachModel(''); setCoachError('') }}><span className="goal-radio">{goal === item.value && <span />}</span><span className="goal-option-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={15} /></button>)}
                </div>
                <div className="tone-picker tone-picker--large" role="group" aria-label="AI coach tone"><span className="field-label">Choose a tone</span><div>{TONES.map((item) => <button type="button" key={item.value} className={`tone-chip${tone === item.value ? ' tone-chip--selected' : ''}`} aria-pressed={tone === item.value} disabled={coachBusy} onClick={() => { setTone(item.value); setCoachMessage(''); setCoachModel(''); setCoachError('') }}><strong>{item.label}</strong><small>{item.helper}</small></button>)}</div></div>
                <button type="button" className="button button--primary coach-generate-button" onClick={draftConversation} disabled={coachBusy}>
                  {coachBusy ? <RefreshCw className="spin" size={17} /> : <Sparkles size={17} />}
                  {coachBusy ? 'Writing your opener…' : coachMessage ? 'Draft another version' : 'Generate with AI'}
                </button>
                <div className="coach-privacy-note"><ShieldCheck size={16} /><span><strong>Private by design.</strong> Cloudflare AI receives only your selected goal and tone. No names or money amounts leave this device.</span></div>
              </div>

              <div className="coach-result-column">
                <section className={`coach-output-card${coachMessage ? ' coach-output-card--ready' : ''}`} aria-live="polite">
                  <div className="output-card-header"><div><div className="section-kicker">YOUR CONVERSATION STARTER</div><h2>{coachMessage ? 'A fresh way to begin.' : 'Your draft will appear here.'}</h2></div>{coachMessage ? <span className="generated-badge"><CheckCircle2 size={13} /> Generated</span> : <span className="output-empty-icon"><MessageCircle size={18} /></span>}</div>
                  {coachBusy ? <div className="ai-loading-state"><span className="ai-loading-orb"><Sparkles size={18} /></span><strong>Finding the right words…</strong><span>Margin is drafting a short, respectful opener.</span></div> : coachMessage ? <><blockquote>{coachMessage}</blockquote><div className="generated-by"><span className="generated-model"><Sparkles size={13} /> {coachModel || 'Cloudflare Workers AI'}</span><span>New draft · your selected tone is {TONES.find((item) => item.value === tone)?.label.toLowerCase()}</span></div></> : <div className="coach-empty-state"><span className="quote-symbol">“</span><p>Choose a conversation goal and tone, then ask Margin to draft an opener you can actually use.</p><div className="sample-prompt"><span>YOUR GOAL</span><strong>{selectedGoal.label}</strong><small>{selectedGoal.description}</small></div></div>}
                  {coachError && <div className="coach-error" role="alert"><AlertTriangle size={16} /><span>{coachError}</span></div>}
                  {coachMessage && <div className="coach-output-actions"><button type="button" className="button button--secondary button--small" onClick={copyCoachDraft}><Copy size={14} /> Copy full draft</button><button type="button" className="text-link" onClick={draftConversation} disabled={coachBusy}><RefreshCw size={14} /> Try another</button></div>}
                  {copyMessageError && <p className="form-error" role="alert">{copyMessageError}</p>}
                </section>
                <section className="card local-personalization-card"><span className="local-personalization-icon"><LockKeyhole size={16} /></span><div><div className="section-kicker">ADDED ON THIS DEVICE</div><h3>Keep the real numbers out of the cloud.</h3><p>{privateContext}</p></div></section>
                <div className="coach-limits-note"><Zap size={14} /> AI uses Cloudflare’s free daily allowance. Your budget calculations work even when the AI is offline.</div>
              </div>
            </section>
          )}

          {page === 'security' && (
            <div className="security-layout">
              <section className="card security-card" aria-labelledby="security-title">
                <span className="security-hero-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
                {vaultStatus === 'unprotected' ? <>
                  <h2 id="security-title">Lock your plan with a password.</h2>
                  <p>Encrypt your saved roommate plan on this device and require your password when the page is reopened or reloaded.</p>
                  <form className="security-form" onSubmit={handleEnableVault}>
                    <label className="security-field"><span>Choose a password</span><input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} value={vaultPassword} onChange={(event) => setVaultPassword(event.target.value)} required disabled={vaultBusy} /></label>
                    <label className="security-field"><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} value={vaultConfirmation} onChange={(event) => setVaultConfirmation(event.target.value)} required disabled={vaultBusy} /></label>
                    <p className="security-hint">Use at least {MIN_PASSWORD_LENGTH} characters. Close other open Margin tabs before turning on the lock.</p>
                    {(vaultFormError || vaultMessage) && <p className="security-message" role="alert">{vaultFormError || vaultMessage}</p>}
                    <button type="submit" className="button button--primary security-submit" disabled={vaultBusy}>{vaultBusy ? 'Protecting your plan…' : 'Turn on password lock'} <ArrowRight size={16} /></button>
                  </form>
                  <div className="security-note"><AlertTriangle size={17} /><span>There is no password reset. If you forget it, this protected plan cannot be recovered.</span></div>
                </> : <>
                  <h2 id="security-title">Password lock is on.</h2>
                  <p>Your saved plan is encrypted on this device. Lock it now, or it will lock when this page is reloaded.</p>
                  {vaultMessage && <p className="security-message" role="alert">{vaultMessage}</p>}
                  <div className="security-actions"><button type="button" className="button button--primary" disabled={vaultBusy} onClick={() => { void lockVault() }}><LockKeyhole size={16} /> {vaultBusy ? 'Saving…' : 'Lock now'}</button><button type="button" className="button button--secondary" disabled={vaultBusy} onClick={() => { void handleDisableVault() }}>Turn off lock</button></div>
                  <div className="security-note"><ShieldCheck size={17} /><span>Your password is never sent to Margin. Keep it safe; it cannot be reset.</span></div>
                </>}
              </section>
              <aside className="security-explainer"><h2>Made for your device.</h2><p>Protection applies to this browser and address. It doesn’t create an account, invite roommates, or sync plans across devices.</p><div><LockKeyhole size={18} /><span>Only your selected goal and tone are sent to the AI coach.</span></div></aside>
            </div>
          )}

          <footer className="page-footer"><span>Margin</span><span className="footer-divider" /><span>More clarity for the home you share.</span></footer>
        </div>
      </main>

      {notice && <div className="toast" role="status"><CheckCircle2 size={16} /><span>{notice}</span>{(undoBill || undoPerson) && notice.includes('removed') && <button type="button" onClick={undoPerson ? undoRemovePerson : undoRemoveBill}>Undo</button>}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={15} /></button></div>}

      <nav className="mobile-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={page === id ? 'mobile-nav-item mobile-nav-item--active' : 'mobile-nav-item'} aria-current={page === id ? 'page' : undefined} disabled={vaultBusy} onClick={() => goToPage(id)}><Icon size={18} /><span>{label === 'Monthly plan' ? 'Plan' : label === 'Overview' ? 'Home' : label === 'Scenarios' ? 'What-if' : label}</span></button>)}
      </nav>
    </div>
  )
}

export default App
