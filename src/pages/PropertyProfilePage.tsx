import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { JobHistoryTab } from '@/components/property/JobHistoryTab';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ROOMS = ['Kitchen', 'Bathroom', 'Bedroom', 'Lounge', 'Balcony', 'Entry', 'Other'];

const DEFAULT_RESTOCKING = [
  { emoji: '☕', item_name: 'Coffee Pods' },
  { emoji: '🧻', item_name: 'Toilet Paper' },
  { emoji: '🛏', item_name: 'Fresh Linen' },
  { emoji: '🛁', item_name: 'Towels' },
  { emoji: '🧴', item_name: 'Soap' },
  { emoji: '🍽', item_name: 'Dishwashing Tabs' },
];

export default function PropertyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: property, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleDelete = async () => {
    if (!property) return;
    setDeleting(true);
    const { error } = await supabase.from('properties').delete().eq('id', property.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${property.property_name} deleted`);
    navigate('/properties');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-primary font-bold">Loading…</p></div>;
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-foreground mb-2">Property not found</p>
        <Button variant="outline" onClick={() => navigate('/properties')}>Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/properties')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
      <h1 className="text-2xl font-extrabold text-primary">{property.property_name}</h1>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
          <TabsTrigger value="sop" className="flex-1">SOP & Restocking</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Job History</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <DetailsTab property={property} cleaners={cleaners} />
        </TabsContent>
        <TabsContent value="sop">
          <SOPTab property={property} />
        </TabsContent>
        <TabsContent value="history">
          <JobHistoryTab propertyId={property.id} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete {property.property_name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════ DETAILS TAB ═══════ */

function DetailsTab({ property, cleaners }: { property: any; cleaners: any[] }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    property_name: '',
    address: '',
    suburb: '',
    client_type: 'residential',
    bedrooms: 1,
    bathrooms: 1,
    client_name: '',
    preferred_cleaner_id: '',
    access_notes: '',
    lockbox_code: '',
    status: 'active',
    special_instructions: '',
    property_notes: '',
  });

  useEffect(() => {
    if (property) {
      setForm({
        property_name: property.property_name || '',
        address: property.address || '',
        suburb: property.suburb || '',
        client_type: property.client_type || 'residential',
        bedrooms: property.bedrooms || 1,
        bathrooms: property.bathrooms || 1,
        client_name: property.client_name || '',
        preferred_cleaner_id: property.preferred_cleaner_id || '',
        access_notes: property.access_notes || '',
        lockbox_code: property.lockbox_code || '',
        status: property.status || 'active',
        special_instructions: (property as any).special_instructions || '',
        property_notes: (property as any).property_notes || '',
      });
    }
  }, [property]);

  const u = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.property_name.trim()) { toast.error('Property name is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('properties').update({
      property_name: form.property_name,
      address: form.address || null,
      suburb: form.suburb || null,
      client_type: form.client_type,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      client_name: form.client_name || null,
      preferred_cleaner_id: form.preferred_cleaner_id || null,
      access_notes: form.access_notes || null,
      lockbox_code: form.lockbox_code || null,
      status: form.status,
      special_instructions: form.special_instructions || null,
      property_notes: form.property_notes || null,
    } as any).eq('id', property.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Property saved');
    queryClient.invalidateQueries({ queryKey: ['property', property.id] });
    queryClient.invalidateQueries({ queryKey: ['properties'] });
  };

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-5 mt-4">
      <Field label="Property Name">
        <Input value={form.property_name} onChange={(e) => u('property_name', e.target.value)} className="h-12 rounded-xl" />
      </Field>
      <Field label="Address">
        <Input value={form.address} onChange={(e) => u('address', e.target.value)} className="h-12 rounded-xl" />
      </Field>
      <Field label="Suburb">
        <Input value={form.suburb} onChange={(e) => u('suburb', e.target.value)} className="h-12 rounded-xl" />
      </Field>
      <Field label="Type">
        <div className="flex gap-2">
          {[{ v: 'residential', l: 'House Clean' }, { v: 'airbnb', l: 'Airbnb' }].map(({ v, l }) => (
            <button key={v} type="button" onClick={() => u('client_type', v)}
              className={cn('flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all',
                form.client_type === v ? 'border-primary bg-secondary text-primary' : 'border-border text-muted-foreground'
              )}
            >{l}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bedrooms">
          <Input type="number" min={0} value={form.bedrooms} onChange={(e) => u('bedrooms', Number(e.target.value))} className="h-12 rounded-xl" />
        </Field>
        <Field label="Bathrooms">
          <Input type="number" min={0} value={form.bathrooms} onChange={(e) => u('bathrooms', Number(e.target.value))} className="h-12 rounded-xl" />
        </Field>
      </div>
      <Field label="Client / Host Name">
        <Input value={form.client_name} onChange={(e) => u('client_name', e.target.value)} className="h-12 rounded-xl" />
      </Field>
      <Field label="Preferred Cleaner">
        <select value={form.preferred_cleaner_id} onChange={(e) => u('preferred_cleaner_id', e.target.value)}
          className="w-full h-12 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">— None —</option>
          {cleaners.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
      <Field label="Property Access">
        <p className="text-xs text-muted-foreground mb-1">Key safe codes, gate codes, parking — visible to cleaners</p>
        <Textarea value={form.access_notes} onChange={(e) => u('access_notes', e.target.value)} rows={3} className="rounded-xl" />
      </Field>
      <Field label="Cleaning Instructions">
        <p className="text-xs text-muted-foreground mb-1">Client preferences and special requirements</p>
        <Textarea value={form.special_instructions} onChange={(e) => u('special_instructions', e.target.value)} rows={3} className="rounded-xl" />
      </Field>
      <Field label="🔑 Lockbox Code (only shown to cleaner after check-in)">
        <Input value={form.lockbox_code} onChange={(e) => u('lockbox_code', e.target.value)} className="h-12 rounded-xl" />
      </Field>
      <Field label="📝 Cleaner Notes (visible to cleaners during active jobs)">
        <Textarea value={form.property_notes} onChange={(e) => u('property_notes', e.target.value)} rows={3} className="rounded-xl" placeholder="e.g. Use back entrance, bins go out Tuesdays" />
      </Field>
      <div className="flex items-center justify-between py-2">
        <Label className="font-semibold">Active</Label>
        <Switch checked={form.status === 'active'} onCheckedChange={(v) => u('status', v ? 'active' : 'inactive')} />
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2" size="lg">
        <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

/* ═══════ SOP & RESTOCKING TAB ═══════ */

function SOPTab({ property }: { property: any }) {
  const queryClient = useQueryClient();
  const isAirbnb = property.client_type === 'airbnb' || property.client_type === 'short_term_rental';

  // SOP items
  const { data: sopItems = [], isLoading: sopLoading } = useQuery({
    queryKey: ['sop-items', property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('property_sop_items')
        .select('*')
        .eq('property_id', property.id)
        .eq('active', true)
        .order('room').order('sort_order');
      return data || [];
    },
  });

  // Restocking items
  const { data: restockItems = [], isLoading: restockLoading } = useQuery({
    queryKey: ['restock-items', property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('property_restocking_items')
        .select('*')
        .eq('property_id', property.id)
        .eq('active', true)
        .order('sort_order');
      return data || [];
    },
  });

  return (
    <div className="space-y-6 mt-4">
      {!isAirbnb && (
        <div className="bg-muted rounded-xl p-4 text-sm text-muted-foreground font-medium">
          ℹ️ House Clean properties use the standard default checklist. You can still add custom SOP items below if needed.
        </div>
      )}
      <SOPSection propertyId={property.id} items={sopItems} loading={sopLoading} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sop-items', property.id] })} />
      <RestockingSection propertyId={property.id} items={restockItems} loading={restockLoading} isAirbnb={isAirbnb} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['restock-items', property.id] })} />
    </div>
  );
}

function SOPSection({ propertyId, items, loading, onRefresh }: { propertyId: string; items: any[]; loading: boolean; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const grouped: Record<string, any[]> = {};
  ROOMS.forEach(r => { grouped[r] = []; });
  items.forEach(i => {
    const room = ROOMS.includes(i.room) ? i.room : 'Other';
    grouped[room].push(i);
  });

  const toggle = (room: string) => setExpanded(e => ({ ...e, [room]: !e[room] }));

  const addTask = async (room: string) => {
    const task = (newTask[room] || '').trim();
    if (!task) return;
    setSaving(true);
    const maxOrder = Math.max(0, ...grouped[room].map(i => i.sort_order || 0));
    await supabase.from('property_sop_items').insert({
      property_id: propertyId, room, task, sort_order: maxOrder + 1,
    } as any);
    setNewTask(n => ({ ...n, [room]: '' }));
    setSaving(false);
    onRefresh();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('property_sop_items').update({ active: false } as any).eq('id', id);
    onRefresh();
  };

  const moveTask = async (item: any, dir: -1 | 1) => {
    const roomItems = grouped[item.room].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = roomItems.findIndex((i: any) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= roomItems.length) return;
    const other = roomItems[swapIdx];
    await Promise.all([
      supabase.from('property_sop_items').update({ sort_order: other.sort_order } as any).eq('id', item.id),
      supabase.from('property_sop_items').update({ sort_order: item.sort_order } as any).eq('id', other.id),
    ]);
    onRefresh();
  };

  if (loading) return <p className="text-muted-foreground text-sm">Loading SOP…</p>;

  return (
    <section>
      <h3 className="text-base font-bold text-foreground mb-3">SOP Items</h3>
      <div className="space-y-2">
        {ROOMS.map(room => {
          const roomItems = grouped[room].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          const isOpen = expanded[room] ?? false;
          return (
            <div key={room} className="bg-card rounded-xl border border-border overflow-hidden">
              <button onClick={() => toggle(room)} className="w-full flex items-center justify-between p-4 text-left">
                <span className="font-semibold text-sm text-foreground">{room} <span className="text-muted-foreground text-xs">({roomItems.length})</span></span>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {roomItems.map((item: any, idx: number) => (
                    <div key={item.id} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-foreground">{item.task}</span>
                      <button onClick={() => moveTask(item, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveTask(item, 1)} disabled={idx === roomItems.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteTask(item.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input placeholder="New task…" value={newTask[room] || ''} onChange={(e) => setNewTask(n => ({ ...n, [room]: e.target.value }))}
                      className="h-10 rounded-lg text-sm flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') addTask(room); }}
                    />
                    <Button size="sm" variant="outline" onClick={() => addTask(room)} disabled={saving} className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RestockingSection({ propertyId, items, loading, isAirbnb, onRefresh }: { propertyId: string; items: any[]; loading: boolean; isAirbnb: boolean; onRefresh: () => void }) {
  const [newEmoji, setNewEmoji] = useState('📦');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Auto-seed defaults for new airbnb properties with no restocking items
  useEffect(() => {
    if (!loading && isAirbnb && items.length === 0 && !initialized) {
      setInitialized(true);
      (async () => {
        const rows = DEFAULT_RESTOCKING.map((d, i) => ({
          property_id: propertyId,
          emoji: d.emoji,
          item_name: d.item_name,
          sort_order: i,
        }));
        await supabase.from('property_restocking_items').insert(rows as any);
        onRefresh();
      })();
    }
  }, [loading, isAirbnb, items.length, initialized, propertyId, onRefresh]);

  const addItem = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const maxOrder = Math.max(0, ...items.map(i => i.sort_order || 0));
    await supabase.from('property_restocking_items').insert({
      property_id: propertyId, emoji: newEmoji, item_name: name, sort_order: maxOrder + 1,
    } as any);
    setNewName('');
    setNewEmoji('📦');
    setSaving(false);
    onRefresh();
  };

  const deleteItem = async (id: string) => {
    await supabase.from('property_restocking_items').update({ active: false } as any).eq('id', id);
    onRefresh();
  };

  if (loading) return <p className="text-muted-foreground text-sm">Loading restocking…</p>;

  return (
    <section>
      <h3 className="text-base font-bold text-foreground mb-3">Restocking Checklist</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {items.map((item: any) => (
          <div key={item.id} className="relative bg-card border border-border rounded-xl p-3 text-center">
            <span className="text-2xl">{item.emoji || '📦'}</span>
            <p className="text-xs font-semibold mt-1 text-foreground">{item.item_name}</p>
            <button onClick={() => deleteItem(item.id)} className="absolute top-1 right-1 text-destructive hover:text-destructive/80">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-end">
        <div className="w-16">
          <Label className="text-xs">Emoji</Label>
          <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} className="h-10 rounded-lg text-center text-lg" maxLength={2} />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Item name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Shampoo" className="h-10 rounded-lg text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
          />
        </div>
        <Button size="sm" variant="outline" onClick={addItem} disabled={saving} className="gap-1 h-10">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
