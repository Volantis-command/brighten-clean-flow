import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, MapPin, Clock, Timer, Users, CalendarDays, ClipboardList, StickyNote, Trash2, Pencil, ExternalLink, Send, Loader2, RefreshCw, DollarSign, RotateCw, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InvoiceBadge } from '@/components/InvoiceBadge';
import { AcceptanceBadge } from '@/components/AcceptanceBadge';
import { useJobAcceptances } from '@/hooks/useJobAcceptances';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [pushingInvoice, setPushingInvoice] = useState(false);
  const [resendingTo, setResendingTo] = useState<string | null>(null);
  const [showPricePrompt, setShowPricePrompt] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);

  // Pricing state
  const [priceInput, setPriceInput] = useState('');
  const [priceNotes, setPriceNotes] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb, bedrooms, bathrooms, lat, lng, client_name)')
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
    scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
    in_progress: { label: 'In Progress', className: 'bg-accent text-accent-foreground' },
    complete: { label: 'Complete', className: 'bg-primary text-primary-foreground' },
    flagged: { label: 'Flagged', className: 'bg-destructive text-destructive-foreground' },
  };

  const statusInfo = statusConfig[job.status] || statusConfig.scheduled;
  const property = job.properties as any;
  const address = [property?.address, property?.suburb].filter(Boolean).join(', ');
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
            <CardTitle className="text-xl">{property?.property_name || 'Unknown Property'}</CardTitle>
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

      {/* Pricing — Admin read-only */}
      {role === 'admin' && (
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
                <p className="text-lg font-extrabold text-primary">
                  ${Number(job.price_ex_gst).toFixed(2)} ex GST
                  <span className="text-sm font-semibold text-muted-foreground ml-2">
                    (${(Number(job.price_ex_gst) * 1.1).toFixed(2)} inc GST)
                  </span>
                </p>
                {job.price_notes && (
                  <p className="text-sm text-muted-foreground">{job.price_notes}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Set on property ·{' '}
                  <button
                    onClick={() => navigate(`/properties/${job.property_id}/edit`)}
                    className="text-primary hover:underline font-semibold"
                  >
                    Edit property pricing
                  </button>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No price set</p>
                <div>
                  <Label className="text-sm font-semibold">Override Price (ex GST)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="0.00"
                    className="h-10 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Notes</Label>
                  <Input
                    value={priceNotes}
                    onChange={(e) => setPriceNotes(e.target.value)}
                    placeholder="e.g. One-off rate"
                    className="h-10 rounded-xl"
                  />
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

      {/* Notes */}
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

      {/* Invoicing Section - Admin only */}
      {role === 'admin' && job.status === 'complete' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Invoicing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.xero_invoice_number && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice #</span>
                <span className="text-sm font-bold">{job.xero_invoice_number}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <InvoiceBadge status={job.invoice_status} />
            </div>

            {!job.xero_invoice_id ? (
              <Button
                onClick={handlePushInvoice}
                disabled={pushingInvoice}
                className="w-full gap-2"
                style={{ backgroundColor: '#13B5EA' }}
              >
                {pushingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Push to Xero
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Xero
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleSyncInvoiceStatus}
                  disabled={syncingStatus}
                >
                  {syncingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                  Sync Xero Status
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <Button
          className="w-full gap-2 h-12 text-base font-bold"
          onClick={() => navigate(`/jobs/${jobId}/checklist`)}
        >
          <ClipboardList className="h-5 w-5" />
          {job.status === 'complete' ? 'View Checklist' : 'Open Checklist'}
        </Button>

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
                  This will permanently remove the job and its associated form data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setDeleting(true);
                    await supabase.from('job_forms').delete().eq('job_id', jobId!);
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
