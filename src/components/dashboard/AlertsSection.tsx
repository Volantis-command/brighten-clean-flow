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
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">⚠️ Alerts</h2>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-foreground">{alert.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
