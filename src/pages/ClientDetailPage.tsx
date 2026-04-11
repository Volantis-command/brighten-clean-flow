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
import { Star, Check, X, Send, Loader2, MessageSquare, CalendarPlus, BedDouble, Bath } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAppBaseUrl } from '@/lib/appUrl';

import ClientHeader from '@/components/client-detail/ClientHeader';
import PortalLinkSection from '@/components/client-detail/PortalLinkSection';
import OnboardingStatusSection from '@/components/client-detail/OnboardingStatusSection';
import AssignedPropertiesSection from '@/components/client-detail/AssignedPropertiesSection';
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
        // Pseudo-client derived from a property record
        const { data: prop } = await supabase.from('properties').select('*').eq('id', parsed.realId).single();
        if (!prop) return { profile: null, links: [], properties: [], pseudoType: 'property' as const };
        const pseudoProfile = {
          id: rawId,
          full_name: prop.client_name || prop.property_name,
          email: (prop as any).billing_email || null,
          phone: (prop as any).client_phone || null,
        };
        return { profile: pseudoProfile, links: [], properties: [prop], pseudoType: 'property' as const };
      }

      if (parsed.type === 'qr') {
        // Pseudo-client from quote_requests
        const { data: qr } = await (supabase.from('quote_requests' as any).select('*').eq('id', parsed.realId).single() as any);
        const pseudoProfile = qr ? {
          id: rawId,
          full_name: [qr.first_name, qr.last_name].filter(Boolean).join(' ') || null,
          email: qr.email || null,
          phone: qr.phone || null,
        } : null;
        return { profile: pseudoProfile, links: [], properties: [], pseudoType: 'qr' as const };
      }

      // Real profile-based client
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', parsed.realId).single();
      const { data: links } = await supabase.from('client_properties').select('*').eq('client_id', parsed.realId);
      const propIds = (links || []).map(l => l.property_id);
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('*').in('id', propIds)
        : { data: [] };
      return { profile, links: links || [], properties: props || [], pseudoType: 'profile' as const };
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
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePropertyId, setSchedulePropertyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingPortalLink, setSendingPortalLink] = useState(false);

  if (data?.profile && !notesLoaded) {
    setNotes((data.profile as any).internal_notes || '');
    setNotesLoaded(true);
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
      await supabase.functions.invoke('send-job-sms', {
        body: { to: profile.phone, message: msg },
      });
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

  // Determine which properties to pass to ScheduleCleanModal
  const scheduleProperties = schedulePropertyId
    ? data.properties.filter((p: any) => p.id === schedulePropertyId).map((p: any) => ({ id: p.id, property_name: p.property_name, address: p.address }))
    : data.properties.map((p: any) => ({ id: p.id, property_name: p.property_name, address: p.address }));

  const parsed = stripPseudoPrefix(id!);

  return (
    <div className="space-y-6">
      <ClientHeader
        name={profile?.full_name || ''}
        email={profile?.email}
        phone={profile?.phone}
        onBack={() => navigate('/clients')}
        onEdit={isRealProfile ? () => setEditOpen(true) : undefined as any}
        onScheduleClean={data.properties.length > 0 ? () => openBookClean() : undefined}
      />

      <ScheduleCleanModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        clientId={parsed.realId}
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

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {isRealProfile && (
            <AssignedPropertiesSection clientId={parsed.realId} properties={data.properties} onRefresh={refreshAll} />
          )}

          {!isRealProfile && data.properties.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-bold text-foreground mb-3">Linked Properties</h3>
              <div className="space-y-2">
                {data.properties.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors">
                    <Link to={`/properties/${p.id}`} className="flex-1">
                      <p className="font-semibold text-foreground">{p.property_name}</p>
                      <p className="text-xs text-muted-foreground">{[p.address, p.suburb].filter(Boolean).join(', ')}</p>
                    </Link>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => openBookClean(p.id)} className="bg-primary text-primary-foreground gap-1">
                        <CalendarPlus className="w-3.5 h-3.5" /> Book Clean
                      </Button>
                      <Link to={`/properties/${p.id}`}><Badge variant="secondary">View</Badge></Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isRealProfile && (
            <>
              <PortalLinkSection
                clientId={parsed.realId}
                portalToken={firstLink?.portal_token || null}
                portalLinkSentAt={(firstLink as any)?.portal_link_sent_at || null}
                linkCreatedAt={firstLink?.created_at || null}
                phone={profile?.phone || null}
                email={profile?.email || null}
                clientName={profile?.full_name || ''}
                onRefresh={refreshAll}
              />

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

              <OnboardingStatusSection
                clientId={parsed.realId}
                onboardToken={firstLink?.onboard_token || null}
                onboardUsed={firstLink?.onboard_used || false}
                onboardingSentAt={(firstLink as any)?.onboarding_sent_at || null}
                phone={profile?.phone || null}
                email={profile?.email || null}
                clientName={profile?.full_name || ''}
                properties={data.properties}
                onRefresh={refreshAll}
              />

              <div className="bg-card rounded-2xl border border-border p-5">
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
            </>
          )}
        </TabsContent>

        {/* PROPERTIES */}
        <TabsContent value="properties" className="mt-4">
          {data.properties.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <p className="text-4xl mb-3">🏠</p>
              <p className="text-muted-foreground">No properties assigned to this client.</p>
              {isRealProfile && (
                <Button variant="outline" className="mt-3" onClick={() => {/* switch to overview tab to use assign */}}>
                  Assign a Property
                </Button>
              )}
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
                      {(p.address || p.suburb) && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {[p.address, p.suburb].filter(Boolean).join(', ')}
                        </p>
                      )}
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

      {isRealProfile && <ClientCommsLog clientId={parsed.realId} />}

      {isRealProfile && (
        <EditClientDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          clientId={parsed.realId}
          initialName={profile?.full_name || ''}
          initialEmail={profile?.email || ''}
          initialPhone={profile?.phone || ''}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
