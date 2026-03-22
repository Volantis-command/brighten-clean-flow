import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Eye, Copy, Send, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ClientMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linked_properties: { property_id: string; property_name: string; portal_token: string | null }[];
}

function useClientsList() {
  return useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase.from('user_roles').select('user_id, role').eq('role', 'client');
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', userIds);

      const { data: links } = await supabase.from('client_properties').select('client_id, property_id, portal_token, portal_active, onboard_token').in('client_id', userIds);

      const propIds = [...new Set((links || []).map(l => l.property_id))];
      const { data: props } = propIds.length ? await supabase.from('properties').select('id, property_name').in('id', propIds) : { data: [] };
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });

      return (profiles || []).map(p => ({
        ...p,
        linked_properties: (links || []).filter(l => l.client_id === p.id).map(l => ({
          property_id: l.property_id,
          property_name: propMap[l.property_id] || 'Unknown',
          portal_token: l.portal_token,
        })),
      })) as ClientMember[];
    },
  });
}

const BASE_URL = window.location.origin;

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading } = useClientsList();
  const [createOpen, setCreateOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardClient, setOnboardClient] = useState<ClientMember | null>(null);
  const [onboardMethod, setOnboardMethod] = useState<'sms' | 'email'>('sms');

  // Create form state
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPropertyIds, setCreatePropertyIds] = useState<string[]>([]);

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
      if (createPropertyIds.length && data?.user_id) {
        const inserts = createPropertyIds.map(pid => ({ client_id: data.user_id, property_id: pid }));
        await supabase.from('client_properties').insert(inserts);
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

  const getPortalLink = (client: ClientMember) => {
    const token = client.linked_properties[0]?.portal_token;
    return token ? `${BASE_URL}/client/${token}` : null;
  };

  const copyPortalLink = (client: ClientMember) => {
    const link = getPortalLink(client);
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success(`Portal link copied for ${client.full_name}`);
    } else {
      toast.error('No portal token found for this client');
    }
  };

  const openOnboardModal = (client: ClientMember) => {
    setOnboardClient(client);
    setOnboardMethod('sms');
    setOnboardOpen(true);
  };

  const sendOnboardingMutation = useMutation({
    mutationFn: async () => {
      if (!onboardClient) return;
      const token = onboardClient.linked_properties[0]?.portal_token;
      const onboardLink = `${BASE_URL}/onboard/${token || 'new'}`;

      if (onboardMethod === 'sms' && onboardClient.phone) {
        await supabase.functions.invoke('send-job-sms', {
          body: {
            to: onboardClient.phone,
            message: `Hi ${onboardClient.full_name}, welcome to Brightly! Complete your onboarding here: ${onboardLink}`,
          },
        });
      } else {
        // Log to notifications for now
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('notifications').insert({
            user_id: user.id,
            message: `Onboarding form sent to ${onboardClient.full_name} (${onboardClient.email}) — Link: ${onboardLink}`,
            type: 'onboarding',
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(`Onboarding form sent to ${onboardClient?.full_name}`);
      setOnboardOpen(false);
      setOnboardClient(null);
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
          <h1 className="text-2xl font-extrabold text-primary">Clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} client account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <UserPlus className="w-5 h-5" /> Add Client
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : clients.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No client accounts yet. Add your first client to get started.</div>
      ) : (
        <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Properties</TableHead>
                <TableHead>Portal Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.linked_properties.length > 0
                        ? c.linked_properties.map(lp => (
                            <Badge key={lp.property_id} variant="secondary" className="text-xs">{lp.property_name}</Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">None</span>
                      }
                    </div>
                  </TableCell>
                  <TableCell>
                    {getPortalLink(c) ? (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{getPortalLink(c)}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No token</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const link = getPortalLink(c);
                          if (link) window.open(link, '_blank');
                          else toast.error('No portal link available');
                        }}
                        title="View Portal"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => copyPortalLink(c)} title="Copy Portal Link">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openOnboardModal(c)} title="Send Onboarding Form">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Send Onboarding Modal */}
      <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Send Onboarding Form</DialogTitle>
            <DialogDescription>Send the onboarding link to {onboardClient?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Name:</span> <span className="font-semibold">{onboardClient?.full_name}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span className="font-semibold">{onboardClient?.email || '—'}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> <span className="font-semibold">{onboardClient?.phone || '—'}</span></div>
            </div>

            <div>
              <Label className="mb-2 block">Send via</Label>
              <Tabs value={onboardMethod} onValueChange={v => setOnboardMethod(v as 'sms' | 'email')}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="sms" className="gap-1.5"><Phone className="w-4 h-4" /> SMS</TabsTrigger>
                  <TabsTrigger value="email" className="gap-1.5"><Mail className="w-4 h-4" /> Email</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="bg-muted rounded-xl p-3 text-sm">
              <p className="text-muted-foreground text-xs mb-1 font-semibold">Message preview:</p>
              <p>Hi {onboardClient?.full_name}, welcome to Brightly! Complete your onboarding here: {BASE_URL}/onboard/...</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOnboardOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendOnboardingMutation.mutate()}
              disabled={sendOnboardingMutation.isPending || (onboardMethod === 'sms' && !onboardClient?.phone)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2"
            >
              {sendOnboardingMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Send {onboardMethod === 'sms' ? 'SMS' : 'Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div><Label>Phone</Label><Input value={createPhone} onChange={e => setCreatePhone(e.target.value)} placeholder="0412 345 678" /></div>
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
              disabled={!createEmail || !createName || !createPassword || createPassword.length < 6 || createMutation.isPending}
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
