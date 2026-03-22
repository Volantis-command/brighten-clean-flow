import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConflictWarningProps {
  cleanerName: string;
  conflicts: { property_name: string; time: string | null }[];
  isOnLeave: boolean;
  leaveReason?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CleanerConflictWarning({ cleanerName, conflicts, isOnLeave, leaveReason, onConfirm, onCancel }: ConflictWarningProps) {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          {isOnLeave && (
            <p className="text-sm font-bold text-destructive">
              ⚠️ {cleanerName} is on leave on this date{leaveReason ? ` (${leaveReason})` : ''}.
            </p>
          )}
          {conflicts.length > 0 && (
            <p className="text-sm font-bold text-destructive">
              ⚠️ {cleanerName} already has {conflicts.length === 1 ? 'a job' : `${conflicts.length} jobs`} on this date:
            </p>
          )}
          {conflicts.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground ml-1">
              • {c.property_name}{c.time ? ` at ${c.time}` : ''}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">Assign anyway?</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="rounded-xl">Cancel</Button>
        <Button size="sm" onClick={onConfirm} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Assign Anyway
        </Button>
      </div>
    </div>
  );
}
