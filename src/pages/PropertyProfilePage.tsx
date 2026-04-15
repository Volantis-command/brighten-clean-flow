import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Pencil, CalendarPlus, Camera, FileText } from 'lucide-react';
import { JobHistoryTab } from '@/components/property/JobHistoryTab';
import PropertyInvoicesTab from '@/components/property/PropertyInvoicesTab';
import PropertyPassportSection from '@/components/property/PropertyPassportSection';
import PropertyProfileForm from '@/components/properties/PropertyProfileForm';
import ScheduleCleanModal from '@/components/client-detail/ScheduleCleanModal';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ROOMS = ['Kitchen', 'Bathroom', 'Bedroom', 'Lounge', 'Balcony', 'Entry', 'Other'];

const DEFAULT_RESTOCKING = [
  { emoji: '\u2615', item_name: 'Coffee Pods' },
  { emoji: '\uD83E\uDDFB', item_name: 'Toilet Paper' },
  { emoji: '\uD83D\uDECF', item_name: 'Fresh Linen' },
  { emoji: '\uD83D\uDEC1', item_name: 'Towels' },
  { emoji: '\uD83E\uDDF4', item_name: 'Soap' },
  { emoji: '\uD83C\uDF7D', item_name: 'Dishwashing Tabs' },
];

export default function PropertyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profileMode, setProfileMode] = useState<'view' | 'edit'>('view');
  const [scheduleOpen, setScheduleOpen] = useState(false);

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
    navigate('/clients');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-primary font-bold">Loading\u2026</p></div>;
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-foreground mb-2">Property not found</p>
        <Button variant="outline" onClick={() => navigate('/clients')}>Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setScheduleOpen(true)} className="bg-primary text-primary-foreground gap-1.5">
            <CalendarPlus className="h-4 w-4" /> Book Clean
          </Button>
          {isAdmin && profileMode === 'view' && (
            <Button variant="outline" size="sm" onClick={() => setProfileMode('edit')} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {isAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} className="gap-1.5">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-primary">{property.property_name}</h1>
        {(property.address || property.suburb) && (
          <p className="text-sm text-muted-foreground mt-1">{[property.address, property.suburb, (property as any).state, (property as any).postcode].filter(Boolean).join(', ')}</p>
        )}
        {(property as any).client_name && (
          <p className="text-sm text-muted-foreground mt-0.5">Client: <span className="font-semibold">{(property as any).client_name}</span></p>
        )}
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
          <TabsTrigger value="passport" className="flex-1">Passport</TabsTrigger>
          <TabsTrigger value="sop" className="flex-1">SOP</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
          <TabsTrigger value="forms" className="flex-1">Forms</TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1">Invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <div className="bg-card rounded-2xl shadow-md p-5 mt-4">
            <PropertyProfileForm
              property={property}
              mode={profileMode}
              isAdmin={isAdmin}
              onSaved={() => setProfileMode('view')}
            />
          </div>
        </TabsContent>
        <TabsContent value="passport">
          <div className="bg-card rounded-2xl border border-border p-5 mt-4">
            <h3 className="font-bold text-foreground mb-4">Property Passport</h3>
            <PropertyPassportSection propertyId={property.id} />
          </div>
        </TabsContent>
        <TabsContent value="sop">
          <SOPTab property={property} />
        </TabsContent>
        <TabsContent value="history">
          <JobHistoryTab propertyId={property.id} />
        </TabsContent>
        <TabsContent value="forms">
          <FormsTab propertyId={property.id} />
        </TabsContent>
        <TabsContent value="invoices">
          <PropertyInvoicesTab propertyId={property.id} showAdminTools={isAdmin} />
        </TabsContent>
      </Tabs>

      {/* Notes for Next Clean */}
      <WatchlistNotes propertyId={property.id} initialNotes={(property as any).property_notes || ''} />

      {/* Schedule Clean Modal */}
      <ScheduleCleanModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        clientId={property.id}
        clientName={(property as any).client_name || property.property_name}
        properties={[{ id: property.id, property_name: property.property_name, address: property.address, default_price: (property as any).default_price, price_includes_gst: (property as any).price_includes_gst }]}
      />

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
              {deleting ? 'Deleting\u2026' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ======= FORMS TAB ======= */
function FormsTab({ propertyId }: { propertyId: string }) {
  const navigate = useNavigate();

  const { data: completedJobs = [], isLoading } = useQuery({
    queryKey: ['property-completed-jobs', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, completion_notes, completion_photos, completion_form_completed_at, clock_on, clock_off, duration_minutes')
        .eq('property_id', propertyId)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false });
      return data || [];
    },
  });

  const cleanerIds = [...new Set(completedJobs.flatMap(j => [j.cleaner_1_id, j.cleaner_2_id].filter(Boolean)))];
  const { data: cleaners = [] } = useQuery({
    queryKey: ['property-form-cleaners', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds as string[]);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['property-form-photos', propertyId],
    queryFn: async () => {
      const jobIds = completedJobs.map(j => j.id);
      if (jobIds.length === 0) return [];
      const { data } = await supabase.from('job_photos').select('*').in('job_id', jobIds);
      return data || [];
    },
    enabled: completedJobs.length > 0,
  });

  const cleanerMap: Record<string, string> = {};
  cleaners.forEach((c: any) => { cleanerMap[c.id] = c.full_name || ''; });

  const photosByJob: Record<string, any[]> = {};
  photos.forEach((p: any) => {
    if (!photosByJob[p.job_id]) photosByJob[p.job_id] = [];
    photosByJob[p.job_id].push(p);
  });

  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground text-sm mt-4 p-4">Loading forms…</p>;

  if (completedJobs.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-8 text-center mt-4">
        <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No completed cleans yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {completedJobs.map((job: any) => {
        const isExpanded = expandedJob === job.id;
        const jobPhotos = photosByJob[job.id] || [];
        const completionPhotos = job.completion_photos || [];
        const allPhotos = [...completionPhotos, ...jobPhotos.map((p: any) => p.public_url || p.storage_path)].filter(Boolean);
        const cleaner = cleanerMap[job.cleaner_1_id] || '—';

        return (
          <div key={job.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <button
              onClick={() => setExpandedJob(isExpanded ? null : job.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold text-foreground text-sm">{format(new Date(job.scheduled_date), 'dd MMM yyyy')}</p>
                  <p className="text-xs text-muted-foreground">{cleaner} · {job.duration_minutes ? `${job.duration_minutes} min` : '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {allPhotos.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Camera className="w-3.5 h-3.5" /> {allPhotos.length}</span>
                )}
                <Badge className="bg-primary/10 text-primary">Completed</Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                {job.completion_notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground bg-muted rounded-lg p-3">{job.completion_notes}</p>
                  </div>
                )}

                {job.clock_on && job.clock_off && (
                  <div className="flex gap-4 text-sm">
                    <div><span className="text-muted-foreground">Clock On:</span> <span className="font-medium">{format(new Date(job.clock_on), 'HH:mm')}</span></div>
                    <div><span className="text-muted-foreground">Clock Off:</span> <span className="font-medium">{format(new Date(job.clock_off), 'HH:mm')}</span></div>
                    {job.duration_minutes && <div><span className="text-muted-foreground">Duration:</span> <span className="font-medium">{job.duration_minutes} min</span></div>}
                  </div>
                )}

                {allPhotos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Photos ({allPhotos.length})</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {allPhotos.slice(0, 8).map((url: string, idx: number) => (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden bg-muted">
                          <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                      {allPhotos.length > 8 && (
                        <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          +{allPhotos.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${job.id}`)} className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> View Full Report
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ======= SOP & RESTOCKING TAB ======= */

function SOPTab({ property }: { property: any }) {
  const queryClient = useQueryClient();
  const isAirbnb = property.client_type === 'airbnb' || property.client_type === 'short_term_rental';

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
          House Clean properties use the standard default checklist. You can still add custom SOP items below if needed.
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

  if (loading) return <p className="text-muted-foreground text-sm">Loading SOP\u2026</p>;

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
                    <Input placeholder="New task\u2026" value={newTask[room] || ''} onChange={(e) => setNewTask(n => ({ ...n, [room]: e.target.value }))}
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
  const [newEmoji, setNewEmoji] = useState('\uD83D\uDCE6');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

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
    setNewEmoji('\uD83D\uDCE6');
    setSaving(false);
    onRefresh();
  };

  const deleteItem = async (id: string) => {
    await supabase.from('property_restocking_items').update({ active: false } as any).eq('id', id);
    onRefresh();
  };

  if (loading) return <p className="text-muted-foreground text-sm">Loading restocking\u2026</p>;

  return (
    <section>
      <h3 className="text-base font-bold text-foreground mb-3">Restocking Checklist</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {items.map((item: any) => (
          <div key={item.id} className="relative bg-card border border-border rounded-xl p-3 text-center">
            <span className="text-2xl">{item.emoji || '\uD83D\uDCE6'}</span>
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

function WatchlistNotes({ propertyId, initialNotes }: { propertyId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  const handleBlur = async () => {
    if (notes === initialNotes) return;
    setSaving(true);
    await supabase.from('properties').update({ property_notes: notes || null } as any).eq('id', propertyId);
    setSaving(false);
    toast.success('Notes saved');
  };

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
      <h3 className="text-lg font-bold text-foreground">Notes for Next Clean</h3>
      <p className="text-xs text-muted-foreground">Visible to cleaners before and during the job.</p>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, 500))}
        onBlur={handleBlur}
        rows={3}
        className="rounded-xl"
        placeholder="e.g. Check under beds, back patio gate needs oiling, owner left key in letterbox..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{notes.length} / 500 characters</span>
        {saving && <span className="text-xs text-primary font-semibold">Saving\u2026</span>}
      </div>
    </div>
  );
}
