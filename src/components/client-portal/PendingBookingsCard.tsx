import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  propertyId: string;
  // Magic-link callers pass `token`; in-app authed portal callers omit
  // it (the edge function falls back to the user's auth header).
  token?: string;
}

/**
 * Surfaces booking_suggestions (status='pending') awaiting client
 * decision. Lives at the top of the property portal page so the
 * client doesn't have to drill into the calendar to spot a pending
 * approval. Approve creates a real job; Reject closes the suggestion.
 *
 * Only renders when there's at least one pending suggestion, so the
 * section auto-hides on quiet weeks.
 */
export default function PendingBookingsCard({ propertyId, token }: Props) {
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['portal-pending-suggestions', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('portal-booking-suggestions', {
        body: { token: token || undefined, property_id: propertyId, action: 'list' },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'failed to load');
      }
      return (data as any)?.suggestions || [];
    },
    enabled: !!propertyId,
  });

  const decide = async (suggestion: any, action: 'approve' | 'reject') => {
    setDecidingId(suggestion.id);
    try {
      const { data, error } = await supabase.functions.invoke('portal-booking-suggestions', {
        body: {
          token: token || undefined,
          property_id: propertyId,
          action,
          suggestion_id: suggestion.id,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'unknown error');
      }
      toast.success(
        action === 'approve'
          ? 'Booking approved — clean is on the schedule.'
          : 'Booking rejected.',
      );
      queryClient.invalidateQueries({ queryKey: ['portal-pending-suggestions', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['magic-prop-jobs', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['cp-property-jobs', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not update — try again.');
    } finally {
      setDecidingId(null);
    }
  };

  if (isLoading || suggestions.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 dark:bg-orange-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
        <div>
          <p className="text-sm font-extrabold text-orange-800 dark:text-orange-200">
            {suggestions.length} booking{suggestions.length === 1 ? '' : 's'} awaiting your approval
          </p>
          <p className="text-xs text-orange-700/80 dark:text-orange-300/80">
            Pulled from your Airbnb iCal. Approve to confirm the clean, reject to skip it.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {suggestions.map((s: any) => {
          const cleanDate = s.suggested_clean_date || s.checkout_date;
          return (
            <div key={s.id} className="rounded-xl border border-orange-300/60 bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {cleanDate ? format(new Date(cleanDate + 'T00:00:00'), 'EEE, dd MMM yyyy') : '—'}
                  </p>
                  {s.guest_name && (
                    <p className="text-xs text-muted-foreground">Guest: {s.guest_name}</p>
                  )}
                </div>
                {s.suggested_clean_time && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {s.suggested_clean_time.slice(0, 5)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  disabled={decidingId === s.id}
                  onClick={() => decide(s, 'approve')}
                >
                  {decidingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Approve clean
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decidingId === s.id}
                  onClick={() => decide(s, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
