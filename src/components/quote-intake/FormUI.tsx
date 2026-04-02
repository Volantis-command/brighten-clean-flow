import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-xl border border-border shadow-[0_1px_4px_0_hsl(0_0%_0%/0.06)] p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── Section header with emoji + line ────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ── Question label with optional subtitle ──────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-base font-bold text-foreground leading-snug">{children}</p>
      {sub && <p className="text-[13px] text-muted-foreground leading-snug">{sub}</p>}
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
          className={`rounded-xl border-2 px-4 py-3.5 text-[13px] font-semibold transition-all leading-tight
            ${value === opt
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-background text-foreground hover:border-primary/40'
            }`}>
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
          className={`rounded-xl border-2 px-4 py-3.5 text-[13px] font-semibold transition-all
            ${value === v
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-background text-foreground hover:border-primary/40'
            }`}>
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
          className={`rounded-xl border-2 px-5 py-3.5 text-[13px] font-semibold transition-all
            ${selected.includes(d)
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-background text-foreground hover:border-primary/40'
            }`}>
          {d}
        </button>
      ))}
    </div>
  );
}

/* ── Sticky progress header ──────────────────────────────────────── */
export function FormProgressHeader({ step, totalSteps, stepLabel }: { step: number; totalSteps: number; stepLabel: string }) {
  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-4">
      <div className="max-w-lg mx-auto">
        <Progress value={((step + 1) / totalSteps) * 100} className="h-2 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
        <p className="text-[12px] font-semibold text-muted-foreground mt-2.5 text-center tracking-wide">
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
      <Button variant="outline" className="rounded-xl h-14 gap-2 text-sm font-semibold px-5" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>
      {step < totalSteps - 1 ? (
        <Button className="flex-1 rounded-xl h-14 bg-primary text-primary-foreground hover:bg-primary/90 gap-2 font-bold text-base shadow-md" onClick={onNext} disabled={!canNext}>
          Next <ArrowRight className="w-4 h-4" />
        </Button>
      ) : (
        <Button className="flex-1 rounded-xl h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-base shadow-md" onClick={onSubmit} disabled={submitting || !tcsAccepted}>
          {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Request My Quote →
        </Button>
      )}
    </div>
  );
}

/* ── Form page shell (light grey bg) ─────────────────────────────── */
export function FormShell({ children, step, totalSteps, stepLabel, termsOpen, onTermsClose }: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F8F9FA' }}>
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-7 space-y-7">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
