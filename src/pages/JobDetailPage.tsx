import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, MapPin, Clock, Timer, Users, CalendarDays, ClipboardList, StickyNote, Trash2, Pencil, ExternalLink, Send, Loader2, RefreshCw, DollarSign, RotateCw, Repeat, Navigation, Key, AlertTriangle as AlertTriangleIcon, Info, Star, MessageSquare, Image as ImageIcon, CheckCircle2, Phone } from 'lucide-react';
import { MapsActionSheet } from '@/components/MapsActionSheet';
import { ClockInOut } from '@/components/timeclock/ClockInOut';
import { useTimeEntry } from '@/hooks/useTimeEntry';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InvoiceBadge } from '@/components/InvoiceBadge';
import { AcceptanceBadge } from '@/components/AcceptanceBadge';
import { useJobAcceptances } from '@/hooks/useJobAcceptances';
import { ExtraTimePhotosModal } from '@/components/job-detail/ExtraTimePhotosModal';
import { CancelJobModal } from '@/components/job-detail/CancelJobModal';
import { RescheduleJobModal } from '@/components/job-detail/RescheduleJobModal';
import ClientCommsLog from '@/components/client-detail/ClientCommsLog';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [sendCancellationSms, setSendCancellationSms] = useState(false);
  const [pushingInvoice, setPushingInvoice] = useState(false);
  const [resendingTo, setResendingTo] = useState<string | null>(null);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [showPricePrompt, setShowPricePrompt] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const [sendingReviewSms, setSendingReviewSms] = useState(false);
  const [sendingRebookSms, setSendingRebookSms] = useState(false);
  const [showExtraPhotos, setShowExtraPhotos] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [sendingTrackerLink, setSendingTrackerLink] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  // Pricing state
  const [priceInput, setPriceInput] = useState('');
  const [priceNotes, setPriceNotes] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb, bedrooms, bathrooms, lat, lng, client_name, access_method, access_code, access_notes, guest_checkin_at, host_preferences, product_restrictions, amenities_notes)')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  // Init pricing fields from job
  useEffect(() => {
    if (job) {
      setPriceInput(job.price_ex_gst ? String(job.price_ex_gst) : '');
      setPriceNotes(job.price_notes || '');
    }
  }, [job]);

  const cleanerIds = [job?.cleaner_1_id, job?.cleaner_2_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ['job-detail-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      if (error) throw error;
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const { data: acceptances = [], refetch: refetchAcceptances } = useJobAcceptances(jobId);

  // Client phone lookup for SMS and click-to-call
  const { data: clientInfo } = useQuery({
    queryKey: ['job-client-info', job?.property_id],
    queryFn: async () => {
      const { data: cpRows } = await supabase
        .from('client_properties')
        .select('client_id, clients(id, full_name, phone, email)')
        .eq('property_id', job!.property_id)
        .limit(1);
      const row = cpRows?.[0] as any;
      if (row?.clients) {
        return { phone: row.clients.phone, name: row.clients.full_name, email: row.clients.email };
      }
      // Fallback: check profiles table via client_properties.client_id
      if (row?.client_id) {
        const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', row.client_id).maybeSingle();
        return { phone: profile?.phone || null, name: profile?.full_name || null, email: null };
      }
      return { phone: null, name: null, email: null };
    },
    enabled: !!job?.property_id,
  });

  // Cleaner job tokens for this job
  const { data: jobTokens = [], refetch: refetchJobTokens } = useQuery({
    queryKey: ['cleaner-job-tokens', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaner_job_tokens')
        .select('*')
        .eq('job_id', jobId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!jobId && role === 'admin',
  });

  // Completion photos (after photos)
  const { data: completionPhotos = [] } = useQuery({
    queryKey: ['job-completion-photos', jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from('photos')
        .select('*')
        .eq('job_id', jobId!)
        .order('created_at');
      return data || [];
    },
    enabled: !!jobId,
  });

  // Extra-time evidence photos
  const { data: extraTimePhotos = [] } = useQuery({
    queryKey: ['job-extra-time-photos', jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId!)
        .eq('room_label', 'Extra Time Evidence')
        .order('uploaded_at');
      return data || [];
    },
    enabled: !!jobId && role === 'admin',
  });

  // Before photos (from linked quote_request)
  const { data: beforePhotos = [] } = useQuery({
    queryKey: ['job-before-photos', job?.linked_quote_id],
    queryFn: async () => {
      if (!job?.linked_quote_id) return [];
      const { data } = await supabase
        .from('quote_requests')
        .select('photos')
        .eq('id', job.linked_quote_id)
        .maybeSingle();
      const photos = data?.photos;
      return Array.isArray(photos) ? photos : [];
    },
    enabled: !!job?.linked_quote_id,
  });

  const { data: xeroSettings = [] } = useQuery({
    queryKey: ['xero-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('xero_settings').select('*');
      return data || [];
    },
    enabled: role === 'admin',
  });

  const xeroMap: Record<string, string> = {};
  xeroSettings.forEach((s: any) => { xeroMap[s.key] = s.value; });

  const nameMap: Record<string, string> = {};
  profiles.forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

  // Pricing calculations
  const priceNum = parseFloat(priceInput) || 0;
  const priceExGst = priceNum;
  const priceIncGst = priceExGst * 1.10;

  const handleSavePrice = async () => {
    if (!jobId) return;
    setSavingPrice(true);
    const { error } = await supabase.from('jobs').update({
      price_ex_gst: priceExGst || null,
      price_inc_gst: priceIncGst || null,
      price_notes: priceNotes || null,
    }).eq('id', jobId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Price saved');
      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
    }
    setSavingPrice(false);
  };

  const handleResendSms = async () => {
    if (!jobId) return;
    setResendingTo(jobId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-job-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('SMS resent to assigned cleaners');
      refetchAcceptances();
    } catch (err: any) {
      toast.error('Failed to resend: ' + err.message);
    }
    setResendingTo(null);
  };

  const doPushInvoice = async () => {
    if (!job) return;
    setPushingInvoice(true);
    try {
      const property = job.properties as any;
      const cleanType = 'Turnover Clean';
      const accountCodeKey = 'account_code_turnover';
      const description = `${cleanType} — ${property?.property_name || 'Property'} — ${property?.suburb || ''} — ${job.scheduled_date}`;

      const jobPriceExGst = job.price_ex_gst || priceExGst || 0;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-create-invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            job_id: job.id,
            contact_name: property?.client_name || property?.property_name || 'Unknown Client',
            description,
            amount: jobPriceExGst,
            account_code: xeroMap[accountCodeKey] || '200',
            invoice_prefix: xeroMap['invoice_prefix'] || 'BCL-',
            due_days: xeroMap['due_days'] || '7',
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(`Invoice ${data.invoice_number} created in Xero`);
      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
    } catch (err: any) {
      toast.error('Failed to create invoice: ' + err.message);
    }
    setPushingInvoice(false);
    setShowPricePrompt(false);
  };

  const handlePushInvoice = () => {
    const jobPrice = job?.price_ex_gst;
    if (!jobPrice || jobPrice === 0) {
      setShowPricePrompt(true);
    } else {
      doPushInvoice();
    }
  };

  const handleSendTrackerLink = async () => {
    if (!job) return;
    setSendingTrackerLink(true);
    try {
      const property = job.properties as any;
      // Find client phone from client_properties
      const { data: cpRows } = await supabase
        .from('client_properties')
        .select('client_id')
        .eq('property_id', job.property_id)
        .limit(1);
      const clientId = cpRows?.[0]?.client_id;
      if (!clientId) { toast.error('No client linked to this property'); setSendingTrackerLink(false); return; }
      const { data: clientProfile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', clientId)
        .single();
      if (!clientProfile?.phone) { toast.error('Client has no phone number'); setSendingTrackerLink(false); return; }
      const firstName = (clientProfile.full_name || 'there').split(' ')[0];
      const trackerUrl = `${(await import('@/lib/appUrl')).getAppBaseUrl()}/track/${job.id}`;
      const sms = `Hi ${firstName}, track your clean live here: ${trackerUrl} — Brightly Cleaning 🌿`;
      await supabase.functions.invoke('send-job-sms', { body: { to: clientProfile.phone, message: sms } });
      toast.success('Tracker link sent to client!');
    } catch (err: any) {
      toast.error('Failed to send tracker link: ' + err.message);
    }
    setSendingTrackerLink(false);
  };

  const handleMarkComplete = async () => {
    if (!job) return;
    setMarkingComplete(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('jobs').update({
        status: 'completed',
        clock_off: now,
        clock_off_at: now,
        check_out_time: now,
      }).eq('id', job.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
      toast.success('Job marked as complete');
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
    setMarkingComplete(false);
  };

  const handleSyncInvoiceStatus = async () => {
    if (!job?.xero_invoice_id) return;
    setSyncingStatus(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-get-invoice-status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xero_invoice_id: job.xero_invoice_id }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.status && data.status !== job.invoice_status) {
        await supabase.from('jobs').update({ invoice_status: data.status }).eq('id', jobId!);
        queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
        toast.success(`Invoice status updated to ${data.status}`);
      } else {
        toast.info('Invoice status is up to date');
      }
    } catch (err: any) {
      toast.error('Sync failed: ' + err.message);
    }
    setSyncingStatus(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-primary font-bold text-lg">Loading job…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground text-center py-8">Job not found.</p>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending_approval: { label: 'Pending Approval', className: 'bg-yellow-100 text-yellow-800' },
    awaiting_schedule_approval: { label: 'Pending Approval', className: 'bg-yellow-100 text-yellow-800' },
    awaiting_quote: { label: 'Needs Quote', className: 'bg-yellow-100 text-yellow-800' },
    awaiting_approval: { label: 'Accepted — Confirm', className: 'bg-yellow-100 text-yellow-800' },
    scheduled: { label: 'Scheduled', className: 'bg-emerald-100 text-emerald-800' },
    confirmed: { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-800' },
    in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Completed', className: 'bg-gray-100 text-gray-600' },
    complete: { label: 'Completed', className: 'bg-gray-100 text-gray-600' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
    flagged: { label: 'Flagged', className: 'bg-red-100 text-red-700' },
  };

  const statusInfo = statusConfig[job.status] || statusConfig.scheduled;
  const property = job.properties as any;
  const address = [property?.address, property?.suburb].filter(Boolean).join(', ')
    || (job as any).property_address || '';
  const jobDate = job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : 'No date';
  const scheduledTime = job.scheduled_time?.slice(0, 5) || null;
  const durationHrs = job.estimated_duration ? job.estimated_duration / 60 : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Job Details</h1>
      </div>

      {/* Property & Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-xl">{property?.property_name || (job as any).client_name || (job as any).property_address || 'Unknown Property'}</CardTitle>
            <div className="flex items-center gap-2">
              <InvoiceBadge status={job.invoice_status} />
              <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {address && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{address}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>{jobDate}</span>
          </div>
          <div className="flex items-center gap-4">
            {scheduledTime && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{scheduledTime}</span>
              </div>
            )}
            {durationHrs && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4 shrink-0" />
                <span>{durationHrs}hr</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cleaner-specific: Open in Maps + Call Client */}
      {(role === 'cleaner' || role === 'head_cleaner') && (
        <div className="flex gap-2">
          {address && (
            <Button
              variant="accent"
              size="lg"
              className="flex-1 gap-2 h-14 text-base font-bold rounded-2xl"
              onClick={() => setMapsOpen(true)}
            >
              <Navigation className="h-5 w-5" />
              Open in Maps
            </Button>
          )}
          {clientInfo?.phone && (
            <Button
              variant="outline"
              size="lg"
              className="gap-2 h-14 text-base font-bold rounded-2xl shrink-0"
              asChild
            >
              <a href={`tel:${clientInfo.phone}`}>
                <Phone className="h-5 w-5" />
                Call Client
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Access Instructions */}
      {(property?.access_method || property?.access_code || property?.access_notes) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5" />
              Access Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {property?.access_method && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Access</span>
                <span className="font-semibold text-foreground">{property.access_method}</span>
              </div>
            )}
            {property?.access_code && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Code</span>
                <span className="font-mono font-bold text-foreground bg-muted px-3 py-1 rounded-lg">{property.access_code}</span>
              </div>
            )}
            {property?.access_notes && (
              <p className="text-sm text-foreground bg-muted rounded-xl p-3 mt-2">{property.access_notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guest Arrival Countdown */}
      {property?.guest_checkin_at && (
        <Card className={isPast(new Date(property.guest_checkin_at)) 
          ? 'border-destructive/30 bg-destructive/5' 
          : job.status === 'complete' 
            ? 'border-primary/30 bg-primary/5' 
            : 'border-accent/30 bg-accent/5'
        }>
          <CardContent className="py-4">
            {job.status === 'complete' ? (
              <p className="text-sm font-bold text-primary">✓ Ready for your guests</p>
            ) : isPast(new Date(property.guest_checkin_at)) ? (
              <p className="text-sm font-bold text-destructive">⚠️ Guest check-in time has passed!</p>
            ) : (
              <div>
                <p className="text-sm font-bold text-foreground">
                  🏠 Next guest arrives in {formatDistanceToNow(new Date(property.guest_checkin_at))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Check-in: {format(new Date(property.guest_checkin_at), 'h:mm a, MMM d')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Host Preferences — for cleaners */}
      {(property?.host_preferences || property?.product_restrictions) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5" />
              Property Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {property?.host_preferences && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Host Preferences</p>
                <p className="text-sm text-foreground">{property.host_preferences}</p>
              </div>
            )}
            {property?.product_restrictions && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Product Restrictions</p>
                <p className="text-sm text-foreground">{property.product_restrictions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MapsActionSheet open={mapsOpen} onClose={() => setMapsOpen(false)} address={address || ''} />

      {/* Recurring Series Banner */}
      {((job as any).series_id || (job as any).frequency && (job as any).frequency !== 'one-off') && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-primary">
                Recurring: {(job as any).frequency === 'weekly' ? 'Weekly' : (job as any).frequency === 'fortnightly' ? 'Fortnightly' : (job as any).frequency === 'monthly' ? 'Monthly' : 'Series'}
              </p>
              {(job as any).series_id && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                  Part of recurring series
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/jobs/${jobId}/edit`)}>
                Edit this job only
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={async () => {
                  if (!confirm('Cancel THIS job only?')) return;
                  const { error } = await supabase.from('jobs').update({ status: 'cancelled' } as any).eq('id', jobId!);
                  if (error) { toast.error(error.message); return; }
                  toast.success('Job cancelled');
                  queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                  queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
                }}
              >
                Cancel this job only
              </Button>
              {(job as any).series_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={async () => {
                    if (!confirm('Cancel all future scheduled jobs in this series?')) return;
                    const { error } = await supabase.from('jobs')
                      .delete()
                      .eq('series_id', (job as any).series_id)
                      .gte('scheduled_date', format(new Date(), 'yyyy-MM-dd'))
                      .eq('status', 'scheduled')
                      .neq('id', jobId!);
                    if (error) { toast.error(error.message); return; }
                    toast.success('Future jobs in series cancelled');
                    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
                  }}
                >
                  Cancel all future jobs
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cleaners & Acceptance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Assigned Cleaners</CardTitle>
            {role === 'admin' && job.status === 'scheduled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendSms}
                disabled={!!resendingTo}
                className="gap-1.5 text-xs"
              >
                {resendingTo ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Resend SMS
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {cleanerIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cleaners assigned</p>
          ) : (
            cleanerIds.map((id) => {
              const acceptance = acceptances.find((a) => a.cleaner_id === id);
              return (
                <div key={id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{nameMap[id] || 'Unknown'}</span>
                  </div>
                  {acceptance && <AcceptanceBadge status={acceptance.acceptance_status} />}
                </div>
              );
            })
          )}
          {acceptances.some((a) => a.acceptance_status === 'declined') && (
            <div className="mt-2 p-3 bg-destructive/10 rounded-xl text-sm text-destructive font-semibold">
              ⚠️ {acceptances.filter(a => a.acceptance_status === 'declined').map(a => nameMap[a.cleaner_id] || 'A cleaner').join(', ')} declined this job — reassign or find cover
            </div>
          )}
        </CardContent>
      </Card>


      {/* Awaiting Quote Banner + Set Price Section */}
      {role === 'admin' && job.status === 'awaiting_quote' && (
        <Card className="border-[hsl(45,100%,51%)]/50 bg-[hsl(45,100%,51%)]/10">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-[hsl(45,100%,40%)]" />
              <p className="text-sm font-bold text-foreground">This job needs a price before it can be scheduled</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold">Price ex GST ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="0.00"
                  className="h-12 rounded-xl text-lg font-bold"
                />
                {priceNum > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Inc GST: <span className="font-bold text-foreground">${(priceNum * 1.1).toFixed(2)}</span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-sm font-semibold">Internal Notes</Label>
                <Input
                  value={priceNotes}
                  onChange={(e) => setPriceNotes(e.target.value)}
                  placeholder="e.g. 3hrs @ $55/hr + oven clean"
                  className="h-10 rounded-xl"
                />
              </div>
              <Button
                onClick={async () => {
                  if (priceNum <= 0) { toast.error('Please enter a price'); return; }
                  setSavingPrice(true);
                  // Update job: set price and status to scheduled
                  const { error } = await supabase.from('jobs').update({
                    price_ex_gst: priceNum,
                    price_inc_gst: priceNum * 1.1,
                    price_notes: priceNotes || null,
                    status: 'scheduled',
                  }).eq('id', jobId!);
                  if (error) { toast.error(error.message); setSavingPrice(false); return; }

                  // Send client booking SMS
                  try {
                    await supabase.functions.invoke('send-client-booking-sms', { body: { job_id: jobId } });
                  } catch (err: any) {
                    toast.error(`⚠️ Client SMS failed: ${err.message}`);
                  }

                  // Send cleaner SMS if cleaner assigned
                  if (job.cleaner_1_id) {
                    try {
                      await supabase.functions.invoke('send-job-sms', { body: { job_id: jobId } });
                    } catch (err: any) {
                      toast.error(`⚠️ Cleaner SMS failed: ${err.message}`);
                    }
                  }

                  // Push Xero invoice
                  try {
                    const xeroProperty = job.properties as any;
                    const description = `${job.notes?.split(' — ')[0] || 'Clean'} — ${xeroProperty?.property_name || 'Property'} — ${xeroProperty?.suburb || ''} — ${job.scheduled_date}`;
                    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-create-invoice`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        job_id: jobId,
                        contact_name: xeroProperty?.client_name || xeroProperty?.property_name || 'Client',
                        description,
                        amount: priceNum,
                        account_code: xeroMap['account_code_turnover'] || '200',
                        invoice_prefix: xeroMap['invoice_prefix'] || 'BCL-',
                        due_days: xeroMap['due_days'] || '7',
                      }),
                    });
                  } catch { /* Xero optional */ }

                  toast.success('Job scheduled, client notified, Xero invoice created ✓');
                  queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                  queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
                  queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
                  setSavingPrice(false);
                }}
                disabled={savingPrice || priceNum <= 0}
                className="w-full h-12 gap-2 font-bold text-base"
              >
                {savingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Save Price & Schedule Job
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awaiting Approval Banner — Client accepted quote, admin confirms */}
      {role === 'admin' && job.status === 'awaiting_approval' && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-foreground">✅ Client accepted quote — confirm date & cleaner</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold">Confirmed Date</Label>
                <Input
                  type="date"
                  value={priceInput ? undefined : job.scheduled_date}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="h-12 rounded-xl"
                  defaultValue={job.scheduled_date}
                  id="confirm-date"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Confirmed Start Time</Label>
                <Input
                  type="time"
                  defaultValue={job.scheduled_time?.slice(0, 5) || '08:00'}
                  className="h-12 rounded-xl"
                  id="confirm-time"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Internal Notes</Label>
                <Input
                  value={priceNotes}
                  onChange={(e) => setPriceNotes(e.target.value)}
                  placeholder="Notes for this booking"
                  className="h-10 rounded-xl"
                />
              </div>
              <Button
                onClick={async () => {
                  setSavingPrice(true);
                  const confirmDate = (document.getElementById('confirm-date') as HTMLInputElement)?.value || job.scheduled_date;
                  const confirmTime = (document.getElementById('confirm-time') as HTMLInputElement)?.value || '08:00';

                  const { error } = await supabase.from('jobs').update({
                    scheduled_date: confirmDate,
                    scheduled_time: confirmTime,
                    notes: priceNotes || job.notes || null,
                    status: 'scheduled',
                  }).eq('id', jobId!);
                  if (error) { toast.error(error.message); setSavingPrice(false); return; }

                  // Send client confirmation SMS
                  try {
                    await supabase.functions.invoke('send-client-booking-sms', { body: { job_id: jobId } });
                  } catch (err: any) {
                    toast.error(`⚠️ Client SMS failed: ${err.message}`);
                  }

                  // Send cleaner SMS
                  if (job.cleaner_1_id) {
                    try {
                      await supabase.functions.invoke('send-job-sms', { body: { job_id: jobId } });
                    } catch (err: any) {
                      toast.error(`⚠️ Cleaner SMS failed: ${err.message}`);
                    }
                  }

                  // Push Xero invoice
                  try {
                    const xeroProperty = job.properties as any;
                    const description = `${job.notes?.split('\n')[0] || 'Clean'} — ${xeroProperty?.property_name || 'Property'} — ${xeroProperty?.suburb || ''} — ${confirmDate}`;
                    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-create-invoice`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        job_id: jobId,
                        contact_name: xeroProperty?.client_name || xeroProperty?.property_name || 'Client',
                        description,
                        amount: job.price_ex_gst || 0,
                        account_code: xeroMap['account_code_turnover'] || '200',
                        invoice_prefix: xeroMap['invoice_prefix'] || 'BCL-',
                        due_days: xeroMap['due_days'] || '7',
                      }),
                    });
                  } catch { /* Xero optional */ }

                  toast.success('Booking confirmed! Client & cleaner notified, Xero invoice created ✓');
                  queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                  queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
                  queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
                  setSavingPrice(false);
                }}
                disabled={savingPrice}
                className="w-full h-12 gap-2 font-bold text-base"
              >
                {savingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm Booking
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing — Admin read-only (for non-awaiting_quote jobs) */}
      {role === 'admin' && job.status !== 'awaiting_quote' && job.status !== 'awaiting_approval' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(job.price_ex_gst && job.price_ex_gst > 0) ? (
              <div className="space-y-2">
                <p className="text-lg    font-extrabold text-primary">
                  ${Number(job.price_ex_gst).toFixed(2)} ex GST
                  <span className="text-sm font-semibold text-muted-foreground ml-2">
                    (${(Number(job.price_ex_gst) * 1.1).toFixed(2)} inc GST)
                  </span>
                </p>
                {job.price_notes && (
                  <p className="text-sm text-muted-foreground">{job.price_notes}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No price set</p>
                <div>
                  <Label className="text-sm font-semibold">Override Price (ex GST)</Label>
                  <Input type="number" step="0.01" min="0" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0.00" className="h-10 rounded-xl" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Notes</Label>
                  <Input value={priceNotes} onChange={(e) => setPriceNotes(e.target.value)} placeholder="e.g. One-off rate" className="h-10 rounded-xl" />
                </div>
                <Button onClick={handleSavePrice} disabled={savingPrice} size="sm" className="gap-2 rounded-xl">
                  {savingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  Save Override
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pre-Job Report — Admin only */}
      {role === 'admin' && (job.clock_on) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Pre-Job Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Damage Status */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Damage Check</p>
              {(job as any).damage_reported ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-1">
                    <AlertTriangleIcon className="h-4 w-4" /> Damage Reported
                  </p>
                  {(job as any).damage_notes && (
                    <p className="text-sm text-foreground bg-destructive/5 p-2 rounded-lg">{(job as any).damage_notes}</p>
                  )}
                  {(job as any).damage_photos && (job as any).damage_photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {((job as any).damage_photos as string[]).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Damage ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-border" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-brightly flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> No damage reported
                </p>
              )}
            </div>

            {/* Extra Time Status */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Extra Time</p>
              {(job as any).extra_time_requested ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-600 flex items-center gap-1">
                    <Clock className="h-4 w-4" /> Extra time requested
                  </p>
                  {(job as any).extra_time_notes && (
                    <p className="text-sm text-foreground bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg">{(job as any).extra_time_notes}</p>
                  )}
                  {(job as any).extra_time_photos && (job as any).extra_time_photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {((job as any).extra_time_photos as string[]).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Evidence ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-border" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-brightly flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> No extra time needed
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extra Time Photos — Admin only */}
      {role === 'admin' && extraTimePhotos.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">Extra Time Evidence</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowExtraPhotos(true)}>
                <ImageIcon className="h-3 w-3" />
                View Photos ({extraTimePhotos.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <ExtraTimePhotosModal
        open={showExtraPhotos}
        onOpenChange={setShowExtraPhotos}
        photos={extraTimePhotos}
      />

      {/* Before & After Photos — Admin only, completed jobs */}
      {role === 'admin' && (job.status === 'completed' || job.status === 'complete') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Before & After
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pre-Job (Damage) Photos */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Pre-Job Photos</p>
                {job.clock_on && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Taken at clock-on {format(new Date(job.clock_on), 'h:mm a')}
                  </p>
                )}
                {(job as any).damage_photos && (job as any).damage_photos.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {((job as any).damage_photos as string[]).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={url} alt={`Before ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-border hover:ring-2 hover:ring-primary transition-all" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-brightly font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> No pre-job damage reported ✓
                  </p>
                )}
              </div>
              {/* Post-Job (Completion) Photos */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Post-Job Photos</p>
                {job.clock_off_at && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Taken at clock-off {format(new Date(job.clock_off_at), 'h:mm a')}
                  </p>
                )}
                {(job as any).completion_photos && (job as any).completion_photos.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {((job as any).completion_photos as string[]).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={url} alt={`After ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-border hover:ring-2 hover:ring-primary transition-all" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No completion photos</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Timing — Admin only, completed jobs */}
      {role === 'admin' && (job.status === 'completed' || job.status === 'complete') && job.clock_on && job.clock_off_at && (() => {
        const clockOnMs = new Date(job.clock_on).getTime();
        const clockOffMs = new Date(job.clock_off_at).getTime();
        const totalPauseSec = (job as any).total_pause_seconds || 0;
        const actualMs = clockOffMs - clockOnMs - (totalPauseSec * 1000);
        const actualMins = Math.round(actualMs / 60000);
        const actualHrs = Math.floor(actualMins / 60);
        const actualRemMins = actualMins % 60;
        const allocatedMins = job.estimated_duration || 0;
        const diffMins = actualMins - allocatedMins;
        const diffColor = diffMins <= 0 ? 'text-brightly' : diffMins <= 15 ? 'text-amber-600' : 'text-destructive';
        const diffSign = diffMins > 0 ? '+' : '';

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Job Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {allocatedMins > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Allocated</span>
                  <span className="font-semibold text-foreground">{Math.floor(allocatedMins / 60)}hrs {allocatedMins % 60 > 0 ? `${allocatedMins % 60}mins` : ''}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actual</span>
                <span className="font-semibold text-foreground">{actualHrs}hrs {actualRemMins}mins</span>
              </div>
              {allocatedMins > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Difference</span>
                  <span className={`font-bold ${diffColor}`}>{diffSign}{diffMins} mins</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}


      {job.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 text-sm text-foreground">
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              <p className="whitespace-pre-wrap">{job.notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Status Card — Admin only, completed jobs */}
      {role === 'admin' && (job.status === 'complete' || job.status === 'completed') && (
        <Card className={
          job.invoice_status === 'paid' ? 'border-brightly/30 bg-brightly/10 dark:bg-brightly/10' :
          job.invoice_status === 'sent' ? 'border-blue-500/30 bg-blue-50 dark:bg-blue-500/10' :
          job.invoice_status === 'raised' ? 'border-primary/30 bg-primary/5' :
          'border-amber-500/30 bg-amber-50 dark:bg-amber-500/10'
        }>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {job.xero_invoice_number && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice #</span>
                <span className="text-sm font-bold">{job.xero_invoice_number}</span>
              </div>
            )}

            {/* Not Raised */}
            {(!job.invoice_status || job.invoice_status === 'not_raised') && !job.xero_invoice_id && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <p className="text-sm font-bold text-foreground">Invoice not raised</p>
                </div>
                <Button
                  onClick={handlePushInvoice}
                  disabled={pushingInvoice}
                  className="w-full gap-2 bg-brightly hover:bg-brightly-hover text-white"
                >
                  {pushingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  Raise Invoice
                </Button>
              </div>
            )}

            {/* Raised */}
            {(job.invoice_status === 'raised' || (job.xero_invoice_id && job.invoice_status !== 'sent' && job.invoice_status !== 'paid')) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <p className="text-sm font-bold text-foreground">
                    Invoice Raised {job.invoice_raised_at ? format(new Date(job.invoice_raised_at), 'd MMM yyyy') : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={async () => {
                      if (!job.xero_invoice_id) return;
                      setPushingInvoice(true);
                      try {
                        const { error } = await supabase.from('jobs').update({
                          invoice_status: 'sent',
                          invoice_sent_at: new Date().toISOString(),
                        }).eq('id', jobId!);
                        if (error) throw error;
                        toast.success('Invoice marked as sent');
                        queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                      } catch (err: any) {
                        toast.error(err.message);
                      }
                      setPushingInvoice(false);
                    }}
                    disabled={pushingInvoice}
                  >
                    {pushingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send to Client
                  </Button>
                  {job.xero_invoice_id && (
                    <Button variant="outline" size="icon" onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Sent */}
            {job.invoice_status === 'sent' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <p className="text-sm font-bold text-foreground">
                    Invoice Sent {job.invoice_sent_at ? format(new Date(job.invoice_sent_at), 'd MMM yyyy') : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2 bg-brightly hover:bg-brightly-hover text-white"
                    onClick={async () => {
                      setPushingInvoice(true);
                      try {
                        const { error } = await supabase.from('jobs').update({
                          invoice_status: 'paid',
                          invoice_paid_at: new Date().toISOString(),
                        }).eq('id', jobId!);
                        if (error) throw error;
                        toast.success('Invoice marked as paid');
                        queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                      } catch (err: any) {
                        toast.error(err.message);
                      }
                      setPushingInvoice(false);
                    }}
                    disabled={pushingInvoice}
                  >
                    {pushingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Mark as Paid
                  </Button>
                  {job.xero_invoice_id && (
                    <Button variant="outline" size="icon" onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Paid */}
            {job.invoice_status === 'paid' && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-brightly" />
                <p className="text-sm font-bold text-brightly dark:text-brightly-light">
                  Invoice Paid {job.invoice_paid_at ? format(new Date(job.invoice_paid_at), 'd MMM yyyy') : ''} ✓
                </p>
              </div>
            )}

            {/* Sync button */}
            {job.xero_invoice_id && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={handleSyncInvoiceStatus}
                disabled={syncingStatus}
              >
                {syncingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                Sync Xero Status
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Post-Job SMS Status — Admin only, completed jobs */}
      {role === 'admin' && (job.status === 'complete' || job.status === 'completed') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Post-Job SMS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Review SMS */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Google Review SMS</p>
                <p className="text-xs text-muted-foreground">
                  {(job as any).review_sms_sent_at
                    ? `Sent ${format(new Date((job as any).review_sms_sent_at), 'd MMM yyyy, h:mm a')}`
                    : 'Not sent yet — scheduled after delay'}
                </p>
              </div>
              {!(job as any).review_sms_sent_at && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sendingReviewSms}
                  onClick={async () => {
                    setSendingReviewSms(true);
                    try {
                      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-review-rebook-sms`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ job_id: jobId, type: 'review' }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      toast.success('Review SMS sent');
                      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                    } catch (err: any) {
                      toast.error('Failed: ' + err.message);
                    }
                    setSendingReviewSms(false);
                  }}
                  className="gap-1.5 text-xs"
                >
                  {sendingReviewSms ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                  Send Now
                </Button>
              )}
            </div>

            {/* Rebook SMS */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Re-booking SMS</p>
                <p className="text-xs text-muted-foreground">
                  {(job as any).rebook_sms_sent_at
                    ? `Sent ${format(new Date((job as any).rebook_sms_sent_at), 'd MMM yyyy, h:mm a')}`
                    : (job as any).series_id
                      ? 'Skipped (recurring client)'
                      : 'Not sent yet — scheduled after delay'}
                </p>
              </div>
              {!(job as any).rebook_sms_sent_at && !(job as any).series_id && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sendingRebookSms}
                  onClick={async () => {
                    setSendingRebookSms(true);
                    try {
                      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-review-rebook-sms`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ job_id: jobId, type: 'rebook' }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      toast.success('Re-booking SMS sent');
                      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
                    } catch (err: any) {
                      toast.error('Failed: ' + err.message);
                    }
                    setSendingRebookSms(false);
                  }}
                  className="gap-1.5 text-xs"
                >
                  {sendingRebookSms ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Send Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo Gallery — Before & After */}
      {role === 'admin' && (beforePhotos.length > 0 || completionPhotos.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {beforePhotos.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Before (Client Submitted)</p>
                <div className="grid grid-cols-3 gap-2">
                  {beforePhotos.map((p: any, i: number) => (
                    <div key={i} className="space-y-1">
                      <a href={p.url} target="_blank" rel="noopener noreferrer">
                        <img src={p.url} alt={p.label || `Before ${i+1}`} className="w-full aspect-square object-cover rounded-xl hover:opacity-80 transition-opacity" />
                      </a>
                      {p.label && <p className="text-xs text-muted-foreground truncate">{p.label}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {completionPhotos.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">After (Completion)</p>
                <div className="grid grid-cols-3 gap-2">
                  {completionPhotos.map((p: any) => (
                    <div key={p.id} className="space-y-1">
                      <a href={p.file_url} target="_blank" rel="noopener noreferrer">
                        <img src={p.file_url} alt={p.room_label || 'Completion'} className="w-full aspect-square object-cover rounded-xl hover:opacity-80 transition-opacity" />
                      </a>
                      {p.room_label && <p className="text-xs text-muted-foreground truncate">{p.room_label}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {beforePhotos.length > 0 && completionPhotos.length > 0 && (
              <p className="text-xs text-center text-muted-foreground">Side-by-side: {beforePhotos.length} before, {completionPhotos.length} after</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {(role === 'cleaner' || role === 'head_cleaner') && !job.clock_off && (
          job.clock_on ? (
            <Button
              className="w-full gap-2 h-16 text-lg font-extrabold bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-2xl"
              onClick={() => navigate(`/clean/${jobId}`)}
            >
              End Job
            </Button>
          ) : job.status !== 'completed' && job.status !== 'complete' ? (
            <Button
              className="w-full gap-2 h-16 text-lg font-extrabold bg-brightly hover:bg-brightly-hover text-white rounded-2xl"
              onClick={() => navigate(`/clean/${jobId}`)}
            >
              Start Job
            </Button>
          ) : null
        )}
        {role === 'admin' && (job.status === 'completed' || job.status === 'complete') && (
          <Button
            className="w-full gap-2 h-12 text-base font-bold"
            onClick={() => navigate(`/clean/${jobId}`)}
          >
            <ClipboardList className="h-5 w-5" />
            View Summary
          </Button>
        )}
        {role === 'admin' && job.status !== 'completed' && job.status !== 'complete' && (
          <Button
            className="w-full gap-2 h-12 text-base font-bold"
            onClick={() => navigate(`/jobs/${jobId}/checklist`)}
          >
            <ClipboardList className="h-5 w-5" />
            Open Checklist
          </Button>
        )}

        {role === 'admin' && job.status !== 'cancelled' && job.status !== 'completed' && job.status !== 'complete' && (
          <Button
            variant="outline"
            className="w-full gap-2 h-12 text-base font-bold"
            onClick={handleSendTrackerLink}
            disabled={sendingTrackerLink}
          >
            {sendingTrackerLink ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Send Tracker Link to Client
          </Button>
        )}

        {role === 'admin' && job.status !== 'cancelled' && job.status !== 'completed' && job.status !== 'complete' && (
          <Button
            className="w-full gap-2 h-12 text-base font-bold bg-brightly hover:bg-brightly-hover text-white"
            onClick={handleMarkComplete}
            disabled={markingComplete}
          >
            {markingComplete ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Mark Complete
          </Button>
        )}

        {role === 'admin' && (
          <Button
            variant="outline"
            className="w-full gap-2 h-12 text-base font-bold"
            onClick={() => navigate(`/jobs/${jobId}/edit`)}
          >
            <Pencil className="h-5 w-5" />
            Edit Job
          </Button>
        )}

        {role === 'admin' && job.status !== 'cancelled' && job.status !== 'completed' && job.status !== 'complete' && (
          <Button
            variant="outline"
            className="w-full gap-2 h-12 text-base font-bold"
            onClick={() => setRescheduleOpen(true)}
          >
            <CalendarDays className="h-5 w-5" />
            Reschedule Job
          </Button>
        )}

        {role === 'admin' && job.status !== 'cancelled' && job.status !== 'completed' && job.status !== 'complete' && (
          <Button
            variant="outline"
            className="w-full gap-2 h-12 text-base font-bold text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setCancelOpen(true)}
          >
            Cancel Job
          </Button>
        )}

        {role === 'admin' && job.status === 'cancelled' && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 space-y-1">
            <p className="text-sm font-bold text-destructive">Job Cancelled</p>
            {(job as any).cancellation_reason && <p className="text-sm text-muted-foreground">Reason: {(job as any).cancellation_reason.replace('_', ' ')}</p>}
            {(job as any).cancellation_notes && <p className="text-sm text-muted-foreground">{(job as any).cancellation_notes}</p>}
          </div>
        )}

        {role === 'admin' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2 h-12 text-base font-bold" disabled={deleting}>
                <Trash2 className="h-5 w-5" />
                {deleting ? 'Deleting…' : 'Delete Job'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. The client will NOT be notified automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center gap-2 px-1 py-2">
                <Checkbox
                  id="send-cancel-sms"
                  checked={sendCancellationSms}
                  onCheckedChange={(v) => setSendCancellationSms(!!v)}
                />
                <label htmlFor="send-cancel-sms" className="text-sm text-muted-foreground cursor-pointer">
                  Also send cancellation SMS to client
                </label>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      // Clean up related records
                      await supabase.from('job_forms').delete().eq('job_id', jobId!);
                      await supabase.from('job_acceptances').delete().eq('job_id', jobId!);
                      await supabase.from('time_entries').delete().eq('job_id', jobId!);

                      // If linked to a quote_request, mark it cancelled
                      if (job?.linked_quote_id) {
                        await supabase.from('quote_requests').update({ status: 'cancelled' }).eq('id', job.linked_quote_id);
                      }

                      // Send cancellation SMS if checked
                      if (sendCancellationSms && job?.properties) {
                        const property = job.properties as any;
                        try {
                          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-client-booking-sms`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ job_id: jobId, is_cancellation: true }),
                          });
                        } catch { /* best effort */ }
                      }

                      const { error } = await supabase.from('jobs').delete().eq('id', jobId!);
                      if (error) {
                        toast.error('Failed to delete job: ' + error.message);
                        setDeleting(false);
                        return;
                      }
                      toast.success('Job deleted successfully');
                      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
                      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
                      navigate('/schedule');
                    } catch (err: any) {
                      toast.error('Delete failed: ' + err.message);
                      setDeleting(false);
                    }
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <CancelJobModal open={cancelOpen} onOpenChange={setCancelOpen} jobId={jobId!} onCancelled={() => navigate('/schedule')} />
      <RescheduleJobModal
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        jobId={jobId!}
        currentDate={job.scheduled_date}
        currentTime={job.scheduled_time}
        clientPhone={clientInfo?.phone}
        clientName={clientInfo?.name || (job.properties as any)?.client_name}
        propertyName={(job.properties as any)?.property_name}
      />

      {/* Client Messages for this Job */}
      {role === 'admin' && jobId && (
        <ClientCommsLog jobId={jobId} title="Client Messages for this Job" />
      )}

      {/* Price Prompt Modal */}
      <Dialog open={showPricePrompt} onOpenChange={setShowPricePrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No price set</DialogTitle>
            <DialogDescription>
              This job has no price set. Enter a price before creating the invoice, or push with $0.00 and update in Xero manually.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setShowPricePrompt(false); }} className="w-full sm:w-auto">
              Enter Price
            </Button>
            <Button onClick={doPushInvoice} disabled={pushingInvoice} className="w-full sm:w-auto gap-2" style={{ backgroundColor: '#13B5EA' }}>
              {pushingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Push as $0.00
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
