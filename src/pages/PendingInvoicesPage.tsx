import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Send, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useState } from 'react';

export default function PendingInvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['pending-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_ex_gst, xero_invoice_id, xero_invoice_number, invoice_status, properties(property_name, client_name, suburb)')
        .eq('invoice_status', 'draft')
        .not('xero_invoice_id', 'is', null)
        .order('scheduled_date', { ascending: false });
      return data || [];
    },
  });

  const handleApproveAndSend = async (jobId: string) => {
    setSendingId(jobId);
    try {
      const { error } = await supabase.functions.invoke('xero-send-invoice', {
        body: { job_id: jobId },
      });
      if (error) throw error;
      toast.success('Invoice approved & sent!');
      queryClient.invalidateQueries({ queryKey: ['pending-invoices'] });
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
    setSendingId(null);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Invoices to Approve</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
          No pending draft invoices. All caught up! ✓
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const property = job.properties as any;
            return (
              <div key={job.id} className="bg-card rounded-2xl shadow-md border border-border p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground truncate">{property?.property_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{property?.client_name} · {job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : ''}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-bold text-primary">${Number(job.price_ex_gst || 0).toFixed(2)} ex GST</span>
                    {job.xero_invoice_number && <span className="text-xs text-muted-foreground">#{job.xero_invoice_number}</span>}
                  </div>
                </div>
                <Button
                  onClick={() => handleApproveAndSend(job.id)}
                  disabled={sendingId === job.id}
                  className="shrink-0 gap-2 bg-green-600 hover:bg-green-700 text-white font-bold"
                >
                  {sendingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Approve & Send
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
