import { Star } from 'lucide-react';
import { format } from 'date-fns';

interface FeedbackEntry {
  id: string;
  score: number;
  createdAt: string;
  clientName: string;
  address: string;
}

interface RecentFeedbackProps {
  data: FeedbackEntry[];
}

export function RecentFeedback({ data }: RecentFeedbackProps) {
  if (!data.length) return null;

  return (
    <div>
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent Feedback</h2>
      <div className="bg-card rounded-2xl shadow-sm border border-border divide-y divide-border">
        {data.map((entry) => (
          <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground truncate">{entry.clientName}</p>
              <p className="text-xs text-muted-foreground truncate">{entry.address}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-3.5 w-3.5 ${s <= entry.score ? 'fill-[hsl(45,100%,51%)] text-[hsl(45,100%,51%)]' : 'text-muted'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(entry.createdAt), 'MMM d')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
