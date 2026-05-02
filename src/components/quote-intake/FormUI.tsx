import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ─────────────────────────────────────────────────────────────────────
   DESIGN VARIANTS
   ?v=a  → Option A : white unselected buttons on dark green cards
   ?v=b  → Option B : white cards + dark text (marketing-site style)
   none  → original approved design (dark green cards, dark buttons)
───────────────────────────────────────────────────────────────────── */
const VariantCtx = React.createContext<string>('');
function useV() { return React.useContext(VariantCtx); }

/* ── Shared brand constants (never change) ──────────────────────── */
const BG     = '#173A27';
const YELLOW = '#FEDB00';
const WHITE  = '#FFFFFF';

/* ── Legacy shims ───────────────────────────────────────────────── */
export const darkInputClass = '';
export const darkTextareaClass = '';

/* ── Per-variant token helpers ──────────────────────────────────── */
function tokens(v: string) {
  const isA = v === 'a';
  const isB = v === 'b';

  return {
    // Card
    card:        isB ? '#FFFFFF'                       : '#1F4A32',
    cardBorder:  isB ? 'none'                          : '1px solid rgba(255,255,255,0.10)',
    cardShadow:  isB ? '0 8px 32px rgba(0,0,0,0.18)'  : 'none',

    // Section header label
    sectionLbl:  isB ? BG                              : YELLOW,
    divider:     isB ? '#E5E7EB'                       : 'rgba(255,255,255,0.10)',

    // Labels / body text inside cards
    labelText:   isB ? '#111111'                       : WHITE,
    muted:       isB ? '#6B7280'                       : 'rgba(255,255,255,0.55)',

    // Text inputs
    inputBg:     isB ? '#F0F0F0'                       : 'rgba(0,0,0,0.25)',
    inputText:   isB ? '#111111'                       : WHITE,
    inputBorder: isB ? '#D1D5DB'                       : 'rgba(255,255,255,0.10)',

    // Option buttons — unselected state
    btnBg:       isB ? '#EEEEEE'    : isA ? WHITE      : 'rgba(0,0,0,0.25)',
    btnText:     isB ? '#111111'    : isA ? '#111111'  : WHITE,
    btnBorder:   isB ? '#D1D5DB'    : isA ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.10)',
  };
}

/* ── Input components ───────────────────────────────────────────── */
export function GreenInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const t = tokens(useV());
  const style: React.CSSProperties = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    color: t.inputText,
    borderRadius: '0.75rem',
    height: '3.5rem',
    width: '100%',
    padding: '0 1rem',
    fontSize: '1rem',
    outline: 'none',
    ...props.style,
  };
  return (
    <input
      {...props}
      style={style}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder; }}
    />
  );
}

export function GreenTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const t = tokens(useV());
  const style: React.CSSProperties = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    color: t.inputText,
    borderRadius: '0.75rem',
    width: '100%',
    minHeight: '7rem',
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    outline: 'none',
    resize: 'none',
    ...props.style,
  };
  return (
    <textarea
      {...props}
      style={style}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder; }}
    />
  );
}

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const t = tokens(useV());
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: t.card, border: t.cardBorder, boxShadow: t.cardShadow }}
    >
      {children}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  const v = useV();
  const t = tokens(v);

  if (v === 'b') {
    // Marketing-site style: dark green banner header across full card width
    return (
      <div
        className="flex items-center gap-2.5 -mx-5 -mt-5 mb-4 px-5 py-3"
        style={{ background: BG }}
      >
        <span className="text-base leading-none">{icon}</span>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: t.sectionLbl }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: t.divider }} />
    </div>
  );
}

/* ── Question label ─────────────────────────────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  const t = tokens(useV());
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold" style={{ color: t.labelText }}>{children}</p>
      {sub && <p className="text-xs" style={{ color: t.muted }}>{sub}</p>}
    </div>
  );
}

/* ── Option grid ─────────────────────────────────────────────────── */
export function OptionGrid({
  options, value, onChange, cols = 3,
}: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  const t = tokens(useV());
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';
  return (
    <div className={`grid gap-3 ${colClass}`}>
      {options.map(opt => {
        const selected = value === opt;
        return (
          <button
            key={opt} type="button" onClick={() => onChange(opt)}
            className="h-12 px-3 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center"
            style={{
              background: selected ? YELLOW : t.btnBg,
              border: `1px solid ${selected ? YELLOW : t.btnBorder}`,
              color: selected ? '#111' : t.btnText,
              boxShadow: selected ? `0 0 16px rgba(254,219,0,0.25)` : 'none',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── Yes / No ────────────────────────────────────────────────────── */
export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const t = tokens(useV());
  return (
    <div className="grid grid-cols-2 gap-4">
      {([true, false] as const).map(v => {
        const selected = value === v;
        return (
          <button
            key={String(v)} type="button" onClick={() => onChange(v)}
            className="h-14 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200"
            style={{
              background: selected ? YELLOW : t.btnBg,
              border: `1.5px solid ${selected ? YELLOW : t.btnBorder}`,
              color: selected ? '#111' : t.btnText,
              boxShadow: selected ? `0 0 20px rgba(254,219,0,0.2)` : 'none',
            }}
          >
            {v ? '✓ Yes' : '✗ No'}
          </button>
        );
      })}
    </div>
  );
}

/* ── Day chips ───────────────────────────────────────────────────── */
export function DayChips({
  days, selected, onChange,
}: { days: string[]; selected: string[]; onChange: (d: string[]) => void }) {
  const t = tokens(useV());
  return (
    <div className="flex flex-wrap gap-3">
      {days.map(d => {
        const isSelected = selected.includes(d);
        return (
          <button
            key={d} type="button"
            onClick={() => onChange(isSelected ? selected.filter(x => x !== d) : [...selected, d])}
            className="h-12 min-w-[52px] px-4 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200"
            style={{
              background: isSelected ? YELLOW : t.btnBg,
              border: `1px solid ${isSelected ? YELLOW : t.btnBorder}`,
              color: isSelected ? '#111' : t.btnText,
            }}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/* ── Progress header ─────────────────────────────────────────────── */
export function FormProgressHeader({
  step, totalSteps, stepLabel,
}: { step: number; totalSteps: number; stepLabel: string }) {
  const pct = ((step + 1) / totalSteps) * 100;
  return (
    // Always dark green — matches marketing site nav bar
    <div className="sticky top-0 z-10 px-6 py-4" style={{ background: BG, borderBottom: `1px solid rgba(255,255,255,0.10)` }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-extrabold" style={{ color: WHITE }}>
            Brightly<span style={{ color: YELLOW }}>.</span>
          </span>
          <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Step {step + 1} of {totalSteps} — {stepLabel}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: YELLOW }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Nav buttons ─────────────────────────────────────────────────── */
export function FormNavButtons({
  step, totalSteps, canNext, submitting, tcsAccepted, onBack, onNext, onSubmit,
}: {
  step: number; totalSteps: number; canNext: boolean; submitting: boolean; tcsAccepted: boolean;
  onBack: () => void; onNext: () => void; onSubmit: () => void;
}) {
  const t = tokens(useV());
  return (
    <div className="flex gap-3 mt-8 pb-8">
      <button
        onClick={onBack}
        className="h-14 px-6 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2"
        style={{ background: t.btnBg, border: `1px solid ${t.btnBorder}`, color: t.btnText }}
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      {step < totalSteps - 1 ? (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex-1 h-14 rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30"
          style={{ background: YELLOW, color: '#111' }}
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={submitting || !tcsAccepted}
          className="flex-1 h-14 rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30"
          style={{ background: YELLOW, color: '#111' }}
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin mr-1" />}
          Get My Quote →
        </button>
      )}
    </div>
  );
}

/* ── Form shell — provides variant context ──────────────────────── */
export function FormShell({
  children, step, totalSteps, stepLabel, termsOpen, onTermsClose,
}: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  // Read variant fresh on every render so SPA navigation picks it up
  const variant = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('v') ?? '')
    : '';

  return (
    <VariantCtx.Provider value={variant}>
      <div className="min-h-screen flex flex-col" style={{ background: BG }}>
        <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 space-y-4">
          {children}
        </div>
        <TermsModal open={termsOpen} onClose={onTermsClose} />
      </div>
    </VariantCtx.Provider>
  );
}
