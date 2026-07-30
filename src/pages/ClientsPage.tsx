import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Eye, Copy, Send, Loader2, Mail, Phone, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { sendJobSms } from '@/lib/sendJobSms';
import LeadsTab from '@/components/clients/LeadsTab';
import SavedQuotesList from '@/components/pricing/SavedQuotesList';
import SendQuoteLinkModal from '@/components/dashboard/SendQuoteLinkModal';
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
      // Strategy 1: Get clients via client_properties links
      const { data: allLinks } = await supabase
        .from('client_properties')
        .select('client_id, property_id, portal_token');

      const linksByClientId = new Map<string, Array<{ property_id: string; portal_token: string | null }>>();
      (allLinks || []).forEach((link) => {
        const existing = linksByClientId.get(link.client_id) || [];
        existing.push({ property_id: link.property_id, portal_token: link.portal_token });
        linksByClientId.set(link.client_id, existing);
      });

      // Strategy 2: Get clients via properties with client info
      const { data: propertyRows } = await supabase
        .from('properties')
        .select('id, property_name, client_name, billing_email, client_phone')
        .order('property_name');

      const properties = (propertyRows || []) as Array<{
        id: string;
        property_name: string;
        client_name: string | null;
        billing_email: string | null;
        client_phone: string | null;
      }>;

      const propertyNameMap = new Map(properties.map(p => [p.id, p.property_name]));

      // Get all unique client IDs from links
      const linkedClientIds = [...linksByClientId.keys()];

      // Get profiles for linked clients
      const { data: linkedProfiles } = linkedClientIds.length
        ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', linkedClientIds)
        : { data: [] };

      // Also get client role users
      const { data: clientRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'client');
      const clientRoleIds = (clientRoles || []).map(r => r.user_id);
      const additionalIds = clientRoleIds.filter(id => !linkedClientIds.includes(id));
      const { data: additionalProfiles } = additionalIds.length
        ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', additionalIds)
        : { data: [] };

      const allProfiles = [...(linkedProfiles || []), ...(additionalProfiles || [])];

      const clientsMap = new Map<string, ClientMember>();

      // Add clients from profiles (linked or with client role)
      allProfiles.forEach((profile) => {
        if (profile.id === currentUserId) return;
        const links = linksByClientId.get(profile.id) || [];
        clientsMap.set(profile.id, {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          linked_properties: links.map(l => ({
            property_id: l.property_id,
            property_name: propertyNameMap.get(l.property_id) || 'Unknown',
            portal_token: l.portal_token,
          })),
        });
      });

      // Add clients from properties that have client info but no profile link
      properties.forEach((property) => {
        const hasClient = property.client_name || property.billing_email || property.client_phone;
        if (!hasClient) return;
        // Check if already linked
        const isLinked = [...clientsMap.values()].some(c =>
          c.linked_properties.some(lp => lp.property_id === property.id)
        );
        if (isLinked) return;

        const key = `property-${property.id}`;
        const existing = clientsMap.get(key);
        if (existing) {
          existing.linked_properties.push({
            property_id: property.id,
            property_name: property.property_name,
            portal_token: null,
          });
        } else {
          clientsMap.set(key, {
            id: key,
            full_name: property.client_name,
            email: property.billing_email,
            phone: property.client_phone,
            linked_properties: [{
              property_id: property.id,
              property_name: property.property_name,
              portal_token: null,
            }],
          });
        }
      });

      // Fallback: show accepted/client_accepted quote_requests that have no matching profile
      const { data: acceptedQuotes } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, phone, email, address, status')
        .in('status', ['accepted', 'client_accepted', 'form_submitted', 'quote_sent']);

      (acceptedQuotes || []).forEach((qr) => {
        const qrPhone = qr.phone?.replace(/\s/g, '');
        const qrEmail = qr.email?.toLowerCase();
        // Check if already in the map by phone or email
        const alreadyPresent = [...clientsMap.values()].some(c =>
          (qrPhone && c.phone?.replace(/\s/g, '') === qrPhone) ||
          (qrEmail && c.email?.toLowerCase() === qrEmail)
        );
        if (alreadyPresent) return;

        const key = `qr-${qr.id}`;
        if (!clientsMap.has(key)) {
          clientsMap.set(key, {
            id: key,
            full_name: [qr.first_name, qr.last_name].filter(Boolean).join(' ') || null,
            email: qr.email,
            phone: qr.phone,
            linked_properties: [],
          });
        }
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
  const [deleteClient, setDeleteClient] = useState<ClientMember | null>(null);
  const [onboardMethod, setOnboardMethod] = useState<'sms' | 'email'>('sms');
  const [quoteLinkOpen, setQuoteLinkOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  // Deep link from a lead notification: /clients?lead=<id> opens the Leads tab
  // with that lead's slide-over already showing — no hunting through the list.
  const [searchParams, setSearchParams] = useSearchParams();
  const leadParam = searchParams.get('lead');
  // ?leadPhone= is the fallback for notifications created before lead ids were
  // included in the link — resolves the lead by phone instead.
  const leadPhoneParam = searchParams.get('leadPhone');
  const hasFocus = !!(leadParam || leadPhoneParam);
  const [activeTab, setActiveTab] = useState(hasFocus ? 'leads' : 'clients');
  const [focusLeadId, setFocusLeadId] = useState<string | null>(leadParam);
  const [focusLeadPhone, setFocusLeadPhone] = useState<string | null>(leadPhoneParam);
  useEffect(() => {
    if (leadParam || leadPhoneParam) {
      setFocusLeadId(leadParam);
      setFocusLeadPhone(leadPhoneParam);
      setActiveTab('leads');
    }
  }, [leadParam, leadPhoneParam]);
  const clearFocusLead = useCallback(() => {
    setFocusLeadId(null);
    setFocusLeadPhone(null);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('lead'); p.delete('leadPhone');
      return p;
    }, { replace: true });
  }, [setSearchParams]);
  const filteredClients = clients.filter((c: any) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    return [c.full_name, c.client_name, c.name, c.email, c.phone]
      .filter(Boolean)
      .some((v: any) => String(v).toLowerCase().includes(q));
  });

  // ── Active vs Lead classification ──
  // Active = has ≥1 clean (a linked property with a job), OR manually moved to
  // Active. Lead = no cleans yet, OR manually moved to Leads.
  const { data: cleanedPropertyIds = new Set<string>() } = useQuery({
    queryKey: ['property-ids-with-jobs'],
    queryFn: async () => {
      const { data } = await supabase.from('jobs').select('property_id').not('property_id', 'is', null);
      return new Set((data || []).map((j: any) => j.property_id as string));
    },
  });
  const { data: leadStages = {} as Record<string, string> } = useQuery({
    queryKey: ['client-lead-stages'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, lead_stage').not('lead_stage', 'is', null);
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { if (p.lead_stage) m[p.id] = p.lead_stage; });
      return m;
    },
  });
  const hasCleans = (c: any) => (c.linked_properties || []).some((lp: any) => cleanedPropertyIds.has(lp.property_id));
  const isActiveClient = (c: any) => leadStages[c.id] === 'active' || (hasCleans(c) && leadStages[c.id] !== 'lead');
  const activeClients = filteredClients.filter(isActiveClient);
  const leadClients = filteredClients.filter((c: any) => !isActiveClient(c));

  const setLeadStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: 'active' | 'lead' }) => {
      if (id.startsWith('property-') || id.startsWith('qr-')) {
        throw new Error('Onboard this lead as a client first, then you can move it.');
      }
      const { error } = await supabase.from('profiles').update({ lead_stage: stage } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.stage === 'active' ? 'Moved to Active clients' : 'Moved to Leads');
      queryClient.invalidateQueries({ queryKey: ['client-lead-stages'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      // Auto-generate portal token
      if (data?.user_id) {
        const token = crypto.randomUUID();
        await supabase.from('client_tokens').insert({
          email: createEmail.toLowerCase() || `phone:${createPhone}`,
          token,
          expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(), // effectively never expires
          used: false,
        });
      }
      // Auto-send onboarding SMS if phone provided
      if (createPhone && data?.user_id) {
        const { data: links } = await supabase.from('client_properties').select('onboard_token').eq('client_id', data.user_id).limit(1);
        const token = links?.[0]?.onboard_token;
        if (token) {
          await sendJobSms({
            to: createPhone,
            message: `Hi ${createName}, welcome to Brightly! Set up your property portal here: ${BASE_URL}/quote`,
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

  const ensurePortalToken = async (client: ClientMember): Promise<string | null> => {
    // Check existing token
    const existingToken = client.linked_properties[0]?.portal_token;
    if (existingToken) return `${BASE_URL}/client/${existingToken}`;

    // Auto-generate token for clients with properties but no token
    if (client.linked_properties.length > 0) {
      const newToken = crypto.randomUUID();
      await supabase.from('client_properties')
        .update({ portal_token: newToken })
        .eq('client_id', client.id)
        .eq('property_id', client.linked_properties[0].property_id);
      client.linked_properties[0].portal_token = newToken;
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      return `${BASE_URL}/client/${newToken}`;
    }

    // Generate a client_token for clients without properties
    if (client.email || client.phone) {
      const newToken = crypto.randomUUID();
      await supabase.from('client_tokens').insert({
        email: (client.email || `phone:${client.phone}`).toLowerCase(),
        token: newToken,
        expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        used: false,
      });
      return `${BASE_URL}/client-portal/verify?token=${newToken}`;
    }

    return null;
  };

  const copyPortalLink = async (client: ClientMember) => {
    try {
      const link = await ensurePortalToken(client);
      if (link) {
        navigator.clipboard.writeText(link);
        toast.success(`Portal link copied for ${client.full_name}`);
      } else {
        toast.error('Could not generate portal link for this client');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate link');
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
      const onboardLink = `${BASE_URL}/quote`;

      if (onboardMethod === 'sms' && onboardClient.phone) {
        await sendJobSms({
          to: onboardClient.phone,
          message: `Hi ${onboardClient.full_name}, welcome to Brightly! Complete your onboarding here: ${onboardLink}`,
        });
      } else {
        // Log to notifications for now
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await (await import('@/lib/alerts')).createAlertForUser(user.id, {
            event_type: 'booking_confirmed',
            title: 'Onboarding Sent',
            body: `Onboarding form sent to ${onboardClient.full_name} (${onboardClient.email}) — Link: ${onboardLink}`,
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


  const deleteMutation = useMutation({
    mutationFn: async (c: ClientMember) => {
      const isRealUser = !c.id.startsWith('property-') && !c.id.startsWith('qr-');
      const clientId = c.id;

      // Pseudo-clients come from two places (see useClientsList above):
      //   - `property-<propId>` — a property row that has client_name/email/phone
      //      set but no linked profile.
      //   - `qr-<quoteRequestId>` — an accepted/submitted lead with no profile yet.
      //
      // Previously the `qr-*` branch was a silent no-op that still showed
      // "Client deleted" — the row stayed visible on refresh. Fixed here:
      // each pseudo-client now has a concrete delete action + error check.
      if (!isRealUser) {
        if (c.id.startsWith('property-')) {
          for (const lp of c.linked_properties) {
            const { error } = await supabase
              .from('properties')
              .update({ client_name: null, billing_email: null, client_phone: null })
              .eq('id', lp.property_id);
            if (error) throw new Error(`Failed to clear property client info: ${error.message}`);
          }
          return;
        }

        if (c.id.startsWith('qr-')) {
          const qrId = c.id.replace(/^qr-/, '');
          const { error } = await supabase.from('quote_requests').delete().eq('id', qrId);
          if (error) throw new Error(`Failed to delete lead: ${error.message}`);
          return;
        }

        // Unknown pseudo-client format — fail loud so we don't lie about success.
        throw new Error(`Cannot delete: unrecognised client record (${c.id})`);
      }

      // 1. Delete client_properties links
      const { error: cpErr } = await supabase.from('client_properties').delete().eq('client_id', clientId);
      if (cpErr) throw new Error(`Failed to remove property links: ${cpErr.message}`);

      // 2. Delete client_comms
      await supabase.from('client_comms').delete().eq('client_id', clientId);

      // 3. Delete client_messages
      await supabase.from('client_messages').delete().eq('client_id', clientId);

      // 4. Delete clean_requests
      await supabase.from('clean_requests').delete().eq('client_id', clientId);

      // 5. Delete job_feedback
      await supabase.from('job_feedback').delete().eq('client_id', clientId);

      // 6. Delete notifications
      await supabase.from('notifications').delete().eq('user_id', clientId);

      // 7. Delete user_roles
      await supabase.from('user_roles').delete().eq('user_id', clientId);

      // 8. Delete profile
      const { error: profileErr } = await supabase.from('profiles').delete().eq('id', clientId);
      if (profileErr) throw new Error(`Failed to delete client profile: ${profileErr.message}`);
    },
    onSuccess: () => {
      toast.success('Client deleted');
      setDeleteClient(null);
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-w-0 w-full max-w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} client account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <BackfillOrphansButton onDone={() => queryClient.invalidateQueries({ queryKey: ['clients-list'] })} />
          <Button onClick={() => setQuoteLinkOpen(true)} variant="outline" className="min-h-11 font-bold rounded-xl gap-2">
            <Send className="w-5 h-5" /> Send Quote Request
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="min-h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
            <UserPlus className="w-5 h-5" /> Add Client
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 rounded-2xl h-12">
          <TabsTrigger value="clients" className="rounded-xl font-bold">Clients</TabsTrigger>
          <TabsTrigger value="leads" className="rounded-xl font-bold">Leads</TabsTrigger>
          <TabsTrigger value="quotes" className="rounded-xl font-bold">Quotes</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : clients.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No client accounts yet. Add your first client to get started.</div>
      ) : (
        <>
        <div className="mb-3">
          <Input
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="max-w-sm bg-card"
          />
        </div>
        <div className="space-y-3 md:hidden">
          {activeClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No active clients. New quote leads land in the Leads tab.</div>
          ) : activeClients.map((client) => (
            <article key={client.id} className="min-w-0 rounded-2xl border border-border bg-card p-4">
              <button type="button" onClick={() => navigate(`/clients/${client.id}`)} className="w-full min-w-0 text-left">
                <p className="truncate text-base font-extrabold text-primary">{getClientDisplayName(client)}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{client.email || 'No email'}</p>
                <p className="truncate text-sm text-muted-foreground">{client.phone || 'No phone'}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{client.linked_properties.length} propert{client.linked_properties.length === 1 ? 'y' : 'ies'}</p>
                <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                  {client.linked_properties.slice(0, 3).map((property) => <Badge key={property.property_id} variant="secondary" className="max-w-full truncate text-xs">{property.property_name}</Badge>)}
                  {client.linked_properties.length > 3 && <Badge variant="outline">+{client.linked_properties.length - 3}</Badge>}
                </div>
              </button>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3">
                <Button variant="outline" size="icon" className="h-11 w-full" aria-label={`View ${getClientDisplayName(client)} portal`} onClick={async () => { const link = await ensurePortalToken(client); if (link) window.open(link, '_blank'); else toast.error('Could not generate portal link'); }}><Eye className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-11 w-full" aria-label={`Copy ${getClientDisplayName(client)} portal link`} onClick={() => copyPortalLink(client)}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-11 w-full" aria-label={`Send onboarding to ${getClientDisplayName(client)}`} onClick={() => openOnboardModal(client)}><Send className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-11 w-full text-destructive" aria-label={`Delete ${getClientDisplayName(client)}`} onClick={() => setDeleteClient(client)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <button onClick={() => setLeadStageMutation.mutate({ id: client.id, stage: 'lead' })} className="mt-2 w-full text-xs font-semibold text-muted-foreground hover:text-foreground">↓ Move to Leads</button>
            </article>
          ))}
        </div>
        <div className="hidden bg-card rounded-2xl shadow-md border border-border overflow-x-auto md:block">
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
              {activeClients.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No active clients. New quote leads land in the Leads tab.</TableCell></TableRow>
              ) : activeClients.map(c => (
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
                      <span className="text-xs text-primary cursor-pointer hover:underline" onClick={async (e) => { e.stopPropagation(); await copyPortalLink(c); }}>Generate link</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const link = await ensurePortalToken(c);
                          if (link) window.open(link, '_blank');
                          else toast.error('Could not generate portal link');
                        }}
                        title="View Portal"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); copyPortalLink(c); }} title="Copy Portal Link">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openOnboardModal(c)} title="Send Onboarding Form">
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs font-semibold text-muted-foreground" onClick={(e) => { e.stopPropagation(); setLeadStageMutation.mutate({ id: c.id, stage: 'lead' }); }} title="Move to Leads">↓ Lead</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteClient(c); }} title="Delete Client">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
        </TabsContent>

        <TabsContent value="leads" className="mt-4 space-y-4">
          {leadClients.length > 0 && (
            <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-sm font-bold text-muted-foreground uppercase tracking-wide">Clients not yet cleaning ({leadClients.length})</div>
              <div className="divide-y divide-border">
                {leadClients.map((c: any) => {
                  const movable = !c.id.startsWith('property-') && !c.id.startsWith('qr-');
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                        <p className="truncate font-semibold text-primary">{getClientDisplayName(c)}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email || 'No email'} · {c.phone || 'No phone'}</p>
                      </div>
                      {movable ? (
                        <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => setLeadStageMutation.mutate({ id: c.id, stage: 'active' })}>↑ Move to Active</Button>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">Onboard first</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <LeadsTab focusLeadId={focusLeadId} focusLeadPhone={focusLeadPhone} onFocusHandled={clearFocusLead} />
        </TabsContent>

        <TabsContent value="quotes" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-lg font-extrabold text-primary">Sent quotes</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Every quote you've sent from the Quote Builder — with its link and status. New quotes also appear in <span className="font-semibold text-foreground">Leads</span> as “Quote sent”.
            </p>
          </div>
          <SavedQuotesList onEdit={() => {}} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteClient} onOpenChange={(o) => { if (!o) setDeleteClient(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteClient && (deleteClient.full_name || deleteClient.email || 'this client')}</strong> and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteClient && deleteMutation.mutate(deleteClient)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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

      <SendQuoteLinkModal open={quoteLinkOpen} onOpenChange={setQuoteLinkOpen} />
    </div>
  );
}

// Admin button that calls the backfill-orphan-clients edge function.
// Turns orphan quote_requests (leads with no profile / property) into real
// client records with properties linked. Idempotent — safe to run repeatedly.
// One-shot migration tool, kept in the UI so Brendan can re-run if new
// orphans appear later.
function BackfillOrphansButton({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-orphan-clients', { body: {} });
      if (error) throw error;
      const r = data as any;
      toast.success(
        `Backfill done: ${r?.created ?? 0} created, ${r?.skipped_existing_profile ?? 0} already had profiles, ${r?.skipped_no_contact ?? 0} skipped (no contact), ${r?.errors?.length ?? 0} errors`,
        { duration: 8000 }
      );
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Backfill failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button onClick={run} disabled={running} variant="outline" className="font-bold rounded-xl gap-2">
      {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
      Backfill Orphan Clients
    </Button>
  );
}
