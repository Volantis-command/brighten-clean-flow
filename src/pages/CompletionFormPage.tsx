import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft, CheckCircle2, Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import SignaturePad from '@/components/clean-workflow/SignaturePad';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { triggerJobAutoInvoice } from '@/lib/jobInvoice';

// ─── Photo field definition ───
interface PhotoField {
  key: string;
  label: string;
  required: boolean;
}

interface Section {
  id: string;
  title: string;
  fields: PhotoField[];
}

// ─── Build dynamic sections ───
//
// The list of photos required to submit the clean now depends on the clean
// type. Previously every field was marked required=true, which blocked
// Standard Clean jobs at submission because cleaners couldn't realistically
// photograph e.g. the inside of the oven on a 2-hour routine clean. Brendan's
// rule: Standard clean = quick turnover, Deep/Bond/Airbnb = full coverage.
//
// Fields that are deep-clean or turnover specific stay VISIBLE on Standard
// jobs (cleaners can still upload if they did the extra work) but are NOT
// required — so the submit button unlocks without them.
function buildSections(property: any, cleanType?: string | null): Section[] {
  const bedrooms = property?.bedrooms || 1;
  const bathrooms = property?.bathrooms || 1;
  const hasOutdoor = property?.has_outdoor_area || property?.outdoor_areas || false;
  const type = (cleanType || '').toLowerCase();

  // Only Standard Clean gets the relaxed required-set. Deep Clean, Bond /
  // End of Lease, Airbnb Turnover, Post-Renovation, Office/Commercial all
  // require the full checklist.
  const isStandard = type.includes('standard');

  // Helper: returns true if field should be required given the clean type.
  // deepOnly=true means "only required for non-standard cleans".
  const req = (deepOnly: boolean) => deepOnly ? !isStandard : true;

  const sections: Section[] = [];

  // Bedrooms — bed made is a baseline shot required for every clean type.
  for (let i = 1; i <= bedrooms; i++) {
    sections.push({
      id: `bedroom_${i}`,
      title: `Bedroom ${i}`,
      fields: [
        { key: 'bed_made', label: 'Bed made — bed and linen, full shot', required: true },
      ],
    });
  }

  // Bathrooms — all standard shots required on every clean type (bathrooms
  // are always hit even on a standard clean).
  for (let i = 1; i <= bathrooms; i++) {
    sections.push({
      id: `bathroom_${i}`,
      title: `Bathroom ${i}`,
      fields: [
        { key: 'wide_shot', label: `Bathroom ${i} — wide shot`, required: true },
        { key: 'shower', label: 'Shower interior — clean', required: true },
        { key: 'toilet', label: 'Inside toilet bowl — clean', required: true },
        { key: 'vanity', label: 'Bathroom bench/vanity — clean and clear', required: true },
        { key: 'mirror', label: 'Mirror — streak-free', required: true },
        { key: 'towels', label: 'Towels — folded and placed', required: req(true) /* optional on Standard */ },
      ],
    });
  }

  // Kitchen — wide/stovetop/sink/bench required on every clean.
  // Interior photos (oven, microwave, fridge, coffee, toaster, dishwasher)
  // are deep-clean territory — optional on Standard.
  sections.push({
    id: 'kitchen',
    title: 'Kitchen',
    fields: [
      { key: 'wide_shot', label: 'Kitchen — wide shot', required: true },
      { key: 'stovetop', label: 'Stovetop/cooktop — clean', required: true },
      { key: 'sink', label: 'Sink — clean and dry', required: true },
      { key: 'benchtops', label: 'Benchtops/counters — wiped and clear', required: true },
      { key: 'oven', label: 'Oven — door open, interior clean', required: req(true) },
      { key: 'microwave', label: 'Microwave — door open, interior clean', required: req(true) },
      { key: 'fridge', label: 'Fridge — exterior and interior clean', required: req(true) },
      { key: 'dishwasher', label: 'Dishwasher — empty and clean', required: req(true) },
      { key: 'coffee_machine', label: 'Coffee machine — clean and descaled', required: req(true) },
      { key: 'toaster', label: 'Toaster — emptied and clean', required: req(true) },
    ],
  });

  // Living & Dining — wide + couch required, table optional for standard.
  sections.push({
    id: 'living_dining',
    title: 'Living & Dining',
    fields: [
      { key: 'wide_shot', label: 'Living area — wide shot', required: true },
      { key: 'couch', label: 'Couch and cushions — arranged', required: true },
      { key: 'dining_table', label: 'Dining table — clean and set', required: req(true) },
    ],
  });

  // Laundry — exterior machines shots on every clean, filters only on deep.
  sections.push({
    id: 'laundry',
    title: 'Laundry',
    fields: [
      { key: 'washing_machine', label: 'Washing machine — clean exterior', required: true },
      { key: 'dryer', label: 'Dryer — clean exterior', required: true },
      { key: 'washing_filter', label: 'Washing machine filter — removed and photographed clean', required: req(true) },
      { key: 'dryer_filter', label: 'Dryer lint filter — removed and photographed clean', required: req(true) },
      { key: 'vacuum_filter', label: 'In-house vacuum filter — removed and photographed clean', required: req(true) },
    ],
  });

  if (hasOutdoor) {
    sections.push({
      id: 'outdoor',
      title: 'Outdoor / Balcony',
      fields: [
        { key: 'wide_shot', label: 'Balcony/outdoor area — wide shot', required: true },
        { key: 'furniture', label: 'Outdoor furniture — wiped and arranged', required: req(true) },
      ],
    });
  }

  sections.push({
    id: 'general',
    title: 'General Completion',
    fields: [
      { key: 'bins', label: 'All bins emptied — photo of empty bins', required: true },
      { key: 'entry', label: 'Entry/front door area — clean', required: true },
      { key: 'locked', label: 'Property locked and secured — photo of door/lock', required: true },
    ],
  });

  return sections;
}

// ─── Types for form data ───
type FormData = Record<string, Record<string, string>>;
type SignatureData = {
  cleaner_1?: { name: string; signature_data_url: string };
  cleaner_2?: { name: string; signature_data_url: string };
};

export default function CompletionFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<FormData>({});
  const [signatures, setSignatures] = useState<SignatureData>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch job + property
  const { data: job, isLoading } = useQuery({
    queryKey: ['completion-form-job', jobId],
    enabled: !!jobId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(*)')
        .eq('id', jobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch cleaner profiles
  const cleanerIds = [job?.cleaner_1_id, job?.cleaner_2_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ['completion-profiles', cleanerIds.join(',')],
    enabled: cleanerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name || 'Unknown' }));
    },
  });

  const property = job?.properties as any;
  // Determine clean type from job (primary) or property.client_type (fallback)
  // so the required-photo set scales with what the client booked.
  const cleanType = (job as any)?.clean_type || property?.client_type || null;
  const sections = property ? buildSections(property, cleanType) : [];

  // Load existing form data on mount
  useEffect(() => {
    if (!job) return;
    if (job.completion_form_data && typeof job.completion_form_data === 'object') {
      setFormData(job.completion_form_data as FormData);
    }
    if (job.completion_signatures && typeof job.completion_signatures === 'object') {
      setSignatures(job.completion_signatures as SignatureData);
    }
    // Set started_at
    if (!job.completion_form_started_at) {
      supabase.from('jobs').update({
        completion_form_started_at: new Date().toISOString(),
      }).eq('id', job.id).then(() => {});
    }
  }, [job?.id]);

  // Save form data to DB
  const saveFormData = useCallback(async (newData: FormData) => {
    if (!job) return;
    await supabase.from('jobs').update({
      completion_form_data: newData as any,
    }).eq('id', job.id);
  }, [job?.id]);

  // Upload photo
  async function handlePhotoUpload(sectionId: string, fieldKey: string, file: File) {
    if (!job) return;
    const uploadKey = `${sectionId}_${fieldKey}`;
    setUploading(prev => ({ ...prev, [uploadKey]: true }));

    const path = `jobs/${job.id}/completion/${sectionId}_${fieldKey}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });

    if (error) {
      toast.error('Photo upload failed');
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      return;
    }

    const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
    const url = urlData.publicUrl;

    const newData = { ...formData };
    if (!newData[sectionId]) newData[sectionId] = {};
    newData[sectionId][fieldKey] = url;
    setFormData(newData);
    await saveFormData(newData);

    // Also insert into job_photos
    const storagePath = url.split('/job-photos/')[1] ?? '';
    await supabase.from('job_photos').insert({
      job_id: job.id,
      storage_path: storagePath,
      public_url: url,
      room_label: `${sectionId} - ${fieldKey}`,
    });

    setUploading(prev => ({ ...prev, [uploadKey]: false }));
  }

  function handleFileChange(sectionId: string, fieldKey: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePhotoUpload(sectionId, fieldKey, file);
      e.target.value = '';
    };
  }

  function removePhoto(sectionId: string, fieldKey: string) {
    const newData = { ...formData };
    if (newData[sectionId]) {
      delete newData[sectionId][fieldKey];
    }
    setFormData(newData);
    saveFormData(newData);
  }

  // Stats
  const totalRequired = sections.reduce((sum, s) => sum + s.fields.filter(f => f.required).length, 0);
  const totalUploaded = sections.reduce((sum, s) => {
    return sum + s.fields.filter(f => f.required && formData[s.id]?.[f.key]).length;
  }, 0);
  const progressPct = totalRequired > 0 ? Math.round((totalUploaded / totalRequired) * 100) : 0;

  function isSectionComplete(section: Section): boolean {
    return section.fields.every(f => !f.required || formData[section.id]?.[f.key]);
  }

  // Signature check
  const requiredSigCount = cleanerIds.length || 1;
  const hasSig1 = !!signatures.cleaner_1?.signature_data_url;
  const hasSig2 = requiredSigCount >= 2 ? !!signatures.cleaner_2?.signature_data_url : true;
  const allSigned = hasSig1 && hasSig2;

  const canSubmit = totalUploaded >= totalRequired && allSigned;

  // Find first incomplete section for default open
  const firstIncomplete = sections.find(s => !isSectionComplete(s));
  const defaultOpen = firstIncomplete?.id || sections[0]?.id || '';

  // Handle signature change
  async function handleSignatureChange(slot: 'cleaner_1' | 'cleaner_2', name: string, dataUrl: string) {
    const newSigs = { ...signatures, [slot]: { name, signature_data_url: dataUrl } };
    setSignatures(newSigs);
    if (job) {
      await supabase.from('jobs').update({ completion_signatures: newSigs as any }).eq('id', job.id);
    }
  }

  function clearSignature(slot: 'cleaner_1' | 'cleaner_2') {
    const newSigs = { ...signatures };
    delete newSigs[slot];
    setSignatures(newSigs);
    if (job) {
      supabase.from('jobs').update({ completion_signatures: newSigs as any }).eq('id', job.id);
    }
  }

  async function handleSubmit() {
    if (!job || !user) return;
    setSubmitting(true);
    setShowConfirm(false);

    const now = new Date();
    const clockOff = now.toISOString();
    const clockOnMs = job.clock_on ? new Date(job.clock_on).getTime() : now.getTime();
    const totalPaused = (job.total_pause_seconds || 0) * 1000;
    const netMinutes = Math.round((now.getTime() - clockOnMs - totalPaused) / 60000);

    // 1. Update job record — explicitly set status to 'completed'
    const { error: updateError } = await supabase.from('jobs').update({
      completion_form_completed_at: clockOff,
      completion_form_data: formData as any,
      completion_signatures: signatures as any,
      clock_off: clockOff,
      clock_off_at: clockOff,
      check_out_time: clockOff,
      status: 'completed',
      duration_minutes: netMinutes,
    }).eq('id', job.id);

    if (updateError) {
      toast.error('Failed to complete job: ' + updateError.message);
      setSubmitting(false);
      return;
    }

    // 2. Update time_entries — close open entry or insert new
    const { data: existingEntry } = await supabase
      .from('time_entries')
      .select('id')
      .eq('job_id', job.id)
      .eq('user_id', user.id)
      .is('clock_out_time', null)
      .maybeSingle();

    if (existingEntry) {
      await supabase.from('time_entries').update({
        clock_out_time: clockOff,
        total_minutes: netMinutes,
      }).eq('id', existingEntry.id);
    }

    // Also close entries for second cleaner if present
    if (job.cleaner_2_id && job.cleaner_2_id !== user.id) {
      await supabase.from('time_entries').update({
        clock_out_time: clockOff,
        total_minutes: netMinutes,
      }).eq('job_id', job.id).eq('user_id', job.cleaner_2_id).is('clock_out_time', null);
    }

    // 2b. Record clock_out event
    await supabase.from('clock_events').insert({
      user_id: user.id,
      job_id: job.id,
      event_type: 'clock_out',
    } as any).then(() => {}, () => {});

    // 3. Save completion photos to job_photos
    if (formData) {
      for (const [sectionId, fields] of Object.entries(formData)) {
        for (const [fieldKey, url] of Object.entries(fields)) {
          if (url) {
            const storagePath = url.split('/job-photos/')[1] ?? '';
            if (storagePath) {
              await supabase.from('job_photos').upsert({
                job_id: job.id,
                storage_path: storagePath,
                public_url: url,
                room_label: `${sectionId} - ${fieldKey}`,
              }, { onConflict: 'job_id,storage_path' }).select();
            }
          }
        }
      }
    }

    // 4. Admin notification via createAlert
    await (await import('@/lib/alerts')).createAlert({
      event_type: 'cleaner_checked_in',
      title: 'Job Completed',
      body: `Clean at ${property?.property_name ?? 'property'} has been completed (${netMinutes}min)`,
      link: `/jobs/${job.id}`,
    });

    // 5. SMS to admin
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const cleanerName = profile?.full_name || 'A cleaner';
      const addr = property?.address || property?.property_name || 'Unknown';
      const timeStr = format(now, 'h:mm a');
      await supabase.functions.invoke('send-job-sms', {
        body: { to: 'ADMIN', message: `Job complete — ${cleanerName} clocked off at ${addr} at ${timeStr}. Duration: ${netMinutes} min.` },
      });
    } catch { /* non-blocking */ }

    // 6. SMS to client (uses job-completed-sms which resolves client phone from DB)
    try {
      await supabase.functions.invoke('job-completed-sms', {
        body: { job_id: job.id },
      });
    } catch { /* non-blocking */ }

    // 7. Auto-raise Xero invoice with full line-item breakdown
    try {
      await triggerJobAutoInvoice(job.id);
    } catch { /* non-blocking — Xero may not be configured */ }

    queryClient.invalidateQueries({ queryKey: ['clean-workflow-job', jobId] });
    queryClient.invalidateQueries({ queryKey: ['my-cleans'] });
    queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['today-jobs-widget'] });
    queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
    queryClient.invalidateQueries({ queryKey: ['active-time-entries'] });

    setSubmitting(false);

    // 8. Check for next job today
    const { data: nextJobs } = await supabase
      .from('jobs')
      .select('id, scheduled_time, properties(property_name, address)')
      .eq('scheduled_date', job.scheduled_date)
      .in('status', ['confirmed', 'scheduled'])
      .or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`)
      .gt('scheduled_time', job.scheduled_time || '00:00')
      .order('scheduled_time', { ascending: true })
      .limit(1);

    if (nextJobs && nextJobs.length > 0) {
      const next = nextJobs[0];
      navigate(`/clean/${job.id}/done`, {
        state: {
          nextJob: {
            id: next.id,
            time: next.scheduled_time?.slice(0, 5),
            name: (next.properties as any)?.property_name,
            address: (next.properties as any)?.address,
          },
        },
      });
    } else {
      navigate(`/clean/${job.id}/done`);
    }
  }

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto pb-28">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/clean/${job.id}`)} className="text-muted-foreground hover:text-foreground p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold text-foreground text-base flex-1">Complete Your Clean</h1>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>Photos: {totalUploaded} of {totalRequired} uploaded</span>
            <span>{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-4 py-4">
        <Accordion type="single" collapsible defaultValue={defaultOpen}>
          {sections.map(section => {
            const complete = isSectionComplete(section);
            return (
              <AccordionItem key={section.id} value={section.id} className="border rounded-2xl mb-3 overflow-hidden border-border">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2 w-full">
                    {complete && <CheckCircle2 className="h-5 w-5 text-brightly shrink-0" />}
                    <span className="font-bold text-foreground text-sm">{section.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto mr-2">
                      {section.fields.filter(f => f.required && formData[section.id]?.[f.key]).length}/{section.fields.filter(f => f.required).length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {section.fields.map(field => {
                      const uploadKey = `${section.id}_${field.key}`;
                      const photoUrl = formData[section.id]?.[field.key];
                      const isUploading = uploading[uploadKey];

                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            {photoUrl && <CheckCircle2 className="h-3.5 w-3.5 text-brightly" />}
                            {field.label}
                            {field.required && <span className="text-destructive">*</span>}
                          </label>
                          <input
                            ref={el => { fileRefs.current[uploadKey] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFileChange(section.id, field.key)}
                          />
                          {photoUrl ? (
                            <div className="relative w-full">
                              <img
                                src={photoUrl}
                                alt={field.label}
                                className="w-full h-32 object-cover rounded-xl border border-border"
                                onClick={() => fileRefs.current[uploadKey]?.click()}
                              />
                              <div className="absolute top-1 right-1 flex gap-1">
                                <button
                                  onClick={() => removePhoto(section.id, field.key)}
                                  className="bg-destructive text-destructive-foreground rounded-full p-1"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-1 left-1 bg-brightly text-white rounded-full p-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => fileRefs.current[uploadKey]?.click()}
                              disabled={isUploading}
                              className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary/50 transition-colors"
                            >
                              {isUploading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                              ) : (
                                <Camera className="h-6 w-6" />
                              )}
                              <span className="text-[10px] font-bold mt-1">
                                {isUploading ? 'Uploading...' : 'Take Photo'}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Team Sign-Off */}
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Team Sign-Off</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Both cleaners must sign to confirm they have cross-checked the entire property and are satisfied with the standard of clean.
            </p>
          </div>

          {/* Cleaner 1 */}
          <SignatureBlock
            slot="cleaner_1"
            label="Cleaner 1"
            defaultName={profiles.find(p => p.id === job.cleaner_1_id)?.full_name || ''}
            signatureData={signatures.cleaner_1}
            onChange={(name, dataUrl) => handleSignatureChange('cleaner_1', name, dataUrl)}
            onClear={() => clearSignature('cleaner_1')}
          />

          {/* Cleaner 2 — only if 2 cleaners assigned */}
          {cleanerIds.length >= 2 && (
            <SignatureBlock
              slot="cleaner_2"
              label="Cleaner 2"
              defaultName={profiles.find(p => p.id === job.cleaner_2_id)?.full_name || ''}
              signatureData={signatures.cleaner_2}
              onChange={(name, dataUrl) => handleSignatureChange('cleaner_2', name, dataUrl)}
              onClear={() => clearSignature('cleaner_2')}
            />
          )}
        </div>
      </main>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className={`w-full h-16 text-lg font-extrabold rounded-2xl max-w-lg mx-auto block ${
            canSubmit
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
          onClick={() => canSubmit && setShowConfirm(true)}
          disabled={!canSubmit || submitting}
        >
          {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
          Clock Off & Submit
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ready to clock off?</AlertDialogTitle>
            <AlertDialogDescription>
              Make sure you have completed all areas and both cleaners have signed off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Yes, Clock Off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Signature Block sub-component ───
interface SignatureBlockProps {
  slot: string;
  label: string;
  defaultName: string;
  signatureData?: { name: string; signature_data_url: string };
  onChange: (name: string, dataUrl: string) => void;
  onClear: () => void;
}

function SignatureBlock({ slot, label, defaultName, signatureData, onChange, onClear }: SignatureBlockProps) {
  const [name, setName] = useState(signatureData?.name || defaultName);
  const hasSig = !!signatureData?.signature_data_url;

  useEffect(() => {
    if (!signatureData?.name && defaultName) setName(defaultName);
  }, [defaultName]);

  return (
    <div className="border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {hasSig && <CheckCircle2 className="h-5 w-5 text-brightly" />}
        <h3 className="font-bold text-foreground text-sm">{label}</h3>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Full name"
        className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background text-foreground"
      />
      <SignaturePad
        onEnd={(dataUrl) => onChange(name, dataUrl)}
        existingSignature={signatureData?.signature_data_url}
      />
      {hasSig && (
        <button onClick={onClear} className="text-xs text-destructive font-medium hover:underline">
          Clear Signature
        </button>
      )}
    </div>
  );
}
