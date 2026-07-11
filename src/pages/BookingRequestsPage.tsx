import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useState } from 'react';
import { syncJobAssignment, initialJobStatusForAssignment } from '@/lib/jobAssignment';

function useAllPendingRequests() {
  return useQuery({
    queryKey: ['all-booking-requests'],
    queryFn: async () => {
      const { data: requests } = await supabase
        .from('clean_requests')
        .select('*')
        .order('created_at', { ascending: false });

      const clientIds = [...new Set((requests || []).map(r => r.client_id))];
      const propIds = [...new Set((requests || []).map(r => r.property_id).filter(Boolean))] as string[];

      const { data: profiles } = clientIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', clientIds)
        : { data: [] };
      const { data: props } = propIds.length
        ? await supabase.from('properties').select('id, property_name').in('id', propIds)
        : { data: [] };

      const profileMap: Record<string, string> = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p.full_name || ''; });
      const propMap: Record<string, string> = {};
      (props || []).forEach(p => { propMap[p.id] = p.property_name; });

      return (requests || []).map(r => ({
        ...r,
        client_name: profileMap[r.client_id] || '—',
        property_name: propMap[r.property_id || ''] || '—',
      }));
    },
  });
}

function useCleanersList() {
  return useQuery({
    queryKey: ['cleaners-for-assign'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('role', ['cleaner', 'head_cleaner', 'admin']);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      return profiles || [];
    },
  });
}

export default function BookingRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: requests = [], isLoading } = useAllPendingRequests();
  const { data: cleaners = [] } = useCleanersList();
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('pending');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [confirmDate, setConfirmDate] = useState('');
  const [confirmTime, setConfirmTime] = useState('');
  const [assignedCleaner, setAssignedCleaner] = useState('');

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) return;
      // Create job
      const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
        property_id: selectedRequest.property_id,
        scheduled_date: confirmDate || selectedRequest.requested_date,
        scheduled_time: confirmTime || null,
        cleaner_1_id: assignedCleaner || null,
        status: initialJobStatusForAssignment(assignedCleaner || null, null),
        notes: selectedRequest.notes || null,
      } as any).select('id').single();
      if (jobErr) throw jobErr;

      // Sync acceptance + alerts + SMS for assigned cleaner
      if (newJob?.id && assignedCleaner) {
        await syncJobAssignment(newJob.id, { sendSms: true });
      }

      // Update request status
      await supabase.from('clean_requests').update({ status: 'approved' }).eq('id', selectedRequest.id);

      // Send SMS to client via guest-ready-sms or direct Twilio
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', selectedRequest.client_id).single();
      if (profile?.phone) {
        await supabase.functions.invoke('guest-ready-sms', {
          body: {
            to: profile.phone,
            message: `Hi ${profile.full_name?.split(' ')[0]}, your clean at ${selectedRequest.property_name} has been confirmed for ${confirmDate || selectedRequest.requested_date}. - Brightly`,
          },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      toast.success('Booking confirmed & job created');
      queryClient.invalidateQueries({ queryKey: ['all-booking-requests'] });
      setConfirmOpen(false);
      setSelectedRequest(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const declineMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await supabase.from('clean_requests').update({ status: 'declined' }).eq('id', requestId);
    },
    onSuccess: () => {
      toast.success('Request declined');
      queryClient.invalidateQueries({ queryKey: ['all-booking-requests'] });
    },
  });

  const openConfirm = (req: any) => {
    setSelectedRequest(req);
    setConfirmDate(req.requested_date || '');
    setConfirmTime('');
    setAssignedCleaner('');
    setConfirmOpen(true);
  };

  const statusColor = (s: string) => {
    if (s === 'approved') return 'bg-brightly/10 text-brightly';
    if (s === 'declined') return 'bg-[rgba(248,113,113,0.15)] text-[#F87171]';
    return 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D]';
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Booking Requests</h1>
          <p className="text-sm text-muted-foreground">{pendingCount} pending request{pendingCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'declined'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f}{f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No {filter !== 'all' ? filter : ''} booking requests.</div>
      ) : (
        <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Requested Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold text-primary cursor-pointer" onClick={() => navigate(`/clients/${r.client_id}`)}>{r.client_name}</TableCell>
                  <TableCell>{r.property_name}</TableCell>
                  <TableCell>{r.requested_date ? format(new Date(r.requested_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell>{r.clean_type || '—'}</TableCell>
                  <TableCell>{r.preferred_time || '—'}</TableCell>
                  <TableCell><Badge className={statusColor(r.status)}>{r.status}</Badge></TableCell>
                  <TableCell>
                    {r.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="text-brightly hover:bg-brightly/10" onClick={() => openConfirm(r)}>
                          <Check className="w-4 h-4 mr-1" /> Confirm
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-100" onClick={() => declineMutation.mutate(r.id)} disabled={declineMutation.isPending}>
                          <X className="w-4 h-4 mr-1" /> Decline
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirm & Assign Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>Set the confirmed date, time and assign a cleaner for {selectedRequest?.property_name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Confirmed Date</Label>
              <Input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label>Time</Label>
              <TimeSelect value={confirmTime} onChange={setConfirmTime} className="rounded-xl" />
            </div>
            <div>
              <Label>Assign Cleaner</Label>
              <Select value={assignedCleaner} onValueChange={setAssignedCleaner}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
                <SelectContent>
                  {cleaners.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={!confirmDate || confirmMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2">
              {confirmMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm & Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
