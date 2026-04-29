import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Camera, CheckCircle2, Loader2, AlertTriangle, Phone, ImagePlus, MapPin, Clock, Navigation } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { syncToDrive } from '@/lib/driveSync';
import { JobCompletionModal } from '@/components/JobCompletionModal';
import { ReportIssueModal } from '@/components/checklist/ReportIssueModal';
import { getCurrentPosition } from '@/lib/geo';

// --------------- Types ---------------
interface FormData {
  // Key Yes/No fields
  property_vacant: string;
  linen_delivered: string;
  final_windows: string;
  final_doors: string;
  // Room completions & photos
  room_photos: Record<string, string[]>;
  room_complete: Record<string, boolean>;
  // Damage
  damage_noted: string;
  damage_description: string;
  damage_photo_url: string;
  // Sign-off
  cleaner1_signoff: boolean;
  cleaner1_signoff_time: string;
  cleaner2_signoff: boolean;
  cleaner2_signoff_time: string;
  // Summary
  time_in: string;
  time_out: string;
  issues_to_report: string;
  [key: string]: any;
}

const initialFormData = (): FormData => ({
  property_vacant: '',
  linen_delivered: '',
  final_windows: '',
  final_doors: '',
  room_photos: {},
  room_complete: {},
  damage_noted: '',
  damage_description: '',
  damage_photo_url: '',
  cleaner1_signoff: false,
  cleaner1_signoff_time: '',
  cleaner2_signoff: false,
  cleaner2_signoff_time: '',
  time_in: '',
  time_out: '',
  issues_to_report: '',
});

// --------------- Component ---------------
export default function JobChecklistPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user, profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Cleaner';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch job + property
  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, client_name, address, suburb, bedrooms, bathrooms)')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  // Fetch cleaner names
  const { data: cleanerProfiles } = useQuery({
    queryKey: ['job-cleaners', job?.cleaner_1_id, job?.cleaner_2_id],
    queryFn: async () => {
      const ids = [job!.cleaner_1_id, job!.cleaner_2_id].filter(Boolean) as string[];
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      return data || [];
    },
    enabled: !!job,
  });

  // Fetch existing form
  const { data: existingForm } = useQuery({
    queryKey: ['job-form', jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_forms')
        .select('*')
        .eq('job_id', jobId!)
        .maybeSingle();
      return data;
    },
    enabled: !!jobId,
  });

  // Fetch time entry
  const { data: timeEntry } = useQuery({
    queryKey: ['job-time-entry', jobId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('job_id', jobId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!jobId && !!user,
  });

  const property = (job as any)?.properties;
  const bathroomCount = property?.bathrooms || 1;
  const bedroomCount = property?.bedrooms || 1;

  const [form, setForm] = useState<FormData>(initialFormData());
  const [uploading, setUploading] = useState<string | null>(null);
  const [stopAlert, setStopAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoMenuRoom, setPhotoMenuRoom] = useState<string | null>(null);
  const [completionModal, setCompletionModal] = useState(false);
  const [nextJobInfo, setNextJobInfo] = useState<{ propertyName: string; address: string | null; scheduledTime: string | null } | null>(null);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [clockingOn, setClockingOn] = useState(false);
  const [clockOnTime, setClockOnTime] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');

  // Determine workflow phase from job data
  const hasArrived = !!job?.arrived_at;
  const hasClockedOn = !!job?.clock_on;

  // Live timer when clocked on but not clocked off
  useEffect(() => {
    const startTime = job?.clock_on || clockOnTime;
    if (!startTime || job?.clock_off) return;
    const update = () => {
      const ms = Date.now() - new Date(startTime).getTime();
      const s = Math.max(0, Math.floor(ms / 1000));
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sec = String(s % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${sec}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [job?.clock_on, clockOnTime, job?.clock_off]);

  const handleArrived = async () => {
    setArriving(true);
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getCurrentPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* proceed without GPS */ }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ arrived_at: now, arrived_lat: lat, arrived_lng: lng, status: 'in_progress' })
      .eq('id', job!.id);

    if (error) {
      toast.error('Failed to record arrival');
      setArriving(false);
      return;
    }
    toast.success('Location captured ✓');
    setArriving(false);
    queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
  };

  const handleClockOn = async () => {
    setClockingOn(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ clock_on: now })
      .eq('id', job!.id);

    if (error) {
      toast.error('Failed to clock on');
      setClockingOn(false);
      return;
    }

    // Also create time_entry for the banner
    await supabase.from('time_entries').insert({
      job_id: job!.id,
      user_id: user!.id,
      clock_in_time: now,
      geo_override: false,
    });

    setClockOnTime(now);
    toast.success('Clocked on! Timer started.');
    setClockingOn(false);
    queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
    queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
  };

  // Hydrate from existing form or initialize
  useEffect(() => {
    if (existingForm?.form_data && typeof existingForm.form_data === 'object') {
      const saved = existingForm.form_data as any;
      setForm({
        ...initialFormData(),
        ...saved,
        room_photos: saved.room_photos || {},
        room_complete: saved.room_complete || {},
      });
    }
  }, [existingForm]);

  // Auto-fill time from time entry or default to now
  useEffect(() => {
    if (timeEntry) {
      setForm((prev) => ({
        ...prev,
        time_in: prev.time_in || (timeEntry.clock_in_time ? format(new Date(timeEntry.clock_in_time), 'HH:mm') : format(new Date(), 'HH:mm')),
        time_out: prev.time_out || (timeEntry.clock_out_time ? format(new Date(timeEntry.clock_out_time), 'HH:mm') : format(new Date(), 'HH:mm')),
      }));
    } else if (job && !form.time_in) {
      const now = format(new Date(), 'HH:mm');
      setForm((prev) => ({
        ...prev,
        time_in: prev.time_in || now,
        time_out: prev.time_out || now,
      }));
    }
  }, [timeEntry, job]);

  const cleaner1Name = cleanerProfiles?.find((p) => p.id === job?.cleaner_1_id)?.full_name || 'Unassigned';
  const cleaner2Name = job?.cleaner_2_id ? (cleanerProfiles?.find((p) => p.id === job?.cleaner_2_id)?.full_name || 'None') : 'None';

  const updateField = useCallback((field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Photo upload with camera/library choice
  const uploadPhoto = async (roomOrField: string, useCamera: boolean, isRoomPhoto = true) => {
    setPhotoMenuRoom(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) {
      input.capture = 'environment';
    }
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(roomOrField);

      const safeRoom = roomOrField.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${jobId}/${safeRoom}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Upload failed: ' + uploadError.message);
        setUploading(null);
        return;
      }

      const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Get GPS
      let lat: number | null = null, lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* no gps */ }

      // Save to photos table
      await supabase.from('photos').insert({
        job_id: jobId!,
        property_id: job?.property_id,
        file_url: publicUrl,
        room_label: roomOrField,
        uploaded_by: user!.id,
        lat, lng,
        taken_at: new Date().toISOString(),
      });

      if (isRoomPhoto) {
        setForm((prev) => ({
          ...prev,
          room_photos: {
            ...prev.room_photos,
            [roomOrField]: [...(prev.room_photos[roomOrField] || []), publicUrl],
          },
        }));
      } else {
        updateField(roomOrField, publicUrl);
      }

      setUploading(null);
      toast.success('Photo uploaded');
    };
    input.click();
  };

  // Check stops
  const handleStopField = (field: string, value: string, message: string) => {
    updateField(field, value);
    if (value === 'no') {
      setStopAlert(message);
    }
  };

  // Room labels
  const roomLabels = useMemo(() => {
    const rooms = ['Entry', 'Kitchen'];
    for (let i = 0; i < bathroomCount; i++) rooms.push(`Bathroom ${i + 1}`);
    for (let i = 0; i < bedroomCount; i++) rooms.push(`Bedroom ${i + 1}`);
    rooms.push('Living Area', 'Outdoor');
    return rooms;
  }, [bathroomCount, bedroomCount]);

  const toggleRoomComplete = (room: string) => {
    setForm((prev) => ({
      ...prev,
      room_complete: { ...prev.room_complete, [room]: !prev.room_complete[room] },
    }));
  };

  // Validation — simplified
  const isMandatoryComplete = useMemo(() => {
    const keyFields = form.property_vacant !== '' && form.linen_delivered !== '' && form.final_windows !== '' && form.final_doors !== '';
    const photosComplete = roomLabels.every((r) => (form.room_photos[r]?.length || 0) >= 1);
    const roomsConfirmed = roomLabels.every((r) => form.room_complete[r]);
    const signoffs = form.cleaner1_signoff;
    return keyFields && photosComplete && roomsConfirmed && signoffs;
  }, [form, roomLabels]);

  // Calculate total time
  const totalTime = useMemo(() => {
    if (!form.time_in || !form.time_out) return '';
    const [inH, inM] = form.time_in.split(':').map(Number);
    const [outH, outM] = form.time_out.split(':').map(Number);
    const total = (outH * 60 + outM) - (inH * 60 + inM);
    if (total <= 0) return '';
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}h ${m}m`;
  }, [form.time_in, form.time_out]);

  // Count total uploaded photos across all rooms
  const totalPhotos = useMemo(() => {
    return Object.values(form.room_photos).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  }, [form.room_photos]);

  const isOneOffJob = !job?.series_id;
  const needsMinPhotos = isOneOffJob && totalPhotos < 3;

  // Submit
  const handleSubmit = async () => {
    // Block one-off jobs without enough photos
    if (isOneOffJob && totalPhotos < 3) {
      toast.error('Please upload at least 3 completion photos before finishing this job.');
      return;
    }
    setSubmitting(true);

    // Auto clock-out if still clocked in
    if (timeEntry && timeEntry.clock_in_time && !timeEntry.clock_out_time) {
      const now = new Date();
      const clockInTime = new Date(timeEntry.clock_in_time);
      const totalMinutes = Math.round((now.getTime() - clockInTime.getTime()) / 60000);
      await supabase
        .from('time_entries')
        .update({
          clock_out_time: now.toISOString(),
          total_minutes: totalMinutes,
        })
        .eq('id', timeEntry.id);

      queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
      queryClient.invalidateQueries({ queryKey: ['time-entry'] });
    }

    const formPayload = { ...form };

    if (existingForm) {
      await supabase.from('job_forms').update({
        form_data: formPayload as any,
        submitted_at: new Date().toISOString(),
      }).eq('id', existingForm.id);
    } else {
      await supabase.from('job_forms').insert({
        job_id: jobId!,
        property_id: job?.property_id,
        cleaner_id: user!.id,
        second_cleaner_id: job?.cleaner_2_id || null,
        form_data: formPayload as any,
        submitted_at: new Date().toISOString(),
      });
    }

    await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId!);

    const cleanerName = profile?.full_name?.split(' ')[0] || 'Cleaner';
    const notifMessage = `Job completed — ${property?.property_name} by ${cleanerName}`;
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'head_cleaner']);

    if (adminRoles?.length) {
      await (await import('@/lib/alerts')).createAlert({
        event_type: 'cleaner_checked_in',
        title: 'Job Completed',
        body: notifMessage,
        link: `/jobs/${jobId}`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });

    syncToDrive("sync_job_form", { job_id: jobId! });

    // Send Guest Ready SMS to clients
    try {
      supabase.functions.invoke('guest-ready-sms', {
        body: {
          job_id: jobId,
          property_name: property?.property_name,
          property_address: [property?.address, property?.suburb].filter(Boolean).join(', '),
        },
      }).then(({ error }) => {
        if (error) console.error('Guest Ready SMS failed:', error);
        else console.log('Guest Ready SMS sent');
      });
    } catch (smsErr) {
      console.error('Guest Ready SMS error:', smsErr);
    }

    // Send completion SMS (conditional recurring/one-off)
    try {
      supabase.functions.invoke('job-completed-sms', {
        body: { job_id: jobId },
      }).then(({ error }) => {
        if (error) console.error('Completion SMS failed:', error);
        else console.log('Completion SMS sent');
      });
    } catch (completionErr) {
      console.error('Completion SMS error:', completionErr);
    }
    // Auto-create Xero invoice if enabled
    try {
      const { data: autoCreateSetting } = await supabase
        .from('xero_settings')
        .select('value')
        .eq('key', 'auto_create_invoice')
        .single();

      const { data: xeroTokens } = await supabase
        .from('xero_tokens')
        .select('id')
        .limit(1);

      if (autoCreateSetting?.value === 'true' && xeroTokens?.length) {
        const { data: xeroSettings } = await supabase
          .from('xero_settings')
          .select('key, value');

        const settings = Object.fromEntries((xeroSettings || []).map(s => [s.key, s.value]));
        const cleanType = 'turnover'; // default
        const accountCode = settings[`account_code_${cleanType}`] || settings['account_code_default'] || '200';
        const invoicePrefix = settings['invoice_prefix'] || 'BCL-';
        const dueDays = settings['due_days'] || '7';
        const contactName = property?.client_name || property?.property_name || 'Unknown';
        const desc = `Turnover Clean — ${property?.property_name} — ${property?.suburb || ''} — ${job?.scheduled_date}`;

        console.log('Auto-creating Xero invoice for job:', jobId);
        supabase.functions.invoke('xero-create-invoice', {
          body: {
            job_id: jobId,
            contact_name: contactName,
            description: desc,
            amount: job?.price_ex_gst || 0,
            account_code: accountCode,
            invoice_prefix: invoicePrefix,
            due_days: dueDays,
          },
        }).then(({ error }) => {
          if (error) console.error('Auto Xero invoice failed:', error);
          else console.log('Xero invoice created automatically');
        });
      }
    } catch (xeroErr) {
      console.error('Xero auto-invoice check failed:', xeroErr);
    }

    // Fetch remaining jobs for today to show next job in modal
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todayJobs } = await supabase
      .from('jobs')
      .select('id, scheduled_time, status, properties(property_name, address, suburb)')
      .eq('scheduled_date', today)
      .or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`)
      .neq('id', jobId!)
      .neq('status', 'completed')
      .order('scheduled_time', { ascending: true });

    const nextJob = todayJobs?.[0];
    if (nextJob) {
      const prop = (nextJob as any).properties;
      setNextJobInfo({
        propertyName: prop?.property_name || 'Unknown',
        address: [prop?.address, prop?.suburb].filter(Boolean).join(', ') || null,
        scheduledTime: nextJob.scheduled_time ? nextJob.scheduled_time.slice(0, 5) : null,
      });
    } else {
      setNextJobInfo(null);
    }

    setCompletionModal(true);
    setSubmitting(false);
  };

  // Auto-save draft
  useEffect(() => {
    if (!jobId || !user) return;
    const timer = setTimeout(async () => {
      if (existingForm) {
        await supabase.from('job_forms').update({ form_data: form as any }).eq('id', existingForm.id);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [form, existingForm, jobId, user]);

  if (jobLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!job) return <div className="p-6 text-center text-muted-foreground">Job not found</div>;

  const isSubmitted = !!existingForm?.submitted_at;

  // ─── STEP 1: ARRIVAL GATE ───
  if (!hasArrived && !isSubmitted && job.status !== 'completed' && job.status !== 'complete') {
    const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
        <div className="bg-primary text-primary-foreground px-5 py-5">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-xl font-extrabold">On My Way</h1>
          <p className="text-primary-foreground/70 text-sm mt-1">Head to the property & tap when you arrive</p>
        </div>
        <main className="flex-1 px-4 py-5 space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-lg font-bold text-foreground">{property?.property_name ?? 'Property'}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{property?.address ?? 'No address'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{job.scheduled_time ? format(jobDate, 'h:mm a') : '—'}</span>
              </div>
            </div>
          </div>

          {property?.address && (
            <Button
              variant="outline"
              className="w-full h-14 text-base font-bold rounded-2xl"
              onClick={() => {
                const encoded = encodeURIComponent(property.address);
                const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
                window.open(isIos ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
              }}
            >
              <Navigation className="h-5 w-5 mr-2" /> Open in Maps
            </Button>
          )}

          <Button
            size="lg"
            className="w-full h-16 text-lg font-extrabold rounded-2xl bg-brightly hover:bg-brightly-hover text-white"
            onClick={handleArrived}
            disabled={arriving}
          >
            {arriving ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
            I've Arrived
          </Button>
        </main>
      </div>
    );
  }

  // ─── STEP 2: CLOCK ON GATE ───
  if (hasArrived && !hasClockedOn && !clockOnTime && !isSubmitted && job.status !== 'completed' && job.status !== 'complete') {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
        <div className="bg-primary text-primary-foreground px-5 py-5">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-xl font-extrabold">Ready to Start</h1>
          <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
        </div>
        <main className="flex-1 px-4 py-5 space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-sm text-brightly font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Arrival recorded
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{property?.address ?? 'No address'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">Arrived {format(new Date(job.arrived_at!), 'h:mm a')}</span>
              </div>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-16 text-lg font-extrabold rounded-2xl bg-brightly hover:bg-brightly-hover text-white"
            onClick={handleClockOn}
            disabled={clockingOn}
          >
            {clockingOn ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Clock className="h-6 w-6 mr-2" />}
            Clock On
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl pb-24">
      {/* Running timer banner */}
      {(hasClockedOn || clockOnTime) && !job?.clock_off && (
        <div className="bg-accent text-accent-foreground rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <span className="font-extrabold text-lg">{elapsed}</span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">{property?.property_name}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <h1 className="text-2xl font-extrabold text-primary">Job Checklist</h1>

      {isSubmitted && (
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm font-bold text-primary">
          ✓ This form was submitted on {format(new Date(existingForm!.submitted_at!), 'PPP p')}
        </div>
      )}

      {/* Job Details — Pre-filled, read-only */}
      <Section title="Job Details">
        <ReadOnlyField label="Property" value={property?.property_name || (job as any)?.client_name || property?.client_name || (job as any)?.property_address || 'Untitled job'} />
        <ReadOnlyField label="Date" value={job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : ''} />
        <ReadOnlyField label="Cleaner 1" value={cleaner1Name} />
        <ReadOnlyField label="Cleaner 2" value={cleaner2Name} />
      </Section>

      {/* Key Checks — Only 4 Yes/No fields */}
      <Section title="1. Key Checks">
        <ToggleField
          label="Property vacant on arrival? *"
          value={form.property_vacant}
          onChange={(v) => handleStopField('property_vacant', v, 'Do not enter. Call office: 0418 878 707')}
          disabled={isSubmitted}
        />
        <ToggleField
          label="Hire linen delivered? *"
          value={form.linen_delivered}
          onChange={(v) => handleStopField('linen_delivered', v, 'Do not begin clean. Call office: 0418 878 707')}
          disabled={isSubmitted}
        />
        <ToggleField label="All windows closed and locked? *" value={form.final_windows} onChange={(v) => updateField('final_windows', v)} disabled={isSubmitted} />
        <ToggleField label="All doors secured? *" value={form.final_doors} onChange={(v) => updateField('final_doors', v)} disabled={isSubmitted} />
      </Section>

      {/* Damage */}
      <Section title="2. Damage / Issues">
        <ToggleField label="Damage or issues noted?" value={form.damage_noted} onChange={(v) => updateField('damage_noted', v)} disabled={isSubmitted} />
        {form.damage_noted === 'yes' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-foreground">Description</Label>
              <Textarea value={form.damage_description} onChange={(e) => updateField('damage_description', e.target.value)} className="rounded-2xl" disabled={isSubmitted} />
            </div>
            {!isSubmitted && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => uploadPhoto('damage_photo', true, false)} disabled={uploading === 'damage_photo'}>
                  {uploading === 'damage_photo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  Take Photo
                </Button>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => uploadPhoto('damage_photo', false, false)} disabled={uploading === 'damage_photo'}>
                  <ImagePlus className="w-4 h-4" /> Choose from Library
                </Button>
              </div>
            )}
            {form.damage_photo_url && <img src={form.damage_photo_url} alt="Damage" className="w-20 h-20 rounded-xl object-cover border border-border" />}
          </>
        )}
      </Section>

      {/* Room Sections — Photo + Confirm */}
      <Section title="3. Room Photos & Confirmation">
        <p className="text-sm text-muted-foreground mb-2">Upload at least 1 photo per room, then confirm room is complete.</p>
        <div className="space-y-5">
          {roomLabels.map((room) => {
            const photos = form.room_photos[room] || [];
            const isComplete = form.room_complete[room];
            return (
              <div key={room} className="border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold text-foreground">{room}</Label>
                  <span className="text-xs text-muted-foreground">{photos.length} photo(s)</span>
                </div>

                {photos.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {photos.map((url, i) => (
                      <img key={i} src={url} alt={`${room} ${i + 1}`} className="w-16 h-16 rounded-xl object-cover border border-border" />
                    ))}
                  </div>
                )}

                {!isSubmitted && (
                  <>
                    {photoMenuRoom === room ? (
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => uploadPhoto(room, true)} disabled={uploading === room}>
                          {uploading === room ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                          Take Photo
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => uploadPhoto(room, false)} disabled={uploading === room}>
                          <ImagePlus className="w-4 h-4" /> Choose from Library
                        </Button>
                        <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={() => setPhotoMenuRoom(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setPhotoMenuRoom(room)} disabled={uploading === room}>
                        {uploading === room ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        Add Photo
                      </Button>
                    )}
                  </>
                )}

                {!isSubmitted && photos.length >= 1 && (
                  <button
                    onClick={() => toggleRoomComplete(room)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm transition-colors',
                      isComplete
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isComplete ? 'Room Confirmed ✓' : 'This room is complete'}
                  </button>
                )}

                {isSubmitted && isComplete && (
                  <div className="flex items-center gap-2 text-sm text-primary font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Room confirmed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Sign-Off */}
      <Section title="4. Sign-Off">
        <SignOffButton
          label="Cleaner 1 confirms all work complete"
          signed={form.cleaner1_signoff}
          signedTime={form.cleaner1_signoff_time}
          signedName={cleaner1Name}
          onSign={async () => {
            const now = new Date();
            const nowIso = now.toISOString();
            const nowTime = format(now, 'HH:mm');

            updateField('cleaner1_signoff', true);
            updateField('cleaner1_signoff_time', nowIso);
            updateField('time_out', nowTime);

            // Auto clock-out: update time_entry for this job
            if (timeEntry && timeEntry.clock_in_time && !timeEntry.clock_out_time) {
              const clockInTime = new Date(timeEntry.clock_in_time);
              const totalMinutes = Math.round((now.getTime() - clockInTime.getTime()) / 60000);
              await supabase
                .from('time_entries')
                .update({
                  clock_out_time: nowIso,
                  total_minutes: totalMinutes,
                })
                .eq('id', timeEntry.id);

              queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
              queryClient.invalidateQueries({ queryKey: ['time-entry'] });
              queryClient.invalidateQueries({ queryKey: ['job-time-entry'] });
            }
          }}
          disabled={isSubmitted || form.cleaner1_signoff}
        />
        {cleaner2Name !== 'None' && (
          <SignOffButton
            label="Cleaner 2 confirms they checked Cleaner 1's work"
            signed={form.cleaner2_signoff}
            signedTime={form.cleaner2_signoff_time}
            signedName={cleaner2Name}
            onSign={() => {
              updateField('cleaner2_signoff', true);
              updateField('cleaner2_signoff_time', new Date().toISOString());
            }}
            disabled={isSubmitted || form.cleaner2_signoff}
          />
        )}
      </Section>

      {/* Job Summary */}
      <Section title="5. Job Summary">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-foreground">Time In</Label>
            <TimeSelect value={form.time_in} onChange={(v) => updateField('time_in', v)} className="h-14 rounded-2xl" disabled={isSubmitted} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-foreground">Time Out</Label>
            <TimeSelect value={form.time_out} onChange={(v) => updateField('time_out', v)} className="h-14 rounded-2xl" disabled={isSubmitted} />
          </div>
        </div>
        {totalTime && (
          <div className="bg-secondary rounded-2xl p-3 text-center font-bold text-secondary-foreground">
            Total time on site: {totalTime}
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold text-foreground">Issues to Report (optional)</Label>
          <Textarea value={form.issues_to_report} onChange={(e) => updateField('issues_to_report', e.target.value)} className="rounded-2xl" disabled={isSubmitted} placeholder="Any issues, maintenance needed, etc." />
        </div>
      </Section>

      {/* Supplies / Damage flags */}
      {!isSubmitted && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="border-amber-400/60 text-amber-700 dark:text-amber-400 font-bold rounded-2xl h-14 gap-2 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            onClick={async () => {
              const { error } = await (supabase as any).from('property_issues').insert({
                job_id: jobId,
                property_id: job?.property_id,
                room: 'Supplies',
                description: 'Client supplies are running low — please restock before next guest.',
                reported_by: (await supabase.auth.getUser()).data.user?.id,
              });
              if (!error) {
                const { createAlert } = await import('@/lib/alerts');
                await createAlert({
                  event_type: 'supplies_low',
                  title: 'Supplies Low',
                  body: `Client supplies running low at ${job?.properties?.property_name || 'property'}`,
                  link: `/jobs/${jobId}`,
                });
                toast.success('Supplies flag sent to admin');
              } else {
                toast.error('Could not send flag');
              }
            }}
          >
            <span className="text-base">📦</span> Supplies Low
          </Button>
          <Button
            variant="outline"
            className="border-destructive/60 text-destructive font-bold rounded-2xl h-14 gap-2"
            onClick={() => setReportIssueOpen(true)}
          >
            <AlertTriangle className="w-5 h-5" /> Report Issue
          </Button>
        </div>
      )}

      {/* Photo warning for one-off jobs */}
      {!isSubmitted && needsMinPhotos && (
        <div className="bg-accent/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-accent-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-foreground">
              ⚠️ Please upload at least 3 completion photos before finishing this job.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You've uploaded {totalPhotos}/3 photos. One-off jobs require completion photos.
            </p>
          </div>
        </div>
      )}

      {/* Submit */}
      {!isSubmitted && (
        <Button
          size="lg"
          className="w-full bg-primary text-primary-foreground font-extrabold rounded-2xl h-16 text-lg"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
          Submit Job
        </Button>
      )}

      {/* Report Issue Modal */}
      <ReportIssueModal
        open={reportIssueOpen}
        onOpenChange={setReportIssueOpen}
        jobId={jobId!}
        propertyId={job?.property_id || ''}
        roomLabels={roomLabels}
      />

      {!isMandatoryComplete && !isSubmitted && (
        <p className="text-xs text-center text-muted-foreground">
          Complete key checks, upload 1+ photo per room, confirm each room, and sign off to enable full validation. You can still submit for testing.
        </p>
      )}

      {/* Stop Alert Dialog */}
      <AlertDialog open={!!stopAlert} onOpenChange={() => setStopAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> STOP
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-semibold">
              {stopAlert}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-destructive text-destructive-foreground gap-2" onClick={() => { window.location.href = 'tel:0418878707'; }}>
              <Phone className="w-4 h-4" /> Call Office
            </AlertDialogAction>
            <AlertDialogCancel>Dismiss</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <JobCompletionModal
        open={completionModal}
        onClose={() => setCompletionModal(false)}
        firstName={firstName}
        nextJob={nextJobInfo}
        onBackToDashboard={() => navigate('/')}
      />
    </div>
  );
}

// --------------- Sub-components ---------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

function ToggleField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium text-foreground flex-1">{label}</span>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => !disabled && onChange('yes')}
          className={cn(
            'w-16 h-10 rounded-xl text-xs font-bold transition-colors',
            value === 'yes' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            disabled && 'opacity-60 cursor-not-allowed'
          )}
        >Yes</button>
        <button
          onClick={() => !disabled && onChange('no')}
          className={cn(
            'w-16 h-10 rounded-xl text-xs font-bold transition-colors',
            value === 'no' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            disabled && 'opacity-60 cursor-not-allowed'
          )}
        >No</button>
      </div>
    </div>
  );
}

function SignOffButton({ label, signed, signedTime, signedName, onSign, disabled }: { label: string; signed: boolean; signedTime: string; signedName: string; onSign: () => void | Promise<void>; disabled?: boolean }) {
  const [signing, setSigning] = useState(false);

  const handleSign = async () => {
    setSigning(true);
    await onSign();
    setSigning(false);
  };

  return (
    <div className="space-y-2 py-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {signed ? (
        <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-bold text-primary">{signedName}</p>
            <p className="text-xs text-muted-foreground">{signedTime ? format(new Date(signedTime), 'PPP p') : ''}</p>
          </div>
        </div>
      ) : (
        <Button
          onClick={handleSign}
          disabled={disabled || signing}
          className="w-full bg-primary text-primary-foreground font-bold rounded-xl h-12 gap-2"
        >
          {signing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          Sign Off
        </Button>
      )}
    </div>
  );
}
