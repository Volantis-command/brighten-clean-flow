import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Drop-in replacement for `<Input type="time">` everywhere in the app.
//
// Why: the native browser time picker on macOS Chrome renders as an
// awkward 3-column dropdown (hours / mins / AM-PM) that looks
// unprofessional. Brendan flagged 2026-04-26 — "anywhere this time
// thing is, needs to change."
//
// This component renders a shadcn Select with 30-minute slots in
// 24-hour value (HH:MM, same shape as <input type="time"> emits) but
// 12-hour display labels (e.g. 1:30 PM). Same value contract — drop-in.

const DEFAULT_START = 6;  // 6 AM
const DEFAULT_END = 22;   // 10 PM

interface TimeSlot { value: string; label: string; }

function buildSlots(startHour = DEFAULT_START, endHour = DEFAULT_END, stepMinutes = 30): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
      slots.push({ value, label });
    }
  }
  return slots;
}

interface TimeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  /** Minimum hour to include (24h, default 6 = 6 AM). */
  startHour?: number;
  /** Maximum hour to include (24h, default 22 = 10 PM). */
  endHour?: number;
  /** Step in minutes — 30 (default), 15, or 60. */
  stepMinutes?: 15 | 30 | 60;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Some legacy code passes value as 'HH:MM:SS' from the DB; accept and trim. */
  id?: string;
}

export function TimeSelect({
  value,
  onChange,
  startHour = DEFAULT_START,
  endHour = DEFAULT_END,
  stepMinutes = 30,
  className,
  placeholder = 'Select time',
  disabled,
  id,
}: TimeSelectProps) {
  // Normalize incoming value — accept 'HH:MM' or 'HH:MM:SS'
  const normalized = (value || '').slice(0, 5);

  // If the value isn't on the slot grid (e.g. 09:15 when stepMinutes=30),
  // include it as a one-off option so we don't lose the user's saved time.
  const slots = React.useMemo(() => {
    const base = buildSlots(startHour, endHour, stepMinutes);
    if (normalized && !base.find(s => s.value === normalized)) {
      const [h, m] = normalized.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        base.push({ value: normalized, label: `${h12}:${String(m).padStart(2, '0')} ${ampm}` });
        base.sort((a, b) => a.value.localeCompare(b.value));
      }
    }
    return base;
  }, [normalized, startHour, endHour, stepMinutes]);

  return (
    <Select value={normalized} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {slots.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
