import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Reusable dark-theme class strings for form inputs ───────────── */
export const darkInputClass =
  'h-12 rounded-[10px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] text-[#F0FDF4] placeholder:text-[rgba(240,253,244,0.4)] focus:border-[#FEDB00] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0';

export const darkTextareaClass =
  'rounded-[10px] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] text-[#F0FDF4] placeholder:text-[rgba(240,253,244,0.4)] focus:border-[#FEDB00] focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0';

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[16px] p-6 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(254,219,0,0.12)',
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
        style={{ color: '#86EFAC', letterSpacing: '0.1em' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
    </div>
  );
}

/* ── Question label with optional subtitle ──────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-base font-medium leading-snug" style={{ color: '#F0FDF4' }}>{children}</p>
      {sub && <p className="text-[13px] leading-snug" style={{ color: 'rgba(240,253,244,0.5)' }}>{sub}</p>}
    </div>
  );
}

/* ── Option grid (single select) ─────────────────────────────────── */
export function OptionGrid({ options, value, onChange, cols = 3 }: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';
  return (
    <div className={`grid gap-2.5 ${colClass}`}>
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className="rounded-xl px-4 py-3.5 text-[13px] font-semibold transition-all leading-tight"
          style={value === opt
            ? { background: '#FEDB00', color: '#0C463D', border: '2px solid #FEDB00' }
            : { background: 'rgba(255,255,255,0.06)', color: '#F0FDF4', border: '2px solid rgba(255,255,255,0.12)' }
          }>
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ── Yes / No toggle ─────────────────────────────────────────────── */
export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {([true, false] as const).map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className="rounded-xl px-4 py-3.5 text-[13px] font-semibold transition-all"
          style={value === v
            ? { background: '#FEDB00', color: '#0C463D', border: '2px solid #FEDB00' }
            : { background: 'rgba(255,255,255,0.06)', color: '#F0FDF4', border: '2px solid rgba(255,255,255,0.12)' }
          }>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

/* ── Multi-select day chips ──────────────────────────────────────── */
export function DayChips({ days, selected, onChange }: { days: string[]; selected: string[]; onChange: (d: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {days.map(d => (
        <button key={d} type="button"
          onClick={() => onChange(selected.includes(d) ? selected.filter(x => x !== d) : [...selected, d])}
          className="rounded-xl px-5 py-3.5 text-[13px] font-semibold transition-all"
          style={selected.includes(d)
            ? { background: '#FEDB00', color: '#0C463D', border: '2px solid #FEDB00' }
            : { background: 'rgba(255,255,255,0.06)', color: '#F0FDF4', border: '2px solid rgba(255,255,255,0.12)' }
          }>
          {d}
        </button>
      ))}
    </div>
  );
}

/* ── Sticky progress header ──────────────────────────────────────── */
export function FormProgressHeader({ step, totalSteps, stepLabel }: { step: number; totalSteps: number; stepLabel: string }) {
  return (
    <div
      className="sticky top-0 z-10 px-4 py-4"
      style={{ background: 'rgba(10,15,14,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="max-w-lg mx-auto">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%`, background: '#FEDB00' }}
          />
        </div>
        <p
          className="text-[12px] font-semibold mt-2.5 text-center tracking-wide"
          style={{ color: '#FEDB00' }}
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
    <div className="flex gap-3 pt-4 pb-10">
      <button
        onClick={onBack}
        className="rounded-xl h-[52px] px-5 text-sm font-semibold flex items-center gap-2 transition-colors"
        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#F0FDF4' }}
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {step < totalSteps - 1 ? (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 rounded-xl h-[52px] font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          style={{ background: '#FEDB00', color: '#0C463D' }}
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={submitting || !tcsAccepted}
          className="flex-1 rounded-xl h-[52px] font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          style={{ background: '#FEDB00', color: '#0C463D' }}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Request My Quote →
        </button>
      )}
    </div>
  );
}

/* ── Form page shell (dark brand bg) ─────────────────────────────── */
export function FormShell({ children, step, totalSteps, stepLabel, termsOpen, onTermsClose }: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0A0F0E' }}>
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-7 space-y-7">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
