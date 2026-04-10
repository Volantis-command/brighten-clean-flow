import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Tesla dark theme constants ──────────────────────────────────── */
const BG = '#1C1C1E';
const CARD_BG = 'rgba(255,255,255,0.05)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const GREEN = '#2E5D4E';
const TEXT = '#F2F2F7';
const TEXT_DIM = 'rgba(242,242,247,0.5)';
const ACCENT = '#86EFAC';

/* ── Reusable dark-theme class strings for form inputs ───────────── */
export const darkInputClass =
  'h-12 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[#F2F2F7] placeholder:text-[rgba(242,242,247,0.35)] focus:border-[#2E5D4E] focus:ring-1 focus:ring-[#2E5D4E]/50 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

export const darkTextareaClass =
  'rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.10)] text-[#F2F2F7] placeholder:text-[rgba(242,242,247,0.35)] focus:border-[#2E5D4E] focus:ring-1 focus:ring-[#2E5D4E]/50 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-6 ${className}`}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </div>
  );
}

/* ── Section header with emoji + line ────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span
        className="text-[11px] font-extrabold uppercase"
        style={{ color: ACCENT, letterSpacing: '0.1em' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
    </div>
  );
}

/* ── Question label with optional subtitle ──────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-base font-medium leading-snug" style={{ color: TEXT }}>{children}</p>
      {sub && <p className="text-[13px] leading-snug" style={{ color: TEXT_DIM }}>{sub}</p>}
    </div>
  );
}

/* ── Option grid (single select) — pill toggle style ─────────────── */
export function OptionGrid({ options, value, onChange, cols = 3 }: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';
  return (
    <div className={`grid gap-2.5 ${colClass}`}>
      {options.map(opt => {
        const selected = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className="rounded-xl px-4 py-3.5 text-[13px] font-semibold transition-all duration-200 leading-tight backdrop-blur-sm"
            style={{
              background: selected ? 'rgba(46,93,78,0.20)' : CARD_BG,
              color: selected ? '#FFFFFF' : TEXT,
              border: selected ? `2px solid ${GREEN}` : `1px solid ${CARD_BORDER}`,
              boxShadow: selected ? '0 0 10px rgba(46,93,78,0.12)' : 'none',
              minHeight: '44px',
            }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── Yes / No toggle ─────────────────────────────────────────────── */
export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {([true, false] as const).map(v => {
        const selected = value === v;
        return (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className="rounded-xl px-4 py-3.5 text-[13px] font-semibold transition-all duration-200"
            style={{
              background: selected ? 'rgba(46,93,78,0.20)' : CARD_BG,
              color: selected ? '#FFFFFF' : TEXT,
              border: selected ? `2px solid ${GREEN}` : `1px solid ${CARD_BORDER}`,
              minHeight: '44px',
            }}>
            {v ? 'Yes' : 'No'}
          </button>
        );
      })}
    </div>
  );
}

/* ── Multi-select day chips ──────────────────────────────────────── */
export function DayChips({ days, selected, onChange }: { days: string[]; selected: string[]; onChange: (d: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {days.map(d => {
        const isSelected = selected.includes(d);
        return (
          <button key={d} type="button"
            onClick={() => onChange(isSelected ? selected.filter(x => x !== d) : [...selected, d])}
            className="rounded-xl px-5 py-3.5 text-[13px] font-semibold transition-all duration-200"
            style={{
              background: isSelected ? 'rgba(46,93,78,0.20)' : CARD_BG,
              color: isSelected ? '#FFFFFF' : TEXT,
              border: isSelected ? `2px solid ${GREEN}` : `1px solid ${CARD_BORDER}`,
              minHeight: '44px',
            }}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

/* ── Sticky progress header ──────────────────────────────────────── */
export function FormProgressHeader({ step, totalSteps, stepLabel }: { step: number; totalSteps: number; stepLabel: string }) {
  return (
    <div
      className="sticky top-0 z-10 px-4 py-4"
      style={{ background: 'rgba(28,28,30,0.9)', backdropFilter: 'blur(16px)', borderBottom: `1px solid rgba(255,255,255,0.06)` }}
    >
      <div className="max-w-lg mx-auto">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%`, background: GREEN }}
          />
        </div>
        <p
          className="text-xs font-semibold mt-2.5 text-center tracking-wide"
          style={{ color: GREEN }}
        >
          Step {step + 1} of {totalSteps} — {stepLabel}
        </p>
      </div>
    </div>
  );
}

/* ── Bottom navigation bar ───────────────────────────────────────── */
export function FormNavButtons({
  step, totalSteps, canNext, submitting, tcsAccepted, onBack, onNext, onSubmit,
}: {
  step: number; totalSteps: number; canNext: boolean; submitting: boolean; tcsAccepted: boolean;
  onBack: () => void; onNext: () => void; onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6 pb-10">
      <button
        onClick={onBack}
        className="rounded-xl h-14 px-6 text-sm font-bold flex items-center justify-center gap-2 transition-all"
        style={{ background: 'transparent', border: `1px solid rgba(255,255,255,0.15)`, color: TEXT }}
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {step < totalSteps - 1 ? (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 rounded-xl h-14 font-extrabold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{ background: GREEN, color: '#FFFFFF', boxShadow: '0 8px 20px rgba(46,93,78,0.20)' }}
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={submitting || !tcsAccepted}
          className="flex-1 rounded-xl h-14 font-extrabold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
          style={{ background: GREEN, color: '#FFFFFF', boxShadow: '0 8px 24px rgba(46,93,78,0.30)' }}
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin mr-2" />} Get My Quote →
        </button>
      )}
    </div>
  );
}

/* ── Form page shell (Tesla dark bg) ─────────────────────────────── */
export function FormShell({ children, step, totalSteps, stepLabel, termsOpen, onTermsClose }: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-7 space-y-7">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
