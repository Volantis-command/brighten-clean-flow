import { AlertTriangle } from 'lucide-react';

interface Alert {
  id: string;
  message: string;
  type: 'flagged' | 'incomplete_form' | 'critical_item';
}

interface AlertsSectionProps {
  alerts: Alert[];
}

export function AlertsSection({ alerts }: AlertsSectionProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="slide-down">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="page-heading">Alerts</h2>
        <span
          className="relative inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-bold tabular-nums"
          style={{ background: 'rgba(239,68,68,0.2)', color: '#FCA5A5' }}
        >
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full pulse-glow-red"
            style={{ background: '#EF4444' }}
          />
          {alerts.length}
        </span>
      </div>
      <div className="space-y-3">
        {alerts.map((alert, idx) => {
          const isCritical = alert.type === 'flagged' || alert.type === 'critical_item';
          const accentColor = isCritical ? '#EF4444' : '#F59E0B';
          const bgColor = isCritical ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
          return (
            <div
              key={alert.id}
              className="glass-card hover-lift p-5 flex items-start gap-3 fade-in"
              style={{
                background: bgColor,
                borderLeft: `4px solid ${accentColor}`,
                animationDelay: `${idx * 60}ms`,
              }}
            >
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: accentColor }} />
              <p className="text-sm font-semibold" style={{ color: '#F0FDF4' }}>{alert.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
