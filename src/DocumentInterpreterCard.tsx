import { useRef, useState, type ChangeEvent } from 'react'
import {
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'
import {
  calculateSplit,
  formatCurrency,
  MAX_PEOPLE,
  parseCurrencyInput,
  type Bill,
  type BillCategory,
  type HouseholdPlan,
  type SplitMode,
} from './lib/finance'
import {
  buildSamplePdfBytes,
  extractTextFromPdfBuffer,
  interpretDocumentLocally,
  sanitizeInterpretationPayload,
  scrubSensitivePdfText,
  type BillsInterpretation,
  type DocumentInterpretation,
  type ExtractedBillItem,
  type IncomeInterpretation,
  type InterpretMode,
} from './lib/pdfInterpreter'

function makeId(prefix = 'item'): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface QuickDivvyStudioProps {
  plan: HouseholdPlan
  onUpdateBillAmount: (billId: string, amount: number) => void
  onAddQuickBill: (name: string, amount: number, category: BillCategory) => void
  onRemoveBill?: (billId: string) => void
  onChangeSplitMode: (mode: SplitMode) => void
  onOpenFullPlanner?: () => void
}

export function QuickDivvyStudio({
  plan,
  onUpdateBillAmount,
  onAddQuickBill,
  onRemoveBill,
  onChangeSplitMode,
  onOpenFullPlanner,
}: QuickDivvyStudioProps) {
  const [newExpenseName, setNewExpenseName] = useState('')
  const [newExpenseAmount, setNewExpenseAmount] = useState('')
  const [newExpenseCategory, setNewExpenseCategory] = useState<BillCategory>('other')

  const totalBills = plan.bills.reduce((sum, bill) => sum + bill.amount, 0)
  const overallSplit = calculateSplit(plan.people, totalBills)
  const overallShares =
    plan.splitMode === 'equal' || !overallSplit.marginShares
      ? overallSplit.evenShares
      : overallSplit.marginShares

  const handleAddQuick = () => {
    const parsed = parseCurrencyInput(newExpenseAmount)
    if (!newExpenseName.trim() || parsed === null || parsed <= 0) return
    onAddQuickBill(newExpenseName.trim(), parsed, newExpenseCategory)
    setNewExpenseName('')
    setNewExpenseAmount('')
  }

  return (
    <section className="card divvy-studio-card" aria-labelledby="divvy-studio-heading">
      <div className="divvy-studio-header">
        <div>
          <h2 id="divvy-studio-heading">Put in rent &amp; expenses—watch it divvy up.</h2>
          <p>
            Type your monthly rent, utilities, groceries, or any shared bill below. Margin splits
            every single expense and the monthly total across your roommates in real time.
          </p>
        </div>

        <div className="divvy-mode-pills" role="group" aria-label="Split mode">
          <button
            type="button"
            className={plan.splitMode === 'proportional' ? 'is-active' : ''}
            onClick={() => onChangeSplitMode('proportional')}
          >
            By available income
          </button>
          <button
            type="button"
            className={plan.splitMode === 'equal' ? 'is-active' : ''}
            onClick={() => onChangeSplitMode('equal')}
          >
            Equal 50/50
          </button>
        </div>
      </div>

      <div className="divvy-studio-grid">
        {/* Left: Editable Rent & Expenses Inputs */}
        <div className="divvy-inputs-col">
          <div className="divvy-col-title">
            <Wallet size={16} aria-hidden="true" />
            <strong>1. Enter Rent &amp; Monthly Expenses</strong>
            <span>Total: {formatCurrency(totalBills)}</span>
          </div>

          <div className="divvy-bill-inputs">
            {plan.bills.map((bill) => (
              <div key={bill.id} className="divvy-bill-row">
                <div className="divvy-bill-label">
                  <strong>{bill.name}</strong>
                  <span>{bill.category}</span>
                </div>
                <label className="divvy-money-box">
                  <span aria-hidden="true">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`${bill.name} amount`}
                    value={bill.amount || ''}
                    onChange={(event) => {
                      const val = Number(event.target.value)
                      onUpdateBillAmount(bill.id, Number.isFinite(val) && val >= 0 ? val : 0)
                    }}
                  />
                </label>
                {onRemoveBill && plan.bills.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${bill.name}`}
                    onClick={() => onRemoveBill(bill.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="divvy-quick-add">
            <input
              type="text"
              placeholder="Add expense (e.g. Internet, Cleaning)"
              aria-label="New expense name"
              value={newExpenseName}
              onChange={(event) => setNewExpenseName(event.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="$ Amount"
              aria-label="New expense amount"
              value={newExpenseAmount}
              onChange={(event) => setNewExpenseAmount(event.target.value)}
            />
            <select
              aria-label="New expense category"
              value={newExpenseCategory}
              onChange={(event) => setNewExpenseCategory(event.target.value as BillCategory)}
            >
              <option value="housing">Housing</option>
              <option value="utilities">Utilities</option>
              <option value="food">Food</option>
              <option value="transport">Transport</option>
              <option value="other">Other</option>
            </select>
            <button type="button" className="button button--primary" onClick={handleAddQuick}>
              <Plus size={15} aria-hidden="true" /> Add
            </button>
          </div>
        </div>

        {/* Right: Per-Roommate Total + Per-Bill Divvy Breakdown */}
        <div className="divvy-results-col">
          <div className="divvy-col-title">
            <Users size={16} aria-hidden="true" />
            <strong>2. How It Divvies Up Across Roommates</strong>
            <span>
              {plan.splitMode === 'proportional' && overallSplit.contributionPercent !== null
                ? `${overallSplit.contributionPercent}% of available margin`
                : 'Equal share'}
            </span>
          </div>

          <div className="divvy-person-totals">
            {plan.people.map((person, idx) => {
              const share = overallShares[idx] ?? 0
              const avail = overallSplit.available[idx] ?? 0
              return (
                <div key={person.id} className="divvy-person-pill">
                  <div>
                    <strong>{person.name}</strong>
                    <span>{formatCurrency(avail)} left after essentials</span>
                  </div>
                  <div className="divvy-person-amount">
                    <strong>{formatCurrency(share)}</strong>
                    <span>/ month</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Itemized Per-Bill Divvy Table */}
          <div className="divvy-breakdown-table-wrap">
            <table className="divvy-breakdown-table">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Total</th>
                  {plan.people.map((person) => (
                    <th key={person.id}>{person.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.bills.map((bill) => {
                  const billSplit = calculateSplit(plan.people, bill.amount)
                  const billShares =
                    plan.splitMode === 'equal' || !billSplit.marginShares
                      ? billSplit.evenShares
                      : billSplit.marginShares
                  return (
                    <tr key={bill.id}>
                      <td>
                        <strong>{bill.name}</strong>
                      </td>
                      <td>{formatCurrency(bill.amount)}</td>
                      {plan.people.map((person, idx) => (
                        <td key={person.id} className="divvy-share-cell">
                          {formatCurrency(billShares[idx] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th>Monthly Total</th>
                  <th>{formatCurrency(totalBills)}</th>
                  {plan.people.map((person, idx) => (
                    <th key={person.id} className="divvy-share-cell">
                      {formatCurrency(overallShares[idx] ?? 0)}
                    </th>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {onOpenFullPlanner && (
            <div className="divvy-studio-footer">
              <button type="button" className="button button--primary" onClick={onOpenFullPlanner}>
                Open in Full Planner
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

interface DocumentInterpreterCardProps {
  defaultMode?: InterpretMode
  plan: HouseholdPlan
  onAddBills: (bills: Bill[], replaceExisting: boolean) => void
  onApplyIncome: (targetPersonId: string | 'new', takeHome: number, essentials: number, suggestedName?: string) => void
}

export function DocumentInterpreterCard({
  defaultMode = 'bills',
  plan,
  onAddBills,
  onApplyIncome,
}: DocumentInterpreterCardProps) {
  const [mode, setMode] = useState<InterpretMode>(defaultMode)
  const [selectedPersonId, setSelectedPersonId] = useState<string>(plan.people[0]?.id ?? 'new')
  const [fileName, setFileName] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [result, setResult] = useState<DocumentInterpretation | null>(null)
  const [appliedNotice, setAppliedNotice] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const runInterpretation = async (targetMode: InterpretMode, extractedText: string, sourceLabel: string) => {
    setBusy(true)
    setError('')
    setAppliedNotice('')
    setFileName(sourceLabel)

    const scrubbed = scrubSensitivePdfText(extractedText)
    if (scrubbed.length < 4) {
      setBusy(false)
      setError('Could not find readable text in that PDF. Try a statement PDF with selectable text.')
      return
    }

    try {
      const response = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: targetMode, text: scrubbed }),
      })
      if (response.ok) {
        const data: unknown = await response.json()
        const validated = sanitizeInterpretationPayload(targetMode, data, scrubbed)
        setResult(validated)
        return
      }
      const localResult = interpretDocumentLocally(targetMode, scrubbed)
      setResult(localResult)
    } catch {
      const localResult = interpretDocumentLocally(targetMode, scrubbed)
      setResult(localResult)
    } finally {
      setBusy(false)
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (file.size > 10 * 1024 * 1024) {
      setError('Please choose a PDF or statement file under 10 MB.')
      return
    }

    setBusy(true)
    setError('')
    setAppliedNotice('')
    try {
      const buffer = await file.arrayBuffer()
      const text = await extractTextFromPdfBuffer(buffer)
      await runInterpretation(mode, text, file.name)
    } catch {
      setBusy(false)
      setError('Could not read that PDF file.')
    }
  }

  const handleRunSamplePdf = async (kind: 'lease-bills' | 'grocery-utility' | 'paystub-income') => {
    const targetMode: InterpretMode = kind === 'paystub-income' ? 'income' : 'bills'
    setMode(targetMode)
    const pdfBytes = buildSamplePdfBytes(kind)
    const labelMap: Record<typeof kind, string> = {
      'lease-bills': 'sample-lease-and-utilities-nov2026.pdf',
      'grocery-utility': 'sample-groceries-and-pge-receipt.pdf',
      'paystub-income': 'sample-maya-biweekly-paystub.pdf',
    }
    const text = await extractTextFromPdfBuffer(pdfBytes.buffer)
    await runInterpretation(targetMode, text, labelMap[kind])
  }

  const handleDownloadSamplePdf = (kind: 'lease-bills' | 'grocery-utility' | 'paystub-income') => {
    const pdfBytes = buildSamplePdfBytes(kind)
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download =
      kind === 'paystub-income'
        ? 'sample-roommate-paystub.pdf'
        : kind === 'grocery-utility'
          ? 'sample-grocery-utility-bill.pdf'
          : 'sample-lease-and-utilities.pdf'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const applyExtractedBills = (items: ExtractedBillItem[], replaceExisting: boolean) => {
    const newBills: Bill[] = items.map((item) => ({
      id: makeId('pdf-bill'),
      name: item.name,
      amount: item.amount,
      dueDay: item.dueDay,
      category: item.category,
      paidMonths: [],
    }))
    onAddBills(newBills, replaceExisting)
    setAppliedNotice(
      replaceExisting
        ? `Replaced plan bills with ${newBills.length} extracted ${newBills.length === 1 ? 'expense' : 'expenses'} and divvied them up!`
        : `Added ${newBills.length} extracted ${newBills.length === 1 ? 'expense' : 'expenses'} to your plan!`,
    )
  }

  const applyExtractedIncome = (incomeResult: IncomeInterpretation) => {
    const target =
      plan.people.some((p) => p.id === selectedPersonId) || selectedPersonId === 'new'
        ? selectedPersonId
        : (plan.people[0]?.id ?? 'new')
    onApplyIncome(target, incomeResult.takeHome, incomeResult.essentials, incomeResult.personName)
    const targetName =
      target === 'new'
        ? (incomeResult.personName || 'new roommate')
        : (plan.people.find((p) => p.id === target)?.name ?? 'roommate')
    setAppliedNotice(`Updated ${targetName} with ${formatCurrency(incomeResult.takeHome)}/mo take-home and ${formatCurrency(incomeResult.essentials)}/mo essentials!`)
  }

  return (
    <section className="card pdf-interpreter-card" aria-labelledby="pdf-interpreter-heading">
      <div className="pdf-interpreter-top">
        <div>
          <h2 id="pdf-interpreter-heading">
            Upload a PDF—let AI extract &amp; divvy the numbers.
          </h2>
          <p>
            Drop in a rent lease, utility bill, or grocery receipt PDF to automatically extract and
            split expenses, or upload a roommate’s paystub / income statement PDF to calculate their
            monthly take-home pay and essentials.
          </p>
        </div>

        <div className="pdf-mode-switcher" role="tablist" aria-label="Document type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bills'}
            className={mode === 'bills' ? 'is-active' : ''}
            onClick={() => {
              setMode('bills')
              setError('')
              setAppliedNotice('')
            }}
          >
            <FileText size={15} aria-hidden="true" /> Rent, Bills &amp; Groceries PDF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'income'}
            className={mode === 'income' ? 'is-active' : ''}
            onClick={() => {
              setMode('income')
              setError('')
              setAppliedNotice('')
            }}
          >
            <Users size={15} aria-hidden="true" /> Roommate Income / Paystub PDF
          </button>
        </div>
      </div>

      <div className="pdf-upload-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf,.txt,.csv"
          className="sr-only-file"
          aria-label="Upload PDF statement"
          onChange={(event) => {
            void handleFileUpload(event)
          }}
        />

        <button
          type="button"
          className="button button--primary pdf-upload-trigger"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          {busy
            ? 'AI is interpreting PDF…'
            : mode === 'bills'
              ? 'Upload Rent / Bill / Grocery PDF'
              : 'Upload Income / Paystub PDF'}
        </button>

        <div className="pdf-sample-actions">
          <span>Or test with a real sample PDF:</span>
          {mode === 'bills' ? (
            <>
              <button
                type="button"
                className="chip-button"
                disabled={busy}
                onClick={() => {
                  void handleRunSamplePdf('lease-bills')
                }}
              >
                <Sparkles size={13} aria-hidden="true" /> Try Lease + Utilities PDF
              </button>
              <button
                type="button"
                className="chip-button"
                disabled={busy}
                onClick={() => {
                  void handleRunSamplePdf('grocery-utility')
                }}
              >
                <Sparkles size={13} aria-hidden="true" /> Try Groceries + PG&amp;E PDF
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => handleDownloadSamplePdf('lease-bills')}
              >
                <Download size={13} aria-hidden="true" /> Download sample .pdf
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="chip-button"
                disabled={busy}
                onClick={() => {
                  void handleRunSamplePdf('paystub-income')
                }}
              >
                <Sparkles size={13} aria-hidden="true" /> Try Biweekly Paystub PDF
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => handleDownloadSamplePdf('paystub-income')}
              >
                <Download size={13} aria-hidden="true" /> Download sample .pdf
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {appliedNotice && (
        <div className="pdf-applied-banner" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{appliedNotice}</span>
        </div>
      )}

      {result && result.mode === 'bills' && (
        <div className="pdf-result-panel">
          <div className="pdf-result-head">
            <div>
              <span className="pdf-file-badge">
                <FileText size={13} aria-hidden="true" /> {fileName || 'Uploaded PDF'}
              </span>
              <strong>{(result as BillsInterpretation).summary}</strong>
            </div>
          </div>

          {(result as BillsInterpretation).items.length > 0 && (
            <>
              <div className="divvy-breakdown-table-wrap">
                <table className="divvy-breakdown-table">
                  <thead>
                    <tr>
                      <th>Extracted Bill</th>
                      <th>Category</th>
                      <th>Due</th>
                      <th>Amount</th>
                      {plan.people.map((person) => (
                        <th key={person.id}>{person.name}’s Share</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result as BillsInterpretation).items.map((item, idx) => {
                      const itemSplit = calculateSplit(plan.people, item.amount)
                      const shares =
                        plan.splitMode === 'equal' || !itemSplit.marginShares
                          ? itemSplit.evenShares
                          : itemSplit.marginShares
                      return (
                        <tr key={`${item.name}-${idx}`}>
                          <td>
                            <strong>{item.name}</strong>
                          </td>
                          <td>
                            <span className="pdf-cat-pill">{item.category}</span>
                          </td>
                          <td>Day {item.dueDay}</td>
                          <td>
                            <strong>{formatCurrency(item.amount)}</strong>
                          </td>
                          {plan.people.map((person, pIdx) => (
                            <td key={person.id} className="divvy-share-cell">
                              {formatCurrency(shares[pIdx] ?? 0)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pdf-result-actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => applyExtractedBills((result as BillsInterpretation).items, false)}
                >
                  <Plus size={15} aria-hidden="true" /> Add {result.items.length} Extracted Bills to Plan
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => applyExtractedBills((result as BillsInterpretation).items, true)}
                >
                  Replace Plan Bills with Extracted ({formatCurrency(result.items.reduce((s, i) => s + i.amount, 0))})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {result && result.mode === 'income' && (
        <div className="pdf-result-panel">
          <div className="pdf-result-head">
            <div>
              <span className="pdf-file-badge">
                <FileText size={13} aria-hidden="true" /> {fileName || 'Uploaded Income PDF'}
              </span>
              <strong>{(result as IncomeInterpretation).summary}</strong>
            </div>
          </div>

          <div className="pdf-income-metrics">
            <div className="pdf-income-stat">
              <span>Pay Frequency</span>
              <strong>{(result as IncomeInterpretation).payFrequency}</strong>
            </div>
            <div className="pdf-income-stat">
              <span>Monthly Take-Home Pay</span>
              <strong>{formatCurrency((result as IncomeInterpretation).takeHome)}</strong>
            </div>
            <div className="pdf-income-stat">
              <span>Personal Essentials</span>
              <strong>{formatCurrency((result as IncomeInterpretation).essentials)}</strong>
            </div>
            <div className="pdf-income-stat pdf-income-stat--highlight">
              <span>Available Margin</span>
              <strong>
                {formatCurrency(
                  Math.max(
                    0,
                    (result as IncomeInterpretation).takeHome -
                      (result as IncomeInterpretation).essentials,
                  ),
                )}
              </strong>
            </div>
          </div>

          {(result as IncomeInterpretation).notes.length > 0 && (
            <ul className="pdf-income-notes">
              {(result as IncomeInterpretation).notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}

          <div className="pdf-result-actions">
            <label className="pdf-person-picker">
              <span>Apply to roommate:</span>
              <select
                value={selectedPersonId}
                onChange={(event) => setSelectedPersonId(event.target.value)}
              >
                {plan.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
                {plan.people.length < MAX_PEOPLE && (
                  <option value="new">+ Add as new roommate</option>
                )}
              </select>
            </label>

            <button
              type="button"
              className="button button--primary"
              onClick={() => applyExtractedIncome(result as IncomeInterpretation)}
            >
              <CheckCircle2 size={15} aria-hidden="true" /> Apply Income &amp; Recalculate Split
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
