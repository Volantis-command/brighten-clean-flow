import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface QuoteHistoryListProps {
  quotes: any[];
}

function quoteStatusBadge(status: string) {
  if (status === 'draft') return { label: 'Draft', cls: 'bg-muted text-muted-foreground' };
  if (status === 'quote_sent') return { label: 'Pending', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'client_accepted') return { label: 'Accepted', cls: 'bg-brightly/10 text-brightly' };
  if (['quote_declined', 'declined'].includes(status)) return { label: 'Declined', cls: 'bg-red-100 text-red-800' };
  if (status === 'expired') return { label: 'Expired', cls: 'bg-muted text-muted-foreground' };
  return { label: status, cls: 'bg-muted text-muted-foreground' };
}

export default function QuoteHistoryList({ quotes }: QuoteHistoryListProps) {
  if (!quotes.length) {
    return (
      <div className="text-center py-8">
        <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No quotes yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {quotes.map((quote: any) => {
        const st = quoteStatusBadge(quote.status);
        return (
          <div key={quote.id} className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">
                  {quote.clean_type || 'Clean'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {quote.created_at ? format(new Date(quote.created_at), 'dd MMM yyyy') : '—'}
                  {quote.property_address ? ` — ${quote.property_address}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {quote.price_inc_gst && (
                  <span className="font-bold text-primary text-sm">${quote.price_inc_gst}</span>
                )}
                <Badge className={`${st.cls} text-[10px]`}>{st.label}</Badge>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
