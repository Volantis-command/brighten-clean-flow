import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  clientId: string;
  properties: { id: string; property_name: string; address?: string | null; suburb?: string | null }[];
  onRefresh: () => void;
}

export default function AssignedPropertiesSection({ clientId, properties, onRefresh }: Props) {
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedPropId, setSelectedPropId] = useState('');
  const [newPropMode, setNewPropMode] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');

  const { data: allProps = [] } = useQuery({
    queryKey: ['all-properties-for-assign'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('id, property_name, address, suburb');
      return data || [];
    },
    enabled: assignOpen,
  });

  const assignedIds = properties.map(p => p.id);
  const unassigned = allProps.filter(p => !assignedIds.includes(p.id));

  const assignMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase.from('client_properties').insert({
        client_id: clientId,
        property_id: propertyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Property assigned');
      onRefresh();
      setAssignOpen(false);
      setSelectedPropId('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase.from('client_properties')
        .delete()
        .eq('client_id', clientId)
        .eq('property_id', propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Property removed');
      onRefresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAndAssign = async () => {
    if (!newPropName.trim()) return;
    const { data: newProp, error } = await supabase.from('properties')
      .insert({ property_name: newPropName.trim(), address: newPropAddress.trim() || null })
      .select('id')
      .single();
    if (error) { toast.error(error.message); return; }
    assignMutation.mutate(newProp.id);
    setNewPropMode(false);
    setNewPropName('');
    setNewPropAddress('');
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-foreground">Assigned Properties</h3>
        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Assign Property
        </Button>
      </div>
      {properties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No properties assigned.</p>
      ) : (
        <div className="space-y-2">
          {properties.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors">
              <Link to={`/properties/${p.id}`} className="flex-1">
                <p className="font-semibold text-foreground">{p.property_name}</p>
                <p className="text-xs text-muted-foreground">{[p.address, p.suburb].filter(Boolean).join(', ')}</p>
              </Link>
              <div className="flex items-center gap-2">
                <Link to={`/properties/${p.id}`}><Badge variant="secondary">View</Badge></Link>
                <Button
                  size="sm" variant="ghost"
                  className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                  onClick={() => { if (confirm('Remove this property from client?')) removeMutation.mutate(p.id); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Assign Property</DialogTitle>
            <DialogDescription>Select an existing property or create a new one.</DialogDescription>
          </DialogHeader>
          {!newPropMode ? (
            <div className="space-y-4">
              <Select value={selectedPropId} onValueChange={setSelectedPropId}>
                <SelectTrigger><SelectValue placeholder="Select a property..." /></SelectTrigger>
                <SelectContent>
                  {unassigned.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.property_name} — {p.address || 'No address'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setNewPropMode(true)} className="text-primary">
                + Create new property
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>Property Name</Label><Input value={newPropName} onChange={e => setNewPropName(e.target.value)} placeholder="e.g. Palm Beach Apartment" /></div>
              <div><Label>Address</Label><Input value={newPropAddress} onChange={e => setNewPropAddress(e.target.value)} placeholder="Street address" /></div>
              <Button variant="ghost" size="sm" onClick={() => setNewPropMode(false)}>← Back to existing</Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            {newPropMode ? (
              <Button onClick={createAndAssign} disabled={!newPropName.trim() || assignMutation.isPending}>
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Create & Assign
              </Button>
            ) : (
              <Button onClick={() => selectedPropId && assignMutation.mutate(selectedPropId)} disabled={!selectedPropId || assignMutation.isPending}>
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Assign
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
