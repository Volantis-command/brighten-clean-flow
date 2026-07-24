import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Eye, Trash2, Download, Search, Phone } from 'lucide-react';
import LeadDetailSlideOver from './LeadDetailSlideOver';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAppBaseUrl } from '@/lib/appUrl';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_form: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#8A6220]' },
  form_submitted: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#8A6220]' },
  awaiting_quote: { label: '🟡 New Enquiry', className: 'bg-[rgba(251,191,36,0.15)] text-[#8A6220]' },
  // Instant-quote lead stages — tell you at a glance how to act.
  price_viewed: { label: '👀 Viewed Price', className: 'bg-[rgba(138,160,160,0.18)] text-[#566A6A]' },
  info_requested: { label: '💬 Wants a Call', className: 'bg-[rgba(192,138,62,0.16)] text-[#8A6220]' },
  booking_requested: { label: '🔔 Wants to Book', className: 'bg-emerald-100 text-[#3F5F57]' },
  quote_sent: { label: '📤 Quote Sent', className: 'bg-[rgba(96,165,250,0.15)] text-[#2563EB]' },
  awaiting_client_response: { label: '📤 Quote Sent', className: 'bg-[rgba(96,165,250,0.15)] text-[#2563EB]' },
  accepted: { label: '✅ Accepted', className: 'bg-emerald-100 text-[#3F5F57]' },
  client_accepted: { label: '✅ Accepted', className: 'bg-emerald-100 text-[#3F5F57]' },
  quote_declined: { label: '❌ Declined', className: 'bg-destructive/10 text-destructive' },
  declined: { label: '❌ Declined', className: 'bg-destructive/10 text-destructive' },
  expired: { label: '⏳ Expired', className: 'bg-muted text-muted-foreground' },
};

/** Quick filters, in the order BJ actually works them. */
const CHIPS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'hot', label: '🔔 Wants to book', match: s => s === 'booking_requested' },
  { key: 'call', label: '💬 Wants a call', match: s => s === 'info_requested' },
  { key: 'viewed', label: '👀 Viewed price', match: s => s === 'price_viewed' },
  { key: 'new', label: '🟡 New enquiry', match: s => ['pending_form', 'form_submitted', 'awaiting_quote'].includes(s) },
  { key: 'sent', label: '📤 Quote sent', match: s => ['quote_sent', 'awaiting_client_response'].includes(s) },
  { key: 'dead', label: '❌ Declined', match: s => ['quote_declined', 'declined'].includes(s) },
];

const LEAD_STATUSES = ['pending_form', 'form_submitted', 'awaiting_quote', 'price_viewed', 'info_requested', 'booking_requested', 'quote_sent', 'awaiting_client_response', 'quote_declined', 'declined'];

/** "11 min ago" / "3 hr ago" / "2 days ago" — so you can see what's fresh. */
function timeAgo(iso?: string) {
  if (!iso) return '—';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} hr ago`;
  const days = Math.round(secs / 86400);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

const isFresh = (iso?: string) => !!iso && (Date.now() - new Date(iso).getTime()) < 24 * 3600 * 1000;

export default function LeadsTab({ focusLeadId, onFocusHandled }: { focusLeadId?: string | null; onFocusHandled?: () => void } = {}) {
  const [chip, setChip] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [deleteLead, setDeleteLead] = useState<any>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (lead: any) => {
      await (supabase.from('quotes').delete() as any).eq('quote_request_id', lead.id);
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
    // Leads land while you're looking at the page — keep it live.
    refetchInterval: 60_000,
  });

  // Deep link from a notification (/clients?lead=<id>) — open that lead straight away.
  useEffect(() => {
    if (!focusLeadId || !leads.length) return;
    const hit = leads.find((l: any) => l.id === focusLeadId);
    if (hit) {
      setSelectedLead(hit);
      onFocusHandled?.();
    }
  }, [focusLeadId, leads, onFocusHandled]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    CHIPS.forEach(ch => { c[ch.key] = leads.filter((l: any) => ch.match(l.status)).length; });
    return c;
  }, [leads]);

  const newToday = useMemo(() => leads.filter((l: any) => isFresh(l.created_at)).length, [leads]);

  // Newest first (the query already sorts) — filtered by chip + search.
  const filtered = useMemo(() => {
    const chipDef = CHIPS.find(c => c.key === chip) || CHIPS[0];
    const q = search.trim().toLowerCase();
    return leads.filter((l: any) => {
      if (!chipDef.match(l.status)) return false;
      if (!q) return true;
      const hay = [l.first_name, l.last_name, l.phone, l.email, l.address, l.clean_type]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [leads, chip, search]);

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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (leads.length === 0) return (
    <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
      No leads yet. Send a quote request to get started.
    </div>
  );

  return (
    <>
    <div className="space-y-4">
      {/* Headline — what came in today */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-lg font-extrabold text-foreground">
            {newToday > 0
              ? <>{newToday} new lead{newToday === 1 ? '' : 's'} in the last 24 hours</>
              : <>{leads.length} lead{leads.length === 1 ? '' : 's'} · newest first</>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Click any lead to see their full story and what to do next.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="h-10 rounded-xl gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, email or address…"
          className="pl-9 h-11 rounded-xl bg-card"
        />
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(ch => {
          const active = chip === ch.key;
          const n = counts[ch.key] ?? 0;
          if (ch.key !== 'all' && n === 0) return null;
          return (
            <button
              key={ch.key}
              onClick={() => setChip(ch.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {ch.label} <span className={active ? 'opacity-80' : 'opacity-60'}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Clean Type</TableHead>
              <TableHead>Quoted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No leads match — try a different filter or search.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(lead => {
              const cfg = STATUS_CONFIG[lead.status] || { label: lead.status, className: 'bg-muted text-muted-foreground' };
              const fresh = isFresh(lead.created_at);
              const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
              return (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/60"
                  onClick={() => setSelectedLead(lead)}>
                  <TableCell className="font-semibold text-primary">
                    <span className="flex items-center gap-2">
                      {fresh && <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="New in the last 24 hours" />}
                      {name}
                    </span>
                  </TableCell>
                  <TableCell className={fresh ? 'font-bold text-foreground' : 'text-muted-foreground'}>
                    {timeAgo(lead.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.phone || '—'}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{lead.clean_type || '—'}</TableCell>
                  <TableCell className="font-semibold">
                    {lead.total_inc_gst != null ? `$${Math.round(Number(lead.total_inc_gst))}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${cfg.className} text-xs font-semibold whitespace-nowrap`}>
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {lead.phone && (
                        <Button variant="ghost" size="sm" title={`Call ${lead.phone}`} asChild
                          onClick={(e) => e.stopPropagation()}>
                          <a href={`tel:${lead.phone}`}><Phone className="w-4 h-4" /></a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title="Copy form link"
                        onClick={(e) => {
                          e.stopPropagation();
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
