import { AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UnavailableReason } from '@/hooks/useCleanerConflicts';

interface ConflictWarningProps {
  cleanerName: string;
  conflicts: { property_name: string; time: string | null }[];
  isOnLeave: boolean;
  isUnavailable?: boolean;
  /** Why they are blocked, so the panel does not say "not on Mondays" about a holiday. */
  unavailableReason?: UnavailableReason;
  dayName?: string;
  leaveReason?: string;
  canOverrideAvailability?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CleanerConflictWarning({ cleanerName, conflicts, isOnLeave, isUnavailable, unavailableReason, dayName, leaveReason, canOverrideAvailability = false, onConfirm, onCancel }: ConflictWarningProps) {
  if (isUnavailable) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-destructive">
              {unavailableReason?.kind === 'leave'
                ? <>❌ {cleanerName} is on approved leave on this date{unavailableReason.detail ? ` (${unavailableReason.detail})` : ''}.</>
                : unavailableReason?.kind === 'day_off'
                ? <>❌ {cleanerName} has marked this date as a day off.</>
                : <>❌ {cleanerName} is not available on {dayName ? dayName.charAt(0).toUpperCase() + dayName.slice(1) + 's' : 'this day'}.</>}
            </p>
            <p className="text-xs text-muted-foreground">
              {canOverrideAvailability
                ? 'Choose another cleaner, change the date, or record an admin override.'
                : 'Change the day or assign a different cleaner. Only an admin can override this.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} className="rounded-xl">Choose Different Cleaner</Button>
          {canOverrideAvailability && (
            <Button size="sm" onClick={onConfirm} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Override & Assign
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          {isOnLeave && (
            <p className="text-sm font-bold text-destructive">
              ⚠️ {cleanerName} is on approved leave on this date{leaveReason ? ` (${leaveReason})` : ''}. Assign anyway?
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
