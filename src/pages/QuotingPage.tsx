import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, ArrowLeft, Copy, Send, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type Quote = {
  id: string;
  client_name: string | null;
  property_id: string | null;
  service_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  extras: any;
  price: number | null;
  status: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  properties?: { property_name: string; address: string | null; suburb: string | null } | null;
};

const SERVICE_TYPES = ['Turnover Clean', 'Deep Clean', 'End of Lease', 'First Clean', 'Other'];

const EXTRAS_OPTIONS = [
  'Oven deep clean',
  'Fridge deep clean',
  'Carpet steam',
  'Balcony',
  'BBQ clean',
  'Window exterior',
  'Other',
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-destructive/10 text-destructive',
};

const EMPTY_FORM = {
  client_name: '',
  property_id: '',
  service_type: '',
  bedrooms: 1,
  bathrooms: 1,
  extras: [] as string[],
  price: '',
  notes: '',
  internal_notes: '',
};

export default function QuotingPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, properties(property_name, address, suburb)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['properties-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, property_name').order('property_name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        client_name: form.client_name || null,
        property_id: form.property_id || null,
        service_type: form.service_type || null,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        extras: form.extras,
        price: form.price ? parseFloat(form.price) : null,
        notes: form.notes || null,
        internal_notes: form.internal_notes || null,
        status: 'draft',
      };
      if (editId) {
        const { error } = await supabase.from('quotes').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('quotes').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? 'Quote updated!' : 'Quote created!');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('quotes').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Quote marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      if (selectedQuote) setSelectedQuote({ ...selectedQuote, status });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setView('list');
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setView('create');
  };

  const openEdit = (q: Quote) => {
    setForm({
      client_name: q.client_name || '',
      property_id: q.property_id || '',
      service_type: q.service_type || '',
      bedrooms: q.bedrooms || 1,
      bathrooms: q.bathrooms || 1,
      extras: Array.isArray(q.extras) ? q.extras : [],
      price: q.price != null ? String(q.price) : '',
      notes: q.notes || '',
      internal_notes: q.internal_notes || '',
    });
    setEditId(q.id);
    setView('create');
  };

  const updateField = (f: string, v: any) => setForm((p) => ({ ...p, [f]: v }));

  const toggleExtra = (extra: string) => {
    setForm((p) => ({
      ...p,
      extras: p.extras.includes(extra) ? p.extras.filter((e) => e !== extra) : [...p.extras, extra],
    }));
  };

  const buildQuoteText = (q: Quote) => {
    const propName = q.properties?.property_name || 'Property';
    const addr = [q.properties?.address, q.properties?.suburb].filter(Boolean).join(', ');
    const extras = Array.isArray(q.extras) && q.extras.length > 0 ? q.extras.join(', ') : 'None';
    return `✨ Brightly. Cleaning Quote ✨

Client: ${q.client_name || '—'}
Property: ${propName}${addr ? ` — ${addr}` : ''}
Service: ${q.service_type || '—'}
Rooms: ${q.bedrooms || 0} bed · ${q.bathrooms || 0} bath
Extras: ${extras}

💰 Quote Price: $${q.price != null ? Number(q.price).toFixed(2) : '—'}
Payment Terms: 7 days from invoice date

${q.notes ? `Notes:\n${q.notes}\n` : ''}
Thank you for choosing Brightly. ✨`;
  };

  const copyQuoteText = (q: Quote) => {
    navigator.clipboard.writeText(buildQuoteText(q));
    toast.success('Quote text copied to clipboard!');
  };

  /* ─── LIST VIEW ─── */
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-primary">Quotes</h1>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Quote
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : quotes.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-md p-8 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground font-semibold">No quotes yet</p>
            <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Create your first quote</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((q) => (
              <button
                key={q.id}
                onClick={() => { setSelectedQuote(q); setView('detail'); }}
                className="w-full text-left bg-card rounded-2xl shadow-md p-4 flex items-center justify-between hover:shadow-lg transition-shadow"
              >
                <div className="space-y-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{q.client_name || 'No client'}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {q.properties?.property_name || '—'} · {q.service_type || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(new Date(q.created_at), 'dd MMM yyyy')}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-extrabold text-foreground text-lg">
                    {q.price != null ? `$${Number(q.price).toFixed(0)}` : '—'}
                  </span>
                  <Badge className={cn('capitalize', STATUS_COLORS[q.status || 'draft'])}>
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

  /* ─── CREATE / EDIT VIEW ─── */
  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={resetForm} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
        <h1 className="text-2xl font-extrabold text-primary">{editId ? 'Edit Quote' : 'Create Quote'}</h1>

        <div className="bg-card rounded-2xl shadow-md p-5 space-y-5">
          <Field label="Client Name">
            <Input value={form.client_name} onChange={(e) => updateField('client_name', e.target.value)} className="h-14 rounded-2xl" />
          </Field>

          <Field label="Property">
            <Select value={form.property_id || '__none__'} onValueChange={(v) => updateField('property_id', v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Link to property" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None / New property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Service Type">
            <Select value={form.service_type} onValueChange={(v) => updateField('service_type', v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select service" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Bedrooms">
              <NumberSelector value={form.bedrooms} onChange={(n) => updateField('bedrooms', n)} />
            </Field>
            <Field label="Bathrooms">
              <NumberSelector value={form.bathrooms} onChange={(n) => updateField('bathrooms', n)} />
            </Field>
          </div>

          <Field label="Extras">
            <div className="grid grid-cols-2 gap-2">
              {EXTRAS_OPTIONS.map((extra) => (
                <label key={extra} className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-secondary/50">
                  <Checkbox
                    checked={form.extras.includes(extra)}
                    onCheckedChange={() => toggleExtra(extra)}
                  />
                  <span className="text-sm font-semibold text-foreground">{extra}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Quote Price ($)">
            <Input
              type="number"
              value={form.price}
              onChange={(e) => updateField('price', e.target.value)}
              className="h-14 rounded-2xl text-xl font-extrabold"
              placeholder="0.00"
              step="0.01"
            />
          </Field>

          <Field label="Notes for Client">
            <Textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} className="rounded-2xl min-h-[80px]" placeholder="Visible to the client" />
          </Field>

          <Field label="Internal Notes">
            <Textarea value={form.internal_notes} onChange={(e) => updateField('internal_notes', e.target.value)} className="rounded-2xl min-h-[80px]" placeholder="Admin only — not shown to client" />
          </Field>

          <Button
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? 'Saving…' : editId ? 'Update Quote' : 'Create Quote'}
          </Button>
        </div>
      </div>
    );
  }

  /* ─── DETAIL VIEW ─── */
  if (view === 'detail' && selectedQuote) {
    const q = selectedQuote;
    const extras = Array.isArray(q.extras) ? q.extras : [];
    const propName = q.properties?.property_name || '—';
    const addr = [q.properties?.address, q.properties?.suburb].filter(Boolean).join(', ');

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView('list')} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        {/* Branded Quote Card */}
        <div className="bg-card rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-primary text-primary-foreground p-5">
            <p className="text-2xl font-extrabold tracking-tight">Brightly.</p>
            <p className="text-sm opacity-80 mt-1">Cleaning Quote</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Client</p>
                <p className="font-bold text-foreground text-lg">{q.client_name || '—'}</p>
              </div>
              <Badge className={cn('capitalize text-sm', STATUS_COLORS[q.status || 'draft'])}>
                {q.status || 'draft'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoBlock label="Property" value={propName} />
              {addr && <InfoBlock label="Address" value={addr} />}
              <InfoBlock label="Service" value={q.service_type || '—'} />
              <InfoBlock label="Rooms" value={`${q.bedrooms || 0} bed · ${q.bathrooms || 0} bath`} />
            </div>

            {extras.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold mb-1">Inclusions</p>
                <div className="flex flex-wrap gap-2">
                  {extras.map((e: string) => (
                    <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-secondary/50 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Quote Price</p>
                <p className="text-3xl font-extrabold text-primary">
                  {q.price != null ? `$${Number(q.price).toFixed(2)}` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground font-semibold">Payment Terms</p>
                <p className="font-bold text-foreground">7 days from invoice</p>
              </div>
            </div>

            {q.notes && (
              <div>
                <p className="text-sm text-muted-foreground font-semibold mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{q.notes}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{format(new Date(q.created_at), 'dd MMMM yyyy')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => copyQuoteText(q)} className="gap-2">
            <Copy className="h-4 w-4" /> Copy Quote Text
          </Button>
          <Button variant="outline" onClick={() => openEdit(q)} className="gap-2">
            <FileText className="h-4 w-4" /> Edit Quote
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={() => statusMutation.mutate({ id: q.id, status: 'sent' })}
            disabled={q.status === 'sent'}
            className="gap-1 text-sm"
          >
            <Send className="h-4 w-4" /> Mark Sent
          </Button>
          <Button
            variant="outline"
            onClick={() => statusMutation.mutate({ id: q.id, status: 'accepted' })}
            disabled={q.status === 'accepted'}
            className="gap-1 text-sm text-green-700"
          >
            <CheckCircle2 className="h-4 w-4" /> Accepted
          </Button>
          <Button
            variant="outline"
            onClick={() => statusMutation.mutate({ id: q.id, status: 'declined' })}
            disabled={q.status === 'declined'}
            className="gap-1 text-sm text-destructive"
          >
            <XCircle className="h-4 w-4" /> Declined
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

/* ───── Helpers ───── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            'h-12 w-12 rounded-2xl border-2 font-extrabold text-base transition-all',
            value === n
              ? 'border-primary bg-secondary text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40'
          )}
        >
          {n}{n === 5 ? '+' : ''}
        </button>
      ))}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground font-semibold">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}
