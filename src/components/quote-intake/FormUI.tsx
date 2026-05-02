import React from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Design variant ──────────────────────────────────────────────── */
// no param  → original approved design (dark green cards, dark buttons)
// ?v=a      → Option A: white unselected buttons on dark green cards
// ?v=b      → Option B: white cards, dark text — mirrors brightly.cleaning marketing site
const _vParam = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('v')
  : null;
const IS_A = _vParam === 'a';
const IS_B = _vParam === 'b';

/* ── Brand tokens ────────────────────────────────────────────────── */
const BG     = '#173A27';   // deep forest green — page background (all variants)
const YELLOW = '#FEDB00';
const WHITE  = '#FFFFFF';

// ── Default — original dark green cards, dark buttons ─────────────
// ── ?v=a   — white unselected buttons on dark green cards ─────────
// ── ?v=b   — white cards, dark text (matches marketing site) ──────
const CARD         = IS_B ? '#FFFFFF'                        : '#1F4A32';
const CARD_BORDER  = IS_B ? '#E5E7EB'                        : 'rgba(255,255,255,0.10)';
const CARD_SHADOW  = IS_B ? '0 4px 20px rgba(0,0,0,0.10)'   : 'none';

const LABEL_TEXT   = IS_B ? '#111111'                        : WHITE;
const MUTED        = IS_B ? '#6B7280'                        : 'rgba(255,255,255,0.55)';
const SECTION_LBL  = IS_B ? BG                               : YELLOW;
const DIVIDER      = IS_B ? '#E5E7EB'                        : 'rgba(255,255,255,0.10)';

// Inputs — only B gets light bg; default and A keep the dark input
const INPUT_BG_CSS = IS_B ? '#F5F5F5'                        : 'rgba(0,0,0,0.25)';
const INPUT_TEXT   = IS_B ? '#111111'                        : '#FFFFFF';
const INPUT_BORDER = IS_B ? '#E5E7EB'                        : 'rgba(255,255,255,0.10)';

// Option buttons (unselected state)
// default: dark green bg, white text  |  ?v=a: white bg, dark text  |  ?v=b: light gray bg, dark text
const BTN_BG       = IS_B ? '#F5F5F5'   : IS_A ? '#FFFFFF'           : 'rgba(0,0,0,0.25)';
const BTN_TEXT     = IS_B ? '#111111'   : IS_A ? '#111111'           : WHITE;
const BTN_BORDER   = IS_B ? '#E5E7EB'   : IS_A ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.10)';

/* ── Input style ─────────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  background: INPUT_BG_CSS,
  border: `1px solid ${INPUT_BORDER}`,
  color: INPUT_TEXT,
  borderRadius: '0.75rem',
  height: '3.5rem',
  width: '100%',
  padding: '0 1rem',
  fontSize: '1rem',
  outline: 'none',
};

/* ── Legacy shims ────────────────────────────────────────────────── */
export const darkInputClass = '';
export const darkTextareaClass = '';

export function GreenInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...props.style }}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = INPUT_BORDER; }}
    />
  );
}

export function GreenTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        ...inputStyle,
        height: 'auto',
        minHeight: '7rem',
        padding: '0.75rem 1rem',
        resize: 'none',
        ...props.style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = YELLOW; }}
      onBlur={e => { e.currentTarget.style.borderColor = INPUT_BORDER; }}
    />
  );
}

/* ── Card wrapper ───────────────────────────────────────────────── */
export function FormCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: CARD,
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: CARD_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

/* ── Section header ─────────────────────────────────────────────── */
export function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: SECTION_LBL }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: DIVIDER }} />
    </div>
  );
}

/* ── Question label ─────────────────────────────────────────────── */
export function QuestionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold" style={{ color: LABEL_TEXT }}>{children}</p>
      {sub && <p className="text-xs" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

/* ── Option grid ─────────────────────────────────────────────────── */
export function OptionGrid({
  options, value, onChange, cols = 3,
}: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
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
              background: selected ? YELLOW : BTN_BG,
              border: `1px solid ${selected ? YELLOW : BTN_BORDER}`,
              color: selected ? '#111' : BTN_TEXT,
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
  return (
    <div className="grid grid-cols-2 gap-4">
      {([true, false] as const).map(v => {
        const selected = value === v;
        return (
          <button
            key={String(v)} type="button" onClick={() => onChange(v)}
            className="h-14 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200"
            style={{
              background: selected ? YELLOW : BTN_BG,
              border: `1.5px solid ${selected ? YELLOW : BTN_BORDER}`,
              color: selected ? '#111' : BTN_TEXT,
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
              background: isSelected ? YELLOW : BTN_BG,
              border: `1px solid ${isSelected ? YELLOW : BTN_BORDER}`,
              color: isSelected ? '#111' : BTN_TEXT,
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
    <div
      className="sticky top-0 z-10 px-6 py-4"
      style={{ background: BG, borderBottom: `1px solid rgba(255,255,255,0.10)` }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Logo — always white on dark green header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-extrabold" style={{ color: WHITE }}>
            Brightly<span style={{ color: YELLOW }}>.</span>
          </span>
          <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Step {step + 1} of {totalSteps} — {stepLabel}
          </span>
        </div>
        {/* Progress bar */}
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
  return (
    <div className="flex gap-3 mt-8 pb-8">
      <button
        onClick={onBack}
        className="h-14 px-6 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2"
        style={{
          background: BTN_BG,
          border: `1px solid ${BTN_BORDER}`,
          color: BTN_TEXT,
        }}
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

/* ── Form shell ──────────────────────────────────────────────────── */
export function FormShell({
  children, step, totalSteps, stepLabel, termsOpen, onTermsClose,
}: {
  children: React.ReactNode; step: number; totalSteps: number; stepLabel: string;
  termsOpen: boolean; onTermsClose: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      <FormProgressHeader step={step} totalSteps={totalSteps} stepLabel={stepLabel} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 space-y-4">
        {children}
      </div>
      <TermsModal open={termsOpen} onClose={onTermsClose} />
    </div>
  );
}
