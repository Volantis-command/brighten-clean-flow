/**
 * Sequential photo reporting wizard — one room at a time.
 *
 * Brendan's spec: "they hit job complete, then the photo reporting and
 * the questions pop up, 1 after the other. For Airbnb only. 1 at a time,
 * it asks for photos, and in a sequence. Once all photos are done, then
 * signatures, then they can clock off."
 *
 * This component renders a full-screen step-by-step wizard:
 *   Step 1..N: one room per step (bedroom 1, bedroom 2, bathroom 1, kitchen, etc.)
 *   Step N+1: Signatures (both cleaners if 2 assigned)
 *   Final: Submit → clock off → SMS → invoice → next job
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, X, ChevronRight, CheckCircle2, Pen } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePadCanvas from '@/components/clean-workflow/SignaturePad';

// ─── Types ───

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

interface Props {
  job: any;
  property: any;
  sections: Section[];
  cleanerProfiles: { id: string; full_name: string }[];
  userId: string;
  onComplete: () => void;
}

// ─── Build sections from property (same logic as CompletionFormPage) ───

export function buildPhotoSections(property: any, cleanType?: string | null): Section[] {
  const bedrooms = property?.bedrooms || 1;
  const bathrooms = property?.bathrooms || 1;
  const hasOutdoor = property?.has_outdoor_area || property?.outdoor_areas || false;
  const type = (cleanType || '').toLowerCase();
  const isStandard = type.includes('standard');
  const req = (deepOnly: boolean) => deepOnly ? !isStandard : true;

  const sections: Section[] = [];

  for (let i = 1; i <= bedrooms; i++) {
    sections.push({
      id: `bedroom_${i}`,
      title: `Bedroom ${i}`,
      fields: [
        { key: 'bed_made', label: 'Bed made — full shot', required: true },
        { key: 'surfaces', label: 'Surfaces dusted', required: true },
      ],
    });
  }

  for (let i = 1; i <= bathrooms; i++) {
    sections.push({
      id: `bathroom_${i}`,
      title: `Bathroom ${i}`,
      fields: [
        { key: 'wide_shot', label: 'Wide shot', required: true },
        { key: 'shower', label: 'Shower — clean', required: true },
        { key: 'toilet', label: 'Toilet — clean', required: true },
        { key: 'vanity', label: 'Vanity/bench — clear', required: true },
        { key: 'mirror', label: 'Mirror — streak-free', required: true },
        { key: 'towels', label: 'Towels — placed', required: req(true) },
      ],
    });
  }

  sections.push({
    id: 'kitchen',
    title: 'Kitchen',
    fields: [
      { key: 'wide_shot', label: 'Kitchen — wide shot', required: true },
      { key: 'stovetop', label: 'Stovetop — clean', required: true },
      { key: 'sink', label: 'Sink — clean', required: true },
      { key: 'benchtops', label: 'Benchtops — clear', required: true },
      { key: 'oven', label: 'Oven interior — clean', required: req(true) },
      { key: 'microwave', label: 'Microwave interior', required: req(true) },
      { key: 'fridge', label: 'Fridge — clean', required: req(true) },
    ],
  });

  sections.push({
    id: 'living_dining',
    title: 'Living & Dining',
    fields: [
      { key: 'wide_shot', label: 'Living area — wide shot', required: true },
      { key: 'couch', label: 'Couch — arranged', required: true },
    ],
  });

  sections.push({
    id: 'laundry',
    title: 'Laundry',
    fields: [
      { key: 'washing_machine', label: 'Washing machine — exterior', required: true },
      { key: 'dryer', label: 'Dryer — exterior', required: true },
    ],
  });

  if (hasOutdoor) {
    sections.push({
      id: 'outdoor',
      title: 'Outdoor / Balcony',
      fields: [
        { key: 'wide_shot', label: 'Outdoor — wide shot', required: true },
      ],
    });
  }

  sections.push({
    id: 'general',
    title: 'Final Check',
    fields: [
      { key: 'bins', label: 'Bins emptied', required: true },
      { key: 'entry', label: 'Entry — clean', required: true },
      { key: 'locked', label: 'Property locked', required: true },
    ],
  });

  return sections;
}

// ─── Component ───

export default function PhotoReportingWizard({ job, property, sections, cleanerProfiles, userId, onComplete }: Props) {
  const totalRoomSteps = sections.length;
  const totalSteps = totalRoomSteps + 1; // rooms + signatures
  const [currentStep, setCurrentStep] = useState(0);
  const [photos, setPhotos] = useState<Record<string, Record<string, string>>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentFieldRef = useRef<{ sectionId: string; fieldKey: string }>({ sectionId: '', fieldKey: '' });

  // Signature state
  const [sig1Name, setSig1Name] = useState(cleanerProfiles[0]?.full_name || '');
  const [sig2Name, setSig2Name] = useState(cleanerProfiles[1]?.full_name || '');
  const [sig1DataUrl, setSig1DataUrl] = useState('');
  const [sig2DataUrl, setSig2DataUrl] = useState('');
  const hasTwoCleaners = cleanerProfiles.length >= 2;

  const isOnSignatureStep = currentStep >= totalRoomSteps;
  const currentSection = !isOnSignatureStep ? sections[currentStep] : null;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  // Photo for a specific field in a section
  const getPhoto = (sectionId: string, fieldKey: string) => photos[sectionId]?.[fieldKey] || '';
  const setPhoto = (sectionId: string, fieldKey: string, url: string) => {
    setPhotos(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [fieldKey]: url },
    }));
  };

  // Check if current room's required photos are all uploaded
  const canProceed = useCallback(() => {
    if (!currentSection) return true; // signature step
    return currentSection.fields
      .filter(f => f.required)
      .every(f => !!getPhoto(currentSection.id, f.key));
  }, [currentSection, photos]);

  const handleTakePhoto = (sectionId: string, fieldKey: string) => {
    currentFieldRef.current = { sectionId, fieldKey };
    fileRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { sectionId, fieldKey } = currentFieldRef.current;
    const uploadKey = `${sectionId}_${fieldKey}`;
    setUploading(uploadKey);

    const storagePath = `jobs/${job.id}/${sectionId}_${fieldKey}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(storagePath, file, { contentType: file.type });
    if (error) {
      toast.error('Upload failed');
      setUploading(null);
      e.target.value = '';
      return;
    }

    const { data } = supabase.storage.from('job-photos').getPublicUrl(storagePath);
    setPhoto(sectionId, fieldKey, data.publicUrl);

    // Also save to job_photos table
    await supabase.from('job_photos').insert({
      job_id: job.id,
      storage_path: storagePath,
      public_url: data.publicUrl,
      room_label: `${currentSection?.title || sectionId} — ${fieldKey}`,
    });

    setUploading(null);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const now = new Date();
      const signatures: any = {};
      if (sig1DataUrl) {
        signatures.cleaner_1 = {
          name: sig1Name,
          signature_data_url: sig1DataUrl,
          signed_at: now.toISOString(),
        };
      }
      if (hasTwoCleaners && sig2DataUrl) {
        signatures.cleaner_2 = {
          name: sig2Name,
          signature_data_url: sig2DataUrl,
          signed_at: now.toISOString(),
        };
      }

      // Update job with completion data
      await supabase.from('jobs').update({
        completion_form_completed_at: now.toISOString(),
        completion_form_data: photos,
        completion_signatures: signatures,
        status: 'completed',
        clock_off: now.toISOString(),
        clock_off_at: now.toISOString(),
        check_out_time: now.toISOString(),
      }).eq('id', job.id);

      // Close time entries
      const { data: openEntries } = await supabase.from('time_entries')
        .select('id')
        .eq('job_id', job.id)
        .is('clock_out_time', null);
      for (const entry of (openEntries || [])) {
        await supabase.from('time_entries').update({
          clock_out_time: now.toISOString(),
        }).eq('id', entry.id);
      }

      // Record clock-off event
      await supabase.from('clock_events').insert({
        user_id: userId,
        job_id: job.id,
        event_type: 'clock_out',
      } as any);

      // SMS notifications (non-blocking)
      try {
        await supabase.functions.invoke('send-job-sms', {
          body: { job_id: job.id },
        });
      } catch { /* non-blocking */ }

      try {
        await supabase.functions.invoke('job-completed-sms', {
          body: { job_id: job.id },
        });
      } catch { /* non-blocking */ }

      // Guest-ready SMS for Airbnb
      if (property?.client_type === 'airbnb') {
        try {
          await supabase.functions.invoke('guest-ready-sms', {
            body: { job_id: job.id },
          });
        } catch { /* non-blocking */ }
      }

      // Xero auto-invoice
      const { triggerJobAutoInvoice } = await import('@/lib/jobInvoice');
      await triggerJobAutoInvoice(job.id);

      toast.success('Job complete! Great work 🎉');
      onComplete();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto">
      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelected} />

      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-4">
        <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider">
          {isOnSignatureStep ? 'Sign Off' : `Room ${currentStep + 1} of ${totalRoomSteps}`}
        </p>
        <h1 className="text-xl font-extrabold mt-1">
          {isOnSignatureStep ? 'Sign & Complete' : currentSection?.title}
        </h1>
        <p className="text-xs text-primary-foreground/70 mt-0.5">{property?.property_name}</p>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-2">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-brightly rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {!isOnSignatureStep && currentSection && (
          <>
            {currentSection.fields.map(field => {
              const photoUrl = getPhoto(currentSection.id, field.key);
              const isUploading = uploading === `${currentSection.id}_${field.key}`;
              return (
                <div key={field.key} className="bg-card rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </p>
                    {photoUrl && <CheckCircle2 className="h-4 w-4 text-brightly shrink-0" />}
                  </div>
                  {photoUrl ? (
                    <div className="relative">
                      <img src={photoUrl} alt={field.label} className="w-full aspect-video object-cover rounded-lg" />
                      <button
                        onClick={() => setPhoto(currentSection.id, field.key, '')}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleTakePhoto(currentSection.id, field.key)}
                      disabled={isUploading}
                      className="w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      {isUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6" />
                          <span className="text-xs font-bold mt-1">Take Photo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {isOnSignatureStep && (
          <div className="space-y-6">
            {/* Cleaner 1 signature */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Pen className="h-4 w-4 text-primary" />
                <p className="font-bold text-foreground">Cleaner 1 Sign-Off</p>
              </div>
              <input
                type="text"
                value={sig1Name}
                onChange={e => setSig1Name(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <SignaturePadCanvas onEnd={(dataUrl) => setSig1DataUrl(dataUrl)} />
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}
                {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Cleaner 2 signature (if assigned) */}
            {hasTwoCleaners && (
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Pen className="h-4 w-4 text-primary" />
                  <p className="font-bold text-foreground">Cleaner 2 Sign-Off</p>
                </div>
                <input
                  type="text"
                  value={sig2Name}
                  onChange={e => setSig2Name(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <SignaturePadCanvas onEnd={(dataUrl) => setSig2DataUrl(dataUrl)} />
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-AU')} · {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer — navigation */}
      <div className="border-t border-border p-4 bg-background safe-area-bottom">
        <div className="flex gap-2 max-w-lg mx-auto">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(s => s - 1)}
              className="flex-1 h-14 rounded-xl font-bold"
            >
              ← Back
            </Button>
          )}

          {!isOnSignatureStep ? (
            <Button
              onClick={() => setCurrentStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex-1 h-14 rounded-xl font-bold bg-brightly hover:bg-brightly-hover text-white text-base gap-2"
            >
              {currentStep === totalRoomSteps - 1 ? 'Sign Off' : 'Next Room'}
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !sig1DataUrl || (hasTwoCleaners && !sig2DataUrl)}
              className="flex-1 h-14 rounded-xl font-bold bg-brightly hover:bg-brightly-hover text-white text-base"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Submit & Clock Off
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
