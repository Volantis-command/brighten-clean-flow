import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCleanersList } from '@/hooks/useCleanersList';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Search, Plus, BedDouble, Bath, Trash2, AlertTriangle, Merge, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import ScheduleCleanModal from '@/components/client-detail/ScheduleCleanModal';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [bookProperty, setBookProperty] = useState<any>(null);
  const { data: cleaners = [] } = useCleanersList();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('properties').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${deleteTarget.name} deleted`);
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ['properties'] });
  };

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('property_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lastCleanMap = {} } = useQuery({
    queryKey: ['properties-last-clean'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('property_id, clock_off_at')
        .in('status', ['completed', 'complete'])
        .not('clock_off_at', 'is', null)
        .order('clock_off_at', { ascending: false });
      const map: Record<string, string> = {};
      (data || []).forEach((j: any) => {
        if (j.property_id && !map[j.property_id]) {
          map[j.property_id] = j.clock_off_at;
        }
      });
      return map;
    },
  });

  const duplicateGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    properties.forEach((p) => {
      const key = (p.address || '').toLowerCase().trim();
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }, [properties]);

  const cleanerMap = Object.fromEntries(cleaners.map((c) => [c.id, c.full_name]));

  const filtered = properties.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.property_name.toLowerCase().includes(q) ||
      (p.suburb || '').toLowerCase().includes(q) ||
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  });

  const typeBadge = (clientType: string | null) => {
    const isAirbnb = clientType === 'airbnb' || clientType === 'short_term_rental';
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isAirbnb ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground'}`}>
        {isAirbnb ? 'Airbnb' : 'House Clean'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Properties</h1>
        {role === 'admin' && (
          <Button variant="accent" size="default" onClick={() => navigate('/quote')} className="gap-2">
            <Plus className="h-5 w-5" />
            Add Property
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search by name, suburb, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-12 h-14 rounded-2xl text-base"
        />
      </div>

      {role === 'admin' && duplicateGroups.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">
              {duplicateGroups.length} duplicate {duplicateGroups.length === 1 ? 'property' : 'properties'} detected
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Properties with the same address (different capitalisation) were found. Review and merge to avoid confusion.
            </p>
            <Button variant="outline" size="sm" className="mt-2 gap-1 rounded-xl" onClick={() => setMergeDialogOpen(true)}>
              <Merge className="h-4 w-4" /> Review Duplicates
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-primary font-bold">Loading properties…</p>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center">
          <p className="text-4xl mb-3">🏠</p>
          <p className="text-lg font-bold text-foreground mb-1">
            {search ? 'No properties match your search.' : 'No properties yet.'}
          </p>
          <p className="text-muted-foreground text-sm">
            {!search && role === 'admin' && 'Tap "+ Add Property" to get started.'}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((property) => (
            <div
              key={property.id}
              className="w-full text-left bg-card rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow border border-border"
            >
              <button
                onClick={() => navigate(`/properties/${property.id}`)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-lg font-bold text-foreground leading-tight">{property.property_name}</h3>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                        property.status === 'active'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {property.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    {typeBadge(property.client_type)}
                  </div>
                </div>

                {(property.address || property.suburb) && (
                  <p className="text-sm text-muted-foreground mb-3 truncate">
                    {[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')}
                  </p>
                )}

                <div className="flex items-center gap-4 mb-2">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <BedDouble className="h-4 w-4" />
                    <span className="font-semibold">{property.bedrooms || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Bath className="h-4 w-4" />
                    <span className="font-semibold">{property.bathrooms || 0}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {(lastCleanMap as Record<string, string>)[property.id]
                    ? `Last cleaned: ${formatDistanceToNow(new Date((lastCleanMap as Record<string, string>)[property.id]), { addSuffix: true })}`
                    : 'Never cleaned'}
                </p>
              </button>

              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  {property.client_name && (
                    <p className="text-sm font-semibold text-muted-foreground">
                      Client: {property.client_name}
                    </p>
                  )}
                  {property.preferred_cleaner_id && cleanerMap[property.preferred_cleaner_id] && (
                    <p className="text-xs text-muted-foreground">
                      🧹 {cleanerMap[property.preferred_cleaner_id]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {role === 'admin' && (
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setBookProperty(property); }}
                      className="bg-primary text-primary-foreground gap-1 h-8 text-xs"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> Book
                    </Button>
                  )}
                  {role === 'admin' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: property.id, name: property.property_name }); }}
                      className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete property"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Book Clean Modal */}
      {bookProperty && (
        <ScheduleCleanModal
          open={!!bookProperty}
          onOpenChange={(open) => { if (!open) setBookProperty(null); }}
          clientId={bookProperty.id}
          clientName={bookProperty.client_name || bookProperty.property_name}
          properties={[{ id: bookProperty.id, property_name: bookProperty.property_name, address: bookProperty.address }]}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplicate Properties</DialogTitle>
            <DialogDescription>These properties share the same address. Delete the duplicate to keep your data clean.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {duplicateGroups.map((group, gi) => (
              <div key={gi} className="border border-border rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase">{group[0].address}</p>
                {group.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-foreground">{p.property_name}</p>
                      <p className="text-xs text-muted-foreground">{p.client_name || 'No client'} · {p.bedrooms}BR/{p.bathrooms}BA</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 rounded-xl gap-1 shrink-0"
                      onClick={async () => {
                        const confirmed = window.confirm(`Delete "${p.property_name}"? This cannot be undone.`);
                        if (!confirmed) return;
                        const { error } = await supabase.from('properties').delete().eq('id', p.id);
                        if (error) { toast.error(error.message); return; }
                        toast.success(`Deleted "${p.property_name}"`);
                        queryClient.invalidateQueries({ queryKey: ['properties'] });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
