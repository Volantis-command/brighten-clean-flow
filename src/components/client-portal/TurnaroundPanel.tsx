import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface TurnaroundPanelProps {
  property: any;
}

function formatTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = String(raw).split(':');
  if (parts.length < 2) return raw;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  if (isNaN(h)) return raw;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

export default function TurnaroundPanel({ property }: TurnaroundPanelProps) {
  // Only renders for Airbnb properties with timing configured. Mirrors
  // the cleaner-side panel in PreClockOnView so the host sees the
  // same picture their cleaner does.
  if (property?.client_type !== 'airbnb') return null;
  const checkout = formatTime(property.checkout_time);
  const checkin = formatTime(property.checkin_time);
  if (!checkout && !checkin) return null;

  let windowMin: number | null = null;
  if (property.checkout_time && property.checkin_time) {
    const [coH, coM] = property.checkout_time.split(':').map(Number);
    const [ciH, ciM] = property.checkin_time.split(':').map(Number);
    const diff = (ciH * 60 + (ciM || 0)) - (coH * 60 + (coM || 0));
    windowMin = diff > 0 ? diff : null;
  }
  // Heuristic — under 4 hrs is "tight", under 2 is "very tight".
  // Keeps the host informed about pressure on the cleaner.
  const tone =
    windowMin == null ? 'neutral' :
    windowMin < 120 ? 'tight' :
    windowMin < 240 ? 'snug' : 'comfortable';

  const toneStyles: Record<string, string> = {
    comfortable: 'border-primary/30 bg-primary/5',
    snug: 'border-amber-300 bg-amber-50 dark:bg-amber-500/10',
    tight: 'border-destructive/40 bg-destructive/5',
    neutral: 'border-border bg-muted/30',
  };
  const Icon =
    tone === 'comfortable' ? CheckCircle2 :
    tone === 'tight' ? AlertTriangle : Clock;
  const iconColor =
    tone === 'comfortable' ? 'text-primary' :
    tone === 'tight' ? 'text-destructive' :
    tone === 'snug' ? 'text-amber-600' : 'text-muted-foreground';

  const windowLabel = windowMin != null
    ? (windowMin % 60 === 0 ? `${Math.floor(windowMin / 60)} hr${windowMin / 60 === 1 ? '' : 's'}` : `${Math.floor(windowMin / 60)} hr ${windowMin % 60} min`)
    : null;

  return (
    <div className={`rounded-2xl border p-4 ${toneStyles[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <p className="text-xs font-bold uppercase tracking-wider text-foreground">Turnaround Window</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {checkout && (
          <div>
            <p className="text-xs text-muted-foreground">Guest checkout</p>
            <p className="text-base font-extrabold font-mono text-foreground">{checkout}</p>
          </div>
        )}
        {checkin && (
          <div>
            <p className="text-xs text-muted-foreground">Next check-in</p>
            <p className="text-base font-extrabold font-mono text-foreground">{checkin}</p>
          </div>
        )}
      </div>
      {windowLabel && (
        <div className="mt-3 pt-3 border-t border-border/40 flex items-baseline justify-between">
          <span className={`text-sm font-bold ${iconColor}`}>
            {tone === 'tight' ? 'Tight window' : tone === 'snug' ? 'Snug window' : 'Window'}
          </span>
          <span className={`text-lg font-extrabold ${iconColor}`}>{windowLabel}</span>
        </div>
      )}
      {tone === 'tight' && (
        <p className="text-xs text-destructive mt-2">
          Less than 2 hours between guests — your cleaner needs to move fast. Let us know if you want to extend the window.
        </p>
      )}
    </div>
  );
}
