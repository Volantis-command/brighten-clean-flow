import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { UserPlus, Pencil, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

interface ClientMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linked_properties: { property_id: string; property_name: string; guest_ready_sms: boolean; show_invoices: boolean; portal_active: boolean }[];
}

function useClientsList(currentUserId: string | undefined) {
  return useQuery({
    queryKey: ['clients-list', currentUserId],
    queryFn: async () => {
      // Get ALL client_properties rows — this is the source of truth
      const { data: links, error: linksErr } = await supabase.from('client_properties').select('client_id, property_id, guest_ready_sms, show_invoices, portal_active');
      if (linksErr) throw linksErr;
      if (!links?.length) return [];

      // Unique client IDs, excluding current logged-in user
      const uniqueClientIds = [...new Set(links.map(l => l.client_id))].filter(id => id !== currentUserId);
      if (!uniqueClientIds.length) return [];

      // Fetch profiles for those client IDs
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', uniqueClientIds);

      // Get property names
      const propIds = [...new Set(links.map(l => l.property_id))];
      const { data: props } = propIds.length ? await supabase.from('properties').select('id, property_name').in('id', propIds) : { data: [] };
      const propMap: Record<string, string> = {};
      (props || []).forEach((p: any) => { propMap[p.id] = p.property_name; });

      return (profiles || []).map(p => ({
        ...p,
        full_name: p.full_name || p.email || 'No name',
        linked_properties: links.filter(l => l.client_id === p.id).map(l => ({
          property_id: l.property_id,
          property_name: propMap[l.property_id] || 'Unknown',
          guest_ready_sms: l.guest_ready_sms ?? true,
          show_invoices: l.show_invoices ?? false,
          portal_active: l.portal_active ?? true,
        })),
      })) as ClientMember[];
    },
    enabled: !!currentUserId,
  });
}

export default function ClientsSection() {
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading } = useClientsList();
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientMember | null>(null);

  // Create form
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPropertyIds, setCreatePropertyIds] = useState<string[]>([]);

  // All properties for selection
  const { data: allProperties = [] } = useQuery({
    queryKey: ['all-properties-for-clients'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('id, property_name').order('property_name');
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'create_user', email: createEmail, role: 'client', full_name: createName, phone: createPhone, password: createPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Link properties
      if (createPropertyIds.length && data?.user_id) {
        const inserts = createPropertyIds.map(pid => ({
          client_id: data.user_id,
          property_id: pid,
        }));
        await supabase.from('client_properties' as any).insert(inserts as any);
      }
    },
    onSuccess: () => {
      toast.success('Client account created!');
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      setCreateOpen(false);
      setCreateEmail(''); setCreateName(''); setCreatePhone(''); setCreatePassword(''); setCreatePropertyIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleProperty = (propId: string) => {
    setCreatePropertyIds(prev => prev.includes(propId) ? prev.filter(id => id !== propId) : [...prev, propId]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary">Clients</h2>
          <p className="text-sm text-muted-foreground">{clients.length} client account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <UserPlus className="w-5 h-5" /> Add Client
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : clients.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-6 text-center text-muted-foreground">No client accounts yet.</div>
      ) : (
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="bg-card rounded-xl shadow-sm p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{c.full_name || 'No name'}</p>
                  <div className="text-sm text-muted-foreground flex items-center gap-3">
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-800">Client</Badge>
              </div>
              {c.linked_properties.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.linked_properties.map(lp => (
                    <span key={lp.property_id} className="text-xs bg-muted px-2 py-0.5 rounded-full">{lp.property_name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Client Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
            <DialogDescription>Create a client account with portal access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name *</Label><Input value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Jane Smith" /></div>
            <div><Label>Email *</Label><Input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="client@example.com" /></div>
            <div><Label>Temporary Password *</Label><Input type="text" value={createPassword} onChange={e => setCreatePassword(e.target.value)} placeholder="Min 6 characters" /></div>
            <div><Label>Phone *</Label><Input value={createPhone} onChange={e => setCreatePhone(e.target.value)} placeholder="0412 345 678" type="tel" /></div>
            <div>
              <Label>Link Properties</Label>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border border-border rounded-xl p-2">
                {allProperties.map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded-lg">
                    <input type="checkbox" checked={createPropertyIds.includes(p.id)} onChange={() => toggleProperty(p.id)} className="rounded" />
                    {p.property_name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!createEmail || !createName || !createPhone.trim() || !createPassword || createPassword.length < 6 || createMutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
