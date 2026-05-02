import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ─────────────────────────────────────────────────────────────────────
   DESIGN VARIANTS  (read fresh each render via React context)
   no param → original approved dark design
   ?v=a     → white unselected buttons on dark card
   ?v=b     → white card, dark text — marketing-site style
───────────────────────────────────────────────────────────────────── */
const VariantCtx = React.createContext<string>('');
function useV() { return React.useContext(VariantCtx); }

/* ── Unchanged brand constants ──────────────────────────────────── */
const BG       = '#173A27';
const CARD     = '#1F4A32';
const BORDER   = 'rgba(255,255,255,0.10)';
const YELLOW   = '#FEDB00';
const WHITE    = '#FFFFFF';
const MUTED    = 'rgba(255,255,255,0.55)';
const INPUT_BG = 'rgba(0,0,0,0.25)';

/* ── Legacy shims ───────────────────────────────────────────────── */
export const darkInputClass = '';
export const darkTextareaClass = '';

/* ── Inputs — default dark style is UNCHANGED ───────────────────── */
const defaultInputStyle: React.CSSProperties = {
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  color: WHITE,
  borderRadius: '0.75rem',
  height: '3.5rem',
  width: '100%',
  padding: '0 1rem',
  fontSize: '1rem',
  outline: 'none',
};

const bInputStyle: React.CSSProperties = {
  background: '#F0F0F0',
  border: '1px solid #D1D5DB',
  color: '#111111',
  borderRadius: '0.75rem',
  height: '3.5rem',
  width: '100%',
  padding: '0 1rem',
  fontSize: '1rem',
  outline: 'none',
};

export function GreenInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const isB = useV() === 'b';
  const base = isB ? bInputStyle : defaultInputStyle;
  const blurBorder = isB ? '#D1D5DB' : BORDER;
  return (
    <input
      {...props}
      style={{ ...base, ...props.style }}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = blurBorder; }}
    />
  );
}

export function GreenTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const isB = useV() === 'b';
  const base = isB ? bInputStyle : defaultInputStyle;
  const blurBorder = isB ? '#D1D5DB' : BORDER;
  return (
    <textarea
      {...props}
      style={{ ...base, height: 'auto', minHeight: '7rem', padding: '0.75rem 1rem', resize: 'none', ...props.style }}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = blurBorder; }}
    />
  );
}

/* ── Card wrapper — p-5 padding always preserved ────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const isB = useV() === 'b';
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={
        isB
          ? { background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }
          : { background: CARD, border: `1px solid ${BORDER}` }
      }
    >
      {children}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  const isB = useV() === 'b';

  if (isB) {
    // Marketing-site style: dark green text, heavier weight, bottom divider
    return (
      <div className="flex items-center gap-2.5 pb-3 mb-1" style={{ borderBottom: '2px solid #E5E7EB' }}>
        <span className="text-base leading-none">{icon}</span>
        <span className="text-sm font-extrabold tracking-widest uppercase" style={{ color: BG }}>{label}</span>
      </div>
    );
  }

  // Original style — UNCHANGED
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: BORDER }} />
    </div>
  );
}

/* ── Question label ─────────────────────────────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  const isB = useV() === 'b';
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold" style={{ color: isB ? '#111111' : WHITE }}>{children}</p>
      {sub && <p className="text-xs" style={{ color: isB ? '#6B7280' : MUTED }}>{sub}</p>}
    </div>
  );
}

/* ── Option grid ─────────────────────────────────────────────────── */
export function OptionGrid({
  options, value, onChange, cols = 3,
}: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  const v = useV();
  const isA = v === 'a';
  const isB = v === 'b';
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';

  const unselBg     = isB ? '#EEEEEE'             : isA ? WHITE              : INPUT_BG;
  const unselText   = isB ? '#111111'             : isA ? '#111111'          : WHITE;
  const unselBorder = isB ? '#D1D5DB'             : isA ? 'rgba(0,0,0,0.15)': BORDER;

  return (
    <div className={`grid gap-3 ${colClass}`}>
      {options.map(opt => {
        const selected = value === opt;
        return (
          <button
            key={opt} type="button" onClick={() => onChange(opt)}
            className="h-12 px-3 rounded-xl text-sm font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center"
            style={{
              background: selected ? YELLOW : unselBg,
              border: `1px solid ${selected ? YELLOW : unselBorder}`,
              color: selected ? '#111' : unselText,
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
  const v = useV();
  const isA = v === 'a';
  const isB = v === 'b';
  const unselBg     = isB ? '#EEEEEE'  : isA ? WHITE     : INPUT_BG;
  const unselText   = isB ? '#111111'  : isA ? '#111111' : WHITE;
  const unselBorder = isB ? '#D1D5DB'  : isA ? 'rgba(0,0,0,0.15)' : BORDER;

  return (
    <div className="grid grid-cols-2 gap-4">
      {([true, false] as const).map(bv => {
        const selected = value === bv;
        return (
          <button
            key={String(bv)} type="button" onClick={() => onChange(bv)}
            className="h-14 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200"
            style={{
              background: selected ? YELLOW : unselBg,
              border: `1.5px solid ${selected ? YELLOW : unselBorder}`,
              color: selected ? '#111' : unselText,
              boxShadow: selected ? `0 0 20px rgba(254,219,0,0.2)` : 'none',
            }}
          >
            {bv ? '✓ Yes' : '✗ No'}
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
  const v = useV();
  const isA = v === 'a';
  const isB = v === 'b';
  const unselBg     = isB ? '#EEEEEE'  : isA ? WHITE     : INPUT_BG;
  const unselText   = isB ? '#111111'  : isA ? '#111111' : WHITE;
  const unselBorder = isB ? '#D1D5DB'  : isA ? 'rgba(0,0,0,0.15)' : BORDER;

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
              background: isSelected ? YELLOW : unselBg,
              border: `1px solid ${isSelected ? YELLOW : unselBorder}`,
              color: isSelected ? '#111' : unselText,
            }}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/* ── Progress header — UNCHANGED ────────────────────────────────── */
export function FormProgressHeader({
  step, totalSteps, stepLabel,
}: { step: number; totalSteps: number; stepLabel: string }) {
  const pct = ((step + 1) / totalSteps) * 100;
  return (
    <div className="sticky top-0 z-10 px-6 py-4" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-extrabold" style={{ color: WHITE }}>
            Brightly<span style={{ color: YELLOW }}>.</span>
          </span>
          <span className="text-xs font-semibold" style={{ color: MUTED }}>
            Step {step + 1} of {totalSteps} — {stepLabel}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: YELLOW }} />
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
  const v = useV();
  const isA = v === 'a';
  const isB = v === 'b';
  const backBg     = isB ? '#EEEEEE'  : isA ? WHITE     : INPUT_BG;
  const backText   = isB ? '#111111'  : isA ? '#111111' : WHITE;
  const backBorder = isB ? '#D1D5DB'  : isA ? 'rgba(0,0,0,0.15)' : BORDER;

  return (
    <div className="flex gap-3 mt-8 pb-8">
      <button
        onClick={onBack}
        className="h-14 px-6 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2"
        style={{ background: backBg, border: `1px solid ${backBorder}`, color: backText }}
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
