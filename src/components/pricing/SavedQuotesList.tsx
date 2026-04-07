import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { FileText, Send, Copy, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAppBaseUrl } from '@/lib/appUrl';
import SendQuoteModal from './SendQuoteModal';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  quote_sent: 'bg-[hsl(200,80%,50%)]/20 text-[hsl(200,80%,50%)] border border-[hsl(200,80%,50%)]',
  quote_viewed: 'bg-[hsl(270,70%,60%)]/20 text-[hsl(270,70%,60%)] border border-[hsl(270,70%,60%)]',
  question_received: 'bg-[hsl(45,100%,50%)]/20 text-[hsl(45,100%,50%)] border border-[hsl(45,100%,50%)]',
  accepted: 'bg-primary/10 text-primary',
  client_accepted: 'bg-primary/10 text-primary',
  declined: 'bg-destructive/10 text-destructive',
  quote_declined: 'bg-destructive/10 text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  quote_sent: '📤 Sent',
  quote_viewed: '👁 Viewed',
  question_received: '💬 Question',
  accepted: '✅ Accepted',
  client_accepted: '✅ Accepted',
  declined: '❌ Declined',
  quote_declined: '❌ Declined',
};

const FILTERS = ['All', 'Draft', 'Sent', 'Accepted', 'Declined'];

export default function SavedQuotesList({ onEdit }: { onEdit?: (q: any) => void }) {
  const [filter, setFilter] = useState('All');
  const [sendQuote, setSendQuote] = useState<any>(null);
  const [deleteQuote, setDeleteQuote] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (q: any) => {
      const { error } = await supabase.from('quotes').delete().eq('id', q.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Quote deleted');
      setDeleteQuote(null);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const queryClient = useQueryClient();

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

  const filterMap: Record<string, string[]> = {
    Draft: ['draft'],
    Sent: ['sent', 'quote_sent', 'quote_viewed', 'question_received'],
    Accepted: ['accepted', 'client_accepted'],
    Declined: ['declined', 'quote_declined'],
  };

  // Derive display status: if quote_sent but has quote_viewed_at, show as viewed
  function getDisplayStatus(q: any): string {
    const base = (q.status || 'draft').toLowerCase();
    if (base === 'quote_sent' && q.quote_viewed_at) return 'quote_viewed';
    return base;
  }

  const filtered = filter === 'All'
    ? quotes
    : quotes.filter((q: any) => filterMap[filter]?.includes((q.status || 'draft').toLowerCase()));

  const handleCopyLink = (e: React.MouseEvent, q: any) => {
    e.stopPropagation();
    const token = (q as any).quote_token;
    if (!token) { toast.error('No quote token available'); return; }
    const url = `${getAppBaseUrl()}/quote-view/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Quote link copied!');
  };

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
            <div
              key={q.id}
              className="bg-card rounded-2xl shadow-md p-4 hover:shadow-lg transition-shadow"
            >
              <button
                onClick={() => onEdit?.(q)}
                className="w-full text-left flex items-center justify-between"
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
                  <Badge className={cn('capitalize', STATUS_COLORS[getDisplayStatus(q)])}>
                    {STATUS_LABELS[getDisplayStatus(q)] || q.status || 'draft'}
                  </Badge>
                </div>
              </button>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSendQuote(q);
                  }}
                >
                  <Send className="w-3 h-3" /> Send Quote
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={(e) => handleCopyLink(e, q)}
                >
                  <Link2 className="w-3 h-3" /> Copy Link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive hover:text-destructive px-2"
                  onClick={(e) => { e.stopPropagation(); setDeleteQuote(q); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {sendQuote && (
        <SendQuoteModal
          open={!!sendQuote}
          onClose={() => setSendQuote(null)}
          quote={sendQuote}
          onSent={() => queryClient.invalidateQueries({ queryKey: ['quotes'] })}
        />
      )}

      <AlertDialog open={!!deleteQuote} onOpenChange={(o) => { if (!o) setDeleteQuote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete quote for <strong>{deleteQuote?.client_name || 'this client'}</strong> ({deleteQuote?.reference})? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteQuote && deleteMutation.mutate(deleteQuote)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}