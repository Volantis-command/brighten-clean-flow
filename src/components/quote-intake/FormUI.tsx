import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Reusable dark-theme class strings for form inputs ───────────── */
export const darkInputClass =
  'w-full h-14 rounded-xl bg-white/5 border border-white/10 px-4 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#2E5D4E] focus:ring-1 focus:ring-[#2E5D4E]/50 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0';

export const darkTextareaClass =
  'w-full min-h-[120px] rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#2E5D4E] focus:ring-1 focus:ring-[#2E5D4E]/50 transition-colors resize-none focus-visible:ring-0 focus-visible:ring-offset-0';

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white/5 border border-white/10 p-5 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section header with emoji + line ────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-widest text-white/40 uppercase">{label}</span>
      <div className="flex-1 h-px bg-white/[0.08]" />
    </div>
  );
}

/* ── Question label with optional subtitle ──────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-[#2E5D4E] block">{children}</p>
      {sub && <p className="text-sm text-white/40">{sub}</p>}
    </div>
  );
}

/* ── Option grid (single select) — pill toggle style ─────────────── */
export function OptionGrid({ options, value, onChange, cols = 3 }: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';
  return (
    <div className={`grid gap-3 ${colClass}`}>
      {options.map(opt => {
        const selected = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`h-14 min-w-[56px] px-5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center ${
              selected
                ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
            }`}>
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
    <div className="grid grid-cols-2 gap-4">
      {([true, false] as const).map(v => {
        const selected = value === v;
        return (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={`flex items-center justify-center h-16 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 ${
              selected
                ? 'bg-[#2E5D4E]/15 border-2 border-[#2E5D4E] text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
            }`}>
            {v ? '✓ Yes' : '✗ No'}
          </button>
        );
      })}
    </div>
  );
}

/* ── Multi-select day chips ──────────────────────────────────────── */
export function DayChips({ days, selected, onChange }: { days: string[]; selected: string[]; onChange: (d: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {days.map(d => {
        const isSelected = selected.includes(d);
        return (
          <button key={d} type="button"
            onClick={() => onChange(isSelected ? selected.filter(x => x !== d) : [...selected, d])}
            className={`h-14 min-w-[56px] px-5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center ${
              isSelected
                ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
            }`}>
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
    <div className="sticky top-0 z-10 px-6 py-4 bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? 'w-8 h-2 bg-[#2E5D4E]' : i < step ? 'w-2 h-2 bg-[#2E5D4E]' : 'w-2 h-2 bg-white/20'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-sm text-white/50">
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
    <div className="flex gap-4 mt-10">
      <button
        onClick={onBack}
        className="h-14 px-8 rounded-xl bg-transparent border border-white/20 text-base font-medium text-white/70 hover:bg-white/5 hover:border-white/30 transition-all duration-200 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {step < totalSteps - 1 ? (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 h-14 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-base font-semibold text-white transition-all duration-200 shadow-lg shadow-[#2E5D4E]/20 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={submitting || !tcsAccepted}
          className="flex-1 h-14 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-[#2E5D4E]/25 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin mr-2" />} Get My Quote →
        </button>
      )}
    </div>
  );
}

/* ── Form page shell ─────────────────────────────────────────────── */
export function FormShell({ children, step, totalSteps, stepLabel, termsOpen, onTermsClose }: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
