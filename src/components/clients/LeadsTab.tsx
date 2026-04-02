import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_form: { label: '🟡 New Enquiry', className: 'bg-amber-100 text-amber-800' },
  form_submitted: { label: '🟡 New Enquiry', className: 'bg-amber-100 text-amber-800' },
  awaiting_quote: { label: '🟡 New Enquiry', className: 'bg-amber-100 text-amber-800' },
  quote_sent: { label: '📤 Quote Sent', className: 'bg-blue-100 text-blue-800' },
  awaiting_client_response: { label: '📤 Quote Sent', className: 'bg-blue-100 text-blue-800' },
  client_accepted: { label: '✅ Accepted', className: 'bg-emerald-100 text-emerald-800' },
  awaiting_schedule_approval: { label: '✅ Accepted', className: 'bg-emerald-100 text-emerald-800' },
  scheduled: { label: '📅 Scheduled', className: 'bg-primary/10 text-primary' },
  in_progress: { label: '🔄 In Progress', className: 'bg-sky-100 text-sky-800' },
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
  client_accepted: ['client_accepted', 'awaiting_schedule_approval'],
  quote_declined: ['quote_declined', 'declined'],
};

export default function LeadsTab() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');

  const LEAD_STATUSES = ['pending_form', 'form_submitted', 'awaiting_quote', 'quote_sent', 'awaiting_client_response', 'client_accepted', 'awaiting_schedule_approval', 'quote_declined', 'declined'];

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

  const getNavTarget = (lead: any) => {
    const s = lead.status;
    if (['pending_form', 'form_submitted', 'awaiting_quote', 'quote_sent', 'awaiting_client_response'].includes(s)) {
      return { pathname: '/quoting', state: { quoteRequestId: lead.id } };
    }
    if (['client_accepted', 'awaiting_schedule_approval'].includes(s)) {
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
                  onClick={() => navigate(nav.pathname, nav.state ? { state: nav.state } : undefined)}>
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
                          const url = `${window.location.origin}/quote/${lead.token}`;
                          navigator.clipboard.writeText(url);
                          toast.success('Quote form link copied');
                        }}>
                        <Eye className="w-4 h-4" />
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
  );
}
