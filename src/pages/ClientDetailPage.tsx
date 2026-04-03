import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Star, Check, X, Send, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getAppBaseUrl } from '@/lib/appUrl';
import { toast } from 'sonner';
import { format } from 'date-fns';

import ClientHeader from '@/components/client-detail/ClientHeader';
import PortalLinkSection from '@/components/client-detail/PortalLinkSection';
import OnboardingStatusSection from '@/components/client-detail/OnboardingStatusSection';
import AssignedPropertiesSection from '@/components/client-detail/AssignedPropertiesSection';
import EditClientDialog from '@/components/client-detail/EditClientDialog';
import ScheduleCleanModal from '@/components/client-detail/ScheduleCleanModal';

function useClientDetail(clientId: string) {
  return useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', clientId).single();
      const { data: links } = await supabase.from('client_properties').select('*').eq('client_id', clientId);
      const propIds = (links || []).map(l => l.property_id);
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('*').in('id', propIds)
        : { data: [] };
      return { profile, links: links || [], properties: props || [] };
    },
    enabled: !!clientId,
  });
}

function useClientJobs(propertyIds: string[]) {
  return useQuery({
    queryKey: ['client-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, invoice_status, property_id, cleaner_1_id, notes')
        .in('property_id', propertyIds)
        .order('scheduled_date', { ascending: false });
      const { data: props } = await supabase.from('properties').select('id, property_name').in('id', propertyIds);
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });
      const cleanerIds = [...new Set((data || []).map(j => j.cleaner_1_id).filter(Boolean))] as string[];
      const { data: cleaners } = cleanerIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', cleanerIds)
        : { data: [] };
      const cleanerMap: Record<string, string> = {};
      (cleaners || []).forEach(c => { cleanerMap[c.id] = c.full_name || ''; });
      return (data || []).map(j => ({
        ...j,
        property_name: propMap[j.property_id || ''] || '',
        cleaner_name: cleanerMap[j.cleaner_1_id || ''] || '—',
      }));
    },
    enabled: propertyIds.length > 0,
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
  return useQuery({
    queryKey: ['client-requests', clientId],
    queryFn: async () => {
      const { data } = await supabase.from('clean_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
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
  return useQuery({
    queryKey: ['client-messages', clientId],
    queryFn: async () => {
      const { data } = await supabase.from('client_messages').select('*').eq('client_id', clientId).order('sent_at', { ascending: true });
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
  const propertyIds = (data?.links || []).map(l => l.property_id);

  const { data: jobs = [] } = useClientJobs(propertyIds);
  const { data: feedback = [] } = useClientFeedback(propertyIds);
  const { data: requests = [] } = useClientRequests(id!);
  const { data: messages = [] } = useClientMessages(id!);

  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  if (data?.profile && !notesLoaded) {
    setNotes(data.profile.avatar_url || '');
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
      if (!replyText.trim() || !id) return;
      const { error } = await supabase.from('client_messages').insert({ client_id: id, message: replyText.trim(), direction: 'outbound' });
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
    if (s === 'complete') return 'bg-green-100 text-green-800';
    if (s === 'in_progress') return 'bg-yellow-100 text-yellow-800';
    if (s === 'scheduled') return 'bg-blue-100 text-blue-800';
    return 'bg-muted text-muted-foreground';
  };

  const invoiceColor = (s: string | null) => {
    if (s === 'paid') return 'bg-green-100 text-green-800';
    if (s === 'sent') return 'bg-blue-100 text-blue-800';
    if (s === 'draft') return 'bg-yellow-100 text-yellow-800';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <ClientHeader
        name={profile?.full_name || ''}
        email={profile?.email}
        phone={profile?.phone}
        onBack={() => navigate('/clients')}
        onEdit={() => setEditOpen(true)}
        onScheduleClean={() => setScheduleOpen(true)}
      />

      <ScheduleCleanModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        clientId={id!}
        clientName={profile?.full_name || 'Client'}
        properties={data.properties.map(p => ({ id: p.id, property_name: p.property_name, address: p.address }))}
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-5 bg-muted rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="jobs" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Jobs</TabsTrigger>
          <TabsTrigger value="feedback" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Feedback</TabsTrigger>
          <TabsTrigger value="requests" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Requests</TabsTrigger>
          <TabsTrigger value="messages" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">Messages</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <AssignedPropertiesSection clientId={id!} properties={data.properties} onRefresh={refreshAll} />

          <PortalLinkSection
            clientId={id!}
            portalToken={firstLink?.portal_token || null}
            portalLinkSentAt={(firstLink as any)?.portal_link_sent_at || null}
            linkCreatedAt={firstLink?.created_at || null}
            phone={profile?.phone || null}
            email={profile?.email || null}
            clientName={profile?.full_name || ''}
            onRefresh={refreshAll}
          />

          <OnboardingStatusSection
            clientId={id!}
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
            <p className="text-xs text-muted-foreground mt-1">Notes are saved locally for reference.</p>
          </div>
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
                        <Badge className={r.status === 'approved' ? 'bg-green-100 text-green-800' : r.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="text-green-700 hover:bg-green-100" onClick={() => updateRequestMutation.mutate({ requestId: r.id, status: 'approved' })} disabled={updateRequestMutation.isPending}>
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
            <div className="flex gap-2">
              <Input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type a reply..."
                onKeyDown={e => e.key === 'Enter' && !sendReplyMutation.isPending && replyText.trim() && sendReplyMutation.mutate()} />
              <Button onClick={() => sendReplyMutation.mutate()} disabled={!replyText.trim() || sendReplyMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <EditClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clientId={id!}
        initialName={profile?.full_name || ''}
        initialEmail={profile?.email || ''}
        initialPhone={profile?.phone || ''}
        onSaved={refreshAll}
      />
    </div>
  );
}
