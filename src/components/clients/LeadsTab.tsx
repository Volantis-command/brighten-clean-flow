import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Trash2, Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LeadDetailSlideOver from './LeadDetailSlideOver';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useNavigate } from 'react-router-dom';
import { getAppBaseUrl } from '@/lib/appUrl';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_form: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D]' },
  form_submitted: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D]' },
  awaiting_quote: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D]' },
  quote_sent: { label: '📤 Quote Sent', className: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA]' },
  awaiting_client_response: { label: '📤 Quote Sent', className: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA]' },
  accepted: { label: '✅ Accepted', className: 'bg-emerald-100 text-[#4ADE80]' },
  client_accepted: { label: '✅ Accepted', className: 'bg-emerald-100 text-[#4ADE80]' },
  awaiting_schedule_approval: { label: '✅ Accepted', className: 'bg-emerald-100 text-[#4ADE80]' },
  scheduled: { label: '📅 Scheduled', className: 'bg-primary/10 text-primary' },
  in_progress: { label: '🔄 In Progress', className: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA]' },
  completed: { label: '✅ Completed', className: 'bg-primary/20 text-primary' },
  quote_declined: { label: '❌ Declined', className: 'bg-destructive/10 text-destructive' },
  declined: { label: '❌ Declined', className: 'bg-destructive/10 text-destructive' },
  expired: { label: '⏳ Expired', className: 'bg-muted text-muted-foreground' },
};

const FILTER_OPTIONS = [
  { value: 'pending_form', label: '🟡 New Enquiry' },
  { value: 'quote_sent', label: '📤 Quote Sent' },
  { value: 'client_accepted', label: '✅ Accepted' },
  { value: 'scheduled', label: '📅 Scheduled' },
  { value: 'in_progress', label: '🔄 In Progress' },
  { value: 'completed', label: '✅ Completed' },
  { value: 'quote_declined', label: '❌ Declined' },
  { value: 'expired', label: '⏳ Expired' },
];

const FILTER_GROUP: Record<string, string[]> = {
  pending_form: ['pending_form', 'form_submitted', 'awaiting_quote'],
  quote_sent: ['quote_sent', 'awaiting_client_response'],
  client_accepted: ['accepted', 'client_accepted', 'awaiting_schedule_approval'],
  quote_declined: ['quote_declined', 'declined'],
};

export default function LeadsTab() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [deleteLead, setDeleteLead] = useState<any>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (lead: any) => {
      // Delete any quotes linked to this request
      await (supabase.from('quotes').delete() as any).eq('quote_request_id', lead.id);
      // Delete the lead/quote_request
      const { error } = await supabase.from('quote_requests').delete().eq('id', lead.id);
      if (error) throw new Error(`Failed to delete lead: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Lead deleted');
      setDeleteLead(null);
      queryClient.invalidateQueries({ queryKey: ['quote-requests-leads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const LEAD_STATUSES = ['pending_form', 'form_submitted', 'awaiting_quote', 'quote_sent', 'awaiting_client_response', 'quote_declined', 'declined'];

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['quote-requests-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .in('status', LEAD_STATUSES)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = statusFilter === 'all'
    ? leads
    : leads.filter(l => {
        const group = FILTER_GROUP[statusFilter];
        return group ? group.includes(l.status) : l.status === statusFilter;
      });

  // Download the current lead list (name, phone, email + quote details) as CSV
  // for bulk email / marketing.
  const exportCsv = () => {
    const rows = filtered.length ? filtered : leads;
    if (!rows.length) { toast.error('No leads to export'); return; }
    const cols = ['first_name', 'last_name', 'phone', 'email', 'address', 'clean_type', 'status', 'total_inc_gst', 'created_at'];
    const header = ['First name', 'Last name', 'Phone', 'Email', 'Address', 'Clean type', 'Status', 'Quoted (inc GST)', 'Created'];
    const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [header.join(','), ...rows.map((r: any) => cols.map(c => esc(r[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brightly-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} lead${rows.length === 1 ? '' : 's'}`);
  };

  const getNavTarget = (lead: any) => {
    const s = lead.status;
    if (['pending_form', 'form_submitted', 'awaiting_quote', 'quote_sent', 'awaiting_client_response'].includes(s)) {
      return { pathname: '/quoting', state: { quoteRequestId: lead.id } };
    }
    if (['accepted', 'client_accepted', 'awaiting_schedule_approval'].includes(s)) {
      return { pathname: '/actions' };
    }
    if (['scheduled', 'in_progress', 'completed'].includes(s)) {
      return { pathname: '/schedule' };
    }
    return { pathname: '/quoting', state: { quoteRequestId: lead.id } };
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (leads.length === 0) return (
    <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
      No leads yet. Send a quote request to get started.
    </div>
  );

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 rounded-xl h-10">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {FILTER_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCsv} className="ml-auto h-10 rounded-xl gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
        <span className="text-sm text-muted-foreground">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Clean Type</TableHead>
              <TableHead>Requested Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(lead => {
              const cfg = STATUS_CONFIG[lead.status] || { label: lead.status, className: 'bg-muted text-muted-foreground' };
              const nav = getNavTarget(lead);
              return (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/60"
                  onClick={() => setSelectedLead(lead)}>
                  <TableCell className="font-semibold text-primary">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.phone || '—'}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{lead.address || '—'}</TableCell>
                  <TableCell>{lead.clean_type || '—'}</TableCell>
                  <TableCell>{lead.preferred_date ? new Date(lead.preferred_date + 'T00:00:00').toLocaleDateString('en-AU') : '—'}</TableCell>
                  <TableCell>
                    <Badge className={`${cfg.className} text-xs font-semibold`}>
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Copy form link"
                        onClick={(e) => {
                          e.stopPropagation();
                          // /quote/<token> is the intake form — correct for a "form link"
                          // (the lead hasn't filled it in yet). Use getAppBaseUrl so the
                          // copied URL points at app.brightly.cleaning, never a preview.
                          const url = `${getAppBaseUrl()}/quote/${lead.token}`;
                          navigator.clipboard.writeText(url);
                          toast.success('Quote form link copied');
                        }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                        title="Delete Lead"
                        onClick={(e) => { e.stopPropagation(); setDeleteLead(lead); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
      <AlertDialog open={!!deleteLead} onOpenChange={(o) => { if (!o) setDeleteLead(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteLead && ([deleteLead.first_name, deleteLead.last_name].filter(Boolean).join(' ') || deleteLead.phone || 'this lead')}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteLead && deleteMutation.mutate(deleteLead)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LeadDetailSlideOver lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}