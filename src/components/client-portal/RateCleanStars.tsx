import { useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RateCleanStarsProps {
  token: string;
  jobId: string;
  // Existing 1-10 score from job_feedback (null/undefined if not yet rated).
  existingScore?: number | null;
  onRated?: (stars: number) => void;
  size?: 'sm' | 'md';
  className?: string;
}

// Stored score is 1-10 (matches the SMS feedback flow + FeedbackPage wizard).
// The portal collects 1-5 stars; the edge function multiplies by 2.
function scoreToStars(score: number | null | undefined): number {
  if (!score) return 0;
  return Math.max(1, Math.min(5, Math.round(score / 2)));
}

export default function RateCleanStars({
  token,
  jobId,
  existingScore,
  onRated,
  size = 'sm',
  className,
}: RateCleanStarsProps) {
  const initialStars = scoreToStars(existingScore);
  const [submittedStars, setSubmittedStars] = useState<number>(initialStars);
  const [hoverStars, setHoverStars] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const isRated = submittedStars > 0;
  const displayStars = hoverStars || submittedStars;
  const starSize = size === 'md' ? 'w-6 h-6' : 'w-5 h-5';

  const handleRate = async (stars: number) => {
    if (isRated || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-portal-rating', {
        body: { token, job_id: jobId, stars },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSubmittedStars(stars);
      onRated?.(stars);
      toast.success(stars >= 4 ? 'Thanks for the rating! ⭐' : 'Thanks — we’ll review this clean.');
    } catch (e: any) {
      toast.error(e.message || 'Could not save rating. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHoverStars(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={isRated || submitting}
            onMouseEnter={() => !isRated && setHoverStars(n)}
            onClick={() => handleRate(n)}
            className={cn(
              'p-0.5 transition-transform',
              !isRated && !submitting && 'hover:scale-110 cursor-pointer',
              isRated && 'cursor-default',
            )}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star
              className={cn(
                starSize,
                n <= displayStars
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'fill-none text-muted-foreground/40',
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {isRated ? 'You rated this' : submitting ? 'Saving…' : 'Rate this clean'}
      </span>
    </div>
  );
}
