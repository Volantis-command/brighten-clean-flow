import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Eye, Copy, Send, Loader2, Mail, Phone, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SendQuoteRequestModal from '@/components/clients/SendQuoteRequestModal';
import LeadsTab from '@/components/clients/LeadsTab';
import { getAppBaseUrl } from '@/lib/appUrl';

interface ClientMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linked_properties: { property_id: string; property_name: string; portal_token: string | null }[];
}

function useClientsList(currentUserId?: string) {
  return useQuery({
    queryKey: ['clients-list', currentUserId],
    queryFn: async () => {
      const { data: propertyRows, error: propertiesError } = await supabase
        .from('properties')
        .select('id, property_name, client_name, billing_email, client_phone')
        .or('client_name.not.is.null,billing_email.not.is.null,client_phone.not.is.null')
        .order('property_name');

      if (propertiesError) throw propertiesError;

      const properties = (propertyRows || []) as Array<{
        id: string;
        property_name: string;
        client_name: string | null;
        billing_email: string | null;
        client_phone: string | null;
      }>;

      if (!properties.length) return [];

      const propertyIds = properties.map((property) => property.id);
      const emails = [...new Set(properties.map((property) => property.billing_email?.trim()).filter(Boolean) as string[])];
      const phones = [...new Set(properties.map((property) => property.client_phone?.trim()).filter(Boolean) as string[])];

      const [{ data: clientLinks, error: clientLinksError }, { data: linkedProfiles, error: linkedProfilesError }] = await Promise.all([
        supabase.from('client_properties').select('client_id, property_id, portal_token').in('property_id', propertyIds),
        supabase.from('profiles').select('id, full_name, email, phone').in('id', [
          ...new Set(
            ((await supabase.from('client_properties').select('client_id, property_id').in('property_id', propertyIds)).data || [])
              .map((link) => link.client_id)
              .filter(Boolean)
          ),
        ]),
      ]);

      if (clientLinksError) throw clientLinksError;
      if (linkedProfilesError) throw linkedProfilesError;

      const profileQueries = [] as PromiseLike<{ data: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> | null; error: Error | null }>[];

      if (emails.length) {
        profileQueries.push(
          supabase.from('profiles').select('id, full_name, email, phone').in('email', emails) as PromiseLike<{ data: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> | null; error: Error | null }>
        );
      }

      if (phones.length) {
        profileQueries.push(
          supabase.from('profiles').select('id, full_name, email, phone').in('phone', phones) as PromiseLike<{ data: Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> | null; error: Error | null }>
        );
      }

      const matchedProfileResults = profileQueries.length ? await Promise.all(profileQueries) : [];
      matchedProfileResults.forEach((result) => {
        if (result.error) throw result.error;
      });

      const allProfiles = [
        ...(linkedProfiles || []),
        ...matchedProfileResults.flatMap((result) => result.data || []),
      ];

      const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));
      const profileByEmail = new Map(
        allProfiles
          .filter((profile) => profile.email)
          .map((profile) => [profile.email!.trim().toLowerCase(), profile])
      );
      const profileByPhone = new Map(
        allProfiles
          .filter((profile) => profile.phone)
          .map((profile) => [profile.phone!.trim(), profile])
      );

      const linksByPropertyId = new Map((clientLinks || []).map((link) => [link.property_id, link]));
      const clientsMap = new Map<string, ClientMember>();

      properties.forEach((property) => {
        const directLink = linksByPropertyId.get(property.id);
        const resolvedProfile = (directLink?.client_id ? profileById.get(directLink.client_id) : undefined)
          || (property.billing_email ? profileByEmail.get(property.billing_email.trim().toLowerCase()) : undefined)
          || (property.client_phone ? profileByPhone.get(property.client_phone.trim()) : undefined);

        if (resolvedProfile?.id === currentUserId) {
          return;
        }

        const key = resolvedProfile?.id || `property-${property.id}`;
        const existingClient = clientsMap.get(key);
        const linkedProperty = {
          property_id: property.id,
          property_name: property.property_name || 'Unknown',
          portal_token: directLink?.portal_token ?? null,
        };

        if (existingClient) {
          existingClient.linked_properties.push(linkedProperty);
          return;
        }

        clientsMap.set(key, {
          id: resolvedProfile?.id || key,
          full_name: resolvedProfile?.full_name || property.client_name || null,
          email: resolvedProfile?.email || property.billing_email || null,
          phone: resolvedProfile?.phone || property.client_phone || null,
          linked_properties: [linkedProperty],
        });
      });

      return Array.from(clientsMap.values());
    },
  });
}

const BASE_URL = getAppBaseUrl();

export default function ClientsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading } = useClientsList(user?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardClient, setOnboardClient] = useState<ClientMember | null>(null);
  const [onboardMethod, setOnboardMethod] = useState<'sms' | 'email'>('sms');
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);

  // Create form state
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createClientType, setCreateClientType] = useState('residential');
  
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
      const autoPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!';
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'create_user', email: createEmail, role: 'client', full_name: createName, phone: createPhone, password: autoPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (createPropertyIds.length && data?.user_id) {
        const inserts = createPropertyIds.map(pid => ({ client_id: data.user_id, property_id: pid }));
        await supabase.from('client_properties').insert(inserts);
      }
      // Auto-send onboarding SMS if phone provided
      if (createPhone && data?.user_id) {
        const { data: links } = await supabase.from('client_properties').select('onboard_token').eq('client_id', data.user_id).limit(1);
        const token = links?.[0]?.onboard_token;
        if (token) {
          await supabase.functions.invoke('send-job-sms', {
            body: { to: createPhone, message: `Hi ${createName}, welcome to Brightly! Set up your property portal here: ${BASE_URL}/onboard/${token}` },
          }).catch(() => {});
        }
      }
    },
    onSuccess: () => {
      toast.success('Client account created!');
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      setCreateOpen(false);
      setCreateEmail(''); setCreateName(''); setCreatePhone(''); setCreatePropertyIds([]);
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

  const getClientDisplayName = (client: ClientMember) => {
    const name = client.full_name?.trim();
    return name ? name : (client.email || '—');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} client account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setQuoteRequestOpen(true)} variant="outline" className="font-bold rounded-xl gap-2">
            <FileText className="w-5 h-5" /> Send Quote Request
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
            <UserPlus className="w-5 h-5" /> Add Client
          </Button>
        </div>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList className="w-full grid grid-cols-2 rounded-2xl h-12">
          <TabsTrigger value="clients" className="rounded-xl font-bold">Clients</TabsTrigger>
          <TabsTrigger value="leads" className="rounded-xl font-bold">Leads</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">

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
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/clients/${c.id}`)}>
                  <TableCell className="font-semibold text-primary">{getClientDisplayName(c)}</TableCell>
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
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <LeadsTab />
        </TabsContent>
      </Tabs>

      <SendQuoteRequestModal open={quoteRequestOpen} onOpenChange={setQuoteRequestOpen} />

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
            <div>
              <Label>Client Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { value: 'residential', label: 'Residential', desc: 'One-off or regular, single property, hourly rate' },
                  { value: 'airbnb', label: 'Airbnb / PM', desc: 'Multiple properties, turnovers, linen + consumables' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCreateClientType(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${createClientType === opt.value ? 'border-primary bg-secondary' : 'border-border hover:border-primary/40'}`}
                  >
                    <p className="font-bold text-sm text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
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
              disabled={!createEmail || !createName || createMutation.isPending}
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
