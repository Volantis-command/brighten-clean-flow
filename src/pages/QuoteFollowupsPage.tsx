import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Send, SkipForward } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useState } from 'react';

export default function QuoteFollowupsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quote-followups-pending'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, address, total_inc_gst, created_at, token, phone, email')
        .eq('status', 'followup_pending')
        .order('created_at', { ascending: true });
      return (data || []) as any[];
    },
  });

  const handleSendFollowup = async (quote: any) => {
    if (!user) return;
    setLoadingId(quote.id);
    try {
      await supabase.functions.invoke('send-quote-link-sms', {
        body: { quote_request_id: quote.id, followup: true },
      });
      await supabase.from('quote_requests').update({
        status: 'followup_sent',
        followup_sent_at: new Date().toISOString(),
        followup_approved_by: user.id,
        followup_approved_at: new Date().toISOString(),
        last_status_change: new Date().toISOString(),
      } as any).eq('id', quote.id);
      toast.success('Followup sent!');
      queryClient.invalidateQueries({ queryKey: ['quote-followups-pending'] });
    } catch (err: any) {
      toast.error(err.message);
    }
    setLoadingId(null);
  };

  const handleSkip = async (id: string) => {
    await supabase.from('quote_requests').update({
      status: 'expired',
      last_status_change: new Date().toISOString(),
    } as any).eq('id', id);
    toast.success('Quote marked expired');
    queryClient.invalidateQueries({ queryKey: ['quote-followups-pending'] });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Quote Followups</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : quotes.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
          No pending followups. All caught up! ✓
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((q: any) => {
            const daysSilent = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86400000);
            return (
              <div key={q.id} className="bg-card rounded-2xl shadow-md border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground truncate">{q.first_name} {q.last_name || ''}</p>
                  <p className="text-xs text-muted-foreground">{q.address}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {q.total_inc_gst && <span className="text-sm font-bold text-primary">${Number(q.total_inc_gst).toFixed(2)}</span>}
                    <span className="text-xs text-muted-foreground">{daysSilent} days silent</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" className="gap-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                    disabled={loadingId === q.id}
                    onClick={() => handleSendFollowup(q)}>
                    {loadingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Followup
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 font-bold"
                    onClick={() => handleSkip(q.id)}>
                    <SkipForward className="h-4 w-4" /> Skip
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
