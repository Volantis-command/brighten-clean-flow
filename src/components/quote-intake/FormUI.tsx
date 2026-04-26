import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Reusable dark-theme class strings for form inputs ───────────── */
export const darkInputClass =
  'w-full h-14 rounded-xl bg-secondary border border-border px-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors focus-visible:ring-0 focus-visible:ring-offset-0';

export const darkTextareaClass =
  'w-full min-h-[120px] rounded-xl bg-secondary border border-border px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors resize-none focus-visible:ring-0 focus-visible:ring-offset-0';

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-card border border-border p-5 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section header with emoji + line ────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ── Question label with optional subtitle ──────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-primary block">{children}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
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
                ? 'bg-primary border border-primary text-primary-foreground shadow-lg shadow-primary/15'
                : 'bg-secondary border border-border text-foreground/80 hover:border-primary/50 hover:bg-secondary/80'
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
                ? 'bg-primary/15 border-2 border-primary text-foreground'
                : 'bg-secondary border border-border text-foreground/80 hover:border-primary/50'
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
                ? 'bg-primary border border-primary text-primary-foreground shadow-lg shadow-primary/15'
                : 'bg-secondary border border-border text-foreground/80 hover:border-primary/50 hover:bg-secondary/80'
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
    <div className="sticky top-0 z-10 px-6 py-4 bg-background/95 backdrop-blur-sm border-b border-border/50">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? 'w-8 h-2 bg-primary' : i < step ? 'w-2 h-2 bg-primary' : 'w-2 h-2 bg-muted'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
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
        className="h-14 px-8 rounded-xl bg-transparent border border-border text-base font-medium text-foreground/80 hover:bg-secondary hover:border-primary/50 transition-all duration-200 flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {step < totalSteps - 1 ? (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 h-14 rounded-xl bg-primary hover:bg-primary/90 text-base font-semibold text-primary-foreground transition-all duration-200 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={submitting || !tcsAccepted}
          className="flex-1 h-14 rounded-xl bg-primary hover:bg-primary/90 text-lg font-semibold text-primary-foreground transition-all duration-200 shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-40"
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
    <div className="min-h-screen bg-background flex flex-col">
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-8 space-y-6">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
