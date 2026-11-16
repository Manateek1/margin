import { useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  House,
  Layers3,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import { calculateSplit, formatCurrency, type HouseholdPlan } from './lib/finance'

type PlannerPage = 'overview' | 'plan' | 'people' | 'scenarios' | 'coach' | 'security'

interface LandingPageProps {
  plan: HouseholdPlan
  onOpenPlanner: (targetPage?: PlannerPage) => void
}

function formatOrdinal(day: number): string {
  const rem = day % 100
  if (rem >= 11 && rem <= 13) return `${day}th`
  if (day % 10 === 1) return `${day}st`
  if (day % 10 === 2) return `${day}nd`
  if (day % 10 === 3) return `${day}rd`
  return `${day}th`
}

export function LandingPage({ plan, onOpenPlanner }: LandingPageProps) {
  const [previewDelta, setPreviewDelta] = useState<number>(120)
  const baseTotal = plan.bills.reduce((sum, bill) => sum + bill.amount, 0) || 1800
  const baseSplit = calculateSplit(plan.people, baseTotal)
  const previewSplit = calculateSplit(plan.people, baseTotal + previewDelta)

  const maya = plan.people[0] ?? { name: 'Maya', avatar: 2, takeHome: 2800, essentials: 1600 }
  const leo = plan.people[1] ?? { name: 'Leo', avatar: 0, takeHome: 4800, essentials: 2400 }
  const mayaShare = baseSplit.marginShares?.[0] ?? baseSplit.evenShares[0] ?? 600
  const leoShare = baseSplit.marginShares?.[1] ?? baseSplit.evenShares[1] ?? 1200
  const mayaPreview = previewSplit.marginShares?.[0] ?? previewSplit.evenShares[0] ?? 640
  const leoPreview = previewSplit.marginShares?.[1] ?? previewSplit.evenShares[1] ?? 1280
  const effortPct = baseSplit.contributionPercent ?? 50

  return (
    <div className="lp-page">
      {/* Top Marketing Navbar */}
      <header className="lp-navbar">
        <button
          type="button"
          className="lp-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="lp-brand-mark">
            <House size={18} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="lp-brand-text">Margin</span>
          <span className="lp-brand-dot" aria-hidden="true" />
        </button>

        <nav className="lp-nav-links" aria-label="Landing page sections">
          <a href="#lp-features">Features</a>
          <a href="#lp-advantages">Advantages</a>
          <a href="#lp-pulse">Monthly Pulse</a>
          <a href="#lp-scenarios">What-If</a>
          <a href="#lp-coach">AI Coach</a>
        </nav>

        <div className="lp-nav-actions">
          <button
            type="button"
            className="lp-btn lp-btn--ghost"
            onClick={() => onOpenPlanner('security')}
          >
            <LockKeyhole size={14} aria-hidden="true" /> Local Vault
          </button>
          <button
            type="button"
            className="lp-btn lp-btn--dark"
            onClick={() => onOpenPlanner('overview')}
          >
            <House size={14} aria-hidden="true" /> Open Planner
          </button>
        </div>
      </header>

      <main className="lp-main">
        {/* HERO BANNER — Inspired by tilted dual-device card layout */}
        <section className="lp-hero-card" aria-labelledby="lp-hero-heading">
          <div className="lp-hero-copy">
            <h1 id="lp-hero-heading">
              Split for <span className="lp-sparkle" aria-hidden="true">✦</span>
              <br />
              Real Life
            </h1>
            <p>
              Work with what each roommate actually has left after essentials. Track recurring bills,
              test what-if surprises, draft kind money talks with AI, and lock your plan locally!
            </p>

            <div className="lp-hero-cta-row">
              <button
                type="button"
                className="lp-btn lp-btn--dark lp-btn--lg"
                onClick={() => onOpenPlanner('overview')}
              >
                <House size={16} aria-hidden="true" /> Launch Planner
              </button>

              {/* Hand-drawn looping arrow inspired by reference */}
              <svg
                className="lp-hero-loop-arrow"
                viewBox="0 0 230 185"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M172 8 C216 20, 222 82, 186 122 C158 152, 118 164, 124 138 C129 118, 154 134, 140 158 C128 178, 72 158, 16 152"
                  stroke="#152016"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M28 144 L13 152 L26 161"
                  stroke="#152016"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <button
              type="button"
              className="lp-find-out-more"
              onClick={() => {
                document.getElementById('lp-features')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Find Out More <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          {/* Dual Tilted App Showcase Cards */}
          <div className="lp-hero-devices" aria-label="Interactive Margin app preview">
            {/* Tilted White Card (Left/Front) */}
            <div className="lp-device lp-device--light">
              <div className="lp-device-top">
                <strong>Shared Home</strong>
                <span className="lp-device-pill">Nov 2026</span>
              </div>

              <div className="lp-device-search">
                <span>Split mode</span>
                <div className="lp-device-tags">
                  <span className="is-active">Margin</span>
                  <span>Equal</span>
                  <span>What-If</span>
                  <span>CSV</span>
                </div>
              </div>

              <div className="lp-device-dark-box">
                <div className="lp-device-dark-label">Available-Income Split</div>
                <div className="lp-device-dark-row">
                  <div>
                    <strong>{formatCurrency(baseTotal)}</strong>
                    <span>{effortPct}% of available margin</span>
                  </div>
                  <div className="lp-mini-avatars">
                    <span className="roommate-avatar" style={{ backgroundPosition: '66.66% 0%' }} />
                    <span className="roommate-avatar" style={{ backgroundPosition: '0% 0%' }} />
                  </div>
                </div>
              </div>

              <div className="lp-device-subhead">Roommate Shares</div>
              <div className="lp-device-split-grid">
                <button
                  type="button"
                  className="lp-device-person-card"
                  onClick={() => onOpenPlanner('people')}
                >
                  <span className="roommate-avatar" style={{ backgroundPosition: '66.66% 0%' }} />
                  <strong>{maya.name}</strong>
                  <span>
                    {formatCurrency(mayaShare)} <em>{effortPct}%</em>
                  </span>
                </button>
                <button
                  type="button"
                  className="lp-device-person-card"
                  onClick={() => onOpenPlanner('people')}
                >
                  <span className="roommate-avatar" style={{ backgroundPosition: '0% 0%' }} />
                  <strong>{leo.name}</strong>
                  <span>
                    {formatCurrency(leoShare)} <em>{effortPct}%</em>
                  </span>
                </button>
              </div>

              <div className="lp-device-bottom-actions">
                <button
                  type="button"
                  className="lp-chip-btn lp-chip-btn--coral"
                  onClick={() => onOpenPlanner('overview')}
                >
                  Equal {formatCurrency(baseTotal / Math.max(1, plan.people.length))}
                </button>
                <button
                  type="button"
                  className="lp-chip-btn lp-chip-btn--lime"
                  onClick={() => onOpenPlanner('overview')}
                >
                  Fair Split
                </button>
              </div>
            </div>

            {/* Tilted Dark Forest Card (Right/Back) */}
            <div className="lp-device lp-device--dark">
              <div className="lp-device-top lp-device-top--dark">
                <span>✦ What-If Curve</span>
                <span className="lp-device-pill lp-device-pill--dark">Live Math</span>
              </div>

              <div className="lp-dark-price-row">
                <strong>{formatCurrency(baseTotal + previewDelta)}</strong>
                <span>+{formatCurrency(previewDelta)} preview</span>
              </div>

              {/* Stylized candlestick / step chart */}
              <svg className="lp-candlestick-svg" viewBox="0 0 240 120" fill="none" aria-hidden="true">
                <line x1="20" y1="25" x2="220" y2="25" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <line x1="20" y1="60" x2="220" y2="60" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <line x1="20" y1="95" x2="220" y2="95" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                {/* Candle bars */}
                <g stroke="#8fd16a" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="30" y1="78" x2="30" y2="102" />
                  <rect x="26" y="84" width="8" height="12" rx="2" fill="#8fd16a" />
                  <line x1="56" y1="62" x2="56" y2="92" />
                  <rect x="52" y="68" width="8" height="16" rx="2" fill="#8fd16a" />
                  <line x1="108" y1="48" x2="108" y2="80" />
                  <rect x="104" y="54" width="8" height="18" rx="2" fill="#8fd16a" />
                  <line x1="160" y1="30" x2="160" y2="66" />
                  <rect x="156" y="36" width="8" height="20" rx="2" fill="#8fd16a" />
                  <line x1="210" y1="16" x2="210" y2="52" />
                  <rect x="206" y="22" width="8" height="20" rx="2" fill="#b7ee83" />
                </g>
                <g stroke="#f08b6d" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="82" y1="66" x2="82" y2="96" />
                  <rect x="78" y="72" width="8" height="15" rx="2" fill="#f08b6d" />
                  <line x1="134" y1="52" x2="134" y2="86" />
                  <rect x="130" y="60" width="8" height="16" rx="2" fill="#f08b6d" />
                  <line x1="186" y1="38" x2="186" y2="70" />
                  <rect x="182" y="44" width="8" height="14" rx="2" fill="#f08b6d" />
                </g>
              </svg>

              <div className="lp-dark-card-Sheet">
                <div className="lp-dark-sheet-row">
                  <span>{maya.name} with change</span>
                  <strong>{formatCurrency(mayaPreview)}</strong>
                </div>
                <div className="lp-dark-sheet-row">
                  <span>{leo.name} with change</span>
                  <strong>{formatCurrency(leoPreview)}</strong>
                </div>
                <div className="lp-device-bottom-actions">
                  <button
                    type="button"
                    className="lp-chip-btn lp-chip-btn--coral"
                    onClick={() => onOpenPlanner('scenarios')}
                  >
                    Credit
                  </button>
                  <button
                    type="button"
                    className="lp-chip-btn lp-chip-btn--lime"
                    onClick={() => onOpenPlanner('scenarios')}
                  >
                    Try What-If
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Two Bento Cards ("Get the Most Out of Your Shared Home") */}
        <section id="lp-features" className="lp-section" aria-labelledby="lp-bento-heading">
          <h2 id="lp-bento-heading" className="lp-section-title">
            Get the Most Out
            <br />
            of Your Shared Home
          </h2>

          <div className="lp-bento-grid">
            <article className="lp-bento-card">
              <div className="lp-bento-copy">
                <h3>Up to 12 Roommates, Zero Accounts</h3>
                <p>
                  Manage everyone’s take-home pay, personal essentials, and recurring bills from one
                  private workspace in your browser.
                </p>
                <button
                  type="button"
                  className="lp-read-more"
                  onClick={() => onOpenPlanner('people')}
                >
                  Manage Roommates <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="lp-bento-art lp-bento-art--leaf" aria-hidden="true">
                <span className="lp-shape-black" />
                <span className="lp-shape-lime">
                  <svg viewBox="0 0 80 80" fill="none">
                    <path
                      d="M22 58 C24 34, 42 24, 58 24 C56 44, 42 56, 22 58 Z"
                      stroke="#152016"
                      strokeWidth="2.4"
                    />
                    <path d="M18 62 L46 36" stroke="#152016" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
            </article>

            <article className="lp-bento-card">
              <div className="lp-bento-copy">
                <h3>Full Split Analytics in Your App</h3>
                <p>
                  Compare equal splits against proportional available-income shares and try different
                  what-if scenarios with exact cent precision.
                </p>
                <button
                  type="button"
                  className="lp-read-more"
                  onClick={() => onOpenPlanner('overview')}
                >
                  Compare Splits <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="lp-bento-art lp-bento-art--ring" aria-hidden="true">
                <svg viewBox="0 0 180 150" fill="none">
                  <path
                    d="M35 135 A 62 62 0 0 1 52 38"
                    stroke="#eb7b64"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d="M60 32 A 62 62 0 0 1 132 34"
                    stroke="#b5e56d"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d="M140 42 A 62 62 0 0 1 155 125"
                    stroke="#152016"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d="M68 104 L84 86 L96 98 L114 74 L126 82"
                    stroke="#152016"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M118 72 L127 72 L127 81"
                    stroke="#152016"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </article>
          </div>
        </section>

        {/* SECTION 3: Advantages Asymmetric 2-Column Grid */}
        <section id="lp-advantages" className="lp-section lp-advantages" aria-labelledby="lp-adv-heading">
          <div className="lp-advantages-intro">
            <h2 id="lp-adv-heading" className="lp-section-title">
              Advantages
            </h2>
            <p>
              We designed Margin around the real friction of shared living—combining empathetic math,
              zero-knowledge local security, and calm conversation tools.
            </p>
          </div>

          <div className="lp-advantages-grid">
            <div className="lp-adv-item">
              <span className="lp-adv-badge" aria-hidden="true">
                <Zap size={17} />
              </span>
              <div>
                <h3>Instant Setup</h3>
                <p>
                  No accounts, bank connections, or email invites required. Start planning your shared
                  household in under a minute.
                </p>
                <button
                  type="button"
                  className="lp-pill-action"
                  onClick={() => onOpenPlanner('overview')}
                >
                  Open Planner
                </button>
              </div>
            </div>

            <div className="lp-adv-item">
              <span className="lp-adv-badge" aria-hidden="true">
                <MessageCircle size={17} />
              </span>
              <div>
                <h3>Zero-PII AI Coach</h3>
                <p>
                  Cloudflare Workers AI drafts warm conversation openers from your goal and tone while
                  real numbers stay on your device.
                </p>
                <button
                  type="button"
                  className="lp-pill-action"
                  onClick={() => onOpenPlanner('coach')}
                >
                  Draft a Talk
                </button>
              </div>
            </div>

            <div className="lp-adv-item">
              <span className="lp-adv-badge" aria-hidden="true">
                <ShieldCheck size={17} />
              </span>
              <div>
                <h3>Local Password Vault</h3>
                <p>
                  Encrypt your household plan with AES-256-GCM and PBKDF2-SHA-256 (600,000 iterations)
                  that locks on reload.
                </p>
                <button
                  type="button"
                  className="lp-pill-action"
                  onClick={() => onOpenPlanner('security')}
                >
                  Lock Your Plan
                </button>
              </div>
            </div>

            <div className="lp-adv-item">
              <span className="lp-adv-badge" aria-hidden="true">
                <TrendingUp size={17} />
              </span>
              <div>
                <h3>Fair Margin Math</h3>
                <p>
                  Deterministic BigInt cent allocation ensures every roommate contributes the same fair
                  percentage of available income.
                </p>
                <button
                  type="button"
                  className="lp-pill-action"
                  onClick={() => onOpenPlanner('people')}
                >
                  Start Now
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Privacy & Architecture Badge Strip ("Our Pillars") */}
        <section className="lp-section lp-pillars" aria-labelledby="lp-pillars-heading">
          <h2 id="lp-pillars-heading" className="lp-section-title lp-text-center">
            Built for Privacy &amp; Precision
          </h2>
          <p className="lp-pillars-sub">
            Modern browser cryptography and edge AI working together with zero cloud tracking
          </p>

          <div className="lp-pillar-strip">
            <div className="lp-pillar-chip">
              <House size={18} aria-hidden="true" />
              <span>React 19</span>
            </div>
            <div className="lp-pillar-chip">
              <Sparkles size={18} aria-hidden="true" />
              <span>Gemma 4 AI</span>
            </div>
            <div className="lp-pillar-chip">
              <LockKeyhole size={18} aria-hidden="true" />
              <span>AES-256-GCM</span>
            </div>
            <div className="lp-pillar-chip">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>PBKDF2 600K</span>
            </div>
            <div className="lp-pillar-chip">
              <Wallet size={18} aria-hidden="true" />
              <span>BigInt Cents</span>
            </div>
            <div className="lp-pillar-chip">
              <Layers3 size={18} aria-hidden="true" />
              <span>What-If Engine</span>
            </div>
            <div className="lp-pillar-chip">
              <CalendarDays size={18} aria-hidden="true" />
              <span>CSV Export</span>
            </div>
            <div className="lp-pillar-chip">
              <Users size={18} aria-hidden="true" />
              <span>12 Roommates</span>
            </div>
          </div>
        </section>

        {/* SECTION 5: Dark Forest Canopy Pulse Banner with Pop-Out Floating Card */}
        <section id="lp-pulse" className="lp-pulse-banner" aria-labelledby="lp-pulse-heading">
          <svg className="lp-pulse-wave" viewBox="0 0 220 120" fill="none" aria-hidden="true">
            <path
              d="M-10 95 C30 90, 48 25, 86 35 C124 45, 132 100, 170 72 C194 54, 206 42, 220 46"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <div className="lp-pulse-copy">
            <h2 id="lp-pulse-heading">
              Keep Your Finger on the
              <br />
              Monthly Household Pulse
            </h2>
            <button
              type="button"
              className="lp-btn lp-btn--light"
              onClick={() => onOpenPlanner('plan')}
            >
              <CalendarDays size={15} aria-hidden="true" /> Open Monthly Plan
            </button>
          </div>

          <div className="lp-pulse-popout-card">
            <div className="lp-popout-total">{formatCurrency(baseTotal)}</div>
            <div className="lp-popout-dark-pill">
              <div>
                <span>Room after plan</span>
                <strong>{formatCurrency( Math.max(0, baseSplit.totalAvailable - baseTotal) )}</strong>
              </div>
              <span className="lp-popout-tag">{plan.bills.length} bills</span>
            </div>
            <div className="lp-popout-list">
              {plan.bills.slice(0, 3).map((bill, idx) => (
                <div key={bill.id} className="lp-popout-item">
                  <span className={`lp-popout-dot lp-popout-dot--${idx % 3}`} />
                  <div>
                    <strong>{bill.name}</strong>
                    <span>Due {formatOrdinal(bill.dueDay)}</span>
                  </div>
                  <b>{formatCurrency(bill.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 6A: Alternating Feature — Tilted Dark Chart Card + Live Interactive What-If */}
        <section id="lp-scenarios" className="lp-split-feature" aria-labelledby="lp-realtime-heading">
          <div className="lp-tilted-chart-wrap">
            <div className="lp-tilted-lime-backing" aria-hidden="true" />
            <div className="lp-tilted-dark-card">
              <div className="lp-tilted-card-head">
                <div>
                  <span>What-If Scenario Preview</span>
                  <strong>{formatCurrency(baseTotal + previewDelta)} / mo</strong>
                </div>
                <div className="lp-tilted-card-delta">
                  <span>Delta</span>
                  <b>+{formatCurrency(previewDelta)}</b>
                </div>
              </div>
              <svg viewBox="0 0 360 135" className="lp-area-chart" fill="none" aria-hidden="true">
                <path
                  d="M8 34 L48 56 L86 42 L124 82 L162 68 L202 104 L242 78 L280 96 L318 44 L352 60"
                  stroke="#b7ee83"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 34 L48 56 L86 42 L124 82 L162 68 L202 104 L242 78 L280 96 L318 44 L352 60 L352 130 L8 130 Z"
                  fill="url(#lpChartGrad)"
                />
                <defs>
                  <linearGradient id="lpChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b7ee83" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#b7ee83" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="lp-quick-delta-bar">
                <span>Try a surprise cost:</span>
                {[50, 120, 300].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={previewDelta === amt ? 'is-selected' : ''}
                    onClick={() => setPreviewDelta(amt)}
                  >
                    +${amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lp-split-copy">
            <h2 id="lp-realtime-heading" className="lp-section-title">
              Test Any Change in Real Time
            </h2>
            <p>
              No more guessing how a winter utility spike or shared household credit will affect
              everyone. Preview one-time changes side by side—your saved monthly plan stays untouched
              until you’re ready.
            </p>
            <button
              type="button"
              className="lp-read-more"
              onClick={() => onOpenPlanner('scenarios')}
            >
              Open What-If Builder <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* SECTION 6B: Alternating Feature — AI Coach & Floating Stacked Cards over Botanical Orb */}
        <section id="lp-coach" className="lp-split-feature lp-split-feature--reverse" aria-labelledby="lp-coach-heading">
          <div className="lp-split-copy">
            <h2 id="lp-coach-heading" className="lp-section-title">
              Every Money Talk,
              <br />
              Handled with Care
            </h2>
            <p>
              Whether you’re starting the first rent talk, reviewing a split after a paycheck change,
              or doing a monthly check-in, Margin’s Cloudflare AI coach drafts a respectful opener and
              appends your real household figures strictly on your device.
            </p>
            <button
              type="button"
              className="lp-read-more"
              onClick={() => onOpenPlanner('coach')}
            >
              Try AI Conversation Coach <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="lp-floating-stack-wrap">
            <div className="lp-lime-orb" aria-hidden="true" />

            <button
              type="button"
              className="lp-stack-pill lp-stack-pill--1"
              onClick={() => onOpenPlanner('people')}
            >
              <span className="roommate-avatar" style={{ backgroundPosition: '66.66% 0%' }} />
              <div className="lp-stack-meta">
                <strong>{maya.name} · Roommate 1</strong>
                <span>Available after essentials</span>
              </div>
              <div className="lp-stack-num">
                <strong>{formatCurrency(mayaShare)}</strong>
                <span>{effortPct}% share</span>
              </div>
            </button>

            <button
              type="button"
              className="lp-stack-pill lp-stack-pill--2"
              onClick={() => onOpenPlanner('people')}
            >
              <span className="roommate-avatar" style={{ backgroundPosition: '0% 0%' }} />
              <div className="lp-stack-meta">
                <strong>{leo.name} · Roommate 2</strong>
                <span>Available after essentials</span>
              </div>
              <div className="lp-stack-num">
                <strong>{formatCurrency(leoShare)}</strong>
                <span>{effortPct}% share</span>
              </div>
            </button>

            <button
              type="button"
              className="lp-stack-pill lp-stack-pill--3"
              onClick={() => onOpenPlanner('coach')}
            >
              <span className="lp-stack-icon">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <div className="lp-stack-meta">
                <strong>Google Gemma 4 · Warm</strong>
                <span>Zero PII sent to Cloudflare</span>
              </div>
              <div className="lp-stack-num">
                <strong>Private</strong>
                <span>On-device</span>
              </div>
            </button>

            <svg className="lp-bottom-connector" viewBox="0 0 140 110" fill="none" aria-hidden="true">
              <path
                d="M118 8 C126 52, 82 54, 72 82 C66 96, 42 102, 12 104"
                stroke="#152016"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </section>

        {/* SECTION 7: Final Centered Call to Action */}
        <section className="lp-final-cta" aria-labelledby="lp-final-heading">
          <h2 id="lp-final-heading">
            Use Margin for Free
            <br />
            and Start Now
          </h2>
          <button
            type="button"
            className="lp-btn lp-btn--dark lp-btn--lg"
            onClick={() => onOpenPlanner('overview')}
          >
            <House size={16} aria-hidden="true" /> Open Margin Planner
          </button>
        </section>
      </main>

      {/* Rounded Dark Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <div className="lp-brand lp-brand--light">
            <span className="lp-brand-mark lp-brand-mark--dark">
              <House size={18} strokeWidth={2.4} aria-hidden="true" />
            </span>
            <span className="lp-brand-text">Margin</span>
            <span className="lp-brand-dot" aria-hidden="true" />
          </div>
          <p>More clarity for the home you share. 100% browser-local roommate financial planning.</p>
        </div>

        <div className="lp-footer-col">
          <strong>Planner Tools</strong>
          <button type="button" onClick={() => onOpenPlanner('overview')}>
            Overview &amp; Split
          </button>
          <button type="button" onClick={() => onOpenPlanner('plan')}>
            Monthly Costs
          </button>
          <button type="button" onClick={() => onOpenPlanner('people')}>
            Roommates (Up to 12)
          </button>
          <button type="button" onClick={() => onOpenPlanner('scenarios')}>
            What-If Builder
          </button>
        </div>

        <div className="lp-footer-col">
          <strong>Privacy &amp; AI</strong>
          <button type="button" onClick={() => onOpenPlanner('coach')}>
            Cloudflare AI Coach
          </button>
          <button type="button" onClick={() => onOpenPlanner('security')}>
            AES-256-GCM Vault
          </button>
          <a href="https://github.com/Manateek1/margin" target="_blank" rel="noreferrer">
            GitHub Repository
          </a>
          <a href="https://getmargin.pages.dev" target="_blank" rel="noreferrer">
            getmargin.pages.dev
          </a>
        </div>

        <div className="lp-footer-cta-box">
          <strong>Jump Straight to a Tool</strong>
          <div className="lp-footer-input-bar">
            <span>Ready to plan {plan.people.length} roommates?</span>
            <button
              type="button"
              aria-label="Open Margin Planner"
              onClick={() => onOpenPlanner('overview')}
            >
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <small>Bay Valley Hacks 2026 · Elevate the Ordinary</small>
        </div>
      </footer>
    </div>
  )
}
