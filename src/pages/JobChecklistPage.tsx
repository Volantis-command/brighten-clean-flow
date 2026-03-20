import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Camera, CheckCircle2, XCircle, Loader2, AlertTriangle, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { syncToDrive } from '@/lib/driveSync';

// --------------- Types ---------------
interface FormData {
  // Section 1
  property_vacant: string;
  entry_photo_taken: string;
  entry_photo_url: string;
  walkthrough_completed: string;
  damage_noted: string;
  damage_description: string;
  damage_photo_url: string;
  // Section 2
  linen_delivered: string;
  linen_quantity_correct: string;
  damaged_linen: string;
  damaged_linen_description: string;
  damaged_linen_photo_url: string;
  dirty_linen_bagged: string;
  // Section 3
  beds_stripped: string;
  towels_collected: string;
  bins_emptied: string;
  rubbish_removed: string;
  laundry_started: string;
  // Section 4
  kitchen_benches: string;
  kitchen_stovetop: string;
  kitchen_microwave: string;
  kitchen_appliances: string;
  kitchen_fridge: string;
  kitchen_sink: string;
  kitchen_dishes: string;
  kitchen_cabinets: string;
  kitchen_floor: string;
  kitchen_consumables: string;
  // Section 5 — dynamic bathrooms
  bathrooms: BathroomData[];
  // Section 6 — dynamic bedrooms
  bedrooms: BedroomData[];
  // Section 7
  living_cushions: string;
  living_tables: string;
  living_remotes: string;
  living_shelves: string;
  living_sofas: string;
  living_floors: string;
  living_switches: string;
  living_outdoor: string;
  // Section 8
  final_walkthrough: string;
  final_windows: string;
  final_lights: string;
  final_doors: string;
  // Section 9 — photos per room
  room_photos: Record<string, string[]>;
  // Section 10
  cleaner1_signoff: boolean;
  cleaner1_signoff_time: string;
  cleaner2_signoff: boolean;
  cleaner2_signoff_time: string;
  // Section 11
  time_in: string;
  time_out: string;
  issues_to_report: string;
  [key: string]: any;
}

interface BathroomData {
  toilet: string; shower: string; sink: string; tapware: string; walls: string; floor: string; consumables: string;
}

interface BedroomData {
  linen: string; surfaces: string; under_bed: string; mirrors: string; wardrobe: string; floor: string;
}

const emptyBathroom = (): BathroomData => ({ toilet: '', shower: '', sink: '', tapware: '', walls: '', floor: '', consumables: '' });
const emptyBedroom = (): BedroomData => ({ linen: '', surfaces: '', under_bed: '', mirrors: '', wardrobe: '', floor: '' });

const initialFormData = (bathroomCount: number, bedroomCount: number): FormData => ({
  property_vacant: '', entry_photo_taken: '', entry_photo_url: '', walkthrough_completed: '',
  damage_noted: '', damage_description: '', damage_photo_url: '',
  linen_delivered: '', linen_quantity_correct: '', damaged_linen: '', damaged_linen_description: '',
  damaged_linen_photo_url: '', dirty_linen_bagged: '',
  beds_stripped: '', towels_collected: '', bins_emptied: '', rubbish_removed: '', laundry_started: '',
  kitchen_benches: '', kitchen_stovetop: '', kitchen_microwave: '', kitchen_appliances: '',
  kitchen_fridge: '', kitchen_sink: '', kitchen_dishes: '', kitchen_cabinets: '', kitchen_floor: '', kitchen_consumables: '',
  bathrooms: Array.from({ length: Math.max(bathroomCount, 1) }, emptyBathroom),
  bedrooms: Array.from({ length: Math.max(bedroomCount, 1) }, emptyBedroom),
  living_cushions: '', living_tables: '', living_remotes: '', living_shelves: '',
  living_sofas: '', living_floors: '', living_switches: '', living_outdoor: '',
  final_walkthrough: '', final_windows: '', final_lights: '', final_doors: '',
  room_photos: {},
  cleaner1_signoff: false, cleaner1_signoff_time: '',
  cleaner2_signoff: false, cleaner2_signoff_time: '',
  time_in: '', time_out: '', issues_to_report: '',
});

// --------------- Component ---------------
export default function JobChecklistPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  // Fetch job + property
  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job-detail', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb, bedrooms, bathrooms)')
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

  const [form, setForm] = useState<FormData>(initialFormData(bathroomCount, bedroomCount));
  const [uploading, setUploading] = useState<string | null>(null);
  const [stopAlert, setStopAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from existing form or initialize
  useEffect(() => {
    if (existingForm?.form_data && typeof existingForm.form_data === 'object') {
      const saved = existingForm.form_data as any;
      setForm({
        ...initialFormData(bathroomCount, bedroomCount),
        ...saved,
        bathrooms: saved.bathrooms?.length >= bathroomCount ? saved.bathrooms : Array.from({ length: bathroomCount }, (_, i) => saved.bathrooms?.[i] || emptyBathroom()),
        bedrooms: saved.bedrooms?.length >= bedroomCount ? saved.bedrooms : Array.from({ length: bedroomCount }, (_, i) => saved.bedrooms?.[i] || emptyBedroom()),
      });
    } else if (property) {
      setForm(initialFormData(bathroomCount, bedroomCount));
    }
  }, [existingForm, property, bathroomCount, bedroomCount]);

  // Auto-fill time from time entry
  useEffect(() => {
    if (timeEntry) {
      setForm((prev) => ({
        ...prev,
        time_in: prev.time_in || (timeEntry.clock_in_time ? format(new Date(timeEntry.clock_in_time), 'HH:mm') : ''),
        time_out: prev.time_out || (timeEntry.clock_out_time ? format(new Date(timeEntry.clock_out_time), 'HH:mm') : ''),
      }));
    }
  }, [timeEntry]);

  const cleaner1Name = cleanerProfiles?.find((p) => p.id === job?.cleaner_1_id)?.full_name || 'Unassigned';
  const cleaner2Name = cleanerProfiles?.find((p) => p.id === job?.cleaner_2_id)?.full_name || 'None';

  const updateField = useCallback((field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateBathroom = useCallback((idx: number, field: keyof BathroomData, value: string) => {
    setForm((prev) => {
      const bathrooms = [...prev.bathrooms];
      bathrooms[idx] = { ...bathrooms[idx], [field]: value };
      return { ...prev, bathrooms };
    });
  }, []);

  const updateBedroom = useCallback((idx: number, field: keyof BedroomData, value: string) => {
    setForm((prev) => {
      const bedrooms = [...prev.bedrooms];
      bedrooms[idx] = { ...bedrooms[idx], [field]: value };
      return { ...prev, bedrooms };
    });
  }, []);

  // Photo upload
  const uploadPhoto = async (fieldOrRoom: string, isRoomPhoto = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(fieldOrRoom);

      const fileName = `${jobId}/${fieldOrRoom}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file);
      if (uploadError) { toast.error('Upload failed'); setUploading(null); return; }

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
        room_label: fieldOrRoom,
        uploaded_by: user!.id,
        lat, lng,
        taken_at: new Date().toISOString(),
      });

      if (isRoomPhoto) {
        setForm((prev) => ({
          ...prev,
          room_photos: {
            ...prev.room_photos,
            [fieldOrRoom]: [...(prev.room_photos[fieldOrRoom] || []), publicUrl],
          },
        }));
      } else {
        updateField(fieldOrRoom, publicUrl);
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

  // Room labels for photos
  const roomLabels = useMemo(() => {
    const rooms = ['Entry', 'Kitchen'];
    for (let i = 0; i < bathroomCount; i++) rooms.push(`Bathroom ${i + 1}`);
    for (let i = 0; i < bedroomCount; i++) rooms.push(`Bedroom ${i + 1}`);
    rooms.push('Living Area', 'Outdoor');
    return rooms;
  }, [bathroomCount, bedroomCount]);

  // Validation
  const isMandatoryComplete = useMemo(() => {
    const yesFields = [
      'walkthrough_completed', 'dirty_linen_bagged',
      'beds_stripped', 'towels_collected', 'bins_emptied', 'rubbish_removed', 'laundry_started',
      'kitchen_benches', 'kitchen_stovetop', 'kitchen_microwave', 'kitchen_appliances',
      'kitchen_fridge', 'kitchen_sink', 'kitchen_dishes', 'kitchen_cabinets', 'kitchen_floor', 'kitchen_consumables',
      'living_cushions', 'living_tables', 'living_remotes', 'living_shelves',
      'living_sofas', 'living_floors', 'living_switches',
      'final_walkthrough', 'final_windows', 'final_lights', 'final_doors',
    ];
    const allFieldsFilled = yesFields.every((f) => form[f] !== '');
    const arrivalFilled = form.property_vacant !== '' && form.entry_photo_taken !== '' && form.damage_noted !== '';
    const linenFilled = form.linen_delivered !== '' && form.linen_quantity_correct !== '' && form.damaged_linen !== '';
    const livingOutdoor = form.living_outdoor !== '';
    const bathroomsComplete = form.bathrooms.every((b) => Object.values(b).every((v) => v !== ''));
    const bedroomsComplete = form.bedrooms.every((b) => Object.values(b).every((v) => v !== ''));
    const photosComplete = roomLabels.every((r) => (form.room_photos[r]?.length || 0) >= 1);
    const signoffs = form.cleaner1_signoff && form.cleaner2_signoff;

    return allFieldsFilled && arrivalFilled && linenFilled && livingOutdoor && bathroomsComplete && bedroomsComplete && photosComplete && signoffs;
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

  // Submit
  const handleSubmit = async () => {
    if (!isMandatoryComplete) { toast.error('Please complete all mandatory fields'); return; }
    setSubmitting(true);

    const formPayload = { ...form };

    // Upsert job_form
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

    // Update job status
    await supabase.from('jobs').update({ status: 'complete' }).eq('id', jobId!);

    // Send notifications
    const notifMessage = `Job completed: ${property?.property_name} on ${job?.scheduled_date}`;
    // Get admin and head_cleaner user IDs
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'head_cleaner']);

    if (adminRoles?.length) {
      const notifs = adminRoles
        .filter((r) => r.user_id !== user!.id)
        .map((r) => ({ user_id: r.user_id, message: notifMessage, type: 'job_complete' }));
      if (notifs.length) await supabase.from('notifications').insert(notifs);
    }

    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });

    // Fire-and-forget Google Drive sync
    syncToDrive("sync_job_form", { job_id: jobId! });

    toast.success('Job submitted successfully!');
    navigate('/schedule');
    setSubmitting(false);
  };

  // Auto-save draft on field changes (debounced)
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

  return (
    <div className="space-y-6 max-w-2xl pb-24">
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

      {/* Header */}
      <Section title="Job Details">
        <ReadOnlyField label="Property" value={property?.property_name || ''} />
        <ReadOnlyField label="Date" value={job.scheduled_date || ''} />
        <ReadOnlyField label="Cleaner 1" value={cleaner1Name} />
        <ReadOnlyField label="Cleaner 2" value={cleaner2Name} />
      </Section>

      {/* Section 1 — Arrival */}
      <Section title="1. Arrival">
        <ToggleField label="Property vacant on arrival? *" value={form.property_vacant}
          onChange={(v) => handleStopField('property_vacant', v, 'Do not enter. Call office: 0418 878 707')}
          disabled={isSubmitted} />
        <ToggleField label="Entry photo taken? *" value={form.entry_photo_taken} onChange={(v) => updateField('entry_photo_taken', v)} disabled={isSubmitted} />
        {form.entry_photo_taken === 'yes' && (
          <PhotoUploadButton label="Upload entry photo" field="entry_photo_url" url={form.entry_photo_url} uploading={uploading} onUpload={() => uploadPhoto('entry_photo_url')} disabled={isSubmitted} />
        )}
        <ToggleField label="Walk-through completed? *" value={form.walkthrough_completed} onChange={(v) => updateField('walkthrough_completed', v)} disabled={isSubmitted} />
        <ToggleField label="Damage or issues noted on arrival? *" value={form.damage_noted} onChange={(v) => updateField('damage_noted', v)} disabled={isSubmitted} />
        {form.damage_noted === 'yes' && (
          <>
            <FormField label="Damage Description">
              <Textarea value={form.damage_description} onChange={(e) => updateField('damage_description', e.target.value)} className="rounded-2xl" disabled={isSubmitted} />
            </FormField>
            <PhotoUploadButton label="Upload damage photo" field="damage_photo_url" url={form.damage_photo_url} uploading={uploading} onUpload={() => uploadPhoto('damage_photo_url')} disabled={isSubmitted} />
          </>
        )}
      </Section>

      {/* Section 2 — Linen */}
      <Section title="2. Linen">
        <ToggleField label="Hire linen delivered? *" value={form.linen_delivered}
          onChange={(v) => handleStopField('linen_delivered', v, 'Do not begin clean. Call office: 0418 878 707')}
          disabled={isSubmitted} />
        <ToggleField label="Linen quantity correct? *" value={form.linen_quantity_correct}
          onChange={(v) => { updateField('linen_quantity_correct', v); if (v === 'no') toast.warning('Call office about linen shortage: 0418 878 707'); }}
          disabled={isSubmitted} />
        <ToggleField label="Damaged linen found? *" value={form.damaged_linen} onChange={(v) => updateField('damaged_linen', v)} disabled={isSubmitted} />
        {form.damaged_linen === 'yes' && (
          <>
            <FormField label="Item Description">
              <Textarea value={form.damaged_linen_description} onChange={(e) => updateField('damaged_linen_description', e.target.value)} className="rounded-2xl" disabled={isSubmitted} />
            </FormField>
            <PhotoUploadButton label="Upload damaged linen photo" field="damaged_linen_photo_url" url={form.damaged_linen_photo_url} uploading={uploading} onUpload={() => uploadPhoto('damaged_linen_photo_url')} disabled={isSubmitted} />
          </>
        )}
        <ToggleField label="Dirty linen bagged and at collection point? *" value={form.dirty_linen_bagged} onChange={(v) => updateField('dirty_linen_bagged', v)} disabled={isSubmitted} />
      </Section>

      {/* Section 3 — Strip & Reset */}
      <Section title="3. Strip & Reset">
        {[
          ['beds_stripped', 'All beds stripped'],
          ['towels_collected', 'Towels and bath mats collected'],
          ['bins_emptied', 'All bins emptied'],
          ['rubbish_removed', 'Rubbish removed'],
          ['laundry_started', 'Laundry started or handed to supplier'],
        ].map(([key, label]) => (
          <ToggleField key={key} label={`${label} *`} value={form[key]} onChange={(v) => updateField(key, v)} disabled={isSubmitted} />
        ))}
      </Section>

      {/* Section 4 — Kitchen */}
      <Section title="4. Kitchen">
        {[
          ['kitchen_benches', 'Benches wiped and disinfected'],
          ['kitchen_stovetop', 'Stovetop cleaned'],
          ['kitchen_microwave', 'Microwave interior + exterior cleaned'],
          ['kitchen_appliances', 'All appliances wiped'],
          ['kitchen_fridge', 'Fridge exterior + handles wiped; interior checked'],
          ['kitchen_sink', 'Sink cleaned and disinfected; tapware shined'],
          ['kitchen_dishes', 'Dishes washed or dishwasher run'],
          ['kitchen_cabinets', 'Cabinet fronts wiped'],
          ['kitchen_floor', 'Floor swept and mopped'],
          ['kitchen_consumables', 'Consumables restocked'],
        ].map(([key, label]) => (
          <ToggleField key={key} label={`${label} *`} value={form[key]} onChange={(v) => updateField(key, v)} disabled={isSubmitted} />
        ))}
      </Section>

      {/* Section 5 — Bathrooms */}
      {form.bathrooms.map((bath, idx) => (
        <Section key={`bath-${idx}`} title={`5. Bathroom ${idx + 1}`}>
          {([
            ['toilet', 'Toilet cleaned — bowl, seat, lid, base'],
            ['shower', 'Shower/bath scrubbed'],
            ['sink', 'Sink and vanity disinfected'],
            ['tapware', 'Tapware and mirrors streak-free'],
            ['walls', 'Walls wiped if splash marks'],
            ['floor', 'Floor swept and mopped'],
            ['consumables', 'Consumables restocked'],
          ] as [keyof BathroomData, string][]).map(([key, label]) => (
            <ToggleField key={key} label={`${label} *`} value={bath[key]} onChange={(v) => updateBathroom(idx, key, v)} disabled={isSubmitted} />
          ))}
        </Section>
      ))}

      {/* Section 6 — Bedrooms */}
      {form.bedrooms.map((bed, idx) => (
        <Section key={`bed-${idx}`} title={`6. Bedroom ${idx + 1}`}>
          {([
            ['linen', 'Fresh linen made to hotel standard'],
            ['surfaces', 'All surfaces dusted'],
            ['under_bed', 'Under bed cleared and vacuumed'],
            ['mirrors', 'Mirrors cleaned'],
            ['wardrobe', 'Wardrobe checked, guest items removed'],
            ['floor', 'Floor vacuumed'],
          ] as [keyof BedroomData, string][]).map(([key, label]) => (
            <ToggleField key={key} label={`${label} *`} value={bed[key]} onChange={(v) => updateBedroom(idx, key, v)} disabled={isSubmitted} />
          ))}
        </Section>
      ))}

      {/* Section 7 — Living Areas */}
      <Section title="7. Living Areas">
        {[
          ['living_cushions', 'Cushions and throws fluffed'],
          ['living_tables', 'Coffee table, side tables, TV unit wiped'],
          ['living_remotes', 'Remotes cleaned and functional'],
          ['living_shelves', 'Shelves, frames, window sills, blinds dusted'],
          ['living_sofas', 'Sofas vacuumed'],
          ['living_floors', 'All floors vacuumed; hard floors mopped'],
          ['living_switches', 'Light switches and door handles wiped'],
        ].map(([key, label]) => (
          <ToggleField key={key} label={`${label} *`} value={form[key]} onChange={(v) => updateField(key, v)} disabled={isSubmitted} />
        ))}
        <ToggleFieldThree label="Outdoor areas: balcony/patio swept, furniture wiped *" value={form.living_outdoor} onChange={(v) => updateField('living_outdoor', v)} disabled={isSubmitted} />
      </Section>

      {/* Section 8 — Final Checks */}
      <Section title="8. Final Checks">
        {[
          ['final_walkthrough', 'Walk-through complete — property guest-ready?'],
          ['final_windows', 'All windows closed and locked'],
          ['final_lights', 'All lights off'],
          ['final_doors', 'All doors secured'],
        ].map(([key, label]) => (
          <ToggleField key={key} label={`${label} *`} value={form[key]} onChange={(v) => updateField(key, v)} disabled={isSubmitted} />
        ))}
      </Section>

      {/* Section 9 — Photo Submission */}
      <Section title="9. Photo Submission (1 per room minimum)">
        <div className="space-y-4">
          {roomLabels.map((room) => (
            <div key={room} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-foreground">{room}</Label>
                <span className="text-xs text-muted-foreground">{form.room_photos[room]?.length || 0} photo(s)</span>
              </div>
              {(form.room_photos[room] || []).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {form.room_photos[room].map((url, i) => (
                    <img key={i} src={url} alt={`${room} ${i + 1}`} className="w-16 h-16 rounded-xl object-cover border border-border" />
                  ))}
                </div>
              )}
              {!isSubmitted && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => uploadPhoto(room, true)} disabled={uploading === room}>
                  {uploading === room ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  Add Photo
                </Button>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Section 10 — Dual Sign-Off */}
      <Section title="10. Dual Sign-Off">
        <SignOffButton
          label="Cleaner 1 confirms all work complete"
          signed={form.cleaner1_signoff}
          signedTime={form.cleaner1_signoff_time}
          signedName={cleaner1Name}
          onSign={() => {
            updateField('cleaner1_signoff', true);
            updateField('cleaner1_signoff_time', new Date().toISOString());
          }}
          disabled={isSubmitted || form.cleaner1_signoff}
        />
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
      </Section>

      {/* Section 11 — Job Summary */}
      <Section title="11. Job Summary">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Time In">
            <Input type="time" value={form.time_in} onChange={(e) => updateField('time_in', e.target.value)} className="h-14 rounded-2xl" disabled={isSubmitted} />
          </FormField>
          <FormField label="Time Out">
            <Input type="time" value={form.time_out} onChange={(e) => updateField('time_out', e.target.value)} className="h-14 rounded-2xl" disabled={isSubmitted} />
          </FormField>
        </div>
        {totalTime && (
          <div className="bg-secondary rounded-2xl p-3 text-center font-bold text-secondary-foreground">
            Total time on site: {totalTime}
          </div>
        )}
        <FormField label="Issues to Report (optional)">
          <Textarea value={form.issues_to_report} onChange={(e) => updateField('issues_to_report', e.target.value)} className="rounded-2xl" disabled={isSubmitted} placeholder="Any issues, maintenance needed, etc." />
        </FormField>
      </Section>

      {/* Submit */}
      {!isSubmitted && (
        <Button
          size="lg"
          className="w-full bg-primary text-primary-foreground font-extrabold rounded-2xl h-16 text-lg"
          disabled={!isMandatoryComplete || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
          Submit Job
        </Button>
      )}

      {!isMandatoryComplete && !isSubmitted && (
        <p className="text-xs text-center text-muted-foreground">Complete all mandatory fields, upload room photos, and both cleaners must sign off before submitting.</p>
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
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

function ToggleFieldThree({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-medium text-foreground flex-1">{label}</span>
      <div className="flex gap-1.5 shrink-0">
        {['yes', 'no', 'na'].map((opt) => (
          <button
            key={opt}
            onClick={() => !disabled && onChange(opt)}
            className={cn(
              'w-14 h-10 rounded-xl text-xs font-bold transition-colors',
              value === opt
                ? opt === 'yes' ? 'bg-primary text-primary-foreground' : opt === 'no' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
          >{opt === 'na' ? 'N/A' : opt.charAt(0).toUpperCase() + opt.slice(1)}</button>
        ))}
      </div>
    </div>
  );
}

function PhotoUploadButton({ label, field, url, uploading, onUpload, disabled }: { label: string; field: string; url: string; uploading: string | null; onUpload: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      {url && <img src={url} alt={label} className="w-20 h-20 rounded-xl object-cover border border-border" />}
      {!disabled && (
        <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={onUpload} disabled={uploading === field}>
          {uploading === field ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {label}
        </Button>
      )}
    </div>
  );
}

function SignOffButton({ label, signed, signedTime, signedName, onSign, disabled }: { label: string; signed: boolean; signedTime: string; signedName: string; onSign: () => void; disabled?: boolean }) {
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
          onClick={onSign}
          disabled={disabled}
          className="w-full bg-primary text-primary-foreground font-bold rounded-xl h-12 gap-2"
        >
          <CheckCircle2 className="w-5 h-5" /> Sign Off
        </Button>
      )}
    </div>
  );
}
