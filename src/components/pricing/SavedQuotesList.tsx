import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-[#FEDB00]/20 text-[#FEDB00] border border-[#FEDB00]',
  accepted: 'bg-primary/10 text-primary',
  declined: 'bg-destructive/10 text-destructive',
};

const FILTERS = ['All', 'Draft', 'Sent', 'Accepted', 'Declined'];

export default function SavedQuotesList({ onEdit }: { onEdit?: (q: any) => void }) {
  const [filter, setFilter] = useState('All');

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = filter === 'All'
    ? quotes
    : quotes.filter((q: any) => (q.status || 'draft').toLowerCase() === filter.toLowerCase());

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all',
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center space-y-3">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground font-semibold">No quotes found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q: any) => (
            <button
              key={q.id}
              onClick={() => onEdit?.(q)}
              className="w-full text-left bg-card rounded-2xl shadow-md p-4 flex items-center justify-between hover:shadow-lg transition-shadow"
            >
              <div className="space-y-1 min-w-0">
                <p className="font-bold text-foreground truncate">{q.client_name || 'No client'}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {q.property_name || '—'} · {q.clean_type || q.service_type || '—'}
                </p>
                {q.reference && <p className="text-xs font-mono text-muted-foreground">{q.reference}</p>}
                <p className="text-xs text-muted-foreground">{format(new Date(q.created_at), 'dd MMM yyyy')}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-extrabold text-foreground text-lg">
                  {q.sell_price_inc_gst != null
                    ? `$${Number(q.sell_price_inc_gst).toFixed(0)}`
                    : q.price != null ? `$${Number(q.price).toFixed(0)}` : '—'}
                </span>
                <Badge className={cn('capitalize', STATUS_COLORS[(q.status || 'draft').toLowerCase()])}>
                  {q.status || 'draft'}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
