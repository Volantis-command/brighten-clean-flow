import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, Eye, Copy, Send, Pencil, Loader2, Mail, Phone, Star, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const BASE_URL = window.location.origin;

function useClientDetail(clientId: string) {
  return useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', clientId).single();
      const { data: links } = await supabase.from('client_properties').select('*').eq('client_id', clientId);
      const propIds = (links || []).map(l => l.property_id);
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, property_name, address, suburb').in('id', propIds)
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
      // Get property names
      const { data: props } = await supabase.from('properties').select('id, property_name').in('id', propertyIds);
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });
      // Get cleaner names
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
        .from('job_feedback')
        .select('*')
        .in('property_id', propertyIds)
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
      const { data } = await supabase
        .from('clean_requests')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
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
      const { data } = await supabase
        .from('client_messages')
        .select('*')
        .eq('client_id', clientId)
        .order('sent_at', { ascending: true });
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
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [replyText, setReplyText] = useState('');

  // Load notes once
  if (data?.profile && !notesLoaded) {
    setNotes(data.profile.avatar_url || ''); // repurpose avatar_url as notes for now
    setNotesLoaded(true);
  }

  const portalToken = data?.links?.[0]?.portal_token;
  const portalLink = portalToken ? `${BASE_URL}/client/${portalToken}` : null;

  const onboardToken = data?.links?.[0]?.onboard_token;
  const onboardUsed = data?.links?.[0]?.onboard_used;

  const updateRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      const { error } = await supabase.from('clean_requests').update({ status }).eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request updated');
      queryClient.invalidateQueries({ queryKey: ['client-requests', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      if (!replyText.trim() || !id) return;
      const { error } = await supabase.from('client_messages').insert({
        client_id: id,
        message: replyText.trim(),
        direction: 'outbound',
      });
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/clients')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">{profile?.full_name || 'Client'}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {profile?.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.email}</span>}
            {profile?.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{profile.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditName(profile?.full_name || ''); setEditPhone(profile?.phone || ''); setEditOpen(true); }}>
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
          {portalLink && (
            <>
              <Button variant="outline" size="sm" onClick={() => window.open(portalLink, '_blank')}>
                <Eye className="w-4 h-4 mr-1" /> View Portal
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(portalLink); toast.success('Portal link copied'); }}>
                <Copy className="w-4 h-4 mr-1" /> Copy Link
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
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
          {/* Properties */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-foreground mb-3">Assigned Properties</h3>
            {data.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties assigned.</p>
            ) : (
              <div className="space-y-2">
                {data.properties.map(p => (
                  <Link key={p.id} to={`/properties/${p.id}`} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors">
                    <div>
                      <p className="font-semibold text-foreground">{p.property_name}</p>
                      <p className="text-xs text-muted-foreground">{[p.address, p.suburb].filter(Boolean).join(', ')}</p>
                    </div>
                    <Badge variant="secondary">View</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Magic Link */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-foreground mb-2">Magic Link Portal URL</h3>
            {portalLink ? (
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-3 py-2 rounded-lg flex-1 truncate">{portalLink}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalLink); toast.success('Copied'); }}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No portal token generated.</p>
            )}
          </div>

          {/* Onboarding Status */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-foreground mb-2">Onboarding Form Status</h3>
            <Badge className={onboardUsed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
              {onboardUsed ? '✓ Submitted' : '⏳ Pending'}
            </Badge>
          </div>

          {/* Notes */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-foreground mb-2">Internal Notes</h3>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add internal notes about this client..."
              rows={4}
              className="rounded-xl"
            />
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Cleaner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoice</TableHead>
                  </TableRow>
                </TableHeader>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.submitted_at ? format(new Date(f.submitted_at), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{f.property_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold">{f.score || '—'}/10</span>
                        </div>
                      </TableCell>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Requested Date</TableHead>
                    <TableHead>Clean Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{r.property_name}</TableCell>
                      <TableCell>{r.requested_date ? format(new Date(r.requested_date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell>{r.clean_type || '—'}</TableCell>
                      <TableCell>
                        <Badge className={
                          r.status === 'approved' ? 'bg-green-100 text-green-800' :
                          r.status === 'declined' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-700 hover:bg-green-100"
                              onClick={() => updateRequestMutation.mutate({ requestId: r.id, status: 'approved' })}
                              disabled={updateRequestMutation.isPending}
                            >
                              <Check className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-700 hover:bg-red-100"
                              onClick={() => updateRequestMutation.mutate({ requestId: r.id, status: 'declined' })}
                              disabled={updateRequestMutation.isPending}
                            >
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
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === 'outbound'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}>
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
              <Input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type a reply..."
                onKeyDown={e => e.key === 'Enter' && !sendReplyMutation.isPending && replyText.trim() && sendReplyMutation.mutate()}
              />
              <Button
                onClick={() => sendReplyMutation.mutate()}
                disabled={!replyText.trim() || sendReplyMutation.isPending}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name</Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={editPhone} onChange={e => setEditPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold" onClick={async () => {
              const { error } = await supabase.from('profiles').update({ full_name: editName, phone: editPhone }).eq('id', id!);
              if (error) { toast.error(error.message); return; }
              toast.success('Client updated');
              queryClient.invalidateQueries({ queryKey: ['client-detail', id] });
              setEditOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
