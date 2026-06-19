import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Star, Check, X, Send, Loader2, MessageSquare, CalendarPlus, BedDouble, Bath, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAppBaseUrl } from '@/lib/appUrl';
import { createPropertyAndLink } from '@/lib/propertyWrites';
import { sendJobSms } from '@/lib/sendJobSms';

import ClientHeader from '@/components/client-detail/ClientHeader';
import PortalLinkSection from '@/components/client-detail/PortalLinkSection';
import OnboardingStatusSection from '@/components/client-detail/OnboardingStatusSection';
import HostawayIntegrationSection from '@/components/client-detail/HostawayIntegrationSection';
import EditClientDialog from '@/components/client-detail/EditClientDialog';
import ScheduleCleanModal from '@/components/client-detail/ScheduleCleanModal';
import ClientCommsLog from '@/components/client-detail/ClientCommsLog';

/** Strip synthetic prefixes used for pseudo-clients */
function stripPseudoPrefix(id: string) {
  if (id.startsWith('property-')) return { type: 'property' as const, realId: id.replace('property-', '') };
  if (id.startsWith('qr-')) return { type: 'qr' as const, realId: id.replace('qr-', '') };
  return { type: 'profile' as const, realId: id };
}

function useClientDetail(rawId: string) {
  const parsed = stripPseudoPrefix(rawId);

  return useQuery({
    queryKey: ['client-detail', rawId],
    queryFn: async () => {
      if (parsed.type === 'property') {
        const { data: prop } = await supabase.from('properties').select('*').eq('id', parsed.realId).single();
        if (!prop) return { profile: null, links: [], properties: [], pseudoType: 'property' as const };

        // Check if there's a client_properties link for this property (to get portal_token etc.)
        const { data: cpLinks } = await supabase.from('client_properties').select('*').eq('property_id', parsed.realId);

        const pseudoProfile = {
          id: rawId,
          full_name: prop.client_name || prop.property_name,
          email: (prop as any).billing_email || null,
          phone: (prop as any).client_phone || null,
        };

        // If there's a client_properties link, use that client_id for portal operations
        const effectiveClientId = cpLinks?.[0]?.client_id || null;

        return {
          profile: pseudoProfile,
          links: cpLinks || [],
          properties: [prop],
          pseudoType: 'property' as const,
          effectiveClientId,
        };
      }

      if (parsed.type === 'qr') {
        const { data: qr } = await (supabase.from('quote_requests' as any).select('*').eq('id', parsed.realId).single() as any);
        const pseudoProfile = qr ? {
          id: rawId,
          full_name: [qr.first_name, qr.last_name].filter(Boolean).join(' ') || null,
          email: qr.email || null,
          phone: qr.phone || null,
        } : null;

        // Try to find properties matching address
        let properties: any[] = [];
        if (qr?.address) {
          const { data: matchedProps } = await supabase.from('properties').select('*').ilike('address', `%${qr.address}%`);
          properties = matchedProps || [];
        }

        // Try to find client_properties links for matched properties
        let links: any[] = [];
        if (properties.length > 0) {
          const propIds = properties.map(p => p.id);
          const { data: cpLinks } = await supabase.from('client_properties').select('*').in('property_id', propIds);
          links = cpLinks || [];
        }

        // Also check if qr has a converted_client_id
        const effectiveClientId = qr?.converted_client_id || links?.[0]?.client_id || null;

        // If there's a converted client, also fetch their client_properties
        if (effectiveClientId && links.length === 0) {
          const { data: cpLinks } = await supabase.from('client_properties').select('*').eq('client_id', effectiveClientId);
          links = cpLinks || [];
          if (links.length > 0 && properties.length === 0) {
            const propIds = links.map(l => l.property_id);
            const { data: linkedProps } = await supabase.from('properties').select('*').in('id', propIds);
            properties = linkedProps || [];
          }
        }

        return { profile: pseudoProfile, links, properties, pseudoType: 'qr' as const, effectiveClientId };
      }

      // Real profile-based client
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', parsed.realId).single();
      const { data: links } = await supabase.from('client_properties').select('*').eq('client_id', parsed.realId);
      const propIds = (links || []).map(l => l.property_id);
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('*').in('id', propIds)
        : { data: [] };
      return { profile, links: links || [], properties: props || [], pseudoType: 'profile' as const, effectiveClientId: parsed.realId };
    },
    enabled: !!rawId,
  });
}

function useClientJobs(propertyIds: string[], clientName: string | null) {
  return useQuery({
    queryKey: ['client-jobs', propertyIds, clientName],
    queryFn: async () => {
      const validPropIds = propertyIds.filter(Boolean);
      let allJobs: any[] = [];

      if (validPropIds.length > 0) {
        const { data } = await supabase
          .from('jobs')
          .select('id, scheduled_date, scheduled_time, status, invoice_status, property_id, cleaner_1_id, notes')
          .in('property_id', validPropIds)
          .order('scheduled_date', { ascending: false });
        allJobs = data || [];
      }

      if (clientName) {
        const { data: nameJobs } = await (supabase
          .from('jobs')
          .select('id, scheduled_date, scheduled_time, status, invoice_status, property_id, cleaner_1_id, notes') as any)
          .eq('client_name', clientName)
          .order('scheduled_date', { ascending: false });
        const existingIds = new Set(allJobs.map(j => j.id));
        (nameJobs || []).forEach(j => { if (!existingIds.has(j.id)) allJobs.push(j); });
      }

      if (allJobs.length === 0) return [];

      const jobPropIds = [...new Set(allJobs.map(j => j.property_id).filter(Boolean))] as string[];
      const { data: props } = jobPropIds.length
        ? await supabase.from('properties').select('id, property_name').in('id', jobPropIds)
        : { data: [] };
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });

      const cleanerIds = [...new Set(allJobs.map(j => j.cleaner_1_id).filter(Boolean))] as string[];
      const { data: cleaners } = cleanerIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', cleanerIds)
        : { data: [] };
      const cleanerMap: Record<string, string> = {};
      (cleaners || []).forEach(c => { cleanerMap[c.id] = c.full_name || ''; });
      return allJobs.map(j => ({
        ...j,
        property_name: propMap[j.property_id || ''] || '',
        cleaner_name: cleanerMap[j.cleaner_1_id || ''] || '—',
      }));
    },
    enabled: propertyIds.length > 0 || !!clientName,
  });
}

function useClientFeedback(propertyIds: string[]) {
  return useQuery({
    queryKey: ['client-feedback', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('job_feedback').select('*').in('property_id', propertyIds)
        .order('submitted_at', { ascending: false });
      const { data: props } = await supabase.from('properties').select('id, property_name').in('id', propertyIds);
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });
      return (data || []).map(f => ({ ...f, property_name: propMap[f.property_id || ''] || '' }));
    },
    enabled: propertyIds.length > 0,
  });
}

function useClientRequests(clientId: string) {
  const parsed = stripPseudoPrefix(clientId);
  return useQuery({
    queryKey: ['client-requests', clientId],
    queryFn: async () => {
      if (parsed.type !== 'profile') return [];
      const { data } = await supabase.from('clean_requests').select('*').eq('client_id', parsed.realId).order('created_at', { ascending: false });
      const propIds = [...new Set((data || []).map(r => r.property_id).filter(Boolean))] as string[];
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, property_name').in('id', propIds)
        : { data: [] };
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });
      return (data || []).map(r => ({ ...r, property_name: propMap[r.property_id || ''] || '' }));
    },
    enabled: !!clientId,
  });
}

function useClientMessages(clientId: string) {
  const parsed = stripPseudoPrefix(clientId);
  return useQuery({
    queryKey: ['client-messages', clientId],
    queryFn: async () => {
      if (parsed.type !== 'profile') return [];
      const { data } = await supabase.from('client_messages').select('*').eq('client_id', parsed.realId).order('sent_at', { ascending: true });
      return data || [];
    },
    enabled: !!clientId,
  });
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useClientDetail(id!);
  const propertyIds = (data?.properties || []).map((p: any) => p.id);
  const isRealProfile = data?.pseudoType === 'profile';

  const { data: jobs = [] } = useClientJobs(propertyIds, data?.profile?.full_name || null);
  const { data: feedback = [] } = useClientFeedback(propertyIds);
  const { data: requests = [] } = useClientRequests(id!);
  const { data: messages = [] } = useClientMessages(id!);

  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [weeklyInvoice, setWeeklyInvoice] = useState(false);
  const [weeklyInvoiceLoaded, setWeeklyInvoiceLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePropertyId, setSchedulePropertyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingPortalLink, setSendingPortalLink] = useState(false);

  if (data?.profile && !notesLoaded) {
    setNotes((data.profile as any).internal_notes || '');
    setNotesLoaded(true);
  }
  if (data?.profile && !weeklyInvoiceLoaded) {
    setWeeklyInvoice(!!(data.profile as any).weekly_invoice);
    setWeeklyInvoiceLoaded(true);
  }

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['client-detail', id] });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const { error } = await supabase.from('clean_requests').update({ status }).eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Request updated'); queryClient.invalidateQueries({ queryKey: ['client-requests', id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      const parsed = stripPseudoPrefix(id!);
      if (!replyText.trim() || parsed.type !== 'profile') return;
      const { error } = await supabase.from('client_messages').insert({ client_id: parsed.realId, message: replyText.trim(), direction: 'outbound' });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['client-messages', id] });
      toast.success('Reply sent');
    },
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const profile = data.profile;
  const firstLink = data.links[0];
  const parsed = stripPseudoPrefix(id!);

  // The client ID to use for portal/link operations (may differ from parsed.realId for pseudo-clients)
  const portalClientId = data.effectiveClientId || parsed.realId;

  const statusColor = (s: string) => {
    if (s === 'complete' || s === 'completed') return 'bg-brightly/10 text-brightly';
    if (s === 'in_progress') return 'bg-yellow-100 text-yellow-800';
    if (s === 'scheduled') return 'bg-blue-100 text-blue-800';
    return 'bg-muted text-muted-foreground';
  };

  const invoiceColor = (s: string | null) => {
    if (s === 'paid') return 'bg-brightly/10 text-brightly';
    if (s === 'sent') return 'bg-blue-100 text-blue-800';
    if (s === 'draft') return 'bg-yellow-100 text-yellow-800';
    return 'bg-muted text-muted-foreground';
  };

  const handleSendPortalLink = async () => {
    if (!profile?.phone) { toast.error('No phone number on file'); return; }
    setSendingPortalLink(true);
    try {
      const baseUrl = getAppBaseUrl();
      const msg = `Hi ${profile?.full_name?.split(' ')[0] || 'there'}, view your Brightly clean history here: ${baseUrl}/client-portal — Your team at Brightly`;
      await sendJobSms({ to: profile.phone, message: msg });
      toast.success('Portal login link sent via SMS');
    } catch (err: any) {
      toast.error('Failed to send: ' + err.message);
    }
    setSendingPortalLink(false);
  };

  const openBookClean = (propertyId?: string) => {
    setSchedulePropertyId(propertyId || null);
    setScheduleOpen(true);
  };

  const scheduleProperties = schedulePropertyId
    ? data.properties.filter((p: any) => p.id === schedulePropertyId).map((p: any) => ({ id: p.id, property_name: p.property_name, address: p.address, default_price: p.default_price, price_includes_gst: p.price_includes_gst }))
    : data.properties.map((p: any) => ({ id: p.id, property_name: p.property_name, address: p.address, default_price: p.default_price, price_includes_gst: p.price_includes_gst }));

  return (
    <div className="space-y-6">
      {/* UNIFIED HEADER — always shows Schedule a Clean + Edit */}
      <ClientHeader
        name={profile?.full_name || 'Client'}
        email={profile?.email}
        phone={profile?.phone}
        onBack={() => navigate('/clients')}
        onEdit={() => setEditOpen(true)}
        onScheduleClean={() => openBookClean()}
      />

      <ScheduleCleanModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        clientId={portalClientId}
        clientName={profile?.full_name || 'Client'}
        properties={scheduleProperties}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-6 bg-muted rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="properties" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Properties</TabsTrigger>
          <TabsTrigger value="jobs" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Jobs</TabsTrigger>
          <TabsTrigger value="feedback" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Feedback</TabsTrigger>
          <TabsTrigger value="requests" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Requests</TabsTrigger>
          <TabsTrigger value="messages" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Messages</TabsTrigger>
        </TabsList>

        {/* ======================= OVERVIEW — SAME FOR ALL CLIENT TYPES ======================= */}
        <TabsContent value="overview" className="space-y-6 mt-4">

          {/* 1. PROPERTIES SECTION — always shown */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground">Properties</h3>
              <AssignPropertyButton clientId={portalClientId} onRefresh={refreshAll} />
            </div>
            {data.properties.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-3">No properties yet</p>
                <AssignPropertyButton clientId={portalClientId} onRefresh={refreshAll} variant="outline" />
              </div>
            ) : (
              <div className="space-y-2">
                {data.properties.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors">
                    <Link to={`/properties/${p.id}`} className="flex-1">
                      <p className="font-semibold text-foreground">{p.property_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.address, p.suburb].filter(Boolean).join(', ') || 'No address on file'}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => openBookClean(p.id)} className="bg-primary text-primary-foreground gap-1">
                        <CalendarPlus className="w-3.5 h-3.5" /> Book Clean
                      </Button>
                      <Link to={`/properties/${p.id}`}><Badge variant="secondary">View</Badge></Link>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                        onClick={async () => {
                          if (!confirm('Remove this property from client?')) return;
                          const { error } = await supabase.from('client_properties')
                            .delete()
                            .eq('client_id', portalClientId)
                            .eq('property_id', p.id);
                          if (error) { toast.error(error.message); return; }
                          toast.success('Property removed');
                          refreshAll();
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. MAGIC LINK PORTAL URL — always shown */}
          <PortalLinkSection
            clientId={portalClientId}
            portalToken={firstLink?.portal_token || null}
            portalLinkSentAt={(firstLink as any)?.portal_link_sent_at || null}
            linkCreatedAt={firstLink?.created_at || null}
            phone={profile?.phone || null}
            email={profile?.email || null}
            clientName={profile?.full_name || ''}
            propertyIds={propertyIds}
            onRefresh={refreshAll}
          />

          {/* 3. CLIENT PORTAL ACCESS — always shown */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-foreground mb-3">Client Portal Access</h3>
            <p className="text-sm text-muted-foreground mb-3">Send the client an SMS with a link to log into their portal and view clean history.</p>
            <Button
              onClick={handleSendPortalLink}
              disabled={sendingPortalLink || !profile?.phone}
              variant="outline"
              className="gap-2"
            >
              {sendingPortalLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              Send Portal Login Link
            </Button>
            {!profile?.phone && <p className="text-xs text-muted-foreground mt-2">Add a phone number to enable SMS.</p>}
          </div>

          {/* HOSTAWAY INTEGRATION — only for real profiles */}
          {isRealProfile && portalClientId && (
            <HostawayIntegrationSection clientId={portalClientId} />
          )}

          {/* 4. ONBOARDING — always shown */}
          <OnboardingStatusSection
            clientId={portalClientId}
            onboardToken={firstLink?.onboard_token || null}
            onboardUsed={firstLink?.onboard_used || false}
            onboardingSentAt={(firstLink as any)?.onboarding_sent_at || null}
            phone={profile?.phone || null}
            email={profile?.email || null}
            clientName={profile?.full_name || ''}
            properties={data.properties}
            onRefresh={refreshAll}
          />

          {/* 5. BILLING SETTINGS + INTERNAL NOTES — only for real profiles */}
          {isRealProfile && (
            <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
              <div>
                <h3 className="font-bold text-foreground mb-3">Billing</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Weekly invoice (Monday)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      All cleans Mon–Sun batched onto one invoice each Monday. Disables per-job auto-invoicing.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={weeklyInvoice}
                    onClick={async () => {
                      const next = !weeklyInvoice;
                      setWeeklyInvoice(next);
                      const { error } = await supabase
                        .from('profiles')
                        .update({ weekly_invoice: next } as any)
                        .eq('id', parsed.realId);
                      if (error) {
                        setWeeklyInvoice(!next);
                        toast.error('Failed to update billing setting');
                      } else {
                        toast.success(next ? 'Weekly invoicing enabled' : 'Weekly invoicing disabled');
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${weeklyInvoice ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${weeklyInvoice ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="font-bold text-foreground mb-2">Internal Notes</h3>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add internal notes about this client..." rows={4} className="rounded-xl" />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    const { error } = await supabase.from('profiles').update({ internal_notes: notes } as any).eq('id', parsed.realId);
                    if (error) { toast.error('Failed to save notes'); return; }
                    toast.success('Notes saved');
                  }}
                >
                  Save Notes
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* PROPERTIES TAB */}
        <TabsContent value="properties" className="mt-4">
          {data.properties.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <p className="text-4xl mb-3">🏠</p>
              <p className="text-muted-foreground mb-3">No properties yet</p>
              <AssignPropertyButton clientId={portalClientId} onRefresh={refreshAll} variant="outline" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.properties.map((p: any) => (
                <div key={p.id} className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <Link to={`/properties/${p.id}`} className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                        {p.property_name}
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {[p.address, p.suburb].filter(Boolean).join(', ') || 'No address on file'}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${p.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><BedDouble className="w-4 h-4" /> {p.bedrooms || 0} bed</span>
                    <span className="flex items-center gap-1"><Bath className="w-4 h-4" /> {p.bathrooms || 0} bath</span>
                    {p.property_type && <Badge variant="secondary" className="text-xs">{p.property_type}</Badge>}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => openBookClean(p.id)} className="bg-primary text-primary-foreground gap-1.5 flex-1">
                      <CalendarPlus className="w-4 h-4" /> Book Clean
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/properties/${p.id}`)}>
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* JOBS */}
        <TabsContent value="jobs" className="mt-4">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {jobs.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No jobs found for this client's properties.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Property</TableHead><TableHead>Cleaner</TableHead><TableHead>Status</TableHead><TableHead>Invoice</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {jobs.map((j: any) => (
                    <TableRow key={j.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <TableCell className="font-medium">{format(new Date(j.scheduled_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{j.property_name}</TableCell>
                      <TableCell>{j.cleaner_name}</TableCell>
                      <TableCell><Badge className={statusColor(j.status)}>{j.status}</Badge></TableCell>
                      <TableCell><Badge className={invoiceColor(j.invoice_status)}>{j.invoice_status || 'none'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* FEEDBACK */}
        <TabsContent value="feedback" className="mt-4">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {feedback.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No feedback submitted yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Property</TableHead><TableHead>Rating</TableHead><TableHead>Comments</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {feedback.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.submitted_at ? format(new Date(f.submitted_at), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{f.property_name}</TableCell>
                      <TableCell><div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /><span className="font-bold">{f.score || '—'}/10</span></div></TableCell>
                      <TableCell className="max-w-[300px] truncate">{f.comments || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* REQUESTS */}
        <TabsContent value="requests" className="mt-4">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {requests.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No clean requests submitted.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Submitted</TableHead><TableHead>Property</TableHead><TableHead>Requested Date</TableHead><TableHead>Clean Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {requests.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{r.property_name}</TableCell>
                      <TableCell>{r.requested_date ? format(new Date(r.requested_date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{r.clean_type || '—'}</TableCell>
                      <TableCell>
                        <Badge className={r.status === 'approved' ? 'bg-brightly/10 text-brightly' : r.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="text-brightly hover:bg-brightly/10" onClick={() => updateRequestMutation.mutate({ requestId: r.id, status: 'approved' })} disabled={updateRequestMutation.isPending}>
                              <Check className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-100" onClick={() => updateRequestMutation.mutate({ requestId: r.id, status: 'declined' })} disabled={updateRequestMutation.isPending}>
                              <X className="w-4 h-4 mr-1" /> Decline
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* MESSAGES */}
        <TabsContent value="messages" className="mt-4">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No messages yet.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {messages.map((m: any) => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${m.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                      <p>{m.message}</p>
                      <p className={`text-[10px] mt-1 ${m.direction === 'outbound' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {m.sent_at ? format(new Date(m.sent_at), 'dd MMM, HH:mm') : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isRealProfile && (
              <div className="flex gap-2">
                <Input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type a reply..."
                  onKeyDown={e => e.key === 'Enter' && !sendReplyMutation.isPending && replyText.trim() && sendReplyMutation.mutate()} />
                <Button onClick={() => sendReplyMutation.mutate()} disabled={!replyText.trim() || sendReplyMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ClientCommsLog clientId={portalClientId} />

      <EditClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clientId={parsed.realId}
        initialName={profile?.full_name || ''}
        initialEmail={profile?.email || ''}
        initialPhone={profile?.phone || ''}
        initialLogoUrl={(profile as any)?.logo_url || ''}
        onSaved={refreshAll}
        clientType={parsed.type}
        propertyIds={propertyIds}
        allowDelete={isRealProfile}
      />
    </div>
  );
}

/** Small helper component to keep the "Assign Property" button DRY */
function AssignPropertyButton({ clientId, onRefresh, variant = 'default' }: { clientId: string; onRefresh: () => void; variant?: 'default' | 'outline' }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="w-4 h-4" /> Add Property
      </Button>
      {open && (
        <AssignPropertyInline clientId={clientId} onRefresh={() => { onRefresh(); setOpen(false); }} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Inline create + assign property form */
function AssignPropertyInline({ clientId, onRefresh, onClose }: { clientId: string; onRefresh: () => void; onClose: () => void }) {
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [saving, setSaving] = useState(false);

  // Create-new fields
  const [propertyName, setPropertyName] = useState('');
  const [address, setAddress] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [clientType, setClientType] = useState('residential');

  // Assign-existing fields
  const [selectedId, setSelectedId] = useState('');
  const { data: allProps = [] } = useQuery({
    queryKey: ['all-properties-for-assign-inline'],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('id, property_name, address');
      return data || [];
    },
  });

  // Pre-fill property name AND copy client contact details onto the new
  // property (so the property profile form isn't blank when the user opens
  // it after creation). Fixed 2026-04-22 — previously only property_name
  // was prefilled and the client_name/billing_email/client_phone columns
  // on `properties` were left null, leaving those fields blank in the form.
  const { data: clientProfile } = useQuery({
    queryKey: ['client-profile-for-prop', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', clientId)
        .maybeSingle();
      return data;
    },
  });
  useState(() => {
    if (clientProfile?.full_name && !propertyName) {
      setPropertyName(`${clientProfile.full_name.split(' ')[0]}'s Property`);
    }
  });

  const handleCreate = async () => {
    if (!address.trim()) { toast.error('Address is required'); return; }
    setSaving(true);
    try {
      const name = propertyName.trim() || `${address.split(',')[0]}`;

      // Use the canonical propertyWrites helper (audit S3). Every new
      // property-creation call site should go through this. Handles both
      // the properties insert and the client_properties junction link.
      await createPropertyAndLink(clientId, {
        property_name: name,
        address: address.trim(),
        bedrooms: parseInt(bedrooms) || null,
        bathrooms: parseInt(bathrooms) || null,
        client_type: clientType,
        status: 'active',
        client_name: clientProfile?.full_name || null,
        billing_email: clientProfile?.email || null,
        client_phone: clientProfile?.phone || null,
      });

      toast.success('Property created and linked ✓');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create property');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await supabase.from('client_properties').insert({ client_id: clientId, property_id: selectedId } as any);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Property assigned ✓');
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-foreground">Add Property</h3>

        {/* Mode toggle */}
        <div className="flex gap-2 bg-muted rounded-xl p-1">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 text-sm font-bold py-2 rounded-lg transition-colors ${mode === 'create' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Create New
          </button>
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 text-sm font-bold py-2 rounded-lg transition-colors ${mode === 'existing' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            Link Existing
          </button>
        </div>

        {mode === 'create' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase">Property Name</label>
              <Input value={propertyName} onChange={e => setPropertyName(e.target.value)} placeholder="e.g. Lynn's Apartment" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase">Address *</label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 6 La Scala Court, Surfers Paradise" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase">Bedrooms</label>
                <Input type="number" min="0" value={bedrooms} onChange={e => setBedrooms(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase">Bathrooms</label>
                <Input type="number" min="0" value={bathrooms} onChange={e => setBathrooms(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase">Type</label>
              <select
                value={clientType}
                onChange={e => setClientType(e.target.value)}
                className="w-full rounded-xl border border-border bg-background text-foreground p-2.5 mt-1 text-sm"
              >
                <option value="residential">Residential</option>
                <option value="airbnb">Airbnb / Short-Stay</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving || !address.trim()} className="bg-brightly hover:bg-brightly-hover text-white font-bold">
                {saving ? 'Creating...' : 'Create & Link'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              className="w-full rounded-xl border border-border bg-background text-foreground p-3"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">Select a property...</option>
              {allProps.map(p => (
                <option key={p.id} value={p.id}>{p.property_name} — {p.address || 'No address'}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleAssign} disabled={!selectedId || saving}>
                {saving ? 'Linking...' : 'Link Property'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
